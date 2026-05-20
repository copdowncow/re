'use strict';
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { getClient } = require('../db/supabase');
const { notifyShopRegistration } = require('../services/telegram');

const JWT_SECRET = process.env.JWT_SECRET || 'rebuket_secret_key';

exports.register = async (req, res) => {
  try {
    const { phone, password, shop_name, city, telegram } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'Телефон и пароль обязательны' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    }

    const db = getClient();

    const { data: existing } = await db
      .from('shops')
      .select('id')
      .eq('phone', phone)
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Магазин с таким телефоном уже зарегистрирован' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const { data, error } = await db
      .from('shops')
      .insert({
        phone,
        password_hash,
        shop_name: shop_name || null,
        city:      city      || null,
        telegram:  telegram  || null,
        status:    'pending',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Уведомляем админа в Telegram
    notifyShopRegistration(data).catch(e =>
      console.log('notifyShopRegistration error:', e.message)
    );

    res.json({ ok: true, message: 'Заявка отправлена. Ожидайте одобрения администратора.' });
  } catch (e) {
    console.error('shops.register error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'Введите телефон и пароль' });
    }

    const db = getClient();

    const { data: shop, error } = await db
      .from('shops')
      .select('*')
      .eq('phone', phone)
      .single();

    if (error || !shop) {
      return res.status(401).json({ error: 'Неверный телефон или пароль' });
    }

    if (shop.status === 'pending') {
      return res.status(403).json({ error: 'Аккаунт ещё не одобрен администратором' });
    }
    if (shop.status === 'rejected') {
      return res.status(403).json({ error: 'Аккаунт отклонён. Свяжитесь с администратором.' });
    }

    const valid = await bcrypt.compare(password, shop.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверный телефон или пароль' });
    }

    const token = jwt.sign(
      { shop_id: shop.id, phone: shop.phone, role: 'shop' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      ok:        true,
      token,
      shop_name: shop.shop_name || shop.phone,
      phone:     shop.phone,
    });
  } catch (e) {
    console.error('shops.login error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

// Вызывается из telegram.js при нажатии ✅ в боте
exports.approve = async (id) => {
  const { data, error } = await getClient()
    .from('shops')
    .update({ status: 'active' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
};

exports.reject = async (id) => {
  const { data, error } = await getClient()
    .from('shops')
    .update({ status: 'rejected' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
};
