// Cupones del cliente y giro de la ruleta, desde el cobro.
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Disc3, Gift, Cake, Ticket, Check } from 'lucide-react';
import Hoja from '../ui/Hoja';
import { Cargando } from '../ui/piezas';
import { avisar } from '../ui/Aviso';
import { getCuponesDisponibles } from '../../api/cupones';
import { getEstadoRuleta, getPremiosRuletaActivos, girarRuleta } from '../../api/ruleta';
import { useConfig, useMoneda } from '../../hooks/useConfig';
import { usePermisos } from '../../hooks/usePermisos';
import { cx, dinero, errorDe } from '../../lib/util';
import { DatosGiro, LeyendaPremios, Rueda, TarjetaPremio, useGiro } from './Rueda';

import { vencimiento } from '../../lib/cupones';

// Los cupones guardados del cliente, para aplicarlos con un toque.
export function CuponesCliente({ cliente, aplicando, onElegir }) {
  const moneda = useMoneda();
  const { data = [], isLoading } = useQuery({ queryKey: ['cupones-cliente', cliente.id], queryFn: () => getCuponesDisponibles(cliente.id) });
  if (isLoading || data.length === 0) return null;
  return (
    <div>
      <p className="text-sm mb-1.5">Cupones de {cliente.nombre.split(' ')[0]} <span className="text-tenue">· toca uno para usarlo</span></p>
      <ul className="grid gap-1.5">
        {data.map((c) => {
          const Icono = c.origen === 'ruleta' ? Disc3 : c.origen === 'cumpleanos' ? Cake : Ticket;
          const valor = c.tipo === 'porcentaje' ? `${Number(c.valor)}%` : dinero(c.valor, moneda);
          const v = vencimiento(c.fecha_expiracion);
          return (
            <li key={c.id}>
              <button type="button" disabled={aplicando} onClick={() => onElegir(c.codigo, c.descripcion)}
                className="w-full flex items-center gap-3 rounded-xl border border-dashed border-aji/60 bg-aji/5 px-3 py-2 text-left hover:bg-aji/10 disabled:opacity-50">
                <Icono className="w-5 h-5 shrink-0 text-aji" />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">{c.descripcion || c.codigo}</span>
                  <span className="block text-xs text-tenue truncate">
                    {v.urgente && <span className="font-semibold text-locoto">{v.texto[0].toUpperCase() + v.texto.slice(1)} · </span>}
                    {c.descripcion ? c.codigo : ''}{!v.urgente && `${c.descripcion ? ' · ' : ''}${v.texto}`}
                  </span>
                </span>
                <span className="num font-bold shrink-0">−{valor}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Botón "Girar la ruleta": solo si está activa y el usuario puede girar.
export function useRuletaDisponible() {
  const { config } = useConfig();
  const { tiene } = usePermisos();
  return config.ruleta_activa === 'true' && tiene('ruleta', 'girar');
}

// Giro desde el cobro. Si sale un cupón, se puede usar en esta misma compra.
export function HojaGiroCobro({ cliente, onCerrar, onPuntos, onUsarCupon }) {
  const qc = useQueryClient();
  const premios = useQuery({ queryKey: ['ruleta-activos'], queryFn: getPremiosRuletaActivos });
  const estado = useQuery({ queryKey: ['ruleta-estado', cliente.id], queryFn: () => getEstadoRuleta(cliente.id) });
  const lista = useMemo(() => premios.data ?? [], [premios.data]);
  const giro = useGiro(lista, {
    alTerminar: (r) => {
      qc.invalidateQueries({ queryKey: ['ruleta-estado'] });
      qc.invalidateQueries({ queryKey: ['cupones-cliente', cliente.id] });
      if (r.puntos_restantes != null) onPuntos(r.puntos_restantes);
    },
  });
  const girar = useMutation({ mutationFn: () => girarRuleta(cliente.id), onSuccess: giro.animar, onError: (e) => avisar.error(errorDe(e)) });
  const e = estado.data;
  const ganado = giro.ganado;

  return (
    <Hoja onCerrar={onCerrar} bloquear={giro.girando || girar.isPending} titulo="Ruleta de premios" subtitulo={cliente.nombre} ancho="max-w-md"
      pie={ganado ? (
        <div className="flex gap-2 w-full">
          <button className={cx(ganado.cupon ? 'btn-borde flex-1' : 'btn-aji btn-lg w-full')} onClick={onCerrar}>{ganado.cupon ? 'Para otra vez' : 'Volver al cobro'}</button>
          {ganado.cupon && <button data-principal className="btn-aji flex-[1.4]" onClick={() => onUsarCupon(ganado.cupon.codigo, ganado.premio?.nombre)}><Check className="w-4 h-4" /> Usar en esta compra</button>}
        </div>
      ) : e && (
        <button data-principal className="btn-aji btn-lg w-full" disabled={!e.puede_girar || giro.girando || girar.isPending || !lista.length} onClick={() => girar.mutate()}>
          <Disc3 className={cx('w-5 h-5', giro.girando && 'animate-spin')} /> {giro.girando ? 'Girando…' : `Girar por ${e.costo_puntos} puntos`}
        </button>
      )}>
      {premios.isLoading || estado.isLoading ? <Cargando /> : lista.length === 0 ? (
        <p className="text-center text-tenue py-8"><Gift className="w-8 h-8 mx-auto mb-2" />La ruleta no tiene premios configurados.</p>
      ) : (
        <div className="space-y-4">
          <div className="px-4 pt-2"><Rueda premios={lista} rotacion={giro.rotacion} girando={giro.girando} ganadorId={ganado ? ganado.premio?.id : null} /></div>
          {ganado ? <TarjetaPremio ganado={ganado} nombreCliente={cliente.nombre} /> : (
            <>
              <LeyendaPremios premios={lista} />
              {e && <DatosGiro e={e} />}
              {e && !e.puede_girar && <p className="text-sm text-locoto text-center">{e.motivo_bloqueo}</p>}
            </>
          )}
        </div>
      )}
    </Hoja>
  );
}
