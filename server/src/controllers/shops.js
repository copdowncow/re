/* =====================================================
   shop.js — авторизация магазина (глобальный скрипт)
===================================================== */

function updateShopUI() {
  var name  = localStorage.getItem('shop_name');
  var token = localStorage.getItem('shop_token');
  var btn   = document.getElementById('nav-shop-btn');
  var lbl   = document.getElementById('nav-shop-label');
  var dlbl  = document.getElementById('drawer-shop-label');
  if (token && name) {
    if (lbl)  lbl.textContent  = '🏪 ' + name;
    if (dlbl) dlbl.textContent = '🏪 ' + name + ' (выйти)';
    if (btn)  btn.classList.add('logged-in');
  } else {
    if (lbl)  lbl.textContent  = 'Войти как магазин';
    if (dlbl) dlbl.textContent = 'Войти как магазин';
    if (btn)  btn.classList.remove('logged-in');
  }
}

function onShopBtnClick() {
  var token = localStorage.getItem('shop_token');
  if (token) {
    if (confirm('Выйти из аккаунта магазина?')) {
      localStorage.removeItem('shop_token');
      localStorage.removeItem('shop_name');
      updateShopUI();
      shopToast('Вы вышли из аккаунта магазина');
    }
  } else {
    openStoreModal();
  }
}

function openStoreModal() {
  document.getElementById('store-modal').classList.add('open');
  switchStoreTab('login');
}

function switchStoreTab(tab) {
  var isLogin = tab === 'login';
  document.getElementById('store-tab-login').style.display    = isLogin ? '' : 'none';
  document.getElementById('store-tab-register').style.display = isLogin ? 'none' : '';
  document.getElementById('stab-login').classList.toggle('active', isLogin);
  document.getElementById('stab-reg').classList.toggle('active', !isLogin);
  var loginMsg = document.getElementById('store-login-msg');
  var regMsg   = document.getElementById('store-reg-msg');
  if (loginMsg) loginMsg.textContent = '';
  if (regMsg)   regMsg.textContent   = '';
}

function storeDoLogin() {
  var phone    = document.getElementById('store-phone-login').value.trim();
  var password = document.getElementById('store-pass-login').value;
  var msgEl    = document.getElementById('store-login-msg');

  if (!phone || !password) {
    msgEl.style.color = 'var(--red)';
    msgEl.textContent = 'Введите телефон и пароль';
    return;
  }
  msgEl.style.color = 'var(--gray)';
  msgEl.textContent = 'Входим…';

  fetch('/api/shops/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: phone, password: password })
  })
  .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
  .then(function(res) {
    if (!res.ok) {
      msgEl.style.color = 'var(--red)';
      msgEl.textContent = res.d.error || 'Ошибка входа';
      return;
    }
    localStorage.setItem('shop_token', res.d.token);
    localStorage.setItem('shop_name',  res.d.shop_name || res.d.phone);
    document.getElementById('store-phone-login').value = '';
    document.getElementById('store-pass-login').value  = '';
    msgEl.textContent = '';
    document.getElementById('store-modal').classList.remove('open');
    updateShopUI();
    shopToast('✅ Добро пожаловать, ' + (res.d.shop_name || res.d.phone) + '!', 'success');
  })
  .catch(function() {
    msgEl.style.color = 'var(--red)';
    msgEl.textContent = 'Ошибка соединения с сервером';
  });
}

function storeDoRegister() {
  var shop_name = document.getElementById('store-reg-name').value.trim();
  var phone     = document.getElementById('store-reg-phone').value.trim();
  var password  = document.getElementById('store-reg-pass').value;
  var msgEl     = document.getElementById('store-reg-msg');

  if (!phone || !password) {
    msgEl.style.color = 'var(--red)';
    msgEl.textContent = 'Телефон и пароль обязательны';
    return;
  }
  if (password.length < 6) {
    msgEl.style.color = 'var(--red)';
    msgEl.textContent = 'Пароль минимум 6 символов';
    return;
  }
  msgEl.style.color = 'var(--gray)';
  msgEl.textContent = 'Отправляем заявку…';

  fetch('/api/shops/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: phone, password: password, shop_name: shop_name })
  })
  .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
  .then(function(res) {
    if (!res.ok) {
      msgEl.style.color = 'var(--red)';
      msgEl.textContent = res.d.error || 'Ошибка регистрации';
      return;
    }
    msgEl.style.color = '#0f6b34';
    msgEl.textContent = '✅ Заявка отправлена! Администратор рассмотрит её и одобрит доступ.';
    document.getElementById('store-reg-name').value  = '';
    document.getElementById('store-reg-phone').value = '';
    document.getElementById('store-reg-pass').value  = '';
  })
  .catch(function() {
    msgEl.style.color = 'var(--red)';
    msgEl.textContent = 'Ошибка соединения с сервером';
  });
}

function shopToast(msg, type) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._st);
  el._st = setTimeout(function() { el.classList.remove('show'); }, 3600);
}

document.addEventListener('DOMContentLoaded', function() {
  updateShopUI();
  var storeOverlay = document.getElementById('store-modal');
  if (storeOverlay) {
    storeOverlay.addEventListener('click', function(e) {
      if (e.target === storeOverlay) storeOverlay.classList.remove('open');
    });
  }
});
