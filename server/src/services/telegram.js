'use strict';

let userBot  = null;
let adminBot = null;

function getMiniAppUrl() {
  return process.env.MINI_APP_URL || process.env.SITE_URL || 'https://rebuket.tj';
}

function initBots() {
  const userToken  = process.env.BOT_TOKEN_USER;
  const adminToken = process.env.BOT_TOKEN_ADMIN;

  if (!userToken)  console.log('ℹ️  BOT_TOKEN_USER не задан  — пользовательский бот отключён');
  if (!adminToken) console.log('ℹ️  BOT_TOKEN_ADMIN не задан — административный бот отключён');

  const TG = require('node-telegram-bot-api');

  // ═══════════════════════════════════
  //  USER BOT — мини-апп, пользователи
  // ═══════════════════════════════════
  if (userToken) {
    userBot = new TG(userToken, { polling: true });

    userBot.onText(/\/start/, async (msg) => {
      const name = msg.from?.first_name || 'друг';
      await userBot.sendMessage(msg.chat.id,
        `🌸 <b>Привет, ${escHtml(name)}!</b>\n\n` +
        `Добро пожаловать в <b>Rebuket</b> — маркетплейс букетов и сладостей в Таджикистане.\n\n` +
        `Здесь вы можете:\n` +
        `💐 <b>Купить</b> — просматривать букеты, корзины, игрушки и сладости\n` +
        `🛍 <b>Продать</b> — разместить своё объявление\n` +
        `📩 <b>Связаться</b> — оставить заявку продавцу\n\n` +
        `👇 Нажмите кнопку ниже чтобы открыть каталог:`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '🌸 Открыть Rebuket', web_app: { url: getMiniAppUrl() } }
            ]]
          }
        }
      );
    });

    userBot.onText(/\/catalog/, async (msg) => {
      await userBot.sendMessage(msg.chat.id,
        `💐 <b>Каталог Rebuket</b>\n\nОткройте приложение чтобы просматривать букеты, корзины, игрушки и сладости:`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '💐 Смотреть каталог', web_app: { url: getMiniAppUrl() + '#catalog' } }
            ]]
          }
        }
      );
    });

    userBot.onText(/\/sell/, async (msg) => {
      await userBot.sendMessage(msg.chat.id,
        `🛍 <b>Разместить объявление</b>\n\nПродайте букеты или сладости через Rebuket!\nОткройте форму и заполните данные:`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '➕ Разместить объявление', web_app: { url: getMiniAppUrl() + '#sell' } }
            ]]
          }
        }
      );
    });

    userBot.onText(/\/help/, async (msg) => {
      await userBot.sendMessage(msg.chat.id,
        `🌸 <b>Rebuket — помощь</b>\n\n` +
        `<b>Команды:</b>\n` +
        `/start   — запустить бота\n` +
        `/catalog — смотреть каталог\n` +
        `/sell    — разместить объявление\n` +
        `/help    — эта справка\n\n` +
        `<b>Как разместить объявление?</b>\n` +
        `1. Нажмите «Открыть Rebuket»\n` +
        `2. Нажмите «+ Продать»\n` +
        `3. Заполните форму, загрузите минимум 3 фото\n` +
        `4. Ждите одобрения администратора`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '🌸 Открыть Rebuket', web_app: { url: getMiniAppUrl() } }
            ]]
          }
        }
      );
    });

    // Любое другое сообщение
    userBot.on('message', async (msg) => {
      if (msg.text?.startsWith('/')) return;
      await userBot.sendMessage(msg.chat.id,
        `Нажмите кнопку ниже чтобы открыть Rebuket 🌸`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🌸 Открыть Rebuket', web_app: { url: getMiniAppUrl() } }
            ]]
          }
        }
      );
    });

    userBot.on('polling_error', (err) => {
      if (!err.message?.includes('409'))
        console.log('USER BOT polling error:', err.message);
    });

    console.log('🤖 USER BOT запущен');
    console.log(`🌐 Mini App URL: ${getMiniAppUrl()}`);
  }

  // ═══════════════════════════════════════
  //  ADMIN BOT — уведомления администратору
  // ═══════════════════════════════════════
  if (adminToken) {
    adminBot = new TG(adminToken, { polling: true });

    adminBot.onText(/\/start/, async (msg) => {
      await adminBot.sendMessage(msg.chat.id,
        `🔐 <b>Rebuket Admin Bot</b>\n\nВы будете получать уведомления о новых объявлениях и заявках.`,
        { parse_mode: 'HTML' }
      );
    });

    adminBot.on('polling_error', (err) => {
      if (!err.message?.includes('409'))
        console.log('ADMIN BOT polling error:', err.message);
    });

    console.log('🛠  ADMIN BOT запущен');
  }
}

// ═══════════════════════════════════════
//  Кому слать уведомления
// ═══════════════════════════════════════
function getAdminChats() {
  const chats = [];
  if (process.env.ADMIN_CHAT_ID_1) chats.push(process.env.ADMIN_CHAT_ID_1);
  if (process.env.ADMIN_CHAT_ID_2) chats.push(process.env.ADMIN_CHAT_ID_2);
  // обратная совместимость
  if (!chats.length && process.env.ADMIN_CHAT_ID) chats.push(process.env.ADMIN_CHAT_ID);
  return chats;
}

async function sendToAdmins(text, opts = {}) {
  if (!adminBot) return;
  for (const chatId of getAdminChats()) {
    try {
      await adminBot.sendMessage(chatId, text, { parse_mode: 'HTML', ...opts });
    } catch(e) {
      console.log('ADMIN BOT send error:', e.message);
    }
  }
}

// ═══════════════════════════════════════
//  Уведомления
// ═══════════════════════════════════════
const CATS = {
  bouquet: '💐 Букет',
  basket:  '🧺 Корзина',
  bear:    '🧸 Игрушки',
  sweets:  '🍰 Сладости'
};

async function notifyProduct(p) {
  await sendToAdmins(
    `📦 <b>Новое объявление на проверке!</b>\n─────────────────\n` +
    `${CATS[p.category] || p.category}: <b>${escHtml(p.title)}</b>\n` +
    `💰 ${p.price} TJS · 📍 ${escHtml(p.city)}\n` +
    `👤 ${escHtml(p.seller_name || '—')} · 📞 ${escHtml(p.seller_phone)}\n` +
    `✈️ ${escHtml(p.seller_telegram || '—')}`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Одобрить',  callback_data: `approve:${p.id}` },
          { text: '❌ Отклонить', callback_data: `reject:${p.id}`  }
        ]]
      }
    }
  );
}

async function notifyInquiry(inq, productTitle) {
  await sendToAdmins(
    `🛒 <b>Новая заявка!</b>\n─────────────────\n` +
    `📦 ${escHtml(productTitle || '—')}\n` +
    `👤 ${escHtml(inq.customer_name || '—')}\n` +
    `📞 <b>${escHtml(inq.customer_phone)}</b>\n` +
    `✈️ ${escHtml(inq.customer_telegram || '—')}\n` +
    `📝 ${escHtml(inq.note || '—')}`
  );
}

// ═══════════════════════════════════════
//  Callback: Одобрить / Отклонить
// ═══════════════════════════════════════
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

// ═══════════════════════════════════════
//  Утилита — экранирование HTML
// ═══════════════════════════════════════
function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { initBots, notifyProduct, notifyInquiry, setupCallbacks };