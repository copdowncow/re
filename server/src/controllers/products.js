'use strict';
const { q, uploadPhoto, getClient } = require('../db/supabase');
const { notifyProduct, notifySellerApproved, notifySellerRejected } = require('../services/telegram');
const { v4: uuid } = require('uuid');

function toSlug(str) {
  if (!str) return '';
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo',
    ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
    н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
    ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ы: 'y', э: 'e', ю: 'yu', я: 'ya'
  };
  return str
    .toLowerCase()
    .split('')
    .map(c => map[c] || c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

async function uniqueSlug(base) {
  if (!base) return `product-${Date.now()}`;
  let slug = base;
  let i = 1;
  while (true) {
    const rows = await q(sb =>
      sb.from('products').select('id').eq('slug', slug).limit(1)
    );
    if (!rows?.length) return slug;
    slug = `${base}-${i++}`;
    if (i > 100) throw new Error('Не удалось сгенерировать уникальный slug');
  }
}

// ─────────────────────────────────────────────
// Генерация кода AB-XXXX
// Счётчик хранится в таблице app_settings
// ─────────────────────────────────────────────
async function getNextProductCode() {
  const db = getClient();

  // Читаем текущий счётчик
  const { data, error } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'product_counter')
    .single();

  let counter = 0;

  if (error || !data) {
    // Если записи нет — создаём с нуля
    await db.from('app_settings').upsert({ key: 'product_counter', value: '0' });
    counter = 0;
  } else {
    counter = parseInt(data.value, 10) || 0;
  }

  counter += 1;

  // Сохраняем новый счётчик
  await db
    .from('app_settings')
    .upsert({ key: 'product_counter', value: String(counter) });

  // Форматируем: AB-0001
  const padded = String(counter).padStart(4, '0');
  return `AB-${padded}`;
}

function publicProduct(p) {
  if (!p) return null;
  const { seller_phone, seller_telegram, seller_name, seller_chat_id, ...pub } = p;
  return {
    ...pub,
    status: p.status || 'unknown'
  };
}

// ─────────────────────────────────────────────
// GET /products — публичный каталог
// ─────────────────────────────────────────────
exports.getProducts = async (req, res) => {
  try {
    const { category, city, min_price, max_price, search, page = 1, limit = 20 } = req.query;
    const lim = Math.min(Number(limit) || 20, 100);
    const off = (Number(page) - 1) * lim;

    const now = new Date().toISOString();
    let query = getClient()
      .from('products')
      .select('*', { count: 'exact' })
      .eq('status', 'active')
      .or(`expires_at.is.null,expires_at.gt.${now}`);

    if (category)  query = query.eq('category', category);
    if (city)      query = query.eq('city', city);
    if (min_price) query = query.gte('price', Number(min_price));
    if (max_price) query = query.lte('price', Number(max_price));
    if (search)    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(off, off + lim - 1);

    if (error) throw error;

    res.json({
      data: (data || []).map(publicProduct),
      total: count || 0,
      page: Number(page),
      limit: lim,
      total_pages: Math.ceil((count || 0) / lim)
    });
  } catch (e) {
    console.error('[getProducts]', e);
    res.status(500).json({ error: e.message || 'Ошибка сервера' });
  }
};

// Кеш просмотров: ip+productId -> timestamp последнего просмотра
const _viewCache = new Map();
const VIEW_TTL   = 30 * 60 * 1000; // 30 минут

exports.getProduct = async (req, res) => {
  try {
    const param  = req.params.id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);

    const { data, error } = await getClient()
      .from('products')
      .select('*')
      .eq(isUUID ? 'id' : 'slug', param)
      .eq('status', 'active')
      .single();

    if (error || !data) {
      console.log(`[getProduct] не найден: param=${param}`);
      return res.status(404).json({ error: 'Товар не найден, не активен или на модерации' });
    }

    const ip      = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    const cacheKey = ip + ':' + data.id;
    const lastView = _viewCache.get(cacheKey);
    const now      = Date.now();

    let newCount = data.view_count || 0;
    if (!lastView || now - lastView > VIEW_TTL) {
      _viewCache.set(cacheKey, now);
      newCount += 1;
      getClient()
        .from('products')
        .update({ view_count: newCount })
        .eq('id', data.id)
        .then(() => {})
        .catch(e => console.log('view_count update error:', e.message));
    }

    res.json(publicProduct({ ...data, view_count: newCount }));
  } catch (e) {
    console.error('[getProduct]', e);
    res.status(500).json({ error: e.message || 'Ошибка сервера' });
  }
};

exports.getCities = async (req, res) => {
  try {
    const { data, error } = await getClient()
      .from('products')
      .select('city')
      .eq('status', 'active')
      .not('city', 'is', null);

    if (error) throw error;

    const cities = [...new Set(data?.map(r => r.city) || [])]
      .filter(Boolean)
      .sort();

    res.json(cities);
  } catch (e) {
    console.error('[getCities]', e);
    res.status(500).json({ error: e.message || 'Ошибка сервера' });
  }
};

// ─────────────────────────────────────────────
// POST /products — создать объявление
// ─────────────────────────────────────────────
exports.createProduct = async (req, res) => {
  try {
    const {
      title, description, category, price, city,
      seller_name, seller_phone, seller_telegram,
      address, pickup_time, gift_when, market_price, size,
      seller_chat_id
    } = req.body;

    // Обязательные поля
    if (!title || !category || !price || !city || !seller_phone) {
      return res.status(400).json({ error: 'Заполните все обязательные поля' });
    }

    // Адрес обязателен
    if (!address || !String(address).trim()) {
      return res.status(400).json({ error: 'Адрес обязателен для заполнения' });
    }

    // Размер обязателен для bouquet, basket, bear — не для sweets
    const needsSize = ['bouquet', 'basket', 'bear'].includes(category);
    if (needsSize && (!size || !String(size).trim())) {
      return res.status(400).json({ error: 'Укажите размер' });
    }

    const files = req.files || [];
    if (files.length < 3) {
      return res.status(400).json({ error: 'Загрузите минимум 3 фотографии' });
    }

    const slug = await uniqueSlug(toSlug(title));

    // Код НЕ генерируется при создании — только при одобрении
    const { data, error } = await getClient()
      .from('products')
      .insert({
        title,
        description:     description     || null,
        category,
        price:           Number(price),
        city,
        seller_name:     seller_name     || null,
        seller_phone,
        seller_telegram: seller_telegram || null,
        address:         String(address).trim(),
        pickup_time:     pickup_time     || null,
        gift_when:       gift_when       || null,
        market_price:    market_price ? Number(market_price) : null,
        size:            needsSize ? (size || null) : null,
        seller_chat_id:  seller_chat_id  || null,
        photos:          [],
        slug,
        status:          'pending',
        code:            null  // код присвоится при одобрении
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      id:         data.id,
      slug:       data.slug,
      status:     data.status,
      message:    'Объявление подано! Ждёт проверки.',
      previewUrl: `/products/${data.slug}`
    });

    // Загружаем фото и уведомляем в фоне
    Promise.all(files.map(f => uploadPhoto(f.buffer, f.originalname, f.mimetype)))
      .then(photos => getClient().from('products').update({ photos }).eq('id', data.id))
      .then(() => notifyProduct({ ...data }))
      .catch(err => console.error('Фото/уведомление ошибка:', err));
  } catch (e) {
    console.error('[createProduct]', e);
    res.status(500).json({ error: e.message || 'Ошибка при создании объявления' });
  }
};

// ─────────────────────────────────────────────
// GET /admin/products — список для админа
// ─────────────────────────────────────────────
exports.adminList = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const lim = Math.min(Number(limit) || 50, 200);
    const off = (Number(page) - 1) * lim;

    let query = getClient()
      .from('products')
      .select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(off, off + lim - 1);

    if (error) throw error;

    // Автоудаляем просроченные букеты и корзины
    const now = new Date();
    const expired = (data || []).filter(p =>
      ['bouquet','basket'].includes(p.category) &&
      p.expires_at && new Date(p.expires_at) < now
    );
    if (expired.length) {
      await Promise.all(expired.map(p =>
        getClient().from('products').delete().eq('id', p.id)
      ));
    }

    res.json({
      data:        data || [],
      total:       count || 0,
      page:        Number(page),
      limit:       lim,
      total_pages: Math.ceil((count || 0) / lim)
    });
  } catch (e) {
    console.error('[adminList]', e);
    res.status(500).json({ error: e.message || 'Ошибка сервера' });
  }
};

exports.adminGet = async (req, res) => {
  try {
    const { data, error } = await getClient()
      .from('products')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    res.json(data);
  } catch (e) {
    console.error('[adminGet]', e);
    res.status(500).json({ error: e.message || 'Ошибка сервера' });
  }
};

// ─────────────────────────────────────────────
// PATCH /admin/products/:id — обновить
// Цена от админа сохраняется БЕЗ комиссии
// ─────────────────────────────────────────────
exports.adminUpdate = async (req, res) => {
  try {
    const id = req.params.id;

    const { data: existing, error: fetchErr } = await getClient()
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    const updates = {};
    const fields = [
      'title', 'description', 'category', 'city',
      'seller_name', 'seller_phone', 'seller_telegram',
      'address', 'pickup_time', 'status', 'size'
    ];

    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    // Цена от админа — сохраняем как есть, БЕЗ добавления комиссии
    if (req.body.price !== undefined) {
      updates.price = Number(req.body.price);
    }

    // Если меняется категория на sweets — убираем размер
    const newCategory = updates.category || existing.category;
    if (newCategory === 'sweets') {
      updates.size = null;
    }

    if (req.files?.length) {
      const newUrls = await Promise.all(
        req.files.map(f => uploadPhoto(f.buffer, f.originalname, f.mimetype))
      );
      updates.photos = [...(existing.photos || []), ...newUrls];
    }

    // ── Одобрение: присваиваем код AB-XXXX ─────────────────
    const isBeingApproved = updates.status === 'active' && existing.status !== 'active';

    if (isBeingApproved && !existing.code) {
      try {
        updates.code = await getNextProductCode();
      } catch (codeErr) {
        console.error('[adminUpdate] Ошибка генерации кода:', codeErr.message);
        // Не блокируем одобрение если код не удалось сгенерировать
      }
    }

    const { data, error } = await getClient()
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // ── Уведомляем продавца при смене статуса ──────────────
    if (isBeingApproved) {
      // Букеты и корзины — срок 2 дня
      if (['bouquet', 'basket'].includes(data.category)) {
        const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
        await getClient().from('products').update({ expires_at: expiresAt }).eq('id', data.id);
        data.expires_at = expiresAt;
      }
      notifySellerApproved(data).catch(() => {});
    }

    if (updates.status === 'hidden' && existing.status === 'pending') {
      notifySellerRejected(data).catch(() => {});
    }
    // ───────────────────────────────────────────────────────

    res.json(data);
  } catch (e) {
    console.error('[adminUpdate]', e);
    res.status(500).json({ error: e.message || 'Ошибка обновления' });
  }
};

exports.adminDelete = async (req, res) => {
  try {
    const { error } = await getClient()
      .from('products')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Товар удалён' });
  } catch (e) {
    console.error('[adminDelete]', e);
    res.status(500).json({ error: e.message || 'Ошибка удаления' });
  }
};
