'use strict';
import { api }  from './api.js';
import { esc, fmt, toast, openModal, goPage } from './utils.js';

const COMMISSION = 0.25;
const _cache = new Map();
const CACHE_TTL = 30000;

function cached(key, fn) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return Promise.resolve(hit.data);
  return fn().then(d => { _cache.set(key, { data: d, ts: Date.now() }); return d; });
}

function imgUrl(url, w = 400) {
  if (!url) return url;
  if (url.includes('/storage/v1/object/public/')) {
    return url + (url.includes('?') ? '&' : '?') + 'width=' + w + '&quality=75';
  }
  return url;
}
function priceWithCommission(p) { return Math.ceil(Number(p) * (1 + COMMISSION)); }
function fmtPrice(p) { return Number(p).toLocaleString('ru-RU') + ' TJS'; }

const EXPIRY_CATS = ['bouquet', 'basket'];
function getTimeLeft(expiresAt) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt) - Date.now();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) { const d = Math.floor(h / 24); return d + 'д ' + (h%24) + 'ч'; }
  return h > 0 ? h + 'ч ' + m + 'м' : m + 'м';
}
function getExpiresAt(p) {
  if (p.expires_at) return p.expires_at;
  if (EXPIRY_CATS.includes(p.category) && p.created_at) {
    return new Date(new Date(p.created_at).getTime() + 2 * 24 * 3600000).toISOString();
  }
  return null;
}

function timerBadge(p) {
  if (!EXPIRY_CATS.includes(p.category)) return '';
  const ea = getExpiresAt(p);
  if (!ea) return '';
  const left = getTimeLeft(ea);
  if (!left) return '<span class="timer-badge expired">⏰ Истёк</span>';
  const urgent = (new Date(ea) - Date.now()) < 3 * 3600000;
  return '<span class="timer-badge' + (urgent ? ' urgent' : '') + '">⏰ ' + left + '</span>';
}

const CAT_LABEL = { bouquet:'Букет', basket:'Корзина', bear:'Мишка', sweets:'Сладости' };
const CAT_EM    = { bouquet:'💐', basket:'🧺', bear:'🧸', sweets:'🍰' };
const CAT_CLS   = { bouquet:'pi-bouquet', basket:'pi-basket', bear:'pi-bear', sweets:'pi-sweets' };

let _cfg = { instagram: 'https://instagram.com/rebuket', telegram: 'https://t.me/rebuket_admin' };
export async function loadConfig() {
  try { _cfg = await api.config(); } catch {}
}

// ── CATALOG ───────────────────────────────────────────────
let filters = { category:'', city:'', max_price:'', search:'', page:1 };

export async function loadCatalog(extra = {}) {
  Object.assign(filters, extra, { page:1 });
  await renderGrid();
}

async function renderGrid() {
  const grid = document.getElementById('pgrid');
  const pgn  = document.getElementById('pgn');
  grid.innerHTML = '<div class="loader">🌸 Загружаем...</div>';
  try {
    const cKey = JSON.stringify(filters);
    const r = await cached(cKey, () => api.products(filters));
    if (!r.data?.length) {
      grid.innerHTML = '<div class="empty"><span>🔍</span><h3>Ничего не найдено</h3><p>Попробуйте изменить фильтры</p></div>';
      pgn.innerHTML = ''; return;
    }
    grid.innerHTML = r.data.map(pCard).join('');
    renderPgn(r.total_pages, r.page, pgn);
  } catch(e) {
    grid.innerHTML = '<div class="empty"><span>❌</span><h3>' + e.message + '</h3></div>';
  }
}

function pCard(p) {
  const photos = Array.isArray(p.photos) ? p.photos : [];
  const img = photos[0]
    ? '<img src="' + esc(imgUrl(photos[0], 400)) + '" alt="' + esc(p.title) + '" loading="lazy" decoding="async">'
    : '<div class="pcard-ph ' + (CAT_CLS[p.category]||'') + '">' + (CAT_EM[p.category]||'🌸') + '</div>';
  return '<div class="pcard" onclick="openProduct(\'' + esc(p.slug||p.id) + '\')">' +
    '<div class="pcard-img">' + img + '<span class="pbadge">' + (CAT_LABEL[p.category]||p.category) + '</span>' + timerBadge(p) + '</div>' +
    '<div class="pcard-body">' +
      '<h4>' + esc(p.title) + '</h4>' +
      '<p>' + esc((p.description||'').substring(0,65)) + '...</p>' +
      '<div class="pmeta">' +
        '<div><span class="pprice">' + fmtPrice(priceWithCommission(p.price)) + '</span></div>' +
        '<span class="pcity">📍' + esc(p.city) + '</span>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function renderPgn(total, cur, el) {
  if (total <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = Array.from({length:total},(_,i)=>i+1)
    .map(n => '<button class="pgn-btn' + (n===cur?' active':'') + '" onclick="changePage(' + n + ')">' + n + '</button>').join('');
}
window.changePage = async n => { filters.page=n; await renderGrid(); window.scrollTo({top:0}); };

// ── PRODUCT DETAIL ────────────────────────────────────────
window.openProduct = async (slugOrId) => {
  history.pushState(null, '', '#product-' + slugOrId);
  goPage('product', false);
  const el = document.getElementById('pd-content');
  el.innerHTML = '<div class="loader" style="padding:60px">🌸 Загружаем...</div>';
  try {
    const p = await api.product(slugOrId);
    renderDetail(p, el);
  } catch(e) {
    el.innerHTML = '<div class="empty"><span>❌</span><h3>' + e.message + '</h3></div>';
  }
};

function expiryChip(p) {
  if (!EXPIRY_CATS.includes(p.category)) return '';
  const ea = getExpiresAt(p);
  if (!ea) return '';
  const l = getTimeLeft(ea);
  return '<span class="pd-chip" style="background:#fff3cd;color:#856404">⏰ Активно ещё: ' + (l || 'истёк') + '</span>';
}

function renderDetail(p, el) {
  const photos = Array.isArray(p.photos) ? p.photos : [];
  const pUrl = location.origin + '/#product-' + (p.slug||p.id);

  window._lbPhotos = photos;
  window._lbIdx = 0;

  const thumbsHtml = photos.length > 1
    ? '<div class="pd-thumbs">' + photos.map((ph,i) =>
        '<img src="' + esc(imgUrl(ph, 120)) + '" class="' + (i===0?'active':'') + '" onclick="switchThumb(\'' + esc(ph) + '\',this,' + i + ')" loading="lazy" decoding="async">'
      ).join('') + '</div>'
    : '';

  const mainImg = photos[0]
    ? '<img id="pd-main" class="pd-main" src="' + esc(imgUrl(photos[0], 800)) + '" alt="' + esc(p.title) + '" onclick="openLightbox(0)" style="cursor:zoom-in" loading="eager" decoding="async">'
    : '<div class="pd-main-ph ' + (CAT_CLS[p.category]||'') + '">' + (CAT_EM[p.category]||'🌸') + '</div>';

  const infoHtml = (p.address||p.pickup_time) ? '<div class="pd-info">' +
    (p.address     ? '<div><div class="pd-info-lbl">Адрес</div><div>📍 ' + esc(p.address) + '</div></div>' : '') +
    (p.pickup_time ? '<div><div class="pd-info-lbl">Время</div><div>🕐 ' + esc(p.pickup_time) + '</div></div>' : '') +
    '</div>' : '';

  el.innerHTML =
    '<div class="pd-wrap">' +
      '<div class="pd-gallery">' + mainImg + thumbsHtml + '</div>' +
      '<div class="pd-body">' +
        '<div class="pd-chips">' +
          '<span class="pd-chip rose">' + (CAT_LABEL[p.category]||p.category) + '</span>' +
          '<span class="pd-chip">📍 ' + esc(p.city) + '</span>' +
          '<span class="pd-chip">👁 ' + (p.view_count||0) + ' просмотров</span>' +
          expiryChip(p) +
        '</div>' +
        '<h2>' + esc(p.title) + '</h2>' +
        '<div class="pd-price">' + fmtPrice(priceWithCommission(p.price)) + '</div>' +
        '<p class="pd-desc">' + esc(p.description||'') + '</p>' +
        '<div class="share-row">🔗 <input id="share-inp" type="text" value="' + esc(pUrl) + '" readonly><button onclick="copyLink()">Копировать</button></div>' +
        infoHtml +
      '</div>' +
      '<div class="pd-contact">' +
        '<p>Хотите купить?</p>' +
        '<div class="pd-contact-btns">' +
          '<button class="btn btn-primary" onclick="openInqModal(\'' + esc(p.id) + '\',\'' + esc(p.title) + '\')">📩 Оставить заявку</button>' +
          '<a class="btn btn-ig" href="' + esc(_cfg.instagram) + '" target="_blank">📸 Instagram</a>' +
          '<a class="btn btn-tg" href="' + esc(_cfg.telegram) + '" target="_blank">✈️ Telegram</a>' +
        '</div>' +
        '<p class="pd-contact-note">Ваши данные увидит только администратор. Мы свяжемся с вами.</p>' +
      '</div>' +
    '</div>';
}

window.switchThumb = (src, el, idx) => {
  window._lbIdx = idx || 0;
  const main = document.getElementById('pd-main');
  if (main) main.src = src;
  document.querySelectorAll('.pd-thumbs img').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
};
window.copyLink = () => {
  const v = document.getElementById('share-inp')?.value;
  if (v) navigator.clipboard.writeText(v).then(() => toast('Ссылка скопирована!','ok')).catch(()=>{});
};

// ── LIGHTBOX ──────────────────────────────────────────────
window.openLightbox = (idx) => {
  const photos = window._lbPhotos || [];
  if (!photos.length) return;
  window._lbIdx = idx || 0;
  document.getElementById('lb-img').src = photos[window._lbIdx];
  document.getElementById('lightbox').style.display = 'flex';
};
window.closeLightbox = () => { document.getElementById('lightbox').style.display = 'none'; };
window.lightboxPrev = (e) => {
  e.stopPropagation();
  const p = window._lbPhotos || [];
  if (!p.length) return;
  window._lbIdx = (window._lbIdx - 1 + p.length) % p.length;
  document.getElementById('lb-img').src = p[window._lbIdx];
};
window.lightboxNext = (e) => {
  e.stopPropagation();
  const p = window._lbPhotos || [];
  if (!p.length) return;
  window._lbIdx = (window._lbIdx + 1) % p.length;
  document.getElementById('lb-img').src = p[window._lbIdx];
};

// ── INQUIRY MODAL ─────────────────────────────────────────
window.openInqModal = (pid, title) => {
  document.getElementById('inq-pid').value = pid || '';
  document.getElementById('inq-title').textContent = 'Заявка: ' + title;
  openModal('inq-modal');
};

window.showInqSuccess = function(adminUrl) {
  var old = document.getElementById('inq-success-popup');
  if (old) old.remove();

  var overlay = document.createElement('div');
  overlay.id = 'inq-success-popup';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';

  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:20px;padding:28px 24px;width:100%;max-width:360px;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.2)';

  var icon = document.createElement('div');
  icon.style.cssText = 'font-size:3rem;margin-bottom:12px';
  icon.textContent = '🌸';

  var title = document.createElement('div');
  title.style.cssText = 'font-size:1.1rem;font-weight:700;margin-bottom:8px';
  title.textContent = 'Заявка отправлена!';

  var desc = document.createElement('div');
  desc.style.cssText = 'color:#666;font-size:.9rem;margin-bottom:20px';
  desc.textContent = 'Администратор получил вашу заявку и свяжется с вами в ближайшее время.';

  var tgBtn = document.createElement('a');
  tgBtn.href = adminUrl;
  tgBtn.style.cssText = 'display:block;padding:13px;background:#229ED9;color:#fff;border-radius:12px;font-weight:700;text-decoration:none;margin-bottom:10px';
  tgBtn.textContent = '✈️ Написать в Telegram';

  var closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'width:100%;padding:12px;background:#f5f5f5;border:none;border-radius:12px;cursor:pointer;font-size:.95rem';
  closeBtn.textContent = 'Закрыть';
  closeBtn.onclick = function() { overlay.remove(); };

  box.appendChild(icon);
  box.appendChild(title);
  box.appendChild(desc);
  box.appendChild(tgBtn);
  box.appendChild(closeBtn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
};

window.submitInquiry = async () => {
  const phone = document.getElementById('inq-phone').value.trim();
  if (!phone) { toast('Введите телефон!','err'); return; }

  const btn   = document.getElementById('inq-btn');
  const name  = document.getElementById('inq-name').value.trim();
  const tg    = document.getElementById('inq-tg').value.trim();
  const note  = document.getElementById('inq-note').value.trim();
  const title = document.getElementById('inq-title').textContent.replace('Заявка: ', '');
  const pid   = document.getElementById('inq-pid').value;
  const pageUrl = pid ? (location.origin + '/#product-' + pid) : location.href;

  btn.disabled = true; btn.textContent = 'Отправляем...';
  try {
    // Получаем chat_id покупателя из Telegram
    var buyerChatId = null;
    try {
      var tgApp2 = window.Telegram?.WebApp;
      if (tgApp2?.initDataUnsafe?.user?.id) buyerChatId = String(tgApp2.initDataUnsafe.user.id);
    } catch(ex) {}

    await api.inquiry({
      product_id:        pid || undefined,
      customer_name:     name || undefined,
      customer_phone:    phone,
      customer_telegram: tg || undefined,
      note:              note || undefined,
      customer_chat_id:  buyerChatId || undefined,
    });

    window.closeModal('inq-modal');
    ['inq-name','inq-phone','inq-tg','inq-note'].forEach(id => { document.getElementById(id).value=''; });

    // Попап с кнопкой перехода в бот
    var old2 = document.getElementById('inq-success-popup');
    if (old2) old2.remove();

    var botUrl = 'https://t.me/' + ((_cfg.bot_username) || 'ReBuket_bot') + '?start=inquiry';

    var overlay = document.createElement('div');
    overlay.id = 'inq-success-popup';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:16px';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:24px;padding:32px 24px 28px;width:100%;max-width:440px;text-align:center';

    var icon = document.createElement('div');
    icon.style.cssText = 'font-size:3rem;margin-bottom:10px';
    icon.textContent = '✅';

    var ttl = document.createElement('div');
    ttl.style.cssText = 'font-size:1.15rem;font-weight:800;margin-bottom:10px;color:#1a1a1a';
    ttl.textContent = 'Заявка принята!';

    var desc = document.createElement('div');
    desc.style.cssText = 'color:#555;font-size:.9rem;line-height:1.5;margin-bottom:22px';
    desc.textContent = 'Бот уже отправил вам готовое сообщение для администратора. Откройте бота, там будет кнопка — нажмите её и отправьте.';

    var botBtn = document.createElement('a');
    botBtn.href = botUrl;
    botBtn.style.cssText = 'display:block;padding:14px;background:#8B2A3F;color:#fff;border-radius:14px;font-weight:700;font-size:1rem;text-decoration:none;margin-bottom:10px';
    botBtn.textContent = '🤖 Открыть бота';

    var closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'width:100%;padding:12px;background:#f0f0f0;border:none;border-radius:14px;cursor:pointer;font-size:.9rem;color:#666';
    closeBtn.textContent = 'Закрыть';
    closeBtn.onclick = function() { overlay.remove(); };

    box.appendChild(icon);
    box.appendChild(ttl);
    box.appendChild(desc);
    box.appendChild(botBtn);
    box.appendChild(closeBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  } catch(e) { toast('Ошибка: '+e.message,'err'); }
  finally { btn.disabled=false; btn.textContent='📩 Отправить заявку'; }
};

// ── FILTERS ───────────────────────────────────────────────
export function filterAndGo(cat) {
  const map = { Букет:'bouquet', Корзина:'basket', Мишка:'bear', Сладости:'sweets' };
  filters.category = map[cat] || '';
  goPage('catalog');
  loadCatalog();
}
window.filterAndGo = filterAndGo;

window.setCat = (cat, el) => {
  document.querySelectorAll('#cat-chips .chip').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const map = { Все:'', Букеты:'bouquet', Корзины:'basket', Мишки:'bear', Сладости:'sweets' };
  filters.category = map[cat] || '';
  loadCatalog();
};
window.applyFilters = () => {
  filters.city      = document.getElementById('f-city')?.value   || '';
  filters.max_price = document.getElementById('f-price')?.value  || '';
  filters.search    = document.getElementById('f-search')?.value || '';
  loadCatalog();
};

// ── SELL FORM ─────────────────────────────────────────────
let sellFiles = [];

window.handlePhotos = e => {
  const newFiles = Array.from(e.target.files);
  if (!newFiles.length) return;
  sellFiles = [...sellFiles, ...newFiles];
  renderSellPhotos();
  e.target.value = '';
};

function renderSellPhotos() {
  const grid = document.getElementById('sell-photo-grid');
  const hint = document.getElementById('photo-hint');
  if (!grid) return;
  grid.innerHTML = sellFiles.map((f, i) => {
    const url = URL.createObjectURL(f);
    return '<div class="photo-thumb"><img src="' + url + '"><button class="photo-del" onclick="removePhoto(' + i + ')">x</button></div>';
  }).join('');
  if (hint) {
    if (sellFiles.length === 0) {
      hint.textContent = 'Минимум 3 фото';
      hint.style.color = 'var(--gray)';
      hint.style.fontWeight = '';
    } else if (sellFiles.length < 3) {
      hint.textContent = 'Загружено ' + sellFiles.length + ' из 3 — нужно ещё ' + (3 - sellFiles.length);
      hint.style.color = '#e67e22';
      hint.style.fontWeight = '700';
    } else {
      hint.textContent = '✅ Загружено ' + sellFiles.length + ' фото — готово!';
      hint.style.color = '#27ae60';
      hint.style.fontWeight = '700';
    }
  }
}
window.removePhoto = i => { sellFiles.splice(i,1); renderSellPhotos(); };

window.selectCat = (el) => {
  document.querySelectorAll('.cat-sel').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('sell-cat-val').value = el.dataset.val;
};

window.updatePricePreview = () => {
  const val = Number(document.getElementById('sell-price').value);
  const preview = document.getElementById('price-preview');
  if (!val || val <= 0) { if(preview) preview.style.display = 'none'; return; }
  const commission = Math.ceil(val * COMMISSION);
  const total = val + commission;
  document.getElementById('price-seller').textContent     = fmtPrice(val);
  document.getElementById('price-commission').textContent = fmtPrice(commission);
  document.getElementById('price-total').textContent      = fmtPrice(total);
  if(preview) preview.style.display = 'block';
};

function getTelegramUserId() {
  try {
    const tg = window.Telegram?.WebApp;
    if (tg?.initDataUnsafe?.user?.id) return String(tg.initDataUnsafe.user.id);
  } catch {}
  return null;
}

function markField(id, valid) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.borderColor = valid ? '' : '#dc3545';
  el.style.boxShadow   = valid ? '' : '0 0 0 3px rgba(220,53,69,.15)';
}

function scrollToFirst(ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && (!el.value?.trim() || (el.tagName === 'SELECT' && !el.value))) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
      return;
    }
  }
}

// Сбрасываем подсветку при вводе
document.addEventListener('DOMContentLoaded', () => {
  ['sell-title','sell-price','sell-city','sell-phone'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => markField(id, true));
  });
});

window.submitListing = async () => {
  const title    = document.getElementById('sell-title').value.trim();
  const price    = document.getElementById('sell-price').value;
  const city     = document.getElementById('sell-city').value;
  const phone    = document.getElementById('sell-phone').value.trim();
  const category = document.getElementById('sell-cat-val')?.value;

  markField('sell-title', !!title);
  markField('sell-price', !!price);
  markField('sell-city',  !!city);
  markField('sell-phone', !!phone);

  const catEl = document.querySelector('.cat-sel-wrap');
  if (catEl) catEl.style.outline = category ? '' : '2px solid #dc3545';

  if (!title||!price||!city||!phone||!category) {
    toast('Заполните все обязательные поля!','err');
    scrollToFirst(['sell-title','sell-price','sell-city','sell-phone']);
    return;
  }
  if (sellFiles.length < 3) {
    document.getElementById('photo-hint')?.scrollIntoView({ behavior:'smooth', block:'center' });
    toast('Загрузите минимум 3 фотографии!','err');
    return;
  }

  const fd = new FormData();
  fd.append('title',           title);
  fd.append('description',     document.getElementById('sell-desc').value.trim());
  fd.append('category',        category);
  fd.append('price',           price);
  fd.append('city',            city);
  fd.append('seller_name',     document.getElementById('sell-name').value.trim());
  fd.append('seller_phone',    phone);
  fd.append('seller_telegram', document.getElementById('sell-tg').value.trim());
  fd.append('address',         document.getElementById('sell-address').value.trim());
  fd.append('pickup_time',     document.getElementById('sell-time').value.trim());
  sellFiles.forEach(f => fd.append('photos', f));
  const tgId = getTelegramUserId();
  if (tgId) fd.append('seller_chat_id', tgId);

  const btn = document.getElementById('sell-btn');
  btn.disabled = true; btn.textContent = 'Отправляем...';
  try {
    await api.addProduct(fd);
    _cache.clear();
    toast('Объявление подано! Ждет проверки.','ok');
    ['sell-title','sell-desc','sell-price','sell-phone','sell-name','sell-tg','sell-address','sell-time']
      .forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('sell-city').value = '';
    sellFiles = []; renderSellPhotos();
    setTimeout(() => goPage('catalog'), 1600);
  } catch(e) { toast('Ошибка: '+e.message,'err'); }
  finally { btn.disabled=false; btn.textContent='Разместить объявление'; }
};

// ── HOME COUNTS ───────────────────────────────────────────
export async function loadCounts() {
  try {
    const [a,b,c,d] = await Promise.all([
      api.products({category:'bouquet',limit:1}),
      api.products({category:'basket', limit:1}),
      api.products({category:'bear',   limit:1}),
      api.products({category:'sweets', limit:1}),
    ]);
    const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v+' предложений'; };
    set('cnt-bouquet', a.total); set('cnt-basket', b.total);
    set('cnt-bear',    c.total); set('cnt-sweets', d.total);
  } catch {}
}

export async function loadCities(selId) {
  try {
    const cities = await api.cities();
    const base = ['Душанбе','Худжанд','Куляб','Бохтар','Вахдат','Турсунзода','Исфара','Шахринав','Дангара','Регар','Бустон'];
    const all = [...new Set([...base, ...cities])].sort();
    const sel = document.getElementById(selId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Все города</option>' + all.map(c=>'<option>' + esc(c) + '</option>').join('');
  } catch {}
}

// ── HASH ROUTER ───────────────────────────────────────────
export function handleRoute() {
  const hash = location.hash || '#home';
  if (hash.startsWith('#product-')) {
    window.openProduct(hash.replace('#product-',''));
  } else {
    const page = hash.replace('#','') || 'home';
    const valid = ['home','catalog','sell','admin','product'];
    goPage(valid.includes(page) ? page : 'home', false);
    if (page === 'catalog') loadCatalog();
  }
}
