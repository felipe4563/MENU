// Equipo › Sueldos: lo que se le debe a cada uno según su forma de pago
// (diario, semanal, quincenal, mensual) y los días que marcó entrada. Los
// pagos y adelantos salen de la caja abierta (o por fuera) y aparecen en el
// flujo de caja como Sueldos; los adelantos se descuentan solos al pagar.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Banknote, CalendarX, Check, ChevronRight, HandCoins, Pencil, Plus, Trash2, Wallet, QrCode } from 'lucide-react';
import {
  getSueldos, getSueldoPersona, configurarSueldo, eliminarSueldo, registrarMovimientoSueldo, anularMovimientoSueldo,
  justificarFalta, quitarJustificacion,
} from '../../api/sueldos';
import { usePermisos } from '../../hooks/usePermisos';
import { useMoneda } from '../../hooks/useConfig';
import { useSocket } from '../../hooks/useSocket';
import Hoja from '../../components/ui/Hoja';
import { Cargando, Campo, Encabezado, Insignia, Pagina, Segmentado, SinPermiso, Tarjeta, Vacio, useConfirmar } from '../../components/ui/piezas';
import { numero } from '../../components/ui/formulario';
import { avisar } from '../../components/ui/Aviso';
import { MODALIDADES, TIPOS_MOV, diaCorto, diaLargo, lineaPeriodo, rango, textoSueldo } from '../../lib/sueldos';
import { cx, dinero, errorDe, hoyISO, iniciales } from '../../lib/util';

const useRefrescar = () => {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: ['sueldos'] }); qc.invalidateQueries({ queryKey: ['flujo'] }); };
};

// "Se le debe" con su signo: negativo = se le adelantó de más.
function Saldo({ debe, moneda, grande }) {
  const adelantado = debe < -0.004;
  return (
    <div className="text-right">
      <p className={cx('text-[12px]', adelantado ? 'text-cielo' : 'text-tenue')}>{adelantado ? 'Adelantado' : 'Se le debe'}</p>
      <p className={cx('num font-bold', grande ? 'text-3xl' : 'text-xl', debe > 0.004 ? '' : 'text-tenue')}>{dinero(Math.abs(debe), moneda)}</p>
    </div>
  );
}

// ── Configurar el sueldo ──────────────────────────────────────────────────

function HojaSueldo({ persona, onCerrar }) {
  const refrescar = useRefrescar();
  const actual = persona.sueldo?.modalidad !== 'ninguno' ? persona.sueldo : null;
  const [f, setF] = useState({
    modalidad: actual?.modalidad ?? 'diario', monto: actual ? String(actual.monto) : '',
    vigente_desde: hoyISO(), descontar_faltas: actual ? actual.descontar_faltas : true,
  });
  const guardar = useMutation({
    mutationFn: (datos) => configurarSueldo(persona.usuario.id, datos),
    onSuccess: (_, v) => { refrescar(); avisar.ok(v.modalidad === 'ninguno' ? 'Ya no suma sueldo desde ese día' : 'Sueldo guardado'); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const valido = Number(f.monto) > 0 && f.vigente_desde;
  const cambiaModalidad = (v) => setF({ ...f, modalidad: v, descontar_faltas: v === 'mensual' ? true : f.descontar_faltas });

  return (
    <Hoja onCerrar={onCerrar} bloquear={guardar.isPending} ancho="max-w-md" titulo={`Sueldo de ${persona.usuario.nombre}`}
      subtitulo={actual ? `Ahora: ${textoSueldo(actual)}. Un cambio rige desde el día que elijas; lo anterior no cambia.` : 'Cada cuánto se le paga y cuánto.'}
      pie={(
        <div className="w-full flex flex-wrap gap-2">
          {actual && (
            <button className="btn-suave" disabled={!f.vigente_desde || guardar.isPending}
              onClick={() => guardar.mutate({ modalidad: 'ninguno', vigente_desde: f.vigente_desde })}>Deja de cobrar desde ese día</button>
          )}
          <button data-principal className="btn-aji flex-1" disabled={!valido || guardar.isPending}
            onClick={() => guardar.mutate({ ...f, monto: Number(f.monto) })}>Guardar</button>
        </div>
      )}>
      <div className="space-y-4">
        <Segmentado className="w-full" valor={f.modalidad} onCambio={cambiaModalidad} opciones={MODALIDADES.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))} />
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta={`Monto ${MODALIDADES.find((m) => m.valor === f.modalidad).por}`}>
            <input className="campo num text-lg" inputMode="decimal" autoFocus value={f.monto} onChange={(e) => setF({ ...f, monto: numero(e.target.value) })} />
          </Campo>
          <Campo etiqueta="Desde el día"><input type="date" className="campo" value={f.vigente_desde} onChange={(e) => setF({ ...f, vigente_desde: e.target.value })} /></Campo>
        </div>
        {f.modalidad === 'diario' ? (
          <p className="text-[13px] text-tenue">Gana el monto cada día que marca su entrada. Si no viene, ese día no suma.</p>
        ) : (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={f.descontar_faltas} onChange={(e) => setF({ ...f, descontar_faltas: e.target.checked })} />
            <span>
              Descontar las faltas
              <span className="block text-[13px] text-tenue">Cada día de su horario que no marcó entrada se descuenta (monto ÷ días que le tocan). Las faltas justificadas no se descuentan.</span>
            </span>
          </label>
        )}
      </div>
    </Hoja>
  );
}

// ── Pagar, adelanto, bono, descuento ──────────────────────────────────────

function HojaMovimiento({ persona, cajas, tipoInicial, moneda, onCerrar }) {
  const refrescar = useRefrescar();
  const [tipo, setTipo] = useState(tipoInicial);
  const sugerido = (t) => (t === 'pago' && persona.debe > 0 ? String(persona.debe) : '');
  const [monto, setMonto] = useState(sugerido(tipoInicial));
  const [origen, setOrigen] = useState(cajas[0] ? String(cajas[0].id) : 'fuera');
  const [metodo, setMetodo] = useState('efectivo');
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState('');
  const sacaPlata = tipo === 'pago' || tipo === 'adelanto';
  const n = Number(monto) || 0;
  const despues = persona.debe + (tipo === 'bono' ? n : -n);

  const guardar = useMutation({
    mutationFn: () => registrarMovimientoSueldo(persona.usuario.id, {
      tipo, monto: n, nota: nota.trim() || undefined,
      ...(sacaPlata && origen !== 'fuera' ? { sesion_caja_id: Number(origen) } : { metodo_pago: metodo, fecha }),
    }),
    onSuccess: () => { refrescar(); avisar.ok(`${TIPOS_MOV[tipo].etiqueta} de ${dinero(n, moneda)} registrado`); onCerrar(); },
    onError: (e) => avisar.error(errorDe(e)),
  });

  return (
    <Hoja onCerrar={onCerrar} bloquear={guardar.isPending} ancho="max-w-md" titulo={persona.usuario.nombre}
      subtitulo={`${textoSueldo(persona.sueldo, moneda)} · ${persona.debe < 0 ? 'adelantado' : 'se le debe'} ${dinero(Math.abs(persona.debe), moneda)}`}
      pie={(
        <div className="w-full space-y-2">
          {n > 0 && (
            <p className="text-sm text-tenue">
              Después {despues < -0.004 ? <>queda <b className="text-tinta">adelantado {dinero(-despues, moneda)}</b>: se descuenta del próximo pago.</> : <>se le deberá <b className="text-tinta">{dinero(despues, moneda)}</b>.</>}
            </p>
          )}
          <button data-principal className="btn-aji w-full" disabled={!(n > 0) || guardar.isPending} onClick={() => guardar.mutate()}>
            {sacaPlata ? `${TIPOS_MOV[tipo].etiqueta === 'Pago' ? 'Pagar' : 'Dar adelanto de'} ${dinero(n, moneda)}` : `Registrar ${TIPOS_MOV[tipo].etiqueta.toLowerCase()}`}
          </button>
        </div>
      )}>
      <div className="space-y-4">
        <Segmentado className="w-full" valor={tipo} onCambio={(t) => { setTipo(t); setMonto(sugerido(t)); }}
          opciones={Object.entries(TIPOS_MOV).map(([valor, t]) => ({ valor, etiqueta: t.etiqueta }))} />
        <p className="text-[13px] text-tenue -mt-2">
          {{ pago: 'Paga lo que se le debe. Los adelantos ya están descontados.', adelanto: 'Plata antes de terminar el período: se descuenta sola al pagar.', bono: 'Suma a lo que se le debe (horas extra, premio). No mueve plata ahora.', descuento: 'Resta de lo que se le debe (un daño, un faltante). No mueve plata.' }[tipo]}
        </p>
        <Campo etiqueta="Monto"><input className="campo num text-lg" inputMode="decimal" autoFocus value={monto} onChange={(e) => setMonto(numero(e.target.value))} /></Campo>
        {sacaPlata && (
          <Campo etiqueta="¿De dónde sale la plata?">
            <div className="space-y-1.5">
              {cajas.map((c) => (
                <label key={c.id} className={cx('flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer', origen === String(c.id) ? 'border-aji bg-aji/10' : 'border-linea')}>
                  <input type="radio" name="origen" checked={origen === String(c.id)} onChange={() => setOrigen(String(c.id))} />
                  <Wallet className="w-4 h-4 text-tenue" />
                  <span className="flex-1">{c.caja} <span className="text-tenue text-sm">· abierta por {c.cajero}</span></span>
                </label>
              ))}
              <label className={cx('flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer', origen === 'fuera' ? 'border-aji bg-aji/10' : 'border-linea')}>
                <input type="radio" name="origen" checked={origen === 'fuera'} onChange={() => setOrigen('fuera')} />
                <HandCoins className="w-4 h-4 text-tenue" />
                <span className="flex-1">Por fuera de la caja <span className="text-tenue text-sm">· QR o plata del dueño</span></span>
              </label>
              {!cajas.length && <p className="text-[13px] text-tenue">No hay una caja abierta en esta sucursal.</p>}
            </div>
          </Campo>
        )}
        {(!sacaPlata || origen === 'fuera') && (
          <div className="grid grid-cols-2 gap-3">
            {sacaPlata && (
              <Campo etiqueta="Medio">
                <Segmentado className="w-full" valor={metodo} onCambio={setMetodo} opciones={[{ valor: 'efectivo', etiqueta: 'Efectivo', Icono: Wallet }, { valor: 'qr', etiqueta: 'QR', Icono: QrCode }]} />
              </Campo>
            )}
            <Campo etiqueta="Día"><input type="date" className="campo" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} /></Campo>
          </div>
        )}
        <Campo etiqueta="Nota"><input className="campo" maxLength={160} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional, ej.: Sueldo de noviembre" /></Campo>
      </div>
    </Hoja>
  );
}

// ── Detalle de una persona ────────────────────────────────────────────────

function Desglose({ d, moneda }) {
  const p = d.periodo;
  if (!p) return null;
  const fila = (texto, valor, clase) => (
    <div className={cx('flex justify-between gap-3 py-1', clase)}><span>{texto}</span><span className="num">{valor}</span></div>
  );
  return (
    <div className="rounded-xl bg-hundido p-4 text-sm">
      {p.modalidad === 'diario' ? (
        <>
          {fila('Lo ganado (días que vino)', dinero(d.totales.ganado, moneda))}
          {d.totales.bonos > 0 && fila('+ Bonos', dinero(d.totales.bonos, moneda))}
          {d.totales.descuentos > 0 && fila('− Descuentos', dinero(d.totales.descuentos, moneda))}
          {fila('− Pagado y adelantos', dinero(d.totales.pagado, moneda))}
        </>
      ) : (
        <>
          <p className="font-semibold mb-1 first-letter:uppercase">{rango(p.desde, p.hasta)}</p>
          {fila('Sueldo del período', dinero(p.proyectado + p.descuento_faltas, moneda))}
          {p.faltas > 0 && fila(`− ${p.faltas} ${p.faltas === 1 ? 'falta' : 'faltas'}`, dinero(p.descuento_faltas, moneda), 'text-locoto')}
          {p.bonos > 0 && fila('+ Bonos', dinero(p.bonos, moneda))}
          {p.descuentos > 0 && fila('− Descuentos', dinero(p.descuentos, moneda))}
          {p.adelantos > 0 && fila('− Adelantos y pagos', dinero(p.adelantos, moneda))}
          {d.proximo && fila(`A pagar el ${diaCorto(d.proximo.fecha)}`, dinero(d.proximo.monto, moneda), 'font-bold border-t border-linea mt-1 pt-2')}
          {p.dias_pendientes > 0 && <p className="text-[12px] text-tenue mt-1">Si viene los {p.dias_pendientes} días que faltan. Hasta hoy ganó {dinero(p.ganado, moneda)}.</p>}
          {p.extras > 0 && <p className="text-[12px] text-tenue mt-1">Vino {p.extras} {p.extras === 1 ? 'día' : 'días'} fuera de su horario: si corresponde, págalo como bono.</p>}
          {p.sin_horario && <p className="text-[12px] mt-1 flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> No tiene horario: no se pueden contar sus faltas. Cárgalo en <Link className="underline" to="/equipo/asistencia">Asistencia</Link>.</p>}
        </>
      )}
    </div>
  );
}

function HojaDetalle({ id, moneda, onCerrar, onMovimiento, onSueldo }) {
  const refrescar = useRefrescar();
  const q = useQuery({ queryKey: ['sueldos', 'persona', id], queryFn: () => getSueldoPersona(id) });
  const [confirmacion, confirmar] = useConfirmar();
  const anular = useMutation({
    mutationFn: (m) => anularMovimientoSueldo(id, m.id),
    onSuccess: () => { refrescar(); avisar.ok('Anulado'); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const justificar = useMutation({
    mutationFn: ({ fecha, quitar }) => (quitar ? quitarJustificacion(id, fecha) : justificarFalta(id, { fecha, motivo: 'Permiso' })),
    onSuccess: (_, v) => { refrescar(); avisar.ok(v.quitar ? 'Se descuenta de nuevo' : 'Falta justificada: no se descuenta'); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const borrarSueldo = useMutation({
    mutationFn: (s) => eliminarSueldo(id, s.id),
    onSuccess: () => { refrescar(); avisar.ok('Cambio de sueldo borrado'); },
    onError: (e) => avisar.error(errorDe(e)),
  });
  const d = q.data;
  const faltas = d ? d.periodos.flatMap((p) => p.faltas ?? []).slice(0, 40) : [];
  const justificadas = d ? d.periodos.flatMap((p) => p.justificadas ?? []).slice(0, 40) : [];
  const conGanado = d ? d.periodos.filter((p) => p.ganado > 0 || !p.cerrado) : [];

  return (
    <Hoja onCerrar={onCerrar} ancho="max-w-2xl" titulo={d?.usuario.nombre ?? 'Cargando…'} subtitulo={d ? textoSueldo(d.sueldo, moneda) : ''}
      pie={d && (
        <div className="w-full flex flex-wrap gap-2">
          <button className="btn-suave" onClick={() => onSueldo(d)}><Pencil className="w-4 h-4" /> Cambiar sueldo</button>
          <button className="btn-suave" onClick={() => onMovimiento(d, 'adelanto')}>Adelanto</button>
          <button data-principal className="btn-aji flex-1" onClick={() => onMovimiento(d, 'pago')}>Pagar</button>
        </div>
      )}>
      {!d ? <Cargando /> : (
        <div className="space-y-6">
          <div className="flex items-end justify-between gap-3">
            <p className="text-sm text-tenue">{d.periodo?.modalidad === 'diario' ? (d.hoy_marco ? 'Hoy marcó entrada.' : 'Hoy todavía no marcó entrada.') : lineaPeriodo(d.periodo, moneda)}</p>
            <Saldo debe={d.debe} moneda={moneda} grande />
          </div>
          <Desglose d={d} moneda={moneda} />

          <section>
            <h3 className="font-display font-semibold mb-1">Pagos, adelantos, bonos y descuentos</h3>
            {!d.movimientos.length ? <p className="text-sm text-tenue">Todavía nada.</p> : (
              <ul className="divide-y divide-linea">
                {d.movimientos.map((m) => (
                  <li key={m.id} className="py-2 flex items-center gap-3">
                    <span className="w-14 text-[13px] text-tenue">{diaCorto(m.fecha)}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block">{TIPOS_MOV[m.tipo].etiqueta}{m.nota ? <span className="text-tenue"> · {m.nota}</span> : null}</span>
                      <span className="block text-[12px] text-tenue truncate">
                        {m.caja ? `De ${m.caja}` : m.metodo_pago ? `Por fuera · ${m.metodo_pago === 'qr' ? 'QR' : 'efectivo'}` : 'No mueve plata'}{m.registrado_por ? ` · ${m.registrado_por}` : ''}
                      </span>
                    </span>
                    <span className={cx('num font-semibold', m.tipo === 'bono' && 'text-hierba')}>{TIPOS_MOV[m.tipo].signo}{dinero(m.monto, moneda)}</span>
                    <button className="btn-icono btn-fantasma text-locoto" aria-label="Anular" disabled={!m.se_puede_anular || anular.isPending}
                      title={m.se_puede_anular ? 'Anular' : 'La caja ya cerró'}
                      onClick={async () => { if (await confirmar({ titulo: `¿Anular ${TIPOS_MOV[m.tipo].etiqueta.toLowerCase()} de ${dinero(m.monto, moneda)}?`, texto: m.caja ? 'La plata vuelve a contarse en la caja.' : 'Se quita también del flujo de caja.', confirmar: 'Anular', peligro: true })) anular.mutate(m); }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(faltas.length > 0 || justificadas.length > 0) && (
            <section>
              <h3 className="font-display font-semibold mb-1">Faltas</h3>
              <p className="text-[13px] text-tenue mb-2">Días de su horario sin marcar entrada. Justifica las que tuvieron permiso para no descontarlas.</p>
              <ul className="divide-y divide-linea">
                {[...faltas.map((f) => ({ f, j: false })), ...justificadas.map((f) => ({ f, j: true }))].sort((a, b) => (a.f < b.f ? 1 : -1)).map(({ f, j }) => (
                  <li key={f} className="py-2 flex items-center gap-3">
                    <CalendarX className={cx('w-4 h-4', j ? 'text-tenue' : 'text-locoto')} />
                    <span className="flex-1 first-letter:uppercase">{diaLargo(f)}</span>
                    {j && <Insignia tono="ok">Justificada</Insignia>}
                    <button className="btn-suave h-8 text-sm" disabled={justificar.isPending} onClick={() => justificar.mutate({ fecha: f, quitar: j })}>
                      {j ? 'Quitar' : <><Check className="w-4 h-4" /> Justificar</>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {conGanado.length > 0 && (
            <section>
              <h3 className="font-display font-semibold mb-1">{d.periodo?.modalidad === 'diario' ? 'Días trabajados' : 'Períodos'}</h3>
              <ul className="divide-y divide-linea text-sm">
                {conGanado.slice(0, 31).map((p) => (
                  <li key={p.desde} className="py-1.5 flex gap-3">
                    <span className="flex-1 first-letter:uppercase">{p.modalidad === 'diario' ? diaLargo(p.desde) : rango(p.desde, p.hasta)}</span>
                    {p.modalidad !== 'diario' && <span className="text-tenue">{p.dias_trabajados}/{p.dias_del_periodo} días{p.faltas.length ? ` · ${p.faltas.length} faltas` : ''}</span>}
                    <span className="num w-24 text-right">{p.cerrado || p.modalidad === 'diario' ? dinero(p.ganado, moneda) : <span className="text-tenue">en curso</span>}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="font-display font-semibold mb-1">Historial de sueldo</h3>
            <ul className="divide-y divide-linea text-sm">
              {d.sueldos.map((s) => (
                <li key={s.id} className="py-1.5 flex items-center gap-3">
                  <span className="w-28 text-tenue">Desde {diaCorto(s.vigente_desde)}</span>
                  <span className="flex-1">{textoSueldo(s, moneda)}{s.modalidad !== 'diario' && s.modalidad !== 'ninguno' && !s.descontar_faltas ? ' · sin descontar faltas' : ''}</span>
                  <button className="btn-icono btn-fantasma text-locoto" aria-label="Borrar este cambio" disabled={borrarSueldo.isPending}
                    onClick={async () => { if (await confirmar({ titulo: '¿Borrar este cambio de sueldo?', texto: 'Úsalo si se cargó por error: se recalcula con el sueldo anterior.', confirmar: 'Borrar', peligro: true })) borrarSueldo.mutate(s); }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      {confirmacion}
    </Hoja>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────

function FilaPersona({ p, moneda, onAbrir, onMovimiento }) {
  const linea = p.periodo?.modalidad === 'diario'
    ? (p.hoy_marco ? 'Hoy vino' : 'Hoy no marcó todavía')
    : lineaPeriodo(p.periodo, moneda);
  return (
    <li className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 py-3">
      <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={onAbrir}>
        <span className="w-10 h-10 rounded-full bg-hundido grid place-items-center text-xs font-bold shrink-0">{iniciales(p.usuario.nombre)}</span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="font-semibold truncate">{p.usuario.nombre}</span>
            {!p.usuario.activo && <Insignia>Dado de baja</Insignia>}
          </span>
          <span className="block text-[13px] text-tenue truncate">{textoSueldo(p.sueldo, moneda)}</span>
          {linea && (
            <span className={cx('flex items-center gap-1 text-[13px] truncate', p.periodo?.modalidad === 'diario' && !p.hoy_marco ? 'text-tenue' : '')}>
              {p.periodo?.sin_horario && <AlertTriangle className="w-3.5 h-3.5 shrink-0" title="Sin horario: no se cuentan faltas" />}
              {linea}
            </span>
          )}
        </span>
      </button>
      <div className="flex items-center gap-3 ml-auto">
        <div>
          <Saldo debe={p.debe} moneda={moneda} />
          {p.proximo && p.periodo?.modalidad !== 'diario' && <p className="text-[12px] text-tenue text-right num">Al {diaCorto(p.proximo.fecha)}: {dinero(p.proximo.monto, moneda)}</p>}
        </div>
        <button className="btn-suave h-9" onClick={() => onMovimiento(p, 'adelanto')}>Adelanto</button>
        <button className="btn-aji h-9" onClick={() => onMovimiento(p, 'pago')}>Pagar</button>
        <ChevronRight className="w-4 h-4 text-tenue hidden sm:block" />
      </div>
    </li>
  );
}

export default function SueldosPage() {
  const qc = useQueryClient();
  const moneda = useMoneda();
  const { tiene } = usePermisos();
  const puede = tiene('personal', 'pagar');
  const [filtro, setFiltro] = useState('todos');
  const [detalle, setDetalle] = useState(null); // usuario_id
  const [mov, setMov] = useState(null); // { persona, tipo }
  const [sueldo, setSueldo] = useState(null); // persona
  const q = useQuery({ queryKey: ['sueldos'], queryFn: getSueldos, enabled: puede, refetchInterval: 60_000 });
  useSocket('restaurante:actualizar', () => qc.invalidateQueries({ queryKey: ['sueldos'] }));

  if (!puede) return <SinPermiso />;
  const datos = q.data;
  const conSueldo = (datos?.personas ?? []).filter((p) => (p.configurado && p.sueldo?.modalidad !== 'ninguno') || Math.abs(p.debe) >= 0.01);
  const sinSueldo = (datos?.personas ?? []).filter((p) => !conSueldo.includes(p) && p.usuario.activo);
  const visibles = conSueldo.filter((p) => filtro === 'todos' || p.sueldo?.modalidad === filtro);
  const totalDebe = conSueldo.reduce((t, p) => t + Math.max(p.debe, 0), 0);
  const pagadoMes = conSueldo.reduce((t, p) => t + p.pagado_mes, 0);
  const deHoy = conSueldo.filter((p) => p.sueldo?.modalidad === 'diario' && p.debe > 0.004).length;

  return (
    <Pagina>
      <Encabezado titulo="Sueldos" texto="Lo que se le debe a cada uno según su forma de pago y los días que marcó entrada. Lo que pagas sale de la caja y aparece en el flujo de caja." />
      {q.isLoading ? <Cargando /> : !datos ? <Vacio titulo="No se pudo cargar" /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="ficha p-4"><p className="text-sm text-tenue">Se debe hoy</p><p className="num text-2xl font-bold">{dinero(totalDebe, moneda)}</p></div>
            <div className="ficha p-4"><p className="text-sm text-tenue">Pagado este mes</p><p className="num text-2xl font-bold">{dinero(pagadoMes, moneda)}</p></div>
            <div className="ficha p-4"><p className="text-sm text-tenue">Diarios por pagar hoy</p><p className="num text-2xl font-bold">{deHoy} {deHoy === 1 ? 'persona' : 'personas'}</p></div>
          </div>

          {conSueldo.length > 0 && (
            <Segmentado tamano="sm" valor={filtro} onCambio={setFiltro} opciones={[{ valor: 'todos', etiqueta: 'Todos' }, ...MODALIDADES.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))]} />
          )}
          {conSueldo.length === 0 ? (
            <Vacio Icono={Banknote} titulo="Nadie tiene sueldo configurado" texto="Elige abajo a quién le pagas y cómo: diario, semanal, quincenal o mensual." />
          ) : (
            <ul className="ficha divide-y divide-linea">
              {visibles.map((p) => (
                <FilaPersona key={p.usuario.id} p={p} moneda={moneda} onAbrir={() => setDetalle(p.usuario.id)} onMovimiento={(per, tipo) => setMov({ persona: per, tipo })} />
              ))}
              {!visibles.length && <li className="px-4 py-6 text-center text-tenue text-sm">Nadie cobra así.</li>}
            </ul>
          )}

          {sinSueldo.length > 0 && (
            <Tarjeta titulo="Sin sueldo configurado">
              <ul className="flex flex-wrap gap-2">
                {sinSueldo.map((p) => (
                  <li key={p.usuario.id}>
                    <button className="btn-suave h-9" onClick={() => setSueldo(p)}><Plus className="w-4 h-4" /> {p.usuario.nombre}</button>
                  </li>
                ))}
              </ul>
              <p className="text-[12px] text-tenue mt-3">Para que gane por los días que viene, cada persona tiene que marcar su entrada en “Marcar asistencia”.</p>
            </Tarjeta>
          )}
        </div>
      )}

      {detalle && (
        <HojaDetalle id={detalle} moneda={moneda} onCerrar={() => setDetalle(null)}
          onMovimiento={(per, tipo) => setMov({ persona: per, tipo })} onSueldo={(per) => setSueldo(per)} />
      )}
      {mov && <HojaMovimiento persona={mov.persona} tipoInicial={mov.tipo} cajas={datos?.cajas ?? []} moneda={moneda} onCerrar={() => setMov(null)} />}
      {sueldo && <HojaSueldo persona={sueldo} onCerrar={() => setSueldo(null)} />}
    </Pagina>
  );
}
