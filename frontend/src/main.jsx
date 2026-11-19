import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import './lib/instalarApp'; // guarda el aviso de instalación apenas llega

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// La pantalla de arranque (index.html) se va apenas React dibuja la app.
requestAnimationFrame(() => {
  const arranque = document.getElementById('arranque');
  if (!arranque) return;
  arranque.classList.add('fuera');
  setTimeout(() => arranque.remove(), 350);
});
