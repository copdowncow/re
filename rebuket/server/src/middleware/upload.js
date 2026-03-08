'use strict';
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 мб
  fileFilter(req, file, cb) {
    const ok = ['image/jpeg','image/jpg','image/png','image/webp'].includes(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Только JPG, PNG, WebP'));
  }
});

module.exports = { upload };
