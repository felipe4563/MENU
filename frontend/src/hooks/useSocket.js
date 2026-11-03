import { useEffect, useRef } from 'react';
import socket from '../socket';

// Escucha un evento de socket mientras el componente está montado.
export function useSocket(evento, manejador) {
  const ref = useRef(manejador);
  useEffect(() => { ref.current = manejador; });
  useEffect(() => {
    const fn = (...a) => ref.current(...a);
    socket.on(evento, fn);
    return () => socket.off(evento, fn);
  }, [evento]);
}
