'use strict';
import { api }  from './api.js';
import { esc, fmt, toast, openModal, goPage } from './utils.js';

// ── Commission ───────────────────────────────────────────
const COMMISSION = 0.25; // 25%
function priceWithCommission(p) { return Math.ceil(Number(p) * (1 + COMMISSION)); }
function fmtPrice(p) { return Number(p).toLocaleString('ru-RU') + ' TJS'; }

// ── Expiry timer ─────────────────────────────────────────
const EXPIRY_CATS = ['bouquet', 'basket']; // категории с таймером

function getTimeLeft(expiresAt) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt) - Date.now();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const hr = h % 24;
    return `${d}д ${hr}ч`;
  }
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
}

function timerBadge(p) {
  if (!EXPIRY_CATS.includes(p.category) || !p.expires_at) return '';
  const left = getTimeLeft(p.expires_at);
  if (!left) return '<span class="timer-badge expired">⏰ Истёк</span>';
  const urgent = (new Date(p.expires_at) - Date.now()) < 3 * 3600000; // < 3 часов
  return `<span class="timer-badge${urgent ? ' urgent' : ''}">⏰ ${left}</span>`;
}

// ── Constants ─────────────────────────────────────────────
const CAT_LABEL = { bouquet:'Букет', basket:'Корзина', bear:'Мишка', sweets:'Сладости' };
const CAT_EM    = { bouquet:'💐', basket:'🧺', bear:'🧸', sweets:'🍰' };
const CAT_CLS   = { bouquet:'pi-bouquet', basket:'pi-basket', bear:'pi-bear', sweets:'pi-sweets' };

// Social links from server
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
    const r = await api.products(filters);
    if (!r.data?.length) {
      grid.innerHTML = '<div class="empty"><span>🔍</span><h3>Ничего не найдено</h3><p>Попробуйте изменить фильтры</p></div>';
      pgn.innerHTML = ''; return;
    }
    grid.innerHTML = r.data.map(pCard).join('');
    renderPgn(r.total_pages, r.page, pgn);
  } catch(e) {
    grid.innerHTML = `<div class="empty"><span>❌</span><h3>${e.message}</h3></div>`;
  }
}

function pCard(p) {
  const photos = Array.isArray(p.photos) ? p.photos : [];
  const img = photos[0]
    ? `<img src="${esc(photos[0])}" alt="${esc(p.title)}" loading="lazy">`
    : `<div class="pcard-ph ${CAT_CLS[p.category]||''}">${CAT_EM[p.category]||'🌸'}</div>`;
  return `<div class="pcard" onclick="openProduct('${esc(p.slug||p.id)}')">
    <div class="pcard-img">${img}<span class="pbadge">${CAT_LABEL[p.category]||p.category}</span>${timerBadge(p)}</div>
    <div class="pcard-body">
      <h4>${esc(p.title)}</h4>
      <p>${esc((p.description||'').substring(0,65))}…</p>
      <div class="pmeta">
        <div>
          <span class="pprice">${fmtPrice(priceWithCommission(p.price))}</span>
          <span style="font-size:.75rem;color:var(--gray);display:block">продавец получит ${fmtPrice(p.price)}</span>
        </div>
        <span class="pcity">📍${esc(p.city)}</span>
      </div>
    </div>
  </div>`;
}

function renderPgn(total, cur, el) {
  if (total <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = Array.from({length:total},(_,i)=>i+1)
    .map(n => `<button class="pgn-btn${n===cur?' active':''}" onclick="changePage(${n})">${n}</button>`).join('');
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
    el.innerHTML = `<div class="empty"><span>❌</span><h3>${e.message}</h3></div>`;
  }
};

function renderDetail(p, el) {
  const photos = Array.isArray(p.photos) ? p.photos : [];
  const pUrl = `${location.origin}/#product-${p.slug||p.id}`;

  const thumbsHtml = photos.length > 1
    ? `<div class="pd-thumbs">${photos.map((ph,i) =>
        `<img src="${esc(ph)}" class="${i===0?'active':''}" onclick="switchThumb('${esc(ph)}',this)" loading="lazy">`
      ).join('')}</div>`
    : '';

  const mainImg = photos[0]
    ? `<img id="pd-main" class="pd-main" src="${esc(photos[0])}" alt="${esc(p.title)}">`
    : `<div class="pd-main-ph ${CAT_CLS[p.category]||''}">${CAT_EM[p.category]||'🌸'}</div>`;

  el.innerHTML = `
  <div class="pd-wrap">
    <div class="pd-gallery">${mainImg}${thumbsHtml}</div>
    <div class="pd-body">
      <div class="pd-chips">
        <span class="pd-chip rose">${CAT_LABEL[p.category]||p.category}</span>
        <span class="pd-chip">📍 ${esc(p.city)}</span>
        <span class="pd-chip">👁 ${p.view_count||0} просмотров</span>
        ${EXPIRY_CATS.includes(p.category) && p.expires_at ? `<span class="pd-chip" style="background:#fff3cd;color:#856404">⏰ Активно ещё: ${getTimeLeft(p.expires_at) || 'истёк'}</span>` : ''}
      </div>
      <h2>${esc(p.title)}</h2>
      <div class="pd-price">${fmtPrice(priceWithCommission(p.price))}</div>
      <div style="font-size:.82rem;color:var(--gray);margin-top:-6px;margin-bottom:10px">
        Цена с комиссией площадки 25% · продавец получит ${fmtPrice(p.price)}
      </div>
      <p class="pd-desc">${esc(p.description||'')}</p>
      <div class="share-row">
        🔗 <input id="share-inp" type="text" value="${esc(pUrl)}" readonly>
        <button onclick="copyLink()">Копировать</button>
      </div>
      ${p.address||p.pickup_time ? `<div class="pd-info">
        ${p.address    ? `<div><div class="pd-info-lbl">Адрес</div><div>📍 ${esc(p.address)}</div></div>` : ''}
        ${p.pickup_time? `<div><div class="pd-info-lbl">Время</div><div>🕐 ${esc(p.pickup_time)}</div></div>` : ''}
      </div>` : ''}
    </div>
    <div class="pd-contact">
      <p>Хотите купить?</p>
      <div class="pd-contact-btns">
        <button class="btn btn-primary" onclick="openInqModal('${esc(p.id)}','${esc(p.title)}')">📩 Оставить заявку</button>
        <a class="btn btn-ig"  href="${esc(_cfg.instagram)}" target="_blank">📸 Instagram</a>
        <a class="btn btn-tg"  href="${esc(_cfg.telegram)}"  target="_blank">✈️ Telegram</a>
      </div>
      <p class="pd-contact-note">Ваши данные увидит только администратор. Мы свяжемся с вами.</p>
    </div>
  </div>`;
}

window.switchThumb = (src, el) => {
  const main = document.getElementById('pd-main');
  if (main) main.src = src;
  document.querySelectorAll('.pd-thumbs img').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
};
window.copyLink = () => {
  const v = document.getElementById('share-inp')?.value;
  if (v) navigator.clipboard.writeText(v).then(() => toast('Ссылка скопирована!','ok')).catch(()=>{});
};

// ── INQUIRY MODAL ─────────────────────────────────────────
window.openInqModal = (pid, title) => {
  document.getElementById('inq-pid').value = pid || '';
  document.getElementById('inq-title').textContent = 'Заявка: ' + title;
  openModal('inq-modal');
};
window.submitInquiry = async () => {
  const phone = document.getElementById('inq-phone').value.trim();
  if (!phone) { toast('Введите телефон!','err'); return; }
  const btn = document.getElementById('inq-btn');
  btn.disabled = true; btn.textContent = 'Отправляем…';
  try {
    await api.inquiry({
      product_id:       document.getElementById('inq-pid').value || undefined,
      customer_name:    document.getElementById('inq-name').value.trim() || undefined,
      customer_phone:   phone,
      customer_telegram:document.getElementById('inq-tg').value.trim() || undefined,
      note:             document.getElementById('inq-note').value.trim() || undefined,
    });
    closeModal('inq-modal');
    toast('✅ Заявка отправлена! Мы свяжемся с вами.','ok');
    ['inq-name','inq-phone','inq-tg','inq-note'].forEach(id => { document.getElementById(id).value=''; });
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
    return `<div class="photo-thumb"><img src="${url}"><button class="photo-del" onclick="removePhoto(${i})">×</button></div>`;
  }).join('');
  if (hint) hint.textContent = sellFiles.length < 3
    ? `Загружено ${sellFiles.length} из 3 (минимум 3 фото)`
    : `✅ Загружено ${sellFiles.length} фото`;
}
window.removePhoto = i => { sellFiles.splice(i,1); renderSellPhotos(); };

window.updatePricePreview = () => {
  const val = Number(document.getElementById('sell-price').value);
  const preview = document.getElementById('price-preview');
  if (!val || val <= 0) { preview.style.display = 'none'; return; }
  const commission = Math.ceil(val * COMMISSION);
  const total      = val + commission;
  document.getElementById('price-seller').textContent     = fmtPrice(val);
  document.getElementById('price-commission').textContent = fmtPrice(commission);
  document.getElementById('price-total').textContent      = fmtPrice(total);
  preview.style.display = 'block';
};

window.submitListing = async () => {
  const title    = document.getElementById('sell-title').value.trim();
  const price    = document.getElementById('sell-price').value;
  const city     = document.getElementById('sell-city').value;
  const phone    = document.getElementById('sell-phone').value.trim();
  const category = document.querySelector('input[name="sell-cat"]:checked')?.value;

  if (!title||!price||!city||!phone||!category) { toast('Заполните все обязательные поля!','err'); return; }
  if (sellFiles.length < 3) { toast('Загрузите минимум 3 фотографии!','err'); return; }

  const fd = new FormData();
  fd.append('title',    title);
  fd.append('description', document.getElementById('sell-desc').value.trim());
  fd.append('category', category);
  fd.append('price',    price);
  fd.append('city',     city);
  fd.append('seller_name',     document.getElementById('sell-name').value.trim());
  fd.append('seller_phone',    phone);
  fd.append('seller_telegram', document.getElementById('sell-tg').value.trim());
  fd.append('address',         document.getElementById('sell-address').value.trim());
  fd.append('pickup_time',     document.getElementById('sell-time').value.trim());
  sellFiles.forEach(f => fd.append('photos', f));

  const btn = document.getElementById('sell-btn');
  btn.disabled = true; btn.textContent = 'Отправляем…';
  try {
    await api.addProduct(fd);
    toast('✅ Объявление подано! Ждёт проверки.','ok');
    ['sell-title','sell-desc','sell-price','sell-phone','sell-name','sell-tg','sell-address','sell-time']
      .forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('sell-city').value = '';
    sellFiles = []; renderSellPhotos();
    setTimeout(() => goPage('catalog'), 1600);
  } catch(e) { toast('Ошибка: '+e.message,'err'); }
  finally { btn.disabled=false; btn.textContent='✅ Разместить объявление'; }
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
    const all = [...new Set(['Душанбе','Худжand','Куляб','Бохтар','Курган-Тюбе','Вахдат','Турсунзода','Исфара','Шахринав','Дангара','Регар','Чкаловск','Канибадам',...cities])].sort();
    const sel = document.getElementById(selId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Все города</option>' + all.map(c=>`<option>${esc(c)}</option>`).join('');
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