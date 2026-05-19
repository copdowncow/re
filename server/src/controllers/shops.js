'use strict';

const { q } = require('../db/supabase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { notifyShopRegistration } = require('../services/telegram');

// POST /api/shops/register
module.exports.register = async (req, res) => {
  const { phone, password, shop_name } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: 'Телефон и пароль обязательны' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  }

  try {
    const existing = await q(sb =>
      sb.from('shop_accounts').select('id, status').eq('phone', phone).maybeSingle()
    );

    if (existing) {
      if (existing.status === 'pending')  return res.status(409).json({ error: 'Заявка уже на рассмотрении' });
      if (existing.status === 'approved') return res.status(409).json({ error: 'Магазин уже зарегистрирован' });
      if (existing.status === 'rejected') return res.status(403).json({ error: 'Ваша заявка была отклонена. Свяжитесь с администратором' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const data = await q(sb =>
      sb.from('shop_accounts')
        .insert({ phone, password_hash, shop_name: shop_name || null, status: 'pending' })
        .select()
        .single()
    );

    notifyShopRegistration(data).catch(e => console.error('notifyShopRegistration error:', e.message));

    res.status(201).json({ ok: true, message: 'Заявка отправлена. Ожидайте одобрения администратора.' });
  } catch (e) {
    console.error('[shops.register]', e.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// POST /api/shops/login
module.exports.login = async (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }

  try {
    const shop = await q(sb =>
      sb.from('shop_accounts').select('*').eq('phone', phone).maybeSingle()
    );

    if (!shop) return res.status(404).json({ error: 'Магазин не найден' });

    if (shop.status === 'pending')  return res.status(403).json({ error: 'Заявка ещё на рассмотрении администратором' });
    if (shop.status === 'rejected') return res.status(403).json({ error: 'Ваша заявка была отклонена' });

    const ok = await bcrypt.compare(password, shop.password_hash);
    if (!ok) return res.status(401).json({ error: 'Неверный пароль' });

    const token = jwt.sign(
      { id: shop.id, phone: shop.phone, shop_name: shop.shop_name, role: 'shop' },
      process.env.JWT_SECRET
    );

    res.json({ ok: true, token, shop_name: shop.shop_name, phone: shop.phone });
  } catch (e) {
    console.error('[shops.login]', e.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Вызывается из telegram callback — одобрить магазин
module.exports.approve = async (shopId) => {
  const data = await q(sb =>
    sb.from('shop_accounts')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', shopId)
      .select()
      .single()
  );
  return data;
};

// Вызывается из telegram callback — отклонить магазин
module.exports.reject = async (shopId) => {
  const data = await q(sb =>
    sb.from('shop_accounts')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', shopId)
      .select()
      .single()
  );
  return data;
};
