// backend/tests/socket_agentes.test.js
const http = require('http');
const { io: ioClient } = require('socket.io-client');
const { init, estadoAgentes, desconectadoEn } = require('../src/socket');

describe('socket.js — estado de agentes de impresión', () => {
  let server, port, clientes = [];

  beforeAll((done) => {
    server = http.createServer();
    init(server);
    server.listen(0, () => { port = server.address().port; done(); });
  });

  afterEach(() => {
    clientes.forEach((c) => c.disconnect());
    clientes = [];
  });

  afterAll((done) => {
    server.close(done);
  });

  function conectarCliente() {
    return new Promise((resolve) => {
      const c = ioClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false });
      clientes.push(c);
      c.on('connect', () => resolve(c));
    });
  }

  it('agente:conectado registra el agente en estadoAgentes()', async () => {
    const cliente = await conectarCliente();
    cliente.emit('agente:conectado', { sucursal_id: 4242, caja_id: 77 });
    await new Promise((r) => setTimeout(r, 150));

    expect(estadoAgentes()).toContainEqual(expect.objectContaining({ sucursal_id: 4242, caja_id: 77 }));
  });

  it('al desconectarse el agente desaparece y se emite agente:estado con conectado:false', async () => {
    const agente = await conectarCliente();
    agente.emit('agente:conectado', { sucursal_id: 5151, caja_id: null });
    await new Promise((r) => setTimeout(r, 150));
    expect(estadoAgentes()).toContainEqual(expect.objectContaining({ sucursal_id: 5151, caja_id: null }));

    const observador = await conectarCliente();
    observador.emit('unirse_sucursal', 5151);
    await new Promise((r) => setTimeout(r, 150));

    const eventoPromise = new Promise((resolve) => observador.on('agente:estado', resolve));
    agente.disconnect();
    const evento = await eventoPromise;

    expect(evento).toEqual({ caja_id: null, conectado: false });
    expect(estadoAgentes().find((a) => a.sucursal_id === 5151)).toBeUndefined();
  });

  it('guarda la versión que anuncia el agente y descarta valores raros', async () => {
    const agente = await conectarCliente();
    agente.emit('agente:conectado', { sucursal_id: 6161, caja_ids: [88], version: '1.1.2', version_pendiente: '<b>x</b>', autoactualizacion: true });
    await new Promise((r) => setTimeout(r, 150));

    expect(estadoAgentes()).toContainEqual(expect.objectContaining({ caja_id: 88, version: '1.1.2', version_pendiente: null, autoactualizacion: true }));
  });

  it('un agente viejo (sin versión) queda con version null', async () => {
    const agente = await conectarCliente();
    agente.emit('agente:conectado', { sucursal_id: 6262, caja_id: 89 });
    await new Promise((r) => setTimeout(r, 150));

    expect(estadoAgentes()).toContainEqual(expect.objectContaining({ caja_id: 89, version: null, autoactualizacion: null }));
  });

  it('recuerda cuándo se desconectó el agente de cada caja', async () => {
    const agente = await conectarCliente();
    agente.emit('agente:conectado', { sucursal_id: 6363, caja_ids: [90] });
    await new Promise((r) => setTimeout(r, 150));
    expect(desconectadoEn(90)).toBeNull();

    const antes = Date.now();
    agente.disconnect();
    await new Promise((r) => setTimeout(r, 150));
    expect(desconectadoEn(90)).toBeGreaterThanOrEqual(antes);
  });
});
