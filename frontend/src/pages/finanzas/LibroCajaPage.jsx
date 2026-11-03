import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowDownLeft, ArrowUpRight, BookOpen } from 'lucide-react';
import { getLibroCaja, getResumenLibroCaja, crearMovimiento } from '../../api/libroCaja';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import { useCajaActiva } from '../../hooks/useCajaActiva';
import Hoja from '../../components/ui/Hoja';
import { Buscador, Cargando, Campo, Encabezado, Interruptor, Pagina, Segmentado, SinPermiso, Vacio, Insignia } from '../../components/ui/piezas';
import { numero } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { useRango, SelectorRango, exportarCsv, BotonCsv, Paginador } from './comun';
import { cx, dinero, errorDe, fechaHora } from '../../lib/util';

const METODO = { efectivo: 'Efectivo', qr: 'QR', app_externa: 'App' };

function HojaMovimiento({ onCerrar }) {
  const qc = useQueryClient();
  const caja = useCajaActiva();
  const [f, setF] = useState({ tipo: 'egreso', concepto: '', monto: '', metodo_pago: 'efectivo', enCaja: true });
  const guardar = useMutation({
    mutationFn: () => crearMovimiento({ tipo: f.tipo, concepto: f.concepto.trim(), monto: Number(f.monto), metodo_pago: f.metodo_pago, sesion_caja_id: f.enCaja && caja.sesion ? caja.sesion.id : undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['libro'] }); qc.invalidateQueries({ queryKey: ['sesion'] }); avisar.ok('Movimiento registrado'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  return (
    <Hoja onCerrar={onCerrar} titulo="Nuevo movimiento" ancho="max-w-md"
      pie={<button data-principal className="btn-aji w-full" disabled={!f.concepto.trim() || !(Number(f.monto) > 0) || guardar.isPending} onClick={() => guardar.mutate()}>Registrar</button>}>
      <div className="space-y-4">
        <Segmentado className="w-full" valor={f.tipo} onCambio={(v) => setF({ ...f, tipo: v })} opciones={[{ valor: 'egreso', etiqueta: 'Salida de dinero', Icono: ArrowUpRight }, { valor: 'ingreso', etiqueta: 'Entrada de dinero', Icono: ArrowDownLeft }]} />
        <Campo etiqueta="Concepto"><input autoFocus className="campo" value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} placeholder="Ej.: Pago de luz" /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Monto"><input className="campo num" inputMode="decimal" value={f.monto} onChange={(e) => setF({ ...f, monto: numero(e.target.value) })} /></Campo>
          <Campo etiqueta="Medio"><select className="campo" value={f.metodo_pago} onChange={(e) => setF({ ...f, metodo_pago: e.target.value })}><option value="efectivo">Efectivo</option><option value="qr">QR / transferencia</option></select></Campo>
        </div>
        {caja.sesion && <Interruptor activo={f.enCaja} onCambio={(v) => setF({ ...f, enCaja: v })} etiqueta={`Cuenta en el turno de ${caja.sesion.caja_nombre}`} descripcion="Si sale efectivo del cajón, se descuenta del arqueo." />}
      </div>
    </Hoja>
  );
}

export default function LibroCajaPage() {
  const { tiene } = usePermisos();
  const moneda = useMoneda();
  const r = useRango('7d');
  const [tipo, setTipo] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [nuevo, setNuevo] = useState(false);
  const filtros = { ...r.rango, tipo: tipo || undefined, busqueda: busqueda.trim() || undefined };
  const res = useQuery({ queryKey: ['libro', 'res', filtros], queryFn: () => getResumenLibroCaja(filtros), enabled: tiene('libro_caja', 'ver') });
  const lista = useQuery({ queryKey: ['libro', 'lista', filtros, pagina], queryFn: () => getLibroCaja({ ...filtros, pagina, limite: 25 }), enabled: tiene('libro_caja', 'ver'), placeholderData: (x) => x });
  if (!tiene('libro_caja', 'ver')) return <SinPermiso />;
  const d = res.data ?? {};
  const filas = lista.data?.filas ?? [];

  return (
    <Pagina>
      <Encabezado titulo="Libro de caja" texto="Toda entrada y salida de dinero: ventas, gastos, compras."
        acciones={tiene('libro_caja', 'crear') && <button className="btn-aji" onClick={() => setNuevo(true)}><Plus className="w-4 h-4" /> Movimiento</button>} />
      <div className="mb-4"><SelectorRango r={r} /></div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="ficha p-4"><p className="text-[13px] text-tenue">Entró</p><p className="num text-2xl font-extrabold text-hierba">{dinero(d.total_ingresos, moneda)}</p></div>
        <div className="ficha p-4"><p className="text-[13px] text-tenue">Salió</p><p className="num text-2xl font-extrabold text-locoto">{dinero(d.total_egresos, moneda)}</p></div>
        <div className="ficha p-4"><p className="text-[13px] text-tenue">Saldo</p><p className="num text-2xl font-extrabold">{dinero((d.total_ingresos ?? 0) - (d.total_egresos ?? 0), moneda)}</p></div>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <Buscador valor={busqueda} onCambio={(v) => { setBusqueda(v); setPagina(1); }} placeholder="Buscar concepto" className="flex-1 min-w-[200px]" />
        <Segmentado valor={tipo} onCambio={(v) => { setTipo(v); setPagina(1); }} opciones={[{ valor: '', etiqueta: 'Todo' }, { valor: 'ingreso', etiqueta: 'Entradas' }, { valor: 'egreso', etiqueta: 'Salidas' }]} />
        <BotonCsv disabled={!filas.length} onClick={async () => {
          const todo = await getLibroCaja({ ...filtros, limite: 0 });
          exportarCsv(`libro_${r.rango.desde}_${r.rango.hasta}`, [
            { titulo: 'Fecha', valor: (m) => fechaHora(m.creado_en) }, { titulo: 'Tipo', valor: (m) => m.tipo }, { titulo: 'Concepto', valor: (m) => m.concepto },
            { titulo: 'Medio', valor: (m) => METODO[m.metodo_pago] ?? m.metodo_pago }, { titulo: 'Usuario', valor: (m) => m.usuario?.nombre }, { titulo: 'Monto', valor: (m) => Number(m.monto).toFixed(2) },
          ], todo.filas ?? []);
        }} />
      </div>
      {lista.isLoading ? <Cargando /> : filas.length === 0 ? <Vacio Icono={BookOpen} titulo="Sin movimientos" /> : (
        <ul className="ficha divide-y divide-linea">
          {filas.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <span className={cx('w-9 h-9 rounded-full grid place-items-center shrink-0', m.tipo === 'ingreso' ? 'bg-hierba/12 text-hierba' : 'bg-locoto/10 text-locoto')}>
                {m.tipo === 'ingreso' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{m.concepto}</p>
                <p className="text-xs text-tenue">{fechaHora(m.creado_en)} · {m.usuario?.nombre}</p>
              </div>
              <Insignia>{METODO[m.metodo_pago] ?? m.metodo_pago}</Insignia>
              <span className={cx('num font-bold w-28 text-right', m.tipo === 'ingreso' ? 'text-hierba' : 'text-locoto')}>{m.tipo === 'ingreso' ? '+' : '−'}{dinero(m.monto, moneda)}</span>
            </li>
          ))}
        </ul>
      )}
      <Paginador pagina={pagina} total={lista.data?.total_paginas} onCambio={setPagina} />
      {nuevo && <HojaMovimiento onCerrar={() => setNuevo(false)} />}
    </Pagina>
  );
}
