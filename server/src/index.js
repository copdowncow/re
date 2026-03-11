'use strict';
require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const { getClient }                = require('./db/supabase');
const { initBots, setupCallbacks, notifySellerApproved, notifySellerRejected, markExpiredInChannel } = require('./services/telegram');
const routes = require('./routes/index');

const app  = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // Доверяем прокси (Railway/Render/Nginx)

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

// ── Автоудаление просроченных объявлений ─────────────────
async function removeExpiredProducts() {
  try {
    const now = new Date().toISOString();
    // Сначала получаем просроченные чтобы отредактировать посты в канале
    const { data: expired, error: fetchErr } = await getClient()
      .from('products')
      .select('*')
      .in('category', ['bouquet', 'basket'])
      .lt('expires_at', now)
      .not('expires_at', 'is', null);

    if (fetchErr) { console.log('Expire check error:', fetchErr.message); return; }

    if (expired?.length) {
      // Редактируем посты в канале — меняем текст на "Снято с продажи"
      for (const p of expired) {
        await markExpiredInChannel(p).catch(() => {});
      }

      // Удаляем из БД
      const ids = expired.map(p => p.id);
      const { error: delErr } = await getClient()
        .from('products')
        .delete()
        .in('id', ids);

      if (delErr) { console.log('Delete error:', delErr.message); return; }
      console.log(`🗑  Удалено просроченных объявлений: ${expired.length}`);
    }
  } catch(e) {
    console.log('Expire check error:', e.message);
  }
}

async function start() {
  try {
    await getClient().from('products').select('id').limit(1);
    console.log('✅ Supabase подключён');
  } catch(e) {
    console.error('❌ Ошибка Supabase:', e.message);
  }

  initBots();

  setupCallbacks(
    async (id) => {
      await getClient().from('products').update({ status: 'active' }).eq('id', id);
      const { data } = await getClient().from('products').select('*').eq('id', id).single();
      if (data) notifySellerApproved(data).catch(() => {});
    },
    async (id) => {
      await getClient().from('products').update({ status: 'hidden' }).eq('id', id);
      const { data } = await getClient().from('products').select('*').eq('id', id).single();
      if (data) notifySellerRejected(data).catch(() => {});
    }
  );

  // Проверяем просроченные сразу при старте и затем каждые 30 минут
  await removeExpiredProducts();
  setInterval(removeExpiredProducts, 30 * 60 * 1000);

  app.listen(PORT, () => {
    console.log('');
    console.log('  🌸 ══════════════════════════════════════════');
    console.log(`  🌸  Rebuket запущен → http://localhost:${PORT}`);
    console.log(`  🔐  Панель Admin   → http://localhost:${PORT}/#admin`);
    console.log('  🌸 ══════════════════════════════════════════');
    console.log('');
  });
}

start();
