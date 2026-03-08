'use strict';
let bot = null;

function initBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) { console.log('ℹ️  BOT_TOKEN не задан — Telegram уведомления отключены'); return; }
  try {
    const TG = require('node-telegram-bot-api');
    bot = new TG(token, { polling: false });
    console.log('🤖 Telegram бот подключён');
  } catch(e) { console.log('TG init error:', e.message); }
}

async function send(text, opts = {}) {
  if (!bot || !process.env.ADMIN_CHAT_ID) return;
  try { await bot.sendMessage(process.env.ADMIN_CHAT_ID, text, { parse_mode:'HTML', ...opts }); }
  catch(e) { console.log('TG send error:', e.message); }
}

const CATS = { bouquet:'💐 Букет', basket:'🧺 Корзина', bear:'🧸 Игрушки', sweets:'🍰 Сладости' };

async function notifyProduct(p) {
  await send(
    `📦 <b>Новое объявление на проверке!</b>\n─────────────────\n` +
    `${CATS[p.category]||p.category}: <b>${p.title}</b>\n` +
    `💰 ${p.price} TJS · 📍 ${p.city}\n` +
    `👤 ${p.seller_name||'—'} · 📞 ${p.seller_phone}\n` +
    `✈️ ${p.seller_telegram||'—'}`,
    { reply_markup:{ inline_keyboard:[[
      { text:'✅ Одобрить', callback_data:`approve:${p.id}` },
      { text:'❌ Отклонить', callback_data:`reject:${p.id}` },
    ]]}}
  );
}

async function notifyInquiry(inq, productTitle) {
  await send(
    `🛒 <b>Новая заявка!</b>\n─────────────────\n` +
    `📦 ${productTitle||'—'}\n` +
    `👤 ${inq.customer_name||'—'}\n` +
    `📞 <b>${inq.customer_phone}</b>\n` +
    `✈️ ${inq.customer_telegram||'—'}\n` +
    `📝 ${inq.note||'—'}`
  );
}

function setupCallbacks(onApprove, onReject) {
  if (!bot) return;
  bot.on('callback_query', async q => {
    const [action, id] = (q.data||'').split(':');
    if (action === 'approve') { onApprove(id); await bot.answerCallbackQuery(q.id, { text:'✅ Одобрено!' }); }
    if (action === 'reject')  { onReject(id);  await bot.answerCallbackQuery(q.id, { text:'❌ Отклонено' }); }
  });
}

module.exports = { initBot, notifyProduct, notifyInquiry, setupCallbacks };