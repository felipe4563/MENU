import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// El pedido en armado sobrevive a cambiar de pantalla o recargar la pestaña.
export const useCarrito = create(
  persist(
    (set) => ({
      lineas: [],
      destino: null, // { tipo: 'mesa', mesa } | { tipo: 'llevar', nombre } | { tipo: 'delivery', nombre, direccion, telefono }
      agregar: (l) => set((s) => {
        const i = s.lineas.findIndex((x) => x.clave === l.clave);
        if (i >= 0 && !l.peso) {
          const lineas = [...s.lineas];
          lineas[i] = { ...lineas[i], cantidad: lineas[i].cantidad + 1 };
          return { lineas };
        }
        return { lineas: [...s.lineas, { ...l, id: Math.random().toString(36).slice(2) }] };
      }),
      cambiar: (id, delta) => set((s) => ({
        lineas: s.lineas
          .map((l) => (l.id === id ? { ...l, cantidad: l.cantidad + delta } : l))
          .filter((l) => l.cantidad > 0),
      })),
      quitar: (id) => set((s) => ({ lineas: s.lineas.filter((l) => l.id !== id) })),
      setDestino: (destino) => set({ destino }),
      limpiar: () => set({ lineas: [], destino: null }),
    }),
    { name: 'carrito', storage: createJSONStorage(() => sessionStorage) },
  ),
);
