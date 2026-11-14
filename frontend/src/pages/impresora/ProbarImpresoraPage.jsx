// Probar la impresora Bluetooth de este dispositivo: conexión y logo, la ñ y
// las tildes (cada impresora entiende una tabla de letras distinta) y texto
// libre. Lo que se elige acá queda guardado en este navegador.
import { useState } from 'react';
import { Check, Loader2, Printer, Type } from 'lucide-react';
import ImpresoraDispositivo from '../../components/shell/ImpresoraDispositivo';
import { Encabezado, Pagina, Segmentado } from '../../components/ui/piezas';
import { avisar } from '../../components/ui/Aviso';
import { soportaBluetooth } from '../../utils/bluetoothDirecto';
import { CODIFICACIONES, codificacionGuardada, guardarCodificacion } from '../../utils/escpos';
import { FRASE_LETRAS, imprimirMapaCaracteres, imprimirMuestraLetras, imprimirTextoLibre } from '../../utils/rawbt';
import { cx } from '../../lib/util';

const CLAVE_ANCHO = 'rusoft-impresora-bt-ancho';
const leer = (clave, defecto) => { try { return localStorage.getItem(clave) || defecto; } catch { return defecto; } };
const guardar = (clave, valor) => { try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ } };

function Seccion({ titulo, texto, children }) {
  return (
    <section className="ficha p-5 sm:p-6 grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-5 md:gap-8 items-start">
      <div>
        <h2 className="font-display font-semibold text-lg">{titulo}</h2>
        <p className="text-sm text-tenue mt-1">{texto}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Fila({ etiqueta, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-tenue">{etiqueta}</span>
      {children}
    </div>
  );
}

export default function ProbarImpresoraPage() {
  const [via, setVia] = useState(soportaBluetooth() ? 'directo' : 'rawbt');
  const [ancho, setAncho] = useState(() => leer(CLAVE_ANCHO, '80mm'));
  const [letras, setLetras] = useState(codificacionGuardada);
  const [texto, setTexto] = useState(`${FRASE_LETRAS}\nTOTAL            Bs. 125.50`);
  const [tamano, setTamano] = useState('normal');
  const [ocupado, setOcupado] = useState(null);

  const correr = async (que, fn, ok) => {
    setOcupado(que);
    try { await fn(); avisar.ok(ok); } catch (e) { avisar.error(e.message); } finally { setOcupado(null); }
  };
  const elegirLetras = (c) => {
    setLetras(c.id);
    guardarCodificacion(c.id);
    avisar.ok(`Listo: este dispositivo imprime con la opción ${c.letra} (${c.nombre}).`);
  };
  const cambiarAncho = (v) => { setAncho(v); guardar(CLAVE_ANCHO, v); };
  const icono = (que, Icono) => (ocupado === que ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icono className="w-4 h-4" />);

  return (
    <Pagina>
      <Encabezado titulo="Probar impresora" texto="Pruebas de la impresora Bluetooth de este celular o computadora. Lo que elijas aquí solo cambia en este dispositivo." />
      <div className="space-y-5">
        <Seccion titulo="1. Conexión y logo" texto="Conecta la impresora e imprime un ticket corto, con o sin el logo del negocio.">
          <ImpresoraDispositivo />
        </Seccion>

        <Seccion titulo="2. La ñ y las tildes" texto="Cada impresora entiende las letras especiales a su manera. Imprime la muestra: sale la misma frase varias veces, cada una con una letra al lado. Elige la letra donde la frase se lee bien.">
          <div className="space-y-4">
            <div className="space-y-2">
              <Fila etiqueta="Enviar por">
                <Segmentado tamano="sm" valor={via} onCambio={setVia} opciones={[{ valor: 'directo', etiqueta: 'Bluetooth' }, { valor: 'rawbt', etiqueta: 'App RawBT' }]} />
              </Fila>
              <Fila etiqueta="Papel">
                <Segmentado tamano="sm" valor={ancho} onCambio={cambiarAncho} opciones={[{ valor: '58mm', etiqueta: '58 mm' }, { valor: '80mm', etiqueta: '80 mm' }]} />
              </Fila>
            </div>
            <button className="btn-aji w-full sm:w-auto" disabled={!!ocupado} onClick={() => correr('muestra', () => imprimirMuestraLetras({ ancho, via }), 'Revisa la muestra y elige la letra que salió bien.')}>
              {icono('muestra', Printer)} Imprimir muestra de letras
            </button>
            <div>
              <p className="etiqueta mb-2">¿Qué letra salió bien?</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CODIFICACIONES.map((c) => {
                  const activa = letras === c.id;
                  return (
                    <button key={c.id} type="button" aria-pressed={activa} onClick={() => elegirLetras(c)}
                      className={cx('flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left', activa ? 'border-aji bg-aji/5' : 'border-linea hover:bg-hundido')}>
                      <span className={cx('w-8 h-8 rounded-lg grid place-items-center font-display font-bold shrink-0', activa ? 'bg-aji text-sobre-aji' : 'bg-hundido')}>{c.letra}</span>
                      <span className="text-[13px] leading-tight flex-1 min-w-0">{c.nombre}</span>
                      {activa && <Check className="w-4 h-4 text-aji shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <p className="text-[12px] text-tenue mt-2">Si ninguna sale bien, elige F: imprime sin tildes ni ñ, pero siempre se lee.</p>
            </div>
            <div className="rounded-xl bg-hundido p-4 space-y-3">
              <p className="text-sm font-semibold">¿Ninguna salió bien? Averigua qué letras acepta</p>
              <p className="text-[13px] text-tenue">El mapa imprime todos los caracteres especiales de la opción marcada arriba, con su número. Si en el mapa aparecen la ñ y las tildes, esa opción sirve. Si salen símbolos raros, marca otra opción y vuelve a imprimirlo.</p>
              <button className="btn-borde w-full sm:w-auto" disabled={!!ocupado} onClick={() => correr('mapa', () => imprimirMapaCaracteres({ ancho, via, codificacion: letras }), 'Mapa enviado a la impresora.')}>
                {icono('mapa', Printer)} Imprimir mapa de la opción {CODIFICACIONES.find((c) => c.id === letras)?.letra}
              </button>
              <p className="text-[12px] text-tenue">La impresora también imprime su propia hoja de configuración: apágala, mantén apretado el botón de avance de papel (FEED) y préndela. Ahí dice qué tabla de letras (code page) usa.</p>
            </div>
          </div>
        </Seccion>

        <Seccion titulo="3. Texto libre" texto="Escribe lo que quieras e imprímelo con las letras elegidas. Sirve para revisar nombres de platos o de clientes.">
          <div className="space-y-3">
            <textarea className="campo min-h-[120px] font-mono text-sm" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Texto a imprimir" />
            <Fila etiqueta="Tamaño">
              <Segmentado tamano="sm" valor={tamano} onCambio={setTamano} opciones={[{ valor: 'normal', etiqueta: 'Normal' }, { valor: 'alto', etiqueta: 'Alto' }, { valor: 'grande', etiqueta: 'Grande' }]} />
            </Fila>
            <button className="btn-borde w-full sm:w-auto" disabled={!!ocupado || !texto.trim()} onClick={() => correr('texto', () => imprimirTextoLibre({ texto, ancho, via, tamano, codificacion: letras }), 'Texto enviado a la impresora.')}>
              {icono('texto', Type)} Imprimir texto
            </button>
          </div>
        </Seccion>
      </div>
    </Pagina>
  );
}
