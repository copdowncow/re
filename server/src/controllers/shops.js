
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
  var modal = document.getElementById('store-modal');
  if (modal) modal.classList.add('open');
  clearLoginForm();
}

function clearLoginForm() {
  var phoneEl = document.getElementById('store-phone-login');
  var passEl  = document.getElementById('store-pass-login');
  var msgEl   = document.getElementById('store-login-msg');
  if (phoneEl) phoneEl.value = '';
  if (passEl)  passEl.value  = '';
  if (msgEl)   msgEl.textContent = '';
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

  var btn = document.querySelector('#store-tab-login .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Входим…'; }
  msgEl.style.color = 'var(--gray)';
  msgEl.textContent = '';

  fetch('/api/shops/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: phone, password: password })
  })
  .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
  .then(function(res) {
    if (btn) { btn.disabled = false; btn.textContent = 'Войти в магазин'; }
    if (!res.ok) {
      msgEl.style.color = 'var(--red)';
      msgEl.textContent = res.d.error || 'Ошибка входа';
      return;
    }
    localStorage.setItem('shop_token', res.d.token);
    localStorage.setItem('shop_name',  res.d.shop_name || res.d.phone);
    clearLoginForm();
    document.getElementById('store-modal').classList.remove('open');
    updateShopUI();
    shopToast('✅ Добро пожаловать, ' + (res.d.shop_name || res.d.phone) + '!', 'success');
  })
  .catch(function() {
    if (btn) { btn.disabled = false; btn.textContent = 'Войти в магазин'; }
    msgEl.style.color = 'var(--red)';
    msgEl.textContent = 'Ошибка соединения с сервером';
  });
}

/* =====================================================
   РЕГИСТРАЦИЯ МАГАЗИНА — отдельная страница
===================================================== */

function goToRegisterPage() {
  /* Закрываем модал входа, переходим на страницу регистрации */
  var modal = document.getElementById('store-modal');
  if (modal) modal.classList.remove('open');
  if (typeof goPage === 'function') goPage('register');
}

function storeDoRegister() {
  var shop_name = document.getElementById('reg-shop-name').value.trim();
  var phone     = document.getElementById('reg-phone').value.trim();
  var city      = document.getElementById('reg-city').value;
  var tg        = document.getElementById('reg-tg').value.trim();
  var password  = document.getElementById('reg-pass').value;
  var pass2     = document.getElementById('reg-pass2').value;
  var msgEl     = document.getElementById('reg-msg');

  msgEl.textContent = '';

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
  if (password !== pass2) {
    msgEl.style.color = 'var(--red)';
    msgEl.textContent = 'Пароли не совпадают';
    return;
  }

  var btn = document.getElementById('reg-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Отправляем заявку…'; }
  msgEl.style.color = 'var(--gray)';
  msgEl.textContent = '';

  fetch('/api/shops/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone:     phone,
      password:  password,
      shop_name: shop_name,
      city:      city,
      telegram:  tg
    })
  })
  .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
  .then(function(res) {
    if (btn) { btn.disabled = false; btn.textContent = 'Отправить заявку'; }
    if (!res.ok) {
      msgEl.style.color = 'var(--red)';
      msgEl.textContent = res.d.error || 'Ошибка регистрации';
      return;
    }
    /* Успех — показываем финальный экран */
    var formEl    = document.getElementById('reg-form-wrap');
    var successEl = document.getElementById('reg-success');
    if (formEl)    formEl.style.display   = 'none';
    if (successEl) successEl.style.display = 'flex';
  })
  .catch(function() {
    if (btn) { btn.disabled = false; btn.textContent = 'Отправить заявку'; }
    msgEl.style.color = 'var(--red)';
    msgEl.textContent = 'Ошибка соединения с сервером';
  });
}

/* Простой toast без зависимости от модуля */
function shopToast(msg, type) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._st);
  el._st = setTimeout(function() { el.classList.remove('show'); }, 3600);
}

/* Инициализация при загрузке страницы */
document.addEventListener('DOMContentLoaded', function() {
  updateShopUI();

  /* Закрытие overlay по клику на фон */
  var storeOverlay = document.getElementById('store-modal');
  if (storeOverlay) {
    storeOverlay.addEventListener('click', function(e) {
      if (e.target === storeOverlay) storeOverlay.classList.remove('open');
    });
  }
});
