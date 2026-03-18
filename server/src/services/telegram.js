'use strict';

const TG = require('node-telegram-bot-api');

let userBot  = null;
let adminBot = null;

const adminChatIds = new Set();

const KHUJAND_CITIES = ['худжанд', 'бустон', 'исфара'];

function getMiniAppUrl() {
  return (process.env.MINI_APP_URL || process.env.SITE_URL || '').replace(/\/$/, '');
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getProductCode(num, prefix) {
  if (!num) return null;
  return prefix + '-' + String(Number(num)).padStart(4, '0');
}

// Счётчики в файле — надёжно и без зависимости от БД
const fs   = require('fs');
const path = require('path');
const COUNTER_FILE = path.join(__dirname, 'counters.json');

function readCounters() {
  try {
    if (fs.existsSync(COUNTER_FILE)) {
      return JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
    }
  } catch(e) {}
  // Читаем стартовые значения из env переменных
  return {
    dushanbe: Number(process.env.COUNTER_DUSHANBE) || 872,
    khujand:  Number(process.env.COUNTER_KHUJAND)  || 23
  };
}

function writeCounters(data) {
  try {
    fs.writeFileSync(COUNTER_FILE, JSON.stringify(data), 'utf8');
  } catch(e) {
    // В Railway нет доступа к файловой системе — игнорируем
  }
}

function getNextSerial(channel) {
  const counters = readCounters();
  const DEFAULTS = {
    dushanbe: Number(process.env.COUNTER_DUSHANBE) || 872,
    khujand:  Number(process.env.COUNTER_KHUJAND)  || 23
  };
  if (counters[channel] === undefined) {
    counters[channel] = DEFAULTS[channel];
  }
  counters[channel] += 1;
  writeCounters(counters);
  console.log(`[getNextSerial] channel=${channel} next=${counters[channel]}`);
  return counters[channel];
}

function initBots() {
  if (process.env.ADMIN_CHAT_ID_1) adminChatIds.add(process.env.ADMIN_CHAT_ID_1);
  if (process.env.ADMIN_CHAT_ID_2) adminChatIds.add(process.env.ADMIN_CHAT_ID_2);
  if (process.env.ADMIN_CHAT_ID)   adminChatIds.add(process.env.ADMIN_CHAT_ID);
  initUserBot();
  initAdminBot();
}

function initUserBot() {
  const token = process.env.BOT_TOKEN_USER;
  if (!token) { console.log('BOT_TOKEN_USER не задан'); return; }
  userBot = new TG(token, { polling: true });

  userBot.onText(/\/start/, async (msg) => {
    const name   = msg.from?.first_name || 'друг';
    const appUrl = getMiniAppUrl();
    await userBot.sendMessage(msg.chat.id,
      `🌸 <b>Привет, ${escHtml(name)}!</b>\n\nДобро пожаловать в <b>ReBuket</b> — маркетплейс букетов и сладостей в Таджикистане.\n\n💐 <b>Купить</b> — просматривать букеты, корзины, игрушки и сладости\n🛍 <b>Продать</b> — разместить своё объявление\n📩 <b>Связаться</b> — оставить заявку продавцу\n\n👇 Нажмите кнопку ниже чтобы открыть каталог:`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🌸 Открыть ReBuket', web_app: { url: appUrl } }]] } }
    );
  });

  userBot.onText(/\/catalog/, async (msg) => {
    await userBot.sendMessage(msg.chat.id, `💐 <b>Каталог ReBuket</b>\n\nБукеты, корзины, игрушки и сладости:`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '💐 Смотреть каталог', web_app: { url: getMiniAppUrl() + '#catalog' } }]] } }
    );
  });

  userBot.onText(/\/sell/, async (msg) => {
    await userBot.sendMessage(msg.chat.id, `🛍 <b>Разместить объявление</b>\n\nПродайте букеты или сладости через ReBuket!`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '➕ Разместить объявление', web_app: { url: getMiniAppUrl() + '#sell' } }]] } }
    );
  });

  userBot.onText(/\/help/, async (msg) => {
    await userBot.sendMessage(msg.chat.id,
      `🌸 <b>ReBuket — помощь</b>\n\n/start   — запустить бота\n/catalog — каталог\n/sell    — разместить объявление\n/help    — эта справка`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🌸 Открыть ReBuket', web_app: { url: getMiniAppUrl() } }]] } }
    );
  });

  userBot.on('message', async (msg) => {
    if (msg.text?.startsWith('/')) return;
    await userBot.sendMessage(msg.chat.id, `Нажмите кнопку ниже чтобы открыть ReBuket 🌸`,
      { reply_markup: { inline_keyboard: [[{ text: '🌸 Открыть ReBuket', web_app: { url: getMiniAppUrl() } }]] } }
    );
  });

  userBot.on('polling_error', (err) => {
    if (!err.message?.includes('409')) console.log('USER BOT error:', err.message);
  });

  console.log('🤖 USER BOT запущен | Mini App:', getMiniAppUrl());
}

function initAdminBot() {
  const token = process.env.BOT_TOKEN_ADMIN;
  if (!token) { console.log('BOT_TOKEN_ADMIN не задан'); return; }
  adminBot = new TG(token, { polling: true });

  adminBot.onText(/\/start/, async (msg) => {
    const chatId = String(msg.chat.id);
    const isNew  = !adminChatIds.has(chatId);
    adminChatIds.add(chatId);
    await adminBot.sendMessage(msg.chat.id,
      `🔐 <b>ReBuket Admin Bot</b>\n\n` +
      (isNew ? `✅ Ваш Chat ID <b>${chatId}</b> добавлен.\nТеперь вы будете получать уведомления.`
             : `Вы уже подключены. Ваш Chat ID: <b>${chatId}</b>`),
      { parse_mode: 'HTML' }
    );
    if (isNew) console.log(`✅ Новый админ: ADMIN_CHAT_ID_1=${chatId}`);
  });

  adminBot.on('polling_error', (err) => {
    if (!err.message?.includes('409')) console.log('ADMIN BOT error:', err.message);
  });

  console.log('🛠  ADMIN BOT запущен');
}

async function sendToAdmins(text, opts = {}) {
  if (!adminBot) return;
  if (!adminChatIds.size) { console.log('⚠️ Нет админов'); return; }
  for (const chatId of adminChatIds) {
    try {
      await adminBot.sendMessage(chatId, text, { parse_mode: 'HTML', ...opts });
    } catch(e) {
      console.log(`ADMIN BOT send error (${chatId}):`, e.message);
    }
  }
}

// ─────────────────────────────────────────────
//  Публикация в канал при одобрении
// ─────────────────────────────────────────────
async function publishToChannel(p) {
  const city      = (p.city || '').toLowerCase().trim();
  const isKhujand = KHUJAND_CITIES.includes(city);
  const channelId = isKhujand
    ? (process.env.CHANNEL_ID_KHUJAND || '-1003818624807')
    : process.env.CHANNEL_ID;

  console.log(`[publishToChannel] city="${city}" isKhujand=${isKhujand} channelId=${channelId}`);

  if (!channelId) {
    console.log('[publishToChannel] CHANNEL_ID не задан в .env');
    return;
  }

  const bot = userBot || adminBot;
  if (!bot) {
    console.log('[publishToChannel] Нет активного бота');
    return;
  }

  const EMOJIS = { bouquet:'💐', basket:'🧺', bear:'🧸', sweets:'🍰' };
  const em     = EMOJIS[p.category] || '🌸';
  const desc   = p.description ? p.description.substring(0, 200) + (p.description.length > 200 ? '...' : '') : '';
  const price  = Math.ceil(Number(p.price) * 1.20).toLocaleString('ru-RU');
  const admin  = process.env.ADMIN_TELEGRAM
    ? process.env.ADMIN_TELEGRAM.replace('https://t.me/', '@')
    : '@rebuket_admin';
  const url    = `${getMiniAppUrl()}/#product-${p.slug || p.id}`;
  const photos = Array.isArray(p.photos) ? p.photos.filter(Boolean).map(ph => ph.split('?')[0]) : [];

  const serialNum = await getNextSerial(isKhujand ? 'khujand' : 'dushanbe');
  const code      = getProductCode(serialNum, isKhujand ? 'AK' : 'AB');

  const caption =
    `${em} <b>${escHtml(p.title)}</b>\n` +
    `📍 ${escHtml(p.city)}\n` +
    (desc ? `🌸 ${escHtml(desc)}\n` : '') +
    `💰 Наша цена: <b>${price} сомони</b>\n` +
    `❓ По вопросам: ${admin}\n` +
    (code ? `🆔 ${code}` : '') +
    `\n\n<a href="${url}">Смотреть объявление на ReBuket</a>`;

  try {
    let sent = null;
    if (photos.length === 0) {
      sent = await bot.sendMessage(channelId, caption, { parse_mode: 'HTML' });
    } else if (photos.length === 1) {
      sent = await bot.sendPhoto(channelId, photos[0], { caption, parse_mode: 'HTML' });
    } else {
      const media = photos.slice(0, 10).map((ph, i) => ({
        type: 'photo',
        media: ph,
        ...(i === 0 ? { caption, parse_mode: 'HTML' } : {})
      }));
      const results = await bot.sendMediaGroup(channelId, media);
      sent = Array.isArray(results) ? results[0] : results;
    }

    try {
      const { createClient } = require('@supabase/supabase-js');
      const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      if (sent?.message_id) {
        await db.from('products').update({
          channel_message_id: sent.message_id,
          channel_name: isKhujand ? 'khujand' : 'dushanbe'
        }).eq('id', p.id);
      }
    } catch(e) {
      console.log('Не удалось сохранить message_id:', e.message);
    }

    console.log(`📢 Опубликовано в канал: ${p.title} [${code}]`);
  } catch(e) {
    console.log('[publishToChannel] Ошибка:', e.message);
  }
}

// ─────────────────────────────────────────────
//  Пометить истёкшие посты в канале
// ─────────────────────────────────────────────
async function markExpiredInChannel(p) {
  const bot = userBot || adminBot;
  if (!bot || !p.channel_message_id || !p.channel_name) return;

  const channelId = p.channel_name === 'khujand'
    ? (process.env.CHANNEL_ID_KHUJAND || '-1003818624807')
    : process.env.CHANNEL_ID;
  if (!channelId) return;

  const EMOJIS = { bouquet:'💐', basket:'🧺', bear:'🧸', sweets:'🍰' };
  const em     = EMOJIS[p.category] || '🌸';
  const price  = Math.ceil(Number(p.price) * 1.20).toLocaleString('ru-RU');
  const admin  = process.env.ADMIN_TELEGRAM
    ? process.env.ADMIN_TELEGRAM.replace('https://t.me/', '@')
    : '@rebuket_admin';

  const newCaption =
    `🔴 <b>СНЯТО С ПРОДАЖИ</b>\n\n` +
    `${em} <b>${escHtml(p.title)}</b>\n` +
    `📍 ${escHtml(p.city)}\n` +
    `💰 Цена была: <b>${price} сомони</b>\n\n` +
    `❓ По вопросам: ${admin}`;

  try {
    await bot.editMessageCaption(newCaption, {
      chat_id:    channelId,
      message_id: p.channel_message_id,
      parse_mode: 'HTML'
    });
    console.log(`🔴 Пост помечен как снято: ${p.title}`);
  } catch(e) {
    console.log('Ошибка редактирования поста:', e.message);
  }
}

// ─────────────────────────────────────────────
//  Уведомление продавцу — одобрено
// ─────────────────────────────────────────────
async function notifySellerApproved(p) {
  publishToChannel(p).catch(e => console.log('Channel publish error:', e.message));
  if (!userBot || !p.seller_chat_id) return;
  const url = `${getMiniAppUrl()}/#product-${p.slug || p.id}`;
  try {
    await userBot.sendMessage(p.seller_chat_id,
      `🎉 <b>Ваше объявление одобрено!</b>\n\n📦 <b>${escHtml(p.title)}</b>\n💰 ${p.price} TJS · 📍 ${escHtml(p.city)}\n\nТеперь его видят все покупатели. Удачных продаж! 🌸`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🔗 Открыть моё объявление', web_app: { url } }]] } }
    );
  } catch(e) {
    console.log('Не удалось уведомить продавца:', e.message);
  }
}

// ─────────────────────────────────────────────
//  Уведомление продавцу — отклонено
// ─────────────────────────────────────────────
async function notifySellerRejected(p) {
  if (!userBot || !p.seller_chat_id) return;
  try {
    await userBot.sendMessage(p.seller_chat_id,
      `❌ <b>Ваше объявление отклонено</b>\n\n📦 <b>${escHtml(p.title)}</b>\n\nК сожалению, объявление не прошло модерацию.\nВы можете разместить новое объявление:`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '➕ Разместить новое', web_app: { url: getMiniAppUrl() + '#sell' } }]] } }
    );
  } catch(e) {
    console.log('Не удалось уведомить продавца:', e.message);
  }
}

// ─────────────────────────────────────────────
//  Уведомление — новое объявление (для админов)
// ─────────────────────────────────────────────
const CATS = { bouquet:'💐 Букет', basket:'🧺 Корзина', bear:'🧸 Игрушки', sweets:'🍰 Сладости' };

async function notifyProduct(p) {
  const url = `${getMiniAppUrl()}/#product-${p.slug || p.id}`;
  await sendToAdmins(
    `📦 <b>Новое объявление на проверке!</b>\n─────────────────\n` +
    `${CATS[p.category] || p.category}: <b>${escHtml(p.title)}</b>\n` +
    `💰 ${p.price} TJS · 📍 ${escHtml(p.city)}\n` +
    `👤 ${escHtml(p.seller_name || '—')} · 📞 ${escHtml(p.seller_phone)}\n` +
    `✈️ ${escHtml(p.seller_telegram || '—')}\n` +
    `🔗 <a href="${url}">Открыть объявление</a>`,
    {
      reply_markup: { inline_keyboard: [
        [{ text: '✅ Одобрить', callback_data: `approve:${p.id}` }, { text: '❌ Отклонить', callback_data: `reject:${p.id}` }],
        [{ text: '🔗 Открыть объявление', url }]
      ]}
    }
  );
}

// ─────────────────────────────────────────────
//  Уведомление — новая заявка (для админов)
// ─────────────────────────────────────────────
async function notifyInquiry(inq, productTitle, productSlug, productId) {
  const url = (productSlug || productId)
    ? `${getMiniAppUrl()}/#product-${productSlug || productId}`
    : null;
  await sendToAdmins(
    `🛒 <b>Новая заявка!</b>\n─────────────────\n` +
    `📦 ${escHtml(productTitle || '—')}\n` +
    `👤 ${escHtml(inq.customer_name || '—')}\n` +
    `📞 <b>${escHtml(inq.customer_phone)}</b>\n` +
    `✈️ ${escHtml(inq.customer_telegram || '—')}\n` +
    `📝 ${escHtml(inq.note || '—')}` +
    (url ? `\n🔗 <a href="${url}">Открыть объявление</a>` : ''),
    url ? { reply_markup: { inline_keyboard: [[{ text: '🔗 Открыть объявление', url }]] } } : {}
  );
}

// ─────────────────────────────────────────────
//  Callback: Одобрить / Отклонить
// ─────────────────────────────────────────────
function setupCallbacks(onApprove, onReject) {
  if (!adminBot) return;
  adminBot.on('callback_query', async (q) => {
    const [action, id] = (q.data || '').split(':');
    if (action === 'approve') {
      await onApprove(id);
      await adminBot.answerCallbackQuery(q.id, { text: '✅ Одобрено!' });
      await adminBot.editMessageReplyMarkup(
        { inline_keyboard: [[{ text: '✅ Одобрено', callback_data: 'done' }]] },
        { chat_id: q.message.chat.id, message_id: q.message.message_id }
      ).catch(() => {});
    }
    if (action === 'reject') {
      await onReject(id);
      await adminBot.answerCallbackQuery(q.id, { text: '❌ Отклонено' });
      await adminBot.editMessageReplyMarkup(
        { inline_keyboard: [[{ text: '❌ Отклонено', callback_data: 'done' }]] },
        { chat_id: q.message.chat.id, message_id: q.message.message_id }
      ).catch(() => {});
    }
  });
}

async function notifyBuyerInquirySent(d) {
  if (!userBot || !d.customer_chat_id) return;
  try {
    const COMM = 0.20;
    const price = d.productPrice
      ? Math.ceil(Number(d.productPrice) * (1 + COMM)).toLocaleString('ru-RU') + ' сомони'
      : null;

    const url = (d.productSlug || d.productId)
      ? getMiniAppUrl() + '/#product-' + (d.productSlug || d.productId)
      : getMiniAppUrl();

    const adminHandle = (process.env.ADMIN_TELEGRAM || 'https://t.me/Rebuket_admin')
      .replace('https://t.me/', '').replace('@', '').trim();

    const parts = [
      '\u{1F338} \u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435! \u0425\u043E\u0447\u0443 \u043A\u0443\u043F\u0438\u0442\u044C:',
      '',
      '\u{1F4E6} ' + (d.productTitle || '—'),
      '\u{1F4DE} \u041C\u043E\u0439 \u0442\u0435\u043B\u0435\u0444\u043E\u043D: ' + d.customer_phone
    ];
    if (d.customer_name)     parts.push('\u{1F464} \u0418\u043C\u044F: ' + d.customer_name);
    if (d.customer_telegram) parts.push('\u2708\uFE0F Telegram: ' + d.customer_telegram);
    if (d.note)              parts.push('\u{1F4DD} \u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439: ' + d.note);
    parts.push('', '\u{1F517} ' + url);

    const readyText = parts.join('\n');
    const tgLink = 'https://t.me/' + adminHandle + '?text=' + encodeURIComponent(readyText);

    const text = '\u2705 <b>\u0412\u0430\u0448\u0430 \u0437\u0430\u044F\u0432\u043A\u0430 \u043F\u0440\u0438\u043D\u044F\u0442\u0430!</b>\n\n' +
      '\u{1F4E6} ' + escHtml(d.productTitle || '—') + '\n' +
      (price ? '\u{1F4B0} ' + price + '\n' : '') +
      '\n\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0443 \u043D\u0438\u0436\u0435 \u2014 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0443\u0436\u0435 \u0433\u043E\u0442\u043E\u0432\u043E, \u043E\u0441\u0442\u0430\u043D\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0430\u0436\u0430\u0442\u044C \u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C.';

    await userBot.sendMessage(d.customer_chat_id, text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '\u2708\uFE0F \u041D\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0443', url: tgLink }
        ]]
      }
    });
  } catch(e) {
    console.log('notifyBuyerInquirySent error:', e.message);
  }
}


module.exports = {
  initBots,
  notifyProduct,
  notifyInquiry,
  notifySellerApproved,
  notifySellerRejected,
  notifyBuyerInquirySent,
  markExpiredInChannel,
  setupCallbacks
};
