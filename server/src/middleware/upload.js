'use strict';
const multer = require('multer');

const allowedMime = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/tiff',
  'image/bmp',
  'image/x-canon-cr2',
  'image/x-canon-cr3',
  'image/x-nikon-nef',
  'image/x-sony-arw',
  'image/x-fuji-raf',
  'image/x-adobe-dng'
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },

  fileFilter(req, file, cb) {
    const isAllowedMime = allowedMime.includes(file.mimetype);

    const ext = file.originalname.toLowerCase();
    const isAllowedExt = ext.match(/\.(jpg|jpeg|png|webp|heic|heif|bmp|tiff|tif|dng|cr2|cr3|nef|arw|raf)$/);

    if (isAllowedMime || isAllowedExt) {
      cb(null, true);
    } else {
      cb(new Error('Неподдерживаемый формат файла'));
    }
  }
});

module.exports = { upload };
