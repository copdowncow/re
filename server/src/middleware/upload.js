'use strict';

const multer = require('multer');
const path = require('path');

// 📌 Разрешённые расширения (реально используемые)
const allowedExt = [
  '.jpg', '.jpeg', '.png', '.webp',
  '.heic', '.heif',
  '.bmp', '.tiff', '.tif'
];

// 📌 Разрешённые MIME (но не полагаемся только на них)
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
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;

    const extOk = allowedExt.includes(ext);
    const mimeOk = allowedMime.includes(mime);

    // ⚠️ иногда mime кривой → разрешаем если совпадает хотя бы одно
    if (extOk || mimeOk) {
      return cb(null, true);
    }

    return cb(new Error('Поддерживаются: JPG, PNG, WebP, HEIC, BMP, TIFF'));

  } catch (e) {
    return cb(new Error('Ошибка проверки файла'));
  }
}

// 📌 Ограничения
const limits = {
  fileSize: 10 * 1024 * 1024, // 10MB
  files: 10 // максимум 10 файлов
};

// 📌 Хранилище (в памяти → потом обрабатываешь через sharp)
const storage = multer.memoryStorage();

// 📌 Сам upload
const upload = multer({
  storage,
  limits,
  fileFilter
});

// 📌 Обёртка для нормальных ошибок (важно!)
function uploadMiddleware(req, res, next) {
  upload.array('photos', 10)(req, res, function (err) {

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Файл слишком большой (макс 10MB)' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Слишком много файлов (макс 10)' });
      }
      return res.status(400).json({ error: err.message });
    }

    if (err) {
      return res.status(400).json({ error: err.message });
    }

    // 📌 дополнительная защита — проверка что файлы вообще есть
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Файлы не загружены' });
    }

    next();
  });
}

module.exports = { uploadMiddleware };
