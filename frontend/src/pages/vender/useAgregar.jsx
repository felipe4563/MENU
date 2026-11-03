import { useState } from 'react';
import HojaOpciones from './HojaOpciones';
import HojaPeso from './HojaPeso';
import { calcularPrecioPesable } from '../../utils/precio';
import { claveCombo, contenidoCombo, extraOpcionesCombo } from './datosCatalogo';

// Resuelve lo que hace falta preguntar antes de agregar algo (peso, opciones,
// opciones de cada producto de un combo) y entrega una línea lista:
// { clave, producto_id|combo_id, nombre, precio, cantidad, nota, peso, opcion_ids, opciones_por_producto, detalle }
export function useAgregar({ precioDe, onAgregar }) {
  const [opciones, setOpciones] = useState(null);
  const [peso, setPeso] = useState(null);
  const [cola, setCola] = useState(null); // { combo, pendientes, resueltas }

  const producto = (p) => {
    if (!p.disponible_hoy) return;
    if (p.es_pesable) return setPeso(p);
    if (p.grupos_opciones?.length) return setOpciones(p);
    onAgregar({ clave: `p${p.id}|`, producto_id: p.id, nombre: p.nombre, precio: precioDe(p), cantidad: 1, nota: null, opcion_ids: [] });
  };

  const terminarCombo = (combo, resueltas) => {
    const clave = claveCombo(resueltas);
    onAgregar({
      clave: `c${combo.id}|${clave}`,
      combo_id: combo.id,
      nombre: combo.nombre,
      precio: parseFloat(combo.precio) + extraOpcionesCombo(combo, resueltas),
      cantidad: 1,
      nota: null,
      opciones_por_producto: resueltas,
      detalle: contenidoCombo(combo),
    });
  };

  const combo = (c) => {
    const pendientes = (c.productos || []).filter((p) => p.grupos_opciones?.length);
    if (!pendientes.length) return terminarCombo(c, []);
    setCola({ combo: c, pendientes, resueltas: [] });
  };

  const hojas = (
    <>
      {opciones && (
        <HojaOpciones
          producto={opciones}
          precioBase={precioDe(opciones)}
          onCerrar={() => setOpciones(null)}
          onElegir={(s) => {
            const p = opciones;
            setOpciones(null);
            onAgregar({
              clave: `p${p.id}|${[...s.opcionIds].sort().join(',')}|${s.nota ?? ''}`,
              producto_id: p.id, nombre: p.nombre, precio: precioDe(p) + s.extra, cantidad: 1, nota: s.nota, opcion_ids: s.opcionIds,
            });
          }}
        />
      )}
      {peso && (
        <HojaPeso
          producto={peso}
          precioKg={precioDe(peso)}
          onCerrar={() => setPeso(null)}
          onElegir={(kg) => {
            const p = peso;
            setPeso(null);
            onAgregar({
              clave: `p${p.id}|peso|${Math.random()}`,
              producto_id: p.id, nombre: p.nombre, precio: calcularPrecioPesable(kg, precioDe(p)), cantidad: 1, peso: kg, nota: null,
            });
          }}
        />
      )}
      {cola && (
        <HojaOpciones
          key={cola.pendientes[0].id}
          producto={cola.pendientes[0]}
          subtitulo={`Combo ${cola.combo.nombre} · ${cola.resueltas.length + 1} de ${cola.resueltas.length + cola.pendientes.length}`}
          precioBase={null}
          onCerrar={() => setCola(null)}
          onElegir={(s) => {
            const [actual, ...resto] = cola.pendientes;
            const resueltas = [...cola.resueltas, { producto_id: actual.id, opcion_ids: s.opcionIds }];
            if (!resto.length) { setCola(null); terminarCombo(cola.combo, resueltas); } else setCola({ ...cola, pendientes: resto, resueltas });
          }}
        />
      )}
    </>
  );

  return { producto, combo, hojas };
}
