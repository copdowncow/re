'use strict';

const TG = require('node-telegram-bot-api');

let userBot  = null;
let adminBot = null;

const adminChatIds = new Set();

// Города которые публикуются в канал Худжанда
const KHUJAND_CITIES = ['худжанд', 'чкаловск', 'исфара'];

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

async function getNextSerial(channel) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const db   = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data } = await db.from('channel_counters').select('value').eq('channel', channel).single();
    const next = (data?.value || 0) + 1;
    await db.from('channel_counters').upsert({ channel, value: next });
    return next;
  } catch(e) {
    console.log('Serial counter error:', e.message);
    return null;
  }
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
  if (!channelId) return;

  const bot = userBot || adminBot;
  if (!bot) return;

  const EMOJIS = { bouquet:'💐', basket:'🧺', bear:'🧸', sweets:'🍰' };
  const em     = EMOJIS[p.category] || '🌸';
  const desc   = p.description ? p.description.substring(0, 200) + (p.description.length > 200 ? '...' : '') : '';
  const price  = Number(p.price).toLocaleString('ru-RU');
  const admin  = process.env.ADMIN_TELEGRAM
    ? process.env.ADMIN_TELEGRAM.replace('https://t.me/', '@')
    : '@rebuket_admin';
  const url    = `${getMiniAppUrl()}/#product-${p.slug || p.id}`;
  const photos = Array.isArray(p.photos) ? p.photos.filter(Boolean) : [];

  const serialNum = await getNextSerial(isKhujand ? 'khujand' : 'dushanbe');
  const code      = getProductCode(serialNum, isKhujand ? 'AK' : 'AB');

  const caption =
    `${em} <b>${escHtml(p.title)}</b>\n` +
    `📍 ${escHtml(p.city)}\n` +
    (desc ? `🕒 ${escHtml(desc)}\n` : '') +
    `💰 Наша цена: <b>${price} сомони</b>\n` +
    (p.address     ? `🏠 ${escHtml(p.address)}\n`     : '') +
    (p.pickup_time ? `⏰ ${escHtml(p.pickup_time)}\n`  : '') +
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
    console.log('Ошибка публикации в канал:', e.message);
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
  const price  = Number(p.price).toLocaleString('ru-RU');
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

module.exports = {
  initBots,
  notifyProduct,
  notifyInquiry,
  notifySellerApproved,
  notifySellerRejected,
  markExpiredInChannel,
  setupCallbacks
};
