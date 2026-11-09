import { useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { cx } from '../../lib/util';
import Hoja from './Hoja';

export function Cargando({ texto = 'Cargando…', className }) {
  return (
    <div className={cx('flex items-center justify-center gap-2 py-16 text-tenue text-sm', className)}>
      <Loader2 className="w-4 h-4 animate-spin" /> {texto}
    </div>
  );
}

export function Vacio({ Icono, titulo, texto, accion, className }) {
  return (
    <div className={cx('flex flex-col items-center text-center py-14 px-6', className)}>
      {Icono && (
        <div className="w-14 h-14 rounded-2xl bg-hundido grid place-items-center mb-4">
          <Icono className="w-6 h-6 text-tenue" />
        </div>
      )}
      <p className="font-display text-lg font-semibold">{titulo}</p>
      {texto && <p className="text-sm text-tenue mt-1 max-w-sm">{texto}</p>}
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  );
}

export function Encabezado({ titulo, texto, acciones, children }) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3 mb-5">
      <div className="flex-1 min-w-[200px]">
        <h1 className="text-[28px] sm:text-[32px] font-bold leading-none">{titulo}</h1>
        {texto && <p className="text-tenue text-sm mt-1.5">{texto}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
      {children}
    </div>
  );
}

export function Pagina({ children, className }) {
  return <div className={cx('px-4 sm:px-6 lg:px-8 2xl:px-10 py-5 sm:py-7 w-full', className)}>{children}</div>;
}

export function Buscador({ valor, onCambio, placeholder = 'Buscar', className, autoFocus }) {
  return (
    <label className={cx('relative block', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tenue pointer-events-none" />
      <input
        className="campo pl-9 pr-9"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        type="search"
      />
      {valor && (
        <button type="button" onClick={() => onCambio('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-tenue" aria-label="Limpiar búsqueda">
          <X className="w-4 h-4" />
        </button>
      )}
    </label>
  );
}

export function Interruptor({ activo, onCambio, etiqueta, descripcion, disabled }) {
  return (
    <label className={cx('flex items-start gap-3 cursor-pointer select-none', disabled && 'opacity-50 pointer-events-none')}>
      <button
        type="button"
        role="switch"
        aria-checked={!!activo}
        onClick={() => onCambio(!activo)}
        className={cx('relative mt-0.5 w-11 h-6 rounded-full shrink-0 transition-colors', activo ? 'bg-hierba' : 'bg-linea')}
      >
        <span className={cx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', activo && 'translate-x-5')} />
      </button>
      {(etiqueta || descripcion) && (
        <span className="flex-1">
          {etiqueta && <span className="block text-sm font-medium">{etiqueta}</span>}
          {descripcion && <span className="block text-[13px] text-tenue">{descripcion}</span>}
        </span>
      )}
    </label>
  );
}

// Selector de opciones excluyentes en forma de pastillas.
export function Segmentado({ opciones, valor, onCambio, className, tamano = 'md' }) {
  return (
    <div className={cx('inline-flex p-1 rounded-xl bg-hundido gap-1 max-w-full overflow-x-auto sin-scroll', className)} role="tablist">
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={String(o.valor)}
            type="button"
            role="tab"
            aria-selected={activo}
            onClick={() => onCambio(o.valor)}
            className={cx(
              'shrink-0 inline-flex items-center gap-1.5 rounded-lg font-semibold transition whitespace-nowrap',
              tamano === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-3.5 text-sm',
              activo ? 'bg-papel text-tinta shadow-sm' : 'text-tenue hover:text-tinta',
            )}
          >
            {o.Icono && <o.Icono className="w-4 h-4" />}
            {o.etiqueta}
            {o.cuenta != null && <span className={cx('num text-xs rounded-full px-1.5', activo ? 'bg-aji text-sobre-aji' : 'bg-linea')}>{o.cuenta}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Campo({ etiqueta, ayuda, error, children, className }) {
  return (
    <div className={className}>
      {etiqueta && <span className="etiqueta">{etiqueta}</span>}
      {children}
      {error ? <p className="text-[13px] text-locoto mt-1">{error}</p> : ayuda && <p className="text-[13px] text-tenue mt-1">{ayuda}</p>}
    </div>
  );
}

export function Insignia({ tono = 'neutro', children, className, title }) {
  const tonos = {
    neutro: 'bg-hundido text-tenue',
    ok: 'bg-hierba/15 text-hierba',
    alerta: 'bg-aji/25 text-tinta',
    peligro: 'bg-locoto/12 text-locoto',
    info: 'bg-cielo/12 text-cielo',
    tinta: 'bg-tinta text-fondo',
  };
  return <span title={title} className={cx('chip', tonos[tono], className)}>{children}</span>;
}

// Confirmación reutilizable. Devuelve [elemento, pedir(opciones) => Promise<boolean>].
export function useConfirmar() {
  const [estado, setEstado] = useState(null);
  const pedir = (opts) => new Promise((resolve) => setEstado({ ...opts, resolve }));
  const cerrar = (v) => { estado?.resolve(v); setEstado(null); };
  const elemento = estado && (
    <Hoja
      onCerrar={() => cerrar(false)}
      titulo={estado.titulo}
      ancho="max-w-md"
      pie={(
        <>
          <button className="btn-suave" onClick={() => cerrar(false)}>{estado.cancelar ?? 'Volver'}</button>
          <button data-principal className={estado.peligro ? 'btn-peligro' : 'btn-aji'} onClick={() => cerrar(true)}>{estado.confirmar ?? 'Confirmar'}</button>
        </>
      )}
    >
      {estado.texto && <p className="text-[15px] text-tenue">{estado.texto}</p>}
    </Hoja>
  );
  return [elemento, pedir];
}

export function SinPermiso() {
  return <Vacio titulo="No tienes acceso a esta pantalla" texto="Pide a un administrador que te dé el permiso en Equipo › Roles." />;
}

export function Tarjeta({ titulo, acciones, children, className, cuerpo = 'p-4 sm:p-5' }) {
  return (
    <section className={cx('ficha', className)}>
      {(titulo || acciones) && (
        <header className="flex items-center gap-2 px-4 sm:px-5 pt-4">
          <h2 className="font-display font-semibold text-[17px] flex-1">{titulo}</h2>
          {acciones}
        </header>
      )}
      <div className={cuerpo}>{children}</div>
    </section>
  );
}

// Cifra destacada: número grande, etiqueta chica debajo.
export function Cifra({ valor, etiqueta, tono, pequeno }) {
  return (
    <div>
      <p className={cx('num font-bold leading-none', pequeno ? 'text-xl' : 'text-[28px]', tono === 'ok' && 'text-hierba', tono === 'peligro' && 'text-locoto')}>{valor}</p>
      <p className="text-[13px] text-tenue mt-1.5">{etiqueta}</p>
    </div>
  );
}

// Pide un texto corto en una hoja. Devuelve [elemento, pedir(opciones) => Promise<string|null>].
export function usePedirTexto() {
  const [estado, setEstado] = useState(null);
  const pedir = (opts) => new Promise((resolve) => setEstado({ ...opts, valor: opts.inicial ?? '', resolve }));
  const cerrar = (v) => { estado?.resolve(v); setEstado(null); };
  const elemento = estado && (
    <Hoja
      onCerrar={() => cerrar(null)}
      titulo={estado.titulo}
      ancho="max-w-sm"
      pie={<button data-principal className="btn-aji w-full" disabled={!estado.valor.trim()} onClick={() => cerrar(estado.valor.trim())}>{estado.confirmar ?? 'Guardar'}</button>}
    >
      <input
        autoFocus
        className="campo"
        placeholder={estado.placeholder}
        value={estado.valor}
        onChange={(e) => setEstado({ ...estado, valor: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && estado.valor.trim() && cerrar(estado.valor.trim())}
      />
    </Hoja>
  );
  return [elemento, pedir];
}
