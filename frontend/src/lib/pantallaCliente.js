// Pantalla para el cliente: una segunda ventana del mismo navegador (en la
// misma computadora de la caja, arrastrada al segundo monitor) que muestra lo
// que se va pidiendo, el total y el QR para pagar. Se comunican con un
// BroadcastChannel: no pasa nada por el servidor.
//
// Mensajes:
//   { tipo: 'comanda', lineas: [{ id, nombre, cantidad, detalle, imagen, subtotal }], total }
//   { tipo: 'vitrina', productos: [{ nombre, precio, imagen }] }  fotos para la espera
//   { tipo: 'cobro', aPagar, etiqueta }      se abrió el cobro
//   { tipo: 'qr', qr_code, monto }           QR a la vista
//   { tipo: 'gracias', cobrado, cambio }     cobro terminado
//   { tipo: 'fin_cobro' } / { tipo: 'fin_qr' } se cerró esa parte
//   { tipo: 'hola' }                          la pantalla se abrió: pide el estado
import { useEffect } from 'react';

const NOMBRE = 'pantalla-cliente';
const canal = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(NOMBRE) : null;

// Lo último publicado desde esta pestaña, para contestarle a una pantalla
// que se abre después.
let ultimaComanda = null;
let ultimoOverlay = null;
let ultimaVitrina = null;

export function publicarPantalla(msg) {
  if (!canal) return;
  if (msg.tipo === 'comanda') ultimaComanda = msg;
  else if (msg.tipo === 'vitrina') ultimaVitrina = msg;
  else if (['cobro', 'qr', 'gracias'].includes(msg.tipo)) ultimoOverlay = msg;
  else if (msg.tipo === 'fin_cobro' && ultimoOverlay?.tipo === 'cobro') ultimoOverlay = null;
  else if (msg.tipo === 'fin_qr' && ultimoOverlay?.tipo === 'qr') ultimoOverlay = null;
  canal.postMessage(msg);
}

if (canal) {
  canal.addEventListener('message', (e) => {
    if (e.data?.tipo !== 'hola') return;
    if (ultimaVitrina) canal.postMessage(ultimaVitrina);
    if (ultimaComanda) canal.postMessage(ultimaComanda);
    if (ultimoOverlay && ultimoOverlay.tipo !== 'gracias') canal.postMessage(ultimoOverlay);
  });
}

// Para la ventana de la pantalla: escucha y pide el estado al abrirse.
export function escucharPantalla(manejador) {
  if (!canal) return () => {};
  const fn = (e) => manejador(e.data);
  canal.addEventListener('message', fn);
  canal.postMessage({ tipo: 'hola' });
  return () => canal.removeEventListener('message', fn);
}

// Publica `msg` cada vez que cambia `clave`, y `alSalir` al desmontar.
export function usePantalla(msg, clave, alSalir) {
  useEffect(() => {
    if (msg) publicarPantalla(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  useEffect(() => () => { if (alSalir) publicarPantalla(alSalir); }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

export const abrirPantallaCliente = () => window.open('/pantalla-cliente', NOMBRE, 'popup,width=1024,height=700');
