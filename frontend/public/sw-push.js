// Notificaciones push. El service worker que arma vite-plugin-pwa (sw.js)
// carga este archivo con importScripts (ver vite.config.js): los avisos
// llegan aunque la app esté cerrada.
// El servidor manda: { titulo, cuerpo, url, etiqueta } (backend/src/modules/push).

self.addEventListener('push', (event) => {
  let d;
  try { d = event.data ? event.data.json() : {}; } catch { d = { cuerpo: event.data && event.data.text() }; }
  const opciones = {
    body: d.cuerpo || '',
    icon: '/api/v1/pwa/icono/192',
    data: { url: d.url || '/' },
  };
  // Con etiqueta, un aviso nuevo del mismo pedido reemplaza al anterior y vuelve a sonar.
  if (d.etiqueta) { opciones.tag = d.etiqueta; opciones.renotify = true; }
  event.waitUntil(self.registration.showNotification(d.titulo || 'Aviso', opciones));
});

// Al tocar el aviso: si la app ya está abierta se trae al frente y va a la
// pantalla del aviso; si no, se abre.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const abierta = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
    if (abierta) {
      await abierta.focus();
      if ('navigate' in abierta) return abierta.navigate(url).catch(() => abierta.postMessage({ tipo: 'ir', url }));
      return abierta.postMessage({ tipo: 'ir', url });
    }
    return self.clients.openWindow(url);
  })());
});
