import { useEffect, useState } from 'react';
import { Bluetooth, BluetoothOff, Loader2, Printer, Unlink, CheckCircle2 } from 'lucide-react';
import { emparejar, impresoraGuardada, olvidar, soportaBluetooth } from '../../utils/bluetoothDirecto';
import { imprimirPrueba } from '../../utils/rawbt';
import { useConfigPublica } from '../../hooks/useConfig';
import { Segmentado } from '../ui/piezas';
import { avisar } from '../ui/Aviso';
import { cx } from '../../lib/util';

const CLAVE_ANCHO = 'rusoft-impresora-bt-ancho';
const leerAncho = () => { try { return localStorage.getItem(CLAVE_ANCHO) || '80mm'; } catch { return '80mm'; } };

function useImpresora() {
  const [dato, setDato] = useState(impresoraGuardada);
  useEffect(() => {
    const al = () => setDato(impresoraGuardada());
    window.addEventListener('impresora-bt', al);
    return () => window.removeEventListener('impresora-bt', al);
  }, []);
  return dato;
}

// Conectar la impresora Bluetooth de ESTE celular o computadora. El navegador
// recuerda el permiso por dispositivo: cada aparato que vende lo hace una vez.
export default function ImpresoraDispositivo({ compacto = false }) {
  const impresora = useImpresora();
  const { data: cfg = {} } = useConfigPublica();
  const [ocupado, setOcupado] = useState(null); // 'conectar' | 'prueba' | null
  const [ancho, setAncho] = useState(leerAncho);
  const [conLogo, setConLogo] = useState(true);
  const [resultado, setResultado] = useState(null);

  if (!soportaBluetooth()) {
    return (
      <div className="rounded-xl bg-hundido p-4 flex gap-3">
        <BluetoothOff className="w-5 h-5 shrink-0 mt-0.5 text-tenue" />
        <div className="text-sm">
          <p className="font-semibold">Este navegador no puede usar Bluetooth</p>
          <p className="text-tenue mt-0.5">Abre el sistema en Chrome o Edge (en Android o en la computadora). En iPhone no funciona: ahí usa una impresora conectada a la PC.</p>
        </div>
      </div>
    );
  }

  const conectar = async () => {
    setOcupado('conectar');
    try {
      const d = await emparejar();
      avisar.ok(`Impresora conectada: ${d.nombre}`);
    } catch (e) {
      if (e.codigo !== 'CANCELADO') avisar.error(e.message);
    } finally { setOcupado(null); }
  };

  const probar = async () => {
    setOcupado('prueba');
    setResultado(null);
    try {
      const r = await imprimirPrueba({ config: cfg, ancho, nombreImpresora: impresora?.nombre, conLogo });
      setResultado(r);
      avisar.ok('Listo, revisa el ticket de prueba');
    } catch (e) {
      avisar.error(e.message);
    } finally { setOcupado(null); }
  };

  const cambiarAncho = (v) => { setAncho(v); try { localStorage.setItem(CLAVE_ANCHO, v); } catch { /* nada */ } };

  return (
    <div className="space-y-3">
      {impresora ? (
        <div className="rounded-xl border border-linea p-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-hierba/15 text-hierba grid place-items-center shrink-0"><Bluetooth className="w-5 h-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-tenue flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-hierba" /> Conectada en este dispositivo</p>
              <p className="font-semibold truncate">{impresora.nombre}</p>
            </div>
          </div>
          <div className={cx('mt-3 grid gap-2', compacto ? 'grid-cols-1' : 'sm:grid-cols-3')}>
            <button className="btn-aji" disabled={!!ocupado} onClick={probar}>
              {ocupado === 'prueba' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Imprimir prueba
            </button>
            <button className="btn-borde" disabled={!!ocupado} onClick={conectar}>
              {ocupado === 'conectar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />} Cambiar impresora
            </button>
            <button className="btn-fantasma text-locoto" disabled={!!ocupado} onClick={() => olvidar().then(() => avisar.ok('Impresora olvidada'))}>
              <Unlink className="w-4 h-4" /> Olvidar
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-linea p-4 text-center">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-hundido grid place-items-center"><Bluetooth className="w-6 h-6" /></span>
          <p className="font-semibold mt-3">Sin impresora en este dispositivo</p>
          <p className="text-sm text-tenue mt-1">Enciende la impresora, acércala y tócala en la lista que abre el navegador.</p>
          <button className="btn-aji mt-4 w-full sm:w-auto" disabled={!!ocupado} onClick={conectar}>
            {ocupado === 'conectar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />} Conectar impresora
          </button>
        </div>
      )}
      {impresora && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-tenue">Papel para la prueba</span>
            <Segmentado tamano="sm" valor={ancho} onCambio={cambiarAncho} opciones={[{ valor: '58mm', etiqueta: '58 mm' }, { valor: '80mm', etiqueta: '80 mm' }]} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-tenue">Logo en la prueba</span>
            <Segmentado tamano="sm" valor={conLogo} onCambio={setConLogo} opciones={[{ valor: true, etiqueta: 'Con logo' }, { valor: false, etiqueta: 'Sin logo' }]} />
          </div>
        </div>
      )}
      {resultado && (
        <p className={cx('text-[13px] rounded-xl px-3 py-2.5', resultado.errorLogo ? 'bg-locoto/10 text-locoto' : 'bg-hundido')}>
          {resultado.conLogo
            ? `Se mandó el ticket con el logo (${Math.round(resultado.bytesLogo / 1024)} KB). Si no salió el logo, tu impresora no lo acepta: apaga “Imprimir el logo” en la caja.`
            : resultado.errorLogo ? `Se mandó sin logo: ${resultado.errorLogo}` : 'Se mandó el ticket sin logo.'}
        </p>
      )}
      <p className="text-[12px] text-tenue">Funciona con impresoras térmicas Bluetooth BLE. Si la tuya no aparece en la lista, usa la conexión con la app RawBT.</p>
    </div>
  );
}
