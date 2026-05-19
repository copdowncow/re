'use strict';
import { api }  from './api.js';
import { esc, fmt, toast, openModal, goPage } from './utils.js';

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

function getCommission(category) {
  return category === 'sweets' ? 0.10 : 0.25;
}

function priceWithCommission(p) {
  if (p.is_admin_price) return Number(p.price);
  return Math.ceil((Number(p.price) * (1 + getCommission(p.category))).toFixed(2) / 10) * 10;
}

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

// ── pCard with photo scroll + add-to-cart button ──────────
let _cardUid = 0;
function pCard(p) {
  const photos = Array.isArray(p.photos) ? p.photos : [];
  const price  = priceWithCommission(p);
  const uid    = 'pci' + (++_cardUid);
  const pJson  = JSON.stringify(p).replace(/\\/g,'\\\\').replace(/"/g,'&quot;').replace(/'/g,"\\'");

  // ── photo area ──
  let photoHtml;
  if (photos.length === 0) {
    photoHtml =
      '<div class="pcard-img-wrap">' +
        '<div class="pcard-img">' +
          '<div class="pcard-ph ' + (CAT_CLS[p.category]||'') + '">' + (CAT_EM[p.category]||'🌸') + '</div>' +
        '</div>' +
      '</div>';
  } else if (photos.length === 1) {
    photoHtml =
      '<div class="pcard-img-wrap">' +
        '<div class="pcard-img">' +
          '<img src="' + esc(imgUrl(photos[0], 400)) + '" alt="' + esc(p.title) + '" loading="lazy" decoding="async">' +
        '</div>' +
      '</div>';
  } else {
    const imgs = photos.map(ph =>
      '<img src="' + esc(imgUrl(ph, 400)) + '" alt="' + esc(p.title) + '" loading="lazy" decoding="async">'
    ).join('');
    const dots = photos.map((_, i) =>
      '<span class="img-dot' + (i===0?' active':'') + '" onclick="event.stopPropagation();_scrollCard(\'' + uid + '\',' + i + ')"></span>'
    ).join('');
    photoHtml =
      '<div class="pcard-img-wrap" id="' + uid + '-wrap">' +
        '<button class="img-arrow left"  onclick="event.stopPropagation();_scrollCard(\'' + uid + '\',-1,true)">&#8249;</button>' +
        '<button class="img-arrow right" onclick="event.stopPropagation();_scrollCard(\'' + uid + '\', 1,true)">&#8250;</button>' +
        '<div class="pcard-img" id="' + uid + '" onscroll="_syncDots(\'' + uid + '\')">' +
          imgs +
        '</div>' +
        '<div class="img-dots">' + dots + '</div>' +
      '</div>';
  }

  // ── badge row ──
  const badges =
    '<span class="pbadge">' + (CAT_LABEL[p.category]||p.category) + '</span>' +
    timerBadge(p);

  return (
    '<div class="pcard" onclick="openProduct(\'' + esc(p.slug||p.id) + '\')">' +
      photoHtml.replace('>', '>' + badges.replace(/'/g, "\\'")).replace('>' + badges.replace(/'/g, "\\'"), '') +
      /* badges are inside the wrap — rebuild properly: */
      '' +
    '</div>'
  );

  // ↑ rebuild cleanly:
}

// rebuild pCard cleanly to avoid string replacement mess
function pCard(p) {
  const photos = Array.isArray(p.photos) ? p.photos : [];
  const price  = priceWithCommission(p);
  const uid    = 'pci' + (++_cardUid);
  const slug   = esc(p.slug || p.id);

  // encode p for onclick (safe JSON attr)
  const pAttr = encodeURIComponent(JSON.stringify(p));

  // ── photo block ──
  let photoBlock;
  if (photos.length === 0) {
    photoBlock =
      '<div class="pcard-img-wrap">' +
        '<div class="pcard-img" id="' + uid + '">' +
          '<div class="pcard-ph ' + (CAT_CLS[p.category]||'') + '">' + (CAT_EM[p.category]||'🌸') + '</div>' +
        '</div>' +
        '<span class="pbadge">' + esc(CAT_LABEL[p.category]||p.category) + '</span>' +
        timerBadge(p) +
      '</div>';
  } else if (photos.length === 1) {
    photoBlock =
      '<div class="pcard-img-wrap">' +
        '<div class="pcard-img" id="' + uid + '">' +
          '<img src="' + esc(imgUrl(photos[0],400)) + '" alt="' + esc(p.title) + '" loading="lazy" decoding="async">' +
        '</div>' +
        '<span class="pbadge">' + esc(CAT_LABEL[p.category]||p.category) + '</span>' +
        timerBadge(p) +
      '</div>';
  } else {
    const imgs = photos.map(ph =>
      '<img src="' + esc(imgUrl(ph,400)) + '" alt="' + esc(p.title) + '" loading="lazy" decoding="async">'
    ).join('');
    const dots = photos.map((_,i) =>
      '<span class="img-dot' + (i===0?' active':'') + '" onclick="event.stopPropagation();_scrollCard(\'' + uid + '\',' + i + ')"></span>'
    ).join('');
    photoBlock =
      '<div class="pcard-img-wrap" id="' + uid + '-wrap">' +
        '<button class="img-arrow left"  onclick="event.stopPropagation();_scrollCard(\'' + uid + '\',-1,true)">&#8249;</button>' +
        '<button class="img-arrow right" onclick="event.stopPropagation();_scrollCard(\'' + uid + '\', 1,true)">&#8250;</button>' +
        '<div class="pcard-img" id="' + uid + '" onscroll="_syncDots(\'' + uid + '\')">' + imgs + '</div>' +
        '<span class="pbadge">' + esc(CAT_LABEL[p.category]||p.category) + '</span>' +
        timerBadge(p) +
        '<div class="img-dots">' + dots + '</div>' +
      '</div>';
  }

  return (
    '<div class="pcard" onclick="openProduct(\'' + slug + '\')">' +
      photoBlock +
      '<div class="pcard-body">' +
        '<h4>' + esc(p.title) + '</h4>' +
        '<p>' + esc((p.description||'').substring(0,65)) + '...</p>' +
        '<div class="pmeta">' +
          '<span class="pprice">' + fmtPrice(price) + '</span>' +
          '<span class="pcity">📍' + esc(p.city) + '</span>' +
        '</div>' +
        '<button class="pcard-cart-btn" id="' + uid + '-cartbtn" onclick="event.stopPropagation();_pCardAddToCart(\'' + uid + '\',\'' + pAttr + '\')">' +
          '<span style="font-size:1rem">🛒</span> Добавить в корзину' +
        '</button>' +
      '</div>' +
    '</div>'
  );
}

// ── scroll helpers (global) ───────────────────────────────
window._scrollCard = (uid, dirOrIdx, isRelative) => {
  const el = document.getElementById(uid);
  if (!el) return;
  if (isRelative) {
    const cur = Math.round(el.scrollLeft / el.clientWidth);
    const imgs = el.querySelectorAll('img');
    const next = Math.max(0, Math.min(imgs.length - 1, cur + dirOrIdx));
    el.scrollTo({ left: el.clientWidth * next, behavior: 'smooth' });
  } else {
    el.scrollTo({ left: el.clientWidth * dirOrIdx, behavior: 'smooth' });
  }
};

window._syncDots = (uid) => {
  const el   = document.getElementById(uid);
  const wrap = document.getElementById(uid + '-wrap');
  if (!el || !wrap) return;
  const idx = Math.round(el.scrollLeft / el.clientWidth);
  wrap.querySelectorAll('.img-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
};

window._pCardAddToCart = (uid, pAttr) => {
  const p = JSON.parse(decodeURIComponent(pAttr));
  const price = priceWithCommission(p);
  const emoji = CAT_EM[p.category] || '🌸';
  const photos = Array.isArray(p.photos) ? p.photos : [];
  if (window.addToCart) {
    window.addToCart({ id: p.id || p.pub_id, title: p.title, price, city: p.city, size: p.size, img: photos[0] || null, emoji });
  }
  const btn = document.getElementById(uid + '-cartbtn');
  if (btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Добавлено'; btn.classList.add('added'); btn.disabled = true;
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('added'); btn.disabled = false; }, 1800);
  }
};

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
  const price  = priceWithCommission(p);
  const pUrl   = location.origin + '/#product-' + (p.slug||p.id);
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

  // store p for cart button
  window._detailProduct = p;
  window._detailPrice   = price;

  el.innerHTML =
    '<div class="pd-wrap">' +
      '<div class="pd-gallery">' + mainImg + thumbsHtml + '</div>' +
      '<div class="pd-body">' +
        '<div class="pd-chips">' +
          '<span class="pd-chip rose">' + esc(CAT_LABEL[p.category]||p.category) + '</span>' +
          '<span class="pd-chip">📍 ' + esc(p.city) + '</span>' +
          '<span class="pd-chip">👁 ' + (p.view_count||0) + ' просмотров</span>' +
          expiryChip(p) +
        '</div>' +
        '<h2>' + esc(p.title) + '</h2>' +
        '<div class="pd-price">' + fmtPrice(price) + '</div>' +
        '<p class="pd-desc">' + esc(p.description||'') + '</p>' +
        '<div class="share-row">🔗 <input id="share-inp" type="text" value="' + esc(pUrl) + '" readonly><button onclick="copyLink()">Копировать</button></div>' +
        infoHtml +
        // ── ADD TO CART BUTTON ──
        '<button class="pd-cart-btn" id="pd-detail-cartbtn" onclick="_pdDetailAddToCart(this)">' +
          '<span style="font-size:1.2rem">🛒</span> Добавить в корзину' +
        '</button>' +
        '<div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">' +
          '<a class="btn btn-tg" href="' + esc(_cfg.telegram) + '" target="_blank" style="flex:1;min-width:140px;border-radius:14px;padding:13px 18px">✈️ Telegram</a>' +
          '<a class="btn btn-ig" href="' + esc(_cfg.instagram) + '" target="_blank" style="flex:1;min-width:140px;border-radius:14px;padding:13px 18px">📸 Instagram</a>' +
        '</div>' +
      '</div>' +
    '</div>';
}

window._pdDetailAddToCart = (btn) => {
  const p = window._detailProduct;
  if (!p) return;
  const price  = window._detailPrice || priceWithCommission(p);
  const photos = Array.isArray(p.photos) ? p.photos : [];
  const emoji  = CAT_EM[p.category] || '🌸';
  if (window.addToCart) {
    window.addToCart({ id: p.id || p.pub_id, title: p.title, price, city: p.city, size: p.size, img: photos[0] || null, emoji });
  }
  if (btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = '<span style="font-size:1.2rem">✓</span> Добавлено в корзину!';
    btn.classList.add('added'); btn.disabled = true;
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('added'); btn.disabled = false; }, 2000);
  }
};

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

// ── INQUIRY MODAL (kept for admin workflows) ──────────────
window.openInqModal = (pid, title, slug) => {
  document.getElementById('inq-pid').value   = pid   || '';
  document.getElementById('inq-slug').value  = slug  || pid || '';
  document.getElementById('inq-title').textContent = 'Заявка: ' + title;
  openModal('inq-modal');
};

window.submitInquiry = async () => {
  const phone = document.getElementById('inq-phone').value.trim();
  if (!phone) { toast('Введите телефон!', 'err'); return; }

  const btn   = document.getElementById('inq-btn');
  const name  = document.getElementById('inq-name').value.trim();
  const tg    = document.getElementById('inq-tg').value.trim();
  const note  = document.getElementById('inq-note').value.trim();
  const title = document.getElementById('inq-title').textContent.replace('Заявка: ', '');
  const pid   = document.getElementById('inq-pid').value;
  const slug  = document.getElementById('inq-slug')?.value || pid;
  const pageUrl = slug ? (location.origin + '/#product-' + slug) : location.href;

  btn.disabled = true; btn.textContent = 'Отправляем...';
  try {
    let buyerChatId = null;
    try {
      const tgW = window.Telegram?.WebApp;
      if (tgW?.initDataUnsafe?.user?.id) buyerChatId = String(tgW.initDataUnsafe.user.id);
    } catch(ex) {}

    await api.inquiry({
      product_id:        pid        || undefined,
      customer_name:     name       || undefined,
      customer_phone:    phone,
      customer_telegram: tg         || undefined,
      note:              note       || undefined,
      customer_chat_id:  buyerChatId|| undefined,
    });

    window.closeModal('inq-modal');
    ['inq-name','inq-phone','inq-tg','inq-note'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const NL = '\n';
    let msg = '🌸 Здравствуйте! Хочу купить:' + NL + NL;
    msg += '📦 ' + title + NL;
    msg += '📞 Мой телефон: ' + phone + NL;
    if (name) msg += '👤 Имя: '        + name + NL;
    if (tg)   msg += '✈️ Telegram: '   + tg   + NL;
    if (note) msg += '📝 Комментарий: '+ note + NL;
    msg += NL + '🔗 ' + pageUrl;

    const adminRaw    = (_cfg.telegram || 'https://t.me/Rebuket_admin');
    const adminHandle = adminRaw.replace('https://t.me/', '').replace('@', '').trim();
    const adminUrl    = 'https://t.me/' + adminHandle + '?text=' + encodeURIComponent(msg);

    const oldP = document.getElementById('inq-popup');
    if (oldP) oldP.remove();

    const ov = document.createElement('div');
    ov.id = 'inq-popup';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:16px';

    const bx = document.createElement('div');
    bx.style.cssText = 'background:#fff;border-radius:24px;padding:32px 24px 28px;width:100%;max-width:440px;text-align:center';

    const ic = document.createElement('div');
    ic.style.cssText = 'font-size:3rem;margin-bottom:10px';
    ic.textContent = '✅';

    const tl = document.createElement('div');
    tl.style.cssText = 'font-size:1.15rem;font-weight:800;margin-bottom:10px;color:#1a1a1a';
    tl.textContent = 'Заявка принята!';

    const ds = document.createElement('div');
    ds.style.cssText = 'color:#555;font-size:.9rem;line-height:1.5;margin-bottom:22px';
    ds.textContent = 'Скопируйте готовое сообщение, откройте чат администратора и вставьте его.';

    const ta = document.createElement('textarea');
    ta.value = msg;
    ta.readOnly = true;
    ta.style.cssText = 'width:100%;height:120px;border:1px solid #eee;border-radius:10px;padding:10px;font-size:.82rem;resize:none;background:#f9f9f9;margin-bottom:10px;box-sizing:border-box;text-align:left';

    const cpBtn = document.createElement('button');
    cpBtn.style.cssText = 'width:100%;padding:13px;background:#8B2A3F;color:#fff;border-radius:14px;font-weight:700;font-size:1rem;border:none;cursor:pointer;margin-bottom:8px';
    cpBtn.textContent = '📋 Скопировать сообщение';
    cpBtn.onclick = () => {
      navigator.clipboard.writeText(msg).then(() => {
        cpBtn.textContent = '✅ Скопировано!';
        setTimeout(() => cpBtn.textContent = '📋 Скопировать сообщение', 2000);
      }).catch(() => { ta.select(); document.execCommand('copy'); });
    };

    const bb = document.createElement('a');
    bb.href = adminUrl;
    bb.style.cssText = 'display:block;padding:13px;background:#229ED9;color:#fff;border-radius:14px;font-weight:700;font-size:1rem;text-decoration:none;margin-bottom:10px';
    bb.textContent = '✈️ Открыть чат администратора';

    const cb = document.createElement('button');
    cb.style.cssText = 'width:100%;padding:12px;background:#f0f0f0;border:none;border-radius:14px;cursor:pointer;font-size:.9rem;color:#666';
    cb.textContent = 'Закрыть';
    cb.onclick = () => ov.remove();

    bx.appendChild(ic); bx.appendChild(tl); bx.appendChild(ds);
    bx.appendChild(ta); bx.appendChild(cpBtn); bx.appendChild(bb); bx.appendChild(cb);
    ov.appendChild(bx);
    document.body.appendChild(ov);

  } catch(e) { toast('Ошибка: ' + e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = '📩 Отправить заявку'; }
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
  filters.city      = document.getElementById('f-city')?.value      || '';
  filters.min_price = document.getElementById('f-price-min')?.value || '';
  filters.max_price = document.getElementById('f-price-max')?.value || '';
  filters.search    = document.getElementById('f-search')?.value    || '';
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

window.selectSize = (val, el) => {
  document.querySelectorAll('#size-chips .chip').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('sell-size').value = val;
  document.getElementById('size-error').style.display = 'none';
};

window.selectGiftWhen = (val, el) => {
  document.querySelectorAll('#gift-when-chips .chip').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('sell-gift-when').value = val;
  document.getElementById('gift-when-error').style.display = 'none';
};

function updateSizeField(catVal) {
  const sizeField = document.getElementById('size-field');
  if (!sizeField) return;

  const needsSize = ['bouquet', 'basket', 'bear'].includes(catVal);
  sizeField.style.display = needsSize ? '' : 'none';

  if (!needsSize) {
    document.getElementById('sell-size').value = '';
    document.querySelectorAll('#size-chips .chip').forEach(b => b.classList.remove('active'));
    return;
  }

  const chipsWrap = document.getElementById('size-chips-wrap');
  const textWrap  = document.getElementById('size-text-wrap');

  if (catVal === 'bear') {
    if (chipsWrap) chipsWrap.style.display = 'none';
    if (textWrap)  textWrap.style.display  = '';
    document.getElementById('sell-size').value = '';
  } else {
    if (chipsWrap) chipsWrap.style.display = '';
    if (textWrap)  textWrap.style.display  = 'none';
    document.getElementById('sell-size').value = '';
    document.querySelectorAll('#size-chips .chip').forEach(b => b.classList.remove('active'));
  }
}

window.selectCat = (el) => {
  document.querySelectorAll('.cat-sel').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  const val = el.dataset.val;
  document.getElementById('sell-cat-val').value = val;
  updateSizeField(val);
};

window.updateBearSizeInput = () => {
  const val = document.getElementById('sell-size-text')?.value.trim();
  const hidden = document.getElementById('sell-size');
  if (hidden) hidden.value = val ? val + ' см' : '';
  const err = document.getElementById('size-error');
  if (err && val) err.style.display = 'none';
};

window.updatePricePreview = () => {
  const val = Number(document.getElementById('sell-price').value);
  const cat = document.getElementById('sell-cat-val')?.value || '';
  const preview = document.getElementById('price-preview');
  if (!val || val <= 0) { if(preview) preview.style.display = 'none'; return; }
  const rate = getCommission(cat);
  const total = Math.ceil((val * (1 + rate)).toFixed(2) / 10) * 10;
  document.getElementById('price-seller').textContent = fmtPrice(val);
  document.getElementById('price-total').textContent  = fmtPrice(total);
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

document.addEventListener('DOMContentLoaded', () => {
  ['sell-title','sell-price','sell-city','sell-phone','sell-address'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => markField(id, true));
  });

  const catVal = document.getElementById('sell-cat-val')?.value;
  if (catVal) updateSizeField(catVal);
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

  if (category === 'bear') {
    const bearText = document.getElementById('sell-size-text')?.value.trim();
    const hidden = document.getElementById('sell-size');
    if (hidden) hidden.value = bearText ? bearText + ' см' : '';
  }

  const size = document.getElementById('sell-size')?.value;
  const needsSize = ['bouquet','basket','bear'].includes(category);
  if (needsSize && !size) {
    document.getElementById('size-error').style.display = 'block';
    document.getElementById('size-field')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const giftWhen = document.getElementById('sell-gift-when')?.value;
  if (!giftWhen) {
    document.getElementById('gift-when-error').style.display = 'block';
    document.getElementById('gift-when-chips')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const address = document.getElementById('sell-address').value.trim();
  markField('sell-address', !!address);

  if (!title||!price||!city||!phone||!category||!address) {
    toast('Заполните все обязательные поля!','err');
    scrollToFirst(['sell-title','sell-price','sell-city','sell-phone','sell-address']);
    return;
  }
  if (needsSize && !size) {
    toast(category === 'bear' ? 'Введите размер мишки!' : 'Выберите размер!','err');
    return;
  }
  if (!giftWhen) {
    toast('Укажите когда получили!','err');
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
  fd.append('gift_when',        giftWhen);
  if (size) fd.append('size', size);
  const marketPrice = document.getElementById('sell-market-price')?.value;
  if (marketPrice) fd.append('market_price', marketPrice);
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
    document.getElementById('sell-gift-when').value = '';
    document.querySelectorAll('#gift-when-chips .chip').forEach(b => b.classList.remove('active'));
    const mpEl = document.getElementById('sell-market-price'); if (mpEl) mpEl.value = '';
    document.getElementById('sell-size').value = '';
    const sizeText = document.getElementById('sell-size-text'); if (sizeText) sizeText.value = '';
    document.querySelectorAll('#size-chips .chip').forEach(b => b.classList.remove('active'));
    const sf = document.getElementById('size-field'); if (sf) sf.style.display = 'none';
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
