// Imprime un ticket HTML en un iframe oculto: a diferencia de window.open,
// el navegador no lo bloquea como ventana emergente.
export function imprimirHtml(html) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);
  const quitar = () => setTimeout(() => iframe.remove(), 1000);
  const doc = iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => {
    const win = iframe.contentWindow;
    win.addEventListener('afterprint', quitar, { once: true });
    win.focus(); win.print();
    setTimeout(quitar, 60000);
  }, 400);
}
