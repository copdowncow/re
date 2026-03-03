'use strict';
require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const { getClient }       = require('./db/supabase');
const { initBot, setupCallbacks } = require('./services/telegram');
const routes = require('./routes/index');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: '*' }));
app.use(rateLimit({ windowMs: 15*60*1000, max: 500, standardHeaders: true, legacyHeaders: false }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const CLIENT_DIR = path.join(__dirname, '../../client');
app.use(express.static(CLIENT_DIR));

app.get('/api/config', (req, res) => res.json({
  instagram: process.env.ADMIN_INSTAGRAM || 'https://instagram.com/rebuket',
  telegram:  process.env.ADMIN_TELEGRAM  || 'https://t.me/rebuket_admin',
}));

app.use('/api', routes);

app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Файл слишком большой (макс 10 МБ)' });
  console.error('❌', err.message);
  res.status(500).json({ error: err.message || 'Ошибка сервера' });
});

app.get('*', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'index.html')));

async function start() {
  try {
    await getClient().from('products').select('id').limit(1);
    console.log('✅ Supabase подключён');
  } catch(e) {
    console.error('❌ Ошибка Supabase:', e.message);
    console.error('   Проверьте SUPABASE_URL и SUPABASE_SERVICE_KEY в .env');
  }

  initBot();
  setupCallbacks(
    async (id) => { await getClient().from('products').update({ status:'active' }).eq('id', id); },
    async (id) => { await getClient().from('products').update({ status:'hidden' }).eq('id', id); }
  );

  app.listen(PORT, () => {
    console.log('');
    console.log('  🌸 ══════════════════════════════════════════');
    console.log(`  🌸  ReBuket запущен → http://localhost:${PORT}`);
    console.log(`  🔐  Панель Admin   → http://localhost:${PORT}/#admin`);
    console.log('  🌸 ══════════════════════════════════════════');
    console.log('');
  });
}

start();
