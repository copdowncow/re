'use strict';

const multer = require('multer');
const path = require('path');

// 📌 Разрешённые расширения
const allowedExt = [
  '.jpg', '.jpeg', '.png', '.webp',
  '.heic', '.heif',
  '.bmp', '.tiff', '.tif'
];

// 📌 Разрешённые MIME
const allowedMime = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/bmp',
  'image/tiff'
];

// 📌 Проверка файла
function fileFilter(req, file, cb) {
  try {
    const ext  = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;
    const extOk  = allowedExt.includes(ext);
    const mimeOk = allowedMime.includes(mime);
    if (extOk || mimeOk) return cb(null, true);
    return cb(new Error('Поддерживаются: JPG, PNG, WebP, HEIC, BMP, TIFF'));
  } catch (e) {
    return cb(new Error('Ошибка проверки файла'));
  }
}

const limits  = { fileSize: 10 * 1024 * 1024, files: 10 };
const storage = multer.memoryStorage();
const upload  = multer({ storage, limits, fileFilter });

// 📌 Обязательный — для создания объявления (минимум 3 фото)
function uploadMiddleware(req, res, next) {
  upload.array('photos', 10)(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE')  return res.status(400).json({ error: 'Файл слишком большой (макс 10MB)' });
      if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Слишком много файлов (макс 10)' });
      return res.status(400).json({ error: err.message });
    }
    if (err) return res.status(400).json({ error: err.message });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Файлы не загружены' });
    }
    next();
  });
}

// 📌 Опциональный — для обновления объявления (фото могут отсутствовать)
function uploadMiddlewareOptional(req, res, next) {
  upload.array('photos', 10)(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE')  return res.status(400).json({ error: 'Файл слишком большой (макс 10MB)' });
      if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Слишком много файлов (макс 10)' });
      return res.status(400).json({ error: err.message });
    }
    if (err) return res.status(400).json({ error: err.message });
    // Файлы необязательны — просто идём дальше
    next();
  });
}

module.exports = { uploadMiddleware, uploadMiddlewareOptional };
