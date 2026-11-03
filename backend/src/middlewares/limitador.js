// Límite de pedidos por IP en una ventana de tiempo, en memoria (un solo
// proceso por restaurante). Frena que alguien pruebe contraseñas, PINs o
// cupones en masa, o mande correos de código sin parar.
// `clave` permite contar por algo más que la IP (ej. IP + correo en el login).
function limitador({ ventanaMs, maximo, mensaje, clave: claveExtra }) {
  const conteos = new Map(); // clave -> { n, desde }

  setInterval(() => {
    const ahora = Date.now();
    for (const [k, v] of conteos) if (ahora - v.desde > ventanaMs) conteos.delete(k);
  }, ventanaMs).unref();

  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test') return next();
    const clave = `${req.ip}|${req.baseUrl}${req.path}|${claveExtra ? claveExtra(req) : ''}`;
    const ahora = Date.now();
    let c = conteos.get(clave);
    if (!c || ahora - c.desde > ventanaMs) {
      c = { n: 0, desde: ahora };
      conteos.set(clave, c);
    }
    c.n += 1;
    if (c.n > maximo) {
      res.set('Retry-After', String(Math.ceil((c.desde + ventanaMs - ahora) / 1000)));
      return res.status(429).json({ ok: false, mensaje });
    }
    next();
  };
}

module.exports = limitador;
