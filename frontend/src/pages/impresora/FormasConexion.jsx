// Probar las distintas formas de conectar una impresora Bluetooth que no
// imprime "normal": todos los canales BLE con distintos modos de envío, el
// Bluetooth clásico por puerto COM (computadora) y la app RawBT (Android).
// Lo que funciona queda guardado en este dispositivo y lo usan los tickets.
import { useEffect, useRef, useState } from 'react';
import { Bluetooth, Cable, Check, Copy, Loader2, Plus, Printer, Search, Smartphone, X } from 'lucide-react';
import { useConfigPublica } from '../../hooks/useConfig';
import { Segmentado } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import {
  ENVIO_DEFECTO, EVENTO_ESTADO, estadoConexion, explorarImpresora, guardarVia, impresoraGuardada, normalizarUuid, perfilGuardado, probarCanal,
  serviciosExtra, soportaBluetooth, usarCanal, uuidCorto, viaGuardada,
} from '../../utils/bluetoothDirecto';
import { elegirPuerto, imprimirSerial, puertoGuardado, soportaSerial, usarPuerto } from '../../utils/serialImpresora';
import { bytesPrueba, dispararRawBT, imprimirPrueba } from '../../utils/rawbt';
import { configImpresora, escPosATspl, guardarConfigImpresora, pruebaTsplSimple } from '../../utils/tspl';
import { cx } from '../../lib/util';
import EstadoBt from '../../components/shell/EstadoBt';

const MODOS = [{ valor: 'auto', etiqueta: 'Automático' }, { valor: 'sin', etiqueta: 'Sin confirmación' }, { valor: 'con', etiqueta: 'Con confirmación' }];
const BLOQUES = [20, 100, 180, 244, 512];
const VELOCIDADES = [{ valor: 1000, etiqueta: 'Lenta' }, { valor: 2500, etiqueta: 'Normal' }, { valor: 8000, etiqueta: 'Rápida' }];
const BAUDIOS = [9600, 19200, 38400, 57600, 115200];
// Nombres Bluetooth de impresoras de etiquetas conocidas (Knaon Y813BT, Y41BT…).
const ES_DE_ETIQUETAS = /^(knaon|y[0-9]{2,3}bt)/i;
const modoTexto = (m) => MODOS.find((x) => x.valor === m)?.etiqueta.toLowerCase() ?? m;

function useRegistro() {
  const [lineas, setLineas] = useState([]);
  const log = (t) => setLineas((l) => [...l.slice(-199), `${new Date().toLocaleTimeString('es-BO')}  ${t}`]);
  return { lineas, log, limpiar: () => setLineas([]) };
}

function Registro({ lineas, limpiar }) {
  const caja = useRef(null);
  useEffect(() => { caja.current?.scrollTo({ top: caja.current.scrollHeight }); }, [lineas.length]);
  if (!lineas.length) return null;
  const copiar = () => navigator.clipboard?.writeText(lineas.join('\n')).then(() => avisar.ok('Registro copiado'), () => {});
  return (
    <div className="rounded-xl bg-pizarra text-sobre-pizarra">
      <div className="flex items-center gap-2 px-3 pt-2">
        <p className="text-[12px] font-semibold opacity-70 flex-1">Lo que pasó</p>
        <button className="text-[12px] opacity-70 hover:opacity-100 inline-flex items-center gap-1" onClick={copiar}><Copy className="w-3.5 h-3.5" /> Copiar</button>
        <button className="text-[12px] opacity-70 hover:opacity-100" onClick={limpiar}>Borrar</button>
      </div>
      <pre ref={caja} className="px-3 pb-3 pt-1 text-[12px] leading-relaxed max-h-56 overflow-auto whitespace-pre-wrap font-mono">{lineas.join('\n')}</pre>
    </div>
  );
}

function Fila({ etiqueta, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-[13px] text-tenue">{etiqueta}</span>
      {children}
    </div>
  );
}

function Pasos({ children }) {
  return <ol className="text-[13px] text-tenue space-y-1 list-decimal pl-5">{children}</ol>;
}

// Lo que usa hoy este dispositivo para imprimir.
function Actual() {
  const [, refrescar] = useState(0);
  useEffect(() => {
    const al = () => refrescar((n) => n + 1);
    window.addEventListener('impresora-bt', al);
    return () => window.removeEventListener('impresora-bt', al);
  }, []);
  const via = viaGuardada();
  const imp = impresoraGuardada();
  const perfil = perfilGuardado();
  const com = puertoGuardado();
  let texto;
  if (via === 'serial') texto = com ? `Puerto COM · ${com.nombre} · ${com.baudios} baudios` : 'Puerto COM (sin elegir)';
  else if (!imp) texto = 'Bluetooth directo · sin impresora conectada';
  else if (perfil?.deviceId === imp.id) texto = `Bluetooth directo · ${imp.nombre} · canal ${uuidCorto(perfil.caracteristica)}, ${modoTexto(perfil.modo)}, bloques de ${perfil.bloque}`;
  else texto = `Bluetooth directo · ${imp.nombre} · canal automático`;
  return (
    <p className="rounded-xl bg-hundido px-3 py-2.5 text-[13px]">
      <span className="text-tenue">Este dispositivo imprime por:</span> <span className="font-semibold">{texto}</span>
      <span className="text-tenue"> · </span><span className="font-semibold">{configImpresora().lenguaje === 'tspl' ? 'impresora de etiquetas (TSPL)' : 'impresora de tickets (ESC/POS)'}</span>
    </p>
  );
}

function PruebaBle({ armarPrueba, fijarIdioma, registro, idioma, alDetectarEtiquetas }) {
  const { log } = registro;
  const [extras, setExtras] = useState(serviciosExtra);
  const [uuidTxt, setUuidTxt] = useState('');
  const [encontrada, setEncontrada] = useState(null); // { device, nombre, servicios }
  const [envio, setEnvio] = useState(() => ({ ...ENVIO_DEFECTO, ...(perfilGuardado() ?? {}) }));
  const [canal, setCanal] = useState(null); // { servicio, caracteristica, n }
  const [ocupado, setOcupado] = useState(null);
  const [probado, setProbado] = useState(null); // canal de la última prueba enviada

  const canales = (encontrada?.servicios ?? []).flatMap((s) => s.caracteristicas.filter((c) => c.escribe || c.sinRespuesta).map((c) => ({ ...c, servicio: s.uuid, nombreServicio: s.nombre })))
    .map((c, i) => ({ ...c, n: i + 1 }));

  const agregarUuid = () => {
    const u = normalizarUuid(uuidTxt);
    if (!u) return avisar.error('Escribe 4 letras/números (ej.: ff00) o el UUID completo.');
    setExtras((x) => [...new Set([...x, u])]);
    setUuidTxt('');
  };

  const buscar = async () => {
    setOcupado('buscar');
    setEncontrada(null); setCanal(null); setProbado(null);
    try {
      const r = await explorarImpresora({ extras, log });
      setEncontrada(r);
      r.servicios.forEach((s) => log(`  ${s.nombre}: ${s.caracteristicas.map((c) => `${uuidCorto(c.uuid)}[${[c.escribe && 'escribe', c.sinRespuesta && 'sin conf.', c.notifica && 'notifica', c.lee && 'lee'].filter(Boolean).join(', ')}]`).join(' ') || 'sin canales'}`));
      const primero = r.servicios.flatMap((s) => s.caracteristicas.filter((c) => c.escribe || c.sinRespuesta).map((c) => ({ ...c, servicio: s.uuid })));
      const elegido = primero.find((c) => c.conocida) ?? primero[0];
      if (elegido) setCanal({ servicio: elegido.servicio, caracteristica: elegido.uuid });
      if (/_le$/i.test(r.nombre)) log('Es la versión BLE ("_LE") de la impresora: bien, es la que sirve para Bluetooth directo.');
      // Las Knaon (Y813BT, Y41BT…) son de etiquetas: hablan TSPL, no ESC/POS.
      if (ES_DE_ETIQUETAS.test(r.nombre)) alDetectarEtiquetas();
    } catch (e) {
      if (e.codigo !== 'CANCELADO') { log(`Error: ${e.message}`); avisar.error(e.message); }
    } finally { setOcupado(null); }
  };

  const probar = async (c) => {
    const e = { ...envio, servicio: c.servicio, caracteristica: c.uuid };
    setOcupado(`canal-${c.n}`);
    setCanal({ servicio: c.servicio, caracteristica: c.uuid });
    try {
      const bytes = await armarPrueba(`CANAL ${c.n}`, [`${uuidCorto(c.uuid)} · ${modoTexto(envio.modo)}`, `Bloques de ${envio.bloque} · ${envio.bps} B/s`]);
      log(`Canal ${c.n}: prueba en ${idioma === 'tspl' ? 'TSPL (etiqueta)' : 'ESC/POS (ticket)'}, ${bytes.length} bytes.`);
      await probarCanal(encontrada.device, e, bytes, log);
      setProbado(c);
    } catch (err) {
      log(`Canal ${c.n}: ${err.message}`);
      avisar.error(`Canal ${c.n}: ${err.message}`);
    } finally { setOcupado(null); }
  };

  const probarTodos = async () => {
    for (const c of canales) {
      await probar(c);
      await new Promise((r) => setTimeout(r, 1500));
    }
    log('Listo. Mira qué número de CANAL salió impreso y toca "Usar" en ese.');
  };

  const usar = (c) => {
    const d = usarCanal(encontrada.device, { ...envio, servicio: c.servicio, caracteristica: c.uuid });
    fijarIdioma();
    log(`Guardado: ${d.nombre}, canal ${c.n} (${uuidCorto(c.uuid)}), ${modoTexto(envio.modo)}, bloques de ${envio.bloque}.`);
    avisar.ok(`Listo: los tickets salen por el canal ${c.n} de ${d.nombre}.`);
  };

  if (!soportaBluetooth()) {
    return <p className="text-sm text-tenue">Este navegador no tiene Bluetooth directo. Usa Chrome o Edge (Android o computadora). En iPhone no funciona.</p>;
  }

  return (
    <div className="space-y-4">
      <Pasos>
        <li>Arriba, en <b>Tipo de impresora</b>, elige “De etiquetas (TSPL)” si es una Knaon u otra de etiquetas de envío.</li>
        <li>Enciende la impresora y acércala.</li>
        <li>Toca <b>Buscar impresora</b>. Si aparece dos veces, elige la que termina en <b>_LE</b> (por ejemplo Y813BT-C154_LE).</li>
        <li>Toca <b>Probar</b> en un canal, o <b>Probar todos</b>: cada ticket sale con su número de canal.</li>
        <li>En el que salió bien, toca <b>Usar</b>.</li>
      </Pasos>

      <details className="rounded-xl border border-linea px-3 py-2">
        <summary className="text-[13px] font-semibold cursor-pointer">¿No aparece o no conecta?</summary>
        <ul className="text-[13px] text-tenue space-y-1 list-disc pl-5 mt-2">
          <li>Si la emparejaste en Windows o Android (Configuración › Bluetooth), quítala de ahí y vuelve a buscar: el emparejado del sistema a veces bloquea la conexión BLE.</li>
          <li>Apaga y prende la impresora. Algunas solo aceptan una conexión a la vez: cierra otras apps o pestañas que la usen.</li>
          <li>Si sabes el servicio de tu impresora (viene en el manual o en apps como nRF Connect), agrégalo abajo y vuelve a buscar.</li>
        </ul>
        <div className="flex gap-2 mt-3">
          <input className="campo h-10 flex-1 font-mono text-sm" placeholder="Servicio: ff00 o UUID completo" value={uuidTxt} onChange={(e) => setUuidTxt(e.target.value)} />
          <button className="btn-borde h-10" onClick={agregarUuid} disabled={!uuidTxt.trim()}><Plus className="w-4 h-4" /> Agregar</button>
        </div>
        {extras.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {extras.map((u) => (
              <span key={u} className="inline-flex items-center gap-1 rounded-full bg-hundido pl-2.5 pr-1 py-0.5 text-[12px] font-mono">
                {uuidCorto(u)}
                <button onClick={() => setExtras((x) => x.filter((y) => y !== u))} aria-label={`Quitar ${u}`} className="p-0.5"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
      </details>

      <div className="space-y-2">
        <Fila etiqueta="Forma de enviar">
          <Segmentado tamano="sm" valor={envio.modo} onCambio={(v) => setEnvio({ ...envio, modo: v })} opciones={MODOS} />
        </Fila>
        <Fila etiqueta="Tamaño de cada bloque">
          <Segmentado tamano="sm" valor={envio.bloque} onCambio={(v) => setEnvio({ ...envio, bloque: v })} opciones={BLOQUES.map((b) => ({ valor: b, etiqueta: String(b) }))} />
        </Fila>
        <Fila etiqueta="Velocidad">
          <Segmentado tamano="sm" valor={envio.bps} onCambio={(v) => setEnvio({ ...envio, bps: v })} opciones={VELOCIDADES} />
        </Fila>
        <p className="text-[12px] text-tenue">Si sale cortado o le faltan partes: bloques de 20 y velocidad lenta. Si no sale nada: prueba “Con confirmación”.</p>
      </div>

      <button className="btn-aji w-full sm:w-auto" disabled={!!ocupado} onClick={buscar}>
        {ocupado === 'buscar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar impresora
      </button>

      {encontrada && (
        <div className="rounded-xl border border-linea">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-linea">
            <Bluetooth className="w-5 h-5 text-cielo shrink-0" />
            <p className="font-semibold flex-1 min-w-0 truncate">{encontrada.nombre}</p>
            <EstadoBt />
            {canales.length > 1 && <button className="btn-borde h-9" disabled={!!ocupado} onClick={probarTodos}><Printer className="w-4 h-4" /> Probar todos</button>}
          </div>
          {canales.length === 0 ? (
            <p className="p-4 text-sm text-tenue">No tiene canales para escribir por Bluetooth directo. Prueba el puerto COM o la app RawBT, o agrega el servicio a mano.</p>
          ) : (
            <ul className="divide-y divide-linea">
              {canales.map((c) => {
                const elegido = canal?.caracteristica === c.uuid && canal?.servicio === c.servicio;
                return (
                  <li key={`${c.servicio}|${c.uuid}`} className={cx('px-4 py-3 flex flex-wrap items-center gap-3', elegido && 'bg-aji/5')}>
                    <span className="w-8 h-8 rounded-lg bg-hundido grid place-items-center font-display font-bold shrink-0">{c.n}</span>
                    <div className="flex-1 min-w-[10rem]">
                      <p className="font-mono text-sm">{uuidCorto(c.uuid)} <span className="text-tenue font-sans text-[12px]">en {c.nombreServicio}</span></p>
                      <p className="text-[12px] text-tenue">
                        {[c.escribe && 'con confirmación', c.sinRespuesta && 'sin confirmación', c.notifica && 'avisa'].filter(Boolean).join(' · ')}
                        {c.conocida && <span className="ml-1.5 text-hierba font-semibold">· canal de impresora conocido</span>}
                      </p>
                    </div>
                    <button className="btn-borde h-9" disabled={!!ocupado} onClick={() => probar(c)}>
                      {ocupado === `canal-${c.n}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Probar
                    </button>
                    <button className={cx('h-9', probado?.n === c.n ? 'btn-aji' : 'btn-fantasma')} disabled={!!ocupado} onClick={() => usar(c)}>
                      <Check className="w-4 h-4" /> Usar
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PruebaCom({ armarPrueba, fijarIdioma, registro }) {
  const { log } = registro;
  const [baudios, setBaudios] = useState(() => puertoGuardado()?.baudios ?? 9600);
  const [bloque, setBloque] = useState(512);
  const [ocupado, setOcupado] = useState(false);
  const [probado, setProbado] = useState(null); // puerto con el que se mandó la prueba

  if (!soportaSerial()) {
    return <p className="text-sm text-tenue">Esta forma solo funciona en Chrome o Edge de computadora (Windows, Mac o Linux).</p>;
  }

  const probar = async () => {
    setOcupado(true);
    try {
      const { puerto, nombre } = await elegirPuerto();
      log(`Puerto elegido: ${nombre}`);
      const bytes = await armarPrueba('PUERTO COM', [`${baudios} baudios · bloques de ${bloque}`]);
      await imprimirSerial(bytes, { p: puerto, baudios, bloque, log });
      setProbado(puerto);
      log('¿Salió el ticket? Si salió, toca "Usar el puerto COM".');
    } catch (e) {
      if (e.codigo !== 'CANCELADO') { log(`Error: ${e.message}`); avisar.error(e.message); }
    } finally { setOcupado(false); }
  };

  const usar = () => {
    const d = usarPuerto(probado, baudios);
    guardarVia('serial');
    fijarIdioma();
    log(`Guardado: esta computadora imprime por ${d.nombre}.`);
    avisar.ok('Listo: esta computadora imprime por el puerto COM.');
  };

  return (
    <div className="space-y-4">
      <Pasos>
        <li>En Windows: Configuración › Bluetooth y dispositivos › Agregar dispositivo. Elige la impresora que <b>no</b> termina en _LE (por ejemplo Y813BT-C154). Si pide PIN, suele ser <b>0000</b> o <b>1234</b>.</li>
        <li>Windows le crea un puerto COM. Lo ves en Bluetooth › Más opciones de Bluetooth › Puertos COM (el “Saliente”).</li>
        <li>Toca <b>Elegir puerto e imprimir</b> y elige ese COM (o el que dice Bluetooth).</li>
      </Pasos>
      <div className="space-y-2">
        <Fila etiqueta="Velocidad del puerto">
          <Segmentado tamano="sm" valor={baudios} onCambio={setBaudios} opciones={BAUDIOS.map((b) => ({ valor: b, etiqueta: String(b) }))} />
        </Fila>
        <Fila etiqueta="Tamaño de cada bloque">
          <Segmentado tamano="sm" valor={bloque} onCambio={setBloque} opciones={[64, 256, 512, 1024].map((b) => ({ valor: b, etiqueta: String(b) }))} />
        </Fila>
        <p className="text-[12px] text-tenue">Por Bluetooth la velocidad del puerto casi nunca importa; si sale basura, prueba 9600 o 115200.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-aji" disabled={ocupado} onClick={probar}>
          {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cable className="w-4 h-4" />} Elegir puerto e imprimir
        </button>
        {probado && <button className="btn-borde" onClick={usar}><Check className="w-4 h-4" /> Usar el puerto COM</button>}
      </div>
      {viaGuardada() === 'serial' && (
        <button className="btn-fantasma text-[13px]" onClick={() => { guardarVia('ble'); avisar.ok('Esta computadora vuelve a imprimir por Bluetooth directo.'); }}>
          Volver a Bluetooth directo
        </button>
      )}
    </div>
  );
}

function PruebaRawbt({ armarPrueba, registro }) {
  const probar = async () => {
    const bytes = await armarPrueba('RAWBT', []);
    dispararRawBT(bytes, { crudo: true });
    registro.log(`Enviados ${bytes.length} bytes a la app RawBT. Si no se abrió RawBT, no está instalada.`);
  };
  return (
    <div className="space-y-4">
      <Pasos>
        <li>Solo en Android. Instala <b>RawBT</b> desde Play Store.</li>
        <li>En Android: Ajustes › Bluetooth, empareja la impresora que <b>no</b> termina en _LE.</li>
        <li>Abre RawBT, elige esa impresora (conexión Bluetooth) y vuelve acá.</li>
        <li>Toca <b>Imprimir prueba por RawBT</b>.</li>
      </Pasos>
      <button className="btn-aji" onClick={probar}><Smartphone className="w-4 h-4" /> Imprimir prueba por RawBT</button>
      <p className="text-[12px] text-tenue">Si sale bien, en Ajustes › Cajas pon la conexión Bluetooth de esa caja en “App RawBT”.</p>
    </div>
  );
}

// Papel y forma de dibujar para impresoras de etiquetas (TSPL).
function AjustesTspl({ cfg, cambiar }) {
  const num = (k) => (e) => cambiar({ [k]: e.target.value === '' ? '' : Number(e.target.value) });
  return (
    <div className="rounded-xl border border-linea p-4 space-y-3">
      <p className="text-sm font-semibold">Papel de la impresora de etiquetas</p>
      <Fila etiqueta="Ancho del papel">
        <Segmentado tamano="sm" valor={cfg.ancho_mm} onCambio={(v) => cambiar({ ancho_mm: v })} opciones={[58, 80, 100].map((v) => ({ valor: v, etiqueta: `${v} mm` }))} />
      </Fila>
      <Fila etiqueta="Tipo de papel">
        <Segmentado tamano="sm" valor={cfg.papel} onCambio={(v) => cambiar({ papel: v })} opciones={[{ valor: 'continuo', etiqueta: 'Rollo continuo' }, { valor: 'etiqueta', etiqueta: 'Etiquetas' }]} />
      </Fila>
      {cfg.papel === 'etiqueta' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[13px] text-tenue">Alto de cada etiqueta (mm)<input type="number" min="20" className="campo h-10 mt-1" value={cfg.alto_mm} onChange={num('alto_mm')} /></label>
          <label className="text-[13px] text-tenue">Separación entre etiquetas (mm)<input type="number" min="0" step="0.5" className="campo h-10 mt-1" value={cfg.gap_mm} onChange={num('gap_mm')} /></label>
        </div>
      )}
      <Fila etiqueta="Velocidad de impresión">
        <Segmentado tamano="sm" valor={cfg.velocidad} onCambio={(v) => cambiar({ velocidad: v })} opciones={[2, 3, 4, 5].map((v) => ({ valor: v, etiqueta: String(v) }))} />
      </Fila>
      <Fila etiqueta="Oscuridad">
        <Segmentado tamano="sm" valor={cfg.densidad} onCambio={(v) => cambiar({ densidad: v })} opciones={[6, 8, 10, 12, 15].map((v) => ({ valor: v, etiqueta: String(v) }))} />
      </Fila>
      <Fila etiqueta="Sale de cabeza">
        <Segmentado tamano="sm" valor={cfg.girar} onCambio={(v) => cambiar({ girar: v })} opciones={[{ valor: false, etiqueta: 'No' }, { valor: true, etiqueta: 'Girar' }]} />
      </Fila>
      <Fila etiqueta="Sale negra con letras blancas">
        <Segmentado tamano="sm" valor={cfg.invertir} onCambio={(v) => cambiar({ invertir: v })} opciones={[{ valor: false, etiqueta: 'No' }, { valor: true, etiqueta: 'Invertir' }]} />
      </Fila>
      <label className="flex items-center justify-between gap-3 text-[13px] text-tenue">
        Correr a la derecha (mm, negativo a la izquierda)
        <input type="number" step="1" className="campo h-10 w-24" value={cfg.x_mm} onChange={num('x_mm')} />
      </label>
      <p className="text-[12px] text-tenue">El ticket se manda dibujado, igual que el driver oficial de Knaon: la ñ y las tildes salen bien. Por Bluetooth tarda unos segundos; si se corta, usa bloques de 20 y velocidad lenta.</p>
      <div className="rounded-lg bg-hundido p-3 text-[12px] text-tenue space-y-1">
        <p className="font-semibold text-tinta">Antes de probar, en la impresora:</p>
        <p>• Con rollo continuo (sin etiquetas) o si la luz parpadea en rojo, mantén apretado el botón unos 3 segundos hasta que suene un pitido: aprende el papel.</p>
        <p>• Para ver que la impresora funciona sola, mantén el botón unos 5 segundos (dos pitidos): imprime su página de prueba.</p>
        <p className="font-semibold text-tinta pt-2">Qué dice la luz (Knaon Y813BT):</p>
        <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5">
          <li><b className="text-tinta">Verde:</b> Bluetooth conectado.</li>
          <li><b className="text-tinta">Azul fijo:</b> normal, sin Bluetooth.</li>
          <li><b className="text-tinta">Rojo cada 1 s:</b> no reconoce el papel. Revisa el tipo de papel y el alto de etiqueta, y calibra (botón 3 s).</li>
          <li><b className="text-tinta">Rojo rápido:</b> la tapa está abierta.</li>
          <li><b className="text-tinta">Azul y rojo:</b> cabezal caliente, sigue sola al enfriarse.</li>
        </ul>
      </div>
    </div>
  );
}

export default function FormasConexion({ ancho }) {
  const { data: config = {} } = useConfigPublica();
  const registro = useRegistro();
  const [forma, setForma] = useState(() => (viaGuardada() === 'serial' ? 'com' : soportaBluetooth() ? 'ble' : 'rawbt'));
  const [cfg, setCfg] = useState(configImpresora);
  const [idioma, setIdioma] = useState(cfg.lenguaje);
  const [tipoPrueba, setTipoPrueba] = useState('simple');
  const [ocupado, setOcupado] = useState(false);

  const cambiar = (c) => {
    const nuevo = { ...cfg, ...c };
    setCfg(nuevo);
    // Los ajustes del papel se guardan al momento si ya se usa TSPL.
    if (nuevo.lenguaje === 'tspl') guardarConfigImpresora(nuevo);
  };

  // Ticket de prueba en el idioma elegido para la prueba.
  const armarPrueba = async (titulo, lineas) => {
    if (idioma === 'tspl' && tipoPrueba === 'simple') return pruebaTsplSimple(titulo, cfg);
    const { bytes } = await bytesPrueba({ config, ancho, conLogo: tipoPrueba === 'ticket', titulo, lineas });
    return idioma === 'tspl' ? escPosATspl(bytes, { ...cfg, lenguaje: 'tspl' }) : bytes;
  };
  // Al elegir la conexión que funcionó, también queda el idioma con que se probó.
  const fijarIdioma = () => {
    const nuevo = { ...cfg, lenguaje: idioma };
    setCfg(nuevo);
    guardarConfigImpresora(nuevo);
    registro.log(idioma === 'tspl' ? 'Los tickets se mandan en TSPL (impresora de etiquetas).' : 'Los tickets se mandan en ESC/POS (impresora de tickets).');
  };

  const ticketVenta = async () => {
    setOcupado(true);
    try {
      await imprimirPrueba({ config, ancho, nombreImpresora: 'Como en las ventas', conLogo: true });
      registro.log('Ticket de prueba enviado como en las ventas.');
    } catch (e) { registro.log(`Error: ${e.message}`); avisar.error(e.message); } finally { setOcupado(false); }
  };

  // Knaon y similares: TSPL y el papel con que vienen de fábrica (etiquetas
  // de 100×150 mm con 3 mm de separación). Con "rollo continuo" la impresora
  // no encuentra la separación después de imprimir y queda con la luz roja
  // parpadeando ("no reconoce el papel").
  const yaSugerido = useRef(false);
  const alDetectarEtiquetas = () => {
    if (idioma !== 'tspl') {
      setIdioma('tspl');
      registro.log('Es una impresora de etiquetas (Knaon): las pruebas pasan a TSPL.');
    }
    // Solo la primera vez: si después se elige otro papel (rollo continuo),
    // no se vuelve a cambiar al buscar la impresora otra vez.
    if (!yaSugerido.current && cfg.lenguaje !== 'tspl' && cfg.papel !== 'etiqueta') {
      yaSugerido.current = true;
      cambiar({ papel: 'etiqueta', ancho_mm: 100, alto_mm: 150, gap_mm: 3 });
      registro.log('Papel puesto como trae de fábrica: etiquetas de 100×150 mm con 3 mm de separación. Si usas rollo continuo u otro tamaño, cámbialo arriba.');
    }
  };

  // Cortes y reconexiones de la impresora, en el registro.
  useEffect(() => {
    const al = () => {
      const e = estadoConexion();
      if (e === 'reconectando') registro.log('La impresora cortó el Bluetooth. Reconectando…');
      else if (e === 'conectada') registro.log('Impresora conectada.');
    };
    window.addEventListener(EVENTO_ESTADO, al);
    return () => window.removeEventListener(EVENTO_ESTADO, al);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const props = { armarPrueba, fijarIdioma, registro, idioma, alDetectarEtiquetas };

  return (
    <div className="space-y-4">
      <Actual />
      <div className="space-y-2">
        <Fila etiqueta="Tipo de impresora">
          <Segmentado tamano="sm" valor={idioma} onCambio={setIdioma} opciones={[{ valor: 'escpos', etiqueta: 'De tickets (ESC/POS)' }, { valor: 'tspl', etiqueta: 'De etiquetas (TSPL)' }]} />
        </Fila>
        <p className="text-[12px] text-tenue">
          Las impresoras de etiquetas de envío (Knaon, Munbyn, iDPRT… las de 4×6) no entienden los tickets normales: reciben los datos y no imprimen nada. Para esas elige “De etiquetas”.
        </p>
        <Fila etiqueta="Qué imprimir en la prueba">
          <Segmentado tamano="sm" valor={tipoPrueba} onCambio={setTipoPrueba} opciones={[{ valor: 'simple', etiqueta: 'Prueba corta' }, { valor: 'ticket', etiqueta: 'Ticket con logo' }]} />
        </Fila>
      </div>
      {idioma === 'tspl' && <AjustesTspl cfg={cfg} cambiar={cambiar} />}
      <Segmentado valor={forma} onCambio={setForma} opciones={[
        { valor: 'ble', etiqueta: 'Bluetooth directo', Icono: Bluetooth },
        { valor: 'com', etiqueta: 'Puerto COM', Icono: Cable },
        { valor: 'rawbt', etiqueta: 'App RawBT', Icono: Smartphone },
      ]} />
      {forma === 'ble' && <PruebaBle {...props} />}
      {forma === 'com' && <PruebaCom {...props} />}
      {forma === 'rawbt' && <PruebaRawbt {...props} />}
      {(impresoraGuardada() || puertoGuardado()) && (
        <button className="btn-borde w-full sm:w-auto" disabled={ocupado} onClick={ticketVenta}>
          {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Imprimir un ticket como en las ventas
        </button>
      )}
      <Registro lineas={registro.lineas} limpiar={registro.limpiar} />
    </div>
  );
}
