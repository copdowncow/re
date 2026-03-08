'use strict';

const TG = require('node-telegram-bot-api');

let userBot  = null;
let adminBot = null;

// Список chat_id админов — заполняется автоматически когда пишут /start
// или берётся из .env
const adminChatIds = new Set();

function getMiniAppUrl() {
  return (process.env.MINI_APP_URL || process.env.SITE_URL || '').replace(/\/$/, '');
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────
//  Инициализация
// ─────────────────────────────────────────────
function initBots() {

  // Загружаем chat_id из .env
  if (process.env.ADMIN_CHAT_ID_1) adminChatIds.add(process.env.ADMIN_CHAT_ID_1);
  if (process.env.ADMIN_CHAT_ID_2) adminChatIds.add(process.env.ADMIN_CHAT_ID_2);
  if (process.env.ADMIN_CHAT_ID)   adminChatIds.add(process.env.ADMIN_CHAT_ID);

  initUserBot();
  initAdminBot();
}

// ─────────────────────────────────────────────
//  USER BOT — для пользователей / мини-апп
// ─────────────────────────────────────────────
function initUserBot() {
  const token = process.env.BOT_TOKEN_USER;
  if (!token) { console.log('ℹ️  BOT_TOKEN_USER не задан — user bot отключён'); return; }

  userBot = new TG(token, { polling: true });

  userBot.onText(/\/start/, async (msg) => {
    const name   = msg.from?.first_name || 'друг';
    const appUrl = getMiniAppUrl();

    await userBot.sendMessage(msg.chat.id,
      `🌸 <b>Привет, ${escHtml(name)}!</b>\n\n` +
      `Добро пожаловать в <b>Rebuket</b> — маркетплейс букетов и сладостей в Таджикистане.\n\n` +
      `💐 <b>Купить</b> — просматривать букеты, корзины, игрушки и сладости\n` +
      `🛍 <b>Продать</b> — разместить своё объявление\n` +
      `📩 <b>Связаться</b> — оставить заявку продавцу\n\n` +
      `👇 Нажмите кнопку ниже чтобы открыть каталог:`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[
          { text: '🌸 Открыть Rebuket', web_app: { url: appUrl } }
        ]]}
      }
    );
  });

  userBot.onText(/\/catalog/, async (msg) => {
    await userBot.sendMessage(msg.chat.id,
      `💐 <b>Каталог Rebuket</b>\n\nБукеты, корзины, игрушки и сладости:`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[
          { text: '💐 Смотреть каталог', web_app: { url: getMiniAppUrl() + '#catalog' } }
        ]]}
      }
    );
  });

  userBot.onText(/\/sell/, async (msg) => {
    await userBot.sendMessage(msg.chat.id,
      `🛍 <b>Разместить объявление</b>\n\nПродайте букеты или сладости через Rebuket!`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[
          { text: '➕ Разместить объявление', web_app: { url: getMiniAppUrl() + '#sell' } }
        ]]}
      }
    );
  });

  userBot.onText(/\/help/, async (msg) => {
    await userBot.sendMessage(msg.chat.id,
      `🌸 <b>Rebuket — помощь</b>\n\n` +
      `/start   — запустить бота\n` +
      `/catalog — каталог\n` +
      `/sell    — разместить объявление\n` +
      `/help    — эта справка`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[
          { text: '🌸 Открыть Rebuket', web_app: { url: getMiniAppUrl() } }
        ]]}
      }
    );
  });

  // Любое не-командное сообщение
  userBot.on('message', async (msg) => {
    if (msg.text?.startsWith('/')) return;
    await userBot.sendMessage(msg.chat.id,
      `Нажмите кнопку ниже чтобы открыть Rebuket 🌸`,
      {
        reply_markup: { inline_keyboard: [[
          { text: '🌸 Открыть Rebuket', web_app: { url: getMiniAppUrl() } }
        ]]}
      }
    );
  });

  userBot.on('polling_error', (err) => {
    if (!err.message?.includes('409')) console.log('USER BOT error:', err.message);
  });

  console.log('🤖 USER BOT запущен | Mini App:', getMiniAppUrl());
}

// ─────────────────────────────────────────────
//  ADMIN BOT — уведомления администратору
// ─────────────────────────────────────────────
function initAdminBot() {
  const token = process.env.BOT_TOKEN_ADMIN;
  if (!token) { console.log('ℹ️  BOT_TOKEN_ADMIN не задан — admin bot отключён'); return; }

  adminBot = new TG(token, { polling: true });

  // /start — автоматически регистрирует chat_id администратора
  adminBot.onText(/\/start/, async (msg) => {
    const chatId = String(msg.chat.id);
    const isNew  = !adminChatIds.has(chatId);
    adminChatIds.add(chatId);

    await adminBot.sendMessage(msg.chat.id,
      `🔐 <b>Rebuket Admin Bot</b>\n\n` +
      (isNew
        ? `✅ Ваш Chat ID <b>${chatId}</b> добавлен.\nТеперь вы будете получать уведомления о новых объявлениях и заявках.`
        : `Вы уже подключены. Ваш Chat ID: <b>${chatId}</b>`),
      { parse_mode: 'HTML' }
    );

    // Выводим в консоль чтобы можно было добавить в .env
    if (isNew) console.log(`✅ Новый админ подключён. Добавьте в .env: ADMIN_CHAT_ID_1=${chatId}`);
  });

  adminBot.on('polling_error', (err) => {
    if (!err.message?.includes('409')) console.log('ADMIN BOT error:', err.message);
  });

  console.log('🛠  ADMIN BOT запущен');
}

// ─────────────────────────────────────────────
//  Отправка всем админам
// ─────────────────────────────────────────────
async function sendToAdmins(text, opts = {}) {
  if (!adminBot) return;
  if (!adminChatIds.size) {
    console.log('⚠️  Нет админов. Напишите /start вашему admin боту.');
    return;
  }
  for (const chatId of adminChatIds) {
    try {
      await adminBot.sendMessage(chatId, text, { parse_mode: 'HTML', ...opts });
    } catch(e) {
      console.log(`ADMIN BOT send error (chat ${chatId}):`, e.message);
    }
  }
}

// ─────────────────────────────────────────────
//  Уведомление — новое объявление
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
        [
          { text: '✅ Одобрить',  callback_data: `approve:${p.id}` },
          { text: '❌ Отклонить', callback_data: `reject:${p.id}`  }
        ],
        [{ text: '🔗 Открыть объявление', url }]
      ]}
    }
  );
}

// ─────────────────────────────────────────────
//  Уведомление — новая заявка
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
      onApprove(id);
      await adminBot.answerCallbackQuery(q.id, { text: '✅ Одобрено!' });
      await adminBot.editMessageReplyMarkup(
        { inline_keyboard: [[{ text: '✅ Одобрено', callback_data: 'done' }]] },
        { chat_id: q.message.chat.id, message_id: q.message.message_id }
      ).catch(() => {});
    }

    if (action === 'reject') {
      onReject(id);
      await adminBot.answerCallbackQuery(q.id, { text: '❌ Отклонено' });
      await adminBot.editMessageReplyMarkup(
        { inline_keyboard: [[{ text: '❌ Отклонено', callback_data: 'done' }]] },
        { chat_id: q.message.chat.id, message_id: q.message.message_id }
      ).catch(() => {});
    }
  });
}

module.exports = { initBots, notifyProduct, notifyInquiry, setupCallbacks };