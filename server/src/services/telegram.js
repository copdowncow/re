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

  userBot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const name   = msg.from?.first_name || 'друг';
    const appUrl = getMiniAppUrl();
    const param  = (match && match[1] || '').trim();
    console.log('[bot /start] param:', JSON.stringify(param.substring(0,50)));

    if (param === 'inquiry' || param.startsWith('inq_')) {
      const adminHandle = (process.env.ADMIN_TELEGRAM || 'https://t.me/Rebuket_admin')
        .replace('https://t.me/', '').replace('@', '').trim();

      let readyText = '🌸 Здравствуйте! Хочу сделать заказ через ReBuket.';

      if (param.startsWith('inq_')) {
        try {
          const b64 = param.slice(4).replace(/-/g, '+').replace(/_/g, '/');
          const decoded = decodeURIComponent(escape(Buffer.from(b64, 'base64').toString('binary')));
          if (decoded && decoded.length > 5) readyText = decoded;
        } catch(e) { console.log('decode err:', e.message); }
      }

      const adminUrl = 'https://t.me/' + adminHandle + '?text=' + encodeURIComponent(readyText);

      await userBot.sendMessage(msg.chat.id,
        '✅ <b>Заявка принята!</b>\n\nДля полного оформления заказа — нажмите кнопку ниже, откроется чат с готовым сообщением — останется нажать Отправить 👇',
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '✈️ Отправить заказ администратору', url: adminUrl }]] } }
      );
      return;
    }

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
async function getNextSerial(channel) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data, error } = await db.rpc('increment_counter', { ch: channel });
    if (error) throw new Error(error.message);
    console.log('[getNextSerial] channel=' + channel + ' next=' + data);
    return data;
  } catch(e) {
    console.log('[getNextSerial] Error:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────
//  ГЛАВНАЯ функция публикации в канал
//  Цена p.price — это УЖЕ финальная цена (без умножения на комиссию).
//  Жирный шрифт для размера, когда получили и цены.
// ─────────────────────────────────────────────
async function publishToChannel(p) {
  const city      = (p.city || '').toLowerCase().trim();
  const isKhujand = KHUJAND_CITIES.includes(city);
  const channelId = isKhujand
    ? (process.env.CHANNEL_ID_KHUJAND || '-1003818624807')
    : process.env.CHANNEL_ID;

  console.log(`[publishToChannel] city="${city}" isKhujand=${isKhujand} channelId=${channelId} productId=${p.id}`);

  if (!channelId) {
    console.log('[publishToChannel] CHANNEL_ID не задан в .env — пропускаем');
    return null;
  }

  // Берём любой доступный бот
  const bot = userBot || adminBot;
  if (!bot) {
    console.log('[publishToChannel] Нет активного бота — пропускаем');
    return null;
  }

  const EMOJIS = { bouquet:'💐', basket:'🧺', bear:'🧸', sweets:'🍰' };
  const em     = EMOJIS[p.category] || '🌸';

  // Цена p.price — финальная (то что заплатит покупатель), НЕ умножаем на комиссию
  const finalPrice = Math.round(Number(p.price)).toLocaleString('ru-RU');

  const admin  = process.env.ADMIN_TELEGRAM
    ? process.env.ADMIN_TELEGRAM.replace('https://t.me/', '@')
    : '@rebuket_admin';
  const url    = `${getMiniAppUrl()}/#product-${p.slug || p.id}`;
  const photos = Array.isArray(p.photos) ? p.photos.filter(Boolean).map(ph => ph.split('?')[0]) : [];

  const serialNum = await getNextSerial(isKhujand ? 'khujand' : 'dushanbe');
  const code      = getProductCode(serialNum, isKhujand ? 'AK' : 'AB');

  // Жирный шрифт для размера, когда получили и цены (пункты 2 и 4)
  const caption =
    `${em} ${escHtml(p.title)}\n` +
    `📍 ${escHtml(p.city)}\n` +
    (p.size      ? `📏 Размер: <b>${escHtml(p.size)}</b>\n` : '') +
    (p.gift_when ? `🎁 Когда получили: <b>${escHtml(p.gift_when)}</b>\n` : '') +
    (p.market_price ? `🏪 Цена в магазинах: ${(Math.round(Number(p.market_price))).toLocaleString('ru-RU')} сомони\n` : '') +
    `💰 Наша цена: <b>${finalPrice} сомони</b>\n` +
    `❓ По вопросам: ${admin}\n` +
    (code ? `🆔 ${code}\n` : '') +
    `\n<a href="${url}">Смотреть объявление на ReBuket</a>`;

  let sent = null;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    try {
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
      // Успешно отправлено — выходим из цикла
      console.log(`📢 Опубликовано в канал: ${p.title} [${code}] attempt=${attempts}`);
      break;
    } catch(e) {
      console.log(`[publishToChannel] Попытка ${attempts}/${maxAttempts} не удалась:`, e.message);
      if (attempts < maxAttempts) {
        // Ждём 2 секунды перед следующей попыткой
        await new Promise(r => setTimeout(r, 2000));
      } else {
        console.log('[publishToChannel] Все попытки исчерпаны для:', p.title);
      }
    }
  }

  // Сохраняем message_id в базу
  if (sent?.message_id) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      await db.from('products').update({
        channel_message_id: sent.message_id,
        channel_name: isKhujand ? 'khujand' : 'dushanbe',
        custom_id: code || p.custom_id || null,
      }).eq('id', p.id);
    } catch(e) {
      console.log('Не удалось сохранить message_id:', e.message);
    }
  }

  return sent;
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
  // Финальная цена — уже хранится как есть
  const finalPrice = Math.round(Number(p.price)).toLocaleString('ru-RU');
  const admin  = process.env.ADMIN_TELEGRAM
    ? process.env.ADMIN_TELEGRAM.replace('https://t.me/', '@')
    : '@rebuket_admin';

  const newCaption =
    `🔴 <b>СНЯТО С ПРОДАЖИ</b>\n\n` +
    `${em} <b>${escHtml(p.title)}</b>\n` +
    `📍 ${escHtml(p.city)}\n` +
    `💰 Цена была: <b>${finalPrice} сомони</b>\n\n` +
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
//  Публикация в канал гарантирована — она происходит
//  НЕЗАВИСИМО от наличия seller_chat_id
// ─────────────────────────────────────────────
async function notifySellerApproved(p) {
  // 1. Публикуем в канал — всегда, независимо от продавца
  let channelSent = null;
  try {
    channelSent = await publishToChannel(p);
  } catch(e) {
    console.log('Channel publish error (notifySellerApproved):', e.message);
  }

  // 2. Уведомляем продавца если есть chat_id
  if (!userBot || !p.seller_chat_id) {
    console.log('[notifySellerApproved] seller_chat_id отсутствует — пропускаем уведомление продавцу');
    return;
  }

  const url = `${getMiniAppUrl()}/#product-${p.slug || p.id}`;
  try {
    await userBot.sendMessage(p.seller_chat_id,
      `🎉 <b>Ваше объявление одобрено!</b>\n\n📦 <b>${escHtml(p.title)}</b>\n💰 ${p.price} TJS · 📍 ${escHtml(p.city)}\n\nТеперь его видят все покупатели. Удачных продаж! 🌸`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🔗 Открыть моё объявление', web_app: { url } }]] } }
    );

    // Пересылаем пост из канала продавцу
    // Берём свежие данные о message_id после publishToChannel
    if (p.channel_message_id || channelSent?.message_id) {
      const msgId = channelSent?.message_id || p.channel_message_id;
      const channelName = p.channel_name || ((KHUJAND_CITIES.includes((p.city||'').toLowerCase().trim())) ? 'khujand' : 'dushanbe');
      const channelId = channelName === 'khujand'
        ? (process.env.CHANNEL_ID_KHUJAND || '-1003818624807')
        : process.env.CHANNEL_ID;
      if (channelId && msgId) {
        try {
          await userBot.forwardMessage(p.seller_chat_id, channelId, msgId);
        } catch(fe) {
          console.log('forwardMessage error:', fe.message);
        }
      }
    }
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
    const url = (d.productSlug || d.productId)
      ? getMiniAppUrl() + '/#product-' + (d.productSlug || d.productId)
      : getMiniAppUrl();

    const adminHandle = (process.env.ADMIN_TELEGRAM || 'https://t.me/Rebuket_admin')
      .replace('https://t.me/', '').replace('@', '').trim();

    const parts = [
      '🌸 Здравствуйте! Хочу купить:',
      '',
      '📦 ' + (d.productTitle || '—'),
      '📞 Мой телефон: ' + d.customer_phone
    ];
    if (d.customer_name)     parts.push('👤 Имя: ' + d.customer_name);
    if (d.customer_telegram) parts.push('✈️ Telegram: ' + d.customer_telegram);
    if (d.note)              parts.push('📝 Комментарий: ' + d.note);
    parts.push('', '🔗 ' + url);

    const readyText = parts.join('\n');
    const tgLink = 'https://t.me/' + adminHandle + '?text=' + encodeURIComponent(readyText);

    // Финальная цена уже хранится в p.price как есть
    const price = d.productPrice
      ? Math.round(Number(d.productPrice)).toLocaleString('ru-RU') + ' сомони'
      : null;

    const text = '✅ <b>Ваша заявка принята!</b>\n\n' +
      '📦 ' + escHtml(d.productTitle || '—') + '\n' +
      (price ? '💰 ' + price + '\n' : '') +
      '\nНажмите кнопку ниже — сообщение уже готово, останется только нажать Отправить.';

    await userBot.sendMessage(d.customer_chat_id, text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✈️ Написать администратору', url: tgLink }
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
