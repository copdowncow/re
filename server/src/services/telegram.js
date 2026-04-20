'use strict';

const TG = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

let userBot = null;
let adminBot = null;
const adminChatIds = new Set();

const KHUJAND_CITIES = [
  'худжанд',
  'khujand',
  'khudzhand',
  'хучанд',
  'хуҷанд'
];

// ─────────────────────────────────────────────
// Вспомогательные функции
// ─────────────────────────────────────────────
function escHtml(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getMiniAppUrl() {
  return (
    process.env.MINI_APP_URL ||
    process.env.APP_URL ||
    'https://rebuket.tj'
  ).replace(/\/+$/, '');
}

function getDb() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL или SUPABASE_SERVICE_KEY не заданы');
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

async function getFreshProductById(id) {
  if (!id) return null;

  try {
    const db = getDb();
    const { data, error } = await db
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.log('[getFreshProductById] error:', error.message);
      return null;
    }

    return data || null;
  } catch (e) {
    console.log('[getFreshProductById] exception:', e.message);
    return null;
  }
}

function normalizeProduct(input, fresh = null) {
  return fresh || input || {};
}

// ─────────────────────────────────────────────
// Инициализация
// ─────────────────────────────────────────────
function initBots() {
  if (process.env.ADMIN_CHAT_ID_1) adminChatIds.add(String(process.env.ADMIN_CHAT_ID_1));
  if (process.env.ADMIN_CHAT_ID_2) adminChatIds.add(String(process.env.ADMIN_CHAT_ID_2));
  if (process.env.ADMIN_CHAT_ID) adminChatIds.add(String(process.env.ADMIN_CHAT_ID));

  initUserBot();
  initAdminBot();
}

// ─────────────────────────────────────────────
// USER BOT
// ─────────────────────────────────────────────
function initUserBot() {
  const token = process.env.BOT_TOKEN_USER;
  if (!token) {
    console.log('BOT_TOKEN_USER не задан');
    return;
  }

  userBot = new TG(token, { polling: true });

  userBot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    try {
      const name = msg.from?.first_name || 'друг';
      const appUrl = getMiniAppUrl();
      const param = ((match && match[1]) || '').trim();

      console.log('[bot /start] param:', JSON.stringify(param.substring(0, 50)));

      if (param === 'inquiry' || param.startsWith('inq_')) {
        const adminHandle = (process.env.ADMIN_TELEGRAM || 'https://t.me/Rebuket_admin')
          .replace('https://t.me/', '')
          .replace('@', '')
          .trim();

        let readyText = '🌸 Здравствуйте! Хочу сделать заказ через ReBuket.';

        if (param.startsWith('inq_')) {
          try {
            const b64 = param.slice(4).replace(/-/g, '+').replace(/_/g, '/');
            const decoded = decodeURIComponent(
              escape(Buffer.from(b64, 'base64').toString('binary'))
            );
            if (decoded && decoded.length > 5) readyText = decoded;
          } catch (e) {
            console.log('decode err:', e.message);
          }
        }

        const adminUrl = 'https://t.me/' + adminHandle + '?text=' + encodeURIComponent(readyText);
        console.log('[bot] inquiry start, adminUrl:', adminUrl.substring(0, 100));

        await userBot.sendMessage(
          msg.chat.id,
          '✅ <b>Заявка принята!</b>\n\nДля полного оформления заказа — нажмите кнопку ниже, откроется чат с готовым сообщением — останется нажать Отправить 👇',
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '✈️ Отправить заказ администратору', url: adminUrl }
              ]]
            }
          }
        );
        return;
      }

      if (param === 'inquiry_OLDCODE') {
        const adminUrl = process.env.ADMIN_TELEGRAM || 'https://t.me/Rebuket_admin';

        await userBot.sendMessage(
          msg.chat.id,
          `🌸 <b>Привет, ${escHtml(name)}!</b>\n\nВаша заявка успешно отправлена администратору.\n\nЧтобы уточнить детали заказа — напишите администратору напрямую:`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '✈️ Написать администратору', url: adminUrl }
              ]]
            }
          }
        );
        return;
      }

      await userBot.sendMessage(
        msg.chat.id,
        `🌸 <b>Привет, ${escHtml(name)}!</b>\n\nДобро пожаловать в <b>ReBuket</b> — маркетплейс букетов и сладостей в Таджикистане.\n\n💐 <b>Купить</b> — просматривать букеты, корзины, игрушки и сладости\n🛍 <b>Продать</b> — разместить своё объявление\n📩 <b>Связаться</b> — оставить заявку продавцу\n\n👇 Нажмите кнопку ниже чтобы открыть каталог:`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '🌸 Открыть ReBuket', web_app: { url: appUrl } }
            ]]
          }
        }
      );
    } catch (e) {
      console.log('userBot /start error:', e.message);
    }
  });

  userBot.onText(/\/catalog/, async (msg) => {
    try {
      await userBot.sendMessage(
        msg.chat.id,
        `💐 <b>Каталог ReBuket</b>\n\nБукеты, корзины, игрушки и сладости:`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '💐 Смотреть каталог', web_app: { url: getMiniAppUrl() + '#catalog' } }
            ]]
          }
        }
      );
    } catch (e) {
      console.log('/catalog error:', e.message);
    }
  });

  userBot.onText(/\/sell/, async (msg) => {
    try {
      await userBot.sendMessage(
        msg.chat.id,
        `🛍 <b>Разместить объявление</b>\n\nПродайте букеты или сладости через ReBuket!`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '➕ Разместить объявление', web_app: { url: getMiniAppUrl() + '#sell' } }
            ]]
          }
        }
      );
    } catch (e) {
      console.log('/sell error:', e.message);
    }
  });

  userBot.onText(/\/help/, async (msg) => {
    try {
      await userBot.sendMessage(
        msg.chat.id,
        `🌸 <b>ReBuket — помощь</b>\n\n/start   — запустить бота\n/catalog — каталог\n/sell    — разместить объявление\n/help    — эта справка`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '🌸 Открыть ReBuket', web_app: { url: getMiniAppUrl() } }
            ]]
          }
        }
      );
    } catch (e) {
      console.log('/help error:', e.message);
    }
  });

  userBot.on('message', async (msg) => {
    try {
      if (msg.text?.startsWith('/')) return;

      await userBot.sendMessage(
        msg.chat.id,
        `Нажмите кнопку ниже чтобы открыть ReBuket 🌸`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🌸 Открыть ReBuket', web_app: { url: getMiniAppUrl() } }
            ]]
          }
        }
      );
    } catch (e) {
      console.log('userBot message error:', e.message);
    }
  });

  userBot.on('polling_error', (err) => {
    if (!err.message?.includes('409')) {
      console.log('USER BOT error:', err.message);
    }
  });

  console.log('🤖 USER BOT запущен | Mini App:', getMiniAppUrl());
}

// ─────────────────────────────────────────────
// ADMIN BOT
// ─────────────────────────────────────────────
function initAdminBot() {
  const token = process.env.BOT_TOKEN_ADMIN;
  if (!token) {
    console.log('BOT_TOKEN_ADMIN не задан');
    return;
  }

  adminBot = new TG(token, { polling: true });

  adminBot.onText(/\/start/, async (msg) => {
    try {
      const chatId = String(msg.chat.id);
      const isNew = !adminChatIds.has(chatId);

      adminChatIds.add(chatId);

      await adminBot.sendMessage(
        msg.chat.id,
        `🔐 <b>ReBuket Admin Bot</b>\n\n` +
          (isNew
            ? `✅ Ваш Chat ID <b>${chatId}</b> добавлен.\nТеперь вы будете получать уведомления.`
            : `Вы уже подключены. Ваш Chat ID: <b>${chatId}</b>`),
        { parse_mode: 'HTML' }
      );

      if (isNew) console.log(`✅ Новый админ: ADMIN_CHAT_ID_1=${chatId}`);
    } catch (e) {
      console.log('admin /start error:', e.message);
    }
  });

  adminBot.on('polling_error', (err) => {
    if (!err.message?.includes('409')) {
      console.log('ADMIN BOT error:', err.message);
    }
  });

  console.log('🛠 ADMIN BOT запущен');
}

// ─────────────────────────────────────────────
// Отправка админам
// ─────────────────────────────────────────────
async function sendToAdmins(text, opts = {}) {
  if (!adminBot) return;
  if (!adminChatIds.size) {
    console.log('⚠️ Нет админов');
    return;
  }

  for (const chatId of adminChatIds) {
    try {
      await adminBot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        ...opts
      });
    } catch (e) {
      console.log(`ADMIN BOT send error (${chatId}):`, e.message);
    }
  }
}

// ─────────────────────────────────────────────
// Публикация в канал при одобрении
// Берём данные только из БД
// ─────────────────────────────────────────────
async function publishToChannel(p) {
  const fresh = await getFreshProductById(p?.id);
  p = normalizeProduct(p, fresh);

  const city = String(p.city || '').toLowerCase().trim();
  const isKhujand = KHUJAND_CITIES.includes(city);

  const channelId = isKhujand
    ? (process.env.CHANNEL_ID_KHUJAND || '-1003818624807')
    : process.env.CHANNEL_ID;

  console.log(`[publishToChannel] city="${city}" isKhujand=${isKhujand} channelId=${channelId}`);

  if (!channelId) {
    console.log('[publishToChannel] CHANNEL_ID не задан в .env');
    return null;
  }

  const bot = userBot || adminBot;
  if (!bot) {
    console.log('[publishToChannel] Нет активного бота');
    return null;
  }

  const EMOJIS = {
    bouquet: '💐',
    basket: '🧺',
    bear: '🧸',
    sweets: '🍰'
  };

  const em = EMOJIS[p.category] || '🌸';
  const desc = p.description
    ? p.description.substring(0, 200) + (p.description.length > 200 ? '…' : '')
    : '';
  const size = p.size || null;
  const giftWhen = p.gift_when || null;
  const marketPrice = p.market_price || null;
  const code = p.code || null;
  const price = Number(p.price)
    ? (Math.ceil(Number(p.price) * 1.20 / 10) * 10).toLocaleString('ru-RU')
    : '0';

  const admin = process.env.ADMIN_TELEGRAM
    ? process.env.ADMIN_TELEGRAM.replace('https://t.me/', '@')
    : '@rebuket_admin';

  const url = `${getMiniAppUrl()}/#product-${p.slug || p.id}`;
  const photos = Array.isArray(p.photos)
    ? p.photos.filter(Boolean).map((ph) => String(ph).split('?')[0])
    : [];

  const sizeLine = size ? `📏 Размер: <b>${escHtml(size)}</b>\n` : '';
  const giftWhenLine = giftWhen ? `🎁 Когда получили: <b>${escHtml(giftWhen)}</b>\n` : '';
  const marketPriceLine = marketPrice ? `🏪 Цена в магазинах: <b>${escHtml(marketPrice)} сомони</b>\n` : '';
  const codeLine = code ? `🆔 ${escHtml(code)}\n` : '';

  const caption =
    `${em} <b>${escHtml(p.title)}</b>\n` +
    `📍 ${escHtml(p.city)}\n` +
    (desc ? `🌸 ${escHtml(desc)}\n` : '') +
    sizeLine +
    giftWhenLine +
    marketPriceLine +
    `💰 Наша цена: <b>${price} сомони</b>\n` +
    `❓ По вопросам: ${admin}\n` +
    codeLine +
    `\n<a href="${url}">Смотреть объявление на ReBuket</a>`;

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
      const db = getDb();

      if (sent?.message_id) {
        await db
          .from('products')
          .update({
            channel_message_id: sent.message_id,
            channel_name: isKhujand ? 'khujand' : 'dushanbe'
          })
          .eq('id', p.id);

        p.channel_message_id = sent.message_id;
        p.channel_name = isKhujand ? 'khujand' : 'dushanbe';
      }
    } catch (e) {
      console.log('Не удалось сохранить message_id:', e.message);
    }

    console.log(`📢 Опубликовано в канал: ${p.title} [${code || 'NO-CODE'}]`);
    return sent;
  } catch (e) {
    console.log('[publishToChannel] Ошибка:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// Пометить истёкшие посты в канале
// Берём данные только из БД
// ─────────────────────────────────────────────
async function markExpiredInChannel(p) {
  const fresh = await getFreshProductById(p?.id);
  p = normalizeProduct(p, fresh);

  const bot = userBot || adminBot;
  if (!bot || !p.channel_message_id || !p.channel_name) return;

  const channelId = p.channel_name === 'khujand'
    ? (process.env.CHANNEL_ID_KHUJAND || '-1003818624807')
    : process.env.CHANNEL_ID;

  if (!channelId) return;

  const EMOJIS = {
    bouquet: '💐',
    basket: '🧺',
    bear: '🧸',
    sweets: '🍰'
  };

  const em = EMOJIS[p.category] || '🌸';
  const size = p.size || null;
  const marketPrice = p.market_price || null;
  const code = p.code || null;
  const price = Number(p.price)
    ? (Math.ceil(Number(p.price) * 1.20 / 10) * 10).toLocaleString('ru-RU')
    : '0';

  const admin = process.env.ADMIN_TELEGRAM
    ? process.env.ADMIN_TELEGRAM.replace('https://t.me/', '@')
    : '@rebuket_admin';

  const sizeLine = size ? `📏 Размер был: <b>${escHtml(size)}</b>\n` : '';
  const marketPriceLine = marketPrice ? `🏪 Цена в магазинах была: <b>${escHtml(marketPrice)} сомони</b>\n` : '';
  const codeLine = code ? `🆔 ${escHtml(code)}\n` : '';

  const newCaption =
    `🔴 <b>СНЯТО С ПРОДАЖИ</b>\n\n` +
    `${em} <b>${escHtml(p.title)}</b>\n` +
    `📍 ${escHtml(p.city)}\n` +
    sizeLine +
    marketPriceLine +
    `💰 Цена была: <b>${price} сомони</b>\n` +
    `❓ По вопросам: ${admin}\n` +
    codeLine;

  try {
    await bot.editMessageCaption(newCaption, {
      chat_id: channelId,
      message_id: p.channel_message_id,
      parse_mode: 'HTML'
    });

    console.log(`🔴 Пост помечен как снято: ${p.title}`);
  } catch (e) {
    console.log('Ошибка редактирования поста:', e.message);
  }
}

// ─────────────────────────────────────────────
// Уведомление продавцу — одобрено
// Берём данные только из БД
// ─────────────────────────────────────────────
async function notifySellerApproved(p) {
  const fresh = await getFreshProductById(p?.id);
  p = normalizeProduct(p, fresh);

  try {
    await publishToChannel(p);
  } catch (e) {
    console.log('Channel publish error:', e.message);
  }

  const freshAfterPublish = await getFreshProductById(p?.id);
  p = normalizeProduct(p, freshAfterPublish);

  if (!userBot || !p.seller_chat_id) return;

  const url = `${getMiniAppUrl()}/#product-${p.slug || p.id}`;

  try {
    const sizeLine = p.size ? `📏 ${escHtml(p.size)}\n` : '';
    const codeLine = p.code ? `🆔 ${escHtml(p.code)}\n` : '';

    await userBot.sendMessage(
      p.seller_chat_id,
      `🎉 <b>Ваше объявление одобрено!</b>\n\n` +
      `📦 <b>${escHtml(p.title)}</b>\n` +
      `💰 ${escHtml(p.price)} TJS · 📍 ${escHtml(p.city)}\n` +
      sizeLine +
      codeLine +
      `\nТеперь его видят все покупатели. Удачных продаж! 🌸`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔗 Открыть моё объявление', web_app: { url } }
          ]]
        }
      }
    );

    if (p.channel_message_id && p.channel_name && userBot) {
      const channelId = p.channel_name === 'khujand'
        ? (process.env.CHANNEL_ID_KHUJAND || '-1003818624807')
        : process.env.CHANNEL_ID;

      if (channelId) {
        try {
          await userBot.forwardMessage(p.seller_chat_id, channelId, p.channel_message_id);
        } catch (fe) {
          console.log('forwardMessage error:', fe.message);
        }
      }
    }
  } catch (e) {
    console.log('Не удалось уведомить продавца:', e.message);
  }
}

// ─────────────────────────────────────────────
// Уведомление продавцу — отклонено
// ─────────────────────────────────────────────
async function notifySellerRejected(p) {
  const fresh = await getFreshProductById(p?.id);
  p = normalizeProduct(p, fresh);

  if (!userBot || !p.seller_chat_id) return;

  try {
    await userBot.sendMessage(
      p.seller_chat_id,
      `❌ <b>Ваше объявление отклонено</b>\n\n📦 <b>${escHtml(p.title)}</b>\n\nК сожалению, объявление не прошло модерацию.\nВы можете разместить новое объявление:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '➕ Разместить новое', web_app: { url: getMiniAppUrl() + '#sell' } }
          ]]
        }
      }
    );
  } catch (e) {
    console.log('Не удалось уведомить продавца:', e.message);
  }
}

// ─────────────────────────────────────────────
// Уведомление — новое объявление (для админов)
// Берём данные только из БД
// ─────────────────────────────────────────────
const CATS = {
  bouquet: '💐 Букет',
  basket: '🧺 Корзина',
  bear: '🧸 Игрушки',
  sweets: '🍰 Сладости'
};

async function notifyProduct(p) {
  const fresh = await getFreshProductById(p?.id);
  p = normalizeProduct(p, fresh);

  const url = `${getMiniAppUrl()}/#product-${p.slug || p.id}`;

  const sizeLine = p.size ? `📏 Размер: <b>${escHtml(p.size)}</b>\n` : '';
  const giftWhenLine = p.gift_when ? `🎁 Когда получили: <b>${escHtml(p.gift_when)}</b>\n` : '';
  const marketPriceLine = p.market_price ? `🏪 Цена в магазинах: <b>${escHtml(p.market_price)} TJS</b>\n` : '';
  const codeLine = p.code ? `🆔 ${escHtml(p.code)}\n` : '';

  await sendToAdmins(
    `📦 <b>Новое объявление на проверке!</b>\n─────────────────\n` +
      `${CATS[p.category] || p.category}: <b>${escHtml(p.title)}</b>\n` +
      `💰 ${escHtml(p.price)} TJS · 📍 ${escHtml(p.city)}\n` +
      sizeLine +
      giftWhenLine +
      marketPriceLine +
      codeLine +
      `👤 ${escHtml(p.seller_name || '—')} · 📞 ${escHtml(p.seller_phone || '—')}\n` +
      `✈️ ${escHtml(p.seller_telegram || '—')}\n` +
      `🔗 <a href="${url}">Открыть объявление</a>`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Одобрить', callback_data: `approve:${p.id}` },
            { text: '❌ Отклонить', callback_data: `reject:${p.id}` }
          ],
          [
            { text: '🔗 Открыть объявление', url }
          ]
        ]
      }
    }
  );
}

// ─────────────────────────────────────────────
// Уведомление — новая заявка (для админов)
// ─────────────────────────────────────────────
async function notifyInquiry(inq, productTitle, productSlug, productId) {
  const url = (productSlug || productId)
    ? `${getMiniAppUrl()}/#product-${productSlug || productId}`
    : null;

  await sendToAdmins(
    `🛒 <b>Новая заявка!</b>\n─────────────────\n` +
      `📦 ${escHtml(productTitle || '—')}\n` +
      `👤 ${escHtml(inq.customer_name || '—')}\n` +
      `📞 <b>${escHtml(inq.customer_phone || '—')}</b>\n` +
      `✈️ ${escHtml(inq.customer_telegram || '—')}\n` +
      `📝 ${escHtml(inq.note || '—')}` +
      (url ? `\n🔗 <a href="${url}">Открыть объявление</a>` : ''),
    url
      ? {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔗 Открыть объявление', url }
            ]]
          }
        }
      : {}
  );
}

// ─────────────────────────────────────────────
// Callback: Одобрить / Отклонить
// ─────────────────────────────────────────────
function setupCallbacks(onApprove, onReject) {
  if (!adminBot) return;

  adminBot.on('callback_query', async (q) => {
    try {
      const [action, id] = String(q.data || '').split(':');

      if (action === 'approve') {
        await onApprove(id);
        await adminBot.answerCallbackQuery(q.id, { text: '✅ Одобрено!' });

        await adminBot.editMessageReplyMarkup(
          {
            inline_keyboard: [[
              { text: '✅ Одобрено', callback_data: 'done' }
            ]]
          },
          {
            chat_id: q.message.chat.id,
            message_id: q.message.message_id
          }
        ).catch(() => {});
      }

      if (action === 'reject') {
        await onReject(id);
        await adminBot.answerCallbackQuery(q.id, { text: '❌ Отклонено' });

        await adminBot.editMessageReplyMarkup(
          {
            inline_keyboard: [[
              { text: '❌ Отклонено', callback_data: 'done' }
            ]]
          },
          {
            chat_id: q.message.chat.id,
            message_id: q.message.message_id
          }
        ).catch(() => {});
      }
    } catch (e) {
      console.log('callback_query error:', e.message);
    }
  });
}

// ─────────────────────────────────────────────
// Уведомление покупателю — заявка принята
// ─────────────────────────────────────────────
async function notifyBuyerInquirySent(d) {
  if (!userBot || !d.customer_chat_id) return;

  try {
    const COMM = 0.20;
    const price = d.productPrice
      ? (Math.ceil(Number(d.productPrice) * (1 + COMM) / 10) * 10).toLocaleString('ru-RU') + ' сомони'
      : null;

    const url = (d.productSlug || d.productId)
      ? getMiniAppUrl() + '/#product-' + (d.productSlug || d.productId)
      : getMiniAppUrl();

    const adminHandle = (process.env.ADMIN_TELEGRAM || 'https://t.me/Rebuket_admin')
      .replace('https://t.me/', '')
      .replace('@', '')
      .trim();

    const parts = [
      '🌸 Здравствуйте! Хочу купить:',
      '',
      '📦 ' + (d.productTitle || '—'),
      '📞 Мой телефон: ' + (d.customer_phone || '—')
    ];

    if (d.customer_name) parts.push('👤 Имя: ' + d.customer_name);
    if (d.customer_telegram) parts.push('✈️ Telegram: ' + d.customer_telegram);
    if (d.note) parts.push('📝 Комментарий: ' + d.note);

    parts.push('', '🔗 ' + url);

    const readyText = parts.join('\n');
    const tgLink = 'https://t.me/' + adminHandle + '?text=' + encodeURIComponent(readyText);

    const text =
      `✅ <b>Ваша заявка принята!</b>\n\n` +
      `📦 ${escHtml(d.productTitle || '—')}\n` +
      (price ? `💰 ${price}\n` : '') +
      `\nНажмите кнопку ниже — сообщение уже готово, останется только нажать Отправить.`;

    await userBot.sendMessage(d.customer_chat_id, text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✈️ Написать администратору', url: tgLink }
        ]]
      }
    });
  } catch (e) {
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
  setupCallbacks,
  publishToChannel
};
