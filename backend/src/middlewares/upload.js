const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DIR_UPLOADS = path.join(__dirname, '../../uploads');
if (!fs.existsSync(DIR_UPLOADS)) fs.mkdirSync(DIR_UPLOADS, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DIR_UPLOADS),
  // La extensión sale del tipo aceptado, nunca del nombre que manda el
  // navegador: así no se puede guardar un .html o .js con tipo "image/png".
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${EXTENSIONES[file.mimetype]}`);
  },
});

const EXTENSIONES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const fileFilter = (_req, file, cb) => {
  if (EXTENSIONES[file.mimetype]) cb(null, true);
  else cb(Object.assign(new Error('Solo se permiten imágenes (jpg, png, webp, gif)'), { status: 400 }));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

module.exports = upload;
