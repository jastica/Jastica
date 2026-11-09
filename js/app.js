/**
 * ============================================================
 * JASTICA — Frontend JavaScript
 * Prinsip: SPA instan (semua halaman dirender dari state lokal),
 * optimistic UI + localStorage, sinkronisasi latar belakang,
 * satu panggilan batch per aksi ke server.
 * ============================================================
 */

// ════════════════════════════════════════════════════════
// BAGIAN 1: STATE & PENYIMPANAN LOKAL
// ════════════════════════════════════════════════════════
// v1.3: selisih jam server − jam perangkat. v1.4: dihitung saat data awal segar tiba dari server (lihat terapkanBootBaru);
// data awal dari salinan lokal tidak dipakai untuk ini karena jam servernya sudah lama.
window.__jstSkew = 0;
const COLLS = ['orders', 'orderItems', 'customers', 'purchases', 'payments', 'wallets', 'transactions', 'expenses', 'invoices', 'reminders', 'users', 'allItems', 'allTrips', 'vouchers', 'poin', 'reviews'];
const S = {
  boot: bootSalinan() || {}, // v1.4: salinan data awal di perangkat → tampil instan; versi segar menyusul dari API
  token: null,
  me: null,
  settings: {},
  d: {},
  saldo: {},
  ver: 0,
  customer: null,
  cart: [],
  route: null,
  params: {},
  ui: {},
  lastSync: 0,
  online: true
};
COLLS.forEach(c => { S.d[c] = []; });

const store = {
  get(k, def) { try { const v = localStorage.getItem('jst_' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('jst_' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem('jst_' + k); } catch (e) { /* abaikan */ } }
};
const isInternal = () => !!S.me && S.me.role !== 'customer';
const isCustomer = () => !!S.me && S.me.role === 'customer';
const can = p => !!S.me && (S.me.role === 'superadmin' || (S.me.perms || []).includes(p));
const canAny = ps => ps.some(can);
const sett = () => (isInternal() && S.settings && S.settings.appName ? S.settings : (S.boot.settings || {}));
const kurs = () => S.boot.kurs || { rates: { IDR: 1 } };
const countries = () => S.boot.countries || [];

/** Simpan salinan data ke localStorage (ditunda agar tidak memblok UI). */
let _persistT = null;
function persist() {
  clearTimeout(_persistT);
  // v1.3.1: data kecil → localStorage, data besar → IndexedDB (localStorage hanya ±5 MB); ditunda agar tidak memberatkan klik
  _persistT = setTimeout(() => { if (S.me) simpanSalinan(); }, 1200);
}

// ════════════════════════════════════════════════════════
// BAGIAN 2: UTILITAS FORMAT & DOM
// ════════════════════════════════════════════════════════
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const rp = n => 'Rp ' + nf0.format(Math.round(Number(n) || 0));
const num = (n, d) => (d ? nf2 : nf0).format(Number(n) || 0);
const toNum = v => { const n = Number(String(v === undefined || v === null ? '' : v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const toFloat = v => { const s = String(v === undefined || v === null ? '' : v).trim().replace(/\s/g, ''); if (!s) return 0; const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s.replace(/,/g, '')); return isFinite(n) ? n : 0; };
function rpShort(n) {
  n = Number(n) || 0; const a = Math.abs(n);
  if (a >= 1e9) return 'Rp ' + nf2.format(n / 1e9) + ' M';
  if (a >= 1e6) return 'Rp ' + nf2.format(Math.round(n / 1e4) / 100) + ' jt';
  if (a >= 1e3) return 'Rp ' + nf0.format(n / 1e3) + ' rb';
  return rp(n);
}
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  const s = String(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
  return isNaN(d) ? null : d;
}
function ymd(v) {
  const d = v ? toDate(v) : new Date();
  if (!d) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const tgl = v => { const d = toDate(v); return d ? d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear() : '-'; };
const tglPendek = v => { const d = toDate(v); return d ? d.getDate() + ' ' + BULAN[d.getMonth()] : '-'; };
const jam = v => { const d = toDate(v); return d ? String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0') : ''; };
const tglJam = v => { const d = toDate(v); return d ? tglPendek(d) + ' • ' + jam(d) : '-'; };
function relatif(v) {
  const d = toDate(v); if (!d) return '-';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'baru saja';
  if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
  if (s < 86400 * 7) return Math.floor(s / 86400) + ' hari lalu';
  return tgl(d);
}
const addDays = (v, n) => { const d = toDate(v) || new Date(); const x = new Date(d); x.setDate(x.getDate() + n); return ymd(x); };
const daysBetween = (a, b) => Math.round((toDate(ymd(b)) - toDate(ymd(a))) / 864e5);
const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
// Fokus awal yang sopan: tidak merebut fokus bila pengguna/autofill sudah mengisi kolom lain,
// dan tidak memunculkan keyboard otomatis di layar sentuh.
function fokusAwal(sel) {
  requestAnimationFrame(() => {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (!el || !el.offsetParent) return;
    const a = document.activeElement;
    if (a && a !== document.body && a !== el && a.matches('input,textarea,select,[contenteditable]')) return;
    if (!matchMedia('(pointer:fine)').matches) return;
    el.focus({ preventScroll: true });
  });
}
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
const colorIdx = s => { let h = 0; String(s || '').split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) | 0; }); return Math.abs(h) % 5; };
const avatar = (nama, cls = '') => `<span class="avatar ${cls}" data-c="${colorIdx(nama)}" aria-hidden="true">${esc(initials(nama))}</span>`;
const normHP = v => { let s = String(v || '').replace(/[^\d]/g, ''); if (s.startsWith('0')) s = '62' + s.slice(1); else if (s.startsWith('8')) s = '62' + s; return s; };
const fmtHP = v => { const s = normHP(v); return s ? '+' + s.slice(0, 2) + ' ' + s.slice(2, 5) + '-' + s.slice(5, 9) + '-' + s.slice(9) : '-'; };
const waLink = (hp, text) => 'https://wa.me/' + normHP(hp) + (text ? '?text=' + encodeURIComponent(text) : '');
const negara = kode => countries().find(c => c.kode === kode) || { kode: kode || 'ID', nama: kode || '-', mataUang: 'IDR' };
const flag = kode => `<span class="fi fi-${String(kode || 'id').toLowerCase()}" aria-hidden="true"></span>`;
const negaraTag = kode => `<span class="tag">${flag(kode)} ${esc(negara(kode).nama)}</span>`;
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pill = (txt, cls) => `<span class="pill st-${cls || slug(txt)}">${esc(txt)}</span>`;
const ROLE_LABEL = { superadmin: 'Super Admin', owner: 'Owner', keuangan: 'Admin Keuangan', staff: 'Staff', customer: 'Customer' };
const KAT_IKON = { Snack: 'bi-basket2-fill', Kosmetik: 'bi-brush-fill', Skincare: 'bi-droplet-half', Fashion: 'bi-bag-heart-fill', Minuman: 'bi-cup-straw', Elektronik: 'bi-phone-fill', Lainnya: 'bi-box-seam-fill' };
function fotoItem(it, w = 600) {
  if (!it) return '';
  if (it.FotoFileId) return 'https://lh3.googleusercontent.com/d/' + it.FotoFileId + '=w' + w;
  return it.FotoURL || '';
}
function prodImg(it, cls = 'prod-img') {
  const src = fotoItem(it);
  const neg = it.Negara || 'ID';
  // v1.3.5: foto utuh (tidak terpotong) di atas ikon cadangan; ikon tampil lagi bila foto gagal dimuat
  return `<div class="${cls} g-${esc(neg)}${src ? ' has-foto' : ''}"><i class="ph bi ${KAT_IKON[it.Kategori] || 'bi-bag-fill'}" aria-hidden="true"></i>${src ? `<img src="${esc(src)}" alt="${esc(it.Nama)}" loading="lazy" onerror="this.parentNode.classList.remove('has-foto');this.remove()">` : ''}</div>`;
}
const driveView = id => 'https://drive.google.com/file/d/' + id + '/preview';
const driveDl = id => 'https://drive.google.com/uc?export=download&id=' + id;
const driveImg = (id, w = 1200) => 'https://lh3.googleusercontent.com/d/' + id + '=w' + w;
function emptyState(icon, title, text, btn) {
  return `<div class="empty"><div class="ill"><i class="bi ${icon}"></i></div><h4>${esc(title)}</h4><p>${esc(text || '')}</p>${btn || ''}</div>`;
}
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function setBusy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin" aria-hidden="true"></span>${label ? ' ' + esc(label) : ''}`; }
  else if (btn.dataset.html !== undefined) { btn.innerHTML = btn.dataset.html; btn.disabled = false; delete btn.dataset.html; }
}
function formData(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { if (!(v instanceof File)) o[k] = typeof v === 'string' ? v.trim() : v; });
  $$('input[type=checkbox][name]', form).forEach(c => { if (!c.dataset.multi) o[c.name] = c.checked; });
  return o;
}
function fieldErr(form, name, msg) {
  const el = form.querySelector(`[name="${name}"]`);
  if (!el) return;
  el.classList.add('is-invalid');
  let m = el.parentElement.querySelector('.invalid-msg');
  if (!m) { m = document.createElement('div'); m.className = 'invalid-msg'; el.closest('.mb-3, .col, [class*="col-"], .fgrp')?.appendChild(m) || el.after(m); }
  m.innerHTML = `<i class="bi bi-exclamation-circle"></i>${esc(msg)}`;
  el.focus();
}
function clearErr(form) { $$('.is-invalid', form).forEach(e => e.classList.remove('is-invalid')); $$('.invalid-msg', form).forEach(e => e.remove()); }

// ════════════════════════════════════════════════════════
// BAGIAN 3: TOAST, MODAL, KONFIRMASI, DRAWER, PRATINJAU
// ════════════════════════════════════════════════════════
function toast(msg, type = 'info', title) {
  const box = $('#toasts');
  const ic = { success: 'bi-check-lg', error: 'bi-x-lg', warning: 'bi-exclamation-lg', info: 'bi-info-lg' }[type] || 'bi-info-lg';
  const el = document.createElement('div');
  el.className = 'tst ' + type;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span class="ic"><i class="bi ${ic}"></i></span><div class="tx">${title ? `<b>${esc(title)}</b>` : ''}${esc(msg)}</div><button aria-label="Tutup notifikasi">&times;</button>`;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  el.querySelector('button').onclick = close;
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(close, type === 'error' ? 7000 : 4200);
}
let _mdl = null;
function modal({ title, body, foot = '', size = '', onShow, static: st } = {}) {
  const el = $('#mdl');
  $('#mdlTitle').textContent = title || '';
  $('#mdlBody').innerHTML = body || '';
  $('#mdlFoot').innerHTML = foot;
  $('#mdlDialog').className = 'modal-dialog modal-dialog-centered modal-dialog-scrollable ' + (size ? 'modal-' + size : '');
  _mdl = bootstrap.Modal.getOrCreateInstance(el, { backdrop: st ? 'static' : true });
  if (onShow) el.addEventListener('shown.bs.modal', () => onShow($('#mdlBody')), { once: true });
  _mdl.show();
  return $('#mdlBody');
}
function closeModal() { if (_mdl) _mdl.hide(); }
function confirmDlg({ title = 'Yakin?', text = '', ok = 'Ya, lanjutkan', danger = false, icon } = {}) {
  return new Promise(resolve => {
    const el = $('#mdlConfirm');
    $('#cfTitle').textContent = title;
    $('#cfText').textContent = text;
    $('#cfIcon').className = 'cf-icon ' + (danger ? 'danger' : '');
    $('#cfIcon').innerHTML = `<i class="bi ${icon || (danger ? 'bi-trash3' : 'bi-question-lg')}"></i>`;
    const yes = $('#cfYes');
    yes.textContent = ok;
    yes.className = 'btn flex-fill ' + (danger ? 'btn-danger' : 'btn-primary');
    const m = bootstrap.Modal.getOrCreateInstance(el);
    let done = false;
    yes.onclick = () => { done = true; m.hide(); resolve(true); };
    el.addEventListener('hidden.bs.modal', () => { if (!done) resolve(false); }, { once: true });
    m.show();
  });
}
let _drawer = null;
function drawer(title, body, foot = '') {
  $('#drawerTitle').innerHTML = title;
  $('#drawerBody').innerHTML = body;
  $('#drawerFoot').innerHTML = foot;
  _drawer = bootstrap.Offcanvas.getOrCreateInstance($('#drawer'));
  if ($('#drawer').classList.contains('show')) $('#drawer').focus({ preventScroll: true }); else _drawer.show();
}
function closeDrawer() { if (_drawer) _drawer.hide(); }
function preview({ fileId, url, nama }) {
  const isImg = !fileId || /\.(png|jpe?g|webp|gif)$/i.test(nama || '') || /lh3\.google/.test(url || '');
  $('#pvTitle').textContent = nama || 'Pratinjau';
  $('#pvBody').innerHTML = fileId && !isImg
    ? `<iframe class="preview-frame" src="${esc(driveView(fileId))}" title="${esc(nama || 'Dokumen')}" allow="autoplay"></iframe>`
    : `<div class="p-3 text-center"><img class="preview-img" src="${esc(fileId ? driveImg(fileId) : url)}" alt="${esc(nama || 'Gambar')}" onerror="this.outerHTML='<iframe class=&quot;preview-frame&quot; src=&quot;${esc(fileId ? driveView(fileId) : url)}&quot;></iframe>'"></div>`;
  const dl = $('#pvDownload');
  dl.href = fileId ? driveDl(fileId) : url;
  bootstrap.Modal.getOrCreateInstance($('#mdlPreview')).show();
}

// ════════════════════════════════════════════════════════
// BAGIAN 4: API — fetch ke Web App Apps Script (v1.4: frontend di GitHub Pages, backend REST API JSON)
// ════════════════════════════════════════════════════════
let _inflight = 0;
function syncBar(on) {
  const b = $('#syncBar');
  if (!b) return;
  _inflight += on ? 1 : -1;
  if (_inflight > 0) { b.className = 'sync-bar on'; }
  else { _inflight = 0; b.className = 'sync-bar done'; setTimeout(() => { if (!_inflight) b.className = 'sync-bar'; }, 700); }
}
// v1.3.1 (gas-scale-turbo): bacaan identik yang sedang berjalan dipakai bersama; setiap tulisan menaikkan epoch
let _writeEpoch = 0;
const _bacaJalan = {};
const BACA_BERSAMA = /^(data\.(all|sync)|auth\.cek|rahasia\.status|wa\.status|audit\.list)$/;
function api(action, data = {}, opt = {}) {
  if (!BACA_BERSAMA.test(action)) return apiRun(action, data, opt);
  const k = _writeEpoch + '|' + action + '|' + JSON.stringify(data || {});
  if (_bacaJalan[k]) return _bacaJalan[k];
  const p = apiRun(action, data, opt);
  _bacaJalan[k] = p;
  p.then(() => { delete _bacaJalan[k]; });
  return p;
}
function apiRun(action, data = {}, opt = {}) {
  return new Promise(resolve => {
    const url = gasUrl();
    if (!url) { resolve({ success: false, code: 'NO_CONFIG', message: 'Alamat server belum diatur: isi GAS_URL di js/config.js dengan URL /exec dari Apps Script.' }); return; }
    if (!opt.silent) syncBar(true);
    ambilTokenTerbaru(); // v1.3: tab lain mungkin sudah memperpanjang sesi
    const done = res => {
      if (!opt.silent) syncBar(false);
      res = res || { success: false, message: 'Respons kosong dari server.' };
      if (res.tok) terimaToken(res.tok, res.tokExp); // v1.3: sesi bergulir (batas diam)
      if (res.prevVer !== undefined) _writeEpoch++;    // ada tulisan: hasil sinkron yang dimulai sebelumnya dianggap basi
      if (!res.success && kodeSesiHabis(res.code) && S.token) sessionEnded(res);
      resolve(res);
    };
    // POST text/plain = "simple request" → tidak ada preflight CORS; token sesi di badan permintaan, bukan di URL
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const batas = setTimeout(() => { if (ctl) ctl.abort(); }, opt.timeout || 120000);
    fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: S.token || null, data: data || {} }),
      redirect: 'follow', credentials: 'omit', cache: 'no-store', signal: ctl ? ctl.signal : undefined
    })
      .then(r => r.text().then(t => {
        clearTimeout(batas);
        let j = null;
        try { j = JSON.parse(t); } catch (e) { j = null; }
        done(j && typeof j === 'object' ? j : { success: false, code: 'BAD_RESPONSE', message: pesanBukanJson(r.status, t) });
      }))
      .catch(err => {
        clearTimeout(batas);
        done({ success: false, code: 'NET', message: err && err.name === 'AbortError' ? 'Server terlalu lama merespons. Coba lagi sebentar.' : 'Koneksi ke server gagal. Periksa internet Anda.' });
      });
  });
}

// ── Penggabungan perubahan dari server ke state lokal ──
function txEffect(t) { return t ? (t.Tipe === 'Masuk' ? 1 : -1) * (Number(t.Jumlah) || 0) : 0; }
function applyChanges(res) {
  const ch = res.changes || {}, rm = res.removed || {};
  Object.keys(rm).forEach(coll => {
    if (!S.d[coll]) return;
    const ids = new Set(rm[coll]);
    if (coll === 'transactions') S.d.transactions.filter(t => ids.has(t.ID)).forEach(t => { S.saldo[t.WalletID] = (S.saldo[t.WalletID] || 0) - txEffect(t); });
    S.d[coll] = S.d[coll].filter(r => !ids.has(r.ID));
  });
  Object.keys(ch).forEach(coll => {
    if (!S.d[coll]) S.d[coll] = [];
    ch[coll].forEach(rec => upsertLocal(coll, rec, true));
    if (coll === 'items') ch[coll].forEach(rec => upsertLocal('allItems', rec, true));
    if (coll === 'trips') ch[coll].forEach(rec => upsertLocal('allTrips', rec, true));
  });
  if (ch.items || rm.items || ch.trips || rm.trips) refreshBootLists();
  if (res.stat && S.boot) { S.boot.stat = res.stat; _ix = {}; } // v1.3.4: terjual, rating, sisa stok terbaru
  // Customer menyimpan datanya sendiri di S.customer (saldo poin, alamat)
  if (ch.customers && S.me && S.me.role === 'customer') { const mine = ch.customers.find(c => c.ID === S.me.customerId); if (mine) S.customer = Object.assign({}, S.customer || {}, mine); }
  if (res.prevVer !== undefined) {
    if (res.prevVer === S.ver) S.ver = res.ver;
    else scheduleSync(800);
  }
  _ix = {};
  persist();
}
function upsertLocal(coll, rec, fromServer) {
  const arr = S.d[coll] || (S.d[coll] = []);
  const i = arr.findIndex(r => r.ID === rec.ID);
  const prev = i > -1 ? arr[i] : null;
  if (coll === 'transactions') {
    if (prev) S.saldo[prev.WalletID] = (S.saldo[prev.WalletID] || 0) - txEffect(prev);
    S.saldo[rec.WalletID] = (S.saldo[rec.WalletID] || 0) + txEffect(rec);
  }
  if (coll === 'wallets' && prev) S.saldo[rec.ID] = (S.saldo[rec.ID] || 0) + (Number(rec.SaldoAwal) - Number(prev.SaldoAwal));
  if (coll === 'wallets' && !prev && fromServer && S.saldo[rec.ID] === undefined) S.saldo[rec.ID] = Number(rec.SaldoAwal) || 0;
  const merged = prev ? Object.assign({}, prev, rec) : rec;
  if (fromServer) delete merged._pending; // data resmi server menggantikan versi sementara
  if (i > -1) arr[i] = merged; else arr.unshift(merged);
  _ix = {};
  return () => { // fungsi pembatalan (rollback optimistic)
    const j = arr.findIndex(r => r.ID === rec.ID);
    if (coll === 'transactions') {
      S.saldo[rec.WalletID] = (S.saldo[rec.WalletID] || 0) - txEffect(rec);
      if (prev) S.saldo[prev.WalletID] = (S.saldo[prev.WalletID] || 0) + txEffect(prev);
    }
    if (prev) arr[j > -1 ? j : 0] = prev; else if (j > -1) arr.splice(j, 1);
    _ix = {};
  };
}
function removeLocal(coll, id) {
  const arr = S.d[coll] || [];
  const i = arr.findIndex(r => r.ID === id);
  if (i < 0) return () => {};
  const prev = arr[i];
  if (coll === 'transactions') S.saldo[prev.WalletID] = (S.saldo[prev.WalletID] || 0) - txEffect(prev);
  arr.splice(i, 1);
  _ix = {};
  return () => { arr.splice(i, 0, prev); if (coll === 'transactions') S.saldo[prev.WalletID] = (S.saldo[prev.WalletID] || 0) + txEffect(prev); _ix = {}; };
}
function refreshBootLists() {
  if (!S.d.allItems.length && !S.d.allTrips.length) return;
  const today = ymd();
  S.boot.items = S.d.allItems.filter(i => i.Aktif);
  S.boot.trips = S.d.allTrips.filter(t => t.Status !== 'Selesai' && String(t.TglSelesai) >= addDays(today, -1));
}

/**
 * Optimistic mutation: UI berubah seketika, server menyusul di latar belakang.
 * Gagal → semua perubahan lokal dibatalkan dan pengguna diberi tahu.
 */
async function mutate(action, data, { optimistic, btn, busyLabel, quiet, onOk, onFail, rerenderView = true } = {}) {
  let undo = null;
  if (optimistic) { try { undo = optimistic(); } catch (e) { console.error(e); } if (rerenderView) rerender(); }
  setBusy(btn, true, busyLabel);
  const res = await api(action, data);
  setBusy(btn, false);
  if (res.success) {
    applyChanges(res);
    if (!quiet || res.level) toast(res.message, res.level || 'success');
    if (onOk) onOk(res);
  } else {
    if (undo) { try { (Array.isArray(undo) ? undo.slice().reverse() : [undo]).forEach(u => u && u()); } catch (e) { console.error(e); } }
    if (!kodeSesiHabis(res.code)) toast(res.message, 'error', 'Gagal');
    if (onFail) onFail(res);
  }
  if (rerenderView) rerender();
  return res;
}

// ── Indeks cepat (dibangun ulang hanya bila data berubah) ──
let _ix = {};
function ix(name, build) { if (!_ix[name]) _ix[name] = build(); return _ix[name]; }
const itemsOf = orderId => ix('itemsByOrder', () => { const m = new Map(); S.d.orderItems.forEach(i => { if (!m.has(i.OrderID)) m.set(i.OrderID, []); m.get(i.OrderID).push(i); }); return m; }).get(orderId) || [];
const paysOf = orderId => ix('paysByOrder', () => { const m = new Map(); S.d.payments.forEach(p => { if (!m.has(p.OrderID)) m.set(p.OrderID, []); m.get(p.OrderID).push(p); }); return m; }).get(orderId) || [];
const orderById = id => ix('orderMap', () => new Map(S.d.orders.map(o => [o.ID, o]))).get(id);
const custById = id => ix('custMap', () => new Map(S.d.customers.map(c => [c.ID, c]))).get(id);
const walletById = id => ix('walMap', () => new Map(S.d.wallets.map(w => [w.ID, w]))).get(id);
const invById = id => ix('invMap', () => new Map(S.d.invoices.map(i => [i.ID, i]))).get(id);
const userName = id => { const u = (S.d.users || []).find(x => x.ID === id); return u ? u.Nama : (id === 'setup' ? 'Sistem' : (id ? 'Customer' : '-')); };
const ordersSorted = () => ix('ordersSorted', () => S.d.orders.slice().sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal))));

// ════════════════════════════════════════════════════════
// BAGIAN 5: MESIN HARGA (cermin dari server untuk pratinjau instan)
// ════════════════════════════════════════════════════════
const kursOf = mu => mu === 'IDR' ? 1 : Number((kurs().rates || {})[mu]) || 0;
const muOf = kode => negara(kode).mataUang || 'IDR';
const aturanJasa = neg => (sett().jastipRules || []).find(r => r.negara === neg) || { tipe: 'persen', nilai: 10, minimal: 0 };
function hitungItem(it) {
  const neg = it.negara || 'ID';
  const mu = it.mataUang || muOf(neg);
  const qty = Math.max(1, Math.round(Number(it.qty) || 1));
  const harga = Math.max(0, Number(it.hargaAsli) || 0);
  const k = mu === 'IDR' ? 1 : (Number(it.kurs) || kursOf(mu));
  const hargaIDR = Math.round(harga * k);
  // v1.3.3: harga jual katalog (Rp/pcs); 0 = sama dengan harga toko. Jasa titip dihitung dari harga yang dibayar member.
  const hjSet = Math.max(0, Math.round(Number(it.hargaJual) || 0));
  const hargaJual = hjSet > 0 ? hjSet : hargaIDR;
  const a = aturanJasa(neg);
  let tipe = a.tipe, nilai = Number(a.nilai) || 0, minimal = Number(a.minimal) || 0;
  const ji = jasaItemOf(it.jasaItem); // v1.3.5: jasa titip per barang katalog (Rp/pcs)
  if (ji !== null) { tipe = 'nominal'; nilai = ji; minimal = 0; }
  if (it.jasaTipe) { tipe = it.jasaTipe; nilai = Math.max(0, Number(it.jasaNilai) || 0); minimal = 0; }
  let jasa = tipe === 'persen' ? Math.round(hargaJual * qty * nilai / 100) : tipe === 'nominal' ? Math.round(nilai * qty) : Math.round(nilai);
  if (minimal > 0 && jasa < minimal) jasa = minimal;
  return { negara: neg, mataUang: mu, qty, hargaAsli: harga, kurs: k, hargaIDR, hargaJual, hargaJualSet: hjSet, margin: (hargaJual - hargaIDR) * qty, jasaTipe: tipe, jasaNilai: nilai, jasaIDR: jasa, subtotal: hargaJual * qty + jasa };
}
/** Cermin totalOrder_ server. opt (v1.1): tanpaJasa, tanpaOngkir, pengiriman, potonganVoucher, potonganPoin. */
function totalOrder(items, ongkir = 0, diskon = 0, dibayar = 0, opt = {}) {
  const jual = i => i.hargaJual === undefined ? i.hargaIDR : i.hargaJual; // v1.3.3: harga yang dibayar member
  if (opt.tanpaJasa) items = items.map(i => Object.assign({}, i, { jasaIDR: 0, subtotal: jual(i) * i.qty }));
  const subtotal = items.reduce((s, i) => s + jual(i) * i.qty, 0);
  const jasa = items.reduce((s, i) => s + i.jasaIDR, 0);
  const ong = opt.tanpaOngkir || opt.pengiriman === 'Pickup' ? 0 : Math.max(0, Number(ongkir) || 0);
  const dis = Math.max(0, Number(diskon) || 0);
  const pv = Math.max(0, Math.round(Number(opt.potonganVoucher) || 0)), pp = Math.max(0, Math.round(Number(opt.potonganPoin) || 0));
  const total = Math.max(0, subtotal + jasa + ong - dis - pv - pp);
  const bayar = Math.max(0, Number(dibayar) || 0);
  const modal = items.reduce((s, i) => s + (Number(i.hargaIDR) || 0) * i.qty, 0); // v1.3.3: harga pokok (harga toko × kurs)
  return { subtotal, jasa, ongkir: ong, diskon: dis, potonganVoucher: pv, potonganPoin: pp, total, dibayar: bayar, sisa: Math.max(0, total - bayar), statusBayar: total > 0 && bayar >= total ? 'Lunas' : bayar > 0 ? 'DP' : 'Belum Lunas', modal, margin: subtotal - modal };
}
// ── v1.1: poin, voucher, tampilan jasa & katalog member ──
const poinCfg = () => { const s = sett(); return { aktif: s.poinAktif !== false, per: Math.max(1, Number(s.poinPerRupiah) || 1000), nilai: Number(s.poinNilai) > 0 ? Number(s.poinNilai) : 1, min: Math.max(0, Number(s.poinMinTukar) || 0) }; };
const fmtPoin = n => num(Math.round(Number(n) || 0)) + ' poin';
/** Potongan voucher dari spesifikasi yang dikembalikan server (voucher.cek); server tetap menghitung ulang. */
function potonganVoucher(v, base) {
  if (!v) return 0;
  base = Math.max(0, Math.round(Number(base) || 0));
  if (base < (Number(v.minBelanja) || 0)) return 0;
  let p = v.tipe === 'persen' ? Math.round(base * (Number(v.nilai) || 0) / 100) : Math.round(Number(v.nilai) || 0);
  if (v.tipe === 'persen' && Number(v.maksPotongan) > 0) p = Math.min(p, Number(v.maksPotongan));
  return Math.max(0, Math.min(p, base));
}
const labelVoucher = v => v.tipe === 'persen' ? `Diskon ${num(v.nilai, 2).replace(/,00$/, '')}%${Number(v.maksPotongan) ? ' (maks. ' + rpShort(v.maksPotongan) + ')' : ''}` : 'Potongan ' + rp(v.nilai);
/** Label jasa titip di portal member: rincian persen/minimal bisa disembunyikan owner. */
function labelJasaMember(neg) {
  const s = sett(); const lbl = s.memberJasaLabel || 'Jasa titip';
  if (s.memberJasaRinci === false || !neg) return lbl;
  const a = aturanJasa(neg);
  return `${lbl} (${a.tipe === 'persen' ? a.nilai + '%' : rp(a.nilai)}${a.minimal ? ', min. ' + rpShort(a.minimal) : ''})`;
}
// ── v1.2: jasa titip disembunyikan dari member → digabung ke harga barang (total tidak berubah) ──
const jasaGabung = () => sett().memberJasaGabung === true;
/** Harga per barang yang dilihat member di katalog (qty 1). Mode gabung: sudah termasuk jasa titip. */
function hargaMember(it) { return hargaKartu(it).harga; } // v1.3.5: varian termurah + jasa titip per barang
/** Negara yang dibuka untuk member (cermin negaraTerbuka_ server). */
function negaraTerbuka() {
  const s = sett(); const semua = countries().map(c => c.kode);
  let n = [];
  if (s.katalogMode === 'manual') n = (s.katalogNegara || []).filter(k => semua.includes(k));
  else if (s.katalogMode === 'trip') (S.boot.trips || []).forEach(t => { if (t.Status === 'Aktif' && !n.includes(t.Negara)) n.push(t.Negara); });
  return n.length ? n : semua;
}
const countriesMember = () => { const n = negaraTerbuka(); return countries().filter(c => n.includes(c.kode)); };
const fmtAsli = (mu, v) => mu === 'IDR' ? rp(v) : mu + ' ' + num(v, mu === 'JPY' ? 0 : 2);
const fmtKurs = v => nf2.format(Number(v) || 0);

// ════════════════════════════════════════════════════════
// BAGIAN 6: BERKAS — kompres gambar di browser sebelum dikirim
// ════════════════════════════════════════════════════════
function bacaBerkas(file, { maxW = 1600, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.size > 15 * 1024 * 1024) return reject(new Error('Ukuran berkas maksimal 15 MB.'));
    if (file.type === 'application/pdf') {
      if (file.size > 8 * 1024 * 1024) return reject(new Error('PDF maksimal 8 MB.'));
      const r = new FileReader();
      r.onload = () => resolve({ base64: String(r.result).split(',')[1], mime: file.type, nama: file.name });
      r.onerror = () => reject(new Error('Gagal membaca berkas.'));
      r.readAsDataURL(file);
      return;
    }
    if (!/^image\//.test(file.type)) return reject(new Error('Pilih gambar (JPG/PNG/WebP) atau PDF.'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, maxW / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const data = c.toDataURL('image/jpeg', quality);
      resolve({ base64: data.split(',')[1], mime: 'image/jpeg', nama: file.name.replace(/\.\w+$/, '') + '.jpg', preview: data });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gambar tidak dapat dibaca.')); };
    img.src = url;
  });
}
function dropzone(name, label = 'Klik atau seret berkas ke sini', accept = 'image/*,application/pdf') {
  return `<div class="dropzone" data-dz="${name}"><input type="file" accept="${accept}" data-file="${name}" aria-label="${esc(label)}"><i class="bi bi-cloud-arrow-up"></i><div><b>${esc(label)}</b></div><small>JPG, PNG, WebP, atau PDF · gambar dikompres otomatis</small><div class="dz-preview" data-dzp="${name}"></div></div>`;
}
const _files = {};
async function onFilePicked(input) {
  const name = input.dataset.file;
  const file = input.files[0];
  const prev = document.querySelector(`[data-dzp="${name}"]`);
  try {
    if (prev) prev.innerHTML = '<span class="spin" style="width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;display:inline-block;animation:spin .7s linear infinite"></span> Memproses…';
    const f = await bacaBerkas(file);
    _files[name] = f;
    if (prev) prev.innerHTML = f ? `${f.preview ? `<img src="${f.preview}" alt="">` : '<i class="bi bi-file-earmark-pdf fs-2"></i>'}<div><b>${esc(f.nama)}</b><br><small>${num(f.base64.length * 0.75 / 1024)} KB · siap diunggah</small></div>` : '';
  } catch (e) { _files[name] = null; if (prev) prev.innerHTML = ''; toast(e.message, 'error'); input.value = ''; }
}
const takeFile = name => { const f = _files[name] || null; delete _files[name]; if (f) delete f.preview; return f; };

// ════════════════════════════════════════════════════════
// BAGIAN 7: ROUTER SPA — tanpa reload, tanpa ?page=, aman di iframe
// ════════════════════════════════════════════════════════
const ROUTES = {}; // diisi oleh masing-masing modul halaman: ROUTES[nama] = { shell, title, r, perm, auth }
const ACT = {};    // aksi klik global: <button data-act="nama">

function firstAdminRoute() {
  const order = ['a-beranda', 'a-pesanan', 'a-pembayaran', 'a-invoice', 'a-pembelian', 'a-customer', 'a-kurs', 'a-akun'];
  return order.find(r => allowed(r)) || 'a-akun';
}
function go(route, params = {}, opt = {}) {
  let def = ROUTES[route];
  if (!def) { route = 'home'; def = ROUTES.home; }
  if (def.shell === 'adm') {
    if (!S.me) return go('login', { next: route });
    if (!isInternal()) return go('home');
    if (!allowed(route)) { toast(def.role ? 'Hanya Super Admin yang dapat membuka menu ini.' : 'Menu ini tidak tersedia untuk peran Anda.', 'warning'); return go(firstAdminRoute()); }
  }
  if (def.auth === 'customer') {
    if (!S.me) return go('login', { next: route });
    if (isInternal()) return go(firstAdminRoute());
  }
  if (def.guest && S.me && !opt.force) return go(isInternal() ? firstAdminRoute() : 'home');
  if (S.route === 'a-form' && route !== 'a-form') formAutosaveFlush();
  S.route = route;
  S.params = params || {};
  document.body.dataset.shell = def.shell;
  $$('.view.active').forEach(v => v.classList.remove('active'));
  const el = $('#v-' + route);
  el.classList.add('active');
  destroyCharts();
  try { def.r(el, S.params, false); } catch (e) { console.error(e); el.innerHTML = `<div class="cardx pad">${emptyState('bi-bug', 'Halaman gagal dimuat', e.message)}</div>`; }
  document.title = (def.title ? def.title + ' · ' : '') + (sett().appName || 'Jastica');
  updateNav();
  if (!opt.keepScroll) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  document.body.classList.remove('sb-open');
  const pm = bootstrap.Offcanvas.getInstance($('#pubMenu')); if (pm) pm.hide();
}
/** Render ulang halaman aktif dari state lokal (dipanggil setelah perubahan data). */
function rerender() {
  if (!S.route) return;
  const def = ROUTES[S.route];
  const el = $('#v-' + S.route);
  const y = window.scrollY;
  try { def.r(el, S.params, true); } catch (e) { console.error(e); }
  updateNav();
  window.scrollTo(0, y);
}

// ════════════════════════════════════════════════════════
// BAGIAN 8: SESI, DATA AWAL, SINKRONISASI LATAR BELAKANG
// ════════════════════════════════════════════════════════
function deviceLabel() {
  const u = navigator.userAgent;
  const b = /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'Browser';
  const o = /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iOS' : /Windows/.test(u) ? 'Windows' : /Mac OS/.test(u) ? 'macOS' : /Linux/.test(u) ? 'Linux' : '';
  return b + (o ? ' · ' + o : '');
}
function hydrate(data) {
  S.ver = data.ver || 0;
  if (data.me) S.me = data.me;
  if (data.boot) S.boot = data.boot;
  if (data.settings) S.settings = data.settings;
  if (data.customer !== undefined) S.customer = data.customer;
  if (data.saldoDompet) S.saldo = data.saldoDompet;
  // v1.3.1: salinan lokal menyimpan koleksi di data.d dan saldo di data.saldo (sebelumnya tidak ikut dipulihkan)
  if (data.d && data.saldo && !data.saldoDompet) S.saldo = data.saldo;
  const src = data.d && typeof data.d === 'object' && !Array.isArray(data.d) ? data.d : data;
  COLLS.forEach(c => { if (src[c]) S.d[c] = src[c]; });
  refreshBootLists();
  const sess = store.get('sess');
  if (sess && S.me) { sess.me = S.me; store.set('sess', sess); }
  _ix = {};
  applyBrand();
  persist();
}
async function startSession(sesi, next) {
  S.token = sesi.token;
  S.tokExp = sesi.exp;
  S.me = sesi.me;
  store.set('sess', { token: sesi.token, me: sesi.me, exp: sesi.exp });
  COLLS.forEach(c => { S.d[c] = []; });
  let cached = store.get('cache_' + S.me.id);
  // v1.3.1: salinan data besar di IndexedDB → cukup sinkron selisih, tidak perlu mengunduh semua data lagi
  if (!(cached && cached.d)) cached = await pulihkanSalinanBesar(S.me.id);
  if (cached && cached.d) hydrate(cached);
  renderShellChrome();
  const target = next && ROUTES[next] && (ROUTES[next].shell === 'adm' ? isInternal() : true) ? next : (isInternal() ? firstAdminRoute() : (S.cart.length ? 'keranjang' : 'pesanan'));
  if (isInternal() && !cached) {
    // Tampilkan kerangka lalu muat data dalam satu panggilan batch
    go(target);
    await loadAll();
    go(target, S.params, { keepScroll: true });
  } else {
    go(target);
    if (cached && cached.d) syncNow(false); else loadAll();
  }
  if (S.me.wajibGanti) setTimeout(forceChangePassword, 500);
  if (S.me.wajibPin) setTimeout(forceBuatPin, 500); // v1.3.5: member lama wajib membuat PIN 6 digit
  startSyncLoop();
}
async function loadAll() {
  const ep = _writeEpoch;
  // v1.3.1: pengurus memuat 45 hari terakhir + tagihan belum lunas dulu (cepat), sisanya menyusul di latar
  const bertahap = S.me && S.me.role !== 'customer';
  const res = await api('data.all', bertahap ? { ringkas: 1, bagian: 'baru' } : { ringkas: 1 }, { silent: false });
  if (res.success) bukaRingkas(res.data);
  if (res.success && ep !== _writeEpoch) { scheduleSync(300); return res; } // tulisan baru lebih mutakhir
  if (res.success) { hydrate(res.data); S.lastSync = Date.now(); rerender(); renderShellChrome(); if (res.data.bagian === 'baru') setTimeout(muatBagianLama, 250); }
  else if (!kodeSesiHabis(res.code)) toast(res.message, 'error', 'Gagal memuat data');
  return res;
}
let _syncTimer = null, _syncLoop = null, _syncing = false;
function scheduleSync(ms = 300) { clearTimeout(_syncTimer); _syncTimer = setTimeout(() => syncNow(true), ms); }
async function syncNow(silent) {
  if (!S.token || _syncing) return;
  _syncing = true;
  const ep = _writeEpoch;
  const res = await api('data.sync', { ver: S.ver, delta: 1, ringkas: 1 }, { silent });
  _syncing = false;
  if (!res.success) return res;
  bukaRingkas(res.data);
  // v1.3.1: ada tulisan selama sinkron berjalan → hasil ini bisa lebih lama dari data terbaru; ulangi sebentar lagi
  if (ep !== _writeEpoch || (res.data.ver && res.data.ver < S.ver)) { scheduleSync(400); return res; }
  S.lastSync = Date.now();
  if (res.data.same) { if (res.data.kurs) { S.boot.kurs = res.data.kurs; updateKursChrome(); } return res; }
  if (res.data.delta) gabungSelisih(res.data); else hydrate(res.data); // v1.3.1: cukup baris yang berubah
  // Jangan menimpa formulir yang sedang diisi; halaman daftar aman dirender ulang
  const modalOpen = document.querySelector('.modal.show');
  if (!['a-form', 'keranjang', 'akun', 'a-pengaturan', 'a-akun'].includes(S.route) && !modalOpen) rerender();
  updateNav();
  return res;
}
function startSyncLoop() {
  clearInterval(_syncLoop);
  // v1.3.1: satu jalur polling — auth.cek ringan (15 dtk, hanya saat tab terlihat) memicu sinkron bila versi data berubah;
  // sinkron penuh berkala cukup tiap 5 menit sebagai cadangan (kurs dsb.)
  _syncLoop = setInterval(() => { if (document.visibilityState === 'visible' && S.token && Date.now() - S.lastSync > 240000) syncNow(true); }, 300000);
  mulaiPantauSesi(); // v1.3: batas diam + cek satu perangkat
}

function clearSession() {
  S.token = null; S.me = null; S.settings = {}; S.customer = null; S.saldo = {};
  COLLS.forEach(c => { S.d[c] = []; });
  store.del('sess');
  clearInterval(_syncLoop);
  hentikanPantauSesi(); S.tokExp = 0;
  _ix = {};
}
function sessionEnded(res) {
  const wasAdm = isInternal();
  clearSession();
  $('#sessionText').textContent = res.message || 'Sesi Anda berakhir. Silakan masuk kembali.';
  bootstrap.Modal.getOrCreateInstance($('#mdlSession')).show();
  renderShellChrome();
  if (wasAdm) document.body.dataset.shell = 'pub';
}
ACT.sessionRelogin = () => { bootstrap.Modal.getInstance($('#mdlSession'))?.hide(); go('login', {}, { force: true }); };
ACT.logout = async () => {
  const ok = await confirmDlg({ title: 'Keluar dari akun?', text: 'Anda perlu masuk lagi untuk mengakses data.', ok: 'Keluar', icon: 'bi-box-arrow-right' });
  if (!ok) return;
  api('auth.logout', {}, { silent: true });
  if (S.me) { store.del('cache_' + S.me.id); idbJst().del('cache_' + S.me.id); } // v1.3.1: salinan besar ikut dihapus
  clearSession();
  renderShellChrome();
  go('home');
  toast('Anda telah keluar.', 'info');
};
function forceChangePassword() {
  modal({
    title: 'Ganti kata sandi awal', static: true,
    body: `<div class="alert-x warn"><i class="bi bi-shield-exclamation"></i><div>Demi keamanan, ganti kata sandi sementara Anda sebelum melanjutkan.</div></div>
      <form id="fGantiAwal" novalidate>
        <div class="mb-3"><label class="form-label">Kata sandi saat ini <span class="req">*</span></label><input type="password" class="form-control" name="lama" autocomplete="current-password" required></div>
        <div class="mb-3"><label class="form-label">Kata sandi baru <span class="req">*</span></label><input type="password" class="form-control" name="baru" autocomplete="new-password" required minlength="8" data-strength><div class="strength"><span></span><span></span><span></span><span></span></div><div class="form-text">Minimal 8 karakter, berisi huruf dan angka.</div></div>
        <button class="btn btn-primary w-100" type="submit">Simpan kata sandi baru</button>
      </form>`
  });
  $('#fGantiAwal').onsubmit = async e => {
    e.preventDefault();
    const f = e.target; clearErr(f);
    const d = formData(f);
    if (!d.lama) return fieldErr(f, 'lama', 'Isi kata sandi saat ini.');
    if (d.baru.length < 8 || !/\d/.test(d.baru) || !/[a-z]/i.test(d.baru)) return fieldErr(f, 'baru', 'Minimal 8 karakter berisi huruf dan angka.');
    const btn = f.querySelector('button[type=submit]');
    const res = await mutate('auth.gantiSandi', d, { btn, busyLabel: 'Menyimpan…', rerenderView: false });
    if (res.success) { S.me = res.data.me; const s = store.get('sess'); if (s) { s.me = S.me; store.set('sess', s); } closeModal(); }
  };
}

// ════════════════════════════════════════════════════════
// BAGIAN 9: TEMA, MEREK, NAVIGASI
// ════════════════════════════════════════════════════════
const LOGO_SVG = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9h12l-1.2 10.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 9Z" fill="#fff" fill-opacity=".95"/><path d="M9 9V7a3 3 0 0 1 6 0v2" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="m10.2 14.6 4.6-2.1-1.6 4.7-.9-1.8-2.1-.8Z" fill="var(--primary)"/></svg>`;
function applyBrand() {
  const s = sett();
  const c = /^#[0-9a-f]{6}$/i.test(s.primaryColor || '') ? s.primaryColor : '#6C5CE7';
  document.documentElement.style.setProperty('--primary', c);
  store.set('color', c); try { localStorage.setItem('jst_color', c); } catch (e) { /* abaikan */ }
  const logo = s.logoUrl ? `<img src="${esc(s.logoUrl)}" alt="" onerror="this.parentNode.innerHTML=LOGO_SVG">` : LOGO_SVG;
  $$('[data-brand-logo]').forEach(e => { e.innerHTML = logo; });
  $$('[data-brand-name]').forEach(e => { e.textContent = s.appName || 'Jastica'; });
  $$('[data-brand-tagline]').forEach(e => { e.textContent = s.tagline || ''; });
}
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('jst_theme', t); } catch (e) { /* abaikan */ }
  $$('[data-theme-icon]').forEach(i => { i.className = 'bi ' + (t === 'dark' ? 'bi-sun' : 'bi-moon-stars'); });
  refreshChartsTheme();
}
ACT.toggleTheme = () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
ACT.openSidebar = () => document.body.classList.add('sb-open');
ACT.closeSidebar = () => document.body.classList.remove('sb-open');
ACT.pubMenu = () => { renderPubMenu(); bootstrap.Offcanvas.getOrCreateInstance($('#pubMenu')).show(); };

const cartCount = () => S.cart.reduce((s, c) => s + (Number(c.qty) || 0), 0);
function renderShellChrome() {
  applyBrand();
  renderPubNav();
  renderFooter();
  if (isInternal()) { renderSidebar(); renderAdmBottom(); renderUserChip(); updateKursChrome(); }
  updateNav();
}
function renderPubNav() {
  const links = [['home', 'Beranda'], ['katalog', 'Katalog'], ['home#cara', 'Cara Pesan'], ['home#estimator', 'Kurs & Fee'], ['pesanan', 'Lacak Pesanan']];
  $('#pubLinks').innerHTML = links.map(([r, t]) => `<button data-go="${r}" data-nav="${r.includes('#') ? '' : r}">${t}</button>`).join('');
  const cart = `<button class="icon-btn cart-btn hide-md" data-go="keranjang" aria-label="Keranjang"><i class="bi bi-bag"></i><span class="count solid" data-cart-count ${cartCount() ? '' : 'hidden'}>${cartCount()}</span></button>`;
  // v1.2: tombol gelap/terang di portal; keranjang hanya untuk member yang sudah masuk
  const gelap = document.documentElement.getAttribute('data-theme') === 'dark';
  const tema = `<button class="icon-btn" data-act="toggleTheme" aria-label="Ganti tampilan gelap/terang" title="Gelap / terang"><i data-theme-icon class="bi ${gelap ? 'bi-sun' : 'bi-moon-stars'}"></i></button>`;
  let act;
  if (!S.me) act = `${tema}<button class="btn btn-outline-primary hide-md" data-go="login">Masuk</button><button class="btn btn-primary hide-md" data-go="daftar">Daftar</button>`;
  else if (isInternal()) act = `${tema}<button class="btn btn-primary" data-go="${firstAdminRoute()}"><i class="bi bi-speedometer2"></i><span class="hide-md">Panel Admin</span></button>`;
  else act = `${tema}${cart}<div class="dropdown"><button class="user-chip" data-bs-toggle="dropdown" aria-label="Menu akun">${avatarMember('sm')}<span class="uc-text hide-md"><b>${esc(S.me.nama.split(' ')[0])}</b><small>Member</small></span></button>
      <ul class="dropdown-menu dropdown-menu-end"><li><button class="dropdown-item" data-go="pesanan"><i class="bi bi-receipt me-2"></i>Pesanan Saya</button></li><li><button class="dropdown-item" data-go="akun"><i class="bi bi-person me-2"></i>Akun Saya</button></li><li><hr class="dropdown-divider"></li><li><button class="dropdown-item text-danger" data-act="logout"><i class="bi bi-box-arrow-right me-2"></i>Keluar</button></li></ul></div>`;
  $('#pubActions').innerHTML = act;
  const b = [['home', 'bi-house', 'Beranda'], ['katalog', 'bi-grid', 'Katalog'], ['keranjang', 'bi-bag', 'Keranjang'], ['pesanan', 'bi-receipt', 'Pesanan'], [S.me ? (isInternal() ? firstAdminRoute() : 'akun') : 'login', S.me ? 'bi-person' : 'bi-box-arrow-in-right', S.me ? (isInternal() ? 'Panel' : 'Akun') : 'Masuk']]
    .filter(x => x[0] !== 'keranjang' || isCustomer());
  $('#pubBottom').innerHTML = b.map(([r, i, t]) => `<button data-go="${r}" data-nav="${r}"><i class="bi ${i}"></i>${t}${r === 'keranjang' ? `<span class="count solid" data-cart-count ${cartCount() ? '' : 'hidden'}>${cartCount()}</span>` : ''}</button>`).join('');
}
function renderPubMenu() {
  const items = [['home', 'bi-house', 'Beranda'], ['katalog', 'bi-grid', 'Katalog'], ['home#cara', 'bi-signpost-split', 'Cara Pesan'], ['home#estimator', 'bi-calculator', 'Kurs & Fee'], ['pesanan', 'bi-receipt', 'Lacak Pesanan'], ['keranjang', 'bi-bag', 'Keranjang']].filter(x => x[0] !== 'keranjang' || isCustomer());
  $('#pubMenuBody').innerHTML = items.map(([r, i, t]) => `<button class="sb-item" data-go="${r}"><i class="bi ${i}"></i><span class="grow">${t}</span></button>`).join('') +
    `<div class="d-grid gap-2 mt-3">${S.me ? (isInternal() ? `<button class="btn btn-primary" data-go="${firstAdminRoute()}">Panel Admin</button>` : `<button class="btn btn-light" data-go="akun">Akun Saya</button>`) + `<button class="btn btn-danger-soft" data-act="logout">Keluar</button>` : `<button class="btn btn-primary" data-go="daftar">Daftar</button><button class="btn btn-outline-primary" data-go="login">Masuk</button>`}</div>`;
}
function renderFooter() {
  const s = sett();
  $('#pubFooter').innerHTML = `<div class="container-xl"><div class="row g-4">
    <div class="col-lg-4"><div class="d-flex align-items-center gap-2 mb-3"><span class="brand-logo">${s.logoUrl ? `<img src="${esc(s.logoUrl)}" alt="">` : LOGO_SVG}</span><b class="text-white fs-5">${esc(s.appName || 'Jastica')}</b></div>
      <p class="mb-0" style="max-width:340px">Layanan jastip dengan kurs transparan, rincian biaya jelas, dan invoice rapi langsung ke WhatsApp Anda.</p></div>
    <div class="col-6 col-lg-2"><h4>Navigasi</h4><button class="link-btn" data-go="katalog">Katalog</button><button class="link-btn" data-go="home#estimator">Kalkulator Kurs</button><button class="link-btn" data-go="home#cara">Cara Pesan</button><button class="link-btn" data-go="pesanan">Lacak Pesanan</button></div>
    <div class="col-6 col-lg-3"><h4>Hubungi Kami</h4><a href="${waLink(s.bizHP, 'Halo ' + (s.appName || '') + ', saya mau tanya jastip.')}" target="_blank" rel="noopener"><i class="bi bi-whatsapp me-2"></i>${esc(fmtHP(s.bizHP))}</a>${s.bizEmail ? `<a href="mailto:${esc(s.bizEmail)}"><i class="bi bi-envelope me-2"></i>${esc(s.bizEmail)}</a>` : ''}${kontakIgHtml(s)}<span class="d-block"><i class="bi bi-geo-alt me-2"></i>${esc(s.bizAlamat || '')}</span>${kontakGrupWaHtml(s)}</div>
    <div class="col-lg-3"><h4>Rute Jastip</h4><div class="d-flex flex-wrap gap-2">${countries().map(c => `<span class="tag" style="background:rgba(255,255,255,.08);color:#fff">${flag(c.kode)} ${esc(c.nama)}</span>`).join('')}</div></div>
  </div><div class="copy">© ${new Date().getFullYear()} ${esc(s.appName || 'Jastica')}. Seluruh hak cipta dilindungi.</div></div>`;
}

const NAV = [
  { grp: 'Menu Operasional' },
  { r: 'a-beranda', ic: 'bi-grid-1x2', t: 'Beranda' },
  { r: 'a-pesanan', ic: 'bi-cart3', t: 'Pesanan', badge: () => S.d.orders.filter(o => o.Status === 'Baru').length },
  { r: 'a-form', ic: 'bi-cart-plus', t: 'Form Pesanan', plus: true },
  { r: 'a-customer', ic: 'bi-people', t: 'Customer CRM' },
  { r: 'a-pembelian', ic: 'bi-globe-asia-australia', t: 'Pembelian Negara', tag: '5 Region' },
  { r: 'a-pembayaran', ic: 'bi-receipt-cutoff', t: 'Pembayaran & Mutasi', badge: () => S.d.payments.filter(p => p.Status === 'Menunggu').length, danger: true },
  { r: 'a-dompet', ic: 'bi-wallet2', t: 'Dompet & Saldo' },
  { r: 'a-biaya', ic: 'bi-truck', t: 'Biaya & Logistik' },
  { grp: 'Alat & Treasury' },
  { r: 'a-kurs', ic: 'bi-currency-exchange', t: 'Kalkulator Kurs' },
  { r: 'a-invoice', ic: 'bi-file-earmark-pdf', t: 'Invoice & Cetak PDF' },
  { r: 'a-pengingat', ic: 'bi-bell', t: 'Pengingat Tagihan', dot: () => overdueOrders().length > 0 },
  { r: 'a-laporan', ic: 'bi-bar-chart-line', t: 'Laporan & Ekspor' },
  { r: 'a-voucher', ic: 'bi-ticket-perforated', t: 'Voucher & Poin' },
  { grp: 'Konten & Sistem' },
  { r: 'a-katalog', ic: 'bi-shop', t: 'Katalog & Trip' },
  { r: 'a-pengaturan', ic: 'bi-gear', t: 'Pengaturan' },
  { r: 'a-users', ic: 'bi-person-gear', t: 'Manajemen User' }
];
const allowed = r => { const d = ROUTES[r]; return d && (!d.perm || can(d.perm)) && (!d.role || S.me.role === d.role) && (!d.permAny || canAny(d.permAny)); };
function renderSidebar() {
  let html = '', pending = null;
  NAV.forEach(n => {
    if (n.grp) { pending = n.grp; return; }
    if (!allowed(n.r)) return;
    if (pending) { html += `<div class="sb-group">${esc(pending)}</div>`; pending = null; }
    const b = n.badge ? n.badge() : 0;
    html += `<button class="sb-item" data-go="${n.r}" data-nav="${n.r}"><i class="bi ${n.ic}"></i><span class="grow">${n.t}</span>${b ? `<span class="count ${n.danger ? 'danger' : ''}">${b}</span>` : ''}${n.tag ? `<span class="tag">${n.tag}</span>` : ''}${n.plus ? '<i class="bi bi-plus plus"></i>' : ''}${n.dot && n.dot() ? '<span class="reddot" aria-label="Ada tagihan jatuh tempo"></span>' : ''}</button>`;
  });
  $('#sbNav').innerHTML = html;
}
function renderAdmBottom() {
  const list = [['a-beranda', 'bi-grid-1x2', 'Beranda'], ['a-pesanan', 'bi-cart3', 'Pesanan'], ['a-form', 'bi-plus-lg', 'Baru', true], [can('pembayaran') ? 'a-pembayaran' : 'a-customer', can('pembayaran') ? 'bi-receipt-cutoff' : 'bi-people', can('pembayaran') ? 'Bayar' : 'Customer']].filter(x => allowed(x[0]));
  $('#admBottom').innerHTML = list.map(([r, i, t, fab]) => `<button data-go="${r}" data-nav="${r}" class="${fab ? 'fab' : ''}"><i class="bi ${i}"></i>${t}</button>`).join('') + `<button data-act="openSidebar"><i class="bi bi-list"></i>Menu</button>`;
}
function renderUserChip() {
  $('#ucName').textContent = S.me.nama;
  $('#ucRole').textContent = S.me.roleLabel || ROLE_LABEL[S.me.role];
  $('#ucAvatar').outerHTML = avatarMember().replace('<span ', '<span id="ucAvatar" '); // v1.3.5: foto profil pengurus
}
function updateKursChrome() {
  const k = kurs();
  const t = k.waktu ? jam(k.waktu) + ' WIB' : '';
  if ($('#liveChipText')) $('#liveChipText').textContent = 'LIVE Kurs ' + t;
  const box = $('#sbKurs');
  if (box) box.innerHTML = `<div class="hd"><span>Kurs Valas Hari Ini</span><span class="dot" title="Live"></span></div><div class="grid">${['SGD', 'MYR', 'JPY', 'THB'].map(m => `<div><span>${m}</span><b>${fmtKurs(k.rates[m])}</b></div>`).join('')}</div>`;
}
function updateNav() {
  const base = String(S.route || '');
  $$('[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === base));
  const cc = cartCount();
  $$('[data-cart-count]').forEach(e => { e.textContent = cc; e.hidden = !cc; });
  if (isInternal()) {
    renderSidebar();
    $$('#sbNav [data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === base));
    renderBell();
  }
}
function overdueOrders() {
  const today = ymd();
  return S.d.orders.filter(o => o.Sisa > 0 && o.Status !== 'Batal' && o.InvoiceID && (invById(o.InvoiceID) || {}).JatuhTempo <= today);
}
function renderBell() {
  const pend = S.d.payments.filter(p => p.Status === 'Menunggu');
  const baru = S.d.orders.filter(o => o.Status === 'Baru');
  const due = overdueOrders();
  const items = [];
  if (pend.length && can('pembayaran')) items.push(`<button class="notif-item" data-go="a-pembayaran"><span class="kpi-ic coral"><i class="bi bi-receipt"></i></span><span><b>${pend.length} bukti transfer menunggu verifikasi</b><small>Terbaru dari ${esc(pend[0].CustomerNama)} · ${rp(pend[0].Jumlah)}</small></span></button>`);
  if (baru.length && can('pesanan.lihat')) items.push(`<button class="notif-item" data-go="a-pesanan" data-params='{"status":"Baru"}'><span class="kpi-ic sky"><i class="bi bi-cart-check"></i></span><span><b>${baru.length} pesanan baru</b><small>Perlu dikonfirmasi & dibelanjakan</small></span></button>`);
  if (due.length && can('pengingat')) items.push(`<button class="notif-item" data-go="a-pengingat"><span class="kpi-ic danger"><i class="bi bi-alarm"></i></span><span><b>${due.length} tagihan jatuh tempo</b><small>Total ${rp(due.reduce((s, o) => s + o.Sisa, 0))}</small></span></button>`);
  const n = (can('pembayaran') ? pend.length : 0) + (can('pesanan.lihat') ? baru.length : 0) + (can('pengingat') ? due.length : 0);
  const badge = $('#bellBadge');
  badge.hidden = !n; badge.textContent = n > 99 ? '99+' : n;
  $('#notifMenu').innerHTML = `<div class="px-2 pt-1 pb-2 small-caps">Notifikasi</div>` + (items.join('') || `<div class="empty py-3"><div class="ill" style="width:56px;height:56px;font-size:24px"><i class="bi bi-bell-slash"></i></div><p class="mb-0">Semua beres. Tidak ada yang perlu ditindaklanjuti.</p></div>`);
}

// ── Pencarian global (lokal, instan) ──
function globalSearch(q) {
  const box = $('#globalResults');
  q = q.trim().toLowerCase();
  if (q.length < 2) { box.classList.remove('open'); box.innerHTML = ''; return; }
  const ord = can('pesanan.lihat') ? ordersSorted().filter(o => (o.NoOrder + ' ' + o.CustomerNama + ' ' + o.CustomerHP).toLowerCase().includes(q) || itemsOf(o.ID).some(i => i.Nama.toLowerCase().includes(q))).slice(0, 6) : [];
  const cus = can('customer.lihat') ? S.d.customers.filter(c => (c.Nama + ' ' + c.HP + ' ' + c.Kode).toLowerCase().includes(q)).slice(0, 4) : [];
  box.innerHTML = (ord.length ? '<div class="grp">Pesanan</div>' + ord.map(o => `<button class="res" data-act="openOrder" data-id="${o.ID}"><span class="kpi-ic" style="width:34px;height:34px;font-size:15px"><i class="bi bi-receipt"></i></span><span class="flex-fill"><b>${esc(o.NoOrder)}</b> · ${esc(o.CustomerNama)}<small>${tglJam(o.Tanggal)} · ${rp(o.Total)}</small></span>${pill(o.Status)}</button>`).join('') : '') +
    (cus.length ? '<div class="grp">Customer</div>' + cus.map(c => `<button class="res" data-go="a-customer" data-params='${JSON.stringify({ id: c.ID })}'>${avatar(c.Nama, 'sm')}<span><b>${esc(c.Nama)}</b><small>${esc(fmtHP(c.HP))} · ${esc(c.Tier)}</small></span></button>`).join('') : '') ||
    `<div class="p-3 muted">Tidak ada hasil untuk “${esc(q)}”.</div>`;
  box.classList.add('open');
}

// ════════════════════════════════════════════════════════
// BAGIAN 10: GRAFIK (Chart.js) — warna mengikuti tema
// ════════════════════════════════════════════════════════
const _charts = {};
function destroyCharts() { Object.keys(_charts).forEach(k => { try { _charts[k].destroy(); } catch (e) { /* abaikan */ } delete _charts[k]; }); }
function chartColors() {
  return { primary: cssVar('--primary') || '#6C5CE7', coral: '#FF8A65', gold: '#F5B83D', mint: '#10B981', sky: '#3B82F6', text: cssVar('--text-2'), grid: cssVar('--border'), muted: cssVar('--muted') };
}
function makeChart(id, cfg) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return null;
  if (_charts[id]) _charts[id].destroy();
  const c = chartColors();
  Chart.defaults.font.family = cssVar('--font') || 'Plus Jakarta Sans, sans-serif';
  Chart.defaults.color = c.muted;
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 450 }, interaction: { mode: 'index', intersect: false } }, cfg.options || {});
  cfg.options.plugins = Object.assign({ legend: { display: false }, tooltip: { backgroundColor: '#1F1B3A', padding: 12, cornerRadius: 10, titleFont: { weight: '700' }, callbacks: {} } }, cfg.options.plugins || {});
  if (cfg.type !== 'doughnut' && cfg.type !== 'pie') {
    cfg.options.scales = cfg.options.scales || {};
    ['x', 'y'].forEach(ax => {
      cfg.options.scales[ax] = Object.assign({ grid: { color: ax === 'y' ? c.grid : 'transparent', drawBorder: false }, border: { display: false }, ticks: { color: c.muted, font: { size: 11 } } }, cfg.options.scales[ax] || {});
    });
  }
  _charts[id] = new Chart(el, cfg);
  return _charts[id];
}
function refreshChartsTheme() { if (Object.keys(_charts).length && S.route) rerender(); }
const rpTick = v => rpShort(v).replace('Rp ', '');

// ════════════════════════════════════════════════════════
// BAGIAN 11: PORTAL CUSTOMER — landing, katalog, keranjang, pesanan, akun
// ════════════════════════════════════════════════════════
const HERO_SVG_TPL = `<svg class="hero-ill" viewBox="0 0 360 280" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="hg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#E4DEFF"/></linearGradient>
    <linearGradient id="hg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFC2AE"/><stop offset="1" stop-color="#FF8A65"/></linearGradient>
    <linearGradient id="hg3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FDE29B"/><stop offset="1" stop-color="#F5B83D"/></linearGradient>
    <linearGradient id="hg4" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D8D0FF"/><stop offset="1" stop-color="#9C8CF5"/></linearGradient>
  </defs>
  <ellipse cx="196" cy="254" rx="150" ry="13" fill="#1F1B3A" opacity=".2"/>
  <path d="M24 92C80 26 170 22 236 58" stroke="#fff" stroke-opacity=".75" stroke-width="2.5" stroke-dasharray="6 9" fill="none"/>
  <g transform="translate(236 40) rotate(16)"><path d="M0 15 46 11 58 0l7 2-8 11 19 2-19 4 8 11-7 2-12-11L0 17Z" fill="#fff"/></g>
  <circle cx="48" cy="58" r="5" fill="#fff" opacity=".7"/><circle cx="318" cy="118" r="4" fill="#fff" opacity=".6"/>
  <rect x="150" y="98" width="122" height="148" rx="24" fill="url(#hg1)"/>
  <rect x="187" y="74" width="48" height="28" rx="11" fill="none" stroke="#fff" stroke-width="8"/>
  <rect x="176" y="114" width="10" height="116" rx="5" fill="#D9D2FF"/><rect x="236" y="114" width="10" height="116" rx="5" fill="#D9D2FF"/>
  <circle cx="176" cy="250" r="8" fill="#3D3570"/><circle cx="246" cy="250" r="8" fill="#3D3570"/>
  <circle cx="211" cy="150" r="17" fill="url(#hg3)"/><path d="m203 150 6 6 10-12" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="196" y="186" width="30" height="10" rx="5" fill="#FF8A65" opacity=".8"/>
  <path d="M66 150h74l-6 92a10 10 0 0 1-10 9H86a10 10 0 0 1-10-9Z" fill="url(#hg2)"/>
  <path d="M86 153v-15a17 17 0 0 1 34 0v15" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M264 172h66l-5 70a9 9 0 0 1-9 8h-38a9 9 0 0 1-9-8Z" fill="url(#hg4)"/>
  <path d="M281 175v-13a16 16 0 0 1 32 0v13" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>
  <ellipse cx="118" cy="256" rx="20" ry="6" fill="#C98A12"/><ellipse cx="118" cy="250" rx="20" ry="6" fill="url(#hg3)"/><ellipse cx="128" cy="244" rx="16" ry="5" fill="url(#hg3)" stroke="#C98A12" stroke-width="1"/>
</svg>`;
/** Ilustrasi hero dengan ID gradien unik per instance (ID ganda membuat gradien hilang bila salinan lain tersembunyi). */
function heroSvg(pfx, w) {
  let svg = HERO_SVG_TPL.replace(/\bhg(\d)\b/g, pfx + 'g$1');
  if (w) svg = svg.replace('class="hero-ill"', 'class="hero-ill" style="width:' + w + 'px"');
  return svg;
}

function tripsAktif() {
  return (S.boot.trips || []).slice().sort((a, b) => (a.Status === 'Aktif' ? -1 : 1) - (b.Status === 'Aktif' ? -1 : 1) || String(a.TglMulai).localeCompare(String(b.TglMulai)));
}
function tripCard(t) {
  const today = ymd();
  const aktif = t.Status === 'Aktif' || (t.TglMulai <= today && t.TglSelesai >= today);
  const sisa = aktif ? daysBetween(today, t.TglSelesai) : daysBetween(today, t.TglMulai);
  const pct = t.Kuota ? Math.min(100, Math.round(t.Terisi / t.Kuota * 100)) : 0;
  return `<article class="cardx trip-card ${aktif ? 'active' : ''}">
    <div class="trip-top"><div><div class="trip-city">${flag(t.Negara)} ${esc(t.Kota)}</div><div class="trip-date"><i class="bi bi-calendar3 me-1"></i>${tglPendek(t.TglMulai)} – ${tgl(t.TglSelesai)}</div></div>
      ${aktif ? '<span class="pill-neon"><span class="neon-dot" aria-hidden="true"></span><span class="neon-txt">Trip Aktif</span></span>' : pill('Akan Datang', 'akan-datang')}</div>
    ${t.Catatan ? `<div class="text-2 small"><b>Fokus:</b> ${esc(t.Catatan)}</div>` : ''}
    ${t.Kuota ? `<div><div class="d-flex justify-content-between small mb-1"><span class="muted">Kuota bagasi</span><b>${num(t.Terisi, 1)} / ${num(t.Kuota)} kg</b></div><div class="bar ${pct > 80 ? 'coral' : ''}"><span style="width:${pct}%"></span></div></div>` : ''}
    <div class="d-flex justify-content-between align-items-center mt-auto gap-2 flex-wrap">
      <span class="countdown"><i class="bi bi-clock"></i>${aktif ? (sisa <= 0 ? 'Hari terakhir' : 'Sisa ' + sisa + ' hari') : 'Mulai ' + sisa + ' hari lagi'}</span>
      <button class="btn btn-sm ${aktif ? 'btn-primary' : 'btn-outline-primary'}" data-go="katalog" data-params='${JSON.stringify({ negara: t.Negara })}'>${aktif ? 'Titip Sekarang' : 'Lihat Barang'}<i class="bi bi-arrow-right"></i></button>
    </div></article>`;
}
function hargaTampil(it) { return Math.round((Number(it.HargaAsli) || 0) * kursOf(it.MataUang)); }
function prodCard(it) {
  const qid = 'q_' + it.ID.slice(0, 8);
  const sisa = sisaStok(it), laris = peringkatKatalog().laris.has(it.ID); // v1.3.4: terlaris, rating, terjual, sisa stok
  const hk = hargaKartu(it), adaVarian = varianOf(it).length > 0; // v1.3.5: galeri, varian, jasa titip per barang
  return `<article class="cardx prod card-hover ${it.Promo || laris ? 'is-hot' : ''} ${laris ? 'is-laris' : ''}">
    <div class="prod-media">${galeriHtml(it, { act: 'prodDetail' })}${badgeBawah(it)}</div>
    <div class="prod-info-baris"><div class="prod-chips-info">${chipNegara(it)}${badgeKatalog(it)}</div></div>
    <div class="prod-judul-blok"><h3 class="clamp-2"><button type="button" class="prod-judul" data-act="prodDetail" data-id="${it.ID}">${esc(it.Nama)}</button></h3>
    <div class="small muted prod-kat">${esc(it.Kategori || '')}</div></div>
    ${metaKatalog(it)}${varianRingkas(it)}
    <div><div class="price">${hk.beda ? '<span class="mulai">mulai</span>' : ''}${rp(hk.harga)}</div>${jasaKartuTampil() ? `<div class="orig">${teksJasaKartu(hk.jasa)}</div>` : ''}</div>
    ${S.me ? (adaVarian ? `<div class="act">${sisa === 0 ? '<button class="btn btn-light btn-sm" disabled>Habis</button>' : `<button class="btn btn-primary btn-sm" data-act="prodDetail" data-id="${it.ID}"><i class="bi bi-palette"></i>Pilih varian</button>`}</div>`
      : `<div class="act"><div class="stepper" role="group" aria-label="Jumlah"><button type="button" data-act="stepDown" data-for="${qid}" aria-label="Kurangi" ${sisa === 0 ? 'disabled' : ''}>−</button><input id="${qid}" type="number" min="1" max="${sisa === null ? 99 : Math.max(1, Math.min(99, sisa))}" value="${qtyTitip(it.ID)}" data-item="${it.ID}" aria-label="Jumlah ${esc(it.Nama)}" ${sisa === 0 ? 'disabled' : ''}><button type="button" data-act="stepUp" data-for="${qid}" aria-label="Tambah" ${sisa === 0 ? 'disabled' : ''}>+</button></div>
      ${sisa === 0 ? '<button class="btn btn-light btn-sm" disabled>Habis</button>' : `<button class="btn btn-primary btn-sm" data-act="addCart" data-id="${it.ID}" data-qty="${qid}"><i class="bi bi-plus-lg"></i>Titip</button>`}</div>`) : ''}
  </article>`;
}

ROUTES.home = { shell: 'pub', title: 'Beranda', r: vHome };
function vHome(el, p, re) {
  if (re && el.dataset.ready) { $('#homeProds') && renderHomeProds(); return; }
  const s = sett();
  const trips = tripsAktif();
  const at = trips.find(t => t.Status === 'Aktif') || trips[0];
  el.innerHTML = `
  <div class="container-xl pub-hero"><div class="hero"><div class="hero-grid"><div>
    ${at ? `<span class="hero-pill"><span class="dot"></span>${at.Status === 'Aktif' ? 'Trip ' + esc(at.Kota) + ' sedang berjalan' : 'Trip berikutnya: ' + esc(at.Kota)} · ${tglPendek(at.TglMulai)}–${tglPendek(at.TglSelesai)}</span>` : '<span class="hero-pill"><span class="dot"></span>Jastip terpercaya</span>'}
    <h1>${esc(s.heroTitle || '')}</h1>
    <p class="lead-sm">${esc(s.heroSubtitle || '')}</p>
    <div class="d-flex gap-2 flex-wrap mt-4"><button class="btn btn-white btn-lg" data-go="katalog"><i class="bi bi-grid"></i>Lihat Katalog</button><button class="btn btn-glass btn-lg" data-go="home#estimator"><i class="bi bi-calculator"></i>Hitung Estimasi</button></div>
    <div class="trust"><div><i class="bi bi-graph-up-arrow"></i>Kurs real-time</div><div><i class="bi bi-globe2"></i>${countries().length} rute belanja</div><div><i class="bi bi-file-earmark-check"></i>Invoice otomatis</div></div>
  </div>${heroSvg('pub')}</div></div></div>

  <section class="section"><div class="container-xl">
    <div class="section-head"><div><div class="eyebrow-sm">Jadwal Trip</div><h2>Kota jastip yang sedang dituju</h2><p>Titip sebelum trip ditutup. Kuota bagasi terbatas.</p></div></div>
    <div class="row g-3">${trips.length ? trips.slice(0, 4).map(t => `<div class="col-md-6 col-xl-3">${tripCard(t)}</div>`).join('') : `<div class="col-12"><div class="cardx">${emptyState('bi-airplane', 'Belum ada jadwal trip', 'Jadwal trip berikutnya akan segera diumumkan.')}</div></div>`}</div>
  </div></section>

  <section class="section" id="estimator"><div class="container-xl">
    <div class="section-head"><div><div class="eyebrow-sm">Kalkulator Transparan</div><h2>${jasaGabung() ? 'Estimasi kurs & harga titip' : 'Estimasi kurs & biaya jasa titip'}</h2><p>Hitung sendiri sebelum memesan. Tanpa biaya tersembunyi.</p></div></div>
    <div class="cardx pad-lg"><div class="estimator">
      <form id="estForm" class="row g-3" onsubmit="return false">
        <div class="col-sm-6"><label class="form-label" for="estNeg">Negara asal barang</label><select class="form-select" id="estNeg">${countriesMember().map(c => `<option value="${c.kode}" ${c.kode === (at ? at.Negara : 'JP') ? 'selected' : ''}>${esc(c.nama)} (${c.mataUang})</option>`).join('')}</select></div>
        <div class="col-sm-6"><label class="form-label" for="estHarga">Harga di toko</label><div class="input-group"><span class="input-group-text" id="estMu">JPY</span><input class="form-control" id="estHarga" inputmode="decimal" data-uang="mu" data-mu-dari="#estNeg" value="15000" aria-describedby="estMu"></div></div>
        <div class="col-sm-6"><label class="form-label" for="estQty">Jumlah</label><input class="form-control" id="estQty" type="number" min="1" value="1"></div>
        <div class="col-sm-6"><label class="form-label" for="estKurir">Kirim ke alamat via</label><select class="form-select" id="estKurir"><option value="pickup" selected>Ambil sendiri (pick up) · Rp 0</option>${(s.couriers || []).map((c, i) => `<option value="${i}">${esc(c.nama)} · ${rp(c.harga)}</option>`).join('')}</select></div>
        <div class="col-12"><div class="form-text"><i class="bi bi-info-circle me-1"></i>${jasaGabung() ? 'Harga barang sudah termasuk jasa titip.' : 'Biaya jasa mengikuti aturan tiap negara.'} Kurs mengikuti kurs berjalan saat pesanan dibuat.</div></div>
      </form>
      <div class="receipt" id="estReceipt" aria-live="polite"></div>
    </div></div>
  </div></section>

  <section class="section"><div class="container-xl">
    <div class="section-head"><div><div class="eyebrow-sm">Katalog Pilihan</div><h2>Titipan favorit pelanggan</h2></div>
      <div class="chips" id="homeTabs">${[['', 'Semua']].concat(countriesMember().map(c => [c.kode, c.nama])).map(([k, t]) => `<button class="chip ${(S.ui.homeNeg || '') === k ? 'on' : ''}" data-act="homeTab" data-neg="${k}">${k ? flag(k) : ''}${esc(t)}</button>`).join('')}</div></div>
    <div class="prod-grid" id="homeProds"></div>
    <div class="text-center mt-4"><button class="btn btn-outline-primary" data-go="katalog">Lihat semua barang<i class="bi bi-arrow-right"></i></button></div>
  </div></section>

  <section class="section" id="cara"><div class="container-xl">
    <div class="section-head"><div><div class="eyebrow-sm">Cara Titip</div><h2>Empat langkah mudah</h2></div></div>
    <div class="steps4">${[
      ['bi-search', 'Pilih barang', 'Pilih barang yang Anda mau dari katalog.'],
      ['bi-calculator', 'Lihat kalkulasi otomatis', 'Kurs live dan biaya jasa langsung terhitung. Total jelas sebelum konfirmasi.'],
      ['bi-wallet2', 'Bayar & kami belanjakan', 'Transfer ke rekening resmi lalu kirim bukti ke WhatsApp admin. Shopper kami belanja di toko resmi.'],
      ['bi-box-seam', 'Terima di rumah', 'Barang dikirim kurir pilihan Anda. Invoice & status dikirim ke WhatsApp.']
    ].map((x, i) => `<div class="cardx step-card"><div class="n"><i class="bi ${x[0]}"></i></div><div class="small-caps mb-1">Langkah ${i + 1}</div><h3>${x[1]}</h3><p>${x[2]}</p></div>`).join('')}</div>
  </div></section>

  <section class="section"><div class="container-xl"><div class="row g-3">${[
    ['bi-patch-check', 'mint', '100% produk original', 'Dibeli di toko resmi, struk asli disertakan.'],
    ['bi-bank', '', 'Rekening resmi', 'Pembayaran ke rekening usaha yang tercantum di invoice.'],
    ['bi-whatsapp', 'mint', 'Update WhatsApp', 'Invoice dan pengingat tagihan langsung ke WhatsApp.'],
    ['bi-shield-check', 'gold', 'Proteksi pengemasan', 'Bubble wrap tebal & opsi asuransi pengiriman.']
  ].map(x => `<div class="col-sm-6 col-lg-3"><div class="cardx pad h-100"><span class="kpi-ic ${x[1]} mb-3"><i class="bi ${x[0]}"></i></span><h3 class="fs-6 fw-bold">${x[2]}</h3><p class="muted mb-0 small">${x[3]}</p></div></div>`).join('')}</div></div></section>

  <section class="section"><div class="container-xl" style="max-width:860px">
    <div class="section-head"><div><div class="eyebrow-sm">Tanya Jawab</div><h2>Pertanyaan umum</h2></div></div>
    <div class="faq">${(s.faq || []).map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>
  </div></section>`;
  el.dataset.ready = '1';
  renderHomeProds();
  const est = () => renderEstimator();
  ['estNeg', 'estHarga', 'estQty', 'estKurir'].forEach(id => { const x = $('#' + id); x.addEventListener('input', est); x.addEventListener('change', est); });
  renderEstimator();
  if (p.anchor) setTimeout(() => document.getElementById(p.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}
function renderHomeProds() {
  const neg = S.ui.homeNeg || '';
  const buka = negaraTerbuka();
  // v1.3.5: barang terlaris & populer selalu di paling atas
  const items = urutanPopuler((S.boot.items || []).filter(i => buka.includes(i.Negara) && (!neg || i.Negara === neg)), (a, b) => (b.Promo ? 1 : 0) - (a.Promo ? 1 : 0) || (a.Urutan || 0) - (b.Urutan || 0)).slice(0, 8);
  jagaStepper('#homeProds', () => { $('#homeProds').innerHTML = items.map(prodCard).join('') || `<div style="grid-column:1/-1">${emptyState('bi-bag', 'Belum ada barang', S.me ? 'Barang untuk negara ini segera hadir. Anda tetap bisa request barang khusus di keranjang.' : 'Barang untuk negara ini segera hadir.', S.me ? '<button class="btn btn-primary" data-go="keranjang">Request barang</button>' : '')}</div>` });
}
ACT.homeTab = b => { S.ui.homeNeg = b.dataset.neg; $$('#homeTabs .chip').forEach(c => c.classList.toggle('on', c === b)); renderHomeProds(); };
function renderEstimator() {
  const neg = $('#estNeg').value;
  const mu = muOf(neg);
  $('#estMu').textContent = mu;
  const h = hitungItem({ negara: neg, hargaAsli: angkaHarga($('#estHarga').value, mu), qty: $('#estQty').value });
  const kur = $('#estKurir').value === 'pickup' ? { harga: 0, nama: 'Ambil sendiri' } : (sett().couriers || [])[Number($('#estKurir').value)] || { harga: 0, nama: '-' };
  const total = h.hargaIDR * h.qty + h.jasaIDR + kur.harga;
  const a = aturanJasa(neg);
  const s = sett();
  const text = `Halo ${s.appName}, saya mau titip dari ${negara(neg).nama}: harga toko ${fmtAsli(mu, h.hargaAsli)} x${h.qty}. Estimasi total ${rp(total)}.`;
  const gab = jasaGabung();
  $('#estReceipt').innerHTML = `<div class="d-flex justify-content-between align-items-center mb-2"><span class="small-caps">Rincian estimasi</span><span class="pill primary nodot">${flag(neg)} 1 ${mu} = ${rp(kursOf(mu))}</span></div>
    <div class="row-x"><span>Harga barang (${fmtAsli(mu, h.hargaAsli)} × ${h.qty})${gab ? '<small class="d-block muted">sudah termasuk jasa titip</small>' : ''}</span><b class="num">${rp(gab ? h.subtotal : h.hargaIDR * h.qty)}</b></div>
    ${gab ? '' : `<div class="row-x"><span>${esc(labelJasaMember(neg))}</span><b class="num">${rp(h.jasaIDR)}</b></div>`}
    <div class="row-x"><span>${kur.nama === 'Ambil sendiri' ? 'Ambil sendiri (pick up)' : 'Ongkir domestik (' + esc(kur.nama) + ')'}</span><b class="num">${rp(kur.harga)}</b></div>
    <div class="total"><span>Estimasi total</span><b class="num">${rp(total)}</b></div>
    <div class="d-flex gap-2 mt-3 flex-wrap"><a class="btn btn-wa flex-fill" href="${waLink(s.bizHP, text)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>Tanya via WhatsApp</a></div>`;
}

// ── Katalog ──
ROUTES.katalog = { shell: 'pub', title: 'Katalog', r: vKatalog };
function vKatalog(el, p, re) {
  const st = S.ui.kat || (S.ui.kat = { q: '', neg: [], kat: '', sort: 'populer', page: 1 });
  if (p.negara && !re) { st.neg = [p.negara]; st.page = 1; }
  if (re && el.dataset.ready) { renderKatGrid(); return; }
  const buka = negaraTerbuka();
  const items = (S.boot.items || []).filter(i => buka.includes(i.Negara));
  st.neg = st.neg.filter(k => buka.includes(k));
  const kats = Array.from(new Set(items.map(i => i.Kategori).filter(Boolean))).sort();
  const at = tripsAktif().find(t => t.Status === 'Aktif');
  const k = kurs();
  el.innerHTML = `<div class="container-xl py-4">
    <div class="trip-strip">${at ? `<span class="pill-neon"><span class="neon-dot" aria-hidden="true"></span><span class="neon-txt">Trip Aktif</span></span><b>${flag(at.Negara)} ${esc(at.Kota)}</b><span class="muted">${tglPendek(at.TglMulai)} – ${tgl(at.TglSelesai)}</span>` : '<span class="lbl">KURS LIVE</span>'}
      <span class="ms-lg-auto d-flex gap-2 flex-wrap">${['JPY', 'SGD', 'MYR', 'THB'].map(m => `<span class="tag">1 ${m} = ${rp(k.rates[m])}</span>`).join('')}</span></div>
    <div class="page-head"><div><h1>Katalog barang jastip</h1><p>Harga sudah dikonversi ke Rupiah dengan kurs terbaru. ${jasaGabung() ? 'Harga sudah termasuk jasa titip.' : 'Biaya jasa dihitung di keranjang.'}</p></div>
</div>
    <div class="row g-4">
      <div class="col-lg-3"><div class="cardx filter-card">
        <div class="input-icon"><i class="bi bi-search"></i><input class="form-control" id="katQ" type="search" placeholder="Cari nama barang…" value="${esc(st.q)}" aria-label="Cari barang"></div>
        <h4>Negara asal</h4>
        ${countriesMember().map(c => { const n = items.filter(i => i.Negara === c.kode).length; return `<label class="form-check"><span><input class="form-check-input" type="checkbox" data-multi="1" data-katneg="${c.kode}" ${st.neg.includes(c.kode) ? 'checked' : ''}> ${flag(c.kode)} ${esc(c.nama)}</span><span class="muted small">${n}</span></label>`; }).join('')}
        <h4>Kategori</h4>
        <select class="form-select" id="katKat"><option value="">Semua kategori</option>${kats.map(x => `<option ${st.kat === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <h4>Urutkan</h4>
        <select class="form-select" id="katSort">${[['populer', 'Paling populer'], ['laris', 'Terlaris'], ['rating', 'Rating tertinggi'], ['murah', 'Harga termurah'], ['mahal', 'Harga termahal'], ['nama', 'Nama A–Z']].map(([v, t]) => `<option value="${v}" ${st.sort === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <button class="btn btn-light w-100 mt-3" data-act="katReset"><i class="bi bi-arrow-counterclockwise"></i>Reset filter</button>
      </div></div>
      <div class="col-lg-9"><div class="d-flex justify-content-between align-items-center mb-3"><span class="muted" id="katInfo"></span></div><div class="prod-grid" id="katGrid"></div><div class="d-flex justify-content-center mt-4" id="katPager"></div></div>
    </div></div>`;
  el.dataset.ready = '1';
  $('#katQ').addEventListener('input', debounce(e => { st.q = e.target.value; st.page = 1; renderKatGrid(); }, 180));
  $('#katKat').addEventListener('change', e => { st.kat = e.target.value; st.page = 1; renderKatGrid(); });
  $('#katSort').addEventListener('change', e => { st.sort = e.target.value; renderKatGrid(); });
  $$('[data-katneg]', el).forEach(c => c.addEventListener('change', () => { st.neg = $$('[data-katneg]:checked', el).map(x => x.dataset.katneg); st.page = 1; renderKatGrid(); }));
  renderKatGrid();
}
function renderKatGrid() {
  const st = S.ui.kat;
  const q = st.q.toLowerCase();
  const buka = negaraTerbuka();
  let list = (S.boot.items || []).filter(i => buka.includes(i.Negara) && (!st.neg.length || st.neg.includes(i.Negara)) && (!st.kat || i.Kategori === st.kat) && (!q || (i.Nama + ' ' + i.Kategori).toLowerCase().includes(q)));
  const sorters = { populer: (a, b) => (b.Promo ? 1 : 0) - (a.Promo ? 1 : 0) || (a.Urutan || 0) - (b.Urutan || 0), murah: (a, b) => hargaMember(a) - hargaMember(b), mahal: (a, b) => hargaMember(b) - hargaMember(a), nama: (a, b) => a.Nama.localeCompare(b.Nama),
    laris: (a, b) => ((statItem(b.ID) || {}).t || 0) - ((statItem(a.ID) || {}).t || 0) || sorters.populer(a, b),
    rating: (a, b) => ((statItem(b.ID) || {}).r || 0) - ((statItem(a.ID) || {}).r || 0) || ((statItem(b.ID) || {}).n || 0) - ((statItem(a.ID) || {}).n || 0) || sorters.populer(a, b) };
  // v1.3.4/1.3.5: "Paling populer" = terlaris & populer di paling atas, lalu ulasan terbaik
  if ((st.sort || 'populer') === 'populer') urutanPopuler(list, sorters.populer); else list.sort(sorters[st.sort] || sorters.populer);
  const per = 12, pages = Math.max(1, Math.ceil(list.length / per));
  st.page = Math.min(st.page, pages);
  $('#katInfo').textContent = `Menampilkan ${list.length ? (st.page - 1) * per + 1 : 0}–${Math.min(list.length, st.page * per)} dari ${list.length} barang`;
  jagaStepper('#katGrid', () => { $('#katGrid').innerHTML = list.slice((st.page - 1) * per, st.page * per).map(prodCard).join('') || `<div style="grid-column:1/-1" class="cardx">${emptyState('bi-search', 'Barang tidak ditemukan', S.me ? 'Coba kata kunci lain, atau request barang khusus dengan link toko.' : 'Coba kata kunci lain.', S.me ? '<button class="btn btn-primary" data-go="keranjang">Request barang khusus</button>' : '')}</div>` });
  $('#katPager').innerHTML = pager(st.page, pages, 'katPage');
}
ACT.katPage = b => { S.ui.kat.page = Number(b.dataset.page); renderKatGrid(); $('#katGrid').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
ACT.katReset = () => { S.ui.kat = { q: '', neg: [], kat: '', sort: 'populer', page: 1 }; delete $('#v-katalog').dataset.ready; vKatalog($('#v-katalog'), {}, false); };
function pager(page, pages, act) {
  if (pages <= 1) return '';
  const nums = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
  return `<div class="pager" role="navigation" aria-label="Halaman"><button data-act="${act}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Sebelumnya"><i class="bi bi-chevron-left"></i></button>${nums.map(n => n === '…' ? '<span class="muted px-1">…</span>' : `<button data-act="${act}" data-page="${n}" class="${n === page ? 'on' : ''}" ${n === page ? 'aria-current="page"' : ''}>${n}</button>`).join('')}<button data-act="${act}" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Berikutnya"><i class="bi bi-chevron-right"></i></button></div>`;
}
// v1.3.2: kartu barang yang sama bisa tampil di beberapa halaman (beranda & katalog) → cari input di kartu yang diklik, bukan lewat id
const inputStepper = b => (b.closest('.stepper') && b.closest('.stepper').querySelector('input')) || document.getElementById(b.dataset.for);
ACT.stepUp = b => { const i = inputStepper(b); i.value = Math.min(99, (Number(i.value) || 1) + 1); i.dispatchEvent(new Event('change', { bubbles: true })); };
ACT.stepDown = b => { const i = inputStepper(b); i.value = Math.max(1, (Number(i.value) || 1) - 1); i.dispatchEvent(new Event('change', { bubbles: true })); };

// ── Keranjang (optimistic + localStorage) ──
function saveCart() { store.set('cart', S.cart); updateNav(); }
ACT.addCart = b => {
  const it = (S.boot.items || []).find(x => x.ID === b.dataset.id);
  if (!it) return;
  // v1.3.5: barang bervarian wajib memilih warna/ukuran/berat di detail barang
  const vs = varianOf(it);
  const v = vs.length ? vs.find(x => x.id === b.dataset.varian) : null;
  if (vs.length && !v) return ACT.prodDetail({ dataset: { id: it.ID } });
  const inp = (b.closest('.act') && b.closest('.act').querySelector('.stepper input')) || document.getElementById(b.dataset.qty);
  let qty = Math.min(99, Math.max(1, Math.round(Number(inp && inp.value) || 1)));
  const ada = S.cart.find(c => c.itemId === it.ID && !c.custom && (c.varianId || '') === (v ? v.id : ''));
  // v1.3.4: tidak melebihi sisa stok (semua varian barang yang sama dihitung bersama)
  const sisa = sisaStok(it);
  if (sisa !== null) {
    const diKeranjang = S.cart.filter(c => c.itemId === it.ID && !c.custom).reduce((t, c) => t + c.qty, 0);
    if (sisa - diKeranjang <= 0) return toast(sisa <= 0 ? `Stok ${it.Nama} sedang habis.` : `Stok ${it.Nama} tinggal ${num(sisa)} dan semuanya sudah di keranjang.`, 'warning');
    if (qty > sisa - diKeranjang) { qty = sisa - diKeranjang; toast(`Stok ${it.Nama} tinggal ${num(sisa)}. Jumlah disesuaikan.`, 'warning'); }
  }
  if (ada) ada.qty = Math.min(99, ada.qty + qty);
  else S.cart.push({ key: uid(), itemId: it.ID, nama: it.Nama, negara: it.Negara, mataUang: it.MataUang, hargaAsli: it.HargaAsli, qty, kategori: it.Kategori, fotoFileId: it.FotoFileId, fotoUrl: it.FotoURL, varian: v ? labelVarian(v) : '', varianId: v ? v.id : '' });
  saveCart();
  b.classList.add('btn-success'); b.innerHTML = '<i class="bi bi-check2"></i>Masuk';
  setTimeout(() => { b.classList.remove('btn-success'); b.innerHTML = '<i class="bi bi-plus-lg"></i>Titip'; }, 1200);
  toast(`${it.Nama}${v ? ' · ' + labelVarian(v) : ''} (×${qty}) masuk keranjang.`, 'success');
};
function cartLines() {
  return S.cart.map(c => {
    const it = c.custom ? null : (S.boot.items || []).find(x => x.ID === c.itemId);
    // v1.3.5: harga varian & jasa titip per barang
    const vs = it ? varianOf(it) : [];
    const v = vs.length ? vs.find(x => x.id === c.varianId) || null : null;
    if (v) c.varian = labelVarian(v);
    const hv = it ? hargaVarian(it, v) : null;
    const h = hitungItem({ negara: it ? it.Negara : c.negara, mataUang: it ? it.MataUang : muOf(c.negara), hargaAsli: it ? hv.hargaAsli : c.hargaAsli, hargaJual: it ? hv.hargaJual : 0, jasaItem: it ? it.JasaItem : '', qty: c.qty });
    return Object.assign({ c, it, hilang: (!c.custom && !it) || (vs.length > 0 && !v), tutup: !negaraTerbuka().includes(h.negara) }, h);
  });
}
ROUTES.keranjang = { shell: 'pub', title: 'Keranjang', r: vKeranjang, auth: 'customer' };
function vKeranjang(el, p, re) {
  const co = S.ui.co || (S.ui.co = { kurir: '', alamat: '', catatan: '', pengiriman: 'Pickup', voucher: null, kode: '', poinPakai: false, poin: 0 });
  if (S.customer && !co.alamat) co.alamat = S.customer.Alamat || '';
  if (S.customer && !co.kurir && S.customer.KurirFavorit) co.kurir = S.customer.KurirFavorit;
  if (re && el.dataset.ready) { renderCartList(); renderCartSum(); return; }
  el.innerHTML = `<div class="container-xl py-4">
    <div class="stepbar"><div class="on"><i class="bi bi-bag"></i>1. Keranjang</div><div><i class="bi bi-check2-circle"></i>2. Konfirmasi pesanan</div><div><i class="bi bi-wallet2"></i>3. Bayar & lacak</div></div>
    <div class="page-head"><div><h1>Keranjang titip</h1><p>Periksa barang, lalu konfirmasi. Harga final dihitung ulang dengan kurs saat konfirmasi.</p></div></div>
    <div class="row g-4">
      <div class="col-lg-7">
        <div class="cardx mb-4"><div class="cardx-head"><h3><i class="bi bi-bag-check me-2"></i>Barang yang dititip</h3><span class="count" id="cartN"></span></div><div class="cardx-body" id="cartList"></div></div>
      </div>
      <div class="col-lg-5"><div class="cardx pad-lg" style="position:sticky;top:88px" id="cartSum"></div></div>
    </div></div>`;
  el.dataset.ready = '1';
  renderCartList(); renderCartSum();
}
function renderCartList() {
  const lines = cartLines();
  $('#cartN').textContent = cartCount() + ' barang';
  $('#cartList').innerHTML = lines.length ? lines.map(l => `<div class="cart-row">
      ${l.it ? prodImg(l.it, 'cart-thumb') : `<div class="cart-thumb g-${esc(l.negara)}"><i class="ph bi bi-link-45deg"></i></div>`}
      <div class="min-w-0"><b class="d-block">${esc(l.c.nama)}</b><div class="small muted">${negaraTag(l.negara)} ${l.c.custom ? '<span class="tag" style="background:var(--gold-subtle);color:var(--gold-ink)">Request khusus</span>' : ''} ${l.c.varian ? '· ' + esc(l.c.varian) : ''}</div>
        <div class="small mt-1">${jasaGabung() ? `${l.c.custom ? fmtAsli(l.mataUang, l.hargaAsli) + ' → ' : ''}<b>${rp(l.subtotal / l.qty)}</b> <span class="muted">/ pcs, termasuk jasa</span>` : `${l.c.custom ? fmtAsli(l.mataUang, l.hargaAsli) + ' → ' : ''}<b>${rp(l.hargaJual)}</b>${l.c.custom ? '' : ' <span class="muted">/ pcs</span>'} · ${esc((sett().memberJasaLabel || 'Jasa titip').toLowerCase())} ${rp(l.jasaIDR)}`}</div>
        ${l.hilang ? `<div class="invalid-msg"><i class="bi bi-exclamation-triangle"></i>${l.it ? 'Pilihan varian sudah berubah. Hapus lalu pilih lagi dari katalog.' : 'Barang tidak tersedia lagi. Hapus dari keranjang.'}</div>` : l.tutup ? `<div class="invalid-msg"><i class="bi bi-exclamation-triangle"></i>Titipan dari ${esc(negara(l.negara).nama)} sedang tidak dibuka. Hapus dari keranjang.</div>` : ''}</div>
      <div class="text-end"><div class="stepper mb-2"><button data-act="cartQty" data-key="${l.c.key}" data-d="-1" aria-label="Kurangi">−</button><input value="${l.qty}" readonly aria-label="Jumlah"><button data-act="cartQty" data-key="${l.c.key}" data-d="1" aria-label="Tambah">+</button></div>
        <div class="fw-bold num">${rp(l.subtotal)}</div><button class="link-btn small text-danger" data-act="cartDel" data-key="${l.c.key}">Hapus</button></div>
    </div>`).join('') : emptyState('bi-bag', 'Keranjang masih kosong', 'Pilih barang dari katalog untuk mulai titip.', '<button class="btn btn-primary" data-go="katalog">Buka katalog</button>');
}
/** Hitung ringkasan keranjang: pengiriman, voucher, poin (cermin server; server tetap menghitung ulang). */
function hitungKeranjang() {
  const co = S.ui.co;
  const lines = cartLines();
  const cs = sett().couriers || [];
  if ((!co.kurir || !cs.some(c => c.nama === co.kurir)) && cs[0]) co.kurir = cs[0].nama; // kurir lama yang sudah dihapus → kurir pertama
  const pickup = co.pengiriman === 'Pickup';
  const kur = pickup ? { harga: 0, nama: '' } : cs.find(c => c.nama === co.kurir) || { harga: 0, nama: '' };
  const base = totalOrder(lines, kur.harga, 0, 0, { pengiriman: co.pengiriman }).total;
  const pv = potonganVoucher(co.voucher, base);
  const cfg = poinCfg();
  const saldo = Math.max(0, Number((S.customer || {}).Poin) || 0);
  const bisaTukar = !!S.me && S.me.role === 'customer' && cfg.aktif && saldo > 0 && saldo >= cfg.min;
  const maksPoin = Math.floor(Math.max(0, base - pv) / cfg.nilai);
  let poin = 0;
  if (co.poinPakai && bisaTukar) poin = Math.max(0, Math.min(Math.round(Number(co.poin) || saldo), saldo, maksPoin));
  const t = totalOrder(lines, kur.harga, 0, 0, { pengiriman: co.pengiriman, potonganVoucher: pv, potonganPoin: Math.round(poin * cfg.nilai) });
  return { lines, cs, kur, pickup, base, pv, poin, saldo, bisaTukar, maksPoin, cfg, t };
}
function renderCartSum() {
  const co = S.ui.co;
  const k = hitungKeranjang();
  const { lines, cs, kur, pickup, t, cfg } = k;
  const at = tripsAktif()[0];
  const s = sett();
  const pelanggan = S.me && S.me.role === 'customer';
  const vMin = co.voucher && k.base < (Number(co.voucher.minBelanja) || 0);
  $('#cartSum').innerHTML = `<h3 class="fs-5 fw-bold mb-3">Ringkasan pembayaran</h3>
    ${jasaGabung() ? `<div class="sum-row"><span>Subtotal barang <small class="muted d-block">${lines.length} item · ${cartCount()} pcs · termasuk jasa titip</small></span><b>${rp(t.subtotal + t.jasa)}</b></div>`
      : `<div class="sum-row"><span>Subtotal barang <small class="muted d-block">${lines.length} item · ${cartCount()} pcs</small></span><b>${rp(t.subtotal)}</b></div>
    <div class="sum-row"><span>Total ${esc((s.memberJasaLabel || 'Jasa titip').toLowerCase())}</span><b>${rp(t.jasa)}</b></div>`}
    <div class="sum-row"><span>${pickup ? 'Ambil sendiri (pick up)' : 'Ongkir domestik'}</span><b>${rp(t.ongkir)}</b></div>
    ${t.potonganVoucher ? `<div class="sum-row"><span>Voucher <b class="mono">${esc(co.voucher.kode)}</b></span><b style="color:var(--mint-ink)">− ${rp(t.potonganVoucher)}</b></div>` : ''}
    ${t.potonganPoin ? `<div class="sum-row"><span>Tukar ${esc(fmtPoin(k.poin))}</span><b style="color:var(--mint-ink)">− ${rp(t.potonganPoin)}</b></div>` : ''}
    <div class="sum-total"><span class="small-caps">Total estimasi</span><b class="num">${rp(t.total)}</b></div>
    <div class="tint p-2 px-3 mt-3 small"><i class="bi bi-arrow-repeat me-1"></i>Kurs acuan: ${['JPY', 'SGD', 'MYR', 'THB'].map(m => `1 ${m} = ${rp(kursOf(m))}`).join(' · ')}<br><span class="muted">Diperbarui ${kurs().waktu ? tglJam(kurs().waktu) : '-'}</span></div>
    <hr>
    <label class="form-label d-block">Pengiriman</label>
    <div class="seg-x mb-3" role="radiogroup" aria-label="Metode pengiriman">
      <button type="button" class="${pickup ? '' : 'on'}" data-act="coKirim" data-v="Kirim" role="radio" aria-checked="${!pickup}"><i class="bi bi-truck"></i>Dikirim kurir</button>
      <button type="button" class="${pickup ? 'on' : ''}" data-act="coKirim" data-v="Pickup" role="radio" aria-checked="${pickup}"><i class="bi bi-shop"></i>Ambil sendiri</button></div>
    ${pickup ? `<div class="note-box mt-0 mb-3"><i class="bi bi-geo-alt"></i><div>Ambil di <b>${esc(s.bizAlamat || s.appName || '')}</b>. Kami kabari lewat WhatsApp saat barang siap diambil.</div></div>`
      : `<label class="form-label" for="coKurir">Kurir domestik</label>
    <select class="form-select mb-3" id="coKurir">${cs.map(c => `<option ${c.nama === co.kurir ? 'selected' : ''} value="${esc(c.nama)}">${esc(c.nama)} · ${rp(c.harga)} · ${esc(c.estimasi || '')}</option>`).join('')}</select>
    <label class="form-label" for="coAlamat">Alamat pengiriman <span class="req">*</span></label>
    <textarea class="form-control mb-3" id="coAlamat" rows="3" placeholder="Jalan, kota, kode pos">${esc(co.alamat)}</textarea>`}
    <label class="form-label" for="coKode">Kode voucher</label>
    ${co.voucher ? `<div class="voucher-on mb-3"><i class="bi bi-ticket-perforated"></i><div class="min-w-0"><b class="mono">${esc(co.voucher.kode)}</b><div class="small muted">${esc(labelVoucher(co.voucher))}${co.voucher.minBelanja ? ' · min. belanja ' + rpShort(co.voucher.minBelanja) : ''}</div>${vMin ? `<div class="small" style="color:var(--danger)">Belanja belum mencapai minimal ${rp(co.voucher.minBelanja)}.</div>` : ''}</div><button type="button" class="link-btn small text-danger ms-auto" data-act="coVoucherDel">Hapus</button></div>`
      : pelanggan ? `<div class="d-flex gap-2 mb-3"><input class="form-control mono" id="coKode" placeholder="Contoh: HEMAT50" maxlength="24" value="${esc(co.kode || '')}" autocomplete="off" style="text-transform:uppercase"><button type="button" class="btn btn-soft nowrap" data-act="coVoucher">Pakai</button></div>`
      : `<div class="small muted mb-3"><i class="bi bi-ticket-perforated"></i> Masuk sebagai member untuk memakai voucher atau poin.</div>`}
    ${pelanggan && cfg.aktif ? `<div class="poin-box mb-3"><div class="d-flex justify-content-between align-items-center gap-2"><div><b><i class="bi bi-stars me-1"></i>Poin Anda: ${esc(fmtPoin(k.saldo))}</b><div class="small muted">1 poin tiap belanja ${rp(cfg.per)} · 1 poin = ${rp(cfg.nilai)}</div></div>
        ${k.bisaTukar ? `<div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" id="coPoinPakai" ${co.poinPakai ? 'checked' : ''} aria-label="Tukar poin"></div>` : ''}</div>
        ${k.bisaTukar ? (co.poinPakai ? `<div class="d-flex gap-2 align-items-center mt-2"><input class="form-control form-control-sm text-end" id="coPoin" inputmode="numeric" value="${num(k.poin)}" aria-label="Jumlah poin ditukar"><span class="small nowrap">poin = <b>${rp(t.potonganPoin)}</b></span></div><div class="small muted mt-1">Maksimal ${esc(fmtPoin(Math.min(k.saldo, k.maksPoin)))} untuk pesanan ini.</div>` : '<div class="small mt-1">Aktifkan untuk menukar poin jadi potongan harga.</div>')
          : `<div class="small muted mt-1">Bisa ditukar setelah terkumpul ${esc(fmtPoin(cfg.min))}${k.saldo ? ' (kurang ' + esc(fmtPoin(cfg.min - k.saldo)) + ')' : ''}.</div>`}</div>` : ''}
    <label class="form-label" for="coCat">Catatan untuk shopper</label>
    <textarea class="form-control" id="coCat" rows="2" maxlength="250" placeholder="Contoh: pastikan tanggal kedaluwarsa setelah Agustus">${esc(co.catatan)}</textarea>
    <button class="btn btn-primary btn-lg w-100 mt-3" data-act="checkout" ${lines.length && !lines.some(l => l.hilang || l.tutup) ? '' : 'disabled'}><i class="bi bi-check2-circle"></i>${S.me ? 'Konfirmasi pesanan' : 'Masuk untuk konfirmasi'}</button>
    <button class="btn btn-light w-100 mt-2" data-go="katalog">Lanjut belanja</button>
    <div class="note-box"><i class="bi bi-shield-check"></i><div>Setelah konfirmasi, staff memverifikasi pesanan lalu invoice dikirim ke WhatsApp${at ? '. Trip berikutnya: <b>' + esc(at.Kota) + '</b>' : ''}.</div></div>`;
  if ($('#coKurir')) $('#coKurir').onchange = e => { co.kurir = e.target.value; renderCartSum(); };
  if ($('#coAlamat')) $('#coAlamat').oninput = e => { co.alamat = e.target.value; };
  if ($('#coKode')) { $('#coKode').oninput = e => { co.kode = e.target.value; }; $('#coKode').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ACT.coVoucher($('[data-act=coVoucher]')); } }; }
  if ($('#coPoinPakai')) $('#coPoinPakai').onchange = e => { co.poinPakai = e.target.checked; co.poin = 0; renderCartSum(); };
  if ($('#coPoin')) $('#coPoin').onchange = e => { co.poin = toNum(e.target.value); renderCartSum(); };
  $('#coCat').oninput = e => { co.catatan = e.target.value; };
}
ACT.coKirim = b => { S.ui.co.pengiriman = b.dataset.v; renderCartSum(); };
ACT.coVoucher = async b => {
  const co = S.ui.co; const kode = String(($('#coKode') || {}).value || co.kode || '').trim();
  if (!kode) { $('#coKode')?.focus(); return toast('Ketik kode voucher dulu.', 'warning'); }
  setBusy(b, true, 'Cek…');
  const r = await api('voucher.cek', { kode, base: hitungKeranjang().base });
  setBusy(b, false);
  if (!r.success) { $('#coKode')?.classList.add('is-invalid'); return toast(r.message, 'error', 'Voucher tidak bisa dipakai'); }
  co.voucher = r.data; co.kode = ''; renderCartSum();
  toast(r.data.potongan ? `Voucher ${r.data.kode} dipakai: hemat ${rp(potonganVoucher(r.data, hitungKeranjang().base))}.` : r.message, 'success');
};
ACT.coVoucherDel = () => { S.ui.co.voucher = null; renderCartSum(); };
ACT.cartQty = b => { const c = S.cart.find(x => x.key === b.dataset.key); if (!c) return; c.qty = Math.max(1, Math.min(99, c.qty + Number(b.dataset.d))); saveCart(); renderCartList(); renderCartSum(); };
ACT.cartDel = b => { S.cart = S.cart.filter(x => x.key !== b.dataset.key); saveCart(); renderCartList(); renderCartSum(); };
ACT.checkout = async b => {
  if (!S.me) { toast('Masuk atau daftar dulu untuk mengonfirmasi pesanan. Keranjang Anda tetap tersimpan.', 'info'); return go('login', { next: 'keranjang' }); }
  if (isInternal()) return toast('Akun internal membuat pesanan lewat Panel → Form Pesanan.', 'warning');
  const co = S.ui.co;
  if (co.pengiriman !== 'Pickup' && (co.alamat || '').trim().length < 10) { $('#coAlamat').classList.add('is-invalid'); $('#coAlamat').focus(); return toast('Lengkapi alamat pengiriman.', 'warning'); }
  const k = hitungKeranjang();
  if (co.voucher && k.base < (Number(co.voucher.minBelanja) || 0)) return toast(`Voucher ${co.voucher.kode} berlaku untuk belanja minimal ${rp(co.voucher.minBelanja)}. Hapus voucher atau tambah barang.`, 'warning');
  const t = k.t;
  const ok = await confirmDlg({ title: 'Konfirmasi pesanan?', text: `${cartCount()} barang · estimasi ${rp(t.total)}. Harga final mengikuti kurs saat ini.`, ok: 'Ya, pesan sekarang', icon: 'bi-bag-check' });
  if (!ok) return;
  const id = uid();
  const keranjang = S.cart.slice();
  const payload = { id, items: S.cart.map(c => c.custom ? { custom: true, nama: c.nama, link: c.link, negara: c.negara, hargaAsli: c.hargaAsli, qty: c.qty, varian: c.varian } : { itemId: c.itemId, qty: c.qty, varian: c.varian, varianId: c.varianId || '', nama: c.nama }), kurir: co.pengiriman === 'Pickup' ? '' : co.kurir, alamat: co.alamat, catatan: co.catatan,
    pengiriman: co.pengiriman === 'Pickup' ? 'Pickup' : 'Kirim', kodeVoucher: co.voucher ? co.voucher.kode : '', poinDitukar: k.poin };
  await mutate('cust.pesan', payload, {
    btn: b, busyLabel: 'Mengirim pesanan…',
    optimistic: () => {
      const o = { ID: id, NoOrder: 'Memproses…', Tanggal: new Date().toISOString(), Status: 'Baru', StatusBayar: 'Belum Lunas', CustomerNama: S.me.nama, CustomerHP: S.me.hp, Alamat: co.alamat, Subtotal: t.subtotal, JasaTitip: t.jasa, Ongkir: t.ongkir, Diskon: 0, Total: t.total, Dibayar: 0, Sisa: t.total, Kurir: payload.kurir, Catatan: co.catatan,
        Pengiriman: payload.pengiriman, KodeVoucher: payload.kodeVoucher, PotonganVoucher: t.potonganVoucher, PoinDitukar: k.poin, PotonganPoin: t.potonganPoin, _pending: true };
      const undo = upsertLocal('orders', o);
      S.cart = []; saveCart();
      S.ui.ps = { tab: 'Semua', sel: id };
      setTimeout(() => go('pesanan'), 0); // pindah halaman seketika, server menyusul
      return [undo, () => { S.cart = keranjang; saveCart(); }];
    },
    rerenderView: false,
    onOk: () => { Object.assign(S.ui.co, { catatan: '', voucher: null, kode: '', poinPakai: false, poin: 0 }); if (S.route === 'pesanan') rerender(); },
    onFail: () => { delete $('#v-keranjang').dataset.ready; go('keranjang'); }
  });
};

// ── Pesanan saya + invoice ──
function statusBayarPill(o) { return o.StatusBayar === 'Lunas' ? pill('Lunas') : o.StatusBayar === 'DP' ? pill('DP', 'dp') : pill('Belum Lunas'); }
function invoicePaper(o, opt = {}) {
  const s = sett();
  const items = itemsOf(o.ID);
  const gab = jasaGabung() && (!isInternal() || opt.dokumen);
  const inv = o.InvoiceID ? invById(o.InvoiceID) : null;
  const pays = paysOf(o.ID);
  const neg = negara(o.Negara);
  return `<div class="inv-paper" id="${opt.id || 'invPaper'}">
    <div class="d-flex justify-content-between gap-3 flex-wrap mb-3">
      <div><div class="d-flex align-items-center gap-2"><span class="brand-logo" style="width:36px;height:36px">${s.logoUrl ? `<img src="${esc(s.logoUrl)}" alt="">` : LOGO_SVG}</span><span class="inv-brand">${esc(s.appName || 'Jastica')}</span></div>
        <div class="muted small mt-1">${esc(s.tagline || '')}<br>${esc(s.bizAlamat || '')}<br><i class="bi bi-whatsapp"></i> ${esc(fmtHP(s.bizHP))}${s.bizEmail ? ' · ' + esc(s.bizEmail) : ''}</div></div>
      <div class="text-end"><span class="pill primary nodot">${inv ? 'INVOICE RESMI' : 'RINCIAN PESANAN'}</span><div class="inv-no mt-2">${esc(inv ? inv.NoInvoice : o.NoOrder)}</div>
        <div class="small muted mt-1">${inv ? `Tanggal terbit: <b style="color:#1F1B3A">${tgl(inv.Tanggal)}</b><br>Jatuh tempo: <b style="color:#E11D48">${tgl(inv.JatuhTempo)}</b><br>` : `Dibuat: <b style="color:#1F1B3A">${tglJam(o.Tanggal)}</b><br>`}No. pesanan: <b style="color:#1F1B3A">${esc(o.NoOrder)}</b></div>
        <div class="mt-2">${statusBayarPill(o)}</div></div>
    </div>
    <div class="row g-3 mb-3"><div class="col-sm-6"><div class="ib h-100"><div class="small-caps" style="color:#6B6885">Ditagihkan kepada</div><div class="fw-bold fs-6 mt-1">${esc(o.CustomerNama)}</div><div class="small">${esc(fmtHP(o.CustomerHP))}</div><div class="small muted mt-1">${esc(o.Alamat || '')}</div></div></div>
      <div class="col-sm-6"><div class="ib h-100"><div class="small-caps" style="color:#6B6885">Informasi jastip</div><div class="fw-bold fs-6 mt-1">${flag(o.Negara)} ${esc(neg.nama)} (${esc(neg.mataUang)})</div><div class="small">${o.Pengiriman === 'Pickup' ? 'Pengiriman: <b>Ambil sendiri (pick up)</b>' : 'Kurir: ' + esc(o.Kurir || '-')}</div><div class="small muted mt-1"><i class="bi bi-lock"></i> Kurs terkunci saat pesanan dibuat</div></div></div></div>
    <div class="tbl-wrap"><table><thead><tr><th>No</th><th>Nama item</th><th class="c">Qty</th><th class="r">Harga asli</th>${gab ? '<th class="r">Harga satuan</th>' : '<th class="r">Kurs</th><th class="r">Harga IDR</th><th class="r">Jasa titip</th>'}<th class="r">Subtotal</th></tr></thead><tbody>
      ${items.map((it, i) => `<tr><td>${i + 1}</td><td><b>${esc(it.Nama)}</b>${it.Varian ? `<div class="small muted">${esc(it.Varian)}</div>` : ''}<div class="small muted">${esc(negara(it.Negara).nama)}${it.Custom ? ' · request khusus' : ''}</div></td><td class="c">${it.Qty}</td><td class="r num">${it.MataUang === 'IDR' || Number(it.HargaJual) > 0 ? '-' : fmtAsli(it.MataUang, it.HargaAsli)}</td>${gab ? `<td class="r num">${num(Math.round(it.Subtotal / Math.max(1, it.Qty)))}</td>` : `<td class="r num">${it.MataUang === 'IDR' || Number(it.HargaJual) > 0 ? '-' : fmtKurs(it.Kurs)}</td><td class="r num">${num(Number(it.HargaJual) > 0 ? it.HargaJual : it.HargaIDR)}</td><td class="r num">${num(it.JasaIDR)}</td>`}<td class="r num"><b>${num(it.Subtotal)}</b></td></tr>`).join('') || `<tr><td colspan="${gab ? 6 : 8}" class="muted">Rincian barang sedang disiapkan…</td></tr>`}
      ${o.Ongkir ? `<tr><td></td><td><i class="bi bi-truck"></i> Ongkir domestik <span class="muted small">(${esc(o.Kurir || '-')})</span></td><td></td><td></td>${gab ? '<td></td>' : '<td></td><td></td><td></td>'}<td class="r num"><b>${num(o.Ongkir)}</b></td></tr>` : ''}
    </tbody></table></div>
    <div class="row g-3 mt-1"><div class="col-md-6">
      <div class="pay-box"><div class="small-caps mb-2" style="color:#6B6885"><i class="bi bi-bank"></i> Instruksi pembayaran</div>${(s.bankInfo || []).map(bk => `<div class="d-flex justify-content-between align-items-center gap-2 py-1"><div><b>${esc(bk.bank)}</b> <span class="num">${esc(bk.noRek)}</span><div class="small muted">a.n. ${esc(bk.atasNama)}</div></div><button class="btn btn-sm btn-light" data-act="copy" data-text="${esc(bk.noRek)}"><i class="bi bi-copy"></i>Salin</button></div>`).join('')}
        ${ewalletAktif().map(e => `<div class="d-flex justify-content-between align-items-center gap-2 py-1"><div><b>${esc(e.nama)}</b> <span class="num">${esc(e.nomor)}</span><div class="small muted">a.n. ${esc(e.atasNama)}</div></div><button class="btn btn-sm btn-light" data-act="copy" data-text="${esc(e.nomor)}"><i class="bi bi-copy"></i>Salin</button></div>`).join('')}
        <div class="small muted mt-2">Setelah transfer, kirim bukti pembayaran ke admin lewat WhatsApp. Verifikasi oleh admin.</div></div>
      ${o.Catatan ? `<div class="small mt-3"><div class="small-caps" style="color:#6B6885">Catatan</div>${esc(o.Catatan)}</div>` : ''}
    </div><div class="col-md-6"><div class="tot-box">
      ${gab ? `<div class="sum-row"><span>Subtotal barang</span><b>${rp((Number(o.Subtotal) || 0) + (Number(o.JasaTitip) || 0))}</b></div>` : `<div class="sum-row"><span>Subtotal barang</span><b>${rp(o.Subtotal)}</b></div>
      <div class="sum-row"><span>Total jasa titip</span><b>${rp(o.JasaTitip)}</b></div>`}
      <div class="sum-row"><span>Ongkos kirim</span><b>${rp(o.Ongkir)}</b></div>
      ${o.Diskon ? `<div class="sum-row"><span>Diskon</span><b>− ${rp(o.Diskon)}</b></div>` : ''}
      ${o.PotonganVoucher ? `<div class="sum-row"><span>Voucher ${esc(o.KodeVoucher || '')}</span><b>− ${rp(o.PotonganVoucher)}</b></div>` : ''}
      ${o.PotonganPoin ? `<div class="sum-row"><span>Tukar ${esc(fmtPoin(o.PoinDitukar))}</span><b>− ${rp(o.PotonganPoin)}</b></div>` : ''}
      <div class="grand"><span>TOTAL TAGIHAN</span><b class="num">${rp(o.Total)}</b></div>
      <div class="sum-row mt-1"><span>Sudah dibayar</span><b style="color:#059669">${rp(o.Dibayar)}</b></div>
      <div class="sum-row"><span><b>Sisa tagihan</b></span><b style="color:#E11D48">${rp(o.Sisa)}</b></div>
    </div></div></div>
    <div class="text-center small muted mt-3">Terima kasih telah menggunakan ${esc(s.appName || 'Jastica')}. Invoice dibuat otomatis${pays.length ? ' · ' + pays.length + ' catatan pembayaran' : ''}.</div>
  </div>`;
}
const STATUS_URUT = ['Baru', 'Dibeli', 'Dikirim', 'Selesai'];
function timelineOrder(o) {
  const idx = STATUS_URUT.indexOf(o.Status);
  const label = { Baru: ['Pesanan diterima', 'Staff memverifikasi barang & harga'], Dibeli: ['Barang dibeli', 'Shopper sudah membelanjakan barang di toko resmi'], Dikirim: ['Dalam pengiriman', 'Barang dikirim ke alamat Anda'], Selesai: ['Selesai', 'Barang diterima. Terima kasih!'] };
  if (o.Status === 'Batal') return '<div class="alert-x danger"><i class="bi bi-x-circle"></i><div>Pesanan dibatalkan. Hubungi admin untuk info pengembalian dana.</div></div>';
  return `<ul class="timeline">${STATUS_URUT.map((s, i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}"><span class="tl-dot">${i < idx ? '<i class="bi bi-check-lg"></i>' : i + 1}</span><b>${label[s][0]}</b><small>${label[s][1]}</small></li>`).join('')}</ul>`;
}
ROUTES.pesanan = { shell: 'pub', title: 'Pesanan Saya', r: vPesananSaya, auth: 'customer' };
function vPesananSaya(el) {
  // v1.4.1: urutan tab Semua, Belum Bayar (bawaan), Dibeli, Dikirim, Selesai
  const st = S.ui.ps || (S.ui.ps = { tab: 'Belum Bayar', sel: null });
  const all = ordersSorted();
  const tabs = ['Semua', 'Belum Bayar', 'Dibeli', 'Dikirim', 'Selesai'];
  if (!tabs.includes(st.tab)) st.tab = 'Belum Bayar';
  const belumBayar = o => o.Sisa > 0 && o.Status !== 'Batal';
  const cnt = t => t === 'Semua' ? all.length : t === 'Belum Bayar' ? all.filter(belumBayar).length : all.filter(o => o.Status === t).length;
  const list = all.filter(o => st.tab === 'Semua' || (st.tab === 'Belum Bayar' ? belumBayar(o) : o.Status === st.tab));
  if (!st.sel || !list.some(o => o.ID === st.sel)) st.sel = list[0] ? list[0].ID : null;
  const o = st.sel ? orderById(st.sel) : null;
  const outstanding = all.filter(x => x.Status !== 'Batal').reduce((s, x) => s + (x.Sisa || 0), 0);
  el.innerHTML = `<div class="container-xl py-4">
    <div class="page-head"><div><h1>Pesanan saya</h1><p>Pantau status titipan dan unduh invoice resmi.</p></div>
      <div class="cardx pad d-flex gap-4"><div><div class="small-caps">Pesanan aktif</div><b class="fs-5">${all.filter(x => !['Selesai', 'Batal'].includes(x.Status)).length}</b></div><div><div class="small-caps">Sisa tagihan</div><b class="fs-5" style="color:var(--danger)">${rp(outstanding)}</b></div></div></div>
    <div class="tabs-x">${tabs.map(t => `<button class="chip ${st.tab === t ? 'on' : ''} ${t === 'Belum Bayar' ? 'danger' : ''}" data-act="psTab" data-tab="${t}">${t}<span class="count">${cnt(t)}</span></button>`).join('')}</div>
    ${!all.length ? `<div class="cardx">${emptyState('bi-receipt', 'Belum ada pesanan', 'Mulai titip barang dari katalog. Pesanan Anda akan muncul di sini.', '<button class="btn btn-primary" data-go="katalog">Buka katalog</button>')}</div>` : `
    <div class="row g-4"><div class="col-lg-5">
      ${list.map(x => `<article class="cardx ord-card ${x.ID === st.sel ? 'on' : ''}" data-act="psSel" data-id="${x.ID}" tabindex="0" role="button" aria-pressed="${x.ID === st.sel}">
        <div class="d-flex justify-content-between gap-2"><div><b>${esc(x.NoOrder)}</b>${x._pending ? ' <span class="spin d-inline-block" style="width:12px;height:12px;border:2px solid var(--primary);border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></span>' : ''}<div class="small muted">Dibuat ${tglJam(x.Tanggal)}</div></div><div class="d-flex flex-column align-items-end gap-1">${pill(x.Status)}${statusBayarPill(x)}</div></div>
        <div class="ord-items d-flex justify-content-between gap-2"><span class="clamp-1">${esc(itemsOf(x.ID).map(i => i.Qty + '× ' + i.Nama).join(', ') || 'Memuat rincian…')}</span><span class="muted nowrap">${itemsOf(x.ID).length} item</span></div>
        <div class="d-flex justify-content-between align-items-end"><div><div class="small-caps">Total tagihan</div><b class="fs-5 num">${rp(x.Total)}</b></div><span class="link-btn small">Lihat invoice <i class="bi bi-arrow-right"></i></span></div>
        ${belumDiulas(x) ? `<div class="ulas-ajak"><span aria-hidden="true">★</span>Beri ulasan ${belumDiulas(x)} barang${poinUlasanAktif() ? ` · +${num(poinUlasan() * belumDiulas(x))} poin` : ''}</div>` : ''}
      </article>`).join('') || `<div class="cardx">${emptyState('bi-funnel', 'Tidak ada pesanan', 'Tidak ada pesanan di tab ini.')}</div>`}
    </div><div class="col-lg-7">${o ? `
      <div class="ps-aksi mb-3">
        <a class="btn btn-wa" href="${waLink(sett().bizHP, 'Halo, saya mau tanya pesanan ' + o.NoOrder)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>Bantuan</a>
        <button class="btn btn-primary" data-act="custPdf" data-id="${o.ID}" ${o._pending ? 'disabled' : ''}><i class="bi bi-download"></i>Unduh Invoice</button>
        ${bisaBatalMember(o) ? `<button class="btn btn-danger-soft" data-act="custBatal" data-id="${o.ID}"><i class="bi bi-x-circle"></i>Batalkan pesanan</button>` : ''}
      </div>
      ${kartuUlasanOrder(o)}
      ${invoicePaper(o)}
      <div class="row g-3 mt-1"><div class="col-md-6"><div class="cardx pad h-100"><h3 class="fs-6 fw-bold mb-3">Status perjalanan</h3>${timelineOrder(o)}</div></div>
        <div class="col-md-6"><div class="cardx pad h-100"><h3 class="fs-6 fw-bold mb-3">Riwayat pembayaran</h3>${paysOf(o.ID).length ? paysOf(o.ID).map(p => `<div class="d-flex justify-content-between align-items-center py-2 border-bottom" style="border-color:var(--row-line)!important"><div><b class="num">${rp(p.Jumlah)}</b><div class="small muted">${tglJam(p.Tanggal)} · ${esc(p.Metode || '')}${p.Status === 'Ditolak' && p.Catatan ? ' · ' + esc(p.Catatan) : ''}</div></div>${pill(p.Status)}</div>`).join('') : '<p class="muted small mb-0">Belum ada pembayaran.</p>'}</div></div></div>` : ''}
    </div></div>`}
  </div>`;
}
ACT.psTab = b => { S.ui.ps.tab = b.dataset.tab; S.ui.ps.sel = null; rerender(); };
ACT.psSel = b => { S.ui.ps.sel = b.dataset.id; rerender(); if (window.innerWidth < 992) $('#invPaper')?.scrollIntoView({ behavior: 'smooth' }); };
ACT.custPdf = async b => {
  const res = await (async () => { setBusy(b, true, 'Menyiapkan…'); const r = await api('invoice.pdf', { orderId: b.dataset.id }); setBusy(b, false); return r; })();
  if (res.success) preview({ fileId: res.data.fileId, nama: res.data.noInvoice + '.pdf' });
  // v1.4.1: tombol Cetak dihapus → bila invoice resmi belum terbit, rincian pesanan dibuka di jendela cetak (Simpan sebagai PDF)
  else if (/belum diterbitkan/i.test(res.message || '')) { toast('Invoice resmi belum diterbitkan admin. Rincian pesanan dibuka — pilih "Simpan sebagai PDF" untuk mengunduh.', 'info'); ACT.printInvoice(b); }
  else { toast(res.message, 'info'); }
};
ACT.printInvoice = b => {
  const o = orderById(b.dataset.id);
  if (!o) return;
  $('#printArea').innerHTML = invoicePaper(o, { id: 'invPrint' });
  setTimeout(() => window.print(), 50);
};
ACT.copy = async b => {
  try { await navigator.clipboard.writeText(b.dataset.text); toast('Disalin: ' + b.dataset.text, 'success'); }
  catch (e) { toast('Salin manual: ' + b.dataset.text, 'info'); }
};
ACT.custBayar = b => {
  const o = orderById(b.dataset.id);
  const metode = b.dataset.metode || 'Transfer Bank';
  const opsi = metodeBayarList(); if (!opsi.includes(metode)) opsi.push(metode);
  modal({
    title: 'Upload bukti pembayaran',
    body: `<div class="tint p-3 mb-3 d-flex justify-content-between"><span>Sisa tagihan <b>${esc(o.NoOrder)}</b></span><b class="num" style="color:var(--danger)">${rp(o.Sisa)}</b></div>
      <form id="fBayar" novalidate>
        <div class="row g-3"><div class="col-sm-6"><label class="form-label">Jumlah dibayar <span class="req">*</span></label><div class="input-group"><span class="input-group-text">Rp</span><input class="form-control" name="jumlah" inputmode="numeric" data-uang value="${num(o.Sisa)}"></div></div>
          <div class="col-sm-6"><label class="form-label">Metode</label><select class="form-select" name="metode">${opsi.map(m => `<option ${m === metode ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></div>
          <div class="col-12"><label class="form-label">Foto bukti pembayaran <span class="req">*</span></label>${dropzone('bukti', 'Klik atau seret foto bukti pembayaran')}</div>
          <div class="col-12"><label class="form-label">Catatan (opsional)</label><input class="form-control" name="catatan" maxlength="200" placeholder="Contoh: transfer dari rekening a.n. ..."></div></div>
      </form>`,
    foot: `<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnKirimBukti"><i class="bi bi-send"></i>Kirim bukti</button>`
  });
  $('#btnKirimBukti').onclick = async e => {
    const f = $('#fBayar'); clearErr(f);
    const d = formData(f);
    const jumlah = toNum(d.jumlah);
    if (jumlah <= 0) return fieldErr(f, 'jumlah', 'Isi jumlah yang dibayar.');
    const file = _files.bukti;
    if (!file) return toast('Pilih foto bukti pembayaran dulu.', 'warning');
    const id = uid();
    await mutate('cust.bayar', { id, orderId: o.ID, jumlah, metode: d.metode, catatan: d.catatan, file: takeFile('bukti') }, {
      btn: e.currentTarget, busyLabel: 'Mengunggah…',
      optimistic: () => upsertLocal('payments', { ID: id, OrderID: o.ID, NoOrder: o.NoOrder, Tanggal: new Date().toISOString(), Jumlah: jumlah, Metode: d.metode, Status: 'Menunggu' }),
      onOk: () => closeModal()
    });
  };
};

// ── Akun customer ──
ROUTES.akun = { shell: 'pub', title: 'Akun Saya', r: vAkun, auth: 'customer' };
function vAkun(el, p, re) {
  if (re && el.dataset.ready === S.me.id) { renderPoinCard(); segarkanFotoUi(true); return; }
  const c = S.customer || {};
  el.innerHTML = `<div class="container-xl py-4" style="max-width:980px">
    <div class="page-head"><div><h1>Akun saya</h1><p>Kelola profil, alamat pengiriman, dan keamanan akun.</p></div></div>
    <div class="row g-4"><div class="col-lg-7"><div class="cardx pad-lg">
      <div class="d-flex align-items-center gap-3 mb-4">${fotoProfilHtml()}<div class="min-w-0"><h2 class="fs-4 fw-bold">${esc(S.me.nama)}</h2><div class="muted">${esc(fmtHP(S.me.hp))} · ${pill(c.Tier || 'Member', slug(c.Tier || 'reguler'))}</div><div class="mt-1">${fotoAksiHtml()}</div></div></div>
      <form id="fProfil" class="row g-3" novalidate>
        <div class="col-sm-6"><label class="form-label">Nama lengkap</label><input class="form-control" name="nama" value="${esc(S.me.nama)}" required></div>
        <div class="col-sm-6"><label class="form-label">Email (untuk invoice)</label><input class="form-control" name="email" type="email" value="${esc(S.me.email || '')}" placeholder="opsional"></div>
        <div class="col-12"><label class="form-label">Alamat pengiriman utama</label><textarea class="form-control" name="alamat" rows="3">${esc(c.Alamat || '')}</textarea></div>
        <div class="col-12"><button class="btn btn-primary" type="submit"><i class="bi bi-check2"></i>Simpan profil</button></div>
      </form></div><div id="poinCard"></div></div>
      <div class="col-lg-5">${gantiPinCard()}<button class="btn btn-danger-soft w-100 mt-3" data-act="logout"><i class="bi bi-box-arrow-right"></i>Keluar dari akun</button></div></div></div>`;
  el.dataset.ready = S.me.id;
  renderPoinCard();
  $('#fProfil').onsubmit = async e => {
    e.preventDefault(); const f = e.target; clearErr(f);
    const d = formData(f);
    if (d.nama.length < 3) return fieldErr(f, 'nama', 'Nama minimal 3 huruf.');
    if (d.alamat.length < 10) return fieldErr(f, 'alamat', 'Alamat terlalu pendek.');
    const res = await mutate('profil.simpan', d, { btn: f.querySelector('[type=submit]'), busyLabel: 'Menyimpan…', rerenderView: false });
    if (res.success) { S.me = res.data.me; if (res.changes && res.changes.customers) S.customer = res.changes.customers[0]; const s = store.get('sess'); if (s) { s.me = S.me; store.set('sess', s); } renderPubNav(); }
  };
  bindGantiPin(); // v1.3.5: member memakai PIN 6 digit
  if (S.me.wajibPin) setTimeout(forceBuatPin, 300);
}
function renderPoinCard() {
  const box = $('#poinCard'); if (!box) return;
  const cfg = poinCfg(); const saldo = Math.max(0, Number((S.customer || {}).Poin) || 0);
  if (!cfg.aktif && !saldo) { box.innerHTML = ''; return; }
  const riwayat = (S.d.poin || []).slice().sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal))).slice(0, 8);
  const pct = cfg.min ? Math.min(100, saldo / cfg.min * 100) : 100;
  box.innerHTML = `<div class="cardx pad-lg mt-4"><div class="d-flex justify-content-between align-items-start gap-2 flex-wrap"><div><b class="fs-5 d-block"><i class="bi bi-stars me-1" style="color:var(--gold)"></i>Poin saya</b><span class="small muted">1 poin tiap belanja ${rp(cfg.per)} (dihitung saat pesanan lunas)</span></div><span class="pill primary nodot">1 poin = ${rp(cfg.nilai)}</span></div>
    <div class="d-flex align-items-baseline gap-2 mt-3"><span class="fs-2 fw-bold num">${num(saldo)}</span><span class="muted">poin ≈ ${rp(saldo * cfg.nilai)}</span></div>
    <div class="bar mt-2 mb-1"><span style="width:${pct}%"></span></div>
    <div class="small ${saldo >= cfg.min && saldo > 0 ? '' : 'muted'}">${saldo >= cfg.min && saldo > 0 ? '<i class="bi bi-check-circle" style="color:var(--mint-ink)"></i> Bisa ditukar jadi potongan harga di keranjang.' : 'Kumpulkan ' + esc(fmtPoin(Math.max(0, cfg.min - saldo))) + ' lagi untuk bisa menukar (minimal ' + esc(fmtPoin(cfg.min)) + ').'}</div>
    ${riwayat.length ? `<div class="small-caps mt-3 mb-1">Riwayat poin</div>${riwayat.map(l => `<div class="d-flex justify-content-between gap-2 py-1 border-bottom small"><span class="min-w-0"><span class="d-block text-truncate">${esc(l.Keterangan || l.Tipe)}</span><span class="muted">${tgl(l.Tanggal)}</span></span><b class="num nowrap" style="color:${l.Poin >= 0 ? 'var(--mint-ink)' : 'var(--danger)'}">${l.Poin >= 0 ? '+' : '−'}${num(Math.abs(l.Poin))}</b></div>`).join('')}` : ''}</div>`;
}
function gantiSandiCard() {
  return `<div class="cardx pad-lg"><h3 class="fs-5 fw-bold mb-3"><i class="bi bi-shield-lock me-2"></i>Ganti kata sandi</h3>
    <form id="fSandi" novalidate><div class="mb-3"><label class="form-label">Kata sandi lama</label><input type="password" class="form-control" name="lama" autocomplete="current-password"></div>
    <div class="mb-3"><label class="form-label">Kata sandi baru</label><input type="password" class="form-control" name="baru" autocomplete="new-password" data-strength><div class="strength"><span></span><span></span><span></span><span></span></div></div>
    <button class="btn btn-outline-primary w-100" type="submit">Perbarui kata sandi</button></form>
    <div class="note-box"><i class="bi bi-phone"></i><div>Satu akun hanya aktif di satu perangkat. Masuk di perangkat lain otomatis mengakhiri sesi di perangkat ini.</div></div></div>`;
}
function bindGantiSandi() {
  const f = $('#fSandi'); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault(); clearErr(f);
    const d = formData(f);
    if (!d.lama) return fieldErr(f, 'lama', 'Isi kata sandi lama.');
    if (d.baru.length < 8 || !/\d/.test(d.baru) || !/[a-z]/i.test(d.baru)) return fieldErr(f, 'baru', 'Minimal 8 karakter berisi huruf dan angka.');
    const res = await mutate('auth.gantiSandi', d, { btn: f.querySelector('[type=submit]'), busyLabel: 'Menyimpan…', rerenderView: false });
    if (res.success) f.reset();
  };
}
function strengthOf(p) { let s = 0; if (p.length >= 8) s++; if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^\w]/.test(p) || p.length >= 12) s++; return p ? Math.max(1, s) : 0; }

// ════════════════════════════════════════════════════════
// BAGIAN 12: AUTENTIKASI — masuk, daftar, OTP, lupa sandi
// ════════════════════════════════════════════════════════
const authLogo = () => `<div class="auth-logo"><span class="brand-logo" style="width:52px;height:52px;border-radius:16px">${sett().logoUrl ? `<img src="${esc(sett().logoUrl)}" alt="">` : LOGO_SVG}</span></div>`;
ROUTES.login = { shell: 'pub', title: 'Masuk', r: vLogin, guest: true };
function vLogin(el, p, re) {
  if (re) return;
  store.del('pin_dev'); // v1.3.5: masuk cepat per perangkat dihapus (member kini selalu masuk dengan PIN 6 digit)
  const u0 = userTersimpan();
  el.innerHTML = `<div class="cardx auth-card">${authLogo()}
    <h1>Masuk ke ${esc(sett().appName || 'Jastica')}</h1>
    <form id="fLogin" novalidate>
      <div class="mb-3"><div class="input-icon"><i class="bi bi-person" id="lgIkonUser"></i><input class="form-control" id="lgUser" name="username" autocomplete="username" placeholder="Username / No. WhatsApp" aria-label="Username atau nomor WhatsApp" value="${esc(u0)}" required></div>
        <label class="form-check ingat-user mt-2 mb-0"><input class="form-check-input" type="checkbox" id="lgIngat" ${u0 ? 'checked' : ''}> <span>Simpan Username</span></label></div>
      <div class="mb-2"><label class="form-label" for="lgPass" id="lgPassLbl">Kata sandi <span class="req">*</span></label>
        <div class="input-icon"><i class="bi bi-lock" id="lgPassIkon"></i><input class="form-control" id="lgPass" name="password" type="password" autocomplete="current-password" required><button type="button" class="icon-btn sm eye" data-act="togglePass" data-for="lgPass" aria-label="Tampilkan kata sandi"><i class="bi bi-eye"></i></button></div>
        <div class="text-end mt-2"><button type="button" class="link-btn small" id="lgReset" data-go="lupa"><i class="bi bi-key"></i> <span>Reset Password</span></button></div></div>
      <button class="btn btn-primary btn-lg w-100 mt-3" type="submit">Masuk<i class="bi bi-arrow-right"></i></button>
    </form>
    <div class="or">ATAU</div>
    <p class="text-center mb-0">Belum punya akun? <button class="link-btn" data-go="daftar">Daftar sekarang</button></p>
    <div class="note-box"><i class="bi bi-shield-lock"></i><div><b>Catatan keamanan</b><br>Satu akun hanya dapat aktif di satu perangkat. Login baru otomatis mengakhiri sesi lama. Anda keluar otomatis setelah ${Math.round(idleMs() / 60e3)} menit tanpa aktivitas.</div></div>
  </div>`;
  $('#lgUser').addEventListener('input', aturModeLogin); aturModeLogin(); // v1.3.5: nomor WhatsApp → kolom PIN
  $('#fLogin').onsubmit = async e => {
    e.preventDefault(); const f = e.target; clearErr(f);
    const d = formData(f);
    const pin = loginPakaiPin(d.username);
    if (!d.username) return fieldErr(f, 'username', 'Isi username atau nomor WhatsApp.');
    if (!d.password) return fieldErr(f, 'password', pin ? 'Isi PIN 6 angka.' : 'Isi kata sandi.');
    simpanUserLogin($('#lgIngat').checked, d.username); // v1.3.4
    const btn = f.querySelector('[type=submit]');
    setBusy(btn, true, 'Memeriksa…');
    const res = await api('auth.login', { username: d.username, password: d.password, device: deviceLabel() });
    setBusy(btn, false);
    if (res.success && res.data.perlu2fa) { toast(res.message, 'info'); go('verifikasi', Object.assign({ next: p.next }, res.data)); return; }
    if (res.success) { toast(res.message, 'success'); startSession(res.data, p.next); return; }
    if (res.code === 'NEED_OTP') {
      toast(res.message, 'info');
      const r2 = await api('auth.otpKirim', { hp: res.hp, tujuan: 'daftar' });
      go('otp', { hp: res.hp, hpSamar: res.hpSamar, tujuan: 'daftar', demoOtp: r2.success ? r2.data.demoOtp : '', info: r2.message, waGagal: !!(r2.data && r2.data.waGagal), next: p.next });
      return;
    }
    toast(res.message, 'error', 'Gagal masuk');
    f.password.value = ''; f.password.focus();
  };
  fokusAwal(u0 ? '#lgPass' : '#lgUser');
}
ACT.togglePass = b => { const i = document.getElementById(b.dataset.for); i.type = i.type === 'password' ? 'text' : 'password'; b.innerHTML = `<i class="bi ${i.type === 'password' ? 'bi-eye' : 'bi-eye-slash'}"></i>`; };

ROUTES.daftar = { shell: 'pub', title: 'Daftar', r: vDaftar, guest: true };
function vDaftar(el, p, re) {
  if (re) return;
  el.innerHTML = `<div class="cardx auth-card wide">${authLogo()}
    <h1>Daftar akun customer</h1><p class="sub">Lengkapi profil untuk mulai menitip barang. Nomor WhatsApp akan diverifikasi dengan kode OTP.</p>
    <form id="fDaftar" class="row g-3" novalidate>
      <div class="col-12"><label class="form-label">Nama lengkap <span class="req">*</span></label><div class="input-icon"><i class="bi bi-person"></i><input class="form-control" name="nama" autocomplete="name" maxlength="80" placeholder="Sesuai identitas"></div></div>
      <div class="col-sm-6"><label class="form-label">Nomor HP / WhatsApp <span class="req">*</span></label><div class="input-group"><span class="input-group-text">+62</span><input class="form-control" name="hp" inputmode="tel" autocomplete="tel" placeholder="812-3456-7890"></div><div class="form-text">Untuk kode OTP & update pesanan.</div></div>
      <div class="col-sm-6"><label class="form-label">Email (opsional)</label><input class="form-control" name="email" type="email" autocomplete="email" placeholder="untuk salinan invoice"></div>
      <div class="col-12"><label class="form-label">Alamat pengiriman <span class="req">*</span></label><textarea class="form-control" name="alamat" rows="3" autocomplete="street-address" placeholder="Jalan, RT/RW, kelurahan, kota, kode pos"></textarea></div>
      <div class="col-sm-6"><label class="form-label" for="rgPin">PIN 6 angka <span class="req">*</span></label><div class="input-icon"><i class="bi bi-grid-3x3-gap"></i>${inputPin('rgPin', 'pin')}<button type="button" class="icon-btn sm eye" data-act="togglePass" data-for="rgPin" aria-label="Tampilkan PIN"><i class="bi bi-eye"></i></button></div><div class="form-text">Dipakai untuk masuk bersama nomor WhatsApp.</div></div>
      <div class="col-sm-6"><label class="form-label" for="rgPin2">Ulangi PIN <span class="req">*</span></label>${inputPin('rgPin2', 'pin2')}<div class="form-text">Hindari 123456 atau 111111.</div></div>
      <div class="col-12"><label class="form-check"><input class="form-check-input" type="checkbox" name="setuju"> <span class="small">Saya menyetujui syarat layanan jastip, kebijakan bea cukai, dan pengembalian dana.</span></label></div>
      <div class="col-12"><button class="btn btn-primary btn-lg w-100" type="submit"><i class="bi bi-send-check"></i>Daftar dan kirim OTP</button></div>
    </form>
    <p class="text-center mt-3 mb-0">Sudah punya akun? <button class="link-btn" data-go="login">Masuk</button></p>
  </div>`;
  $('#fDaftar').onsubmit = async e => {
    e.preventDefault(); const f = e.target; clearErr(f);
    const d = formData(f);
    if (d.nama.length < 3) return fieldErr(f, 'nama', 'Nama lengkap minimal 3 huruf.');
    if (!/^62\d{8,13}$/.test(normHP(d.hp))) return fieldErr(f, 'hp', 'Nomor HP tidak valid. Contoh: 081234567890.');
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return fieldErr(f, 'email', 'Format email tidak valid.');
    if (d.alamat.length < 10) return fieldErr(f, 'alamat', 'Lengkapi alamat: jalan, kota, kode pos.');
    if (!cekPinKlien(f, 'pin', 'pin2')) return; // v1.3.5: daftar dengan PIN 6 digit
    if (!d.setuju) return toast('Centang persetujuan syarat layanan terlebih dulu.', 'warning');
    const btn = f.querySelector('[type=submit]');
    setBusy(btn, true, 'Mendaftarkan…');
    const res = await api('auth.register', { nama: d.nama, hp: d.hp, email: d.email, alamat: d.alamat, pin: d.pin });
    setBusy(btn, false);
    if (!res.success) return toast(res.message, 'error', 'Pendaftaran gagal');
    S.ui.co = Object.assign(S.ui.co || {}, { alamat: d.alamat });
    go('otp', { hp: res.data.hp, hpSamar: res.data.hpSamar, tujuan: 'daftar', demoOtp: res.data.demoOtp, info: res.message, waGagal: !!res.data.waGagal, next: p.next });
  };
}

ROUTES.otp = { shell: 'pub', title: 'Verifikasi OTP', r: vOtp, guest: true };
let _otpTimer = null;
function vOtp(el, p, re) {
  if (re) return;
  if (!p.hp) return go('daftar');
  const reset = p.tujuan === 'reset';
  S.ui.otpSandi = false;
  el.innerHTML = `<div class="cardx auth-card">
    <div class="auth-logo"><span class="kpi-ic" style="width:60px;height:60px;font-size:26px;border-radius:18px"><i class="bi bi-chat-dots"></i></span></div>
    <h1>${reset ? 'Buat PIN baru' : 'Verifikasi nomor HP'}</h1>
    <p class="sub">Kode 6 digit dikirim ke WhatsApp <b>${esc(p.hpSamar || p.hp)}</b></p>
    ${p.demoOtp ? `<div class="demo-otp"><i class="bi bi-cone-striped me-1"></i>Kode Anda: <b class="mono fs-6">${esc(p.demoOtp)}</b><div class="small mt-1">${esc(p.info || 'Mode uji aktif: kode ditampilkan di layar.')}</div></div>`
      : p.waGagal ? `<div class="alert-x danger mb-3"><i class="bi bi-whatsapp"></i><div><b>WhatsApp gagal terkirim</b><br>${esc(p.info || '')}<br><span class="small">Coba kirim ulang setelah hitungan selesai, atau hubungi admin.</span></div></div>` : ''}
    <div id="otpErr"></div>
    <form id="fOtp" novalidate>
      <div class="otp-boxes" id="otpBoxes">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" maxlength="1" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" aria-label="Digit ${i + 1}">`).join('')}</div>
      <div class="d-flex justify-content-between small mb-3"><span class="muted">Kode berlaku <b id="otpLeft">05:00</b></span><button type="button" class="link-btn" id="otpResend" disabled>Kirim ulang kode</button></div>
      ${reset ? `<div class="mb-3" id="otpPinBox"><div class="row g-3"><div class="col-6"><label class="form-label" for="otpPin">PIN baru <span class="req">*</span></label>${inputPin('otpPin', 'pinBaru')}</div><div class="col-6"><label class="form-label" for="otpPin2">Ulangi PIN <span class="req">*</span></label>${inputPin('otpPin2', 'pinBaru2')}</div></div>
          <div class="form-text">Akun pengurus? <button type="button" class="link-btn small" data-act="otpModeSandi">Atur kata sandi baru</button></div></div>
        <div class="mb-3" id="otpSandiBox" hidden><label class="form-label" for="otpSandi">Kata sandi baru pengurus <span class="req">*</span></label><input class="form-control" id="otpSandi" name="passwordBaru" type="password" autocomplete="new-password" data-strength><div class="strength"><span></span><span></span><span></span><span></span></div>
          <div class="form-text"><button type="button" class="link-btn small" data-act="otpModePin">Akun member? Buat PIN baru</button></div></div>` : ''}
      <button class="btn btn-primary btn-lg w-100" type="submit"><i class="bi bi-shield-check"></i>${reset ? 'Verifikasi & simpan' : 'Verifikasi'}</button>
    </form>
    <p class="text-center mt-3 mb-0"><button class="link-btn" data-go="${reset ? 'lupa' : 'daftar'}"><i class="bi bi-pencil"></i> Ubah nomor HP</button></p>
  </div>`;
  const boxes = $$('#otpBoxes input');
  boxes.forEach((b, i) => {
    b.addEventListener('input', () => { b.value = b.value.replace(/\D/g, '').slice(-1); if (b.value && boxes[i + 1]) boxes[i + 1].focus(); if (boxes.every(x => x.value) && !reset) $('#fOtp').requestSubmit(); });
    b.addEventListener('keydown', e => { if (e.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus(); });
    b.addEventListener('paste', e => { const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (t.length) { e.preventDefault(); t.split('').forEach((c, j) => { if (boxes[j]) boxes[j].value = c; }); boxes[Math.min(5, t.length)].focus(); if (t.length === 6 && !reset) $('#fOtp').requestSubmit(); } });
  });
  boxes[0].focus();
  let left = 300, cool = 60;
  clearInterval(_otpTimer);
  const resend = $('#otpResend');
  _otpTimer = setInterval(() => {
    if (!document.body.contains(resend)) return clearInterval(_otpTimer);
    left = Math.max(0, left - 1); cool = Math.max(0, cool - 1);
    $('#otpLeft').textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
    resend.disabled = cool > 0;
    resend.textContent = cool > 0 ? `Kirim ulang (${cool} dtk)` : 'Kirim ulang kode';
  }, 1000);
  resend.onclick = async () => {
    setBusy(resend, true);
    const r = await api('auth.otpKirim', { hp: p.hp, tujuan: p.tujuan });
    setBusy(resend, false);
    if (r.success) {
      left = 300; cool = 60; toast(r.message, r.data.waGagal ? 'warning' : 'success');
      if (r.data.demoOtp || r.data.waGagal || p.waGagal) { p.demoOtp = r.data.demoOtp || ''; p.waGagal = !!r.data.waGagal; p.info = r.message; vOtp(el, p); }
    }
    else toast(r.message, 'error');
  };
  $('#fOtp').onsubmit = async e => {
    e.preventDefault();
    const kode = boxes.map(b => b.value).join('');
    if (kode.length !== 6) return toast('Masukkan 6 digit kode.', 'warning');
    const f = e.target; const d = formData(f); clearErr(f);
    const pakaiSandi = reset && S.ui.otpSandi;
    if (reset && pakaiSandi && (String(d.passwordBaru || '').length < 8 || !/\d/.test(d.passwordBaru) || !/[a-z]/i.test(d.passwordBaru))) return fieldErr(f, 'passwordBaru', 'Minimal 8 karakter berisi huruf dan angka.');
    if (reset && !pakaiSandi && !cekPinKlien(f, 'pinBaru', 'pinBaru2')) return;
    const btn = f.querySelector('[type=submit]');
    setBusy(btn, true, 'Memverifikasi…');
    const res = await api('auth.otpVerifikasi', { hp: p.hp, kode, tujuan: p.tujuan, pinBaru: pakaiSandi ? '' : d.pinBaru, passwordBaru: pakaiSandi ? d.passwordBaru : '', device: deviceLabel() });
    setBusy(btn, false);
    if (res.success) { clearInterval(_otpTimer); toast(res.message, 'success'); startSession(res.data, p.next); return; }
    // v1.3.5: jenis akun ternyata berbeda (member ↔ pengurus) → kode OTP tetap berlaku, ganti isian
    if (res.code === 'PERLU_SANDI' || res.code === 'PERLU_PIN') { (res.code === 'PERLU_SANDI' ? ACT.otpModeSandi : ACT.otpModePin)(); toast(res.message, 'warning'); return; }
    $('#otpBoxes').classList.remove('err'); void $('#otpBoxes').offsetWidth; $('#otpBoxes').classList.add('err');
    $('#otpErr').innerHTML = `<div class="alert-x danger"><i class="bi bi-exclamation-triangle"></i><div><b>Kode OTP tidak valid</b><br>${esc(res.message)}</div></div>`;
    boxes.forEach(b => { b.value = ''; }); boxes[0].focus();
  };
}

ROUTES.lupa = { shell: 'pub', title: 'Lupa PIN', r: vLupa, guest: true };
function vLupa(el, p, re) {
  if (re) return;
  el.innerHTML = `<div class="cardx auth-card">${authLogo()}<h1>Lupa PIN?</h1><p class="sub">Masukkan nomor WhatsApp terdaftar. Kami kirim kode OTP untuk membuat PIN baru.</p>
    <form id="fLupa" novalidate><div class="mb-3"><label class="form-label">Nomor HP / WhatsApp</label><div class="input-icon"><i class="bi bi-phone"></i><input class="form-control" name="hp" inputmode="tel" placeholder="081234567890"></div></div>
    <button class="btn btn-primary btn-lg w-100" type="submit">Kirim kode OTP</button></form>
    <p class="text-center mt-3 mb-0"><button class="link-btn" data-go="login"><i class="bi bi-arrow-left"></i> Kembali ke halaman masuk</button></p>
    <div class="note-box"><i class="bi bi-person-badge"></i><div>Akun pengurus (staff/keuangan/owner) tanpa nomor HP: minta Super Admin mereset kata sandi.</div></div></div>`;
  $('#fLupa').onsubmit = async e => {
    e.preventDefault(); const f = e.target; clearErr(f);
    const hp = normHP(f.hp.value);
    if (!/^62\d{8,13}$/.test(hp)) return fieldErr(f, 'hp', 'Nomor HP tidak valid.');
    const btn = f.querySelector('[type=submit]');
    setBusy(btn, true, 'Mengirim…');
    const res = await api('auth.otpKirim', { hp, tujuan: 'reset' });
    setBusy(btn, false);
    if (!res.success) return toast(res.message, 'error');
    toast(res.message, 'success');
    go('otp', { hp: res.data.hp, hpSamar: res.data.hpSamar, tujuan: 'reset', demoOtp: res.data.demoOtp, info: res.message, waGagal: !!res.data.waGagal });
  };
}

// ════════════════════════════════════════════════════════
// BAGIAN 13: PANEL — BERANDA (dashboard)
// ════════════════════════════════════════════════════════

function sum(arr, f) { return arr.reduce((s, x) => s + (Number(f === undefined ? x : typeof f === 'function' ? f(x) : x[f]) || 0), 0); }
const inRange = (v, a, b) => { const d = ymd(v); return d >= a && d <= b; };
function monthRange(offset = 0) { const d = new Date(); const a = new Date(d.getFullYear(), d.getMonth() + offset, 1); const b = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0); return [ymd(a), ymd(b)]; }
function pctDelta(now, prev) { if (!prev) return now ? null : 0; return (now - prev) / Math.abs(prev) * 100; }
function deltaChip(p, label = '') {
  if (p === null || p === undefined || !isFinite(p)) return `<span class="delta info">baru</span>`;
  const cls = p > 0.5 ? '' : p < -0.5 ? 'down' : 'flat';
  return `<span class="delta ${cls}"><i class="bi ${p > 0.5 ? 'bi-arrow-up-right' : p < -0.5 ? 'bi-arrow-down-right' : 'bi-dash'}"></i>${p > 0 ? '+' : ''}${num(p, 1)}%${label}</span>`;
}
function kpi(ic, cls, label, val, foot, chip, valCls = '') {
  return `<div class="cardx kpi"><div class="kpi-top"><span class="kpi-ic ${cls}"><i class="bi ${ic}"></i></span>${chip || ''}</div><div><div class="kpi-label">${label}</div><div class="kpi-val ${valCls}">${val}</div></div><div class="kpi-foot">${foot || ''}</div></div>`;
}
function hitungKeuangan(a, b) {
  const orders = S.d.orders.filter(o => o.Status !== 'Batal' && inRange(o.Tanggal, a, b));
  const omzet = sum(orders, 'Total');
  const pembelian = sum(S.d.purchases.filter(p => inRange(p.Tanggal, a, b)), 'TotalIDR');
  const biaya = sum(S.d.expenses.filter(e => inRange(e.Tanggal, a, b)), 'Jumlah');
  const laba = omzet - pembelian - biaya;
  return { orders, omzet, pembelian, biaya, laba, jasa: sum(orders, 'JasaTitip') };
}

ROUTES['a-beranda'] = { shell: 'adm', title: 'Beranda', r: aBeranda, perm: 'dashboard' };
function aBeranda(el) {
  const today = ymd();
  const yest = addDays(today, -1);
  const tx = S.d.transactions;
  const masukH = sum(tx.filter(t => t.Tipe === 'Masuk' && ymd(t.Tanggal) === today && t.RefTipe !== 'Transfer'), 'Jumlah');
  const masukK = sum(tx.filter(t => t.Tipe === 'Masuk' && ymd(t.Tanggal) === yest && t.RefTipe !== 'Transfer'), 'Jumlah');
  const keluarH = sum(tx.filter(t => t.Tipe === 'Keluar' && ymd(t.Tanggal) === today && t.RefTipe !== 'Transfer'), 'Jumlah');
  const [mA, mB] = monthRange(0), [pA, pB] = monthRange(-1);
  const fin = hitungKeuangan(mA, mB), finPrev = hitungKeuangan(pA, pB);
  const showLaba = canAny(['laporan', 'dompet']);
  const lb = showLaba ? labaPeriode(mA, mB) : null, lbPrev = showLaba ? labaPeriode(pA, pB) : null; // v1.3.3: keuntungan = margin + jasa titip
  const aktif = S.d.orders.filter(o => !['Selesai', 'Batal'].includes(o.Status));
  const baru = S.d.orders.filter(o => o.Status === 'Baru');
  const baruHariIni = S.d.orders.filter(o => ymd(o.Tanggal) === today);
  const unpaid = S.d.orders.filter(o => o.Sisa > 0 && o.Status !== 'Batal');
  const due = overdueOrders();
  const rute = Array.from(new Set(aktif.map(o => negara(o.Negara).nama)));
  const showFin = canAny(['laporan', 'dompet']);
  const pendPay = S.d.payments.filter(p => p.Status === 'Menunggu');
  const kpis = showFin ? [
    kpi('bi-cash-coin', '', 'Uang Masuk Hari Ini', rp(masukH), `vs ${rp(masukK)} kemarin`, deltaChip(pctDelta(masukH, masukK))),
    kpi('bi-bag-dash', 'coral', 'Uang Keluar Hari Ini', rp(keluarH), 'Modal beli, bagasi & ongkir', '<span class="delta flat">Operasional</span>'),
    kpi('bi-bank', 'mint', 'Keuntungan Bulan Ini', rp(lb.total), `<div class="bar mint mt-1"><span style="width:${Math.min(100, Math.max(0, lb.jual + lb.jasa ? lb.total / (lb.jual + lb.jasa) * 100 * 3 : 0))}%"></span></div><span>Margin ${rpShort(lb.margin)} + jasa ${rpShort(lb.jasa)} · <button type="button" class="link-btn small" data-act="lihatLaba">Rincian</button></span>`, deltaChip(pctDelta(lb.total, lbPrev.total))),
    kpi('bi-cart-check', 'sky', 'Pesanan Baru', baru.length + ' Pesanan', `${baruHariIni.length} masuk hari ini`, `<span class="delta info">${pendPay.length} perlu verifikasi</span>`),
    kpi('bi-receipt', 'danger', 'Tagihan Belum Lunas', rp(sum(unpaid, 'Sisa')), `Dari ${unpaid.length} pesanan aktif`, due.length ? `<span class="delta down">${due.length} jatuh tempo</span>` : '', 'danger')
  ] : [
    kpi('bi-cart-check', 'sky', 'Pesanan Baru', baru.length, `${baruHariIni.length} masuk hari ini`),
    kpi('bi-hourglass-split', 'gold', 'Pesanan Aktif', aktif.length, 'Baru, dibeli, dan dikirim'),
    kpi('bi-bag-check', '', 'Belum Dibelanjakan', baru.length, 'Siapkan daftar belanja shopper'),
    kpi('bi-truck', 'mint', 'Dalam Pengiriman', S.d.orders.filter(o => o.Status === 'Dikirim').length, 'Pantau resi kurir'),
    kpi('bi-receipt', 'danger', 'Belum Lunas', unpaid.length + ' pesanan', 'Ingatkan customer bila perlu')
  ];
  const trip = tripsAktif()[0];
  const k = kurs();
  const ws = S.d.wallets.filter(w => w.Aktif !== false);
  const totalSaldo = sum(ws, w => S.saldo[w.ID] || 0);
  const insight = buatInsight(fin, finPrev, due, pendPay);
  el.innerHTML = `
  <div class="hero mb-4"><div class="hero-grid"><div>
    <span class="hero-pill"><span class="dot"></span>${esc(sett().appName || 'Jastica')} · Tersinkron ${S.lastSync ? relatif(S.lastSync) : 'sekarang'}</span>
    <h1 class="mt-3" style="font-size:32px;font-weight:800;letter-spacing:-.02em">Halo, ${esc(S.me.nama)}</h1>
    <div style="opacity:.85">(${esc(S.me.roleLabel)})</div>
    <p class="lead-sm">Ringkasan hari ini: <b>${aktif.length} pesanan aktif</b>${rute.length ? ` tersebar di ${rute.length} rute belanja (<u>${esc(rute.join(', '))}</u>)` : ''}.${pendPay.length && can('pembayaran') ? ` ${pendPay.length} bukti transfer menunggu verifikasi.` : ''}</p>
    <div class="d-flex gap-2 flex-wrap mt-3">${can('pesanan.tulis') ? '<button class="btn btn-white" data-go="a-form"><i class="bi bi-plus-circle"></i>Buat Pesanan Baru</button>' : ''}${can('laporan') ? '<button class="btn btn-glass" data-go="a-laporan"><i class="bi bi-graph-up"></i>Lihat Laporan Harian</button>' : '<button class="btn btn-glass" data-go="a-pesanan"><i class="bi bi-list-check"></i>Lihat Pesanan</button>'}</div>
  </div>${heroSvg('adm', 230)}</div></div>

  <div class="kpi-grid five mb-4">${kpis.join('')}</div>
  ${showLaba ? kartuLaba() : ''}

  <div class="row g-4 mb-4">
    ${showFin ? `<div class="col-xl-8"><div class="cardx h-100"><div class="cardx-head"><div><h3>Tren Penjualan & Keuntungan</h3><div class="cardx-sub">Omzet pesanan vs laba bersih (omzet − pembelian − biaya)</div></div>
      <div class="seg" role="tablist">${[['bulan', 'Bulan Ini'], ['30', '30 Hari'], ['90', '3 Bulan']].map(([v, t]) => `<button class="${(S.ui.trend || 'bulan') === v ? 'on' : ''}" data-act="trendRange" data-v="${v}" role="tab">${t}</button>`).join('')}</div></div>
      <div class="cardx-body"><div class="sum-strip" id="trendSum"></div><div class="chart-box"><canvas id="chTrend" aria-label="Grafik tren penjualan dan keuntungan" role="img"></canvas></div></div></div></div>
    <div class="col-xl-4"><div class="cardx h-100"><div class="cardx-head"><div><h3>Sebaran Uang Kas</h3><div class="cardx-sub">Saldo per dompet: rekening & e-wallet</div></div></div>
      <div class="cardx-body"><div class="donut-wrap mb-3"><canvas id="chWallet" role="img" aria-label="Sebaran saldo dompet"></canvas><div class="donut-center"><div><small>Total Kas</small><b>${rpShort(totalSaldo)}</b></div></div></div>
      ${ws.length ? ws.map(w => `<div class="legend-row"><div class="d-flex align-items-center gap-2 min-w-0"><span class="sw" style="background:${esc(w.Warna || '#6C5CE7')}"></span><div class="min-w-0"><b class="d-block clamp-1">${esc(w.Nama)}</b><small class="muted">${esc(w.Jenis)}</small></div></div><div class="text-end"><b>${rp(S.saldo[w.ID] || 0)}</b><small class="d-block muted">${totalSaldo ? num((S.saldo[w.ID] || 0) / totalSaldo * 100, 1) : 0}%</small></div></div>`).join('') : '<p class="muted">Belum ada dompet.</p>'}
      ${can('dompet') ? '<button class="btn btn-soft w-100 mt-2" data-go="a-dompet"><i class="bi bi-wallet2"></i>Kelola Dompet & Mutasi</button>' : ''}</div></div></div>` : ''}
  </div>

  <div class="row g-4">
    <div class="col-xl-8"><div class="cardx h-100"><div class="cardx-head"><div class="d-flex gap-3 align-items-center"><span class="kpi-ic"><i class="bi bi-bag"></i></span><div><h3>Pesanan Terbaru</h3><div class="cardx-sub">Titipan terbaru yang sedang diproses</div></div></div><button class="link-btn" data-go="a-pesanan">Lihat semua <i class="bi bi-arrow-right"></i></button></div>
      <div class="cardx-body"><div class="tbl-wrap">${tabelOrderMini(ordersSorted().slice(0, 6))}</div></div></div></div>
    <div class="col-xl-4 d-flex flex-column gap-4">
      ${trip ? `<div class="cardx pad"><div class="d-flex justify-content-between align-items-start"><div><b class="fs-6">${flag(trip.Negara)} Trip ${esc(trip.Kota)}</b><div class="small muted">${tglPendek(trip.TglMulai)} – ${tgl(trip.TglSelesai)}</div></div>${trip.Status === 'Aktif' ? pill('Sedang Jalan', 'selesai') : pill('Akan Datang', 'akan-datang')}</div>
        ${trip.Kuota ? `<div class="tint p-3 mt-3"><div class="d-flex justify-content-between small mb-2"><span class="muted">Sisa kuota bagasi (${num(trip.Kuota)} kg)</span><b>${num(trip.Terisi / trip.Kuota * 100)}% terisi</b></div><div class="bar"><span style="width:${Math.min(100, trip.Terisi / trip.Kuota * 100)}%"></span></div></div>` : ''}
        <div class="small mt-2 d-flex justify-content-between"><span class="muted">Shopper: <b class="text-2">${esc(trip.Shopper || '-')}</b></span><span class="countdown">${trip.Status === 'Aktif' ? 'Sisa ' + Math.max(0, daysBetween(today, trip.TglSelesai)) + ' hari' : 'H-' + daysBetween(today, trip.TglMulai)}</span></div></div>` : ''}
      <div class="cardx pad"><div class="d-flex justify-content-between align-items-center mb-3"><b class="fs-6"><i class="bi bi-currency-exchange me-2 ink"></i>Live Kurs Jual</b><span class="pill primary nodot">${Object.keys(k.manual || {}).length ? 'Ada kurs manual' : 'Otomatis'}</span></div>
        <div class="row g-2">${['JPY', 'SGD', 'MYR', 'THB'].map(m => `<div class="col-6"><div class="kurs-tile"><div class="p"><span>${m} / IDR</span>${(k.manual || {})[m] ? '<span class="tag" title="Kurs manual owner">manual</span>' : ''}</div><b>Rp ${fmtKurs(k.rates[m])}</b></div></div>`).join('')}</div>
        <div class="small muted mt-2">Sumber ${esc(k.sumber || '-')} · ${k.waktu ? tglJam(k.waktu) : ''}</div></div>
      ${due.length && can('pengingat') ? `<div class="cardx pad due-card"><div class="small fw-bold" style="color:var(--danger)"><i class="bi bi-asterisk"></i> ${due.length} tagihan jatuh tempo</div><div class="d-flex justify-content-between align-items-center mt-1"><div><b class="fs-5">${rp(sum(due, 'Sisa'))}</b><div class="small muted">Menunggu pelunasan</div></div><button class="btn btn-success" data-go="a-pengingat" aria-label="Kirim pengingat"><i class="bi bi-whatsapp"></i></button></div></div>` : ''}
      <div class="cardx pad"><b class="fs-6"><i class="bi bi-stars me-2 ink"></i>Analisis Otomatis</b><ul class="insight small mt-2 mb-0 ps-3">${insight.map(i => `<li>${i}</li>`).join('')}</ul></div>
    </div>
  </div>`;
  if (showFin) { renderTrend(); renderWalletDonut('chWallet', ws); renderLaba(); }
}
function buatInsight(fin, prev, due, pend) {
  const out = [];
  const byNeg = {};
  fin.orders.forEach(o => { byNeg[o.Negara] = (byNeg[o.Negara] || 0) + o.Total; });
  const top = Object.entries(byNeg).sort((a, b) => b[1] - a[1])[0];
  if (top && fin.omzet) out.push(`<b>${esc(negara(top[0]).nama)}</b> menyumbang ${num(top[1] / fin.omzet * 100, 1)}% omzet bulan ini (${rpShort(top[1])}).`);
  const d = pctDelta(fin.omzet, prev.omzet);
  if (d !== null && isFinite(d) && canAny(['laporan', 'dompet'])) out.push(`Omzet bulan ini ${d >= 0 ? 'naik' : 'turun'} <b>${num(Math.abs(d), 1)}%</b> dibanding bulan lalu.`);
  if (fin.omzet && canAny(['laporan', 'dompet'])) out.push(`Rata-rata nilai pesanan ${rp(fin.omzet / Math.max(1, fin.orders.length))}; jasa titip ${num(fin.jasa / fin.omzet * 100, 1)}% dari omzet.`);
  if (due.length) out.push(`<b>${due.length}</b> tagihan lewat jatuh tempo senilai ${rpShort(sum(due, 'Sisa'))}. Kirim pengingat agar arus kas lancar.`);
  if (pend.length && can('pembayaran')) out.push(`${pend.length} bukti transfer menunggu verifikasi (${rpShort(sum(pend, 'Jumlah'))}).`);
  const custTop = {};
  fin.orders.forEach(o => { custTop[o.CustomerNama] = (custTop[o.CustomerNama] || 0) + o.Total; });
  const ct = Object.entries(custTop).sort((a, b) => b[1] - a[1])[0];
  if (ct) out.push(`Pelanggan terbesar bulan ini: <b>${esc(ct[0])}</b> (${rpShort(ct[1])}).`);
  return out.length ? out : ['Belum cukup data bulan ini. Insight muncul otomatis setelah ada transaksi.'];
}
ACT.trendRange = b => { S.ui.trend = b.dataset.v; $$('[data-act=trendRange]').forEach(x => x.classList.toggle('on', x === b)); renderTrend(); };
function renderTrend() {
  const mode = S.ui.trend || 'bulan';
  const today = ymd();
  let a, b = today, group = 'day';
  if (mode === 'bulan') a = monthRange(0)[0];
  else if (mode === '30') a = addDays(today, -29);
  else { a = addDays(today, -89); group = 'week'; }
  const keyOf = v => { if (group === 'day') return ymd(v); const d = toDate(ymd(v)); const s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(s); };
  const keys = [];
  for (let d = a; d <= b; d = addDays(d, group === 'day' ? 1 : 7)) keys.push(keyOf(d));
  const uniq = Array.from(new Set(keys));
  const om = {}, lb = {};
  uniq.forEach(k => { om[k] = 0; lb[k] = 0; });
  S.d.orders.filter(o => o.Status !== 'Batal' && inRange(o.Tanggal, a, b)).forEach(o => { const k = keyOf(o.Tanggal); if (k in om) { om[k] += o.Total; lb[k] += o.Total; } });
  S.d.purchases.filter(p => inRange(p.Tanggal, a, b)).forEach(p => { const k = keyOf(p.Tanggal); if (k in lb) lb[k] -= p.TotalIDR; });
  S.d.expenses.filter(e => inRange(e.Tanggal, a, b)).forEach(e => { const k = keyOf(e.Tanggal); if (k in lb) lb[k] -= e.Jumlah; });
  const totOm = sum(Object.values(om)), totLb = sum(Object.values(lb));
  $('#trendSum').innerHTML = `<div><span class="vbar"></span><div><small>Total Omzet</small><b>${rp(totOm)}</b></div></div><div><span class="vbar" style="background:var(--coral)"></span><div><small>Laba Bersih</small><b style="color:var(--coral-ink)">${rp(totLb)}</b></div></div><div><span class="vbar" style="background:var(--mint)"></span><div><small>Net Profit Margin</small><b style="color:var(--mint-ink)">${totOm ? num(totLb / totOm * 100, 1) : 0}%</b></div></div>`;
  const c = chartColors();
  const ctx = document.getElementById('chTrend');
  if (!ctx) return;
  const g = ctx.getContext('2d').createLinearGradient(0, 0, 0, 280);
  g.addColorStop(0, c.primary + '40'); g.addColorStop(1, c.primary + '00');
  const g2 = ctx.getContext('2d').createLinearGradient(0, 0, 0, 280);
  g2.addColorStop(0, 'rgba(255,138,101,.25)'); g2.addColorStop(1, 'rgba(255,138,101,0)');
  makeChart('chTrend', {
    type: 'line',
    data: { labels: uniq.map(k => group === 'day' ? tglPendek(k) : 'Mg ' + tglPendek(k)), datasets: [
      { label: 'Omzet', data: uniq.map(k => om[k]), borderColor: c.primary, backgroundColor: g, fill: true, tension: .4, borderWidth: 3, pointRadius: 0, pointHoverRadius: 5 },
      { label: 'Laba bersih', data: uniq.map(k => lb[k]), borderColor: c.coral, backgroundColor: g2, fill: true, tension: .4, borderWidth: 3, pointRadius: 0, pointHoverRadius: 5 }
    ] },
    options: { plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: x => ' ' + x.dataset.label + ': ' + rp(x.raw) } } }, scales: { y: { ticks: { callback: rpTick } }, x: { ticks: { maxTicksLimit: 8 } } } }
  });
}
function renderWalletDonut(id, ws) {
  const data = ws.map(w => Math.max(0, S.saldo[w.ID] || 0));
  makeChart(id, {
    type: 'doughnut',
    data: { labels: ws.map(w => w.Nama), datasets: [{ data, backgroundColor: ws.map(w => w.Warna || '#6C5CE7'), borderWidth: 0, hoverOffset: 6 }] },
    options: { cutout: '74%', plugins: { tooltip: { callbacks: { label: x => ' ' + x.label + ': ' + rp(x.raw) } } } }
  });
}
function tabelOrderMini(list) {
  if (!list.length) return emptyState('bi-cart', 'Belum ada pesanan', 'Pesanan dari customer & staff akan tampil di sini.', can('pesanan.tulis') ? '<button class="btn btn-primary" data-go="a-form">Buat pesanan</button>' : '');
  return `<table class="tbl"><thead><tr><th>ID Pesanan</th><th>Pelanggan</th><th>Negara</th><th class="r">Total IDR</th><th>Status</th><th>Bayar</th></tr></thead><tbody>
    ${list.map(o => `<tr class="clickable" data-act="openOrder" data-id="${o.ID}" tabindex="0"><td><span class="id-link">#${esc(o.NoOrder)}</span><span class="sub">${tglJam(o.Tanggal)}</span></td>
      <td><div class="person">${avatar(o.CustomerNama, 'sm')}<div class="min-w-0"><b class="clamp-1">${esc(o.CustomerNama)}</b><span class="sub clamp-1">${esc(itemsOf(o.ID).map(i => i.Nama).join(', '))}</span></div></div></td>
      <td>${negaraTag(o.Negara)}</td><td class="r num"><b>${rp(o.Total)}</b></td><td>${pill(o.Status)}</td><td>${statusBayarPill(o)}</td></tr>`).join('')}</tbody></table>`;
}

// ════════════════════════════════════════════════════════
// BAGIAN 14: PANEL — PESANAN (daftar + inspektor)
// ════════════════════════════════════════════════════════
ROUTES['a-pesanan'] = { shell: 'adm', title: 'Pesanan', r: aPesanan, perm: 'pesanan.lihat' };
function filterOrders(st) {
  const q = (st.q || '').toLowerCase();
  return ordersSorted().filter(o =>
    (!st.neg || o.Negara === st.neg) && (!st.status || o.Status === st.status) &&
    (!st.bayar || o.StatusBayar === st.bayar) && (!st.bulan || String(ymd(o.Tanggal)).slice(0, 7) === st.bulan) &&
    (!st.tindakan || o.Status === 'Baru' || paysOf(o.ID).some(p => p.Status === 'Menunggu')) &&
    (!q || (o.NoOrder + ' ' + o.CustomerNama + ' ' + o.CustomerHP + ' ' + itemsOf(o.ID).map(i => i.Nama).join(' ')).toLowerCase().includes(q)));
}
function aPesanan(el, p, re) {
  const st = S.ui.ord || (S.ui.ord = { q: '', neg: '', status: '', bayar: '', bulan: '', tindakan: false, page: 1, sel: new Set() });
  if (p.status && !re) { st.status = p.status; st.page = 1; }
  if (re && el.dataset.ready) { renderOrderTable(); renderOrderHead(); return; }
  el.innerHTML = `<div class="cardx pad-lg mb-4" id="ordHead"></div>
    <div class="cardx pad mb-3" id="ordPipe"></div>
    <div class="tabs-x" id="ordTabs"></div>
    <div class="cardx mb-3"><div class="filter-bar">
      <div class="input-icon grow"><i class="bi bi-search"></i><input class="form-control" id="ordQ" type="search" placeholder="Cari no. order, nama customer, WhatsApp, barang…" value="${esc(st.q)}" aria-label="Cari pesanan"></div>
      <select class="form-select" style="max-width:180px" id="ordStatus" aria-label="Filter status"><option value="">Semua status</option>${['Baru', 'Dibeli', 'Dikirim', 'Selesai', 'Batal'].map(s => `<option ${st.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <select class="form-select" style="max-width:170px" id="ordBayar" aria-label="Filter pembayaran"><option value="">Semua pembayaran</option>${['Belum Lunas', 'DP', 'Lunas'].map(s => `<option ${st.bayar === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <input class="form-control" style="max-width:170px" type="month" id="ordBulan" value="${esc(st.bulan)}" aria-label="Filter bulan">
      <button class="chip danger ${st.tindakan ? 'on' : ''}" id="ordAction" data-act="ordTindakan"><i class="bi bi-lightning-charge"></i>Perlu tindakan</button>
    </div></div>
    <div id="ordBulk"></div>
    <div class="cardx"><div class="cardx-head"><div><h3>Daftar order jastip</h3><div class="cardx-sub" id="ordInfo"></div></div></div><div class="cardx-body pt-3"><div class="tbl-wrap" id="ordTable"></div></div><div class="tbl-foot" id="ordFoot"></div></div>`;
  el.dataset.ready = '1';
  $('#ordQ').addEventListener('input', debounce(e => { st.q = e.target.value; st.page = 1; renderOrderTable(); }, 160));
  $('#ordStatus').onchange = e => { st.status = e.target.value; st.page = 1; renderOrderTable(); };
  $('#ordBayar').onchange = e => { st.bayar = e.target.value; st.page = 1; renderOrderTable(); };
  $('#ordBulan').onchange = e => { st.bulan = e.target.value; st.page = 1; renderOrderTable(); renderOrderHead(); };
  renderOrderHead(); renderOrderTable();
}
function renderOrderHead() {
  const st = S.ui.ord;
  const all = S.d.orders;
  const base = all.filter(o => !st.bulan || String(ymd(o.Tanggal)).slice(0, 7) === st.bulan);
  $('#ordHead').innerHTML = `<div class="page-head mb-0"><div><span class="eyebrow">Operasional Toko</span><span class="sync-note">Sinkron ${S.lastSync ? relatif(S.lastSync) : '-'}</span><h1>Kelola Pesanan Jastip</h1><p>Pantau pesanan customer dari ${countries().length} negara, verifikasi barang, dan status pelunasan.</p></div>
    <div class="actions"><button class="btn btn-light" data-act="syncNow"><i class="bi bi-arrow-repeat"></i>Sinkronisasi</button><button class="btn btn-soft" data-act="exportOrders"><i class="bi bi-download"></i>Ekspor Excel</button>${can('pesanan.tulis') ? '<button class="btn btn-primary" data-go="a-form"><i class="bi bi-plus-lg"></i>Pesanan Baru</button>' : ''}</div></div>`;
  const by = s => base.filter(o => o.Status === s).length;
  const n = Math.max(1, base.filter(o => o.Status !== 'Batal').length);
  const seg = [['Baru', 'Baru Masuk', '#3B82F6', 'var(--st-baru-bg)', 'var(--st-baru)'], ['Dibeli', 'Sudah Dibeli', '#F59E0B', 'var(--st-dibeli-bg)', 'var(--st-dibeli)'], ['Dikirim', 'Kargo / Kirim', '#8B5CF6', 'var(--st-dikirim-bg)', 'var(--st-dikirim)'], ['Selesai', 'Selesai / Terima', '#10B981', 'var(--st-selesai-bg)', 'var(--st-selesai)']];
  const gmv = sum(base.filter(o => o.Status !== 'Batal'), 'Total');
  const piutang = base.filter(o => o.Sisa > 0 && o.Status !== 'Batal');
  $('#ordPipe').innerHTML = `<div class="row g-4 align-items-center"><div class="col-xl-8"><div class="d-flex align-items-center gap-2 mb-3"><i class="bi bi-diagram-3 ink"></i><b class="fs-6">Distribusi Pipeline Pesanan</b></div>
      <div class="pipeline">${seg.map(s => `<span style="width:${by(s[0]) / n * 100}%;background:${s[2]}" title="${s[1]}: ${by(s[0])}"></span>`).join('')}</div>
      <div class="pipe-chips">${seg.map(s => `<button class="pipe-chip border-0" style="background:${s[3]};color:${s[4]}" data-act="ordStatusChip" data-s="${s[0]}"><span>● ${s[1]}</span><b>${by(s[0])}</b></button>`).join('')}</div></div>
    <div class="col-xl-4"><div class="metric-side">
      ${can('laporan') || can('pembayaran') ? `<div class="tint metric-box"><div class="small-caps">Gross Merchandise Value</div><div class="v">${rp(gmv)}</div><div class="small" style="color:var(--mint-ink)"><i class="bi bi-graph-up-arrow"></i> ${base.length} pesanan${st.bulan ? ' bulan ini' : ''}</div></div>` : ''}
      <div class="tint metric-box"><div class="small-caps">Piutang belum lunas</div><div class="v" style="color:var(--danger)">${rp(sum(piutang, 'Sisa'))}</div><div class="small" style="color:var(--danger)">● ${new Set(piutang.map(o => o.CustomerID)).size} pelanggan pending pelunasan</div></div>
    </div></div></div>`;
  const negs = [['', 'Semua Wilayah', base.length]].concat(countries().map(c => [c.kode, c.nama, base.filter(o => o.Negara === c.kode).length]));
  $('#ordTabs').innerHTML = negs.map(([k, t, c]) => `<button class="chip ${st.neg === k ? 'on' : ''}" data-act="ordNeg" data-neg="${k}">${k ? flag(k) : '<i class="bi bi-globe2"></i>'}${esc(t)}<span class="count">${c}</span></button>`).join('');
}
ACT.ordNeg = b => { S.ui.ord.neg = b.dataset.neg; S.ui.ord.page = 1; renderOrderHead(); renderOrderTable(); };
ACT.ordStatusChip = b => { const st = S.ui.ord; st.status = st.status === b.dataset.s ? '' : b.dataset.s; st.page = 1; $('#ordStatus').value = st.status; renderOrderTable(); };
ACT.ordTindakan = b => { S.ui.ord.tindakan = !S.ui.ord.tindakan; b.classList.toggle('on', S.ui.ord.tindakan); S.ui.ord.page = 1; renderOrderTable(); };
ACT.ordPage = b => { S.ui.ord.page = Number(b.dataset.page); renderOrderTable(); };
ACT.syncNow = async b => { setBusy(b, true, 'Sinkron…'); const r = await syncNow(false); setBusy(b, false); if (r && r.success) { toast(r.data.same ? 'Data sudah terbaru.' : 'Data diperbarui.', 'success'); rerender(); } };
function renderOrderTable() {
  const st = S.ui.ord;
  const list = filterOrders(st);
  const per = 15, pages = Math.max(1, Math.ceil(list.length / per));
  st.page = Math.min(st.page, pages);
  const rows = list.slice((st.page - 1) * per, st.page * per);
  const nTindakan = S.d.orders.filter(o => o.Status === 'Baru' || paysOf(o.ID).some(p => p.Status === 'Menunggu')).length;
  const btnT = $('#ordAction'); if (btnT) btnT.innerHTML = `<i class="bi bi-lightning-charge"></i>Perlu tindakan (${nTindakan})`;
  $('#ordInfo').textContent = `Menampilkan ${rows.length} dari ${list.length} pesanan`;
  const canBulk = can('pesanan.status');
  $('#ordTable').innerHTML = rows.length ? `<table class="tbl"><thead><tr>${canBulk ? `<th style="width:40px"><input type="checkbox" class="form-check-input" data-act="ordSelAll" aria-label="Pilih semua"></th>` : ''}<th>ID & Tanggal</th><th>Customer</th><th>Trip negara</th><th>Ringkasan item</th><th class="r">Total</th><th>Status</th><th>Bayar</th><th></th></tr></thead><tbody>
    ${rows.map(o => { const c = custById(o.CustomerID) || {}; const its = itemsOf(o.ID); const pend = paysOf(o.ID).some(p => p.Status === 'Menunggu');
      return `<tr class="clickable ${S.ui.ordOpen === o.ID ? 'sel' : ''}" data-act="openOrder" data-id="${o.ID}" tabindex="0">
      ${canBulk ? `<td data-stop="1"><input type="checkbox" class="form-check-input" data-act="ordSel" data-id="${o.ID}" ${st.sel.has(o.ID) ? 'checked' : ''} aria-label="Pilih ${esc(o.NoOrder)}"></td>` : ''}
      <td><span class="id-link">#${esc(o.NoOrder)}</span><span class="sub">${tglJam(o.Tanggal)}</span></td>
      <td><div class="person">${avatar(o.CustomerNama, 'sm')}<div class="min-w-0"><b class="clamp-1">${esc(o.CustomerNama)}</b><span class="sub" style="color:${c.Tier === 'VIP' ? 'var(--gold-ink)' : 'var(--muted)'}">${c.Tier === 'VIP' ? '<i class="bi bi-star-fill"></i> VIP Member' : esc(c.Tier || o.Sumber || '')}</span></div></div></td>
      <td>${negaraTag(o.Negara)}</td>
      <td style="max-width:220px"><span class="clamp-1">${esc(its.map(i => i.Qty + '× ' + i.Nama).join(', '))}</span><span class="sub">${its.length} item${pend ? ' · <b style="color:var(--st-dp)">bukti transfer masuk</b>' : ''}</span></td>
      <td class="r num"><b>${rp(o.Total)}</b>${o.Sisa > 0 && o.Dibayar > 0 ? `<span class="sub">sisa ${rpShort(o.Sisa)}</span>` : ''}</td>
      <td>${pill(o.Status)}</td><td>${statusBayarPill(o)}</td><td><i class="bi bi-chevron-right muted"></i></td></tr>`; }).join('')}</tbody></table>`
    : emptyState('bi-funnel', 'Tidak ada pesanan yang cocok', 'Ubah filter atau kata kunci pencarian.');
  $('#ordFoot').innerHTML = `<span>Halaman ${st.page} dari ${pages} (${list.length} data)</span>${pager(st.page, pages, 'ordPage')}`;
  renderBulk();
}
function renderBulk() {
  const st = S.ui.ord;
  const n = st.sel.size;
  $('#ordBulk').innerHTML = n ? `<div class="bulk-bar"><b>${n} pesanan dipilih</b><select class="form-select form-select-sm" id="bulkStatus" aria-label="Ubah status ke"><option value="">Ubah status ke…</option>${['Baru', 'Dibeli', 'Dikirim', 'Selesai', 'Batal'].map(s => `<option>${s}</option>`).join('')}</select><button class="btn btn-sm btn-white" data-act="bulkApply">Terapkan</button>${can('pengingat') ? '<button class="btn btn-sm btn-glass" data-act="bulkRemind"><i class="bi bi-bell"></i>Kirim pengingat</button>' : ''}<button class="btn btn-sm btn-glass ms-auto" data-act="bulkClear">Batal pilih</button></div>` : '';
}
ACT.ordSel = (b, e) => { e.stopPropagation(); const s = S.ui.ord.sel; b.checked ? s.add(b.dataset.id) : s.delete(b.dataset.id); renderBulk(); };
ACT.ordSelAll = (b, e) => { e.stopPropagation(); $$('[data-act=ordSel]').forEach(c => { c.checked = b.checked; b.checked ? S.ui.ord.sel.add(c.dataset.id) : S.ui.ord.sel.delete(c.dataset.id); }); renderBulk(); };
ACT.bulkClear = () => { S.ui.ord.sel.clear(); renderOrderTable(); };
ACT.bulkApply = async b => {
  const status = $('#bulkStatus').value;
  if (!status) return toast('Pilih status tujuan.', 'warning');
  const ids = Array.from(S.ui.ord.sel);
  await mutate('order.status', { ids, status }, { btn: b, optimistic: () => ids.map(id => upsertLocal('orders', { ID: id, Status: status })), onOk: () => S.ui.ord.sel.clear() });
};
ACT.bulkRemind = async b => {
  const ids = Array.from(S.ui.ord.sel).filter(id => (orderById(id) || {}).Sisa > 0);
  if (!ids.length) return toast('Tidak ada pesanan belum lunas yang dipilih.', 'warning');
  await mutate('reminder.kirim', { orderIds: ids }, { btn: b, busyLabel: 'Mengirim…', onOk: () => S.ui.ord.sel.clear() });
};
ACT.exportOrders = () => {
  const list = filterOrders(S.ui.ord);
  exportExcel({
    judul: 'Daftar Pesanan', periode: S.ui.ord.bulan || 'Semua data', nama: 'Pesanan',
    kolom: [['No. Order', 16], ['Tanggal', 18], ['Customer', 24], ['WhatsApp', 16], ['Negara', 12], ['Item', 40], ['Status', 11], ['Bayar', 12], ['Total', 15, 'rp'], ['Dibayar', 15, 'rp'], ['Sisa', 15, 'rp']],
    rows: list.map(o => [o.NoOrder, tglJam(o.Tanggal), o.CustomerNama, fmtHP(o.CustomerHP), negara(o.Negara).nama, itemsOf(o.ID).map(i => i.Qty + 'x ' + i.Nama).join(', '), o.Status, o.StatusBayar, o.Total, o.Dibayar, o.Sisa]),
    total: ['TOTAL', '', '', '', '', list.length + ' pesanan', '', '', sum(list, 'Total'), sum(list, 'Dibayar'), sum(list, 'Sisa')]
  });
};

// ── Inspektor pesanan (drawer) ──
ACT.openOrder = (b, e) => {
  if (e && e.target.closest('[data-stop]')) return;
  $('#globalResults')?.classList.remove('open');
  if (isCustomer()) { S.ui.ps = { tab: 'Semua', sel: b.dataset.id }; return go('pesanan'); }
  openOrderDrawer(b.dataset.id);
};
function openOrderDrawer(id) {
  const o = orderById(id);
  if (!o) return toast('Pesanan tidak ditemukan (mungkin di luar jendela data).', 'warning');
  S.ui.ordOpen = id;
  $$('#ordTable tr.sel').forEach(r => r.classList.remove('sel'));
  $(`#ordTable tr[data-id="${id}"]`)?.classList.add('sel');
  const c = custById(o.CustomerID) || { Nama: o.CustomerNama, HP: o.CustomerHP, Alamat: o.Alamat };
  const its = itemsOf(o.ID);
  const pays = paysOf(o.ID);
  const inv = o.InvoiceID ? invById(o.InvoiceID) : null;
  const trip = (S.d.allTrips.length ? S.d.allTrips : (S.boot.trips || [])).find(t => t.ID === o.TripID);
  const otp = c.UserID ? (c.Status === 'Aktif' ? '<span class="pill st-selesai sm">OTP Terverifikasi</span>' : '<span class="pill st-dp sm">Belum OTP</span>') : '<span class="pill st-batal sm">Dibuat admin</span>';
  const pesanWA = `Halo ${o.CustomerNama}, update pesanan ${o.NoOrder}: status sekarang *${o.Status}*. Total ${rp(o.Total)}, sisa tagihan ${rp(o.Sisa)}. Terima kasih — ${sett().appName}`;
  drawer(`<span class="id-link" style="color:var(--primary-ink)">#${esc(o.NoOrder)}</span> ${pill(o.Status)}<div class="small muted fw-normal mt-1">${flag(o.Negara)} ${trip ? 'Trip ' + esc(trip.Kota) : esc(negara(o.Negara).nama)} · ${tglJam(o.Tanggal)} · ${esc(o.Sumber || '')}</div>`,
    `<div class="ins-sec tint p-3"><h4>Profil pemesan ${otp}</h4><div class="person mb-2">${avatar(c.Nama, 'lg')}<div><b class="fs-6">${esc(c.Nama)}</b> ${c.Tier === 'VIP' ? '<i class="bi bi-star-fill" style="color:var(--gold)"></i>' : ''}<span class="sub" style="color:var(--gold-ink)">${esc(c.Tier || '')}${c.Tier ? ' · ' : ''}${S.d.orders.filter(x => x.CustomerID === o.CustomerID).length} pesanan</span></div></div>
      <div class="d-flex justify-content-between small py-1"><span class="muted"><i class="bi bi-whatsapp me-1"></i>WhatsApp</span><b>${esc(fmtHP(c.HP))}</b></div>
      <div class="d-flex justify-content-between small py-1 gap-3"><span class="muted nowrap"><i class="bi bi-geo-alt me-1"></i>Kirim ke</span><span class="text-end">${esc(o.Alamat || c.Alamat || '-')}</span></div></div>
    <div class="ins-sec"><h4>Rincian barang & jasa <span class="pill primary nodot sm">${its[0] && its[0].MataUang !== 'IDR' ? '1 ' + its[0].MataUang + ' = Rp ' + fmtKurs(its[0].Kurs) : 'IDR'}</span></h4>
      ${its.map(i => `<div class="ins-item"><span class="q">${i.Qty}×</span><div class="min-w-0"><b class="d-block">${esc(i.Nama)}</b><span class="small muted">${i.MataUang === 'IDR' ? rp(i.HargaIDR) : fmtAsli(i.MataUang, i.HargaAsli) + ' (' + rp(i.HargaIDR) + ')'}${Number(i.HargaJual) > 0 ? ' · jual ' + rp(i.HargaJual) : ''}${i.Varian ? ' · ' + esc(i.Varian) : ''}</span>${i.Link ? `<a class="small d-block clamp-1" href="${esc(i.Link)}" target="_blank" rel="noopener">${esc(i.Link)}</a>` : ''}</div><div class="text-end"><b class="num">${rp(i.Subtotal)}</b><span class="d-block small muted">+ jastip ${rpShort(i.JasaIDR)}</span></div></div>`).join('')}
      ${o.Ongkir ? `<div class="ins-item" style="grid-template-columns:32px 1fr auto"><span class="q"><i class="bi bi-truck"></i></span><b>Ongkir ${esc(o.Kurir || '')}</b><b class="num">${rp(o.Ongkir)}</b></div>` : ''}</div>
    <div class="ins-sec tint p-3"><h4>Rekap finansial & margin</h4>
      ${o.Modal !== undefined ? `<div class="fin-row"><span>Modal belanja valas</span><b>${rp(o.Modal)}</b></div>` : ''}
      ${o.Modal !== undefined && Number(o.Subtotal) !== Number(o.Modal) ? `<div class="fin-row"><span>Margin harga jual</span><b style="color:${Number(o.Subtotal) >= Number(o.Modal) ? 'var(--mint-ink)' : 'var(--danger)'}">${Number(o.Subtotal) >= Number(o.Modal) ? '+ ' : '− '}${rp(Math.abs(Number(o.Subtotal) - Number(o.Modal)))}</b></div>` : ''}
      <div class="fin-row"><span>Fee jasa titip</span><b style="color:var(--mint-ink)">+ ${rp(o.JasaTitip)}</b></div>
      <div class="fin-row"><span>${o.Pengiriman === 'Pickup' ? 'Pengiriman: ambil sendiri' : 'Biaya logistik domestik'}${o.TanpaOngkir ? ' (gratis)' : ''}</span><b>${rp(o.Ongkir)}</b></div>
      ${o.TanpaJasa ? '<div class="small muted mb-1"><i class="bi bi-toggle-off"></i> Jasa titip tidak dikenakan</div>' : ''}
      ${o.Diskon ? `<div class="fin-row"><span>Diskon</span><b>− ${rp(o.Diskon)}</b></div>` : ''}
      ${o.PotonganVoucher ? `<div class="fin-row"><span>Voucher ${esc(o.KodeVoucher || '')}</span><b>− ${rp(o.PotonganVoucher)}</b></div>` : ''}
      ${o.PotonganPoin ? `<div class="fin-row"><span>Tukar ${esc(fmtPoin(o.PoinDitukar))}</span><b>− ${rp(o.PotonganPoin)}</b></div>` : ''}
      ${o.PoinDidapat ? `<div class="small" style="color:var(--mint-ink)"><i class="bi bi-stars"></i> +${esc(fmtPoin(o.PoinDidapat))} untuk customer</div>` : ''}
      <div class="fin-total"><span class="fw-bold">Total tagihan</span><b class="num">${rp(o.Total)}</b></div>
      <div class="cardx p-3 mt-2"><div class="fin-row"><span style="color:var(--mint-ink)"><i class="bi bi-check-circle"></i> Diterima</span><b style="color:var(--mint-ink)">${rp(o.Dibayar)}</b></div><div class="fin-row"><span style="color:var(--danger)"><i class="bi bi-clock"></i> Sisa pelunasan</span><b style="color:var(--danger)">${rp(o.Sisa)}</b></div></div></div>
    ${pays.length ? `<div class="ins-sec"><h4>Pembayaran (${pays.length})</h4>${pays.map(p => `<div class="d-flex justify-content-between align-items-center py-2 gap-2" style="border-bottom:1px solid var(--row-line)"><div><b class="num">${rp(p.Jumlah)}</b><span class="sub small muted">${tglJam(p.Tanggal)} · ${esc((walletById(p.WalletID) || {}).Nama || p.Metode || '')}</span></div><div class="d-flex gap-2 align-items-center">${p.BuktiFileId ? `<button class="icon-btn sm" data-act="previewFile" data-id="${p.BuktiFileId}" data-nama="Bukti ${esc(o.NoOrder)}.jpg" aria-label="Lihat bukti"><i class="bi bi-image"></i></button>` : ''}${pill(p.Status)}</div></div>`).join('')}</div>` : ''}
    ${o.Catatan ? `<div class="note-gold"><b><i class="bi bi-sticky"></i> Catatan</b><br>${esc(o.Catatan)}</div>` : ''}
    ${can('pesanan.status') ? `<div class="ins-sec mt-3"><h4>Ubah status</h4><div class="seg w-100">${['Baru', 'Dibeli', 'Dikirim', 'Selesai', 'Batal'].map(s => `<button class="${o.Status === s ? 'on' : ''} flex-fill" data-act="setStatus" data-id="${o.ID}" data-s="${s}">${s}</button>`).join('')}</div></div>` : ''}`,
    `<div class="d-flex gap-2">${can('invoice') ? `<button class="btn btn-light flex-fill" data-act="${inv ? 'goInvoice' : 'issueInvoice'}" data-id="${o.ID}"><i class="bi bi-file-earmark-text"></i>${inv ? 'Lihat Invoice' : 'Terbitkan Invoice'}</button>` : ''}${can('pembayaran') && o.Sisa > 0 && o.Status !== 'Batal' ? `<button class="btn btn-success flex-fill" data-act="catatBayar" data-id="${o.ID}"><i class="bi bi-cash-stack"></i>Catat Pelunasan</button>` : ''}</div>
     <div class="d-flex gap-2"><a class="btn btn-wa flex-fill" href="${waLink(o.CustomerHP, pesanWA)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>Kirim Update WA</a>${can('pesanan.tulis') ? `<button class="btn btn-outline-primary" data-act="editOrder" data-id="${o.ID}" aria-label="Ubah pesanan"><i class="bi bi-pencil"></i>Ubah</button>` : ''}${can('pesanan.hapus') ? `<button class="btn btn-danger-soft" data-act="hapusOrder" data-id="${o.ID}" aria-label="Hapus pesanan"><i class="bi bi-trash3"></i></button>` : ''}</div>`);
}
ACT.setStatus = async b => {
  const id = b.dataset.id, s = b.dataset.s;
  if (s === 'Batal' && !(await confirmDlg({ title: 'Batalkan pesanan?', text: 'Status pesanan menjadi Batal dan tidak lagi dihitung omzet.', ok: 'Batalkan', danger: true, icon: 'bi-x-octagon' }))) return;
  await mutate('order.status', { id, status: s }, { optimistic: () => upsertLocal('orders', { ID: id, Status: s }), onOk: () => { if (S.ui.ordOpen === id) openOrderDrawer(id); } });
  if (S.ui.ordOpen === id) openOrderDrawer(id);
};
ACT.editOrder = b => { closeDrawer(); go('a-form', { id: b.dataset.id }); };
ACT.goInvoice = b => { closeDrawer(); S.ui.inv = Object.assign(S.ui.inv || {}, { sel: b.dataset.id, tab: 'terbit' }); go('a-invoice'); };
ACT.hapusOrder = async b => {
  const o = orderById(b.dataset.id);
  if (!(await confirmDlg({ title: 'Hapus pesanan ' + o.NoOrder + '?', text: 'Pesanan, rincian barang, dan invoice akan dihapus permanen.', ok: 'Hapus', danger: true }))) return;
  closeDrawer();
  await mutate('order.hapus', { id: o.ID }, { optimistic: () => removeLocal('orders', o.ID) });
};
ACT.previewFile = b => preview({ fileId: b.dataset.id, nama: b.dataset.nama });

// ════════════════════════════════════════════════════════
// BAGIAN 15: PANEL — FORM PESANAN (buat/ubah, kalkulasi langsung, autosave)
// ════════════════════════════════════════════════════════
ROUTES['a-form'] = { shell: 'adm', title: 'Form Pesanan', r: aForm, perm: 'pesanan.tulis' };
const draftKey = () => 'draft_order_' + (S.me ? S.me.id : '');
function blankItem(neg) { neg = neg || (tripsAktif()[0] || {}).Negara || 'JP'; return { id: uid(), nama: '', varian: '', link: '', negara: neg, mataUang: muOf(neg), qty: 1, hargaAsli: '', kurs: kursOf(muOf(neg)), jasaTipe: '', jasaNilai: '', custom: false, itemId: '' }; }
function aForm(el, p, re) {
  if (re && el.dataset.ready) { renderFormCustomerPanel(); renderFormSummary(); return; }
  let F;
  if (p.restore && S.ui.formRestore) { F = S.ui.formRestore; S.ui.formRestore = null; }
  else if (p.id) {
    const o = orderById(p.id);
    if (!o) { toast('Pesanan tidak ditemukan.', 'error'); return go('a-pesanan'); }
    F = { id: o.ID, edit: true, noOrder: o.NoOrder, customerId: o.CustomerID, alamat: o.Alamat, tripId: o.TripID, status: o.Status, kurir: o.Kurir, ongkir: o.Ongkir, diskon: o.Diskon, catatan: o.Catatan, dibayar: o.Dibayar,
      tanpaJasa: !!o.TanpaJasa, tanpaOngkir: !!o.TanpaOngkir, pengiriman: o.Pengiriman || 'Kirim', poin: Number(o.PoinDitukar) || 0, poinAsli: o.Status === 'Batal' ? 0 : Number(o.PoinDitukar) || 0, custAsli: o.CustomerID,
      voucher: o.KodeVoucher ? { kode: o.KodeVoucher, potonganTetap: Number(o.PotonganVoucher) || 0 } : null,
      items: itemsOf(o.ID).map(i => ({ id: i.ID, nama: i.Nama, varian: i.Varian, link: i.Link, negara: i.Negara, mataUang: i.MataUang, qty: i.Qty, hargaAsli: i.HargaAsli, hargaJual: Number(i.HargaJual) || 0, kurs: i.Kurs, jasaTipe: i.JasaTipe, jasaNilai: i.JasaNilai, custom: i.Custom, itemId: i.ItemID, _lock: true })) };
  } else {
    F = store.get(draftKey()) || null;
    if (p.customerId) F = null;
    if (!F || F.edit) F = { id: uid(), edit: false, customerId: p.customerId || '', alamat: '', tripId: (tripsAktif()[0] || {}).ID || '', status: 'Baru', kurir: ((sett().couriers || [])[0] || {}).nama || '', ongkir: ((sett().couriers || [])[0] || {}).harga || 0, diskon: 0, catatan: '', items: [blankItem()], bayar: { jumlah: '', walletId: '', metode: 'Transfer' },
      tanpaJasa: false, tanpaOngkir: false, pengiriman: 'Kirim', voucher: null, poin: 0 };
    if (p.customerId) { const c = custById(p.customerId); if (c) F.alamat = c.Alamat; }
  }
  S.ui.form = F;
  // Spesifikasi voucher pesanan lama diambil ulang agar potongan ikut berubah bila total berubah
  if (F.voucher && !F.voucher.tipe) api('voucher.cek', { kode: F.voucher.kode, orderId: F.id }, { silent: true }).then(r => { if (r.success && S.ui.form === F && F.voucher) { F.voucher = r.data; renderFormPotongan(); renderFormSummary(); } });
  const trips = S.d.allTrips.length ? S.d.allTrips : (S.boot.trips || []);
  el.innerHTML = `<div class="page-head"><div><button class="link-btn small" data-go="a-pesanan"><i class="bi bi-arrow-left"></i> Kembali ke daftar pesanan</button><h1>${F.edit ? 'Ubah Pesanan ' + esc(F.noOrder) : 'Form Input Pesanan Jastip'}</h1><p>Konversi kurs otomatis ke IDR, biaya jasa titip fleksibel, dan estimasi margin langsung terlihat.</p></div>
    <div class="actions"><span class="pill ${F.edit ? 'st-dibeli' : 'st-baru'}">${F.edit ? 'Mode ubah' : 'Draft baru'}</span></div></div>
  <div class="cardx mb-4"><div class="cardx-head"><h3><span class="sec-num">SEC_01</span>Data Profil Customer</h3>${can('customer.tulis') ? '<button class="btn btn-sm btn-soft" data-act="formCustBaru"><i class="bi bi-person-plus"></i>Customer baru</button>' : ''}</div>
    <div class="cardx-body"><div class="row g-4"><div class="col-lg-5">
      <label class="form-label" for="fCustQ">Cari customer</label>
      <div class="position-relative"><div class="input-icon"><i class="bi bi-search"></i><input class="form-control" id="fCustQ" placeholder="Nama, WhatsApp, atau kode customer" autocomplete="off"></div><div class="tb-results" id="fCustRes"></div></div>
      <div id="fCustBaru" class="mt-3"></div>
      <div class="row g-3 mt-1"><div class="col-sm-6"><label class="form-label">Trip</label><select class="form-select" id="fTrip"><option value="">Tanpa trip</option>${trips.map(t => `<option value="${t.ID}" ${F.tripId === t.ID ? 'selected' : ''}>${esc(t.Kota)} (${tglPendek(t.TglMulai)})</option>`).join('')}</select></div>
        ${F.edit ? `<div class="col-sm-6"><label class="form-label">Status pesanan</label><select class="form-select" id="fStatus">${['Baru', 'Dibeli', 'Dikirim', 'Selesai', 'Batal'].map(s => `<option ${F.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>` : ''}</div>
    </div><div class="col-lg-7" id="fCustPanel"></div></div></div></div>

  <div class="cardx mb-4"><div class="cardx-head"><h3><span class="sec-num">SEC_02</span>Rincian Item Barang</h3><div class="d-flex gap-2 flex-wrap">${['JPY', 'SGD', 'MYR', 'THB'].map(m => `<span class="tag">1 ${m} = ${fmtKurs(kursOf(m))}</span>`).join('')}</div></div>
    <div class="cardx-body"><div class="tbl-wrap"><table class="tbl items-tbl" style="min-width:1080px"><thead><tr><th style="width:30px">No</th><th style="min-width:220px">Nama barang & spesifikasi</th><th style="width:120px">Negara</th><th style="width:76px">Qty</th><th style="width:120px">Harga asli</th><th style="width:110px">Kurs</th><th class="r" style="width:120px">Harga beli IDR</th><th style="width:210px">Jasa titip</th><th class="r" style="width:120px">Subtotal</th><th style="width:44px"></th></tr></thead><tbody id="fItems"></tbody></table></div>
      <div class="d-flex gap-2 mt-3 flex-wrap"><button class="btn btn-soft" data-act="formAddItem"><i class="bi bi-plus-square"></i>Tambah item</button><button class="btn btn-light" data-act="formFromKatalog"><i class="bi bi-grid"></i>Impor dari katalog</button><span class="ms-auto small muted align-self-center">Rumus: (qty × harga × kurs) + jasa = subtotal</span></div></div></div>

  <div class="cardx mb-2"><div class="cardx-head"><h3><span class="sec-num">SEC_03</span>Ringkasan Finansial & Estimasi Laba</h3><span class="small muted">Dihitung langsung</span></div><div class="cardx-body p-0"><div class="sum3" id="fSum"></div></div></div>
  <div class="cardx pad mb-2"><label class="form-label" for="fCatatan">Catatan pesanan</label><textarea class="form-control" id="fCatatan" rows="2" maxlength="500" placeholder="Instruksi khusus untuk shopper / pengemasan">${esc(F.catatan || '')}</textarea></div>

  <div class="sticky-bar"><button class="btn btn-light" data-go="a-pesanan"><i class="bi bi-x-lg"></i>Batal</button>${F.edit ? '' : '<button class="btn btn-light" data-act="formReset"><i class="bi bi-arrow-counterclockwise"></i>Reset</button>'}
    <span class="small muted" id="fAutosave">${F.edit ? '' : 'Draft tersimpan otomatis di perangkat ini'}</span>
    <span class="ms-auto d-flex gap-2 flex-wrap"><button class="btn btn-outline-primary" data-act="formSave"><i class="bi bi-save"></i>Simpan Pesanan</button>${can('invoice') ? '<button class="btn btn-primary" data-act="formSave" data-inv="1"><i class="bi bi-file-earmark-check"></i>Simpan & Terbitkan Invoice</button>' : ''}</span></div>`;
  el.dataset.ready = '1';
  renderFormItems(); renderFormCustomerPanel(); renderFormSummary();
  const q = $('#fCustQ');
  q.addEventListener('input', debounce(() => formCustSearch(q.value), 120));
  q.addEventListener('focus', () => formCustSearch(q.value));
  document.addEventListener('click', e => { if (!e.target.closest('#fCustRes, #fCustQ')) $('#fCustRes')?.classList.remove('open'); });
  $('#fTrip').onchange = e => { F.tripId = e.target.value; formAutosave(); };
  if ($('#fStatus')) $('#fStatus').onchange = e => { F.status = e.target.value; };
  $('#fCatatan').oninput = e => { F.catatan = e.target.value; formAutosave(); };
  $('#fItems').addEventListener('input', onItemInput);
  $('#fItems').addEventListener('change', onItemInput);
}
const formAutosave = debounce(() => { const F = S.ui.form; if (F && !F.edit) { store.set(draftKey(), F); const a = $('#fAutosave'); if (a) a.textContent = 'Draft tersimpan ' + jam(new Date()); } }, 500);
function formAutosaveFlush() { const F = S.ui.form; if (F && !F.edit && (F.items.some(i => i.nama) || F.customerId)) store.set(draftKey(), F); }
function formCustSearch(qv) {
  const q = qv.trim().toLowerCase();
  const box = $('#fCustRes');
  const list = S.d.customers.filter(c => !q || (c.Nama + ' ' + c.HP + ' ' + c.Kode).toLowerCase().includes(q)).slice(0, 8);
  box.innerHTML = list.map(c => `<button class="res" data-act="formPickCust" data-id="${c.ID}">${avatar(c.Nama, 'sm')}<span><b>${esc(c.Nama)}</b> ${c.Tier === 'VIP' ? '<span class="pill st-vip sm nodot">VIP</span>' : ''}<small>${esc(fmtHP(c.HP))} · ${esc(c.Kode || '')}</small></span></button>`).join('') || `<div class="p-3 muted small">Tidak ditemukan.${can('customer.tulis') ? ' <button class="link-btn" data-act="formCustBaru">Buat customer baru</button>' : ''}</div>`;
  box.classList.add('open');
}
ACT.formPickCust = b => { const F = S.ui.form; const c = custById(b.dataset.id); F.customerId = c.ID; F.customerBaru = null; F.alamat = c.Alamat; if (c.KurirFavorit) { const k = (sett().couriers || []).find(x => x.nama === c.KurirFavorit); if (k) { F.kurir = k.nama; F.ongkir = k.harga; } } $('#fCustRes').classList.remove('open'); $('#fCustQ').value = ''; $('#fCustBaru').innerHTML = ''; F.poin = F.edit && F.custAsli === c.ID ? F.poinAsli || 0 : 0; renderFormCustomerPanel(); renderFormPotongan(); renderFormSummary(); formAutosave(); };
ACT.formCustBaru = () => {
  const F = S.ui.form;
  F.customerId = ''; F.customerBaru = F.customerBaru || { nama: '', hp: '', alamat: '', email: '' };
  $('#fCustRes').classList.remove('open');
  $('#fCustBaru').innerHTML = `<div class="tint p-3"><div class="small-caps mb-2">Customer baru</div><div class="row g-2">
    <div class="col-sm-6"><input class="form-control form-control-sm" data-cb="nama" placeholder="Nama lengkap *" value="${esc(F.customerBaru.nama)}"></div>
    <div class="col-sm-6"><input class="form-control form-control-sm" data-cb="hp" placeholder="WhatsApp *" inputmode="tel" value="${esc(F.customerBaru.hp)}"></div>
    <div class="col-12"><input class="form-control form-control-sm" data-cb="alamat" placeholder="Alamat pengiriman" value="${esc(F.customerBaru.alamat)}"></div>
    <div class="col-12"><input class="form-control form-control-sm" data-cb="email" placeholder="Email (opsional)" value="${esc(F.customerBaru.email)}"></div></div></div>`;
  $$('[data-cb]').forEach(i => i.oninput = () => { F.customerBaru[i.dataset.cb] = i.value; if (i.dataset.cb === 'alamat') F.alamat = i.value; renderFormCustomerPanel(); formAutosave(); });
  F.poin = 0;
  renderFormCustomerPanel(); renderFormPotongan(); renderFormSummary();
  $('[data-cb=nama]').focus();
};
function renderFormCustomerPanel() {
  const F = S.ui.form; if (!F) return;
  const c = F.customerId ? custById(F.customerId) : null;
  const cb = F.customerBaru;
  const box = $('#fCustPanel'); if (!box) return;
  if (!c && !(cb && cb.nama)) { box.innerHTML = `<div class="tint h-100 d-grid place-items-center p-4 text-center muted" style="place-items:center"><div><i class="bi bi-person-bounding-box fs-1"></i><p class="mb-0 mt-2">Pilih customer dari database atau buat customer baru.</p></div></div>`; return; }
  const nama = c ? c.Nama : cb.nama, hp = c ? c.HP : cb.hp;
  box.innerHTML = `<div class="tint p-3"><div class="d-flex justify-content-between align-items-center mb-2"><span class="small-caps">Parameter customer terpilih</span>${c ? '<span class="pill st-selesai sm">Terverifikasi</span>' : '<span class="pill st-baru sm">Baru</span>'}</div>
    <div class="row g-2"><div class="col-sm-6"><div class="cardx p-2 px-3"><div class="small muted">Nama penerima</div><b>${esc(nama)}</b></div></div><div class="col-sm-6"><div class="cardx p-2 px-3"><div class="small muted">WhatsApp</div><b>${esc(fmtHP(hp))}</b></div></div>
      <div class="col-12"><label class="small muted mt-1" for="fAlamat">Alamat pengiriman pesanan ini</label><textarea class="form-control form-control-sm" id="fAlamat" rows="2">${esc(F.alamat || '')}</textarea></div>
      ${c && c.Catatan ? `<div class="col-12"><div class="note-gold small"><b><i class="bi bi-sticky"></i> Catatan customer</b><br>${esc(c.Catatan)}</div></div>` : ''}</div></div>`;
  $('#fAlamat').oninput = e => { F.alamat = e.target.value; formAutosave(); };
}
function renderFormItems() {
  const F = S.ui.form;
  const rows = F.items.map((it, i) => {
    const h = hitungItem(Object.assign({}, it, { hargaAsli: angkaHarga(it.hargaAsli, it.mataUang), jasaNilai: angkaJasa(it.jasaNilai, it.jasaTipe), kurs: Number(it.kurs) }));
    const a = aturanJasa(it.negara);
    return `<tr data-i="${i}"><td class="pt-3 muted">${String(i + 1).padStart(2, '0')}</td>
      <td><input class="form-control" data-f="nama" value="${esc(it.nama)}" placeholder="Nama barang" aria-label="Nama barang ${i + 1}"><input class="form-control form-control-sm mt-1" data-f="varian" value="${esc(it.varian || '')}" placeholder="Varian / ukuran / link" aria-label="Varian"></td>
      <td><select class="form-select" data-f="negara" aria-label="Negara">${countries().map(c => `<option value="${c.kode}" ${it.negara === c.kode ? 'selected' : ''}>${c.kode} · ${c.mataUang}</option>`).join('')}</select></td>
      <td><input class="form-control" data-f="qty" type="number" min="1" value="${esc(it.qty)}" aria-label="Qty"></td>
      <td><input class="form-control" data-f="hargaAsli" inputmode="decimal" data-uang="mu" data-mu-dari="[data-f=negara]" value="${esc(it.hargaAsli)}" placeholder="0" aria-label="Harga asli"><small class="muted">${h.mataUang}</small></td>
      <td>${h.mataUang === 'IDR' ? '<span class="calc-cell">1<small>IDR</small></span>' : `<input class="form-control" data-f="kurs" inputmode="decimal" value="${esc(it.kurs)}" aria-label="Kurs"><small class="muted">${it._lock ? 'terkunci' : ((kurs().manual || {})[h.mataUang] ? 'manual' : 'live')}</small>`}</td>
      <td class="r"><span class="calc-cell">${rp(h.hargaIDR * h.qty)}<small>${h.qty} × ${rpShort(h.hargaIDR)}${h.hargaJualSet ? ' · jual ' + rpShort(h.hargaJual) : ''}</small></span></td>
      <td><div class="d-flex gap-1"><select class="form-select form-select-sm" data-f="jasaTipe" style="max-width:100px" aria-label="Metode jasa"><option value="">Aturan</option><option value="persen" ${it.jasaTipe === 'persen' ? 'selected' : ''}>%</option><option value="nominal" ${it.jasaTipe === 'nominal' ? 'selected' : ''}>Rp/pcs</option><option value="flat" ${it.jasaTipe === 'flat' ? 'selected' : ''}>Flat</option></select>
        <input class="form-control form-control-sm" data-f="jasaNilai" inputmode="decimal" data-uang="jasa-item" value="${esc(it.jasaNilai)}" placeholder="${it.jasaTipe ? 'nilai' : (a.tipe === 'persen' ? a.nilai + '%' : rpShort(a.nilai))}" ${it.jasaTipe ? '' : 'disabled'} aria-label="Nilai jasa"></div>
        <small class="muted d-block mt-1">${F.tanpaJasa ? 'jasa tidak dikenakan' : rp(h.jasaIDR) + ' · ' + (it.jasaTipe ? 'manual' : 'aturan ' + negara(it.negara).nama)}</small></td>
      <td class="r"><span class="calc-cell" style="color:var(--primary-ink)">${rp(F.tanpaJasa ? h.hargaJual * h.qty : h.subtotal)}</span></td>
      <td><button class="icon-btn sm" data-act="formDelItem" data-i="${i}" aria-label="Hapus baris"><i class="bi bi-trash3"></i></button></td></tr>`;
  });
  $('#fItems').innerHTML = rows.join('');
}
function onItemInput(e) {
  const t = e.target; const tr = t.closest('tr[data-i]'); if (!tr || !t.dataset.f) return;
  const F = S.ui.form; const it = F.items[Number(tr.dataset.i)];
  const f = t.dataset.f;
  if (e.type === 'change' && !['negara', 'jasaTipe'].includes(f)) return; // sudah ditangani event input
  it[f] = t.value;
  if (f === 'negara') { it.mataUang = muOf(it.negara); it.kurs = kursOf(it.mataUang); it._lock = false; }
  if (f === 'kurs') it._lock = false;
  if (f === 'jasaTipe' && !t.value) it.jasaNilai = '';
  if (f === 'varian' && /^https?:\/\//.test(t.value)) { it.link = t.value; }
  // Render ulang baris saja bila struktur berubah; selain itu perbarui angka
  if (e.type === 'change' && ['negara', 'jasaTipe'].includes(f)) { renderFormItems(); }
  else {
    const h = hitungItem(Object.assign({}, it, { hargaAsli: angkaHarga(it.hargaAsli, it.mataUang), jasaNilai: angkaJasa(it.jasaNilai, it.jasaTipe), kurs: Number(String(it.kurs).replace(',', '.')) }));
    const cells = tr.querySelectorAll('.calc-cell');
    cells[cells.length - 2].innerHTML = `${rp(h.hargaIDR * h.qty)}<small>${h.qty} × ${rpShort(h.hargaIDR)}${h.hargaJualSet ? ' · jual ' + rpShort(h.hargaJual) : ''}</small>`;
    cells[cells.length - 1].textContent = rp(F.tanpaJasa ? h.hargaJual * h.qty : h.subtotal);
    const sm = tr.querySelector('[data-f=jasaNilai]').parentElement.nextElementSibling; if (sm) sm.textContent = F.tanpaJasa ? 'jasa tidak dikenakan' : `${rp(h.jasaIDR)} · ${it.jasaTipe ? 'manual' : 'aturan ' + negara(it.negara).nama}`;
  }
  renderFormSummary(); formAutosave();
}
ACT.formAddItem = () => { const F = S.ui.form; const last = F.items[F.items.length - 1]; F.items.push(blankItem(last ? last.negara : undefined)); renderFormItems(); renderFormSummary(); $$('#fItems [data-f=nama]').pop().focus(); };
ACT.formDelItem = b => { const F = S.ui.form; F.items.splice(Number(b.dataset.i), 1); if (!F.items.length) F.items.push(blankItem()); renderFormItems(); renderFormSummary(); formAutosave(); };
ACT.formReset = async () => { if (!(await confirmDlg({ title: 'Kosongkan form?', text: 'Draft yang belum disimpan akan hilang.', ok: 'Kosongkan', danger: true, icon: 'bi-arrow-counterclockwise' }))) return; store.del(draftKey()); delete $('#v-a-form').dataset.ready; aForm($('#v-a-form'), {}, false); };
ACT.formFromKatalog = () => {
  const items = S.boot.items || [];
  modal({ title: 'Impor dari katalog', size: 'lg', body: `<div class="input-icon mb-3"><i class="bi bi-search"></i><input class="form-control" id="impQ" placeholder="Cari barang…"></div><div id="impList" style="max-height:55vh;overflow:auto"></div>`,
    foot: '<button class="btn btn-light" data-bs-dismiss="modal">Tutup</button>' });
  // v1.3.5: barang bervarian tampil per varian (harga varian ikut)
  const baris = (i, v) => { const hv = hargaVarian(i, v); return `<div class="d-flex align-items-center gap-3 py-2" style="border-bottom:1px solid var(--row-line)">${prodImg(i, 'cart-thumb')}<div class="flex-fill min-w-0"><b>${esc(i.Nama)}</b>${v ? `<span class="tag ms-1">${esc(labelVarian(v))}</span>` : ''}<div class="small muted">${negaraTag(i.Negara)} ${fmtAsli(i.MataUang, hv.hargaAsli)} ≈ ${rp(Math.round(hv.hargaAsli * kursOf(i.MataUang)))}${hv.hargaJual ? ' · jual ' + rp(hv.hargaJual) : ''}</div></div><button class="btn btn-sm btn-soft" data-act="impPick" data-id="${i.ID}" data-varian="${v ? v.id : ''}"><i class="bi bi-plus"></i>Tambah</button></div>`; };
  const draw = q => { $('#impList').innerHTML = items.filter(i => !q || i.Nama.toLowerCase().includes(q.toLowerCase())).map(i => { const vs = varianOf(i); return vs.length ? vs.map(v => baris(i, v)).join('') : baris(i, null); }).join('') || emptyState('bi-search', 'Tidak ada barang', ''); };
  draw('');
  $('#impQ').oninput = e => draw(e.target.value);
};
ACT.impPick = b => {
  const i = (S.boot.items || []).find(x => x.ID === b.dataset.id);
  const F = S.ui.form;
  const blank = F.items.findIndex(x => !x.nama);
  const v = b.dataset.varian ? varianOf(i).find(x => x.id === b.dataset.varian) : null, hv = hargaVarian(i, v), ji = jasaItemOf(i.JasaItem);
  const row = { id: uid(), nama: i.Nama, varian: v ? labelVarian(v) : '', varianId: v ? v.id : '', link: '', negara: i.Negara, mataUang: i.MataUang, qty: 1, hargaAsli: hv.hargaAsli, hargaJual: hv.hargaJual, kurs: kursOf(i.MataUang), jasaTipe: ji !== null ? 'nominal' : '', jasaNilai: ji !== null ? ji : '', custom: false, itemId: i.ID };
  if (blank > -1) F.items[blank] = row; else F.items.push(row);
  renderFormItems(); renderFormSummary(); formAutosave();
  b.outerHTML = '<span class="pill st-selesai">Ditambahkan</span>';
};
function formCalc() {
  const F = S.ui.form;
  const items = F.items.filter(i => i.nama || angkaHarga(i.hargaAsli, i.mataUang)).map(i => hitungItem(Object.assign({}, i, { hargaAsli: angkaHarga(i.hargaAsli, i.mataUang), jasaNilai: angkaJasa(i.jasaNilai, i.jasaTipe), kurs: Number(String(i.kurs).replace(',', '.')) })));
  const bayarAwal = F.edit ? 0 : toNum((F.bayar || {}).jumlah);
  // v1.1: saklar jasa/ongkir, pengiriman, voucher, poin (server menghitung ulang semuanya)
  const opt = { tanpaJasa: !!F.tanpaJasa, tanpaOngkir: !!F.tanpaOngkir, pengiriman: F.pengiriman || 'Kirim' };
  const base = totalOrder(items, toNum(F.ongkir), toNum(F.diskon), 0, opt).total;
  const pv = !F.voucher ? 0 : F.voucher.tipe ? potonganVoucher(F.voucher, base) : Math.min(base, F.voucher.potonganTetap || 0);
  const cfg = poinCfg();
  const maksPoin = Math.floor(Math.max(0, base - pv) / cfg.nilai);
  const poin = Math.max(0, Math.min(Math.round(toNum(F.poin)), maksPoin));
  const t = totalOrder(items, toNum(F.ongkir), toNum(F.diskon), (F.dibayar || 0) + bayarAwal, Object.assign({}, opt, { potonganVoucher: pv, potonganPoin: Math.round(poin * cfg.nilai) }));
  return { items, t, base, poin, maksPoin };
}
/** Saldo poin customer terpilih yang bisa dipakai pesanan ini (termasuk poin yang sudah dipakai pesanan ini sebelumnya). */
function poinTersediaForm() {
  const F = S.ui.form; const c = F && custById(F.customerId);
  if (!c) return 0;
  return Math.max(0, Number(c.Poin) || 0) + (F.edit && F.custAsli === F.customerId ? F.poinAsli || 0 : 0);
}
/** Kotak voucher & poin di ringkasan (dibangun ulang hanya saat strukturnya berubah). */
function renderFormPotongan() {
  const F = S.ui.form; const vb = $('#fVoucherBox'), pb = $('#fPoinBox'); if (!F || !vb || !pb) return;
  vb.innerHTML = F.voucher
    ? `<div class="voucher-on mt-2"><i class="bi bi-ticket-perforated"></i><div class="min-w-0"><b class="mono">${esc(F.voucher.kode)}</b><div class="small muted">${F.voucher.tipe ? esc(labelVoucher(F.voucher)) : 'Voucher pesanan ini'} · <b id="fsVoucher" style="color:var(--mint-ink)"></b></div></div><button type="button" class="link-btn small text-danger ms-auto" data-act="formVoucherDel">Hapus</button></div>`
    : `<div class="d-flex gap-2 mt-2"><input class="form-control form-control-sm mono" id="fKode" placeholder="Kode voucher" maxlength="24" autocomplete="off" style="text-transform:uppercase" aria-label="Kode voucher"><button type="button" class="btn btn-sm btn-soft nowrap" data-act="formVoucher">Pakai</button></div>`;
  const cfg = poinCfg(); const c = custById(F.customerId);
  if (!c || (!cfg.aktif && !F.poinAsli)) { pb.innerHTML = ''; return; }
  const ada = poinTersediaForm();
  const boleh = ada > 0 && (ada >= cfg.min || (F.poinAsli && Number(F.poin) === F.poinAsli));
  pb.innerHTML = `<div class="poin-box mt-2 small"><div class="d-flex justify-content-between gap-2"><b><i class="bi bi-stars me-1"></i>Poin ${esc(c.Nama.split(' ')[0])}: ${num(ada)}</b>${boleh ? '<button type="button" class="link-btn small" data-act="formPoinMaks">Pakai maks.</button>' : ''}</div>
    ${boleh ? `<div class="d-flex gap-2 align-items-center mt-1"><input class="form-control form-control-sm text-end" id="fPoin" inputmode="numeric" value="${num(F.poin || 0)}" aria-label="Poin ditukar"><span class="nowrap" id="fPoinInfo"></span></div>` : `<div class="muted mt-1">Bisa ditukar setelah ${esc(fmtPoin(cfg.min))}.</div>`}</div>`;
  if ($('#fPoin')) $('#fPoin').addEventListener('change', e => { F.poin = toNum(e.target.value); renderFormSummary(); formAutosave(); });
  if ($('#fKode')) $('#fKode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ACT.formVoucher($('[data-act=formVoucher]')); } });
}
ACT.formKirim = b => {
  const F = S.ui.form; F.pengiriman = b.dataset.v;
  $$('[data-act=formKirim]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
  $('#fKirimBox').style.display = F.pengiriman === 'Pickup' ? 'none' : ''; $('#fPickupNote').style.display = F.pengiriman === 'Pickup' ? '' : 'none';
  renderFormSummary(); formAutosave();
};
ACT.formVoucher = async b => {
  const F = S.ui.form; const kode = ($('#fKode') || {}).value || '';
  if (!kode.trim()) { $('#fKode')?.focus(); return toast('Ketik kode voucher dulu.', 'warning'); }
  setBusy(b, true, 'Cek…');
  const r = await api('voucher.cek', { kode, base: formCalc().base, orderId: F.edit ? F.id : undefined });
  setBusy(b, false);
  if (!r.success) { $('#fKode')?.classList.add('is-invalid'); return toast(r.message, 'error', 'Voucher tidak bisa dipakai'); }
  F.voucher = r.data; renderFormPotongan(); renderFormSummary(); formAutosave();
  toast('Voucher ' + r.data.kode + ' dipasang.', 'success');
};
ACT.formVoucherDel = () => { const F = S.ui.form; F.voucher = null; renderFormPotongan(); renderFormSummary(); formAutosave(); };
ACT.formPoinMaks = () => { const F = S.ui.form; const { maksPoin } = formCalc(); F.poin = Math.min(poinTersediaForm(), maksPoin); const i = $('#fPoin'); if (i) i.value = num(F.poin); renderFormSummary(); formAutosave(); };
function renderFormSummary() {
  const F = S.ui.form; const box = $('#fSum'); if (!F || !box) return;
  const cs = sett().couriers || [];
  if (!box.dataset.built) {
    // Kerangka dibuat sekali; selanjutnya hanya angka yang diperbarui (input & tombol tidak pernah diganti saat diklik)
    const ws = S.d.wallets.filter(w => w.Aktif !== false);
    box.innerHTML = `<div><div class="small-caps mb-2">[A] Modal pokok pembelian</div>
        <div class="fin-row"><span>Total modal beli (<span id="fsSku">0</span> SKU)</span><b id="fsModal">-</b></div>
        <div class="fin-row"><span>Diskon untuk customer</span><input class="form-control form-control-sm text-end" style="max-width:130px" id="fDiskon" inputmode="numeric" data-uang value="${num(F.diskon || 0)}" aria-label="Diskon"></div>
        <div id="fVoucherBox"></div><div id="fPoinBox"></div>
        <div class="fin-total"><span class="small-caps">Pengeluaran modal</span><b style="color:var(--text);font-size:20px" id="fsModal2">-</b></div></div>
      <div><div class="small-caps mb-2">[B] Pendapatan & biaya tambahan</div>
        <div class="fin-row"><span>Total biaya jastip (fee)</span><b style="color:var(--mint-ink)" id="fsJasa">-</b></div>
        <label class="form-check form-switch small mb-2"><input class="form-check-input" type="checkbox" id="fJasaOn" ${F.tanpaJasa ? '' : 'checked'}> Kenakan jasa titip</label>
        <div class="small muted mb-1">Pengiriman</div>
        <div class="seg-x mb-2" role="radiogroup" aria-label="Metode pengiriman"><button type="button" class="${F.pengiriman === 'Pickup' ? '' : 'on'}" data-act="formKirim" data-v="Kirim" role="radio" aria-checked="${F.pengiriman !== 'Pickup'}"><i class="bi bi-truck"></i>Dikirim</button><button type="button" class="${F.pengiriman === 'Pickup' ? 'on' : ''}" data-act="formKirim" data-v="Pickup" role="radio" aria-checked="${F.pengiriman === 'Pickup'}"><i class="bi bi-shop"></i>Pick up</button></div>
        <div id="fKirimBox" style="${F.pengiriman === 'Pickup' ? 'display:none' : ''}">
        <label class="small muted" for="fKurir">Kurir domestik</label>
        <div class="d-flex gap-2"><select class="form-select form-select-sm" id="fKurir"><option value="">Tanpa kurir</option>${cs.map(c => `<option ${F.kurir === c.nama ? 'selected' : ''} value="${esc(c.nama)}">${esc(c.nama)}</option>`).join('')}</select><input class="form-control form-control-sm text-end" style="max-width:120px" id="fOngkir" inputmode="numeric" data-uang value="${num(F.ongkir || 0)}" aria-label="Ongkir"></div>
        <label class="form-check form-switch small mt-2"><input class="form-check-input" type="checkbox" id="fOngkirOn" ${F.tanpaOngkir ? '' : 'checked'}> Kenakan ongkos kirim ke customer</label></div>
        <div class="small muted mt-2" id="fPickupNote" style="${F.pengiriman === 'Pickup' ? '' : 'display:none'}"><i class="bi bi-shop"></i> Customer mengambil sendiri, tanpa ongkos kirim.</div></div>
      <div><div class="small-caps mb-2">[C] Net invoice & laba</div>
        <div class="big-total mb-2"><span class="small-caps">Total tagihan customer</span><b id="fsTotal">-</b><small class="muted" id="fsTotalSub"></small></div>
        <div class="fin-row"><span>Estimasi keuntungan (margin + jasa titip)</span><b style="color:var(--mint-ink)" id="fsLaba">-</b></div>
        <div class="bar mint mb-2"><span id="fsBar" style="width:0"></span></div><div class="small muted mb-2" id="fsMargin"></div>
        ${F.edit ? `<div class="fin-row"><span>Sudah dibayar</span><b>${rp(F.dibayar)}</b></div><div class="fin-row"><span>Sisa setelah disimpan</span><b style="color:var(--danger)" id="fsSisa">-</b></div>`
          : can('pembayaran') ? `<div class="tint p-2"><label class="small fw-bold" for="fBayarJ">Pembayaran awal / DP (opsional)</label><div class="d-flex gap-2 mt-1"><input class="form-control form-control-sm" id="fBayarJ" inputmode="numeric" data-uang placeholder="Rp 0" value="${esc(F.bayar.jumlah ? num(toNum(F.bayar.jumlah)) : '')}"><button type="button" class="btn btn-sm btn-light nowrap" data-act="formDp50">DP 50%</button><button type="button" class="btn btn-sm btn-light nowrap" data-act="formLunas">Lunas</button></div>
            <select class="form-select form-select-sm mt-2" id="fBayarW" aria-label="Dompet penerima"><option value="">Pilih dompet penerima…</option>${ws.map(w => `<option value="${w.ID}" ${F.bayar.walletId === w.ID ? 'selected' : ''}>${esc(w.Nama)}</option>`).join('')}</select><div class="small mt-1">Status: <span id="fsStatus"></span></div></div>` : ''}
      </div>`;
    box.dataset.built = '1';
    $('#fDiskon').addEventListener('input', e => { F.diskon = toNum(e.target.value); renderFormSummary(); formAutosave(); });
    $('#fOngkir').addEventListener('input', e => { F.ongkir = toNum(e.target.value); renderFormSummary(); formAutosave(); });
    $('#fKurir').onchange = e => { F.kurir = e.target.value; const k = cs.find(c => c.nama === F.kurir); F.ongkir = k ? k.harga : 0; $('#fOngkir').value = num(F.ongkir); renderFormSummary(); formAutosave(); };
    $('#fJasaOn').onchange = e => { F.tanpaJasa = !e.target.checked; renderFormItems(); renderFormSummary(); formAutosave(); };
    $('#fOngkirOn').onchange = e => { F.tanpaOngkir = !e.target.checked; renderFormSummary(); formAutosave(); };
    renderFormPotongan();
    if ($('#fBayarJ')) {
      $('#fBayarJ').addEventListener('input', e => { F.bayar.jumlah = toNum(e.target.value); renderFormSummary(); formAutosave(); });
      $('#fBayarW').onchange = e => { F.bayar.walletId = e.target.value; e.target.classList.remove('is-invalid'); formAutosave(); };
    }
  }
  const { t, poin } = formCalc();
  const potong = t.diskon + t.potonganVoucher + t.potonganPoin;
  const untung = t.margin + t.jasa - potong; // v1.3.3: margin harga jual + jasa titip − potongan
  const margin = t.total ? untung / t.total * 100 : 0;
  const set = (id, v) => { const x = document.getElementById(id); if (x) x.innerHTML = v; };
  set('fsSku', F.items.filter(i => i.nama).length);
  set('fsModal', rp(t.modal)); set('fsModal2', rp(t.modal)); set('fsJasa', rp(t.jasa));
  set('fsTotal', rp(t.total)); set('fsTotalSub', `${t.margin ? 'Barang' : 'Modal'} ${rpShort(t.subtotal)} + jastip ${rpShort(t.jasa)} + ${S.ui.form.pengiriman === 'Pickup' ? 'pick up' : 'ongkir ' + rpShort(t.ongkir)}${t.diskon ? ' − diskon ' + rpShort(t.diskon) : ''}${t.potonganVoucher ? ' − voucher ' + rpShort(t.potonganVoucher) : ''}${t.potonganPoin ? ' − poin ' + rpShort(t.potonganPoin) : ''}`);
  set('fsVoucher', '− ' + rp(t.potonganVoucher));
  set('fPoinInfo', poin ? '= − ' + rp(t.potonganPoin) : 'poin');
  set('fsLaba', rp(untung)); set('fsMargin', `${t.margin ? `Margin barang ${rp(t.margin)} + jasa ${rp(t.jasa)}${potong ? ' − potongan ' + rp(potong) : ''} · ` : ''}${num(margin, 1)}% dari total tagihan`); set('fsSisa', rp(t.sisa));
  set('fsStatus', statusBayarPill({ StatusBayar: t.statusBayar }));
  const bar = $('#fsBar'); if (bar) bar.style.width = Math.min(100, margin * 3) + '%';
}
ACT.formDp50 = () => { const F = S.ui.form; F.bayar.jumlah = Math.round(formCalc().t.total / 2); $('#fBayarJ').value = num(F.bayar.jumlah); renderFormSummary(); formAutosave(); };
ACT.formLunas = () => { const F = S.ui.form; F.bayar.jumlah = formCalc().t.total; $('#fBayarJ').value = num(F.bayar.jumlah); renderFormSummary(); formAutosave(); };
ACT.formSave = async b => {
  const F = S.ui.form;
  const items = F.items.filter(i => i.nama || angkaHarga(i.hargaAsli, i.mataUang));
  if (!F.customerId && !(F.customerBaru && F.customerBaru.nama)) { $('#fCustQ').focus(); return toast('Pilih customer atau isi customer baru.', 'warning'); }
  if (F.customerBaru && !F.customerId) {
    if (F.customerBaru.nama.trim().length < 3) return toast('Nama customer baru minimal 3 huruf.', 'warning');
    if (!/^62\d{8,13}$/.test(normHP(F.customerBaru.hp))) return toast('Nomor WhatsApp customer baru tidak valid.', 'warning');
  }
  if (!items.length) return toast('Tambahkan minimal satu barang.', 'warning');
  const bad = items.findIndex(i => !i.nama || angkaHarga(i.hargaAsli, i.mataUang) <= 0);
  if (bad > -1) { toast(`Lengkapi nama & harga barang baris ${bad + 1}.`, 'warning'); return $$('#fItems tr')[F.items.indexOf(items[bad])]?.querySelector('[data-f=nama]')?.focus(); }
  const bayar = !F.edit && F.bayar && toNum(F.bayar.jumlah) > 0 ? { jumlah: toNum(F.bayar.jumlah), walletId: F.bayar.walletId, metode: F.bayar.metode || 'Transfer' } : null;
  if (bayar && !bayar.walletId) { $('#fBayarW')?.classList.add('is-invalid'); $('#fBayarW')?.focus(); return toast('Pilih dompet penerima pembayaran awal.', 'warning'); }
  const inv = !!b.dataset.inv;
  const payload = {
    id: F.id, customerId: F.customerId, customerBaru: F.customerId ? null : F.customerBaru, alamat: F.alamat, tripId: F.tripId, status: F.status,
    kurir: F.pengiriman === 'Pickup' ? '' : F.kurir, ongkir: toNum(F.ongkir), diskon: toNum(F.diskon), catatan: F.catatan, bayarAwal: bayar, terbitkanInvoice: inv, kirimVia: ['wa', 'email'],
    tanpaJasa: !!F.tanpaJasa, tanpaOngkir: !!F.tanpaOngkir, pengiriman: F.pengiriman === 'Pickup' ? 'Pickup' : 'Kirim', kodeVoucher: F.voucher ? F.voucher.kode : '', poinDitukar: formCalc().poin,
    items: items.map(i => ({ id: i.id, itemId: i.itemId, varianId: i.varianId || '', nama: i.nama, varian: /^https?:/.test(i.varian || '') ? '' : i.varian, link: i.link, negara: i.negara, mataUang: i.mataUang, qty: Number(i.qty) || 1, hargaAsli: angkaHarga(i.hargaAsli, i.mataUang), kurs: Number(String(i.kurs).replace(',', '.')) || 0, jasaTipe: i.jasaTipe, jasaNilai: angkaJasa(i.jasaNilai, i.jasaTipe), custom: !!i.custom }))
  };
  const { t } = formCalc();
  const c = custById(F.customerId);
  await mutate('order.simpan', payload, {
    btn: b, busyLabel: inv ? 'Menyimpan & membuat PDF…' : 'Menyimpan…', rerenderView: false,
    optimistic: () => {
      const u = upsertLocal('orders', { ID: F.id, NoOrder: F.noOrder || 'Memproses…', Tanggal: F.edit ? (orderById(F.id) || {}).Tanggal : new Date().toISOString(), CustomerID: F.customerId, CustomerNama: c ? c.Nama : F.customerBaru.nama, CustomerHP: c ? c.HP : normHP(F.customerBaru.hp), Status: F.status, Total: t.total, Dibayar: t.dibayar, Sisa: t.sisa, StatusBayar: t.statusBayar, JasaTitip: t.jasa, Subtotal: t.subtotal, Ongkir: t.ongkir, Negara: (items[0] || {}).negara,
        Pengiriman: payload.pengiriman, TanpaJasa: payload.tanpaJasa, TanpaOngkir: payload.tanpaOngkir, KodeVoucher: payload.kodeVoucher, PotonganVoucher: t.potonganVoucher, PoinDitukar: payload.poinDitukar, PotonganPoin: t.potonganPoin, _pending: true });
      formAutosaveFlush();
      setTimeout(() => go('a-pesanan'), 0); // kembali ke daftar seketika
      return u;
    },
    onOk: res => { if (!F.edit) store.del(draftKey()); if (S.ui.form === F) S.ui.form = null; delete $('#v-a-form').dataset.ready; if (S.route === 'a-pesanan') setTimeout(() => openOrderDrawer(res.data.id), 150); },
    onFail: () => { S.ui.formRestore = F; delete $('#v-a-form').dataset.ready; go('a-form', F.edit ? { id: F.id, restore: 1 } : { restore: 1 }); }
  });
};

// ════════════════════════════════════════════════════════
// BAGIAN 16: PANEL — CUSTOMER CRM
// ════════════════════════════════════════════════════════
ROUTES['a-customer'] = { shell: 'adm', title: 'Customer', r: aCustomer, perm: 'customer.lihat' };
function custStats(c) {
  // v1.3.1: indeks pesanan per customer (dibangun sekali per perubahan data) → tidak memindai ribuan pesanan per customer
  const os = ix('ordByCust', () => { const m = new Map(); S.d.orders.forEach(o => { if (o.Status === 'Batal') return; if (!m.has(o.CustomerID)) m.set(o.CustomerID, []); m.get(o.CustomerID).push(o); }); return m; }).get(c.ID) || [];
  return { n: os.length, ltv: sum(os, 'Total'), sisa: sum(os, 'Sisa'), last: os.map(o => o.Tanggal).sort().pop(), neg: os.reduce((m, o) => { m[o.Negara] = (m[o.Negara] || 0) + o.Total; return m; }, {}) };
}
const otpLabel = c => c.UserID ? (c.Status === 'Aktif' ? ['OTP Verified', 'selesai'] : ['Belum OTP', 'dp']) : ['Dibuat admin', 'batal'];
function aCustomer(el, p, re) {
  const st = S.ui.cust || (S.ui.cust = { q: '', tier: '', otp: '', sort: 'ltv', page: 1, sel: null });
  if (p.id && !re) st.sel = p.id;
  if (re && el.dataset.ready) { renderCustTable(); renderCustProfile(); return; }
  const cs = S.d.customers;
  const week = addDays(ymd(), -7);
  const ltv = sum(S.d.orders.filter(o => o.Status !== 'Batal'), 'Total');
  const piutang = S.d.orders.filter(o => o.Sisa > 0 && o.Status !== 'Batal');
  el.innerHTML = `<div class="cardx pad-lg mb-4"><div class="page-head mb-0"><div><span class="eyebrow">CRM & Loyalitas</span><span class="sync-note">Sinkron ${S.lastSync ? relatif(S.lastSync) : '-'}</span><h1>Data Customer & Loyalitas</h1><p>Direktori pelanggan, status verifikasi OTP, riwayat belanja multi-negara, dan piutang berjalan.</p></div>
    <div class="actions"><button class="btn btn-light" data-act="exportCust"><i class="bi bi-download"></i>Ekspor Excel</button>${can('customer.tulis') ? '<button class="btn btn-primary" data-act="custForm"><i class="bi bi-person-plus"></i>Tambah Customer</button>' : ''}</div></div></div>
  <div class="kpi-grid mb-4">
    ${kpi('bi-people', '', 'Total Pelanggan', num(cs.length) + ' <small class="fs-6 muted fw-semibold">customer</small>', `<span style="color:var(--mint-ink)"><i class="bi bi-graph-up-arrow"></i> +${cs.filter(c => ymd(c.Dibuat) >= week).length} baru minggu ini</span>`)}
    ${kpi('bi-star', 'gold', 'VIP Concierge', cs.filter(c => c.Tier === 'VIP').length + ' <small class="fs-6 muted fw-semibold">member</small>', `${cs.length ? num(cs.filter(c => c.Tier === 'VIP').length / cs.length * 100, 1) : 0}% dari total basis`)}
    ${kpi('bi-bag-heart', 'mint', 'Total LTV Belanja', rp(ltv), `Rata-rata ${rp(ltv / Math.max(1, cs.length))} per customer`)}
    ${kpi('bi-hourglass-split', 'danger', 'Piutang Aktif', rp(sum(piutang, 'Sisa')), `${piutang.length} invoice berjalan`, '', 'danger')}
  </div>
  <div class="row g-4"><div class="col-xl-7">
    <div class="cardx mb-3"><div class="filter-bar flex-column align-items-stretch">
      <div class="d-flex gap-2 flex-wrap"><div class="input-icon grow"><i class="bi bi-search"></i><input class="form-control" id="custQ" placeholder="Cari nama, WhatsApp, domisili…" value="${esc(st.q)}" aria-label="Cari customer"></div>
        <div class="seg">${[['', 'Semua'], ['VIP', 'VIP'], ['Reguler', 'Reguler'], ['Baru', 'Baru'], ['Suspect', 'Suspect']].map(([v, t]) => `<button class="${st.tier === v ? 'on' : ''}" data-act="custTier" data-v="${v}">${t}</button>`).join('')}</div></div>
      <div class="d-flex gap-2 flex-wrap align-items-center"><span class="small-caps">Verifikasi:</span>${[['', 'Semua'], ['ok', 'OTP Terverifikasi'], ['no', 'Belum verifikasi']].map(([v, t]) => `<button class="chip ${st.otp === v ? 'on' : ''}" style="min-height:32px;padding:4px 12px" data-act="custOtp" data-v="${v}">${t}</button>`).join('')}
        <span class="small-caps ms-md-3">Urutkan:</span><select class="form-select form-select-sm" style="max-width:180px" id="custSort">${[['ltv', 'LTV tertinggi'], ['baru', 'Terbaru'], ['nama', 'Nama A–Z'], ['piutang', 'Piutang terbesar']].map(([v, t]) => `<option value="${v}" ${st.sort === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    </div></div>
    <div class="cardx"><div class="cardx-body"><div class="tbl-wrap" id="custTable"></div></div><div class="tbl-foot" id="custFoot"></div></div>
    <div class="cardx mt-4"><div class="cardx-head"><h3><i class="bi bi-globe2 me-2 ink"></i>Distribusi Belanja per Destinasi</h3></div><div class="cardx-body"><div class="row g-3">${(() => { const tot = ltv || 1; return countries().map(c => { const v = sum(S.d.orders.filter(o => o.Negara === c.kode && o.Status !== 'Batal'), 'Total'); return `<div class="col-6 col-md"><div class="tint p-3 h-100"><div class="d-flex justify-content-between small"><b>${flag(c.kode)} ${esc(c.nama)}</b><span class="muted">${num(v / tot * 100)}%</span></div><div class="bar my-2"><span style="width:${v / tot * 100}%"></span></div><b class="small">${rpShort(v)}</b></div></div>`; }).join(''); })()}</div></div></div>
  </div><div class="col-xl-5"><div id="custProfile" style="position:sticky;top:88px"></div></div></div>`;
  el.dataset.ready = '1';
  $('#custQ').addEventListener('input', debounce(e => { st.q = e.target.value; st.page = 1; renderCustTable(); }, 160));
  $('#custSort').onchange = e => { st.sort = e.target.value; renderCustTable(); };
  renderCustTable(); renderCustProfile();
}
ACT.custTier = b => { S.ui.cust.tier = b.dataset.v; S.ui.cust.page = 1; $$('[data-act=custTier]').forEach(x => x.classList.toggle('on', x === b)); renderCustTable(); };
ACT.custOtp = b => { S.ui.cust.otp = b.dataset.v; S.ui.cust.page = 1; $$('[data-act=custOtp]').forEach(x => x.classList.toggle('on', x === b)); renderCustTable(); };
ACT.custPage = b => { S.ui.cust.page = Number(b.dataset.page); renderCustTable(); };
ACT.custSel = b => { S.ui.cust.sel = b.dataset.id; S.ui.cust.tab = 'riwayat'; $$('#custTable tr').forEach(r => r.classList.toggle('sel', r.dataset.id === b.dataset.id)); renderCustProfile(); if (window.innerWidth < 1200) $('#custProfile').scrollIntoView({ behavior: 'smooth' }); };
function custList() {
  const st = S.ui.cust; const q = st.q.toLowerCase();
  const stats = new Map(S.d.customers.map(c => [c.ID, custStats(c)]));
  const list = S.d.customers.filter(c => (!st.tier || c.Tier === st.tier) && (!st.otp || (st.otp === 'ok' ? c.UserID && c.Status === 'Aktif' : !(c.UserID && c.Status === 'Aktif'))) && (!q || (c.Nama + ' ' + c.HP + ' ' + c.Alamat + ' ' + c.Kode + ' ' + (c.Kota || '')).toLowerCase().includes(q)));
  const sorters = { ltv: (a, b) => stats.get(b.ID).ltv - stats.get(a.ID).ltv, baru: (a, b) => String(b.Dibuat).localeCompare(String(a.Dibuat)), nama: (a, b) => a.Nama.localeCompare(b.Nama), piutang: (a, b) => stats.get(b.ID).sisa - stats.get(a.ID).sisa };
  list.sort(sorters[st.sort] || sorters.ltv);
  return { list, stats };
}
function renderCustTable() {
  const st = S.ui.cust; const { list, stats } = custList();
  const per = 12, pages = Math.max(1, Math.ceil(list.length / per)); st.page = Math.min(st.page, pages);
  if (!st.sel && list[0]) st.sel = list[0].ID;
  const rows = list.slice((st.page - 1) * per, st.page * per);
  $('#custTable').innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>Customer</th><th>WhatsApp & OTP</th><th>Domisili</th><th class="r">Pesanan</th></tr></thead><tbody>${rows.map(c => { const s = stats.get(c.ID); const o = otpLabel(c);
    return `<tr class="clickable ${st.sel === c.ID ? 'sel' : ''}" data-act="custSel" data-id="${c.ID}" tabindex="0"><td><div class="person">${avatar(c.Nama)}<div class="min-w-0"><b class="clamp-1">${esc(c.Nama)} ${c.Tier === 'VIP' ? '<i class="bi bi-star-fill" style="color:var(--gold)"></i>' : ''}</b><span class="sub" style="color:${c.Tier === 'Suspect' ? 'var(--danger)' : 'var(--primary-ink)'}">${esc(c.Tier)}${s.sisa ? ' · sisa ' + rpShort(s.sisa) : ''}</span></div></div></td>
      <td><span class="num">${esc(fmtHP(c.HP))}</span><span class="sub" style="color:var(--st-${o[1]})"><i class="bi ${o[1] === 'selesai' ? 'bi-check-circle' : 'bi-dash-circle'}"></i> ${o[0]}</span></td>
      <td style="max-width:200px"><span class="clamp-1">${esc(c.Kota || String(c.Alamat || '').split(',').slice(-2).join(',').trim() || '-')}</span><span class="sub">${esc(c.KurirFavorit || '')}</span></td>
      <td class="r"><b>${s.n}</b> <span class="muted small">trip</span><span class="sub">${rpShort(s.ltv)}</span></td></tr>`; }).join('')}</tbody></table>`
    : emptyState('bi-people', 'Customer tidak ditemukan', 'Ubah filter atau tambah customer baru.');
  $('#custFoot').innerHTML = `<span>Menampilkan ${rows.length ? (st.page - 1) * per + 1 : 0}–${Math.min(list.length, st.page * per)} dari ${list.length} pelanggan</span>${pager(st.page, pages, 'custPage')}`;
}
function renderCustProfile() {
  const st = S.ui.cust; const box = $('#custProfile'); if (!box) return;
  const c = st.sel ? custById(st.sel) : null;
  if (!c) { box.innerHTML = `<div class="cardx">${emptyState('bi-person', 'Pilih customer', 'Klik salah satu customer untuk melihat profil.')}</div>`; return; }
  const s = custStats(c); const o = otpLabel(c);
  const orders = S.d.orders.filter(x => x.CustomerID === c.ID).sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal)));
  const pays = S.d.payments.filter(p => p.CustomerID === c.ID && p.BuktiFileId);
  const tab = st.tab || 'riwayat';
  const negTot = Object.entries(s.neg).sort((a, b) => b[1] - a[1]);
  box.innerHTML = `<div class="cardx pad">
    <div class="profile-hero">${avatar(c.Nama, 'lg')}<div class="min-w-0"><h3 class="clamp-1">${esc(c.Nama)}</h3><div class="d-flex gap-2 align-items-center flex-wrap mt-1">${c.Tier === 'VIP' ? '<span class="pill st-vip sm nodot"><i class="bi bi-star-fill"></i> VIP Gold</span>' : `<span class="pill sm nodot" style="background:rgba(255,255,255,.2);color:#fff">${esc(c.Tier)}</span>`}</div><div class="meta mt-1">ID: ${esc(c.Kode || '-')} · Member sejak ${c.Dibuat ? BULAN[toDate(c.Dibuat).getMonth()] + ' ' + toDate(c.Dibuat).getFullYear() : '-'}</div><div class="chips-w"><span><i class="bi bi-shield-check"></i> ${o[0]}</span>${s.sisa ? `<span>Sisa ${rpShort(s.sisa)}</span>` : '<span>Tanpa piutang</span>'}</div></div></div>
    <div class="act-tiles"><a class="act-tile wa" href="${waLink(c.HP, 'Halo ' + c.Nama + ', ')}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>WhatsApp</a>${can('pesanan.tulis') ? `<button class="act-tile" data-act="custNewOrder" data-id="${c.ID}"><i class="bi bi-cart-plus"></i>Order Baru</button>` : ''}${can('customer.tulis') ? `<button class="act-tile" data-act="custForm" data-id="${c.ID}"><i class="bi bi-award"></i>Ubah Tier</button><button class="act-tile" data-act="custForm" data-id="${c.ID}"><i class="bi bi-pencil-square"></i>Edit</button>` : ''}</div>
    <div class="tint p-3 mb-3"><div class="d-flex justify-content-between mb-2"><span class="small-caps">Informasi pengiriman & preferensi</span></div>
      <div class="row g-2 small"><div class="col-6"><span class="muted d-block">WhatsApp aktif</span><b>${esc(fmtHP(c.HP))}</b></div><div class="col-6"><span class="muted d-block">Kurir langganan</span><b>${esc(c.KurirFavorit || '-')}</b></div>
        <div class="col-6"><span class="muted d-block">Saldo poin</span><b><i class="bi bi-stars" style="color:var(--gold)"></i> ${num(c.Poin || 0)}</b></div>
        <div class="col-12"><span class="muted d-block">Alamat utama pengiriman</span><b>${esc(c.Alamat || '-')}</b></div>
        ${c.Email ? `<div class="col-12"><span class="muted d-block">Email</span><b>${esc(c.Email)}</b></div>` : ''}
        <div class="col-12"><span class="muted d-block mb-1">Negara belanja favorit</span><div class="d-flex gap-2 flex-wrap">${negTot.slice(0, 3).map(([k, v]) => `<span class="tag">${flag(k)} ${esc(negara(k).nama)} <b style="color:var(--primary-ink)">${num(v / Math.max(1, s.ltv) * 100)}%</b></span>`).join('') || '<span class="muted">-</span>'}</div></div></div></div>
    <div class="seg w-100 mb-3"><button class="flex-fill ${tab === 'riwayat' ? 'on' : ''}" data-act="custTab" data-t="riwayat">Riwayat (${orders.length})</button><button class="flex-fill ${tab === 'bukti' ? 'on' : ''}" data-act="custTab" data-t="bukti">Bukti transfer</button><button class="flex-fill ${tab === 'catatan' ? 'on' : ''}" data-act="custTab" data-t="catatan">Catatan</button></div>
    ${tab === 'riwayat' ? (orders.slice(0, 6).map(x => `<div class="tint hist-row clickable" data-act="openOrder" data-id="${x.ID}" role="button" tabindex="0"><span class="kpi-ic hist-ic"><i class="bi ${x.Status === 'Selesai' ? 'bi-bag-check' : 'bi-airplane'}"></i></span><div class="hist-main"><div class="hist-top"><b>#${esc(x.NoOrder)}</b>${statusBayarPill(x)}</div><div class="small muted text-truncate">${flag(x.Negara)} ${esc(itemsOf(x.ID).map(i => i.Nama).join(', '))}</div></div><div class="hist-amt"><b class="num">${rp(x.Total)}</b><div class="small muted">${tglPendek(x.Tanggal)}</div></div></div>`).join('') || '<p class="muted">Belum ada pesanan.</p>')
      : tab === 'bukti' ? (pays.map(p => `<div class="d-flex justify-content-between align-items-center py-2" style="border-bottom:1px solid var(--row-line)"><div><b>${rp(p.Jumlah)}</b><div class="small muted">${esc(p.NoOrder)} · ${tglJam(p.Tanggal)}</div></div><div class="d-flex gap-2 align-items-center">${pill(p.Status)}<button class="icon-btn sm" data-act="previewFile" data-id="${p.BuktiFileId}" data-nama="Bukti ${esc(p.NoOrder)}.jpg" aria-label="Lihat bukti"><i class="bi bi-image"></i></button></div></div>`).join('') || '<p class="muted">Belum ada bukti transfer.</p>')
      : `<div class="note-gold"><b><i class="bi bi-sticky"></i> Catatan khusus</b><br>${esc(c.Catatan || 'Belum ada catatan.')}</div>`}
    ${can('invoice') ? `<button class="btn btn-soft w-100 mt-3" data-act="custInvoices" data-id="${c.ID}"><i class="bi bi-receipt"></i>Buka seluruh faktur & tagihan ${esc(c.Nama.split(' ')[0])}</button>` : ''}
  </div>`;
}
ACT.custTab = b => { S.ui.cust.tab = b.dataset.t; renderCustProfile(); };
ACT.custNewOrder = b => { store.del(draftKey()); delete $('#v-a-form').dataset.ready; go('a-form', { customerId: b.dataset.id }); };
ACT.custInvoices = b => { const c = custById(b.dataset.id); S.ui.inv = Object.assign(S.ui.inv || {}, { q: c.Nama, sel: null, tab: 'terbit', status: '' }); go('a-invoice'); };
ACT.exportCust = () => {
  const { list, stats } = custList();
  exportExcel({ judul: 'Direktori Customer', periode: 'Per ' + tgl(new Date()), nama: 'Customer',
    kolom: [['Kode', 11], ['Nama', 26], ['WhatsApp', 17], ['Email', 24], ['Tier', 10], ['Verifikasi', 15], ['Alamat', 42], ['Pesanan', 10, 'n'], ['LTV', 16, 'rp'], ['Piutang', 16, 'rp']],
    rows: list.map(c => { const s = stats.get(c.ID); return [c.Kode, c.Nama, fmtHP(c.HP), c.Email, c.Tier, otpLabel(c)[0], c.Alamat, s.n, s.ltv, s.sisa]; }) });
};
ACT.custForm = b => {
  const c = b.dataset.id ? custById(b.dataset.id) : {};
  modal({ title: c.ID ? 'Ubah customer' : 'Tambah customer', size: 'lg', body: `<form id="fCust" class="row g-3" novalidate>
    <div class="col-sm-6"><label class="form-label">Nama lengkap <span class="req">*</span></label><input class="form-control" name="nama" value="${esc(c.Nama || '')}"></div>
    <div class="col-sm-6"><label class="form-label">WhatsApp <span class="req">*</span></label><input class="form-control" name="hp" inputmode="tel" value="${esc(c.HP || '')}"></div>
    <div class="col-sm-6"><label class="form-label">Email</label><input class="form-control" name="email" type="email" value="${esc(c.Email || '')}"></div>
    <div class="col-sm-6"><label class="form-label">Tier</label><select class="form-select" name="tier">${['Reguler', 'VIP', 'Baru', 'Suspect'].map(t => `<option ${(c.Tier || 'Reguler') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="col-12"><label class="form-label">Alamat pengiriman</label><textarea class="form-control" name="alamat" rows="2">${esc(c.Alamat || '')}</textarea></div>
    <div class="col-sm-6"><label class="form-label">Kota</label><input class="form-control" name="kota" value="${esc(c.Kota || '')}"></div>
    <div class="col-sm-6"><label class="form-label">Kurir favorit</label><select class="form-select" name="kurirFavorit"><option value="">-</option>${(sett().couriers || []).map(k => `<option ${c.KurirFavorit === k.nama ? 'selected' : ''}>${esc(k.nama)}</option>`).join('')}</select></div>
    <div class="col-12"><label class="form-label">Catatan khusus</label><textarea class="form-control" name="catatan" rows="2" placeholder="Preferensi pengemasan, kebiasaan, dll.">${esc(c.Catatan || '')}</textarea></div></form>`,
    foot: `${c.ID ? '<button class="btn btn-danger-soft me-auto" data-act="custHapus" data-id="' + c.ID + '"><i class="bi bi-trash3"></i>Hapus</button>' : ''}<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnSaveCust"><i class="bi bi-check2"></i>Simpan</button>` });
  $('#btnSaveCust').onclick = async e => {
    const f = $('#fCust'); clearErr(f); const d = formData(f);
    if (d.nama.length < 3) return fieldErr(f, 'nama', 'Nama minimal 3 huruf.');
    if (!/^62\d{8,13}$/.test(normHP(d.hp))) return fieldErr(f, 'hp', 'Nomor WhatsApp tidak valid.');
    const id = c.ID || uid();
    d.id = id;
    await mutate('customer.simpan', d, { btn: e.currentTarget, optimistic: () => upsertLocal('customers', { ID: id, Nama: d.nama, HP: normHP(d.hp), Email: d.email, Tier: d.tier, Alamat: d.alamat, Kota: d.kota, KurirFavorit: d.kurirFavorit, Catatan: d.catatan, Kode: c.Kode || '…', Dibuat: c.Dibuat || new Date().toISOString(), Status: c.Status || 'Aktif', UserID: c.UserID || '' }), onOk: () => { closeModal(); if (S.ui.cust) S.ui.cust.sel = id; } });
  };
};
ACT.custHapus = async b => {
  closeModal();
  if (!(await confirmDlg({ title: 'Hapus customer?', text: 'Hanya customer tanpa riwayat pesanan yang dapat dihapus.', ok: 'Hapus', danger: true }))) return;
  await mutate('customer.hapus', { id: b.dataset.id }, { optimistic: () => removeLocal('customers', b.dataset.id), onOk: () => { S.ui.cust.sel = null; } });
};

// ════════════════════════════════════════════════════════
// BAGIAN 17: PANEL — PEMBELIAN PER NEGARA
// ════════════════════════════════════════════════════════
ROUTES['a-pembelian'] = { shell: 'adm', title: 'Pembelian per Negara', r: aPembelian, perm: 'pembelian.lihat' };
function aPembelian(el, p, re) {
  const st = S.ui.beli || (S.ui.beli = { neg: (tripsAktif()[0] || {}).Negara || 'JP', q: '', bulan: ymd().slice(0, 7), page: 1 });
  const all = S.d.purchases;
  const neg = negara(st.neg);
  const list = all.filter(x => x.Negara === st.neg && (!st.bulan || String(x.Tanggal).slice(0, 7) === st.bulan) && (!st.q || (x.NamaBarang + ' ' + x.Toko).toLowerCase().includes(st.q.toLowerCase()))).sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal)));
  const per = 15, pages = Math.max(1, Math.ceil(list.length / per)); st.page = Math.min(st.page, pages);
  const total = sum(list, 'TotalIDR'), totalAsli = sum(list, x => x.Qty * x.HargaAsli);
  const qFocus = document.activeElement && document.activeElement.id === 'beliQ';
  el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Procurement</span><h1>Pembelian Barang per Negara</h1><p>Catat setiap belanja di toko luar negeri. Harga dicatat dalam mata uang asli dan Rupiah.</p></div>
    <div class="actions"><button class="btn btn-soft" data-act="exportBeli"><i class="bi bi-download"></i>Ekspor</button>${can('pembelian.tulis') ? '<button class="btn btn-primary" data-act="beliForm"><i class="bi bi-plus-lg"></i>Catat Pembelian</button>' : ''}</div></div>
  <div class="tabs-x">${countries().map(c => `<button class="chip ${st.neg === c.kode ? 'on' : ''}" data-act="beliNeg" data-neg="${c.kode}">${flag(c.kode)}${esc(c.nama)}<span class="count">${all.filter(x => x.Negara === c.kode).length}</span></button>`).join('')}</div>
  <div class="kpi-grid mb-4">
    ${kpi('bi-currency-exchange', '', 'Mata uang', `${flag(neg.kode)} ${neg.mataUang}`, neg.mataUang === 'IDR' ? 'Tanpa konversi' : `Kurs berlaku 1 ${neg.mataUang} = ${rp(kursOf(neg.mataUang))}`)}
    ${kpi('bi-bag', 'coral', 'Total pembelian (IDR)', rp(total), st.bulan ? BULAN_PANJANG[Number(st.bulan.slice(5)) - 1] + ' ' + st.bulan.slice(0, 4) : 'Semua periode')}
    ${kpi('bi-cash', 'gold', 'Total dalam ' + neg.mataUang, fmtAsli(neg.mataUang, totalAsli), list.length + ' transaksi')}
    ${kpi('bi-receipt', 'mint', 'Dengan struk', list.filter(x => x.StrukFileId).length + ' / ' + list.length, 'Struk tersimpan di Google Drive')}
  </div>
  <div class="cardx"><div class="filter-bar"><div class="input-icon grow"><i class="bi bi-search"></i><input class="form-control" id="beliQ" placeholder="Cari barang atau toko…" value="${esc(st.q)}" aria-label="Cari pembelian"></div><input type="month" class="form-control" style="max-width:180px" id="beliBulan" value="${esc(st.bulan)}" aria-label="Bulan"><button class="btn btn-light" data-act="beliAllTime">Semua periode</button></div>
    <div class="cardx-body pt-0"><div class="tbl-wrap">${list.length ? `<table class="tbl"><thead><tr><th>Tanggal</th><th>Nama barang</th><th class="r">Qty</th><th class="r">Harga asli</th><th class="r">Kurs</th><th class="r">Total IDR</th><th>Toko</th><th>Pesanan</th><th>Struk</th><th></th></tr></thead><tbody>
      ${list.slice((st.page - 1) * per, st.page * per).map(x => { const o = x.OrderID ? orderById(x.OrderID) : null; return `<tr><td class="nowrap">${tgl(x.Tanggal)}</td><td><b>${esc(x.NamaBarang)}</b>${x.Catatan ? `<span class="sub">${esc(x.Catatan)}</span>` : ''}</td><td class="r">${x.Qty}</td><td class="r num">${fmtAsli(x.MataUang, x.HargaAsli)}</td><td class="r num">${x.MataUang === 'IDR' ? '-' : fmtKurs(x.Kurs)}</td><td class="r num"><b>${rp(x.TotalIDR)}</b></td><td>${esc(x.Toko || '-')}</td><td>${o ? `<button class="link-btn" data-act="openOrder" data-id="${o.ID}">#${esc(o.NoOrder)}</button>` : '<span class="muted">-</span>'}</td>
        <td>${x.StrukFileId ? `<button class="icon-btn sm" data-act="previewFile" data-id="${x.StrukFileId}" data-nama="Struk ${esc(x.NamaBarang)}.jpg" aria-label="Lihat struk"><i class="bi bi-receipt"></i></button>` : '<span class="muted small">-</span>'}</td>
        <td class="nowrap">${can('pembelian.tulis') ? `<button class="icon-btn sm" data-act="beliForm" data-id="${x.ID}" aria-label="Ubah"><i class="bi bi-pencil"></i></button><button class="icon-btn sm" data-act="beliHapus" data-id="${x.ID}" aria-label="Hapus"><i class="bi bi-trash3"></i></button>` : ''}</td></tr>`; }).join('')}
      </tbody></table>` : emptyState('bi-bag', 'Belum ada pembelian di ' + neg.nama, 'Catat belanja shopper beserta struknya agar laporan laba akurat.', can('pembelian.tulis') ? '<button class="btn btn-primary" data-act="beliForm">Catat pembelian</button>' : '')}</div></div>
    <div class="tbl-foot"><span>Total ${list.length} transaksi · ${rp(total)}</span>${pager(st.page, pages, 'beliPage')}</div></div>`;
  $('#beliQ').addEventListener('input', debounce(e => { st.q = e.target.value; st.page = 1; aPembelian(el, {}); const q = $('#beliQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250));
  if (qFocus) { const q = $('#beliQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  $('#beliBulan').onchange = e => { st.bulan = e.target.value; st.page = 1; rerender(); };
}
ACT.beliNeg = b => { S.ui.beli.neg = b.dataset.neg; S.ui.beli.page = 1; rerender(); };
ACT.beliPage = b => { S.ui.beli.page = Number(b.dataset.page); rerender(); };
ACT.beliAllTime = () => { S.ui.beli.bulan = ''; rerender(); };
ACT.beliForm = b => {
  const x = b.dataset.id ? S.d.purchases.find(p => p.ID === b.dataset.id) : { Negara: S.ui.beli.neg, Tanggal: ymd(), Qty: 1 };
  const openOrders = ordersSorted().filter(o => !['Selesai', 'Batal'].includes(o.Status)).slice(0, 200);
  const ws = S.d.wallets.filter(w => w.Aktif !== false);
  const showWallet = canAny(['dompet', 'pembayaran', 'biaya']);
  modal({ title: x.ID ? 'Ubah pembelian' : 'Catat pembelian barang', size: 'lg', body: `<form id="fBeli" class="row g-3" novalidate>
    <div class="col-sm-4"><label class="form-label">Tanggal <span class="req">*</span></label><input class="form-control" type="date" name="tanggal" value="${esc(ymd(x.Tanggal))}"></div>
    <div class="col-sm-4"><label class="form-label">Negara <span class="req">*</span></label><select class="form-select" name="negara">${countries().map(c => `<option value="${c.kode}" ${x.Negara === c.kode ? 'selected' : ''}>${esc(c.nama)} (${c.mataUang})</option>`).join('')}</select></div>
    <div class="col-sm-4"><label class="form-label">Toko</label><input class="form-control" name="toko" value="${esc(x.Toko || '')}" placeholder="Don Quijote Shibuya"></div>
    <div class="col-sm-8"><label class="form-label">Nama barang <span class="req">*</span></label><input class="form-control" name="namaBarang" value="${esc(x.NamaBarang || '')}"></div>
    <div class="col-sm-4"><label class="form-label">Qty</label><input class="form-control" type="number" min="1" name="qty" value="${esc(x.Qty || 1)}"></div>
    <div class="col-sm-4"><label class="form-label">Harga satuan <span class="req">*</span></label><div class="input-group"><span class="input-group-text" id="bMu">${esc(muOf(x.Negara))}</span><input class="form-control" name="hargaAsli" inputmode="decimal" data-uang="mu" data-mu-dari="[name=negara]" value="${esc(x.HargaAsli || '')}"></div></div>
    <div class="col-sm-4"><label class="form-label">Kurs ke IDR</label><input class="form-control" name="kurs" inputmode="decimal" value="${esc(x.Kurs || kursOf(muOf(x.Negara)))}"></div>
    <div class="col-sm-4"><label class="form-label">Total IDR</label><div class="calc-big" style="font-size:22px" id="bTot">-</div></div>
    <div class="col-sm-6"><label class="form-label">Kaitkan ke pesanan</label><select class="form-select" name="orderId"><option value="">Tidak dikaitkan</option>${openOrders.map(o => `<option value="${o.ID}" ${x.OrderID === o.ID ? 'selected' : ''}>#${esc(o.NoOrder)} · ${esc(o.CustomerNama)}</option>`).join('')}</select></div>
    ${showWallet ? `<div class="col-sm-6"><label class="form-label">Dibayar dari dompet</label><select class="form-select" name="walletId"><option value="">Belum dicatat ke kas</option>${ws.map(w => `<option value="${w.ID}" ${x.WalletID === w.ID ? 'selected' : ''}>${esc(w.Nama)} · ${rpShort(S.saldo[w.ID] || 0)}</option>`).join('')}</select><div class="form-text">Saldo dompet berkurang otomatis.</div></div>` : '<div class="col-sm-6"><div class="note-box mt-4"><i class="bi bi-info-circle"></i><div>Admin keuangan akan mencatat dompet pembayarannya.</div></div></div>'}
    <div class="col-12"><label class="form-label">Foto struk</label>${x.StrukFileId ? `<div class="small mb-2"><button type="button" class="link-btn" data-act="previewFile" data-id="${x.StrukFileId}" data-nama="Struk.jpg"><i class="bi bi-receipt"></i> Lihat struk tersimpan</button></div>` : ''}${dropzone('struk', 'Unggah foto struk pembelian')}</div>
    <div class="col-12"><label class="form-label">Catatan</label><input class="form-control" name="catatan" value="${esc(x.Catatan || '')}"></div></form>`,
    foot: `<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnBeli"><i class="bi bi-check2"></i>Simpan</button>` });
  const f = $('#fBeli');
  const calc = e => { if (e && e.target.name === 'negara') { const mu = muOf(f.negara.value); $('#bMu').textContent = mu; f.kurs.value = kursOf(mu); } $('#bTot').textContent = rp((Number(f.qty.value) || 1) * angkaHarga(f.hargaAsli.value, muOf(f.negara.value)) * (muOf(f.negara.value) === 'IDR' ? 1 : toFloat(f.kurs.value))); };
  f.addEventListener('input', calc); f.addEventListener('change', calc); calc();
  $('#btnBeli').onclick = async e => {
    clearErr(f); const d = formData(f);
    if (!d.namaBarang) return fieldErr(f, 'namaBarang', 'Nama barang wajib diisi.');
    if (angkaHarga(d.hargaAsli, muOf(d.negara)) <= 0) return fieldErr(f, 'hargaAsli', 'Isi harga satuan.');
    d.hargaAsli = angkaHarga(d.hargaAsli, muOf(d.negara)); d.kurs = toFloat(d.kurs); d.qty = Number(d.qty) || 1;
    const id = x.ID || uid(); d.id = id;
    d.file = takeFile('struk');
    const mu = muOf(d.negara), k = mu === 'IDR' ? 1 : d.kurs;
    await mutate('purchase.simpan', d, { btn: e.currentTarget, busyLabel: d.file ? 'Mengunggah…' : 'Menyimpan…',
      optimistic: () => upsertLocal('purchases', Object.assign({}, x, { ID: id, Tanggal: d.tanggal, Negara: d.negara, MataUang: mu, NamaBarang: d.namaBarang, Qty: d.qty, HargaAsli: d.hargaAsli, Kurs: k, TotalIDR: Math.round(d.qty * d.hargaAsli * k), Toko: d.toko, OrderID: d.orderId, WalletID: d.walletId || '', Catatan: d.catatan })),
      onOk: () => { closeModal(); S.ui.beli.neg = d.negara; } });
  };
};
ACT.beliHapus = async b => {
  if (!(await confirmDlg({ title: 'Hapus pembelian?', text: 'Mutasi kas terkait ikut dihapus.', ok: 'Hapus', danger: true }))) return;
  await mutate('purchase.hapus', { id: b.dataset.id }, { optimistic: () => removeLocal('purchases', b.dataset.id) });
};
ACT.exportBeli = () => {
  const st = S.ui.beli; const list = S.d.purchases.filter(x => x.Negara === st.neg && (!st.bulan || String(x.Tanggal).slice(0, 7) === st.bulan));
  exportExcel({ judul: 'Pembelian ' + negara(st.neg).nama, periode: st.bulan || 'Semua periode', nama: 'Pembelian',
    kolom: [['Tanggal', 13], ['Barang', 34], ['Toko', 22], ['Qty', 7, 'n'], ['Mata uang', 10], ['Harga asli', 13, 'n2'], ['Kurs', 11, 'n2'], ['Total IDR', 16, 'rp']],
    rows: list.map(x => [tgl(x.Tanggal), x.NamaBarang, x.Toko, x.Qty, x.MataUang, x.HargaAsli, x.Kurs, x.TotalIDR]), total: ['TOTAL', '', '', sum(list, 'Qty'), '', '', '', sum(list, 'TotalIDR')] });
};

// ════════════════════════════════════════════════════════
// BAGIAN 18: PANEL — PEMBAYARAN & MUTASI
// ════════════════════════════════════════════════════════
ROUTES['a-pembayaran'] = { shell: 'adm', title: 'Pembayaran & Mutasi', r: aPembayaran, perm: 'pembayaran' };
function aPembayaran(el, p, re) {
  const st = S.ui.pay || (S.ui.pay = { tab: 'verifikasi', q: '', wallet: '', page: 1 });
  const pend = S.d.payments.filter(x => x.Status === 'Menunggu').sort((a, b) => String(a.Tanggal).localeCompare(String(b.Tanggal)));
  const ws = S.d.wallets.filter(w => w.Aktif !== false);
  const today = ymd();
  const masukH = sum(S.d.transactions.filter(t => t.Tipe === 'Masuk' && ymd(t.Tanggal) === today && t.RefTipe !== 'Transfer'), 'Jumlah');
  const masukB = sum(S.d.payments.filter(x => x.Status === 'Terverifikasi' && String(ymd(x.Tanggal)).slice(0, 7) === today.slice(0, 7)), 'Jumlah');
  let body = '';
  if (st.tab === 'verifikasi') {
    body = pend.length ? `<div class="row g-3">${pend.map(x => { const o = orderById(x.OrderID) || {}; return `<div class="col-md-6 col-xxl-4"><div class="cardx pad h-100 d-flex flex-column gap-3">
      <div class="d-flex gap-3">${x.BuktiFileId ? `<button class="border-0 p-0 bg-transparent" data-act="previewFile" data-id="${x.BuktiFileId}" data-nama="Bukti ${esc(x.NoOrder)}.jpg" aria-label="Perbesar bukti"><img src="${esc(driveImg(x.BuktiFileId, 240))}" alt="Bukti transfer" style="width:84px;height:84px;object-fit:cover;border-radius:14px;background:var(--surface-3)" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'kpi-ic',innerHTML:'<i class=&quot;bi bi-image&quot;></i>'}))"></button>` : '<span class="kpi-ic"><i class="bi bi-image"></i></span>'}
        <div class="min-w-0"><div class="small muted">${tglJam(x.Tanggal)} · ${esc(x.Metode || '')}</div><div class="fs-4 fw-bold num">${rp(x.Jumlah)}</div><div class="small"><b>${esc(x.CustomerNama)}</b> · <button class="link-btn" data-act="openOrder" data-id="${x.OrderID}">#${esc(x.NoOrder)}</button></div><div class="small muted">Sisa tagihan ${rp(o.Sisa)}</div></div></div>
      ${x.Catatan ? `<div class="small tint p-2">${esc(x.Catatan)}</div>` : ''}
      <select class="form-select form-select-sm" data-verw="${x.ID}" aria-label="Dompet penerima"><option value="">Pilih dompet penerima…</option>${ws.map(w => `<option value="${w.ID}">${esc(w.Nama)}</option>`).join('')}</select>
      <div class="d-flex gap-2 mt-auto"><button class="btn btn-success flex-fill" data-act="payVerify" data-id="${x.ID}"><i class="bi bi-check2-circle"></i>Verifikasi</button><button class="btn btn-danger-soft" data-act="payReject" data-id="${x.ID}"><i class="bi bi-x-lg"></i>Tolak</button></div></div></div>`; }).join('')}</div>`
      : `<div class="cardx">${emptyState('bi-check2-all', 'Semua bukti transfer sudah diverifikasi', 'Bukti transfer baru dari customer akan muncul di sini.')}</div>`;
  } else if (st.tab === 'semua') {
    const q = st.q.toLowerCase();
    const list = S.d.payments.filter(x => (!st.wallet || x.WalletID === st.wallet) && (!q || (x.NoOrder + ' ' + x.CustomerNama).toLowerCase().includes(q))).sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal)));
    const per = 20, pages = Math.max(1, Math.ceil(list.length / per)); st.page = Math.min(st.page, pages);
    body = `<div class="cardx"><div class="filter-bar"><div class="input-icon grow"><i class="bi bi-search"></i><input class="form-control" id="payQ" placeholder="Cari no. order atau customer…" value="${esc(st.q)}"></div><select class="form-select" style="max-width:220px" id="payW"><option value="">Semua dompet</option>${S.d.wallets.map(w => `<option value="${w.ID}" ${st.wallet === w.ID ? 'selected' : ''}>${esc(w.Nama)}</option>`).join('')}</select></div>
      <div class="cardx-body pt-0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tanggal</th><th>Pesanan</th><th>Customer</th><th class="r">Jumlah</th><th>Dompet</th><th>Bukti</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.slice((st.page - 1) * per, st.page * per).map(x => `<tr><td class="nowrap">${tglJam(x.Tanggal)}</td><td><button class="link-btn" data-act="openOrder" data-id="${x.OrderID}">#${esc(x.NoOrder)}</button></td><td>${esc(x.CustomerNama)}</td><td class="r num"><b>${rp(x.Jumlah)}</b></td><td>${esc((walletById(x.WalletID) || {}).Nama || '-')}</td><td>${x.BuktiFileId ? `<button class="icon-btn sm" data-act="previewFile" data-id="${x.BuktiFileId}" data-nama="Bukti ${esc(x.NoOrder)}.jpg" aria-label="Lihat bukti"><i class="bi bi-image"></i></button>` : '-'}</td><td>${pill(x.Status)}</td><td><button class="icon-btn sm" data-act="payHapus" data-id="${x.ID}" aria-label="Hapus pembayaran"><i class="bi bi-trash3"></i></button></td></tr>`).join('') || `<tr><td colspan="8">${emptyState('bi-receipt', 'Belum ada pembayaran', '')}</td></tr>`}
      </tbody></table></div></div><div class="tbl-foot"><span>${list.length} pembayaran · ${rp(sum(list.filter(x => x.Status === 'Terverifikasi'), 'Jumlah'))} terverifikasi</span>${pager(st.page, pages, 'payPage')}</div></div>`;
  } else body = mutasiTable(st);
  el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Treasury</span><h1>Pembayaran & Mutasi</h1><p>Verifikasi bukti transfer, catat pelunasan, dan pantau arus kas tiap dompet.</p></div>
    <div class="actions"><button class="btn btn-primary" data-act="catatBayar"><i class="bi bi-plus-lg"></i>Catat Pembayaran</button></div></div>
  <div class="kpi-grid mb-4">${kpi('bi-hourglass-split', 'coral', 'Menunggu verifikasi', pend.length + ' bukti', rp(sum(pend, 'Jumlah')))}${kpi('bi-cash-coin', 'mint', 'Uang masuk hari ini', rp(masukH), 'Pembayaran terverifikasi')}${kpi('bi-calendar-check', '', 'Diterima bulan ini', rp(masukB), BULAN_PANJANG[new Date().getMonth()])}${kpi('bi-receipt', 'danger', 'Piutang berjalan', rp(sum(S.d.orders.filter(o => o.Sisa > 0 && o.Status !== 'Batal'), 'Sisa')), 'Belum lunas', '', 'danger')}</div>
  <div class="tabs-x"><button class="chip ${st.tab === 'verifikasi' ? 'on' : ''}" data-act="payTab" data-t="verifikasi"><i class="bi bi-patch-check"></i>Verifikasi<span class="count">${pend.length}</span></button><button class="chip ${st.tab === 'semua' ? 'on' : ''}" data-act="payTab" data-t="semua"><i class="bi bi-list-ul"></i>Semua pembayaran</button><button class="chip ${st.tab === 'mutasi' ? 'on' : ''}" data-act="payTab" data-t="mutasi"><i class="bi bi-arrow-left-right"></i>Mutasi kas</button></div>
  ${body}`;
  const pq = $('#payQ'); if (pq) { pq.addEventListener('input', debounce(e => { st.q = e.target.value; st.page = 1; rerender(); setTimeout(() => { const x = $('#payQ'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }); }, 300)); $('#payW').onchange = e => { st.wallet = e.target.value; rerender(); }; }
  bindMutasiFilters(st);
}
function mutasiTable(st) {
  const list = S.d.transactions.filter(t => (!st.wallet || t.WalletID === st.wallet) && (!st.tipe || t.Tipe === st.tipe)).sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal)));
  const per = 25, pages = Math.max(1, Math.ceil(list.length / per)); st.mpage = Math.min(st.mpage || 1, pages);
  return `<div class="cardx"><div class="filter-bar"><select class="form-select" style="max-width:240px" id="mutW"><option value="">Semua dompet</option>${S.d.wallets.map(w => `<option value="${w.ID}" ${st.wallet === w.ID ? 'selected' : ''}>${esc(w.Nama)}</option>`).join('')}</select><div class="seg">${[['', 'Semua'], ['Masuk', 'Masuk'], ['Keluar', 'Keluar']].map(([v, t]) => `<button class="${(st.tipe || '') === v ? 'on' : ''}" data-act="mutTipe" data-v="${v}">${t}</button>`).join('')}</div></div>
    <div class="cardx-body pt-0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tanggal</th><th>Dompet</th><th>Kategori</th><th>Keterangan</th><th class="r">Masuk</th><th class="r">Keluar</th></tr></thead><tbody>
    ${list.slice((st.mpage - 1) * per, st.mpage * per).map(t => { const w = walletById(t.WalletID) || {}; return `<tr><td class="nowrap">${tglJam(t.Tanggal)}</td><td><span class="d-inline-flex align-items-center gap-2"><span style="width:8px;height:8px;border-radius:50%;background:${esc(w.Warna || '#999')}"></span>${esc(w.Nama || '-')}</span></td><td><span class="tag">${esc(t.Kategori)}</span></td><td style="max-width:320px"><span class="clamp-1">${esc(t.Keterangan)}</span></td><td class="r num" style="color:var(--mint-ink)">${t.Tipe === 'Masuk' ? '+' + rp(t.Jumlah) : ''}</td><td class="r num" style="color:var(--danger)">${t.Tipe === 'Keluar' ? '−' + rp(t.Jumlah) : ''}</td></tr>`; }).join('') || `<tr><td colspan="6">${emptyState('bi-arrow-left-right', 'Belum ada mutasi', '')}</td></tr>`}
    </tbody></table></div></div><div class="tbl-foot"><span>Masuk ${rp(sum(list.filter(t => t.Tipe === 'Masuk'), 'Jumlah'))} · Keluar ${rp(sum(list.filter(t => t.Tipe === 'Keluar'), 'Jumlah'))}</span>${pager(st.mpage, pages, 'mutPage')}</div></div>`;
}
function bindMutasiFilters(st) { const w = $('#mutW'); if (w) w.onchange = e => { st.wallet = e.target.value; st.mpage = 1; rerender(); }; }
ACT.mutTipe = b => { const st = S.route === 'a-dompet' ? S.ui.dom : S.ui.pay; st.tipe = b.dataset.v; st.mpage = 1; rerender(); };
ACT.mutPage = b => { const st = S.route === 'a-dompet' ? S.ui.dom : S.ui.pay; st.mpage = Number(b.dataset.page); rerender(); };
ACT.payTab = b => { S.ui.pay.tab = b.dataset.t; S.ui.pay.page = 1; rerender(); };
ACT.payPage = b => { S.ui.pay.page = Number(b.dataset.page); rerender(); };
ACT.payVerify = async b => {
  const x = S.d.payments.find(p => p.ID === b.dataset.id);
  const w = $(`[data-verw="${x.ID}"]`).value;
  if (!w) { $(`[data-verw="${x.ID}"]`).classList.add('is-invalid'); return toast('Pilih dompet penerima dana.', 'warning'); }
  const o = orderById(x.OrderID);
  await mutate('payment.verifikasi', { id: x.ID, walletId: w }, { btn: b, busyLabel: 'Memverifikasi…',
    optimistic: () => {
      const u = [upsertLocal('payments', { ID: x.ID, Status: 'Terverifikasi', WalletID: w })];
      if (o) { const dib = o.Dibayar + x.Jumlah; u.push(upsertLocal('orders', { ID: o.ID, Dibayar: dib, Sisa: Math.max(0, o.Total - dib), StatusBayar: dib >= o.Total ? 'Lunas' : 'DP' })); }
      return u;
    } });
};
ACT.payReject = async b => {
  const x = S.d.payments.find(p => p.ID === b.dataset.id);
  modal({ title: 'Tolak bukti transfer', body: `<p class="muted">Customer <b>${esc(x.CustomerNama)}</b> · ${rp(x.Jumlah)} untuk #${esc(x.NoOrder)}.</p><label class="form-label" for="tolakAlasan">Alasan penolakan</label><textarea class="form-control" id="tolakAlasan" rows="3" placeholder="Contoh: nominal tidak sesuai, bukti buram">Bukti transfer tidak sesuai atau dana belum masuk.</textarea>`,
    foot: '<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-danger" id="btnTolak">Tolak pembayaran</button>' });
  $('#btnTolak').onclick = async e => {
    await mutate('payment.tolak', { id: x.ID, alasan: $('#tolakAlasan').value }, { btn: e.currentTarget, optimistic: () => upsertLocal('payments', { ID: x.ID, Status: 'Ditolak' }), onOk: closeModal });
  };
};
ACT.payHapus = async b => {
  if (!(await confirmDlg({ title: 'Hapus pembayaran?', text: 'Mutasi kas terkait dihapus dan sisa tagihan dihitung ulang.', ok: 'Hapus', danger: true }))) return;
  await mutate('payment.hapus', { id: b.dataset.id }, { optimistic: () => removeLocal('payments', b.dataset.id) });
};
ACT.catatBayar = b => {
  const pre = b && b.dataset.id ? orderById(b.dataset.id) : null;
  const opts = ordersSorted().filter(o => o.Sisa > 0 && o.Status !== 'Batal');
  const ws = S.d.wallets.filter(w => w.Aktif !== false);
  if (!opts.length && !pre) return toast('Tidak ada tagihan yang belum lunas.', 'info');
  modal({ title: 'Catat pembayaran / pelunasan', body: `<form id="fPay" class="row g-3" novalidate>
    <div class="col-12"><label class="form-label">Pesanan <span class="req">*</span></label><select class="form-select" name="orderId">${(pre && !opts.includes(pre) ? [pre] : []).concat(opts).map(o => `<option value="${o.ID}" ${pre && pre.ID === o.ID ? 'selected' : ''} data-sisa="${o.Sisa}">#${esc(o.NoOrder)} · ${esc(o.CustomerNama)} · sisa ${rp(o.Sisa)}</option>`).join('')}</select></div>
    <div class="col-sm-6"><label class="form-label">Jumlah <span class="req">*</span></label><div class="input-group"><span class="input-group-text">Rp</span><input class="form-control" name="jumlah" inputmode="numeric" data-uang></div><div class="d-flex gap-2 mt-2"><button type="button" class="btn btn-sm btn-light" data-fill="1">Lunasi sisa</button><button type="button" class="btn btn-sm btn-light" data-fill="0.5">50%</button></div></div>
    <div class="col-sm-6"><label class="form-label">Metode</label><select class="form-select" name="metode"><option>Transfer Bank</option><option>E-Wallet</option><option>QRIS</option><option>Tunai</option></select></div>
    <div class="col-12"><label class="form-label">Masuk ke dompet <span class="req">*</span></label><select class="form-select" name="walletId"><option value="">Pilih dompet…</option>${ws.map(w => `<option value="${w.ID}">${esc(w.Nama)} · ${esc(w.Jenis)}</option>`).join('')}</select></div>
    <div class="col-12"><label class="form-label">Bukti (opsional)</label>${dropzone('buktiAdm', 'Unggah bukti transfer')}</div>
    <div class="col-12"><label class="form-label">Catatan</label><input class="form-control" name="catatan"></div></form>`,
    foot: '<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-success" id="btnPay"><i class="bi bi-check2-circle"></i>Simpan pembayaran</button>' });
  const f = $('#fPay');
  const fill = r => { const s = Number(f.orderId.selectedOptions[0].dataset.sisa); f.jumlah.value = num(Math.round(s * r)); };
  $$('[data-fill]', f).forEach(x => x.onclick = () => fill(Number(x.dataset.fill)));
  f.orderId.onchange = () => fill(1); fill(1);
  $('#btnPay').onclick = async e => {
    clearErr(f); const d = formData(f);
    const jumlah = toNum(d.jumlah);
    if (jumlah <= 0) return fieldErr(f, 'jumlah', 'Isi jumlah pembayaran.');
    if (!d.walletId) return fieldErr(f, 'walletId', 'Pilih dompet penerima.');
    const o = orderById(d.orderId); const id = uid();
    await mutate('payment.simpan', { id, orderId: d.orderId, jumlah, walletId: d.walletId, metode: d.metode, catatan: d.catatan, file: takeFile('buktiAdm') }, { btn: e.currentTarget, busyLabel: 'Menyimpan…',
      optimistic: () => { const dib = o.Dibayar + jumlah; return [upsertLocal('payments', { ID: id, Tanggal: new Date().toISOString(), OrderID: o.ID, NoOrder: o.NoOrder, CustomerID: o.CustomerID, CustomerNama: o.CustomerNama, Jumlah: jumlah, WalletID: d.walletId, Metode: d.metode, Status: 'Terverifikasi' }), upsertLocal('orders', { ID: o.ID, Dibayar: dib, Sisa: Math.max(0, o.Total - dib), StatusBayar: dib >= o.Total ? 'Lunas' : 'DP' })]; },
      onOk: () => { closeModal(); if (S.ui.ordOpen === o.ID && $('#drawer').classList.contains('show')) openOrderDrawer(o.ID); } });
  };
};

// ════════════════════════════════════════════════════════
// BAGIAN 19: PANEL — DOMPET & SALDO
// ════════════════════════════════════════════════════════
ROUTES['a-dompet'] = { shell: 'adm', title: 'Dompet & Saldo', r: aDompet, perm: 'dompet' };
// v1.2: daftar jenis dompet bisa diatur Super Admin & Owner (Pengaturan → jenisDompet)
const JENIS_BAWAAN = [{ nama: 'Rekening', ikon: 'bi-bank' }, { nama: 'E-Wallet', ikon: 'bi-phone' }, { nama: 'Tunai', ikon: 'bi-cash-stack' }, { nama: 'Lainnya', ikon: 'bi-wallet2' }];
const IKON_DOMPET = [['bi-bank', 'Bank'], ['bi-phone', 'E-wallet'], ['bi-cash-stack', 'Tunai'], ['bi-wallet2', 'Dompet'], ['bi-credit-card', 'Kartu'], ['bi-qr-code', 'QRIS'], ['bi-piggy-bank', 'Tabungan'], ['bi-safe', 'Brankas'], ['bi-building', 'Kantor'], ['bi-globe2', 'Luar negeri'], ['bi-briefcase', 'Usaha'], ['bi-coin', 'Koin']];
const jenisDompet = () => { const l = sett().jenisDompet; return Array.isArray(l) && l.length ? l : JENIS_BAWAAN; };
const ikonJenis = j => (jenisDompet().find(x => x.nama === j) || {}).ikon || 'bi-wallet2';
function aDompet(el) {
  const st = S.ui.dom || (S.ui.dom = { wallet: '', tipe: '', mpage: 1 });
  const ws = S.d.wallets;
  const total = sum(ws.filter(w => w.Aktif !== false), w => S.saldo[w.ID] || 0);
  el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Treasury</span><h1>Dompet & Saldo</h1><p>Setiap kas punya dompet sendiri: rekening, e-wallet, atau tunai. Saldo bergerak otomatis dari pembayaran, pembelian, dan biaya.</p></div>
    <div class="actions">${can('dompet.jenis') ? '<button class="btn btn-light" data-act="jenisDompet"><i class="bi bi-tags"></i>Jenis dompet</button>' : ''}<button class="btn btn-light" data-act="walletTransfer"><i class="bi bi-arrow-left-right"></i>Transfer antar dompet</button><button class="btn btn-primary" data-act="walletForm"><i class="bi bi-plus-lg"></i>Tambah dompet</button></div></div>
  <div class="row g-4 mb-4"><div class="col-xl-8"><div class="row g-3">${ws.map(w => { const mut = S.d.transactions.filter(t => t.WalletID === w.ID).sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal))).slice(0, 3);
    return `<div class="col-md-6"><div class="cardx wallet-card h-100" style="--wc:${esc(w.Warna || '#6C5CE7')}"><div class="d-flex justify-content-between align-items-start"><span class="wc-ic"><i class="bi ${ikonJenis(w.Jenis)}"></i></span><div class="d-flex gap-1 align-items-center">${w.Aktif === false ? pill('Nonaktif') : `<span class="tag">${esc(w.Jenis)}</span>`}<button class="icon-btn sm" data-act="walletForm" data-id="${w.ID}" aria-label="Ubah dompet"><i class="bi bi-pencil"></i></button></div></div>
      <div class="mt-3 fw-bold">${esc(w.Nama)}</div><div class="small muted">${esc(w.NoRekening || '-')} · a.n. ${esc(w.AtasNama || '-')}</div><div class="bal">${rp(S.saldo[w.ID] || 0)}</div>
      <div class="small">${mut.map(t => `<div class="d-flex justify-content-between py-1" style="border-top:1px dashed var(--border)"><span class="clamp-1 muted me-2">${esc(t.Keterangan)}</span><b class="num nowrap" style="color:${t.Tipe === 'Masuk' ? 'var(--mint-ink)' : 'var(--danger)'}">${t.Tipe === 'Masuk' ? '+' : '−'}${rpShort(t.Jumlah)}</b></div>`).join('') || '<span class="muted">Belum ada mutasi</span>'}</div>
      <button class="link-btn small mt-2" data-act="walletMutasi" data-id="${w.ID}">Lihat semua mutasi <i class="bi bi-arrow-right"></i></button></div></div>`; }).join('') || `<div class="col-12"><div class="cardx">${emptyState('bi-wallet2', 'Belum ada dompet', 'Tambahkan rekening atau e-wallet usaha Anda.', '<button class="btn btn-primary" data-act="walletForm">Tambah dompet</button>')}</div></div>`}</div></div>
    <div class="col-xl-4"><div class="cardx h-100"><div class="cardx-head"><h3>Sebaran uang kas</h3></div><div class="cardx-body"><div class="donut-wrap"><canvas id="chDompet" role="img" aria-label="Sebaran saldo"></canvas><div class="donut-center"><div><small>Total kas</small><b>${rpShort(total)}</b></div></div></div>
      ${ws.filter(w => w.Aktif !== false).map(w => `<div class="legend-row mt-2"><span class="d-flex align-items-center gap-2"><span class="sw" style="background:${esc(w.Warna)}"></span>${esc(w.Nama)}</span><b>${total ? num((S.saldo[w.ID] || 0) / total * 100, 1) : 0}%</b></div>`).join('')}</div></div></div></div>
  <h2 class="fs-5 fw-bold mb-3" id="mutasiHead">Mutasi kas</h2>${mutasiTable(st)}`;
  bindMutasiFilters(st);
  renderWalletDonut('chDompet', ws.filter(w => w.Aktif !== false));
}
ACT.walletMutasi = b => { S.ui.dom.wallet = b.dataset.id; S.ui.dom.mpage = 1; rerender(); $('#mutasiHead').scrollIntoView({ behavior: 'smooth' }); };
ACT.walletForm = b => {
  const w = b && b.dataset.id ? walletById(b.dataset.id) : { Jenis: jenisDompet()[0].nama, Warna: '#6C5CE7', Aktif: true, SaldoAwal: 0 };
  const jenisList = jenisDompet().map(j => j.nama); if (w.Jenis && !jenisList.includes(w.Jenis)) jenisList.push(w.Jenis);
  const warna = ['#6C5CE7', '#FF8A65', '#3B82F6', '#10B981', '#F5B83D', '#EC4899', '#0EA5E9', '#475569'];
  modal({ title: w.ID ? 'Ubah dompet' : 'Tambah dompet', body: `<form id="fWal" class="row g-3" novalidate>
    <div class="col-sm-7"><label class="form-label">Nama dompet <span class="req">*</span></label><input class="form-control" name="nama" value="${esc(w.Nama || '')}" placeholder="BCA Operasional"></div>
    <div class="col-sm-5"><label class="form-label d-flex justify-content-between">Jenis${can('dompet.jenis') ? '<button type="button" class="link-btn small" data-act="jenisDompet">Atur jenis</button>' : ''}</label><select class="form-select" name="jenis">${jenisList.map(j => `<option ${w.Jenis === j ? 'selected' : ''}>${esc(j)}</option>`).join('')}</select></div>
    <div class="col-sm-6"><label class="form-label">No. rekening / akun</label><input class="form-control" name="noRekening" value="${esc(w.NoRekening || '')}"></div>
    <div class="col-sm-6"><label class="form-label">Atas nama</label><input class="form-control" name="atasNama" value="${esc(w.AtasNama || '')}"></div>
    <div class="col-sm-6"><label class="form-label">Saldo awal</label><div class="input-group"><span class="input-group-text">Rp</span><input class="form-control" name="saldoAwal" inputmode="numeric" data-uang value="${num(w.SaldoAwal || 0)}"></div></div>
    <div class="col-sm-6"><label class="form-label">Warna</label><div class="color-swatches" id="walColors">${warna.map(c => `<button type="button" class="${(w.Warna || '').toUpperCase() === c ? 'on' : ''}" style="background:${c}" data-c="${c}" aria-label="Warna ${c}"></button>`).join('')}</div><input type="hidden" name="warna" value="${esc(w.Warna || '#6C5CE7')}"></div>
    <div class="col-12"><label class="form-check form-switch"><input class="form-check-input" type="checkbox" name="aktif" ${w.Aktif !== false ? 'checked' : ''}> Dompet aktif</label></div></form>`,
    foot: `${w.ID ? `<button class="btn btn-danger-soft me-auto" data-act="walletHapus" data-id="${w.ID}"><i class="bi bi-trash3"></i></button>` : ''}<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnWal">Simpan</button>` });
  $$('#walColors button').forEach(x => x.onclick = () => { $$('#walColors button').forEach(y => y.classList.remove('on')); x.classList.add('on'); $('#fWal').warna.value = x.dataset.c; });
  $('#btnWal').onclick = async e => {
    const f = $('#fWal'); clearErr(f); const d = formData(f);
    if (d.nama.length < 2) return fieldErr(f, 'nama', 'Nama dompet wajib diisi.');
    d.saldoAwal = toNum(d.saldoAwal); const id = w.ID || uid(); d.id = id;
    await mutate('wallet.simpan', d, { btn: e.currentTarget, optimistic: () => { const u = upsertLocal('wallets', { ID: id, Nama: d.nama, Jenis: d.jenis, NoRekening: d.noRekening, AtasNama: d.atasNama, SaldoAwal: d.saldoAwal, Warna: d.warna, Aktif: d.aktif }); if (!w.ID) S.saldo[id] = d.saldoAwal; return u; }, onOk: res => { if (!w.ID) S.saldo[id] = res.data.saldo; closeModal(); } });
  };
};
ACT.walletHapus = async b => {
  closeModal();
  if (!(await confirmDlg({ title: 'Hapus dompet?', text: 'Dompet yang sudah punya mutasi tidak bisa dihapus; nonaktifkan saja.', ok: 'Hapus', danger: true }))) return;
  await mutate('wallet.hapus', { id: b.dataset.id }, { optimistic: () => removeLocal('wallets', b.dataset.id) });
};
ACT.walletTransfer = () => {
  const ws = S.d.wallets.filter(w => w.Aktif !== false);
  modal({ title: 'Transfer antar dompet', body: `<form id="fTrf" class="row g-3" novalidate>
    <div class="col-sm-6"><label class="form-label">Dari</label><select class="form-select" name="dari">${ws.map(w => `<option value="${w.ID}">${esc(w.Nama)} · ${rpShort(S.saldo[w.ID] || 0)}</option>`).join('')}</select></div>
    <div class="col-sm-6"><label class="form-label">Ke</label><select class="form-select" name="ke">${ws.map((w, i) => `<option value="${w.ID}" ${i === 1 ? 'selected' : ''}>${esc(w.Nama)}</option>`).join('')}</select></div>
    <div class="col-sm-6"><label class="form-label">Jumlah</label><div class="input-group"><span class="input-group-text">Rp</span><input class="form-control" name="jumlah" inputmode="numeric" data-uang></div></div>
    <div class="col-sm-6"><label class="form-label">Catatan</label><input class="form-control" name="catatan" placeholder="Opsional"></div></form>`,
    foot: '<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnTrf"><i class="bi bi-arrow-left-right"></i>Transfer</button>' });
  $('#btnTrf').onclick = async e => {
    const f = $('#fTrf'); clearErr(f); const d = formData(f); d.jumlah = toNum(d.jumlah);
    if (d.dari === d.ke) return fieldErr(f, 'ke', 'Pilih dompet tujuan yang berbeda.');
    if (d.jumlah <= 0) return fieldErr(f, 'jumlah', 'Isi jumlah transfer.');
    await mutate('wallet.transfer', d, { btn: e.currentTarget, onOk: closeModal });
  };
};

// ════════════════════════════════════════════════════════
// BAGIAN 20: PANEL — BIAYA & LOGISTIK
// ════════════════════════════════════════════════════════
ROUTES['a-biaya'] = { shell: 'adm', title: 'Biaya & Logistik', r: aBiaya, perm: 'biaya' };
const KAT_BIAYA = ['Ongkir', 'Packaging', 'Bagasi', 'Bea Cukai', 'Operasional', 'Marketing', 'Lainnya'];
function aBiaya(el) {
  const st = S.ui.biaya || (S.ui.biaya = { bulan: ymd().slice(0, 7), kat: '', page: 1 });
  const list = S.d.expenses.filter(x => (!st.bulan || String(x.Tanggal).slice(0, 7) === st.bulan) && (!st.kat || x.Kategori === st.kat)).sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal)));
  const byKat = {}; list.forEach(x => { byKat[x.Kategori] = (byKat[x.Kategori] || 0) + x.Jumlah; });
  const top = Object.entries(byKat).sort((a, b) => b[1] - a[1]);
  const per = 20, pages = Math.max(1, Math.ceil(list.length / per)); st.page = Math.min(st.page, pages);
  el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Biaya</span><h1>Biaya & Logistik</h1><p>Ongkir, packaging, bagasi, bea cukai, dan biaya operasional. Mengurangi laba bersih di laporan.</p></div>
    <div class="actions"><button class="btn btn-primary" data-act="biayaForm"><i class="bi bi-plus-lg"></i>Catat biaya</button></div></div>
  <div class="kpi-grid mb-4">${kpi('bi-receipt', 'coral', 'Total biaya', rp(sum(list, 'Jumlah')), st.bulan ? BULAN_PANJANG[Number(st.bulan.slice(5)) - 1] + ' ' + st.bulan.slice(0, 4) : 'Semua periode')}${top.slice(0, 3).map(([k, v]) => kpi('bi-tag', '', k, rp(v), num(v / Math.max(1, sum(list, 'Jumlah')) * 100, 1) + '% dari total')).join('')}</div>
  <div class="cardx"><div class="filter-bar"><input type="month" class="form-control" style="max-width:180px" id="biayaBulan" value="${esc(st.bulan)}" aria-label="Bulan"><div class="chips">${[''].concat(KAT_BIAYA).map(k => `<button class="chip ${st.kat === k ? 'on' : ''}" data-act="biayaKat" data-k="${k}">${k || 'Semua'}</button>`).join('')}</div></div>
    <div class="cardx-body pt-0"><div class="tbl-wrap">${list.length ? `<table class="tbl"><thead><tr><th>Tanggal</th><th>Kategori</th><th>Keterangan</th><th>Dompet</th><th>Bukti</th><th class="r">Jumlah</th><th></th></tr></thead><tbody>${list.slice((st.page - 1) * per, st.page * per).map(x => `<tr><td class="nowrap">${tgl(x.Tanggal)}</td><td><span class="tag">${esc(x.Kategori)}</span></td><td>${esc(x.Keterangan)}</td><td>${esc((walletById(x.WalletID) || {}).Nama || '-')}</td><td>${x.BuktiFileId ? `<button class="icon-btn sm" data-act="previewFile" data-id="${x.BuktiFileId}" data-nama="Bukti biaya.jpg" aria-label="Lihat bukti"><i class="bi bi-image"></i></button>` : '-'}</td><td class="r num"><b>${rp(x.Jumlah)}</b></td><td class="nowrap"><button class="icon-btn sm" data-act="biayaForm" data-id="${x.ID}" aria-label="Ubah"><i class="bi bi-pencil"></i></button><button class="icon-btn sm" data-act="biayaHapus" data-id="${x.ID}" aria-label="Hapus"><i class="bi bi-trash3"></i></button></td></tr>`).join('')}</tbody><tfoot><tr><td colspan="5" class="fw-bold" style="padding:14px">Total</td><td class="r num fw-bold" style="padding:14px">${rp(sum(list, 'Jumlah'))}</td><td></td></tr></tfoot></table>` : emptyState('bi-truck', 'Belum ada biaya', 'Catat ongkir, packaging, dan biaya operasional.', '<button class="btn btn-primary" data-act="biayaForm">Catat biaya</button>')}</div></div>
    <div class="tbl-foot"><span>${list.length} catatan</span>${pager(st.page, pages, 'biayaPage')}</div></div>`;
  $('#biayaBulan').onchange = e => { st.bulan = e.target.value; st.page = 1; rerender(); };
}
ACT.biayaKat = b => { S.ui.biaya.kat = b.dataset.k; S.ui.biaya.page = 1; rerender(); };
ACT.biayaPage = b => { S.ui.biaya.page = Number(b.dataset.page); rerender(); };
ACT.biayaForm = b => {
  const x = b && b.dataset.id ? S.d.expenses.find(e => e.ID === b.dataset.id) : { Tanggal: ymd(), Kategori: 'Ongkir' };
  const ws = S.d.wallets.filter(w => w.Aktif !== false);
  modal({ title: x.ID ? 'Ubah biaya' : 'Catat biaya', body: `<form id="fBiaya" class="row g-3" novalidate>
    <div class="col-sm-6"><label class="form-label">Tanggal</label><input type="date" class="form-control" name="tanggal" value="${esc(ymd(x.Tanggal))}"></div>
    <div class="col-sm-6"><label class="form-label">Kategori</label><input class="form-control" name="kategori" list="katBiayaList" value="${esc(x.Kategori || '')}"><datalist id="katBiayaList">${KAT_BIAYA.map(k => `<option value="${k}">`).join('')}</datalist></div>
    <div class="col-12"><label class="form-label">Keterangan <span class="req">*</span></label><input class="form-control" name="keterangan" value="${esc(x.Keterangan || '')}" placeholder="Ongkir Paxel minggu ini"></div>
    <div class="col-sm-6"><label class="form-label">Jumlah <span class="req">*</span></label><div class="input-group"><span class="input-group-text">Rp</span><input class="form-control" name="jumlah" inputmode="numeric" data-uang value="${x.Jumlah ? num(x.Jumlah) : ''}"></div></div>
    <div class="col-sm-6"><label class="form-label">Dibayar dari dompet</label><select class="form-select" name="walletId"><option value="">Tidak dicatat ke kas</option>${ws.map(w => `<option value="${w.ID}" ${x.WalletID === w.ID ? 'selected' : ''}>${esc(w.Nama)}</option>`).join('')}</select></div>
    <div class="col-12"><label class="form-label">Bukti / nota</label>${dropzone('buktiBiaya', 'Unggah nota (opsional)')}</div></form>`,
    foot: '<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnBiaya">Simpan</button>' });
  $('#btnBiaya').onclick = async e => {
    const f = $('#fBiaya'); clearErr(f); const d = formData(f);
    if (!d.keterangan) return fieldErr(f, 'keterangan', 'Isi keterangan.');
    d.jumlah = toNum(d.jumlah); if (d.jumlah <= 0) return fieldErr(f, 'jumlah', 'Isi jumlah.');
    const id = x.ID || uid(); d.id = id; d.file = takeFile('buktiBiaya');
    await mutate('expense.simpan', d, { btn: e.currentTarget, optimistic: () => upsertLocal('expenses', Object.assign({}, x, { ID: id, Tanggal: d.tanggal, Kategori: d.kategori || 'Operasional', Keterangan: d.keterangan, Jumlah: d.jumlah, WalletID: d.walletId })), onOk: closeModal });
  };
};
ACT.biayaHapus = async b => {
  if (!(await confirmDlg({ title: 'Hapus biaya?', text: 'Mutasi kas terkait ikut dihapus.', ok: 'Hapus', danger: true }))) return;
  await mutate('expense.hapus', { id: b.dataset.id }, { optimistic: () => removeLocal('expenses', b.dataset.id) });
};

// ════════════════════════════════════════════════════════
// BAGIAN 21: PANEL — KALKULATOR KURS
// ════════════════════════════════════════════════════════
ROUTES['a-kurs'] = { shell: 'adm', title: 'Kalkulator Kurs', r: aKurs };
function aKurs(el, p, re) {
  const st = S.ui.kurs || (S.ui.kurs = { mu: 'JPY', nominal: 15000, arah: 'toIDR', neg: 'JP' });
  if (re && el.dataset.ready) { renderKursCalc(); return; }
  const k = kurs(); const s = sett();
  el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Alat</span><h1>Kalkulator Kurs Live</h1><p>Kurs diambil otomatis dari internet tiap jam. Owner bisa mengunci kurs manual per mata uang.</p></div>
    <div class="actions"><button class="btn btn-light" data-act="kursRefresh"><i class="bi bi-arrow-clockwise"></i>Ambil kurs terbaru</button></div></div>
  <div class="row g-4 mb-4"><div class="col-xl-5"><div class="cardx pad-lg h-100">
      <div class="d-flex justify-content-between align-items-center mb-3"><b class="fs-5">Konversi cepat</b><span class="pill primary nodot">${esc(k.sumber || '-')}</span></div>
      <div class="row g-3"><div class="col-6"><label class="form-label" for="kcMu">Mata uang</label><select class="form-select" id="kcMu">${['JPY', 'SGD', 'MYR', 'THB'].map(m => `<option ${st.mu === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="col-6"><label class="form-label" for="kcArah">Arah</label><select class="form-select" id="kcArah"><option value="toIDR" ${st.arah === 'toIDR' ? 'selected' : ''}>Valas → IDR</option><option value="fromIDR" ${st.arah === 'fromIDR' ? 'selected' : ''}>IDR → Valas</option></select></div>
        <div class="col-12"><label class="form-label" for="kcNom">Nominal</label><input class="form-control form-control-lg" id="kcNom" inputmode="decimal" data-uang="kurs-idr" value="${esc(num(st.nominal, 2))}"></div></div>
      <div class="tint p-3 mt-3" id="kcOut" aria-live="polite"></div>
      <div class="small muted mt-2"><i class="bi bi-clock"></i> Diperbarui ${k.waktu ? tglJam(k.waktu) : '-'}</div>
    </div></div>
    <div class="col-xl-7"><div class="cardx h-100"><div class="cardx-head"><h3>Kurs hari ini</h3><span class="cardx-sub">1 unit valas dalam Rupiah</span></div><div class="cardx-body">
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mata uang</th><th class="r">Kurs live</th><th class="r">Kurs dipakai</th><th>Mode</th></tr></thead><tbody>${['JPY', 'SGD', 'MYR', 'THB'].map(m => `<tr><td><b>${m}</b> <span class="muted small">${esc(countries().find(c => c.mataUang === m)?.nama || '')}</span></td><td class="r num">${fmtKurs((k.live || {})[m])}</td><td class="r num"><b>Rp ${fmtKurs(k.rates[m])}</b></td><td>${(k.manual || {})[m] ? '<span class="pill st-dibeli sm">Manual</span>' : '<span class="pill st-selesai sm">Otomatis</span>'}</td></tr>`).join('')}</tbody></table></div>
      <div class="chart-box sm mt-3"><canvas id="chKurs" role="img" aria-label="Riwayat kurs"></canvas></div><div class="small muted" id="kursHistNote">Memuat riwayat kurs…</div></div></div></div></div>
  <div class="row g-4"><div class="col-xl-6"><div class="cardx pad-lg h-100"><b class="fs-5 d-block mb-1">Kalkulator jastip</b><p class="muted small">Harga toko → harga IDR + jasa titip sesuai aturan negara.</p>
      <div class="row g-3"><div class="col-sm-6"><label class="form-label" for="kjNeg">Negara</label><select class="form-select" id="kjNeg">${countries().map(c => `<option value="${c.kode}" ${st.neg === c.kode ? 'selected' : ''}>${esc(c.nama)} (${c.mataUang})</option>`).join('')}</select></div><div class="col-sm-3"><label class="form-label" for="kjHarga">Harga</label><input class="form-control" id="kjHarga" inputmode="decimal" data-uang="mu" data-mu-dari="#kjNeg" value="1200"></div><div class="col-sm-3"><label class="form-label" for="kjQty">Qty</label><input class="form-control" id="kjQty" type="number" min="1" value="1"></div></div>
      <div class="receipt mt-3" id="kjOut"></div></div></div>
    <div class="col-xl-6">${can('kurs.atur') ? `<div class="cardx pad-lg h-100"><b class="fs-5 d-block mb-1"><i class="bi bi-lock me-2 ink"></i>Kunci kurs manual (owner)</b><p class="muted small">Pilih "Manual" untuk memakai kurs Anda sendiri, misalnya kurs jual yang sudah termasuk margin.</p>
      <form id="fKursManual">${['JPY', 'SGD', 'MYR', 'THB'].map(m => `<div class="d-flex gap-2 align-items-center mb-2"><b style="width:46px">${m}</b><select class="form-select form-select-sm" style="max-width:130px" name="mode_${m}"><option value="auto">Otomatis</option><option value="manual" ${(s.kursMode || {})[m] === 'manual' ? 'selected' : ''}>Manual</option></select><div class="input-group input-group-sm"><span class="input-group-text">Rp</span><input class="form-control" name="val_${m}" inputmode="decimal" value="${esc((s.kursManual || {})[m] || '')}" placeholder="${fmtKurs((k.live || {})[m])}"></div></div>`).join('')}
      <button class="btn btn-primary w-100 mt-2" type="submit"><i class="bi bi-check2"></i>Simpan pengaturan kurs</button></form></div>` : `<div class="cardx pad-lg h-100"><div class="note-box mt-0"><i class="bi bi-info-circle"></i><div>Pengaturan kurs manual hanya untuk Owner dan Super Admin.</div></div></div>`}</div></div>`;
  el.dataset.ready = '1';
  ['kcMu', 'kcArah', 'kcNom'].forEach(id => $('#' + id).addEventListener('input', renderKursCalc));
  ['kjNeg', 'kjHarga', 'kjQty'].forEach(id => $('#' + id).addEventListener('input', renderKursCalc));
  renderKursCalc();
  const fm = $('#fKursManual');
  if (fm) fm.onsubmit = async e => {
    e.preventDefault(); const d = formData(fm);
    const mode = {}, val = {};
    ['JPY', 'SGD', 'MYR', 'THB'].forEach(m => { mode[m] = d['mode_' + m]; val[m] = toFloat(d['val_' + m]); });
    const bad = Object.keys(mode).find(m => mode[m] === 'manual' && !(val[m] > 0));
    if (bad) return toast('Isi kurs manual untuk ' + bad + '.', 'warning');
    const res = await mutate('settings.simpan', { values: { kursMode: mode, kursManual: val } }, { btn: fm.querySelector('[type=submit]'), rerenderView: false });
    if (res.success) { S.settings = res.data.settings; S.boot.kurs = res.data.kurs; delete el.dataset.ready; aKurs(el, {}); updateKursChrome(); }
  };
  loadKursHist();
}
function renderKursCalc() {
  const st = S.ui.kurs;
  st.mu = $('#kcMu').value; st.arah = $('#kcArah').value; st.nominal = st.arah === 'fromIDR' ? angkaUang($('#kcNom').value) : toFloat($('#kcNom').value);
  const r = kursOf(st.mu);
  $('#kcOut').innerHTML = st.arah === 'toIDR'
    ? `<div class="small muted">${fmtAsli(st.mu, st.nominal)} =</div><div class="calc-big">${rp(st.nominal * r)}</div><div class="small muted">Kurs dipakai: 1 ${st.mu} = Rp ${fmtKurs(r)}</div>`
    : `<div class="small muted">${rp(st.nominal)} =</div><div class="calc-big">${st.mu} ${num(r ? st.nominal / r : 0, 2)}</div><div class="small muted">Kurs dipakai: 1 ${st.mu} = Rp ${fmtKurs(r)}</div>`;
  st.neg = $('#kjNeg').value;
  const h = hitungItem({ negara: st.neg, hargaAsli: angkaHarga($('#kjHarga').value, muOf(st.neg)), qty: $('#kjQty').value });
  const a = aturanJasa(st.neg);
  $('#kjOut').innerHTML = `<div class="row-x"><span>Harga IDR (${fmtAsli(h.mataUang, h.hargaAsli)} × ${h.qty})</span><b class="num">${rp(h.hargaIDR * h.qty)}</b></div><div class="row-x"><span>Jasa titip (${a.tipe === 'persen' ? a.nilai + '%' : rp(a.nilai)}${a.minimal ? ', min ' + rpShort(a.minimal) : ''})</span><b class="num">${rp(h.jasaIDR)}</b></div><div class="total"><span>Harga jual ke customer</span><b class="num">${rp(h.subtotal)}</b></div>`;
}
ACT.kursRefresh = async b => {
  setBusy(b, true, 'Mengambil…');
  const r = await api('kurs.refresh');
  setBusy(b, false);
  if (r.success) { S.boot.kurs = r.data; toast('Kurs diperbarui dari ' + r.data.sumber + '.', 'success'); updateKursChrome(); delete $('#v-a-kurs').dataset.ready; rerender(); } else toast(r.message, 'error');
};
async function loadKursHist() {
  if (!S.ui.kursHist) { const r = await api('kurs.riwayat', {}, { silent: true }); if (r.success) S.ui.kursHist = r.data; }
  const h = S.ui.kursHist || [];
  const note = $('#kursHistNote'); if (!note) return;
  if (h.length < 2) { note.textContent = 'Riwayat kurs akan terbentuk otomatis setiap jam (trigger kurs).'; return; }
  note.textContent = 'Riwayat ' + h.length + ' hari terakhir · indeks (hari pertama = 100) agar keempat mata uang bisa dibandingkan.';
  const c = chartColors(); const cols = { JPY: c.primary, SGD: c.coral, MYR: c.sky, THB: c.mint };
  makeChart('chKurs', { type: 'line', data: { labels: h.map(x => tglPendek(x.tanggal)), datasets: ['JPY', 'SGD', 'MYR', 'THB'].map(m => ({ label: m, data: h.map(x => h[0][m] ? x[m] / h[0][m] * 100 : 100), borderColor: cols[m], tension: .35, pointRadius: 0, borderWidth: 2.5 })) },
    options: { plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: x => ' ' + x.dataset.label + ': Rp ' + fmtKurs(h[x.dataIndex][x.dataset.label]) } } }, scales: { y: { ticks: { callback: v => num(v, 1) } } } } });
}

// ════════════════════════════════════════════════════════
// BAGIAN 22: PANEL — INVOICE & CETAK PDF
// ════════════════════════════════════════════════════════
ROUTES['a-invoice'] = { shell: 'adm', title: 'Invoice', r: aInvoice, perm: 'invoice' };
let _pInv = null;
function aInvoice(el) {
  const st = S.ui.inv || (S.ui.inv = { tab: 'terbit', q: '', status: '', sel: null });
  const q = (st.q || '').toLowerCase();
  const terbit = ordersSorted().filter(o => o.InvoiceID && invById(o.InvoiceID));
  const belum = ordersSorted().filter(o => !o.InvoiceID && o.Status !== 'Batal');
  const src = st.tab === 'terbit' ? terbit : belum;
  const list = src.filter(o => (!q || (o.NoOrder + ' ' + o.CustomerNama + ' ' + ((invById(o.InvoiceID) || {}).NoInvoice || '')).toLowerCase().includes(q)) && (!st.status || (st.status === 'Unpaid' ? o.StatusBayar === 'Belum Lunas' : o.StatusBayar === st.status)));
  if (!st.sel || !list.some(o => o.ID === st.sel)) st.sel = list[0] ? list[0].ID : null;
  const o = st.sel ? orderById(st.sel) : null;
  const inv = o && o.InvoiceID ? invById(o.InvoiceID) : null;
  const cnt = s => terbit.filter(x => s === 'Unpaid' ? x.StatusBayar === 'Belum Lunas' : x.StatusBayar === s).length;
  el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Penagihan</span><h1>Invoice & Penagihan Resmi</h1><p>Invoice PDF otomatis tersimpan di Google Drive dan bisa dikirim lewat WhatsApp atau email.</p></div>
    <div class="actions">${o ? `<button class="btn btn-light" data-act="printInvoice" data-id="${o.ID}"><i class="bi bi-printer"></i>Cetak</button>${inv ? `<button class="btn btn-light" data-act="invKirim" data-id="${inv.ID}" data-via="email"><i class="bi bi-envelope"></i>Kirim Email</button><button class="btn btn-wa" data-act="invKirim" data-id="${inv.ID}" data-via="wa"><i class="bi bi-whatsapp"></i>Kirim WhatsApp</button>${can('pembayaran') && o.Sisa > 0 ? `<button class="btn btn-coral" data-act="invLunas" data-id="${inv.ID}"><i class="bi bi-check2-circle"></i>Tandai Lunas</button>` : ''}<button class="btn btn-primary" data-act="invPdf" data-id="${inv.ID}"><i class="bi bi-download"></i>Unduh PDF Resmi</button>` : `<button class="btn btn-primary" data-act="issueInvoice" data-id="${o.ID}"><i class="bi bi-file-earmark-plus"></i>Terbitkan Invoice</button>`}` : ''}</div></div>
  <div class="tabs-x"><button class="chip ${st.tab === 'terbit' ? 'on' : ''}" data-act="invTab" data-t="terbit"><i class="bi bi-file-earmark-check"></i>Sudah terbit<span class="count">${terbit.length}</span></button><button class="chip ${st.tab === 'belum' ? 'on' : ''}" data-act="invTab" data-t="belum"><i class="bi bi-file-earmark"></i>Belum diterbitkan<span class="count">${belum.length}</span></button></div>
  <div class="row g-4"><div class="col-xl-4"><div class="cardx" style="position:sticky;top:88px"><div class="cardx-head"><div><h3>Daftar tagihan</h3><div class="cardx-sub">${list.length} dokumen</div></div></div><div class="cardx-body">
      <div class="input-icon mb-2"><i class="bi bi-search"></i><input class="form-control" id="invQ" placeholder="INV/JST/… atau nama" value="${esc(st.q)}" aria-label="Cari invoice"></div>
      ${st.tab === 'terbit' ? `<div class="chips mb-3">${[['', 'Semua', terbit.length], ['Unpaid', 'Unpaid', cnt('Unpaid')], ['DP', 'DP', cnt('DP')], ['Lunas', 'Lunas', cnt('Lunas')]].map(([v, t, n]) => `<button class="chip ${st.status === v ? 'on' : ''}" style="min-height:32px;padding:4px 10px" data-act="invStatus" data-v="${v}">${t} (${n})</button>`).join('')}</div>` : ''}
      <div style="max-height:62vh;overflow:auto;margin:0 -6px;padding:0 6px">${(_pInv = potongDaftar('inv-' + st.tab, list)).tampil.map(x => { const iv = invById(x.InvoiceID); return `<div class="ord-card cardx ${x.ID === st.sel ? 'on' : ''}" data-act="invSel" data-id="${x.ID}" role="button" tabindex="0" style="box-shadow:none"><div class="d-flex justify-content-between gap-2"><b class="${x.ID === st.sel ? 'ink' : ''}">${esc(iv ? iv.NoInvoice : x.NoOrder)}</b>${statusBayarPill(x)}</div><div class="fw-bold">${esc(x.CustomerNama)}</div><div class="d-flex justify-content-between align-items-end mt-1"><div><div class="small-caps">Total tagihan</div><b class="num" style="color:${x.Sisa > 0 ? 'var(--danger)' : 'var(--text)'}">${rp(x.Total)}</b></div><span class="small muted">${flag(x.Negara)} ${iv ? 'JT ' + tglPendek(iv.JatuhTempo) : tglPendek(x.Tanggal)}</span></div></div>`; }).join('') || emptyState('bi-receipt', 'Tidak ada invoice', '')}${tombolLagi(_pInv)}</div>
      <div class="tint p-3 mt-2 d-flex align-items-center gap-3"><span class="kpi-ic coral" style="width:36px;height:36px"><i class="bi bi-piggy-bank"></i></span><div><small class="muted">Total piutang belum selesai</small><b class="d-block num">${rp(sum(terbit.filter(x => x.Sisa > 0 && x.Status !== 'Batal'), 'Sisa'))}</b></div></div>
    </div></div></div>
    <div class="col-xl-8">${o ? invoicePaper(o, { dokumen: true }) + (jasaGabung() ? '<div class="small muted mt-2"><i class="bi bi-eye"></i> Tampilan seperti yang diterima member: jasa titip sudah digabung ke harga barang (Pengaturan → Jasa titip & kurir).</div>' : '') + `<div class="tint p-3 mt-3 small d-flex gap-2 align-items-center flex-wrap"><i class="bi bi-clock-history"></i>${inv ? `Invoice terbit ${tgl(inv.Tanggal)}${inv.TerkirimVia ? ' · terkirim via ' + esc(inv.TerkirimVia) + ' ' + relatif(inv.TerkirimPada) : ' · belum dikirim'}${inv.PdfFileId ? ' · PDF tersimpan di Drive' : ''}` : 'Invoice belum diterbitkan. Klik "Terbitkan Invoice" untuk membuat PDF & nomor resmi.'}</div>` : `<div class="cardx">${emptyState('bi-file-earmark-text', 'Pilih tagihan', 'Pilih invoice di daftar sebelah kiri.')}</div>`}</div></div>`;
  $('#invQ').addEventListener('input', debounce(e => { st.q = e.target.value; rerender(); const x = $('#invQ'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 300));
}
ACT.invTab = b => { S.ui.inv.tab = b.dataset.t; S.ui.inv.sel = null; S.ui.inv.status = ''; rerender(); };
ACT.invStatus = b => { S.ui.inv.status = b.dataset.v; rerender(); };
ACT.invSel = b => { S.ui.inv.sel = b.dataset.id; rerender(); if (window.innerWidth < 1200) $('#invPaper')?.scrollIntoView({ behavior: 'smooth' }); };
ACT.issueInvoice = async b => {
  const o = orderById(b.dataset.id);
  const kirim = await new Promise(res => {
    modal({ title: 'Terbitkan invoice ' + o.NoOrder, body: `<p>Nomor invoice resmi & PDF dibuat lalu disimpan di Google Drive.</p><label class="form-check mb-2"><input class="form-check-input" type="checkbox" id="kWa" checked> Kirim ke WhatsApp ${esc(fmtHP(o.CustomerHP))}</label><label class="form-check"><input class="form-check-input" type="checkbox" id="kEm" ${(custById(o.CustomerID) || {}).Email ? 'checked' : 'disabled'}> Kirim ke email ${esc((custById(o.CustomerID) || {}).Email || '(tidak ada email)')}</label>`,
      foot: '<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnIssue"><i class="bi bi-file-earmark-check"></i>Terbitkan</button>' });
    let done = false;
    $('#btnIssue').onclick = () => { done = true; const via = []; if ($('#kWa').checked) via.push('wa'); if ($('#kEm').checked) via.push('email'); closeModal(); res(via); };
    $('#mdl').addEventListener('hidden.bs.modal', () => { if (!done) res(null); }, { once: true });
  });
  if (!kirim) return;
  // v1.3: WhatsApp menerima gambar invoice JPG — dibuat setelah nomor invoice terbit
  const viaWa = kirim.includes('wa');
  const res = await mutate('invoice.terbit', { orderId: o.ID, kirim: kirim.filter(v => v !== 'wa') }, { btn: b, busyLabel: 'Membuat PDF…', onOk: () => { S.ui.inv = Object.assign(S.ui.inv || {}, { tab: 'terbit', sel: o.ID }); if (S.route !== 'a-invoice') { closeDrawer(); go('a-invoice'); } } });
  if (res.success && viaWa) {
    const gambar = await siapkanGambarInvoice(orderById(o.ID) || o);
    await mutate('invoice.kirim', { id: res.data.id, via: 'wa', gambar, pdfUlang: false });
  }
};
ACT.invKirim = async b => {
  let gambar = null;
  if (b.dataset.via === 'wa') {
    const iv = invById(b.dataset.id); const o = iv && orderById(iv.OrderID);
    setBusy(b, true, 'Membuat gambar…');
    gambar = o ? await siapkanGambarInvoice(o) : null;
    setBusy(b, false);
  }
  await mutate('invoice.kirim', { id: b.dataset.id, via: b.dataset.via, gambar }, { btn: b, busyLabel: 'Mengirim…' });
};
ACT.invPdf = b => { const iv = invById(b.dataset.id); if (iv && iv.PdfFileId) preview({ fileId: iv.PdfFileId, nama: iv.NoInvoice + '.pdf' }); else toast('PDF belum tersedia. Terbitkan ulang invoice.', 'warning'); };
ACT.invLunas = b => {
  const iv = invById(b.dataset.id); const o = orderById(iv.OrderID);
  modal({ title: 'Tandai lunas ' + iv.NoInvoice, body: `<p>Sisa tagihan <b>${rp(o.Sisa)}</b> dicatat sebagai pembayaran terverifikasi.</p><label class="form-label" for="lunasW">Masuk ke dompet</label><select class="form-select" id="lunasW"><option value="">Pilih dompet…</option>${S.d.wallets.filter(w => w.Aktif !== false).map(w => `<option value="${w.ID}">${esc(w.Nama)}</option>`).join('')}</select>`,
    foot: '<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-success" id="btnLunas"><i class="bi bi-check2-circle"></i>Tandai lunas</button>' });
  $('#btnLunas').onclick = async e => {
    const w = $('#lunasW').value; if (!w) return toast('Pilih dompet penerima.', 'warning');
    const pid = uid();
    await mutate('invoice.lunas', { id: iv.ID, walletId: w, paymentId: pid }, { btn: e.currentTarget, optimistic: () => [upsertLocal('orders', { ID: o.ID, Dibayar: o.Total, Sisa: 0, StatusBayar: 'Lunas' }), upsertLocal('invoices', { ID: iv.ID, Status: 'Lunas' })], onOk: closeModal });
  };
};

// ════════════════════════════════════════════════════════
// BAGIAN 23: PANEL — PENGINGAT TAGIHAN
// ════════════════════════════════════════════════════════
ROUTES['a-pengingat'] = { shell: 'adm', title: 'Pengingat Tagihan', r: aPengingat, perm: 'pengingat' };
let _pRem = null;
function aPengingat(el, p, re) {
  const st = S.ui.rem || (S.ui.rem = { sel: new Set(), filter: 'semua' });
  const s = sett(); const today = ymd();
  const unpaid = ordersSorted().filter(o => o.Sisa > 0 && o.Status !== 'Batal');
  const jt = o => { const iv = o.InvoiceID ? invById(o.InvoiceID) : null; return iv ? iv.JatuhTempo : ''; };
  const due = unpaid.filter(o => jt(o) && jt(o) <= today);
  const list = st.filter === 'jatuh' ? due : st.filter === 'tanpa' ? unpaid.filter(o => !o.InvoiceID) : unpaid;
  const logs = (S.d.reminders || []).slice().sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal))).slice(0, 12);
  const settingsOpen = !re || !el.dataset.ready;
  el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Penagihan</span><h1>Pengingat Tagihan</h1><p>Pengingat otomatis dikirim setiap hari pukul 09.00 ke customer yang belum lunas, dan berhenti sendiri setelah lunas.</p></div>
    <div class="actions"><button class="btn btn-primary" data-act="remSend" ${st.sel.size ? '' : 'disabled'}><i class="bi bi-send"></i>Kirim pengingat (${st.sel.size})</button></div></div>
  <div class="kpi-grid mb-4">${kpi('bi-receipt', 'danger', 'Total piutang', rp(sum(unpaid, 'Sisa')), unpaid.length + ' pesanan belum lunas', '', 'danger')}${kpi('bi-alarm', 'coral', 'Lewat jatuh tempo', due.length + ' tagihan', rp(sum(due, 'Sisa')))}${kpi('bi-send-check', 'mint', 'Pengingat terkirim', (S.d.reminders || []).filter(r => r.Status === 'Terkirim').length, '365 hari terakhir')}${kpi('bi-gear', '', 'Status otomatis', s.reminderAktif ? 'Aktif' : 'Nonaktif', 'Tiap ' + (s.reminderInterval || 1) + ' hari · ' + (s.reminderChannel || []).map(x => x.toUpperCase()).join(' & '))}</div>
  <div class="row g-4"><div class="col-xl-8"><div class="cardx"><div class="cardx-head"><h3>Tagihan belum lunas</h3><div class="chips">${[['semua', 'Semua', unpaid.length], ['jatuh', 'Jatuh tempo', due.length], ['tanpa', 'Belum ada invoice', unpaid.filter(o => !o.InvoiceID).length]].map(([v, t, n]) => `<button class="chip ${st.filter === v ? 'on' : ''}" style="min-height:32px;padding:4px 12px" data-act="remFilter" data-v="${v}">${t} (${n})</button>`).join('')}</div></div>
    <div class="cardx-body"><div class="tbl-wrap">${list.length ? `<table class="tbl"><thead><tr><th style="width:40px"><input type="checkbox" class="form-check-input" data-act="remAll" aria-label="Pilih semua"></th><th>Pesanan</th><th>Customer</th><th class="r">Sisa</th><th>Jatuh tempo</th><th class="r">Pengingat</th><th>Aksi</th></tr></thead><tbody>
      ${(_pRem = potongDaftar('rem-' + st.filter, list)).tampil.map(o => { const j = jt(o); const lewat = j && j <= today; const msg = isi(s.reminderTemplate, { nama: o.CustomerNama, noOrder: o.NoOrder, sisa: rp(o.Sisa), total: rp(o.Total), jatuhTempo: j ? tgl(j) : 'secepatnya', app: s.appName, link: '' });
        return `<tr><td><input type="checkbox" class="form-check-input" data-act="remSel" data-id="${o.ID}" ${st.sel.has(o.ID) ? 'checked' : ''} aria-label="Pilih ${esc(o.NoOrder)}"></td><td><button class="link-btn" data-act="openOrder" data-id="${o.ID}">#${esc(o.NoOrder)}</button><span class="sub">${statusBayarPill(o)}</span></td><td><b>${esc(o.CustomerNama)}</b><span class="sub">${esc(fmtHP(o.CustomerHP))}</span></td><td class="r num"><b style="color:var(--danger)">${rp(o.Sisa)}</b></td>
          <td>${j ? `<span class="${lewat ? 'pill st-belum-lunas sm' : 'small'}">${lewat ? 'Lewat ' + Math.max(0, daysBetween(j, today)) + ' hari' : tgl(j)}</span>` : '<span class="small muted">Belum ada invoice</span>'}</td>
          <td class="r"><b>${o.JumlahPengingat || 0}×</b><span class="sub">${o.PengingatTerakhir ? relatif(o.PengingatTerakhir) : '-'}</span></td>
          <td class="nowrap"><button class="btn btn-sm btn-success" data-act="remOne" data-id="${o.ID}" aria-label="Kirim otomatis"><i class="bi bi-send"></i></button> <a class="btn btn-sm btn-wa" href="${waLink(o.CustomerHP, msg)}" target="_blank" rel="noopener" aria-label="Buka WhatsApp manual"><i class="bi bi-whatsapp"></i></a></td></tr>`; }).join('')}${tombolLagi(_pRem, 7)}</tbody></table>` : emptyState('bi-emoji-smile', 'Tidak ada tagihan', 'Semua pesanan sudah lunas.')}</div></div></div></div>
    <div class="col-xl-4">${can('pengingat') ? `<div class="cardx pad-lg mb-4"><b class="fs-5 d-block mb-3"><i class="bi bi-sliders me-2 ink"></i>Pengaturan pengingat</b>
      <form id="fRem"><label class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" name="reminderAktif" ${s.reminderAktif ? 'checked' : ''}> Pengingat otomatis aktif</label>
        <label class="form-label">Frekuensi</label><select class="form-select mb-3" name="reminderInterval">${[[1, 'Setiap hari'], [2, 'Setiap 2 hari'], [3, 'Setiap 3 hari'], [7, 'Setiap minggu']].map(([v, t]) => `<option value="${v}" ${Number(s.reminderInterval) === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <label class="form-label d-block">Kanal</label><div class="d-flex gap-3 mb-3"><label class="form-check"><input class="form-check-input" type="checkbox" data-multi="1" name="ch_wa" ${(s.reminderChannel || []).includes('wa') ? 'checked' : ''}> WhatsApp</label><label class="form-check"><input class="form-check-input" type="checkbox" data-multi="1" name="ch_email" ${(s.reminderChannel || []).includes('email') ? 'checked' : ''}> Email</label></div>
        <label class="form-label" for="remTpl">Template pesan</label><textarea class="form-control" id="remTpl" name="reminderTemplate" rows="5">${esc(s.reminderTemplate || '')}</textarea>
        <div class="d-flex gap-1 flex-wrap mt-2">${['{nama}', '{noOrder}', '{sisa}', '{total}', '{jatuhTempo}', '{link}', '{app}'].map(v => `<button type="button" class="tag border-0" data-act="insVar" data-v="${v}">${v}</button>`).join('')}</div>
        <button class="btn btn-primary w-100 mt-3" type="submit">Simpan pengaturan</button></form></div>` : ''}
      <div class="cardx pad"><b class="d-block mb-2">Log pengingat terbaru</b>${logs.map(r => `<div class="d-flex justify-content-between gap-2 py-2" style="border-bottom:1px solid var(--row-line)"><div class="min-w-0"><b class="small">${esc((orderById(r.OrderID) || {}).NoOrder || '-')}</b><div class="small muted clamp-1">${esc(r.Channel)}</div></div><div class="text-end">${pill(r.Status)}<div class="small muted">${relatif(r.Tanggal)}</div></div></div>`).join('') || '<p class="muted small mb-0">Belum ada pengingat dikirim.</p>'}</div></div></div>`;
  el.dataset.ready = '1';
  const f = $('#fRem');
  if (f) f.onsubmit = async e => {
    e.preventDefault(); const d = formData(f);
    const ch = []; if (d.ch_wa) ch.push('wa'); if (d.ch_email) ch.push('email');
    if (!ch.length) return toast('Pilih minimal satu kanal.', 'warning');
    const res = await mutate('settings.simpan', { values: { reminderAktif: !!d.reminderAktif, reminderInterval: Number(d.reminderInterval), reminderChannel: ch, reminderTemplate: d.reminderTemplate } }, { btn: f.querySelector('[type=submit]'), rerenderView: false });
    if (res.success) { S.settings = res.data.settings; rerender(); }
  };
  void settingsOpen;
}
const isi = (tpl, d) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => d[k] === undefined ? '' : d[k]);
ACT.insVar = b => { const t = $('#remTpl'); const p = t.selectionStart || t.value.length; t.value = t.value.slice(0, p) + b.dataset.v + t.value.slice(p); t.focus(); };
ACT.remFilter = b => { S.ui.rem.filter = b.dataset.v; rerender(); };
ACT.remSel = b => { const s = S.ui.rem.sel; b.checked ? s.add(b.dataset.id) : s.delete(b.dataset.id); const x = $('[data-act=remSend]'); x.disabled = !s.size; x.innerHTML = `<i class="bi bi-send"></i>Kirim pengingat (${s.size})`; };
ACT.remAll = b => { $$('[data-act=remSel]').forEach(c => { c.checked = b.checked; b.checked ? S.ui.rem.sel.add(c.dataset.id) : S.ui.rem.sel.delete(c.dataset.id); }); const x = $('[data-act=remSend]'); x.disabled = !S.ui.rem.sel.size; x.innerHTML = `<i class="bi bi-send"></i>Kirim pengingat (${S.ui.rem.sel.size})`; };
ACT.remSend = async b => { const ids = Array.from(S.ui.rem.sel); await mutate('reminder.kirim', { orderIds: ids }, { btn: b, busyLabel: 'Mengirim…', onOk: () => S.ui.rem.sel.clear() }); };
ACT.remOne = async b => { await mutate('reminder.kirim', { orderIds: [b.dataset.id] }, { btn: b, busyLabel: '' }); };

// ── v1.2: kelola jenis dompet (Super Admin & Owner) ──
function jenisRow(j) {
  return `<div class="jenis-row" data-lama="${esc(j.lama !== undefined ? j.lama : j.nama)}"><span class="jenis-ic" aria-hidden="true"><i class="bi ${esc(j.ikon || 'bi-wallet2')}"></i></span>
    <input class="form-control form-control-sm" data-j="nama" value="${esc(j.nama)}" maxlength="24" placeholder="Nama jenis" aria-label="Nama jenis dompet">
    <select class="form-select form-select-sm" data-j="ikon" aria-label="Ikon">${IKON_DOMPET.map(([v, t]) => `<option value="${v}" ${j.ikon === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <span class="small muted nowrap jenis-n">${j.nama ? S.d.wallets.filter(w => w.Jenis === (j.lama !== undefined ? j.lama : j.nama)).length + ' dompet' : 'baru'}</span>
    <button type="button" class="icon-btn sm" data-act="jenisDel" aria-label="Hapus jenis"><i class="bi bi-x-lg"></i></button></div>`;
}
ACT.jenisDompet = () => {
  modal({ title: 'Jenis dompet', body: `<p class="small muted mb-3">Jenis dipakai untuk mengelompokkan dompet (mis. Rekening, E-Wallet, Tunai). Mengganti nama jenis ikut memperbarui dompetnya. Jenis yang masih dipakai dompet tidak bisa dihapus.</p>
      <div id="jenisList">${jenisDompet().map(jenisRow).join('')}</div>
      <button type="button" class="btn btn-sm btn-soft mt-2" data-act="jenisAdd"><i class="bi bi-plus-lg"></i>Tambah jenis</button>`,
    foot: '<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnJenis"><i class="bi bi-check2"></i>Simpan jenis</button>' });
  $('#jenisList').addEventListener('change', e => { const sel = e.target.closest('[data-j=ikon]'); if (sel) sel.closest('.jenis-row').querySelector('.jenis-ic i').className = 'bi ' + sel.value; });
  $('#btnJenis').onclick = async e => {
    const list = $$('#jenisList .jenis-row').map(r => ({ lama: r.dataset.lama, nama: r.querySelector('[data-j=nama]').value.trim(), ikon: r.querySelector('[data-j=ikon]').value }));
    if (!list.length) return toast('Minimal harus ada satu jenis dompet.', 'warning');
    const kosong = list.findIndex(x => x.nama.length < 2);
    if (kosong > -1) { $$('#jenisList [data-j=nama]')[kosong].classList.add('is-invalid'); return toast('Nama jenis minimal 2 huruf.', 'warning'); }
    const res = await mutate('dompet.jenis', { list }, { btn: e.currentTarget, busyLabel: 'Menyimpan…', rerenderView: false });
    if (res.success) { S.settings = res.data.settings; closeModal(); rerender(); }
  };
};
ACT.jenisAdd = () => { $('#jenisList').insertAdjacentHTML('beforeend', jenisRow({ lama: '', nama: '', ikon: 'bi-wallet2' })); const r = $$('#jenisList .jenis-row').pop(); r.querySelector('[data-j=nama]').focus(); };
ACT.jenisDel = b => {
  const r = b.closest('.jenis-row'); const lama = r.dataset.lama;
  const n = lama ? S.d.wallets.filter(w => w.Jenis === lama).length : 0;
  if (n) return toast(`Jenis "${lama}" masih dipakai ${n} dompet. Ubah jenis dompet itu dulu, atau cukup ganti namanya.`, 'warning');
  r.remove();
};

// ════════════════════════════════════════════════════════
// BAGIAN 24b (v1.1): PANEL — VOUCHER & POIN MEMBER (Owner & Super Admin)
// ════════════════════════════════════════════════════════
ROUTES['a-voucher'] = { shell: 'adm', title: 'Voucher & Poin', r: aVoucher, perm: 'voucher.kelola' };
const STATUS_VC = { Aktif: 'aktif', Terpakai: 'selesai', Kedaluwarsa: 'batal', Nonaktif: 'nonaktif', 'Belum berlaku': 'akan-datang' };
function statusVoucher(v) {
  const t = ymd();
  if (v.Status === 'Aktif' && v.BerlakuSampai && ymd(v.BerlakuSampai) < t) return 'Kedaluwarsa';
  if (v.Status === 'Aktif' && v.BerlakuMulai && ymd(v.BerlakuMulai) > t) return 'Belum berlaku';
  return v.Status || 'Aktif';
}
const specVoucher = v => ({ kode: v.Kode, tipe: v.Tipe, nilai: v.Nilai, maksPotongan: v.MaksPotongan, minBelanja: v.MinBelanja });
function sisaHari(v) { const d = toDate(v); if (!d) return ''; const n = Math.ceil((new Date(ymd(d) + 'T23:59:59') - new Date()) / 864e5); return n < 0 ? '' : n === 0 ? 'berakhir hari ini' : n + ' hari lagi'; }

function aVoucher(el, p, re) {
  const st = S.ui.vc || (S.ui.vc = { tab: 'voucher', q: '', f: '' });
  const vs = S.d.vouchers || [];
  const cs = S.d.customers || [];
  const cfg = poinCfg();
  const hit = k => vs.filter(v => statusVoucher(v) === k);
  const terpakai = hit('Terpakai');
  const beredar = cs.reduce((a, c) => a + Math.max(0, Number(c.Poin) || 0), 0);
  const qFocus = document.activeElement && document.activeElement.id === 'vcQ';
  let body = '';
  if (st.tab === 'voucher') {
    const q = st.q.toLowerCase();
    const list = vs.filter(v => (!st.f || statusVoucher(v) === st.f) && (!q || (v.Kode + ' ' + (v.DipakaiNama || '') + ' ' + (v.DipakaiNoOrder || '') + ' ' + (v.Catatan || '')).toLowerCase().includes(q)))
      .sort((a, b) => String(b.Dibuat).localeCompare(String(a.Dibuat)));
    body = `<div class="cardx"><div class="filter-bar"><div class="input-icon grow"><i class="bi bi-search"></i><input class="form-control" id="vcQ" placeholder="Cari kode, customer, atau no. pesanan…" value="${esc(st.q)}"></div>
      <div class="chips">${[['', 'Semua'], ['Aktif', 'Aktif'], ['Terpakai', 'Terpakai'], ['Kedaluwarsa', 'Kedaluwarsa'], ['Nonaktif', 'Nonaktif']].map(([v, t]) => `<button class="chip ${st.f === v ? 'on' : ''}" data-act="vcFilter" data-v="${v}">${t}</button>`).join('')}</div></div>
      <div class="cardx-body pt-0">${vcBilahPilih(list)}<div class="tbl-wrap">${list.length ? `<table class="tbl tbl-vc"><thead><tr><th class="cek"><span class="visually-hidden">Pilih</span></th><th>Kode</th><th>Potongan</th><th class="r">Min. belanja</th><th>Masa berlaku</th><th>Status</th><th>Dipakai oleh</th><th></th></tr></thead><tbody>${list.map(v => {
        const s = statusVoucher(v); const bisa = s !== 'Terpakai';
        return `<tr class="${vcPilihSet().includes(v.ID) ? 'dipilih' : ''}">${vcCekBaris(v)}<td class="nowrap"><b class="mono">${esc(v.Kode)}</b> <button class="icon-btn sm" data-act="copy" data-text="${esc(v.Kode)}" aria-label="Salin kode ${esc(v.Kode)}"><i class="bi bi-copy"></i></button>${v.Catatan ? `<span class="sub clamp-1">${esc(v.Catatan)}</span>` : ''}</td>
          <td class="nowrap">${esc(labelVoucher(specVoucher(v)))}</td><td class="r num">${v.MinBelanja ? rp(v.MinBelanja) : '-'}</td>
          <td class="nowrap">${tglPendek(v.BerlakuMulai)} – ${tgl(v.BerlakuSampai)}${s === 'Aktif' ? `<span class="sub">${esc(sisaHari(v.BerlakuSampai))}</span>` : ''}</td>
          <td>${pill(s, STATUS_VC[s])}</td>
          <td>${v.DipakaiOrderID ? `<b>${esc(v.DipakaiNama || '-')}</b><span class="sub">${esc(v.DipakaiNoOrder || '')} · hemat ${rp(v.Potongan)}</span>` : '<span class="muted">—</span>'}</td>
          <td class="nowrap">${bisa ? `<div class="form-check form-switch d-inline-block align-middle me-1" title="Aktif / nonaktif"><input class="form-check-input" type="checkbox" data-act="vcToggle" data-id="${v.ID}" ${v.Status === 'Aktif' ? 'checked' : ''} aria-label="Aktifkan voucher ${esc(v.Kode)}"></div><button class="icon-btn sm" data-act="vcForm" data-id="${v.ID}" aria-label="Ubah"><i class="bi bi-pencil"></i></button><button class="icon-btn sm" data-act="vcHapus" data-id="${v.ID}" aria-label="Hapus"><i class="bi bi-trash3"></i></button>` : '<span class="small muted"><i class="bi bi-lock"></i> terkunci</span>'}</td></tr>`;
      }).join('')}</tbody></table>` : emptyState('bi-ticket-perforated', vs.length ? 'Tidak ada voucher yang cocok' : 'Belum ada voucher', vs.length ? 'Ubah kata kunci atau filter status.' : 'Buat kode voucher untuk potongan harga. Setiap kode hanya bisa dipakai satu kali.', vs.length ? '' : '<button class="btn btn-primary" data-act="vcForm">Buat voucher</button>')}</div></div></div>`;
  } else {
    const q = st.q.toLowerCase();
    const top = cs.filter(c => (Number(c.Poin) || 0) > 0 && (!q || (c.Nama + ' ' + c.HP).toLowerCase().includes(q))).sort((a, b) => (b.Poin || 0) - (a.Poin || 0)).slice(0, 50);
    const riwayat = (S.d.poin || []).slice().sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal))).slice(0, 40);
    body = `<div class="row g-4"><div class="col-xl-5"><div class="cardx pad-lg"><b class="fs-5 d-block mb-1">Aturan poin</b><p class="muted small">Poin masuk saat pesanan lunas dan ditarik lagi bila pesanan batal. Berlaku untuk pesanan sejak ${tgl(sett().poinMulai)}.</p>
        <form id="fPoin" class="row g-3"><div class="col-12"><label class="form-check form-switch"><input class="form-check-input" type="checkbox" name="poinAktif" ${cfg.aktif ? 'checked' : ''}> Sistem poin aktif</label></div>
          <div class="col-sm-6"><label class="form-label" for="pPer">Belanja per 1 poin (Rp)</label><input class="form-control" id="pPer" name="poinPerRupiah" inputmode="numeric" data-uang value="${num(cfg.per)}"></div>
          <div class="col-sm-6"><label class="form-label" for="pNil">Nilai 1 poin saat ditukar (Rp)</label><input class="form-control" id="pNil" name="poinNilai" inputmode="decimal" value="${String(cfg.nilai).replace('.', ',')}"></div>
          <div class="col-sm-6"><label class="form-label" for="pMin">Minimal poin terkumpul untuk ditukar</label><input class="form-control" id="pMin" name="poinMinTukar" inputmode="numeric" value="${num(cfg.min)}"></div>
          <div class="col-sm-6"><div class="small muted mb-1">Contoh</div><div class="tint p-2 px-3 small" id="pPrev"></div></div>
          <div class="col-sm-6"><label class="form-label" for="pUlas">Poin per barang yang diulas</label><input class="form-control" id="pUlas" name="poinUlasan" inputmode="numeric" value="${num(poinUlasan())}"><div class="form-text">Diberikan sekali per barang saat member mengulas pesanan Selesai. Isi 0 untuk mematikan.</div></div>
          <div class="col-12"><button class="btn btn-primary" type="submit"><i class="bi bi-check2"></i>Simpan aturan poin</button></div></form></div></div>
      <div class="col-xl-7"><div class="cardx mb-4"><div class="cardx-head"><h3>Saldo poin member</h3><div class="input-icon" style="max-width:240px"><i class="bi bi-search"></i><input class="form-control form-control-sm" id="vcQ" placeholder="Cari member…" value="${esc(st.q)}"></div></div><div class="cardx-body pt-0"><div class="tbl-wrap">${top.length ? `<table class="tbl"><thead><tr><th>Member</th><th class="r">Saldo poin</th><th class="r">≈ Nilai</th><th>Status</th></tr></thead><tbody>${top.map(c => `<tr><td><b>${esc(c.Nama)}</b><span class="sub">${esc(fmtHP(c.HP))}</span></td><td class="r num"><b>${num(c.Poin)}</b></td><td class="r num">${rp((c.Poin || 0) * cfg.nilai)}</td><td>${(c.Poin || 0) >= cfg.min ? pill('Bisa tukar', 'lunas') : `<span class="small muted">kurang ${num(cfg.min - (c.Poin || 0))}</span>`}</td></tr>`).join('')}</tbody></table>` : emptyState('bi-stars', 'Belum ada member berpoin', 'Poin muncul setelah pesanan member lunas.')}</div></div></div>
        <div class="cardx"><div class="cardx-head"><h3>Riwayat poin terbaru</h3></div><div class="cardx-body pt-0"><div class="tbl-wrap">${riwayat.length ? `<table class="tbl"><thead><tr><th>Tanggal</th><th>Member</th><th>Keterangan</th><th class="r">Poin</th></tr></thead><tbody>${riwayat.map(l => `<tr><td class="nowrap">${tglPendek(l.Tanggal)}</td><td>${esc(l.CustomerNama || '-')}</td><td><span class="clamp-1">${esc(l.Keterangan || l.Tipe)}</span></td><td class="r num"><b style="color:${l.Poin >= 0 ? 'var(--mint-ink)' : 'var(--danger)'}">${l.Poin >= 0 ? '+' : '−'}${num(Math.abs(l.Poin))}</b></td></tr>`).join('')}</tbody></table>` : '<div class="small muted p-2">Belum ada riwayat.</div>'}</div></div></div></div></div>`;
  }
  el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Promosi</span><h1>Voucher & Poin Member</h1><p>Kode voucher sekali pakai dan poin belanja yang bisa ditukar jadi potongan harga.</p></div>
    <div class="actions">${st.tab === 'voucher' ? '<button class="btn btn-soft" data-act="vcMassal"><i class="bi bi-stack"></i>Buat massal</button><button class="btn btn-primary" data-act="vcForm"><i class="bi bi-plus-lg"></i>Buat voucher</button>' : ''}</div></div>
  <div class="kpi-grid mb-4">${kpi('bi-ticket-perforated', '', 'Voucher aktif', num(hit('Aktif').length), 'siap dipakai member')}${kpi('bi-check2-circle', 'mint', 'Voucher terpakai', num(terpakai.length), 'hemat ' + rpShort(terpakai.reduce((a, v) => a + (Number(v.Potongan) || 0), 0)))}${kpi('bi-hourglass-bottom', 'coral', 'Kedaluwarsa', num(hit('Kedaluwarsa').length), 'tidak bisa dipakai')}${kpi('bi-stars', 'gold', 'Poin beredar', num(beredar), '≈ ' + rpShort(beredar * cfg.nilai))}</div>
  <div class="tabs-x">${[['voucher', 'bi-ticket-perforated', 'Voucher', vs.length], ['poin', 'bi-stars', 'Poin member', '']].map(([v, i, t, n]) => `<button class="chip ${st.tab === v ? 'on' : ''}" data-act="vcTab" data-t="${v}"><i class="bi ${i}"></i>${t}${n !== '' ? `<span class="count">${n}</span>` : ''}</button>`).join('')}</div>${body}`;
  const qi = $('#vcQ');
  if (qi) { qi.addEventListener('input', debounce(e => { st.q = e.target.value; rerender(); }, 250)); if (qFocus) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); } }
  const fp = $('#fPoin');
  if (fp) {
    const prev = () => { const per = toNum(fp.poinPerRupiah.value) || 1000, nil = toFloat(fp.poinNilai.value) || 1, min = toNum(fp.poinMinTukar.value); $('#pPrev').innerHTML = `Belanja ${rp(1000000)} → <b>${num(Math.floor(1000000 / per))} poin</b>. ${num(min)} poin = potongan <b>${rp(min * nil)}</b>.`; };
    fp.addEventListener('input', prev); prev();
    fp.onsubmit = async e => {
      e.preventDefault();
      const values = { poinAktif: fp.poinAktif.checked, poinPerRupiah: toNum(fp.poinPerRupiah.value), poinNilai: toFloat(fp.poinNilai.value), poinMinTukar: toNum(fp.poinMinTukar.value), poinUlasan: toNum(fp.poinUlasan.value) };
      if (values.poinPerRupiah < 1) return toast('Belanja per 1 poin minimal Rp 1.', 'warning');
      if (!(values.poinNilai > 0)) return toast('Nilai 1 poin harus lebih dari Rp 0.', 'warning');
      const res = await mutate('settings.simpan', { values }, { btn: fp.querySelector('[type=submit]'), rerenderView: false });
      if (res.success) { S.settings = res.data.settings; Object.keys(values).forEach(k => { S.boot.settings[k] = S.settings[k]; }); rerender(); }
    };
  }
}
ACT.vcTab = b => { S.ui.vc.tab = b.dataset.t; S.ui.vc.q = ''; rerender(); };
ACT.vcFilter = b => { S.ui.vc.f = b.dataset.v; rerender(); };
function tambahBulan(ymdStr, n) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const awal = new Date(y, m - 1 + n, 1); const akhir = new Date(awal.getFullYear(), awal.getMonth() + 1, 0).getDate();
  return ymd(new Date(awal.getFullYear(), awal.getMonth(), Math.min(d, akhir)));
}
ACT.vcForm = b => {
  const v = b && b.dataset.id ? (S.d.vouchers || []).find(x => x.ID === b.dataset.id) : null;
  const mulai = v ? ymd(v.BerlakuMulai) : ymd();
  const f = { tipe: v ? v.Tipe : 'nominal' };
  modal({ title: v ? 'Ubah voucher ' + v.Kode : 'Buat voucher', body: `<form id="fVc" class="row g-3" novalidate>
      <div class="col-12"><label class="form-label" for="vcKode">Kode voucher</label><input class="form-control mono" id="vcKode" name="kode" maxlength="24" value="${esc(v ? v.Kode : '')}" placeholder="Kosongkan untuk kode otomatis, mis. JST7K2QM9" style="text-transform:uppercase" autocomplete="off"><div class="form-text">Huruf, angka, atau tanda minus (4–24 karakter). Satu kode hanya bisa dipakai satu kali.</div></div>
      <div class="col-12"><span class="form-label d-block">Jenis potongan</span><div class="seg-x" role="radiogroup" aria-label="Jenis potongan"><button type="button" class="${f.tipe === 'persen' ? '' : 'on'}" data-vtipe="nominal" role="radio" aria-checked="${f.tipe !== 'persen'}"><i class="bi bi-cash"></i>Potongan Rupiah</button><button type="button" class="${f.tipe === 'persen' ? 'on' : ''}" data-vtipe="persen" role="radio" aria-checked="${f.tipe === 'persen'}"><i class="bi bi-percent"></i>Diskon persen</button></div></div>
      <div class="col-sm-6"><label class="form-label" for="vcNilai" id="vcNilaiLbl">${f.tipe === 'persen' ? 'Diskon (%)' : 'Potongan (Rp)'} <span class="req">*</span></label><input class="form-control" id="vcNilai" name="nilai" inputmode="decimal" data-uang="vc" value="${v ? (v.Tipe === 'persen' ? String(v.Nilai).replace('.', ',') : num(v.Nilai)) : ''}"></div>
      <div class="col-sm-6" id="vcMaksBox" style="${f.tipe === 'persen' ? '' : 'display:none'}"><label class="form-label" for="vcMaks">Maks. potongan (Rp)</label><input class="form-control" id="vcMaks" name="maksPotongan" inputmode="numeric" data-uang value="${v && v.MaksPotongan ? num(v.MaksPotongan) : ''}" placeholder="Tanpa batas"></div>
      <div class="col-sm-6"><label class="form-label" for="vcMin">Minimal belanja (Rp)</label><input class="form-control" id="vcMin" name="minBelanja" inputmode="numeric" data-uang value="${v && v.MinBelanja ? num(v.MinBelanja) : ''}" placeholder="Tanpa minimal"></div>
      <div class="col-sm-6"><label class="form-label" for="vcMulai">Berlaku mulai</label><input class="form-control" id="vcMulai" name="berlakuMulai" type="date" value="${mulai}"></div>
      <div class="col-sm-6"><label class="form-label" for="vcSampai">Berlaku sampai</label><input class="form-control" id="vcSampai" name="berlakuSampai" type="date" value="${v ? ymd(v.BerlakuSampai) : tambahBulan(mulai, 1)}"><div class="d-flex gap-2 mt-1 flex-wrap">${[['2 minggu', 0.5], ['1 bulan', 1], ['3 bulan', 3]].map(([t, n]) => `<button type="button" class="link-btn small" data-vdur="${n}">${t}</button>`).join('')}</div></div>
      <div class="col-12"><label class="form-label" for="vcCat">Catatan (opsional)</label><input class="form-control" id="vcCat" name="catatan" maxlength="200" value="${esc(v ? v.Catatan || '' : '')}" placeholder="Contoh: promo pelanggan setia Desember"></div>
    </form>`,
    foot: `<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnVc"><i class="bi bi-check2"></i>${v ? 'Simpan perubahan' : 'Buat voucher'}</button>` });
  const fm = $('#fVc');
  $$('[data-vtipe]', fm).forEach(x => x.onclick = () => {
    f.tipe = x.dataset.vtipe;
    $$('[data-vtipe]', fm).forEach(y => { y.classList.toggle('on', y === x); y.setAttribute('aria-checked', y === x); });
    $('#vcNilaiLbl').innerHTML = (f.tipe === 'persen' ? 'Diskon (%)' : 'Potongan (Rp)') + ' <span class="req">*</span>';
    $('#vcMaksBox').style.display = f.tipe === 'persen' ? '' : 'none';
  });
  $$('[data-vdur]', fm).forEach(x => x.onclick = () => { const m = fm.berlakuMulai.value || ymd(); const n = Number(x.dataset.vdur); fm.berlakuSampai.value = n < 1 ? ymd(new Date(new Date(m + 'T12:00:00').getTime() + 14 * 864e5)) : tambahBulan(m, n); });
  $('#btnVc').onclick = async e => {
    clearErr(fm);
    const nilai = f.tipe === 'persen' ? toFloat(fm.nilai.value) : toNum(fm.nilai.value);
    if (!(nilai > 0)) return fieldErr(fm, 'nilai', 'Isi nilai potongan.');
    if (f.tipe === 'persen' && nilai > 100) return fieldErr(fm, 'nilai', 'Maksimal 100%.');
    if (fm.berlakuSampai.value && fm.berlakuMulai.value && fm.berlakuSampai.value < fm.berlakuMulai.value) return fieldErr(fm, 'berlakuSampai', 'Tidak boleh sebelum tanggal mulai.');
    const kode = fm.kode.value.trim().toUpperCase();
    if (kode && !/^[A-Z0-9-]{4,24}$/.test(kode)) return fieldErr(fm, 'kode', 'Huruf, angka, atau tanda minus; 4–24 karakter.');
    const res = await mutate('voucher.simpan', { id: v ? v.ID : '', kode, tipe: f.tipe, nilai, maksPotongan: toNum(fm.maksPotongan.value), minBelanja: toNum(fm.minBelanja.value), berlakuMulai: fm.berlakuMulai.value, berlakuSampai: fm.berlakuSampai.value, catatan: fm.catatan.value.trim(), status: v ? v.Status : 'Aktif' },
      { btn: e.currentTarget, busyLabel: 'Menyimpan…', onOk: closeModal });
    if (res.success && !v && res.data && res.data.kode) { try { await navigator.clipboard.writeText(res.data.kode); toast('Kode ' + res.data.kode + ' disalin. Bagikan ke member.', 'info'); } catch (er) { /* clipboard opsional */ } }
  };
};
ACT.vcToggle = async b => {
  const v = (S.d.vouchers || []).find(x => x.ID === b.dataset.id); const on = b.checked;
  await mutate('voucher.status', { id: v.ID, aktif: on }, { optimistic: () => upsertLocal('vouchers', { ID: v.ID, Status: on ? 'Aktif' : 'Nonaktif' }) });
};
ACT.vcHapus = async b => {
  const v = (S.d.vouchers || []).find(x => x.ID === b.dataset.id);
  if (!(await confirmDlg({ title: 'Hapus voucher ' + v.Kode + '?', text: 'Kode ini tidak bisa dipakai lagi. Voucher yang sudah dipakai tidak bisa dihapus.', ok: 'Hapus', danger: true }))) return;
  await mutate('voucher.hapus', { id: v.ID }, { optimistic: () => removeLocal('vouchers', v.ID) });
};

// ── v1.2: voucher massal sekali pakai ──
ACT.vcMassal = () => {
  const mulai = ymd();
  const f = { tipe: 'nominal' };
  modal({ title: 'Buat voucher massal', body: `<form id="fVm" class="row g-3" novalidate>
      <div class="col-12"><div class="note-box mt-0"><i class="bi bi-stack"></i><div>Buat banyak kode sekaligus dengan aturan yang sama. <b>Setiap kode hanya bisa dipakai satu kali</b> oleh satu pesanan.</div></div></div>
      <div class="col-sm-5"><label class="form-label" for="vmJml">Jumlah kode <span class="req">*</span></label><input class="form-control" id="vmJml" name="jumlah" type="number" min="2" max="500" value="20"><div class="form-text">2–500 kode.</div></div>
      <div class="col-sm-7"><label class="form-label" for="vmAwal">Awalan kode (opsional)</label><input class="form-control mono" id="vmAwal" name="awalan" maxlength="10" placeholder="Contoh: LEBARAN" style="text-transform:uppercase" autocomplete="off"><div class="form-text" id="vmContoh"></div></div>
      <div class="col-12"><span class="form-label d-block">Jenis potongan</span><div class="seg-x" role="radiogroup" aria-label="Jenis potongan"><button type="button" class="on" data-vmtipe="nominal" role="radio" aria-checked="true"><i class="bi bi-cash"></i>Potongan Rupiah</button><button type="button" data-vmtipe="persen" role="radio" aria-checked="false"><i class="bi bi-percent"></i>Diskon persen</button></div></div>
      <div class="col-sm-6"><label class="form-label" for="vmNilai" id="vmNilaiLbl">Potongan (Rp) <span class="req">*</span></label><input class="form-control" id="vmNilai" name="nilai" inputmode="decimal" data-uang="vc"></div>
      <div class="col-sm-6" id="vmMaksBox" style="display:none"><label class="form-label" for="vmMaks">Maks. potongan (Rp)</label><input class="form-control" id="vmMaks" name="maksPotongan" inputmode="numeric" data-uang placeholder="Tanpa batas"></div>
      <div class="col-sm-6"><label class="form-label" for="vmMin">Minimal belanja (Rp)</label><input class="form-control" id="vmMin" name="minBelanja" inputmode="numeric" data-uang placeholder="Tanpa minimal"></div>
      <div class="col-sm-6"><label class="form-label" for="vmMulai">Berlaku mulai</label><input class="form-control" id="vmMulai" name="berlakuMulai" type="date" value="${mulai}"></div>
      <div class="col-sm-6"><label class="form-label" for="vmSampai">Berlaku sampai</label><input class="form-control" id="vmSampai" name="berlakuSampai" type="date" value="${tambahBulan(mulai, 1)}"><div class="d-flex gap-2 mt-1 flex-wrap">${[['2 minggu', 0.5], ['1 bulan', 1], ['3 bulan', 3]].map(([t, n]) => `<button type="button" class="link-btn small" data-vmdur="${n}">${t}</button>`).join('')}</div></div>
      <div class="col-12"><label class="form-label" for="vmCat">Catatan / nama kampanye</label><input class="form-control" id="vmCat" name="catatan" maxlength="160" placeholder="Contoh: Promo Harbolnas 12.12"><div class="form-text">Ketik catatan ini di kolom cari untuk menemukan semua kode dari kampanye yang sama.</div></div>
    </form>`,
    foot: '<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnVm"><i class="bi bi-stack"></i>Buat voucher</button>' });
  const fm = $('#fVm');
  const contoh = () => { const a = fm.awalan.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); const n = Math.max(0, Math.min(500, Number(fm.jumlah.value) || 0)); $('#vmContoh').textContent = 'Contoh kode: ' + (a ? a + '-' : 'JST') + (n > 200 ? '7KQ2M9X' : '7KQ2M9'); $('#btnVm').innerHTML = `<i class="bi bi-stack"></i>Buat ${n || ''} voucher`; };
  fm.addEventListener('input', contoh); contoh();
  $$('[data-vmtipe]', fm).forEach(x => x.onclick = () => {
    f.tipe = x.dataset.vmtipe;
    $$('[data-vmtipe]', fm).forEach(y => { y.classList.toggle('on', y === x); y.setAttribute('aria-checked', y === x); });
    $('#vmNilaiLbl').innerHTML = (f.tipe === 'persen' ? 'Diskon (%)' : 'Potongan (Rp)') + ' <span class="req">*</span>';
    $('#vmMaksBox').style.display = f.tipe === 'persen' ? '' : 'none';
  });
  $$('[data-vmdur]', fm).forEach(x => x.onclick = () => { const m = fm.berlakuMulai.value || ymd(); const n = Number(x.dataset.vmdur); fm.berlakuSampai.value = n < 1 ? ymd(new Date(new Date(m + 'T12:00:00').getTime() + 14 * 864e5)) : tambahBulan(m, n); });
  $('#btnVm').onclick = async e => {
    clearErr(fm);
    const jumlah = Number(fm.jumlah.value) || 0;
    if (jumlah < 2 || jumlah > 500) return fieldErr(fm, 'jumlah', 'Isi 2–500 kode.');
    const nilai = f.tipe === 'persen' ? toFloat(fm.nilai.value) : toNum(fm.nilai.value);
    if (!(nilai > 0)) return fieldErr(fm, 'nilai', 'Isi nilai potongan.');
    if (f.tipe === 'persen' && nilai > 100) return fieldErr(fm, 'nilai', 'Maksimal 100%.');
    if (fm.berlakuSampai.value && fm.berlakuMulai.value && fm.berlakuSampai.value < fm.berlakuMulai.value) return fieldErr(fm, 'berlakuSampai', 'Tidak boleh sebelum tanggal mulai.');
    const data = { jumlah, awalan: fm.awalan.value.trim(), tipe: f.tipe, nilai, maksPotongan: toNum(fm.maksPotongan.value), minBelanja: toNum(fm.minBelanja.value), berlakuMulai: fm.berlakuMulai.value, berlakuSampai: fm.berlakuSampai.value, catatan: fm.catatan.value.trim() };
    const res = await mutate('voucher.massal', data, { btn: e.currentTarget, busyLabel: 'Membuat ' + jumlah + ' kode…', rerenderView: false });
    if (res.success) { S.ui.vc.f = ''; S.ui.vc.q = ''; rerender(); vcMassalHasil(res.data, data); }
  };
};
function vcMassalHasil(r, d) {
  const spec = { tipe: d.tipe, nilai: d.nilai, maksPotongan: d.maksPotongan };
  S.ui.vcMassal = { kode: r.kode, spec, minBelanja: d.minBelanja, sampai: r.berlakuSampai, catatan: d.catatan };
  modal({ title: r.jumlah + ' voucher siap dibagikan', body: `<div class="d-flex flex-wrap gap-2 mb-2 small"><span class="tag">${esc(labelVoucher(spec))}</span>${d.minBelanja ? `<span class="tag">min. belanja ${rpShort(d.minBelanja)}</span>` : ''}<span class="tag">berlaku s/d ${tgl(r.berlakuSampai)}</span><span class="tag">sekali pakai</span></div>
      <textarea class="form-control mono vm-codes" rows="10" readonly aria-label="Daftar kode voucher">${esc(r.kode.join('\n'))}</textarea>
      <div class="form-text">Satu kode per baris. Bagikan satu kode untuk satu member.</div>`,
    foot: '<button class="btn btn-light" data-act="vcMassalExcel"><i class="bi bi-file-earmark-excel"></i>Unduh Excel</button><button class="btn btn-primary" data-act="vcMassalSalin"><i class="bi bi-copy"></i>Salin semua kode</button>' });
}
ACT.vcMassalSalin = async () => {
  const k = (S.ui.vcMassal || {}).kode || [];
  try { await navigator.clipboard.writeText(k.join('\n')); toast(k.length + ' kode disalin.', 'success'); }
  catch (e) { const t = $('.vm-codes'); if (t) { t.focus(); t.select(); } toast('Tekan Ctrl+C untuk menyalin kode yang sudah dipilih.', 'info'); }
};
ACT.vcMassalExcel = () => {
  const m = S.ui.vcMassal; if (!m) return;
  exportExcel({ judul: 'Voucher Massal', periode: 'Berlaku s/d ' + tgl(m.sampai), nama: 'Voucher', kolom: [['No', 6, 'n'], ['Kode voucher', 22], ['Potongan', 28], ['Min. belanja', 16, 'rp'], ['Berlaku sampai', 16], ['Catatan', 30]],
    rows: m.kode.map((k, i) => [i + 1, k, labelVoucher(m.spec), m.minBelanja || 0, tgl(m.sampai), m.catatan || '']) });
};

// ════════════════════════════════════════════════════════
// BAGIAN 24: EKSPOR EXCEL (ExcelJS, dimuat hanya saat dibutuhkan) & CETAK
// ════════════════════════════════════════════════════════
const EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
let _excelLoading = null;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Gagal memuat pustaka ekspor. Periksa koneksi internet.')); document.head.appendChild(s); }); }
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
/** cfg: { judul, periode, nama, kolom: [[label, lebar, format]], rows, total, kpi: [[label, nilai]] } */
async function exportExcel(cfg) {
  try {
    toast('Menyiapkan file Excel…', 'info');
    if (!window.ExcelJS) { _excelLoading = _excelLoading || loadScript(EXCELJS_URL); await _excelLoading; }
    const s = sett();
    const P = (cssVar('--primary') || '#6C5CE7').replace('#', '').toUpperCase();
    const wb = new ExcelJS.Workbook(); wb.creator = s.appName || 'Jastica'; wb.created = new Date();
    const n = cfg.kolom.length;
    const ws = wb.addWorksheet(cfg.nama || 'Data', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: .4, right: .4, top: .5, bottom: .5, header: .2, footer: .2 } } });
    ws.columns = cfg.kolom.map(k => ({ width: k[1] || 14 }));
    ws.mergeCells(1, 1, 1, n);
    Object.assign(ws.getCell(1, 1), { value: (s.appName || 'Jastica') + ' — ' + cfg.judul });
    ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: 'FF' + P } };
    ws.getRow(1).height = 26;
    ws.mergeCells(2, 1, 2, n);
    ws.getCell(2, 1).value = 'Periode: ' + cfg.periode + '   ·   Dibuat ' + tglJam(new Date()) + ' oleh ' + (S.me ? S.me.nama : '-');
    ws.getCell(2, 1).font = { size: 10, color: { argb: 'FF6B6885' } };
    let r = 4;
    if (cfg.kpi && cfg.kpi.length) {
      const per = Math.max(1, Math.floor(n / cfg.kpi.length));
      cfg.kpi.forEach(([label, val], i) => {
        const c1 = 1 + i * per, c2 = Math.min(n, c1 + per - 1);
        if (c2 > c1) { ws.mergeCells(r, c1, r, c2); ws.mergeCells(r + 1, c1, r + 1, c2); }
        const a = ws.getCell(r, c1), b = ws.getCell(r + 1, c1);
        a.value = String(label).toUpperCase(); a.font = { size: 9, bold: true, color: { argb: 'FF6B6885' } };
        b.value = val; b.font = { size: 13, bold: true, color: { argb: 'FF1F1B3A' } };
        if (typeof val === 'number') b.numFmt = '"Rp" #,##0';
        [a, b].forEach(x => { x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F3FF' } }; x.alignment = { vertical: 'middle', indent: 1 }; });
      });
      r += 3;
    }
    const head = ws.getRow(r);
    cfg.kolom.forEach((k, i) => { const c = head.getCell(i + 1); c.value = k[0]; c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + P } }; c.alignment = { vertical: 'middle', horizontal: ['rp', 'n', 'n2'].includes(k[2]) ? 'right' : 'left', indent: 1 }; c.border = { bottom: { style: 'thin', color: { argb: 'FF' + P } } }; });
    head.height = 24;
    const headRow = r;
    ws.views = [{ state: 'frozen', ySplit: headRow }];
    const fmt = { rp: '"Rp" #,##0', n: '#,##0', n2: '#,##0.00' };
    cfg.rows.forEach(row => {
      r++;
      const x = ws.getRow(r);
      row.forEach((v, i) => { const c = x.getCell(i + 1); c.value = v === undefined || v === null ? '' : v; const f = cfg.kolom[i][2]; if (fmt[f]) { c.numFmt = fmt[f]; c.alignment = { horizontal: 'right' }; } c.border = { bottom: { style: 'hair', color: { argb: 'FFEAE6F8' } } }; c.font = { size: 10 }; });
    });
    if (cfg.rows.length) ws.autoFilter = { from: { row: headRow, column: 1 }, to: { row: r, column: n } };
    if (cfg.total) {
      r++;
      const x = ws.getRow(r);
      cfg.total.forEach((v, i) => { const c = x.getCell(i + 1); c.value = v; c.font = { bold: true, size: 11 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F3FF' } }; c.border = { top: { style: 'medium', color: { argb: 'FF' + P } } }; const f = cfg.kolom[i][2]; if (fmt[f] && typeof v === 'number') { c.numFmt = fmt[f]; c.alignment = { horizontal: 'right' }; } });
    }
    r += 2;
    ws.mergeCells(r, 1, r, n);
    ws.getCell(r, 1).value = 'Dokumen ini dibuat otomatis oleh ' + (s.appName || 'Jastica') + '.';
    ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: 'FF6B6885' } };
    const buf = await wb.xlsx.writeBuffer();
    const fname = (s.appName || 'Jastica') + '_' + slug(cfg.judul) + '_' + String(cfg.periode).replace(/[^\w-]+/g, '_') + '.xlsx';
    downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname);
    toast('File Excel siap: ' + fname, 'success');
  } catch (e) { console.error(e); toast('Ekspor gagal: ' + e.message, 'error'); }
}

// ════════════════════════════════════════════════════════
// BAGIAN 25: PANEL — LAPORAN & EKSPOR (rentang tanggal interaktif)
// ════════════════════════════════════════════════════════
ROUTES['a-laporan'] = { shell: 'adm', title: 'Laporan', r: aLaporan, perm: 'laporan' };
const PRESET = {
  hari: () => [ymd(), ymd()], '7': () => [addDays(ymd(), -6), ymd()], bulan: () => monthRange(0), lalu: () => monthRange(-1),
  tahun: () => [new Date().getFullYear() + '-01-01', ymd()]
};
function lapPeriodeTeks(a, b) { return a === b ? tgl(a) : tgl(a) + ' – ' + tgl(b); }
function aLaporan(el, p, re) {
  const st = S.ui.lap || (S.ui.lap = { preset: 'bulan', dari: monthRange(0)[0], sampai: monthRange(0)[1], tab: 'penjualan', q: '', page: 1, remote: null });
  if (re && el.dataset.ready) { renderLapBody(); return; }
  el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Analitik</span><h1>Laporan & Ekspor</h1><p>Grafik dan tabel per rentang tanggal. Ekspor ke Excel atau cetak/PDF dengan tampilan seperti di layar.</p></div>
    <div class="actions"><button class="btn btn-soft" data-act="lapExcel"><i class="bi bi-file-earmark-excel"></i>Ekspor Excel</button><button class="btn btn-primary" data-act="lapPrint"><i class="bi bi-printer"></i>Ekspor PDF / Cetak</button></div></div>
  <div class="cardx pad mb-3"><div class="d-flex gap-3 flex-wrap align-items-center">
    <div class="input-icon" style="min-width:280px"><i class="bi bi-calendar-range"></i><input class="form-control fp-input" id="lapRange" readonly aria-label="Rentang tanggal laporan" value="${esc(lapPeriodeTeks(st.dari, st.sampai))}"></div>
    <div class="seg">${[['hari', 'Hari ini'], ['7', '7 hari'], ['bulan', 'Bulan ini'], ['lalu', 'Bulan lalu'], ['tahun', 'Tahun ini']].map(([v, t]) => `<button class="${st.preset === v ? 'on' : ''}" data-act="lapPreset" data-v="${v}">${t}</button>`).join('')}</div>
    <span class="small muted ms-auto" id="lapSrc"></span></div></div>
  <div class="tabs-x" id="lapTabs"></div>
  <div id="lapBody"></div>`;
  el.dataset.ready = '1';
  let coba = 0;
  const initFp = () => {
    if (!window.flatpickr) {
      if (++coba < 40) return setTimeout(initFp, 120);
      // Cadangan bila pustaka kalender gagal dimuat: dua input tanggal bawaan browser
      const box = $('#lapRange') && $('#lapRange').parentElement;
      if (!box) return;
      box.outerHTML = `<div class="d-flex gap-2 align-items-center"><input type="date" class="form-control" id="lapDari" value="${st.dari}" max="${ymd()}" aria-label="Dari tanggal"><span class="muted">s/d</span><input type="date" class="form-control" id="lapSampai" value="${st.sampai}" max="${ymd()}" aria-label="Sampai tanggal"></div>`;
      const upd = () => { const a = $('#lapDari').value, b = $('#lapSampai').value; if (a && b && a <= b) { st.dari = a; st.sampai = b; st.preset = 'kustom'; $$('[data-act=lapPreset]').forEach(x => x.classList.remove('on')); lapApply(); } };
      $('#lapDari').onchange = upd; $('#lapSampai').onchange = upd;
      return;
    }
    if (window.flatpickr.l10ns && window.flatpickr.l10ns.id) flatpickr.localize(flatpickr.l10ns.id);
    flatpickr('#lapRange', { mode: 'range', showMonths: window.innerWidth > 768 ? 2 : 1, dateFormat: 'Y-m-d', defaultDate: [st.dari, st.sampai], maxDate: addDays(ymd(), 0),
      onClose: d => { if (d.length === 2) { st.dari = ymd(d[0]); st.sampai = ymd(d[1]); st.preset = 'kustom'; $$('[data-act=lapPreset]').forEach(x => x.classList.remove('on')); lapApply(); } },
      onReady: (_, __, fp) => { fp.input.value = lapPeriodeTeks(st.dari, st.sampai); } });
  };
  initFp();
  lapApply();
}
ACT.lapPreset = b => { const st = S.ui.lap; st.preset = b.dataset.v; [st.dari, st.sampai] = PRESET[b.dataset.v](); $$('[data-act=lapPreset]').forEach(x => x.classList.toggle('on', x === b)); const i = $('#lapRange'); if (i && i._flatpickr) i._flatpickr.setDate([st.dari, st.sampai]); if (i) i.value = lapPeriodeTeks(st.dari, st.sampai); if ($('#lapDari')) { $('#lapDari').value = st.dari; $('#lapSampai').value = st.sampai; } lapApply(); };
ACT.lapTab = b => { S.ui.lap.tab = b.dataset.t; S.ui.lap.page = 1; S.ui.lap.q = ''; renderLapBody(); };
async function lapApply() {
  const st = S.ui.lap; st.page = 1;
  const batas = addDays(ymd(), -364);
  if (st.dari >= batas) { st.remote = null; $('#lapSrc').innerHTML = '<i class="bi bi-lightning-charge"></i> Data lokal (instan)'; renderLapBody(); return; }
  $('#lapBody').innerHTML = `<div class="kpi-grid mb-4">${'<div class="cardx kpi"><div class="sk" style="height:44px;width:44px"></div><div class="sk" style="height:20px;width:70%"></div><div class="sk" style="height:26px;width:90%"></div></div>'.repeat(4)}</div><div class="cardx pad"><div class="sk" style="height:280px"></div></div>`;
  $('#lapSrc').innerHTML = '<span class="spin d-inline-block" style="width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></span> Mengambil arsip dari server…';
  const r = await api('report.range', { dari: st.dari, sampai: st.sampai });
  if (!r.success) { toast(r.message, 'error'); return; }
  st.remote = r.data;
  $('#lapSrc').innerHTML = '<i class="bi bi-cloud-check"></i> Arsip server';
  renderLapBody();
}
function lapSource() {
  const st = S.ui.lap;
  if (st.remote) return st.remote;
  const f = arr => arr.filter(x => inRange(x.Tanggal, st.dari, st.sampai));
  return { orders: f(S.d.orders), purchases: f(S.d.purchases), expenses: f(S.d.expenses), payments: f(S.d.payments), transactions: f(S.d.transactions) };
}
function daysOf(a, b) { const out = []; for (let d = a; d <= b && out.length < 400; d = addDays(d, 1)) out.push(d); return out; }
function lapBuild() {
  const st = S.ui.lap; const D = lapSource();
  const orders = D.orders.filter(o => o.Status !== 'Batal');
  let days = daysOf(st.dari, st.sampai);
  const by = (arr, key, val) => { const m = {}; arr.forEach(x => { const k = typeof key === 'function' ? key(x) : x[key]; m[k] = (m[k] || 0) + (typeof val === 'function' ? val(x) : Number(x[val]) || 0); }); return m; };
  const c = chartColors();
  // Rentang > 62 hari dikelompokkan per bulan agar grafik tetap terbaca
  const bulanan = days.length > 62;
  const kb = v => bulanan ? ymd(v).slice(0, 7) : ymd(v);
  const keys = Array.from(new Set(days.map(kb)));
  const lbl = keys.map(k => bulanan ? BULAN[Number(k.slice(5)) - 1] + ' ' + k.slice(2, 4) : tglPendek(k));
  const lblRow = k => bulanan ? BULAN_PANJANG[Number(k.slice(5)) - 1] + ' ' + k.slice(0, 4) : tgl(k);
  const satuan = bulanan ? 'bulanan' : 'harian';
  days = keys;
  const omD = by(orders, o => kb(o.Tanggal), 'Total');
  if (st.tab === 'penjualan') {
    const status = by(D.orders, 'Status', () => 1);
    return {
      judul: 'Laporan Penjualan',
      kpi: [['Jumlah pesanan', orders.length + ' pesanan', D.orders.length - orders.length + ' batal'], ['Omzet', rp(sum(orders, 'Total')), 'Termasuk jasa & ongkir'], ['Jasa titip', rp(sum(orders, 'JasaTitip')), 'Pendapatan jasa'], ['Rata-rata pesanan', rp(sum(orders, 'Total') / Math.max(1, orders.length)), 'Per transaksi']],
      kpiX: [['Pesanan', orders.length], ['Omzet', sum(orders, 'Total')], ['Jasa titip', sum(orders, 'JasaTitip')], ['Sisa tagihan', sum(orders, 'Sisa')]],
      charts: [
        { id: 'lapC1', title: 'Omzet ' + satuan, cfg: { type: 'bar', data: { labels: lbl, datasets: [{ label: 'Omzet', data: days.map(d => omD[d] || 0), backgroundColor: c.primary, borderRadius: 8, maxBarThickness: 26 }] }, options: { scales: { y: { ticks: { callback: rpTick } }, x: { ticks: { maxTicksLimit: 10 } } }, plugins: { tooltip: { callbacks: { label: x => ' ' + rp(x.raw) } } } } } },
        { id: 'lapC2', title: 'Status pesanan', cfg: { type: 'doughnut', data: { labels: Object.keys(status), datasets: [{ data: Object.values(status), backgroundColor: Object.keys(status).map(s => ({ Baru: '#3B82F6', Dibeli: '#F59E0B', Dikirim: '#8B5CF6', Selesai: '#10B981', Batal: '#94A3B8' }[s] || c.primary)), borderWidth: 0 }] }, options: { cutout: '68%', plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } } } } }],
      kolom: [['No. Order', 15], ['Tanggal', 17], ['Customer', 24], ['Negara', 12], ['Status', 11], ['Bayar', 12], ['Total', 15, 'rp'], ['Dibayar', 15, 'rp'], ['Sisa', 15, 'rp']],
      rows: D.orders.slice().sort((a, b) => String(a.Tanggal).localeCompare(String(b.Tanggal))).map(o => [o.NoOrder, tglJam(o.Tanggal), o.CustomerNama, negara(o.Negara).nama, o.Status, o.StatusBayar, o.Total, o.Dibayar, o.Sisa]),
      total: ['TOTAL', orders.length + ' pesanan', '', '', '', '', sum(orders, 'Total'), sum(orders, 'Dibayar'), sum(orders, 'Sisa')]
    };
  }
  if (st.tab === 'keuntungan') {
    const beliD = by(D.purchases, x => kb(x.Tanggal), 'TotalIDR'), biayaD = by(D.expenses, x => kb(x.Tanggal), 'Jumlah'), nD = by(orders, o => kb(o.Tanggal), () => 1);
    const om = sum(orders, 'Total'), bl = sum(D.purchases, 'TotalIDR'), by_ = sum(D.expenses, 'Jumlah'), lb = om - bl - by_;
    return {
      judul: 'Laporan Keuntungan',
      kpi: [['Omzet', rp(om), orders.length + ' pesanan'], ['Pembelian barang', rp(bl), D.purchases.length + ' transaksi'], ['Biaya lain', rp(by_), D.expenses.length + ' catatan'], ['Laba bersih', rp(lb), 'Margin ' + (om ? num(lb / om * 100, 1) : 0) + '%']],
      kpiX: [['Omzet', om], ['Pembelian', bl], ['Biaya', by_], ['Laba bersih', lb]],
      charts: [
        { id: 'lapC1', title: 'Omzet vs laba bersih', cfg: { type: 'line', data: { labels: lbl, datasets: [{ label: 'Omzet', data: days.map(d => omD[d] || 0), borderColor: c.primary, backgroundColor: c.primary + '22', fill: true, tension: .35, pointRadius: 0, borderWidth: 3 }, { label: 'Laba', data: days.map(d => (omD[d] || 0) - (beliD[d] || 0) - (biayaD[d] || 0)), borderColor: c.coral, tension: .35, pointRadius: 0, borderWidth: 3 }] }, options: { plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: x => ' ' + x.dataset.label + ': ' + rp(x.raw) } } }, scales: { y: { ticks: { callback: rpTick } }, x: { ticks: { maxTicksLimit: 10 } } } } } },
        { id: 'lapC2', title: 'Komposisi omzet', cfg: { type: 'doughnut', data: { labels: ['Pembelian barang', 'Biaya lain', 'Laba bersih'], datasets: [{ data: [bl, by_, Math.max(0, lb)], backgroundColor: [c.sky, c.gold, c.mint], borderWidth: 0 }] }, options: { cutout: '68%', plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: x => ' ' + x.label + ': ' + rp(x.raw) } } } } } }],
      kolom: [[bulanan ? 'Bulan' : 'Tanggal', 16], ['Pesanan', 10, 'n'], ['Omzet', 17, 'rp'], ['Pembelian', 17, 'rp'], ['Biaya', 15, 'rp'], ['Laba bersih', 17, 'rp']],
      rows: days.filter(d => omD[d] || beliD[d] || biayaD[d]).map(d => [lblRow(d), nD[d] || 0, omD[d] || 0, beliD[d] || 0, biayaD[d] || 0, (omD[d] || 0) - (beliD[d] || 0) - (biayaD[d] || 0)]),
      total: ['TOTAL', orders.length, om, bl, by_, lb]
    };
  }
  if (st.tab === 'kas') {
    const tx = D.transactions.filter(t => t.RefTipe !== 'Transfer');
    const inD = by(tx.filter(t => t.Tipe === 'Masuk'), t => kb(t.Tanggal), 'Jumlah'), outD = by(tx.filter(t => t.Tipe === 'Keluar'), t => kb(t.Tanggal), 'Jumlah');
    const kat = by(tx.filter(t => t.Tipe === 'Keluar'), 'Kategori', 'Jumlah');
    const mIn = sum(tx.filter(t => t.Tipe === 'Masuk'), 'Jumlah'), mOut = sum(tx.filter(t => t.Tipe === 'Keluar'), 'Jumlah');
    return {
      judul: 'Laporan Arus Kas',
      kpi: [['Uang masuk', rp(mIn), 'Pembayaran customer'], ['Uang keluar', rp(mOut), 'Pembelian & biaya'], ['Arus kas bersih', rp(mIn - mOut), mIn - mOut >= 0 ? 'Surplus' : 'Defisit'], ['Jumlah mutasi', D.transactions.length + '', 'Termasuk transfer internal']],
      kpiX: [['Masuk', mIn], ['Keluar', mOut], ['Bersih', mIn - mOut], ['Mutasi', D.transactions.length]],
      charts: [
        { id: 'lapC1', title: 'Masuk vs keluar ' + satuan, cfg: { type: 'bar', data: { labels: lbl, datasets: [{ label: 'Masuk', data: days.map(d => inD[d] || 0), backgroundColor: c.mint, borderRadius: 6, maxBarThickness: 18 }, { label: 'Keluar', data: days.map(d => outD[d] || 0), backgroundColor: c.coral, borderRadius: 6, maxBarThickness: 18 }] }, options: { plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: x => ' ' + x.dataset.label + ': ' + rp(x.raw) } } }, scales: { y: { ticks: { callback: rpTick } }, x: { ticks: { maxTicksLimit: 10 } } } } } },
        { id: 'lapC2', title: 'Pengeluaran per kategori', cfg: { type: 'doughnut', data: { labels: Object.keys(kat), datasets: [{ data: Object.values(kat), backgroundColor: [c.primary, c.coral, c.gold, c.sky, c.mint, '#EC4899', '#94A3B8'], borderWidth: 0 }] }, options: { cutout: '68%', plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: x => ' ' + x.label + ': ' + rp(x.raw) } } } } } }],
      kolom: [['Tanggal', 17], ['Dompet', 20], ['Tipe', 9], ['Kategori', 20], ['Keterangan', 40], ['Masuk', 16, 'rp'], ['Keluar', 16, 'rp']],
      rows: D.transactions.slice().sort((a, b) => String(a.Tanggal).localeCompare(String(b.Tanggal))).map(t => [tglJam(t.Tanggal), (walletById(t.WalletID) || {}).Nama || '-', t.Tipe, t.Kategori, t.Keterangan, t.Tipe === 'Masuk' ? t.Jumlah : '', t.Tipe === 'Keluar' ? t.Jumlah : '']),
      total: ['TOTAL', '', '', '', '', sum(D.transactions.filter(t => t.Tipe === 'Masuk'), 'Jumlah'), sum(D.transactions.filter(t => t.Tipe === 'Keluar'), 'Jumlah')]
    };
  }
  if (st.tab === 'dompet') {
    const ws = S.d.wallets;
    const rows = ws.map(w => { const t = D.transactions.filter(x => x.WalletID === w.ID); const i = sum(t.filter(x => x.Tipe === 'Masuk'), 'Jumlah'), o = sum(t.filter(x => x.Tipe === 'Keluar'), 'Jumlah'); return [w.Nama, w.Jenis, i, o, i - o, S.saldo[w.ID] || 0]; });
    return {
      judul: 'Laporan per Dompet',
      kpi: [['Total saldo saat ini', rp(sum(ws, w => S.saldo[w.ID] || 0)), ws.length + ' dompet'], ['Masuk periode', rp(sum(rows, r => r[2])), ''], ['Keluar periode', rp(sum(rows, r => r[3])), ''], ['Bersih periode', rp(sum(rows, r => r[4])), '']],
      kpiX: [['Saldo', sum(ws, w => S.saldo[w.ID] || 0)], ['Masuk', sum(rows, r => r[2])], ['Keluar', sum(rows, r => r[3])], ['Bersih', sum(rows, r => r[4])]],
      charts: [
        { id: 'lapC1', title: 'Masuk & keluar per dompet', cfg: { type: 'bar', data: { labels: ws.map(w => w.Nama), datasets: [{ label: 'Masuk', data: rows.map(r => r[2]), backgroundColor: c.mint, borderRadius: 8 }, { label: 'Keluar', data: rows.map(r => r[3]), backgroundColor: c.coral, borderRadius: 8 }] }, options: { plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } }, scales: { y: { ticks: { callback: rpTick } } } } } },
        { id: 'lapC2', title: 'Sebaran saldo', cfg: { type: 'doughnut', data: { labels: ws.map(w => w.Nama), datasets: [{ data: ws.map(w => Math.max(0, S.saldo[w.ID] || 0)), backgroundColor: ws.map(w => w.Warna || c.primary), borderWidth: 0 }] }, options: { cutout: '68%', plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: x => ' ' + x.label + ': ' + rp(x.raw) } } } } } }],
      kolom: [['Dompet', 24], ['Jenis', 12], ['Masuk', 17, 'rp'], ['Keluar', 17, 'rp'], ['Bersih', 17, 'rp'], ['Saldo sekarang', 18, 'rp']],
      rows, total: ['TOTAL', '', sum(rows, r => r[2]), sum(rows, r => r[3]), sum(rows, r => r[4]), sum(rows, r => r[5])]
    };
  }
  const cs = countries();
  const rows = cs.map(cn => { const os = orders.filter(o => o.Negara === cn.kode); const bl = sum(D.purchases.filter(x => x.Negara === cn.kode), 'TotalIDR'); return [cn.nama, cn.mataUang, os.length, sum(os, 'Total'), sum(os, 'JasaTitip'), bl, sum(os, 'Total') - bl]; });
  const top = rows.slice().sort((a, b) => b[3] - a[3])[0];
  return {
    judul: 'Laporan per Negara',
    kpi: [['Negara teratas', top && top[3] ? top[0] : '-', top ? rp(top[3]) : ''], ['Total omzet', rp(sum(rows, r => r[3])), orders.length + ' pesanan'], ['Total jasa titip', rp(sum(rows, r => r[4])), ''], ['Total pembelian', rp(sum(rows, r => r[5])), '']],
    kpiX: [['Omzet', sum(rows, r => r[3])], ['Jasa', sum(rows, r => r[4])], ['Pembelian', sum(rows, r => r[5])], ['Margin kotor', sum(rows, r => r[6])]],
    charts: [
      { id: 'lapC1', title: 'Omzet per negara', cfg: { type: 'bar', data: { labels: rows.map(r => r[0]), datasets: [{ label: 'Omzet', data: rows.map(r => r[3]), backgroundColor: [c.gold, c.sky, c.coral, c.primary, c.mint], borderRadius: 10, maxBarThickness: 46 }] }, options: { scales: { y: { ticks: { callback: rpTick } } }, plugins: { tooltip: { callbacks: { label: x => ' ' + rp(x.raw) } } } } } },
      { id: 'lapC2', title: 'Jumlah pesanan', cfg: { type: 'doughnut', data: { labels: rows.map(r => r[0]), datasets: [{ data: rows.map(r => r[2]), backgroundColor: [c.gold, c.sky, c.coral, c.primary, c.mint], borderWidth: 0 }] }, options: { cutout: '68%', plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } } } } }],
    kolom: [['Negara', 16], ['Mata uang', 11], ['Pesanan', 10, 'n'], ['Omzet', 17, 'rp'], ['Jasa titip', 16, 'rp'], ['Pembelian', 17, 'rp'], ['Margin kotor', 17, 'rp']],
    rows, total: ['TOTAL', '', sum(rows, r => r[2]), sum(rows, r => r[3]), sum(rows, r => r[4]), sum(rows, r => r[5]), sum(rows, r => r[6])]
  };
}
function renderLapBody() {
  const st = S.ui.lap;
  const tabs = [['penjualan', 'bi-cart-check', 'Penjualan'], ['keuntungan', 'bi-graph-up-arrow', 'Keuntungan'], ['kas', 'bi-arrow-left-right', 'Arus Kas'], ['dompet', 'bi-wallet2', 'Per Dompet'], ['negara', 'bi-globe2', 'Per Negara']];
  $('#lapTabs').innerHTML = tabs.map(([v, i, t]) => `<button class="chip ${st.tab === v ? 'on' : ''}" data-act="lapTab" data-t="${v}"><i class="bi ${i}"></i>${t}</button>`).join('');
  const R = lapBuild();
  S.ui.lapR = R;
  const q = (st.q || '').toLowerCase();
  const rows = R.rows.filter(r => !q || r.join(' ').toLowerCase().includes(q));
  const per = 25, pages = Math.max(1, Math.ceil(rows.length / per)); st.page = Math.min(st.page, pages);
  const fmtCell = (v, f) => f === 'rp' ? (v === '' ? '' : rp(v)) : f === 'n' ? num(v) : f === 'n2' ? num(v, 2) : esc(v);
  const ics = [['bi-receipt', ''], ['bi-cash-coin', 'mint'], ['bi-bag', 'coral'], ['bi-graph-up', 'gold']];
  $('#lapBody').innerHTML = `<div class="kpi-grid mb-4">${R.kpi.map((k, i) => kpi(ics[i][0], ics[i][1], k[0], k[1], k[2])).join('')}</div>
    <div class="row g-4 mb-4"><div class="col-xl-8"><div class="cardx h-100"><div class="cardx-head"><h3>${esc(R.charts[0].title)}</h3><span class="cardx-sub">${esc(lapPeriodeTeks(st.dari, st.sampai))}</span></div><div class="cardx-body"><div class="chart-box"><canvas id="lapC1" role="img" aria-label="${esc(R.charts[0].title)}"></canvas></div></div></div></div>
      <div class="col-xl-4"><div class="cardx h-100"><div class="cardx-head"><h3>${esc(R.charts[1].title)}</h3></div><div class="cardx-body"><div class="chart-box"><canvas id="lapC2" role="img" aria-label="${esc(R.charts[1].title)}"></canvas></div></div></div></div></div>
    <div class="cardx"><div class="cardx-head"><div><h3>${esc(R.judul)}</h3><div class="cardx-sub">${rows.length} baris</div></div><div class="input-icon" style="min-width:260px"><i class="bi bi-search"></i><input class="form-control" id="lapQ" placeholder="Cari di tabel…" value="${esc(st.q)}" aria-label="Cari di tabel"></div></div>
      <div class="cardx-body"><div class="tbl-wrap">${rows.length ? `<table class="tbl"><thead><tr>${R.kolom.map(k => `<th class="${['rp', 'n', 'n2'].includes(k[2]) ? 'r' : ''}">${esc(k[0])}</th>`).join('')}</tr></thead><tbody>${rows.slice((st.page - 1) * per, st.page * per).map(r => `<tr>${r.map((v, i) => `<td class="${['rp', 'n', 'n2'].includes(R.kolom[i][2]) ? 'r num' : ''}">${fmtCell(v, R.kolom[i][2])}</td>`).join('')}</tr>`).join('')}</tbody>
        ${R.total ? `<tfoot><tr>${R.total.map((v, i) => `<td class="${['rp', 'n', 'n2'].includes(R.kolom[i][2]) ? 'r num' : ''}" style="font-weight:800;border-top:2px solid var(--text);padding:14px">${typeof v === 'number' ? fmtCell(v, R.kolom[i][2] || 'n') : esc(v)}</td>`).join('')}</tr></tfoot>` : ''}</table>` : emptyState('bi-bar-chart', 'Tidak ada data pada periode ini', 'Pilih rentang tanggal lain.')}</div></div>
      <div class="tbl-foot"><span>${lapPeriodeTeks(st.dari, st.sampai)}</span>${pager(st.page, pages, 'lapPage')}</div></div>`;
  R.charts.forEach(ch => makeChart(ch.id, ch.cfg));
  $('#lapQ').addEventListener('input', debounce(e => { st.q = e.target.value; st.page = 1; renderLapBody(); const x = $('#lapQ'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 300));
}
ACT.lapPage = b => { S.ui.lap.page = Number(b.dataset.page); renderLapBody(); };
ACT.lapExcel = () => { const st = S.ui.lap; const R = S.ui.lapR || lapBuild(); exportExcel({ judul: R.judul, periode: lapPeriodeTeks(st.dari, st.sampai), nama: R.judul.replace('Laporan ', ''), kolom: R.kolom, rows: R.rows, total: R.total, kpi: R.kpiX }); };
ACT.lapPrint = () => {
  const st = S.ui.lap; const R = S.ui.lapR || lapBuild(); const s = sett();
  const imgs = R.charts.map(ch => _charts[ch.id] ? `<img src="${_charts[ch.id].toBase64Image('image/png', 1)}" alt="${esc(ch.title)}">` : '').join('');
  const fmtCell = (v, f) => f === 'rp' ? (v === '' ? '' : rp(v)) : f === 'n' ? num(v) : f === 'n2' ? num(v, 2) : esc(v);
  $('#printArea').innerHTML = `<div class="pr-head"><div><div style="display:flex;align-items:center;gap:8px"><span class="brand-logo" style="width:34px;height:34px">${s.logoUrl ? `<img src="${esc(s.logoUrl)}" alt="">` : LOGO_SVG}</span><b style="font-size:18px">${esc(s.appName || 'Jastica')}</b></div><div style="color:#6B6885;font-size:10px;margin-top:4px">${esc(s.bizAlamat || '')} · WA ${esc(fmtHP(s.bizHP))}</div></div>
      <div style="text-align:right"><h1>${esc(R.judul)}</h1><div style="font-size:11px">Periode: <b>${esc(lapPeriodeTeks(st.dari, st.sampai))}</b></div><div style="font-size:10px;color:#6B6885">Dicetak ${tglJam(new Date())} oleh ${esc(S.me.nama)}</div></div></div>
    <div class="pr-kpi">${R.kpi.map(k => `<div><small>${esc(k[0])}</small><b>${esc(k[1])}</b><div style="font-size:9px;color:#6B6885">${esc(k[2] || '')}</div></div>`).join('')}</div>
    <div class="pr-charts">${imgs}</div>
    <table class="pr-table"><thead><tr>${R.kolom.map(k => `<th style="${['rp', 'n', 'n2'].includes(k[2]) ? 'text-align:right' : ''}">${esc(k[0])}</th>`).join('')}</tr></thead><tbody>${R.rows.map(r => `<tr>${r.map((v, i) => `<td style="${['rp', 'n', 'n2'].includes(R.kolom[i][2]) ? 'text-align:right' : ''}">${fmtCell(v, R.kolom[i][2])}</td>`).join('')}</tr>`).join('')}</tbody>
    ${R.total ? `<tfoot><tr>${R.total.map((v, i) => `<td style="font-weight:800;border-top:2px solid #1F1B3A;${['rp', 'n', 'n2'].includes(R.kolom[i][2]) ? 'text-align:right' : ''}">${typeof v === 'number' ? fmtCell(v, R.kolom[i][2] || 'n') : esc(v)}</td>`).join('')}</tr></tfoot>` : ''}</table>
    <div class="pr-foot">Laporan dibuat otomatis oleh ${esc(s.appName || 'Jastica')}. Simpan sebagai PDF melalui dialog cetak (Tujuan: Simpan sebagai PDF).</div>`;
  setTimeout(() => window.print(), 80);
};

// ════════════════════════════════════════════════════════
// BAGIAN 26: PANEL — KATALOG, TRIP, KONTEN LANDING
// ════════════════════════════════════════════════════════
ROUTES['a-katalog'] = { shell: 'adm', title: 'Katalog & Trip', r: aKatalog, perm: 'katalog.kelola' };
function aKatalog(el) {
  const st = S.ui.kk || (S.ui.kk = { tab: 'barang', q: '', neg: '' });
  const items = S.d.allItems.filter(i => (!st.neg || i.Negara === st.neg) && (!st.q || i.Nama.toLowerCase().includes(st.q.toLowerCase()))).sort((a, b) => (a.Urutan || 0) - (b.Urutan || 0));
  const trips = S.d.allTrips.slice().sort((a, b) => String(b.TglMulai).localeCompare(String(a.TglMulai)));
  const s = sett();
  const qFocus = document.activeElement && document.activeElement.id === 'kkQ';
  let body = '';
  if (st.tab === 'barang') body = `<div class="cardx"><div class="filter-bar"><div class="input-icon grow"><i class="bi bi-search"></i><input class="form-control" id="kkQ" placeholder="Cari barang…" value="${esc(st.q)}"></div><select class="form-select" style="max-width:180px" id="kkNeg"><option value="">Semua negara</option>${countries().map(c => `<option value="${c.kode}" ${st.neg === c.kode ? 'selected' : ''}>${esc(c.nama)}</option>`).join('')}</select></div>
    <div class="cardx-body pt-0"><div class="tbl-wrap">${items.length ? `<table class="tbl kat-tbl"><thead><tr><th>Barang</th><th>Negara</th><th class="r">Harga toko</th><th class="r">≈ IDR</th>${bolehHargaJual() ? '<th class="r">Harga jual</th>' : ''}<th class="r">Jasa titip</th><th>Stok · terjual</th><th>Populer</th><th>Tampil</th><th></th></tr></thead><tbody>${items.map(i => { const nf = fotoDaftar(i).length, nv = varianOf(i).length; return `<tr><td><div class="kat-barang">${prodImg(i, 'cart-thumb kat-thumb')}<div class="min-w-0"><b class="clamp-2">${esc(i.Nama)}</b><span class="sub">${[esc(i.Kategori || ''), nv ? nv + ' varian' : '', nf > 1 ? nf + ' foto' : ''].filter(Boolean).join(' · ')}</span></div></div></td><td>${negaraTag(i.Negara)}</td><td class="r num">${fmtAsli(i.MataUang, i.HargaAsli)}</td><td class="r num">${rp(hargaTampil(i))}</td>${bolehHargaJual() ? `<td class="r num">${selHargaJual(i)}</td>` : ''}<td class="r num">${selJasaItem(i)}</td><td>${selStok(i)}</td>
      <td><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-act="itemToggle" data-id="${i.ID}" data-f="promo" ${i.Promo ? 'checked' : ''} aria-label="Populer"></div></td><td><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-act="itemToggle" data-id="${i.ID}" data-f="aktif" ${i.Aktif ? 'checked' : ''} aria-label="Tampil"></div></td>
      <td class="nowrap"><button class="icon-btn sm" data-act="itemForm" data-id="${i.ID}" aria-label="Ubah"><i class="bi bi-pencil"></i></button><button class="icon-btn sm" data-act="itemHapus" data-id="${i.ID}" aria-label="Hapus"><i class="bi bi-trash3"></i></button></td></tr>`; }).join('')}</tbody></table>` : emptyState('bi-shop', 'Belum ada barang', 'Tambahkan barang yang tampil di landing page & katalog.', '<button class="btn btn-primary" data-act="itemForm">Tambah barang</button>')}</div></div></div>`;
  else if (st.tab === 'trip') body = `<div class="row g-3">${trips.map(t => `<div class="col-md-6 col-xl-4"><div class="position-relative">${tripCard(t)}<div class="position-absolute" style="right:12px;bottom:12px;display:none"></div></div><div class="d-flex gap-2 mt-2"><button class="btn btn-sm btn-light flex-fill" data-act="tripForm" data-id="${t.ID}"><i class="bi bi-pencil"></i>Ubah</button><button class="btn btn-sm btn-danger-soft" data-act="tripHapus" data-id="${t.ID}" aria-label="Hapus trip"><i class="bi bi-trash3"></i></button></div></div>`).join('') || `<div class="col-12"><div class="cardx">${emptyState('bi-airplane', 'Belum ada trip', 'Tambahkan jadwal kota jastip agar tampil di landing page.', '<button class="btn btn-primary" data-act="tripForm">Tambah trip</button>')}</div></div>`}</div>`;
  else if (st.tab === 'ulasan') body = tabUlasanAdmin(); // v1.3.4
  else body = `<div class="cardx pad-lg"><form id="fLanding" class="row g-3"><div class="col-12"><label class="form-label">Judul hero</label><input class="form-control" name="heroTitle" value="${esc(s.heroTitle || '')}" maxlength="120"></div>
      <div class="col-12"><label class="form-label">Subjudul hero</label><textarea class="form-control" name="heroSubtitle" rows="3" maxlength="400">${esc(s.heroSubtitle || '')}</textarea></div>
      <div class="col-12"><label class="form-label d-flex justify-content-between">Pertanyaan umum (FAQ)<button type="button" class="link-btn" data-act="faqAdd"><i class="bi bi-plus"></i> Tambah</button></label><div id="faqList">${(s.faq || []).map(faqRow).join('')}</div></div>
      <div class="col-12"><button class="btn btn-primary" type="submit"><i class="bi bi-check2"></i>Simpan konten landing</button> <button type="button" class="btn btn-light" data-go="home"><i class="bi bi-eye"></i>Lihat landing page</button></div></form></div>`;
  const mode = s.katalogMode || 'semua';
  const buka = negaraTerbuka();
  const aksesMember = `<div class="cardx pad-lg mb-4"><div class="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-2"><div><b class="fs-5 d-block">Katalog yang dibuka untuk member</b><span class="small muted">Menentukan negara yang tampil di katalog, request barang khusus, dan kalkulator portal member.</span></div>
      <div class="small">Saat ini dibuka: ${buka.map(k => `<span class="tag me-1">${flag(k)} ${esc(negara(k).nama)}</span>`).join('')}</div></div>
    <form id="fAkses"><div class="seg mb-3" role="radiogroup" aria-label="Mode katalog">${[['semua', 'Semua negara'], ['trip', 'Ikuti trip aktif'], ['manual', 'Pilih manual']].map(([v, t]) => `<button type="button" class="${mode === v ? 'on' : ''}" data-act="aksesMode" data-v="${v}" role="radio" aria-checked="${mode === v}">${t}</button>`).join('')}</div>
      <div id="aksesTrip" class="small muted mb-2" style="${mode === 'trip' ? '' : 'display:none'}"><i class="bi bi-info-circle"></i> Mengikuti trip berstatus <b>Aktif</b> di tab Jadwal trip. Jika tidak ada trip aktif, semua negara ditampilkan.</div>
      <div id="aksesManual" class="neg-pick mb-2" style="${mode === 'manual' ? '' : 'display:none'}">${countries().map(c => `<label><input type="checkbox" data-akses="${c.kode}" ${(s.katalogNegara || []).includes(c.kode) ? 'checked' : ''}> ${flag(c.kode)} ${esc(c.nama)}</label>`).join('')}</div>
      <button class="btn btn-primary btn-sm mt-1" type="submit"><i class="bi bi-check2"></i>Simpan akses katalog</button></form></div>`;
  el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Konten</span><h1>Katalog, Trip & Landing Page</h1><p>Atur barang promosi, jadwal kota jastip, dan teks landing page tanpa mengubah kode.</p></div>
    <div class="actions">${st.tab === 'barang' ? `<div class="foto-act" role="group" aria-label="Tambah barang dari foto"><label class="btn btn-soft" for="kkCam"><i class="bi bi-camera"></i>Foto barang</label><label class="btn btn-soft" for="kkUp"><i class="bi bi-image"></i>Unggah foto</label></div>
      <input type="file" id="kkCam" accept="image/*" capture="environment" class="visually-hidden" tabindex="-1"><input type="file" id="kkUp" accept="image/*" class="visually-hidden" tabindex="-1">
      <button class="btn btn-soft" data-act="imporExcel"><i class="bi bi-file-earmark-spreadsheet"></i>Impor Excel</button>
      <button class="btn btn-primary" data-act="itemForm"><i class="bi bi-plus-lg"></i>Tambah barang</button>` : st.tab === 'trip' ? '<button class="btn btn-primary" data-act="tripForm"><i class="bi bi-plus-lg"></i>Tambah trip</button>' : ''}</div></div>
  ${aksesMember}<div class="tabs-x">${[['barang', 'bi-bag', 'Barang katalog', S.d.allItems.length], ['trip', 'bi-airplane', 'Jadwal trip', S.d.allTrips.length], ['ulasan', 'bi-star', 'Ulasan', (S.d.reviews || []).length], ['landing', 'bi-layout-text-window', 'Konten landing', '']].map(([v, i, t, n]) => `<button class="chip ${st.tab === v ? 'on' : ''}" data-act="kkTab" data-t="${v}"><i class="bi ${i}"></i>${t}${n !== '' ? `<span class="count">${n}</span>` : ''}</button>`).join('')}</div>${body}`;
  S.ui.aksesMode = mode;
  ['kkCam', 'kkUp'].forEach(id => { const x = $('#' + id); if (x) x.onchange = () => { const f = x.files[0]; x.value = ''; if (f) itemDariFoto(f); }; });
  $('#fAkses').onsubmit = async e => {
    e.preventDefault();
    const m = S.ui.aksesMode; const neg = $$('[data-akses]:checked').map(x => x.dataset.akses);
    if (m === 'manual' && !neg.length) return toast('Pilih minimal satu negara yang dibuka.', 'warning');
    const res = await mutate('settings.simpan', { values: { katalogMode: m, katalogNegara: m === 'manual' ? neg : (s.katalogNegara || ['ID']) } }, { btn: e.target.querySelector('[type=submit]'), rerenderView: false });
    if (res.success) { S.settings = res.data.settings; Object.assign(S.boot.settings, { katalogMode: S.settings.katalogMode, katalogNegara: S.settings.katalogNegara }); ['home', 'katalog', 'keranjang'].forEach(v => { const x = $('#v-' + v); if (x) delete x.dataset.ready; }); rerender(); }
  };
  if ($('#kkQ')) { $('#kkQ').addEventListener('input', debounce(e => { st.q = e.target.value; rerender(); }, 250)); $('#kkNeg').onchange = e => { st.neg = e.target.value; rerender(); }; if (qFocus) { const q = $('#kkQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  const fl = $('#fLanding');
  if (fl) fl.onsubmit = async e => {
    e.preventDefault();
    const faq = $$('#faqList .faq-row').map(r => ({ q: r.querySelector('[data-q]').value.trim(), a: r.querySelector('[data-a]').value.trim() })).filter(x => x.q && x.a);
    const res = await mutate('settings.simpan', { values: { heroTitle: fl.heroTitle.value.trim(), heroSubtitle: fl.heroSubtitle.value.trim(), faq } }, { btn: fl.querySelector('[type=submit]'), rerenderView: false });
    if (res.success) { S.settings = res.data.settings; Object.assign(S.boot.settings, { heroTitle: S.settings.heroTitle, heroSubtitle: S.settings.heroSubtitle, faq: S.settings.faq }); delete $('#v-home').dataset.ready; }
  };
}
const faqRow = f => `<div class="faq-row tint p-2 mb-2 d-flex gap-2"><div class="flex-fill"><input class="form-control form-control-sm mb-1" data-q value="${esc(f.q)}" placeholder="Pertanyaan"><textarea class="form-control form-control-sm" data-a rows="2" placeholder="Jawaban" style="min-height:60px">${esc(f.a)}</textarea></div><button type="button" class="icon-btn sm" data-act="faqDel" aria-label="Hapus FAQ"><i class="bi bi-x-lg"></i></button></div>`;
ACT.faqAdd = () => $('#faqList').insertAdjacentHTML('beforeend', faqRow({ q: '', a: '' }));
ACT.faqDel = b => b.closest('.faq-row').remove();
ACT.kkTab = b => { S.ui.kk.tab = b.dataset.t; rerender(); };
ACT.aksesMode = b => {
  S.ui.aksesMode = b.dataset.v;
  $$('[data-act=aksesMode]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
  $('#aksesTrip').style.display = b.dataset.v === 'trip' ? '' : 'none'; $('#aksesManual').style.display = b.dataset.v === 'manual' ? '' : 'none';
};
function itemPayload(i, over) { return Object.assign({ id: i.ID, nama: i.Nama, kategori: i.Kategori, negara: i.Negara, hargaAsli: i.HargaAsli, deskripsi: i.Deskripsi, promo: !!i.Promo, aktif: !!i.Aktif, tripId: i.TripID, berat: i.Berat, urutan: i.Urutan }, over || {}); }
ACT.itemToggle = async b => {
  const i = S.d.allItems.find(x => x.ID === b.dataset.id); const f = b.dataset.f; const v = b.checked;
  await mutate('item.simpan', itemPayload(i, { [f]: v }), { quiet: true, optimistic: () => { const u = upsertLocal('allItems', { ID: i.ID, [f === 'promo' ? 'Promo' : 'Aktif']: v }); refreshBootLists(); return [u, refreshBootLists]; } });
};
ACT.itemForm = (b, pre) => {
  pre = pre && pre.foto ? pre : null;
  const i = b && b.dataset && b.dataset.id ? S.d.allItems.find(x => x.ID === b.dataset.id) : { Negara: 'JP', Aktif: true, Kategori: pre ? '' : 'Snack' };
  const kats = Array.from(new Set(S.d.allItems.map(x => x.Kategori).concat(Object.keys(KAT_IKON)))).filter(Boolean);
  modal({ title: i.ID ? 'Ubah barang' : 'Tambah barang katalog', size: 'lg', body: `<form id="fItem" class="row g-3" novalidate>
    ${pre ? '<div class="col-12"><div class="ai-banner" id="aiBanner" aria-live="polite"><span class="spin" aria-hidden="true"></span><div><b>Mengenali barang dari foto…</b><div class="small">Nama, kategori, dan negara diisi otomatis. Anda tetap bisa mengubahnya.</div></div></div></div>' : ''}
    <div class="col-sm-8"><label class="form-label">Nama barang <span class="req">*</span></label><input class="form-control" name="nama" value="${esc(i.Nama || '')}" ${pre ? 'placeholder="Menunggu hasil dari foto…"' : ''}></div>
    <div class="col-sm-4"><label class="form-label">Kategori</label><input class="form-control" name="kategori" list="katList" value="${esc(i.Kategori || '')}"><datalist id="katList">${kats.map(k => `<option value="${esc(k)}">`).join('')}</datalist></div>
    <div class="col-sm-4"><label class="form-label">Negara</label><select class="form-select" name="negara">${countries().map(c => `<option value="${c.kode}" ${i.Negara === c.kode ? 'selected' : ''}>${esc(c.nama)} (${c.mataUang})</option>`).join('')}</select></div>
    <div class="col-sm-4"><label class="form-label">Harga di toko <span class="req">*</span></label><div class="input-group"><span class="input-group-text" id="iMu">${muOf(i.Negara)}</span><input class="form-control" name="hargaAsli" inputmode="decimal" data-uang="mu" data-mu-dari="[name=negara]" value="${esc(i.HargaAsli || '')}"></div><div class="form-text" id="iIdr"></div></div>
    <div class="col-sm-4"><label class="form-label">Trip</label><select class="form-select" name="tripId"><option value="">-</option>${S.d.allTrips.map(t => `<option value="${t.ID}" ${i.TripID === t.ID ? 'selected' : ''}>${esc(t.Kota)}</option>`).join('')}</select></div>
    ${kotakHargaJual(i)}
    ${kotakVarianJasa(i)}
    <div class="col-12"><label class="form-label">Deskripsi</label><textarea class="form-control" name="deskripsi" rows="2">${esc(i.Deskripsi || '')}</textarea></div>
    <div class="col-sm-4"><label class="form-label" for="iStok">Sisa stok</label><input class="form-control" id="iStok" name="stok" inputmode="numeric" value="${esc(stokAwalForm(i))}" placeholder="Tidak dibatasi"><div class="form-text">Kosongkan bila tidak dibatasi (pre-order).</div></div>
    <div class="col-sm-4"><label class="form-label">Berat (kg)</label><input class="form-control" name="berat" inputmode="decimal" value="${esc(i.Berat || '')}"></div>
    <div class="col-sm-4"><label class="form-label">Urutan tampil</label><input class="form-control" name="urutan" type="number" value="${esc(i.Urutan || '')}"></div>
    <div class="col-12 d-flex flex-wrap gap-3"><label class="form-check form-switch"><input class="form-check-input" type="checkbox" name="promo" ${i.Promo ? 'checked' : ''}> Populer</label><label class="form-check form-switch"><input class="form-check-input" type="checkbox" name="aktif" ${i.Aktif !== false ? 'checked' : ''}> Tampil di katalog</label></div>
    ${galeriFormHtml()}
    <div class="col-md-6" id="iFotoUrlBox"><label class="form-label">…atau URL gambar</label><input class="form-control" name="fotoUrl" value="${esc(i.FotoFileId ? '' : (i.FotoURL || ''))}" placeholder="https://…">${!i.FotoFileId && i.FotoURL ? `<div class="mt-2">${prodImg(i, 'cart-thumb')}</div>` : ''}</div></form>`,
    foot: '<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnItem">Simpan</button>' });
  const f = $('#fItem');
  const prev = () => { const mu = muOf(f.negara.value); $('#iMu').textContent = mu; $('#iIdr').textContent = '≈ ' + rp(angkaHarga(f.hargaAsli.value, mu) * kursOf(mu)); infoHargaJual(f); infoJasaItem(f); };
  f.addEventListener('input', prev); f.addEventListener('change', prev); prev();
  galeriFormAwal(i); renderGaleriForm(); // v1.3.5: beberapa foto per barang, distandarkan persegi
  const stokAwal = stokAwalForm(i);
  if (pre) itemFormFoto(f, pre, kats);
  $('#btnItem').onclick = async e => {
    if (S.ui.galForm && S.ui.galForm.sibuk) return toast('Tunggu foto selesai diproses.', 'info');
    clearErr(f); const d = formData(f);
    const stokTeks = String(d.stok || '').trim();
    if (stokTeks && !(angkaUang(stokTeks) >= 0)) return fieldErr(f, 'stok', 'Isi angka sisa stok atau kosongkan.');
    if (!d.nama) return fieldErr(f, 'nama', 'Nama barang wajib diisi.');
    if (angkaHarga(d.hargaAsli, muOf(d.negara)) <= 0) return fieldErr(f, 'hargaAsli', 'Isi harga di toko.');
    const id = i.ID || uid();
    const vr = ambilVarianForm(f); // v1.3.5: varian & jasa titip per barang (Super Admin & Owner)
    if (vr.error) { toast(vr.error, 'warning'); if (vr.el) vr.el.focus(); return; }
    const payload = { id, nama: d.nama, kategori: d.kategori, negara: d.negara, hargaAsli: angkaHarga(d.hargaAsli, muOf(d.negara)), deskripsi: d.deskripsi, promo: d.promo, aktif: d.aktif, tripId: d.tripId, berat: toFloat(d.berat), urutan: Number(d.urutan) || 0 };
    const gal = payloadGaleri();
    if (gal !== undefined) { payload.galeri = gal; payload.fotoUrl = gal.length ? '' : d.fotoUrl; }
    else if (!S.ui.galForm.list.length && (d.fotoUrl || i.FotoURL)) payload.fotoUrl = d.fotoUrl;
    const hj = nilaiHargaJual(f); if (hj !== undefined) payload.hargaJual = hj; // v1.3.3: hanya Super Admin & Owner
    if (vr.list !== undefined) payload.varian = vr.list;
    const ji = nilaiJasaItem(f); if (ji !== undefined) payload.jasaItem = ji;
    const adaBaru = !!(gal && gal.some(x => x.file));
    const galLokal = gal && !adaBaru ? { FotoFileId: (gal[0] || {}).id || '', FotoLain: gal.length > 1 ? JSON.stringify(gal.slice(1).map(x => x.id)) : '', FotoURL: gal[0] ? driveImg(gal[0].id, 1200).replace(/=w1200$/, '') : d.fotoUrl } : {};
    if (stokTeks !== stokAwal) { payload.stok = stokTeks === '' ? '' : Math.max(0, Math.round(angkaUang(stokTeks))); const stb = S.boot.stat || (S.boot.stat = {}); stb[id] = Object.assign({ t: 0, r: 0, n: 0 }, stb[id], { s: payload.stok === '' ? null : payload.stok }); }
    await mutate('item.simpan', payload, { btn: e.currentTarget, busyLabel: adaBaru ? 'Mengunggah foto…' : 'Menyimpan…', optimistic: () => { const u = upsertLocal('allItems', Object.assign({}, i, { ID: id, Nama: d.nama, Kategori: d.kategori, Negara: d.negara, MataUang: muOf(d.negara), HargaAsli: payload.hargaAsli, Deskripsi: d.deskripsi, Promo: d.promo, Aktif: d.aktif, TripID: d.tripId, Urutan: payload.urutan }, hj !== undefined ? { HargaJual: hj } : {}, vr.list !== undefined ? { Varian: vr.list.length ? JSON.stringify(vr.list) : '' } : {}, ji !== undefined ? { JasaItem: ji } : {}, galLokal)); refreshBootLists(); return [u, refreshBootLists]; }, onOk: closeModal });
  };
};
ACT.itemHapus = async b => {
  if (!(await confirmDlg({ title: 'Hapus barang dari katalog?', text: 'Pesanan lama tidak terpengaruh. Untuk menyembunyikan sementara, matikan "Tampil".', ok: 'Hapus', danger: true }))) return;
  await mutate('item.hapus', { id: b.dataset.id }, { optimistic: () => { const u = removeLocal('allItems', b.dataset.id); refreshBootLists(); return [u, refreshBootLists]; } });
};
ACT.tripForm = b => {
  const t = b && b.dataset.id ? S.d.allTrips.find(x => x.ID === b.dataset.id) : { Negara: 'JP', Status: 'Akan Datang', TglMulai: addDays(ymd(), 14), TglSelesai: addDays(ymd(), 18) };
  modal({ title: t.ID ? 'Ubah trip' : 'Tambah trip', body: `<form id="fTrip" class="row g-3" novalidate>
    <div class="col-sm-6"><label class="form-label">Kota <span class="req">*</span></label><input class="form-control" name="kota" value="${esc(t.Kota || '')}" placeholder="Tokyo"></div>
    <div class="col-sm-6"><label class="form-label">Negara</label><select class="form-select" name="negara">${countries().map(c => `<option value="${c.kode}" ${t.Negara === c.kode ? 'selected' : ''}>${esc(c.nama)}</option>`).join('')}</select></div>
    <div class="col-sm-6"><label class="form-label">Tanggal mulai</label><input class="form-control" type="date" name="tglMulai" value="${esc(t.TglMulai || '')}"></div>
    <div class="col-sm-6"><label class="form-label">Tanggal selesai</label><input class="form-control" type="date" name="tglSelesai" value="${esc(t.TglSelesai || '')}"></div>
    <div class="col-sm-4"><label class="form-label">Status</label><select class="form-select" name="status">${['Akan Datang', 'Aktif', 'Selesai'].map(s => `<option ${t.Status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    <div class="col-sm-4"><label class="form-label">Kuota bagasi (kg)</label><input class="form-control" name="kuota" inputmode="decimal" value="${esc(t.Kuota || '')}"></div>
    <div class="col-sm-4"><label class="form-label">Terisi (kg)</label><input class="form-control" name="terisi" inputmode="decimal" value="${esc(t.Terisi || '')}"></div>
    <div class="col-sm-6"><label class="form-label">Shopper</label><input class="form-control" name="shopper" value="${esc(t.Shopper || '')}"></div>
    <div class="col-sm-6"><label class="form-label">Fokus belanja</label><input class="form-control" name="catatan" value="${esc(t.Catatan || '')}" placeholder="Ginza, Shibuya, Don Quijote"></div>
    <div class="col-12" id="tripErr" aria-live="polite"></div></form>`,
    foot: '<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnTrip">Simpan</button>' });
  // v1.3.2: simpan trip lebih tahan banting — tanggal dinormalkan ke yyyy-mm-dd (format browser apa pun), galat tampil di pop-up,
  // tombol Enter ikut menyimpan, dan bila koneksi putus setelah server menyimpan, data dicek ulang (tidak "gagal" palsu).
  const id = t.ID || uid();
  const simpanTrip = async btn => {
    const f = $('#fTrip'); if (!f || btn.disabled) return;
    const box = $('#tripErr'); clearErr(f); if (box) box.innerHTML = '';
    const d = formData(f);
    if (!d.kota) return fieldErr(f, 'kota', 'Isi nama kota.');
    const pola = polaTgl(d.tglMulai) || polaTgl(d.tglSelesai);
    const mulai = tglIso(d.tglMulai, pola), selesai = tglIso(d.tglSelesai, pola);
    if (!mulai) return fieldErr(f, 'tglMulai', 'Isi tanggal mulai yang valid.');
    if (!selesai) return fieldErr(f, 'tglSelesai', 'Isi tanggal selesai yang valid.');
    if (selesai < mulai) return fieldErr(f, 'tglSelesai', 'Tanggal selesai harus setelah tanggal mulai.');
    d.tglMulai = mulai; d.tglSelesai = selesai;
    d.id = id; d.kuota = toFloat(d.kuota); d.terisi = toFloat(d.terisi);
    let res;
    try {
      res = await mutate('trip.simpan', d, { btn, rerenderView: false, optimistic: () => { const u = upsertLocal('allTrips', { ID: id, Kota: d.kota, Negara: d.negara, TglMulai: d.tglMulai, TglSelesai: d.tglSelesai, Status: d.status, Kuota: d.kuota, Terisi: d.terisi, Shopper: d.shopper, Catatan: d.catatan }); refreshBootLists(); return [u, refreshBootLists]; }, onOk: () => { closeModal(); const h = $('#v-home'); if (h) delete h.dataset.ready; } });
    } catch (err) { console.error(err); setBusy(btn, false); res = { success: false, message: 'Terjadi kesalahan di aplikasi: ' + (err && err.message || err) }; }
    try { rerender(); } catch (err) { console.error(err); }
    if (res.success || kodeSesiHabis(res.code)) return;
    if (res.code === 'NET' || res.code === 'BAD_RESPONSE' || (!res.code && /Koneksi|Respons kosong|tidak dapat dikirim/i.test(res.message || ''))) { // v1.4: putus/timeout fetch
      if (box) box.innerHTML = '<div class="small muted">Memeriksa apakah trip sudah tersimpan…</div>';
      await syncNow(true);
      if (S.d.allTrips.some(x => x.ID === id && x.Kota === d.kota)) { refreshBootLists(); toast('Trip ' + d.kota + ' sudah tersimpan.', 'success'); closeModal(); try { rerender(); } catch (err) { console.error(err); } return; }
    }
    if ($('#tripErr')) $('#tripErr').innerHTML = `<div class="alert-x danger mb-0"><i class="bi bi-x-circle"></i><div><b>Trip belum tersimpan.</b><br>${esc(res.message || 'Terjadi kesalahan.')}</div></div>`;
  };
  $('#btnTrip').onclick = e => simpanTrip(e.currentTarget);
  $('#fTrip').onsubmit = e => { e.preventDefault(); simpanTrip($('#btnTrip')); };
  $$('#fTrip input').forEach(x => x.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); simpanTrip($('#btnTrip')); } }));
};
ACT.tripHapus = async b => {
  if (!(await confirmDlg({ title: 'Hapus trip?', text: 'Trip hilang dari landing page.', ok: 'Hapus', danger: true }))) return;
  await mutate('trip.hapus', { id: b.dataset.id }, { optimistic: () => { const u = removeLocal('allTrips', b.dataset.id); refreshBootLists(); return [u, refreshBootLists]; } });
};

// ════════════════════════════════════════════════════════
// BAGIAN 27: PANEL — PENGATURAN
// ════════════════════════════════════════════════════════
ROUTES['a-pengaturan'] = { shell: 'adm', title: 'Pengaturan', r: aPengaturan, permAny: ['pengaturan.sistem', 'jastip.atur', 'qris.kelola'] };
function aPengaturan(el, p, re) {
  const tabs = [['identitas', 'bi-palette', 'Identitas & rekening', can('pengaturan.sistem')], ['jasa', 'bi-percent', 'Jasa titip & kurir', can('jastip.atur')], ['qris', 'bi-qr-code', 'QRIS & e-wallet', can('qris.kelola')], ['keamanan', 'bi-shield-lock', 'WhatsApp & keamanan', S.me.role === 'superadmin'], ['template', 'bi-chat-square-text', 'Template pesan', S.me.role === 'superadmin'], ['audit', 'bi-journal-text', 'Log audit', S.me.role === 'superadmin']].filter(t => t[3]);
  const st = S.ui.set || (S.ui.set = { tab: tabs[0] ? tabs[0][0] : 'jasa' });
  if (!tabs.some(t => t[0] === st.tab)) st.tab = tabs[0][0];
  if (re && el.dataset.ready === st.tab) return;
  const s = S.settings;
  let body = '';
  if (st.tab === 'identitas') {
    const presets = ['#6C5CE7', '#5341CD', '#2563EB', '#0F766E', '#DB2777', '#EA580C', '#1F2937'];
    body = `<form id="fIdent" class="row g-4"><div class="col-lg-7"><div class="cardx pad-lg"><b class="fs-5 d-block mb-3">Identitas aplikasi</b><div class="row g-3">
      <div class="col-sm-6"><label class="form-label">Nama aplikasi</label><input class="form-control" name="appName" value="${esc(s.appName || '')}" maxlength="40"></div>
      <div class="col-sm-6"><label class="form-label">Tagline</label><input class="form-control" name="tagline" value="${esc(s.tagline || '')}" maxlength="60"></div>
      <div class="col-12"><label class="form-label">Warna utama</label><div class="d-flex gap-3 align-items-center flex-wrap"><div class="color-swatches" id="colSw">${presets.map(c => `<button type="button" class="${(s.primaryColor || '').toUpperCase() === c ? 'on' : ''}" style="background:${c}" data-c="${c}" aria-label="Warna ${c}"></button>`).join('')}</div><input type="color" class="form-control form-control-color" name="primaryColor" value="${esc(s.primaryColor || '#6C5CE7')}" aria-label="Pilih warna" style="width:56px;height:44px;padding:4px"></div><div class="form-text">Pratinjau langsung. Klik simpan agar berlaku untuk semua pengguna.</div></div>
      <div class="col-sm-6"><label class="form-label">WhatsApp usaha</label><input class="form-control" name="bizHP" value="${esc(s.bizHP || '')}" inputmode="tel"></div>
      <div class="col-sm-6"><label class="form-label">Email usaha</label><input class="form-control" name="bizEmail" type="email" value="${esc(s.bizEmail || '')}"></div>
      <div class="col-12"><label class="form-label">Alamat usaha</label><input class="form-control" name="bizAlamat" value="${esc(s.bizAlamat || '')}"></div></div></div>${kartuKontakSA(s)}</div>
    <div class="col-lg-5"><div class="cardx pad-lg mb-4"><b class="fs-5 d-block mb-3">Logo</b><div class="d-flex gap-3 align-items-center mb-3"><span class="brand-logo" style="width:72px;height:72px;border-radius:20px">${s.logoUrl ? `<img src="${esc(s.logoUrl)}" alt="Logo">` : LOGO_SVG}</span><div class="small muted">PNG/JPG persegi, minimal 256×256 px. Tampil di sidebar, landing, dan invoice PDF.</div></div>${dropzone('logo', 'Unggah logo baru', 'image/*')}<button type="button" class="btn btn-soft w-100 mt-2" data-act="logoUpload"><i class="bi bi-upload"></i>Simpan logo</button></div>
      <div class="cardx pad-lg"><b class="fs-5 d-flex justify-content-between mb-3">Rekening pembayaran <button type="button" class="link-btn fs-6" data-act="bankAdd"><i class="bi bi-plus"></i> Tambah</button></b><div id="bankList">${(s.bankInfo || []).map(bankRow).join('')}</div><div class="form-text">Tampil di invoice & halaman pesanan customer.</div></div></div>
    <div class="col-12"><button class="btn btn-primary btn-lg" type="submit"><i class="bi bi-check2"></i>Simpan identitas</button></div></form>`;
  } else if (st.tab === 'jasa') {
    body = `<form id="fJasa" class="row g-4"><div class="col-xl-7"><div class="cardx pad-lg"><b class="fs-5 d-block mb-1">Aturan biaya jasa titip per negara</b><p class="muted small">Berlaku untuk pesanan baru. Pesanan lama tidak berubah.</p>
      <div class="tbl-wrap"><table class="tbl jasa-tbl"><thead><tr><th>Negara</th><th>Tipe</th><th>Nilai</th><th>Minimal (Rp)</th></tr></thead><tbody>${countries().map(c => { const r = (s.jastipRules || []).find(x => x.negara === c.kode) || { tipe: 'persen', nilai: 10, minimal: 0 }; return `<tr data-neg="${c.kode}"><td><span class="neg-cell">${flag(c.kode)}<b>${esc(c.nama)}</b></span></td><td><select class="form-select form-select-sm" data-r="tipe" aria-label="Tipe jasa ${esc(c.nama)}"><option value="persen" ${r.tipe === 'persen' ? 'selected' : ''}>Persen (%)</option><option value="nominal" ${r.tipe === 'nominal' ? 'selected' : ''}>Rp per pcs</option><option value="flat" ${r.tipe === 'flat' ? 'selected' : ''}>Flat per item</option></select></td><td><input class="form-control form-control-sm" data-r="nilai" inputmode="decimal" data-uang="jasa" value="${esc(r.nilai)}"></td><td><input class="form-control form-control-sm" data-r="minimal" inputmode="numeric" data-uang value="${esc(r.minimal || 0)}"></td></tr>`; }).join('')}</tbody></table></div>
      <div class="row g-3 mt-2"><div class="col-sm-6"><label class="form-label">Jatuh tempo invoice (hari)</label><input class="form-control" name="jatuhTempoHari" type="number" min="1" max="60" value="${esc(s.jatuhTempoHari || 3)}"></div></div></div>
      <div class="cardx pad-lg mt-4"><b class="fs-5 d-block mb-1">Tampilan biaya jasa di portal member</b><p class="muted small">Atur apa yang dilihat member di kalkulator, katalog, keranjang, dan invoice. Total tagihan tetap termasuk jasa titip.</p>
        <label class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" name="memberJasaTampil" ${s.memberJasaGabung === true ? '' : 'checked'}> <b>Tampilkan baris jasa titip ke member</b></label>
        <div id="mjGabungNote" class="note-box mt-0 mb-3" style="${s.memberJasaGabung === true ? '' : 'display:none'}"><i class="bi bi-eye-slash"></i><div>Baris jasa titip disembunyikan. Harga barang yang dilihat member sudah termasuk jasa titip, jadi total tagihan dan pendapatan jasa tidak berubah.</div></div>
        <div id="mjRinciBox" style="${s.memberJasaGabung === true ? 'display:none' : ''}"><label class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" name="memberJasaRinci" ${s.memberJasaRinci === false ? '' : 'checked'}> Tampilkan rincian persen &amp; minimal jasa titip</label>
        <div class="row g-3 align-items-end"><div class="col-sm-6"><label class="form-label" for="mjLabel">Nama biaya di portal member</label><input class="form-control" id="mjLabel" name="memberJasaLabel" maxlength="40" value="${esc(s.memberJasaLabel || 'Jasa titip')}" placeholder="Jasa titip"></div>
          <div class="col-sm-6"><div class="small muted mb-1">Pratinjau</div><div class="tint p-2 px-3 small" id="mjPrev"></div></div></div></div>${toggleJasaKartu(s)}</div></div>
    <div class="col-xl-5"><div class="cardx pad-lg"><b class="fs-5 d-flex justify-content-between mb-3">Kurir domestik <button type="button" class="link-btn fs-6" data-act="kurirAdd"><i class="bi bi-plus"></i> Tambah</button></b><div id="kurirList">${(s.couriers || []).map(kurirRow).join('')}</div></div></div>
    <div class="col-12"><button class="btn btn-primary btn-lg" type="submit"><i class="bi bi-check2"></i>Simpan aturan</button></div></form>`;
  } else if (st.tab === 'qris') {
    body = qrisTabHtml() + ewalletKartu();
  } else if (st.tab === 'template') {
    body = templateTabHtml();
  } else if (st.tab === 'keamanan') {
    body = otpPengurusKartu() + `<div class="row g-4"><div class="col-lg-7"><div class="cardx pad-lg"><b class="fs-5 d-block mb-1"><i class="bi bi-whatsapp me-2" style="color:#10B981"></i>Gateway WhatsApp (Fonnte)</b><p class="muted small">Token disimpan di Script Properties, tidak pernah dikirim balik ke browser. Dapatkan token di dashboard fonnte.com → Device.</p>
      <div id="secStatus" class="mb-3"><div class="sk" style="height:44px"></div></div>
      <div class="secret-box"><input class="form-control" id="secToken" type="password" autocomplete="off" placeholder="Tempel token baru…" style="max-width:360px"><button class="btn btn-primary" data-act="secSave"><i class="bi bi-shield-check"></i>Simpan & uji kirim</button><button class="btn btn-danger-soft" data-act="secDel"><i class="bi bi-trash3"></i>Hapus token</button></div>
      <hr><div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-2"><b>Status device Fonnte</b><button class="btn btn-sm btn-light" data-act="waCek"><i class="bi bi-arrow-clockwise"></i>Cek status</button></div>
      <div id="waStat" class="mb-3"><div class="small muted">Klik Cek status untuk melihat nomor, koneksi, paket, dan kuota device.</div></div>
      <label class="form-label" for="waUjiHp">Kirim pesan uji ke nomor</label>
      <div class="d-flex gap-2 flex-wrap"><input class="form-control" id="waUjiHp" inputmode="tel" placeholder="Contoh: 081234567890" style="max-width:260px" value="${esc(fmtHP(s.bizHP && s.bizHP !== '6281200000000' ? s.bizHP : ''))}"><button class="btn btn-soft" data-act="waUji"><i class="bi bi-send"></i>Kirim pesan uji</button></div>
      <div class="form-text">Pakai nomor yang berbeda dari nomor device Fonnte (misalnya nomor pribadi) agar mudah dicek.</div>
      <hr><b class="d-block mb-2">Mode uji OTP</b><p class="muted small mb-2">Saat aktif dan token kosong, kode OTP tampil di layar pendaftar. <b>Matikan setelah token WhatsApp terpasang.</b></p><label class="form-check form-switch"><input class="form-check-input" type="checkbox" id="secOtp" data-act="secOtp"> <span id="secOtpLbl">Mode uji</span></label></div></div>
    <div class="col-lg-5"><div class="cardx pad-lg mb-4"><b class="fs-5 d-block mb-1"><i class="bi bi-stars me-2" style="color:var(--primary)"></i>Kunci AI Gemini</b><p class="muted small">Dipakai untuk mengisi nama barang otomatis dari foto di Katalog & Trip. Buat kunci gratis di <b>aistudio.google.com</b> → <b>Get API key</b>. Disimpan di Script Properties.</p>
      <div id="aiStatus" class="mb-2"><div class="sk" style="height:40px"></div></div>
      <div class="secret-box"><input class="form-control" id="aiKey" type="password" autocomplete="off" placeholder="Tempel kunci API Gemini…"><button class="btn btn-primary" data-act="aiSave"><i class="bi bi-shield-check"></i>Simpan & uji</button><button class="btn btn-danger-soft" data-act="aiDel" aria-label="Hapus kunci Gemini"><i class="bi bi-trash3"></i></button></div>
      <details class="mt-2 small"><summary class="muted">Pengaturan lanjutan: nama model</summary><div class="d-flex gap-2 mt-2"><input class="form-control form-control-sm mono" id="aiModel" placeholder="otomatis (mis. gemini-3.8-flash)" maxlength="60"><button class="btn btn-sm btn-light nowrap" data-act="aiModelSave">Simpan model</button></div><div class="form-text">Kosongkan agar aplikasi memilih model Gemini terbaru yang tersedia secara otomatis.</div></details></div>
      <div class="cardx pad-lg"><b class="fs-5 d-block mb-3">Catatan keamanan</b><ul class="small text-2 ps-3 mb-0"><li>Rahasia (token WhatsApp, secret sesi, hash sandi) hanya ada di Script Properties.</li><li>Satu akun satu perangkat; login baru memutus sesi lama.</li><li>5 kali gagal login → akun dikunci 15 menit.</li><li>Rotasi semua sesi: jalankan <code>rotasiSecretSesi()</code> dari editor Apps Script.</li><li>Lupa sandi Super Admin: jalankan <code>resetAksesSuperAdmin()</code>.</li><li>Batasi editor proyek Apps Script hanya untuk orang tepercaya.</li></ul><div class="tint p-3 mt-3 small" id="secQuota"></div></div></div></div>`;
  } else {
    body = `<div class="cardx"><div class="cardx-head"><h3>300 aktivitas terakhir</h3><button class="btn btn-sm btn-light" data-act="auditLoad"><i class="bi bi-arrow-clockwise"></i>Muat ulang</button></div><div class="cardx-body"><div class="tbl-wrap" id="auditBox"><div class="sk" style="height:200px"></div></div></div></div>`;
  }
  el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Sistem</span><h1>Pengaturan</h1><p>Identitas aplikasi, aturan jasa titip, kurir, rekening, dan keamanan.</p></div></div>
    <div class="tabs-x">${tabs.map(([v, i, t]) => `<button class="chip ${st.tab === v ? 'on' : ''}" data-act="setTab" data-t="${v}"><i class="bi ${i}"></i>${t}</button>`).join('')}</div>${body}`;
  el.dataset.ready = st.tab;
  if (st.tab === 'identitas') bindIdentitas();
  if (st.tab === 'jasa') bindJasa();
  if (st.tab === 'keamanan') loadSecret();
  if (st.tab === 'qris') { renderQrisPreviews(); bindEwallet(); }
  if (st.tab === 'template') bindTemplate();
  if (st.tab === 'audit') ACT.auditLoad();
}
ACT.setTab = b => { S.ui.set.tab = b.dataset.t; delete $('#v-a-pengaturan').dataset.ready; aPengaturan($('#v-a-pengaturan'), {}); };
const bankRow = b => `<div class="bank-row tint p-2 mb-2 d-flex gap-2 align-items-center"><input class="form-control form-control-sm" data-b="bank" value="${esc(b.bank)}" placeholder="Bank" style="max-width:90px"><input class="form-control form-control-sm" data-b="noRek" value="${esc(b.noRek)}" placeholder="No. rekening"><input class="form-control form-control-sm" data-b="atasNama" value="${esc(b.atasNama)}" placeholder="Atas nama"><button type="button" class="icon-btn sm" data-act="rowDel" aria-label="Hapus"><i class="bi bi-x-lg"></i></button></div>`;
const kurirRow = k => `<div class="kurir-row tint p-2 mb-2 d-flex gap-2 align-items-center"><input class="form-control form-control-sm" data-k="nama" value="${esc(k.nama)}" placeholder="Nama kurir"><input class="form-control form-control-sm" data-k="harga" value="${esc(k.harga)}" inputmode="numeric" data-uang placeholder="Harga" style="max-width:100px"><input class="form-control form-control-sm" data-k="estimasi" value="${esc(k.estimasi || '')}" placeholder="Estimasi" style="max-width:120px"><button type="button" class="icon-btn sm" data-act="rowDel" aria-label="Hapus"><i class="bi bi-x-lg"></i></button></div>`;
ACT.bankAdd = () => $('#bankList').insertAdjacentHTML('beforeend', bankRow({ bank: '', noRek: '', atasNama: '' }));
ACT.kurirAdd = () => $('#kurirList').insertAdjacentHTML('beforeend', kurirRow({ nama: '', harga: 0, estimasi: '' }));
ACT.rowDel = b => b.parentElement.remove();
function bindIdentitas() {
  const f = $('#fIdent');
  const preview = c => document.documentElement.style.setProperty('--primary', c);
  $$('#colSw button').forEach(x => x.onclick = () => { $$('#colSw button').forEach(y => y.classList.remove('on')); x.classList.add('on'); f.primaryColor.value = x.dataset.c; preview(x.dataset.c); });
  f.primaryColor.oninput = e => preview(e.target.value);
  f.onsubmit = async e => {
    e.preventDefault(); const d = formData(f);
    const bankInfo = $$('#bankList .bank-row').map(r => ({ bank: r.querySelector('[data-b=bank]').value.trim(), noRek: r.querySelector('[data-b=noRek]').value.trim(), atasNama: r.querySelector('[data-b=atasNama]').value.trim() })).filter(x => x.bank);
    const values = { appName: d.appName, tagline: d.tagline, primaryColor: d.primaryColor, bizHP: d.bizHP, bizEmail: d.bizEmail, bizAlamat: d.bizAlamat, bankInfo };
    if (f.bizIG) { values.bizIG = d.bizIG; values.waGrupLink = d.waGrupLink; } // v1.4.1: hanya Super Admin
    const res = await mutate('settings.simpan', { values }, { btn: f.querySelector('[type=submit]'), rerenderView: false });
    if (res.success) { S.settings = res.data.settings; Object.keys(S.boot.settings).forEach(k => { if (S.settings[k] !== undefined) S.boot.settings[k] = S.settings[k]; }); renderShellChrome(); delete $('#v-home').dataset.ready; }
    else applyBrand();
  };
}
ACT.logoUpload = async b => {
  const file = takeFile('logo');
  if (!file) return toast('Pilih file logo dulu.', 'warning');
  const res = await mutate('settings.logo', { file }, { btn: b, busyLabel: 'Mengunggah…', rerenderView: false });
  if (res.success) { S.settings = res.data.settings; S.boot.settings.logoUrl = S.settings.logoUrl; renderShellChrome(); delete $('#v-a-pengaturan').dataset.ready; aPengaturan($('#v-a-pengaturan'), {}); }
};
function bindJasa() {
  const f = $('#fJasa');
  // Pratinjau label jasa di portal member (memakai aturan Jepang sebagai contoh)
  const prev = () => {
    const r = $('tr[data-neg=JP]', f); const tipe = r.querySelector('[data-r=tipe]').value, nilai = angkaJasa(r.querySelector('[data-r=nilai]').value, tipe), min = toNum(r.querySelector('[data-r=minimal]').value);
    const lbl = f.memberJasaLabel.value.trim() || 'Jasa titip';
    $('#mjPrev').textContent = f.memberJasaRinci.checked ? `${lbl} (${tipe === 'persen' ? nilai + '%' : rp(nilai)}${min ? ', min. ' + rpShort(min) : ''})` : lbl;
    const tampil = f.memberJasaTampil.checked;
    $('#mjRinciBox').style.display = tampil ? '' : 'none'; $('#mjGabungNote').style.display = tampil ? 'none' : '';
  };
  f.addEventListener('input', prev); f.addEventListener('change', prev); prev();
  f.onsubmit = async e => {
    e.preventDefault();
    const rules = $$('tr[data-neg]', f).map(r => ({ negara: r.dataset.neg, tipe: r.querySelector('[data-r=tipe]').value, nilai: angkaJasa(r.querySelector('[data-r=nilai]').value, r.querySelector('[data-r=tipe]').value), minimal: toNum(r.querySelector('[data-r=minimal]').value) }));
    const couriers = $$('#kurirList .kurir-row').map(r => ({ nama: r.querySelector('[data-k=nama]').value.trim(), harga: toNum(r.querySelector('[data-k=harga]').value), estimasi: r.querySelector('[data-k=estimasi]').value.trim() })).filter(x => x.nama);
    const values = { jastipRules: rules, couriers, jatuhTempoHari: Number(f.jatuhTempoHari.value) || 3, memberJasaRinci: f.memberJasaRinci.checked, memberJasaLabel: f.memberJasaLabel.value.trim(), memberJasaGabung: !f.memberJasaTampil.checked };
    if (f.katalogJasaKartu) values.katalogJasaKartu = f.katalogJasaKartu.checked; // v1.4.1: Super Admin & Owner
    const res = await mutate('settings.simpan', { values }, { btn: f.querySelector('[type=submit]'), rerenderView: false });
    if (res.success) { S.settings = res.data.settings; Object.assign(S.boot.settings, { jastipRules: S.settings.jastipRules, couriers: S.settings.couriers, jatuhTempoHari: S.settings.jatuhTempoHari, memberJasaRinci: S.settings.memberJasaRinci, memberJasaLabel: S.settings.memberJasaLabel, memberJasaGabung: S.settings.memberJasaGabung, katalogJasaKartu: S.settings.katalogJasaKartu === true }); ['home', 'katalog', 'keranjang'].forEach(v => { const x = $('#v-' + v); if (x) delete x.dataset.ready; }); }
  };
}
async function loadSecret() {
  const r = await api('rahasia.status', {}, { silent: true });
  if (!r.success) { $('#secStatus').innerHTML = `<div class="alert-x danger">${esc(r.message)}</div>`; return; }
  const d = r.data;
  $('#secStatus').innerHTML = d.FONNTE_TOKEN.ada ? `<div class="alert-x info"><i class="bi bi-check-circle"></i><div>Token terpasang: <b class="mono">${esc(d.FONNTE_TOKEN.samar)}</b></div></div>` : `<div class="alert-x warn"><i class="bi bi-exclamation-triangle"></i><div>Token WhatsApp belum diisi. OTP, invoice, dan pengingat lewat WhatsApp belum aktif.</div></div>`;
  $('#secOtp').checked = d.OTP_MODE_UJI;
  $('#secOtpLbl').textContent = d.OTP_MODE_UJI ? 'Mode uji AKTIF (kode OTP tampil di layar)' : 'Mode uji nonaktif';
  $('#secQuota').innerHTML = `<i class="bi bi-envelope"></i> Sisa kuota email hari ini: <b>${num(d.kuotaEmail)}</b>`;
  const ai = d.GEMINI_API_KEY || {};
  $('#aiStatus').innerHTML = ai.ada ? `<div class="alert-x info"><i class="bi bi-check-circle"></i><div>Kunci terpasang: <b class="mono">${esc(ai.samar)}</b>${d.geminiModelAktif ? `<br><span class="small">Model aktif: <span class="mono">${esc(d.geminiModelAktif)}</span></span>` : ''}</div></div>` : '<div class="alert-x warn"><i class="bi bi-exclamation-triangle"></i><div>Kunci AI belum dipasang. Foto barang tetap tersimpan, tetapi nama diisi manual.</div></div>';
  $('#aiModel').value = d.GEMINI_MODEL || '';
  if (d.FONNTE_TOKEN.ada) ACT.waCek(); else $('#waStat').innerHTML = '<div class="small muted">Pasang token dulu untuk melihat status device.</div>';
}
function renderWaStat(d) {
  const box = $('#waStat'); if (!box) return;
  if (!d.ok) { box.innerHTML = `<div class="alert-x danger"><i class="bi bi-x-circle"></i><div><b>Tidak bisa membaca device</b><br>${esc(d.message)}</div></div>`; return; }
  box.innerHTML = `${d.terhubung ? '<div class="alert-x info mb-2"><i class="bi bi-check-circle"></i><div><b>Device terhubung.</b> WhatsApp siap mengirim OTP, invoice, dan pengingat.</div></div>'
      : '<div class="alert-x danger mb-2"><i class="bi bi-plug"></i><div><b>Device TERPUTUS.</b> Pesan hanya mengantre dan tidak sampai. Buka fonnte.com → Device → Connect, lalu pindai ulang QR dari WhatsApp di HP.</div></div>'}
    <div class="wa-stat"><div><div class="k">Nomor device</div><div class="v">${esc(fmtHP(d.device) || '-')}</div></div><div><div class="k">Status</div><div class="v" style="color:${d.terhubung ? 'var(--mint-ink)' : 'var(--danger)'}">${d.terhubung ? 'Terhubung' : 'Terputus'}</div></div>
      <div><div class="k">Paket</div><div class="v">${esc(d.paket || '-')}</div></div><div><div class="k">Sisa kuota</div><div class="v">${esc(d.kuota === '' ? '-' : d.kuota)}</div></div><div><div class="k">Aktif sampai</div><div class="v">${esc(d.kedaluwarsa || '-')}</div></div></div>`;
}
ACT.waCek = async b => {
  setBusy(b, true, 'Memeriksa…');
  const r = await api('wa.status', {}, { silent: true });
  setBusy(b, false);
  renderWaStat(r.success ? r.data : { ok: false, message: r.message });
};
ACT.waUji = async b => {
  const hp = $('#waUjiHp').value.trim();
  if (!hp) { $('#waUjiHp').focus(); return toast('Isi nomor tujuan pesan uji.', 'warning'); }
  setBusy(b, true, 'Mengirim…');
  const r = await api('wa.uji', { hp });
  setBusy(b, false);
  toast(r.message, r.success ? (r.level || 'success') : 'error', r.success ? '' : 'Pesan uji gagal');
  if (r.success && r.data.device) renderWaStat(Object.assign({ ok: true }, r.data.device));
};
ACT.secSave = async b => {
  const v = $('#secToken').value.trim();
  if (!v) return toast('Tempel token terlebih dulu.', 'warning');
  const r = await mutate('rahasia.simpan', { kunci: 'FONNTE_TOKEN', nilai: v, uji: true }, { btn: b, busyLabel: 'Menyimpan…', rerenderView: false });
  $('#secToken').value = '';
  if (r.success) loadSecret();
};
ACT.secDel = async b => {
  if (!(await confirmDlg({ title: 'Hapus token WhatsApp?', text: 'Pengiriman WhatsApp otomatis berhenti.', ok: 'Hapus', danger: true }))) return;
  const r = await mutate('rahasia.simpan', { kunci: 'FONNTE_TOKEN', nilai: '__HAPUS__' }, { btn: b, rerenderView: false });
  if (r.success) loadSecret();
};
ACT.secOtp = async b => { const r = await mutate('rahasia.simpan', { kunci: 'OTP_MODE_UJI', nilai: b.checked ? 'true' : 'false' }, { rerenderView: false }); if (r.success) loadSecret(); else b.checked = !b.checked; };
ACT.auditLoad = async () => {
  const box = $('#auditBox'); if (!box) return;
  const r = await api('audit.list', {}, { silent: true });
  if (!r.success) { box.innerHTML = `<div class="alert-x danger">${esc(r.message)}</div>`; return; }
  box.innerHTML = `<table class="tbl"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Entitas</th><th>Detail</th></tr></thead><tbody>${r.data.map(a => `<tr><td class="nowrap">${tglJam(a.Waktu)}</td><td><b>${esc(a.Nama)}</b><span class="sub">${esc(ROLE_LABEL[a.Role] || a.Role)}</span></td><td><span class="tag">${esc(a.Aksi)}</span></td><td>${esc(a.Entitas)}</td><td style="max-width:360px"><span class="clamp-2 small muted">${esc(a.Detail)}</span></td></tr>`).join('')}</tbody></table>`;
};

// ════════════════════════════════════════════════════════
// BAGIAN 28: PANEL — MANAJEMEN USER & HAK AKSES (Super Admin)
// ════════════════════════════════════════════════════════
const PERM_LABEL = {
  'dompet.jenis': 'Atur jenis dompet', 'qris.kelola': 'Kelola QRIS pembayaran',
  'dashboard': 'Beranda / dashboard', 'pesanan.lihat': 'Lihat pesanan', 'pesanan.tulis': 'Buat & ubah pesanan', 'pesanan.status': 'Ubah status pesanan', 'pesanan.hapus': 'Hapus pesanan',
  'customer.lihat': 'Lihat customer', 'customer.tulis': 'Tambah & ubah customer', 'pembelian.lihat': 'Lihat pembelian', 'pembelian.tulis': 'Catat pembelian',
  'pembayaran': 'Pembayaran & verifikasi', 'dompet': 'Dompet & mutasi', 'biaya': 'Biaya lain', 'invoice': 'Invoice (buat & kirim)', 'pengingat': 'Pengingat tagihan', 'laporan': 'Laporan & ekspor',
  'kurs.atur': 'Atur kurs manual', 'jastip.atur': 'Atur jasa titip & kurir', 'katalog.kelola': 'Kelola katalog, trip & landing', 'pengaturan.sistem': 'Identitas & rekening', 'voucher.kelola': 'Voucher & poin member'
};
ROUTES['a-users'] = { shell: 'adm', title: 'Manajemen User', r: aUsers, role: 'superadmin' };
function aUsers(el) {
  const us = S.d.users.slice().sort((a, b) => ROLES_ORDER.indexOf(a.Role) - ROLES_ORDER.indexOf(b.Role) || a.Nama.localeCompare(b.Nama));
  el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Super Admin</span><h1>Manajemen User & Hak Akses</h1><p>Tambah pengurus, ubah peran, reset kata sandi, dan putus sesi perangkat.</p></div>
    <div class="actions"><button class="btn btn-light" data-act="rbacOpen"><i class="bi bi-grid-3x3-gap"></i>Matriks hak akses</button><button class="btn btn-primary" data-act="userForm"><i class="bi bi-person-plus"></i>Tambah user</button></div></div>
  <div class="kpi-grid mb-4">${['superadmin', 'owner', 'keuangan', 'staff'].map((r, i) => kpi(['bi-shield-lock', 'bi-briefcase', 'bi-cash-stack', 'bi-person-workspace'][i], ['danger', 'gold', 'mint', 'sky'][i], ROLE_LABEL[r], us.filter(u => u.Role === r).length + ' akun', us.filter(u => u.Role === r && u.Status === 'Aktif').length + ' aktif')).join('')}</div>
  <div class="cardx"><div class="cardx-body"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nama</th><th>Username / kontak</th><th>Peran</th><th>Status</th><th>Login terakhir</th><th>Perangkat aktif</th><th></th></tr></thead><tbody>
    ${us.map(u => `<tr><td><div class="person">${avatar(u.Nama, 'sm')}<div><b>${esc(u.Nama)}</b>${u.ID === S.me.id ? '<span class="sub">Anda</span>' : ''}</div></div></td><td><span class="mono">${esc(u.Username)}</span><span class="sub">${esc(u.HP ? fmtHP(u.HP) : u.Email || '-')}</span></td><td><span class="pill primary nodot">${esc(ROLE_LABEL[u.Role] || u.Role)}</span></td><td>${pill(u.Status)}${u.WajibGantiSandi ? '<span class="sub" style="color:var(--st-dp)">wajib ganti sandi</span>' : ''}</td><td>${u.LoginTerakhir ? relatif(u.LoginTerakhir) : '-'}</td><td>${esc(u.Perangkat || '-')}</td>
      <td class="nowrap"><div class="dropdown"><button class="icon-btn sm" data-bs-toggle="dropdown" aria-label="Aksi"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu dropdown-menu-end"><li><button class="dropdown-item" data-act="userForm" data-id="${u.ID}"><i class="bi bi-pencil me-2"></i>Ubah</button></li><li><button class="dropdown-item" data-act="userReset" data-id="${u.ID}"><i class="bi bi-key me-2"></i>Reset kata sandi</button></li>${u.ID !== S.me.id ? `<li><button class="dropdown-item" data-act="userPutus" data-id="${u.ID}"><i class="bi bi-phone-flip me-2"></i>Putus sesi</button></li>` : ''}</ul></div></td></tr>`).join('')}</tbody></table></div></div></div>`;
}
const ROLES_ORDER = ['superadmin', 'owner', 'keuangan', 'staff'];
ACT.userForm = b => {
  const u = b && b.dataset.id ? S.d.users.find(x => x.ID === b.dataset.id) : { Role: 'staff', Status: 'Aktif' };
  modal({ title: u.ID ? 'Ubah user' : 'Tambah user', body: `<form id="fUser" class="row g-3" novalidate>
    <div class="col-sm-6"><label class="form-label">Nama <span class="req">*</span></label><input class="form-control" name="nama" value="${esc(u.Nama || '')}"></div>
    <div class="col-sm-6"><label class="form-label">Username <span class="req">*</span></label><input class="form-control" name="username" value="${esc(u.Username || '')}" autocomplete="off" placeholder="huruf kecil, mis. andi.staff"></div>
    <div class="col-sm-6"><label class="form-label">WhatsApp</label><input class="form-control" name="hp" value="${esc(u.HP || '')}" inputmode="tel"></div>
    <div class="col-sm-6"><label class="form-label">Email</label><input class="form-control" name="email" type="email" value="${esc(u.Email || '')}"></div>
    <div class="col-sm-6"><label class="form-label">Peran</label><select class="form-select" name="role">${ROLES_ORDER.map(r => `<option value="${r}" ${u.Role === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select></div>
    <div class="col-sm-6"><label class="form-label">Status</label><select class="form-select" name="status"><option ${u.Status === 'Aktif' ? 'selected' : ''}>Aktif</option><option ${u.Status === 'Nonaktif' ? 'selected' : ''}>Nonaktif</option></select></div>
    <div class="col-12"><label class="form-label">${u.ID ? 'Kata sandi baru (kosongkan bila tidak diubah)' : 'Kata sandi awal (kosongkan untuk dibuat otomatis)'}</label><input class="form-control" name="password" type="password" autocomplete="new-password"><div class="form-text">User wajib mengganti kata sandi saat login pertama.</div></div></form>`,
    foot: '<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnUser">Simpan</button>' });
  $('#btnUser').onclick = async e => {
    const f = $('#fUser'); clearErr(f); const d = formData(f);
    if (d.nama.length < 3) return fieldErr(f, 'nama', 'Nama minimal 3 huruf.');
    if (!/^[a-z0-9._-]{3,40}$/.test(d.username.toLowerCase())) return fieldErr(f, 'username', '3–40 karakter: huruf kecil, angka, titik, garis bawah.');
    if (d.password && (d.password.length < 8 || !/\d/.test(d.password) || !/[a-z]/i.test(d.password))) return fieldErr(f, 'password', 'Minimal 8 karakter berisi huruf dan angka.');
    d.id = u.ID;
    const r = await mutate('user.simpan', d, { btn: e.currentTarget, onOk: res => { closeModal(); if (res.data.sandiAwal) showSandi(d.nama, d.username, res.data.sandiAwal); } });
    void r;
  };
};
function showSandi(nama, username, sandi) {
  setTimeout(() => modal({ title: 'Kata sandi untuk ' + nama, body: `<div class="alert-x warn"><i class="bi bi-eye-slash"></i><div>Kata sandi hanya ditampilkan sekali. Berikan kepada ${esc(nama)} secara pribadi.</div></div><div class="tint p-3"><div class="small muted">Username</div><b class="mono fs-5">${esc(username)}</b><div class="small muted mt-2">Kata sandi sementara</div><b class="mono fs-4">${esc(sandi)}</b></div>`, foot: `<button class="btn btn-light" data-act="copy" data-text="${esc(sandi)}"><i class="bi bi-copy"></i>Salin sandi</button><button class="btn btn-primary" data-bs-dismiss="modal">Sudah dicatat</button>` }), 350);
}
ACT.userReset = async b => {
  const u = S.d.users.find(x => x.ID === b.dataset.id);
  if (!(await confirmDlg({ title: 'Reset kata sandi ' + u.Nama + '?', text: 'Sesi user diputus dan kata sandi sementara dibuat.', ok: 'Reset', icon: 'bi-key' }))) return;
  await mutate('user.resetSandi', { id: u.ID }, { onOk: res => showSandi(u.Nama, u.Username, res.data.sandi) });
};
ACT.userPutus = async b => {
  const u = S.d.users.find(x => x.ID === b.dataset.id);
  if (!(await confirmDlg({ title: 'Putus sesi ' + u.Nama + '?', text: 'User harus masuk ulang di perangkatnya.', ok: 'Putus sesi', icon: 'bi-phone-flip' }))) return;
  await mutate('user.putus', { id: u.ID }, { optimistic: () => upsertLocal('users', { ID: u.ID, Perangkat: u.Perangkat }) });
};
ACT.rbacOpen = () => {
  const rb = S.settings.rbac || {};
  const roles = ['owner', 'keuangan', 'staff'];
  modal({ title: 'Matriks hak akses', size: 'lg', body: `<p class="muted small">Super Admin selalu memiliki semua akses. Perubahan berlaku pada permintaan berikutnya pengguna.</p><div class="tbl-wrap"><table class="tbl rbac"><thead><tr><th>Fitur</th><th>Super Admin</th>${roles.map(r => `<th>${ROLE_LABEL[r]}</th>`).join('')}</tr></thead><tbody>
    ${Object.keys(PERM_LABEL).map(p => `<tr><td>${esc(PERM_LABEL[p])}</td><td><input type="checkbox" class="form-check-input" checked disabled aria-label="Super Admin"></td>${roles.map(r => `<td><input type="checkbox" class="form-check-input" data-rb="${r}" data-p="${p}" ${(rb[r] || []).includes(p) ? 'checked' : ''} aria-label="${esc(ROLE_LABEL[r] + ' ' + PERM_LABEL[p])}"></td>`).join('')}</tr>`).join('')}
    <tr><td>Kelola user & hak akses</td><td><input type="checkbox" class="form-check-input" checked disabled></td>${roles.map(() => '<td><input type="checkbox" class="form-check-input" disabled></td>').join('')}</tr></tbody></table></div>`,
    foot: '<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnRbac"><i class="bi bi-check2"></i>Simpan matriks</button>' });
  $('#btnRbac').onclick = async e => {
    const out = { owner: [], keuangan: [], staff: [] };
    $$('[data-rb]').forEach(c => { if (c.checked) out[c.dataset.rb].push(c.dataset.p); });
    const r = await mutate('rbac.simpan', { rbac: out }, { btn: e.currentTarget, rerenderView: false });
    if (r.success) { S.settings.rbac = r.data.rbac; closeModal(); }
  };
};

// ── Akun saya (internal) ──
ROUTES['a-akun'] = { shell: 'adm', title: 'Akun Saya', r: aAkun };
function aAkun(el, p, re) {
  if (re && el.dataset.ready) return;
  el.innerHTML = `<div class="page-head"><div><h1>Akun saya</h1><p>Profil, kata sandi, dan sesi perangkat.</p></div></div>
  <div class="row g-4"><div class="col-lg-7"><div class="cardx pad-lg"><div class="d-flex align-items-center gap-3 mb-4">${fotoProfilHtml()}<div class="min-w-0"><h2 class="fs-4 fw-bold">${esc(S.me.nama)}</h2><span class="pill primary nodot">${esc(S.me.roleLabel)}</span> <span class="muted small">@${esc(S.me.username)}</span><div class="mt-1">${fotoAksiHtml()}</div></div></div>
    <form id="fAkunAdm" class="row g-3"><div class="col-sm-6"><label class="form-label">Nama</label><input class="form-control" name="nama" value="${esc(S.me.nama)}"></div><div class="col-sm-6"><label class="form-label">Email</label><input class="form-control" name="email" type="email" value="${esc(S.me.email || '')}"></div><div class="col-12"><button class="btn btn-primary" type="submit">Simpan profil</button></div></form>
    <hr><b class="d-block mb-2">Hak akses Anda</b><div class="d-flex flex-wrap gap-2">${(S.me.perms || []).map(p => `<span class="tag">${esc(PERM_LABEL[p] || p)}</span>`).join('')}</div></div></div>
    <div class="col-lg-5">${gantiSandiCard()}<div class="cardx pad mt-3 small"><b>Perangkat ini</b><div class="muted">${esc(deviceLabel())}</div></div></div></div>`;
  el.dataset.ready = '1';
  $('#fAkunAdm').onsubmit = async e => {
    e.preventDefault(); const f = e.target; const d = formData(f);
    if (d.nama.length < 3) return fieldErr(f, 'nama', 'Nama minimal 3 huruf.');
    const r = await mutate('profil.simpan', d, { btn: f.querySelector('[type=submit]'), rerenderView: false });
    if (r.success) { S.me = r.data.me; const s = store.get('sess'); if (s) { s.me = S.me; store.set('sess', s); } renderUserChip(); }
  };
  bindGantiSandi();
}

// ════════════════════════════════════════════════════════
// BAGIAN 29: EVENT GLOBAL & INISIALISASI
// ════════════════════════════════════════════════════════
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g && !g.disabled) {
    e.preventDefault();
    const [r, anchor] = g.dataset.go.split('#');
    let params = {};
    if (g.dataset.params) { try { params = JSON.parse(g.dataset.params); } catch (err) { params = {}; } }
    if (anchor) params.anchor = anchor;
    if (anchor && S.route === r && document.getElementById(anchor)) { document.getElementById(anchor).scrollIntoView({ behavior: 'smooth', block: 'start' }); const pm = bootstrap.Offcanvas.getInstance($('#pubMenu')); if (pm) pm.hide(); return; }
    if (r === 'a-form' && !params.id && S.route !== 'a-form') delete $('#v-a-form').dataset.ready;
    $('#globalResults')?.classList.remove('open');
    go(r, params);
    return;
  }
  const a = e.target.closest('[data-act]');
  if (a && !a.disabled && ACT[a.dataset.act]) {
    if (a.tagName !== 'INPUT') e.preventDefault();
    try { ACT[a.dataset.act](a, e); } catch (err) { console.error(err); toast(err.message, 'error'); }
  }
  if (!e.target.closest('.tb-search')) $('#globalResults')?.classList.remove('open');
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-act][tabindex], tr[data-act]') && !e.target.matches('input, button, a')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Escape') { $('#globalResults')?.classList.remove('open'); if ($('#drawer').classList.contains('show') && !document.querySelector('.modal.show')) closeDrawer(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && isInternal()) { e.preventDefault(); $('#globalSearch')?.focus(); }
});
document.addEventListener('change', e => { if (e.target.matches('input[data-file]')) onFilePicked(e.target); });
document.addEventListener('input', e => {
  if (e.target.matches('[data-strength]')) { const bar = e.target.closest('.input-icon, .mb-3, .col-sm-6, div')?.parentElement?.querySelector('.strength') || e.target.parentElement.querySelector('.strength'); if (bar) bar.dataset.s = strengthOf(e.target.value); }
  if (e.target.classList.contains('is-invalid')) { e.target.classList.remove('is-invalid'); e.target.parentElement.querySelector('.invalid-msg')?.remove(); }
});
['dragover', 'dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { const dz = e.target.closest && e.target.closest('.dropzone'); if (dz) dz.classList.toggle('drag', ev === 'dragover'); }));
$('#globalSearch').addEventListener('input', debounce(e => globalSearch(e.target.value), 120));
$('#globalSearch').addEventListener('focus', e => { if (e.target.value.trim().length >= 2) globalSearch(e.target.value); });
$('#drawer').addEventListener('hidden.bs.offcanvas', () => { S.ui.ordOpen = null; $$('#ordTable tr.sel').forEach(r => r.classList.remove('sel')); });
window.addEventListener('online', () => { S.online = true; toast('Koneksi kembali. Menyinkronkan…', 'success'); syncNow(true); });
window.addEventListener('offline', () => { S.online = false; toast('Anda offline. Perubahan akan gagal sampai koneksi kembali.', 'warning'); });

function init() {
  // v1.4: frontend statis — periksa js/config.js, lalu pastikan data awal ada (salinan perangkat atau dari API)
  const konf = statusKonfig();
  if (!konf.ok) { layarKonfigBelum(konf.alasan); return; }
  if (!S.boot.settings && !S.boot.setupRequired) { mulaiDenganBoot(); return; }
  if (_bootDariSalinan && !_bootSegar) setTimeout(segarkanBootLatar, 0);
  if (S.boot.setupRequired) {
    document.body.innerHTML = `<div class="view-auth active" style="display:grid"><div class="cardx auth-card"><div class="auth-logo"><span class="kpi-ic" style="width:60px;height:60px;font-size:26px"><i class="bi bi-tools"></i></span></div><h1>Aplikasi belum di-setup</h1><p class="sub">${esc(S.boot.message || '')}</p><ol class="small text-2"><li>Buka editor Apps Script.</li><li>Pilih fungsi <code>setupAppEnvironment</code> lalu klik ▶ Jalankan.</li><li>Berikan izin, lalu muat ulang halaman ini.</li></ol></div></div>`;
    window.__APP_READY__ = true;
    return;
  }
  applyTheme(document.documentElement.getAttribute('data-theme') || 'light');
  S.cart = store.get('cart', []) || [];
  const sess = store.get('sess');
  if (sess && sess.token && sess.me && sesiMasihBerlaku(sess)) {
    S.token = sess.token; S.tokExp = sess.exp || 0; S.me = sess.me;
    const cached = store.get('cache_' + S.me.id);
    const mulai = c => {
      if (c && c.d) { const kini = S.boot; hydrate(c); S.boot = Object.assign({}, c.boot || {}, kini); } // v1.4: data awal terbaru (bisa sudah diperbarui dari API) menang
      renderShellChrome();
      go(isInternal() ? firstAdminRoute() : 'home');
      if (c && c.d) syncNow(true); else loadAll();   // v1.3.1: dengan salinan, cukup sinkron selisih
      startSyncLoop();
      if (S.me.wajibGanti) setTimeout(forceChangePassword, 600);
      if (S.me.wajibPin) setTimeout(forceBuatPin, 600); // v1.3.5
    };
    if (cached && cached.d) mulai(cached);
    else {
      // salinan data besar ada di IndexedDB (asinkron): tahan layar pembuka sebentar agar tidak berkedip kosong
      const uid0 = S.me.id;
      pulihkanSalinanBesar(uid0).then(c => { if (S.me && S.me.id === uid0) mulai(c); tutupSplash(); });
      return;
    }
  } else {
    if (sess) { store.del('sess'); if (sess.token) setTimeout(() => toast('Sesi sebelumnya berakhir karena tidak ada aktivitas. Silakan masuk kembali.', 'info'), 600); }
    renderShellChrome();
    go('home');
  }
  tutupSplash();
}
function tutupSplash() {
  const sp = $('#splash');
  if (sp) { sp.classList.add('hide'); setTimeout(() => sp.remove(), 300); }
  window.__APP_READY__ = true;
}
// Jalankan tepat sekali, baik DOMContentLoaded belum maupun sudah terjadi
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

// ── v1.2: kunci AI Gemini (Super Admin) ──
ACT.aiSave = async b => {
  const v = $('#aiKey').value.trim();
  if (!v) { $('#aiKey').focus(); return toast('Tempel kunci API Gemini terlebih dulu.', 'warning'); }
  const r = await mutate('rahasia.simpan', { kunci: 'GEMINI_API_KEY', nilai: v, uji: true }, { btn: b, busyLabel: 'Menguji…', rerenderView: false });
  $('#aiKey').value = '';
  if (r.success) loadSecret();
};
ACT.aiDel = async b => {
  if (!(await confirmDlg({ title: 'Hapus kunci Gemini?', text: 'Nama barang dari foto tidak lagi terisi otomatis.', ok: 'Hapus', danger: true }))) return;
  const r = await mutate('rahasia.simpan', { kunci: 'GEMINI_API_KEY', nilai: '__HAPUS__' }, { btn: b, rerenderView: false });
  if (r.success) loadSecret();
};
ACT.aiModelSave = async b => {
  const v = $('#aiModel').value.trim().toLowerCase();
  const r = await mutate('rahasia.simpan', { kunci: 'GEMINI_MODEL', nilai: v || '__HAPUS__' }, { btn: b, rerenderView: false });
  if (r.success) loadSecret();
};

// ════════════════════════════════════════════════════════
// BAGIAN 29 (v1.2): QRIS, TAMBAH BARANG DARI FOTO, KUPU-KUPU LANDING
// ════════════════════════════════════════════════════════

// ── QRIS: baca kode statis, buat QRIS dinamis dengan nominal tagihan ──
const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
const JSQR_LIB = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
function muatPustaka(url, ada, simpan) {
  if (ada()) return Promise.resolve();
  if (!simpan.p) simpan.p = loadScript(url).catch(() => { simpan.p = null; throw new Error('Pustaka QR gagal dimuat. Periksa koneksi internet lalu coba lagi.'); });
  return simpan.p;
}
const _qrSimpan = {}, _jsqrSimpan = {};
const muatQrLib = () => muatPustaka(QR_LIB, () => !!window.qrcode, _qrSimpan);
const muatJsQr = () => muatPustaka(JSQR_LIB, () => !!window.jsQR, _jsqrSimpan);
const qrisAktif = () => (sett().qrisList || []).filter(q => q && q.aktif !== false && q.payload);

/** CRC16-CCITT (0x1021, awal 0xFFFF) sesuai tag 63 QRIS. */
function crc16Qris(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) & 0xFF) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return ('0000' + crc.toString(16).toUpperCase()).slice(-4);
}
function tlvQris(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    const id = s.substr(i, 2), lenS = s.substr(i + 2, 2), len = Number(lenS);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lenS) || i + 4 + len > s.length) return null;
    out.push({ id, val: s.substr(i + 4, len) }); i += 4 + len;
  }
  return out;
}
/** Periksa teks QRIS statis (cermin validasiQris_ server). */
function cekQris(payload) {
  const p = String(payload || '').replace(/[\r\n]+/g, '').trim();
  if (!/^000201/.test(p)) return { ok: false, message: 'Ini bukan kode QRIS. Pastikan gambar berisi QRIS usaha (bukan QR lain).' };
  if (!/6304[0-9A-Fa-f]{4}$/.test(p) || crc16Qris(p.slice(0, -4)) !== p.slice(-4).toUpperCase()) return { ok: false, message: 'Kode QRIS rusak atau terpotong. Unggah gambar yang lebih jelas.' };
  const t = tlvQris(p); if (!t) return { ok: false, message: 'Struktur kode QRIS rusak.' };
  const tag = id => (t.find(e => e.id === id) || {}).val || '';
  if (tag('58') !== 'ID') return { ok: false, message: 'QRIS harus dari merchant Indonesia.' };
  if (tag('54')) return { ok: false, message: 'QRIS ini sudah berisi nominal tetap (QRIS dinamis). Unggah QRIS statis usaha.' };
  return { ok: true, payload: p, merchant: tag('59'), kota: tag('60') };
}
/** QRIS statis → dinamis dengan nominal (tag 01=12, tag 54=nominal, CRC baru). */
function qrisDinamis(payload, nominal) {
  const t = tlvQris(String(payload).trim());
  if (!t) throw new Error('Kode QRIS tidak valid.');
  const list = t.filter(e => e.id !== '63' && e.id !== '54').map(e => e.id === '01' ? { id: '01', val: '12' } : e);
  const amt = { id: '54', val: String(Math.max(1, Math.round(Number(nominal) || 0))) };
  let pos = list.findIndex(e => e.id === '53');
  if (pos === -1) pos = list.findIndex(e => e.id === '58') - 1;
  list.splice(pos + 1, 0, amt);
  const body = list.map(e => e.id + String(e.val.length).padStart(2, '0') + e.val).join('') + '6304';
  return body + crc16Qris(body);
}
/** Gambar QR ke canvas (latar putih + zona tenang 4 modul). */
async function gambarQr(canvas, text, px) {
  await muatQrLib();
  const qr = window.qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(), q = 4;
  const sc = Math.max(2, Math.floor(px / (n + q * 2)));
  const size = sc * (n + q * 2);
  canvas.width = size; canvas.height = size;
  const c = canvas.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, size, size); c.fillStyle = '#111';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) c.fillRect((k + q) * sc, (r + q) * sc, sc, sc);
  canvas.dataset.qr = text;
  return canvas;
}
/** Baca isi QR dari berkas gambar: BarcodeDetector bawaan browser, cadangan jsQR. */
async function bacaQrDariFile(file) {
  const bmp = await new Promise((res, rej) => { const img = new Image(); const u = URL.createObjectURL(file); img.onload = () => { URL.revokeObjectURL(u); res(img); }; img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Gambar tidak dapat dibaca.')); }; img.src = u; });
  if ('BarcodeDetector' in window) {
    try {
      const fm = await BarcodeDetector.getSupportedFormats();
      if (fm.includes('qr_code')) { const hasil = await new BarcodeDetector({ formats: ['qr_code'] }).detect(bmp); const h = hasil.find(x => /^000201/.test(x.rawValue)) || hasil[0]; if (h && h.rawValue) return h.rawValue; }
    } catch (e) { /* lanjut ke jsQR */ }
  }
  await muatJsQr();
  for (const maks of [1100, 1700, 700]) {
    const s = Math.min(1, maks / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(bmp, 0, 0, cv.width, cv.height);
    const d = cx.getImageData(0, 0, cv.width, cv.height);
    const r = window.jsQR(d.data, cv.width, cv.height, { inversionAttempts: 'attemptBoth' });
    if (r && r.data) return r.data;
  }
  return null;
}

// ── Panel: daftar QRIS (Super Admin & Owner) ──
function qrisTabHtml() {
  const list = (S.settings.qrisList || []);
  return `<div class="row g-4"><div class="col-xl-8"><div class="cardx pad-lg"><div class="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-3"><div><b class="fs-5 d-block">QRIS untuk pembayaran member</b><span class="small muted">Unggah gambar QRIS statis usaha dari bank atau e-wallet. Saat member membayar, aplikasi membuat QRIS dengan nominal sesuai sisa tagihan.</span></div><button class="btn btn-primary" data-act="qrisForm"><i class="bi bi-plus-lg"></i>Tambah QRIS</button></div>
    ${list.length ? `<div class="qris-grid">${list.map(q => `<div class="qris-card ${q.aktif === false ? 'off' : ''}"><div class="qris-thumb"><canvas data-qris-prev="${esc(q.id)}" width="132" height="132" role="img" aria-label="QRIS ${esc(q.nama)}"></canvas></div>
      <div class="min-w-0 flex-fill"><b class="d-block clamp-1">${esc(q.nama)}</b><div class="small clamp-1">${esc(q.merchant || '-')}${q.kota ? ' · ' + esc(q.kota) : ''}</div><div class="small muted mono">…${esc(String(q.payload).slice(-10))}</div>
        <div class="d-flex align-items-center gap-2 mt-2 flex-wrap"><div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" data-act="qrisToggle" data-id="${esc(q.id)}" ${q.aktif !== false ? 'checked' : ''} aria-label="Tampilkan ${esc(q.nama)} ke member"></div><span class="small">${q.aktif !== false ? 'Tampil ke member' : 'Disembunyikan'}</span>
          <span class="ms-auto"><button class="icon-btn sm" data-act="qrisForm" data-id="${esc(q.id)}" aria-label="Ubah ${esc(q.nama)}"><i class="bi bi-pencil"></i></button><button class="icon-btn sm" data-act="qrisHapus" data-id="${esc(q.id)}" aria-label="Hapus ${esc(q.nama)}"><i class="bi bi-trash3"></i></button></span></div></div></div>`).join('')}</div>`
      : emptyState('bi-qr-code', 'Belum ada QRIS', 'Tambahkan QRIS usaha agar member bisa membayar dengan nominal otomatis.', '<button class="btn btn-primary" data-act="qrisForm">Tambah QRIS</button>')}</div></div>
    <div class="col-xl-4"><div class="cardx pad-lg"><b class="fs-6 d-block mb-2">Cara kerja</b><ol class="small text-2 ps-3 mb-0"><li>Unggah foto atau screenshot QRIS statis usaha yang jelas.</li><li>Aplikasi membaca kode QRIS dan memeriksa keasliannya.</li><li>Member menekan <b>Bayar sekarang → QRIS</b> di Pesanan Saya; QR dengan nominal sisa tagihan muncul.</li><li>Member membayar lewat aplikasi bank/e-wallet, lalu mengunggah bukti bayar.</li><li>Verifikasi di Pembayaran & Mutasi seperti biasa.</li></ol>
      <div class="note-box"><i class="bi bi-info-circle"></i><div>Pembayaran QRIS tidak terkonfirmasi otomatis. Cocokkan dengan mutasi rekening atau aplikasi merchant sebelum verifikasi.</div></div></div></div></div>`;
}
function renderQrisPreviews() {
  $$('[data-qris-prev]').forEach(cv => {
    const q = (S.settings.qrisList || []).find(x => x.id === cv.dataset.qrisPrev);
    if (!q) return;
    gambarQr(cv, q.payload, 132).catch(() => { if (q.fileId) cv.outerHTML = `<img src="${esc(driveImg(q.fileId, 300))}" alt="QRIS ${esc(q.nama)}" width="132" height="132" style="object-fit:contain">`; });
  });
}
function segarkanPengaturan(res) {
  S.settings = res.data.settings;
  S.boot.settings.qrisList = S.settings.qrisList;
  const el = $('#v-a-pengaturan'); if (el && S.route === 'a-pengaturan') { delete el.dataset.ready; aPengaturan(el, {}); }
}
ACT.qrisForm = b => {
  const q = b && b.dataset && b.dataset.id ? (S.settings.qrisList || []).find(x => x.id === b.dataset.id) : null;
  const st = { payload: q ? q.payload : '', file: null };
  modal({ title: q ? 'Ubah ' + q.nama : 'Tambah QRIS', body: `<form id="fQris" class="row g-3" novalidate>
      <div class="col-12"><label class="form-label" for="qrNama">Nama QRIS <span class="req">*</span></label><input class="form-control" id="qrNama" name="nama" maxlength="40" value="${esc(q ? q.nama : '')}" placeholder="Contoh: QRIS BCA Jastica"></div>
      <div class="col-12"><label class="form-label">Gambar QRIS ${q ? '(opsional, untuk mengganti)' : '<span class="req">*</span>'}</label>
        <label class="dropzone d-block" for="qrFile"><i class="bi bi-qr-code-scan"></i><div><b>Pilih foto atau screenshot QRIS</b></div><small>QR harus terlihat utuh dan tidak buram</small></label><input type="file" id="qrFile" accept="image/*" class="visually-hidden"></div>
      <div class="col-12"><div id="qrHasil">${q ? qrisHasilHtml(cekQris(q.payload)) : ''}</div><div id="qrErr" aria-live="polite"></div></div>
      <div class="col-12"><details class="small"><summary class="muted">Gambar tidak terbaca? Tempel teks QRIS</summary><textarea class="form-control form-control-sm mono mt-2" id="qrTeks" rows="3" placeholder="00020101021126…">${esc(q ? q.payload : '')}</textarea><div class="form-text">Teks QRIS bisa didapat dengan memindai QR memakai aplikasi pembaca QR biasa.</div></details></div>
      <div class="col-12"><label class="form-check form-switch"><input class="form-check-input" type="checkbox" name="aktif" ${!q || q.aktif !== false ? 'checked' : ''}> Tampilkan ke member</label></div></form>`,
    foot: '<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnQris"><i class="bi bi-check2"></i>Simpan QRIS</button>' });
  const setPayload = p => { const c = cekQris(p); st.payload = c.ok ? c.payload : ''; $('#qrHasil').innerHTML = qrisHasilHtml(c); return c; };
  $('#qrFile').onchange = async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    $('#qrHasil').innerHTML = '<div class="small muted"><span class="spin d-inline-block align-middle" style="width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></span> Membaca QRIS…</div>';
    try {
      const [teks, simpan] = await Promise.all([bacaQrDariFile(file), bacaBerkas(file, { maxW: 1000, quality: 0.9 })]);
      st.file = simpan;
      if (!teks) { st.payload = ''; $('#qrHasil').innerHTML = '<div class="alert-x danger"><i class="bi bi-x-circle"></i><div><b>QR tidak terbaca.</b> Pakai gambar yang lebih jelas (QR utuh, tidak terpotong), atau tempel teks QRIS di bawah.</div></div>'; return; }
      $('#qrTeks').value = teks; setPayload(teks);
      if (!$('#qrNama').value.trim() && st.payload) $('#qrNama').value = 'QRIS ' + (cekQris(teks).merchant || '').slice(0, 30);
    } catch (er) { $('#qrHasil').innerHTML = `<div class="alert-x danger"><i class="bi bi-x-circle"></i><div>${esc(er.message)}</div></div>`; }
  };
  $('#qrTeks').addEventListener('input', debounce(e => { if (e.target.value.trim()) setPayload(e.target.value); }, 300));
  $('#btnQris').onclick = async e => {
    const fm = $('#fQris'); clearErr(fm);
    const nama = fm.nama.value.trim();
    if (nama.length < 2) return fieldErr(fm, 'nama', 'Isi nama QRIS.');
    if (!st.payload) { const c = cekQris($('#qrTeks').value); if (!c.ok) return toast(c.message, 'warning'); st.payload = c.payload; }
    // v1.3.1: berkas dikirim tanpa salinan pratinjau (ukuran separuh); galat tampil di pop-up; cek ulang bila koneksi putus
    const file = st.file ? { base64: st.file.base64, mime: st.file.mime, nama: st.file.nama } : null;
    const payload = st.payload;
    const res = await simpanAman('qris.simpan', { id: q ? q.id : '', nama, payload, aktif: fm.aktif.checked, file }, e.currentTarget, () => (S.settings.qrisList || []).some(x => x.payload === payload), '#qrErr');
    if (res) { closeModal(); terapkanPengaturan(res); }
  };
};
function qrisHasilHtml(c) {
  return c.ok ? `<div class="alert-x info"><i class="bi bi-patch-check"></i><div><b>QRIS terbaca dan valid.</b><br>Merchant: <b>${esc(c.merchant || '-')}</b>${c.kota ? ' · ' + esc(c.kota) : ''}</div></div>`
    : `<div class="alert-x danger"><i class="bi bi-x-circle"></i><div>${esc(c.message)}</div></div>`;
}
ACT.qrisToggle = async b => {
  const q = (S.settings.qrisList || []).find(x => x.id === b.dataset.id); if (!q) return;
  const res = await mutate('qris.simpan', { id: q.id, nama: q.nama, payload: q.payload, aktif: b.checked }, { rerenderView: false });
  if (res.success) terapkanPengaturan(res); else b.checked = !b.checked;
};
ACT.qrisHapus = async b => {
  const q = (S.settings.qrisList || []).find(x => x.id === b.dataset.id); if (!q) return;
  if (!(await confirmDlg({ title: 'Hapus ' + q.nama + '?', text: 'Member tidak bisa lagi membayar dengan QRIS ini.', ok: 'Hapus', danger: true }))) return;
  const res = await mutate('qris.hapus', { id: q.id }, { rerenderView: false });
  if (res.success) terapkanPengaturan(res);
};

// ── Member: bayar dengan QRIS (nominal = sisa tagihan) ──
ACT.qrisBayar = b => {
  const o = orderById(b.dataset.id); const list = qrisAktif();
  if (!o || !list.length) return toast('QRIS belum tersedia. Silakan transfer ke rekening di invoice.', 'info');
  if (!(o.Sisa > 0)) return toast('Pesanan ini sudah lunas.', 'success');
  const q = list.find(x => x.id === S.ui.qrisSel) || list[0];
  S.ui.qrisSel = q.id;
  modal({ title: 'Bayar dengan QRIS', body: `${list.length > 1 ? `<div class="chips mb-3" role="radiogroup" aria-label="Pilih QRIS">${list.map(x => `<button class="chip ${x.id === q.id ? 'on' : ''}" data-act="qrisPilih" data-id="${esc(x.id)}" data-order="${o.ID}" role="radio" aria-checked="${x.id === q.id}">${esc(x.nama)}</button>`).join('')}</div>` : ''}
      <div class="qris-pay"><div class="qris-amt"><span>Total bayar</span><b class="num">${rp(o.Sisa)}</b><small>Pesanan ${esc(o.NoOrder)}</small></div>
        <div class="qris-frame"><div class="qris-head"><i class="bi bi-qr-code-scan"></i>Scan QRIS</div><div class="qris-canvas" id="qrisBox"><span class="spin" aria-hidden="true"></span></div>
          <div class="qris-merchant"><b>${esc(q.merchant || q.nama)}</b>${q.kota ? `<span>${esc(q.kota)}</span>` : ''}</div></div>
        <ol class="qris-steps small"><li>Buka aplikasi m-banking atau e-wallet, pilih <b>Scan / Bayar QRIS</b>.</li><li>Membayar dari HP ini? Tekan <b>Simpan gambar QR</b>, lalu pilih gambar itu dari galeri di menu scan.</li><li>Pastikan nominal <b>${rp(o.Sisa)}</b> dan nama merchant sesuai, lalu bayar.</li><li>Setelah berhasil, tekan <b>Saya sudah bayar</b> dan unggah bukti pembayaran.</li></ol></div>`,
    foot: `<button class="btn btn-light" data-act="qrisUnduh" data-order="${o.ID}"><i class="bi bi-download"></i>Simpan gambar QR</button><button class="btn btn-primary" data-act="custBayar" data-id="${o.ID}" data-metode="QRIS"><i class="bi bi-check2-circle"></i>Saya sudah bayar</button>` });
  const box = $('#qrisBox');
  let teks;
  try { teks = qrisDinamis(q.payload, o.Sisa); } catch (e) { teks = null; }
  const cv = document.createElement('canvas'); cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Kode QRIS senilai ' + rp(o.Sisa)); cv.id = 'qrisCanvas';
  if (!teks) { box.innerHTML = '<div class="small text-danger p-3">Kode QRIS tidak valid. Hubungi admin.</div>'; return; }
  gambarQr(cv, teks, 264).then(() => { box.innerHTML = ''; box.appendChild(cv); })
    .catch(er => { box.innerHTML = q.fileId ? `<img src="${esc(driveImg(q.fileId, 600))}" alt="QRIS ${esc(q.nama)}"><div class="small p-2" style="color:#B45309">QR otomatis gagal dibuat (${esc(er.message)}). Scan QR ini dan masukkan nominal <b>${rp(o.Sisa)}</b> secara manual.</div>` : `<div class="small text-danger p-3">${esc(er.message)}</div>`; });
};
ACT.qrisPilih = b => { S.ui.qrisSel = b.dataset.id; ACT.qrisBayar({ dataset: { id: b.dataset.order } }); };
ACT.qrisUnduh = b => {
  const cv = $('#qrisCanvas'); const o = orderById(b.dataset.order);
  if (!cv || !o) return toast('QR belum siap.', 'warning');
  const q = qrisAktif().find(x => x.id === S.ui.qrisSel) || qrisAktif()[0] || {};
  const W = 640, H = 820, out = document.createElement('canvas'); out.width = W; out.height = H;
  const c = out.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#1F1B3A'; c.textAlign = 'center';
  c.font = '700 30px "Plus Jakarta Sans", Arial, sans-serif'; c.fillText(String(q.merchant || q.nama || 'QRIS').slice(0, 30), W / 2, 62);
  c.font = '500 20px "Plus Jakarta Sans", Arial, sans-serif'; c.fillStyle = '#6B6885'; c.fillText('Scan dengan aplikasi bank / e-wallet', W / 2, 96);
  c.imageSmoothingEnabled = false; c.drawImage(cv, (W - 520) / 2, 120, 520, 520);
  c.fillStyle = '#1F1B3A'; c.font = '800 40px "Plus Jakarta Sans", Arial, sans-serif'; c.fillText(rp(o.Sisa), W / 2, 708);
  c.font = '500 20px "Plus Jakarta Sans", Arial, sans-serif'; c.fillStyle = '#6B6885'; c.fillText('Pesanan ' + o.NoOrder + ' · ' + (sett().appName || 'Jastica'), W / 2, 748);
  out.toBlob(bl => { if (bl) downloadBlob(bl, 'QRIS-' + String(o.NoOrder).replace(/[^\w-]+/g, '') + '.png'); }, 'image/png');
  toast('Gambar QR disimpan. Buka aplikasi pembayaran lalu pilih gambar ini dari galeri.', 'success');
};

// ── Katalog: tambah barang dari foto (kamera / unggah) + nama otomatis ──
async function itemDariFoto(file) {
  try {
    const [foto, kecil] = await Promise.all([fotoPersegi(file), bacaBerkas(file, { maxW: 768, quality: 0.8 })]); // v1.3.5: foto persegi utuh
    if (!foto || !foto.preview) return toast('Pilih file gambar (JPG/PNG).', 'warning');
    ACT.itemForm(null, { foto, kecil });
  } catch (e) { toast(e.message, 'error'); }
}
async function itemFormFoto(f, pre, kats) {
  // v1.3.5: foto dari kamera/unggah menjadi foto pertama di galeri barang
  if (S.ui.galForm) { S.ui.galForm.list.push({ file: { base64: pre.foto.base64, mime: pre.foto.mime, nama: pre.foto.nama }, src: pre.foto.preview }); renderGaleriForm(); }
  const disentuh = {};
  f.addEventListener('input', e => { if (e.target.name) disentuh[e.target.name] = true; });
  f.addEventListener('change', e => { if (e.target.name) disentuh[e.target.name] = true; });
  const r = await api('item.kenali', { gambar: { base64: pre.kecil.base64, mime: pre.kecil.mime }, kategori: kats }, { silent: true });
  if ($('#fItem') !== f) return; // pop-up sudah ditutup / diganti
  const ban = $('#aiBanner');
  f.nama.placeholder = '';
  if (r.success) {
    const d = r.data;
    if (!disentuh.nama && !f.nama.value.trim()) f.nama.value = d.nama;
    if (!disentuh.kategori && !f.kategori.value.trim() && d.kategori) f.kategori.value = d.kategori;
    if (!disentuh.negara && d.negara && countries().some(c => c.kode === d.negara)) f.negara.value = d.negara;
    if (!disentuh.deskripsi && !f.deskripsi.value.trim() && d.deskripsi) f.deskripsi.value = d.deskripsi;
    f.dispatchEvent(new Event('input')); // perbarui pratinjau harga & mata uang
    ban.className = 'ai-banner ok';
    ban.innerHTML = `<i class="bi bi-stars" aria-hidden="true"></i><div><b>Diisi otomatis dari foto.</b><div class="small">Periksa nama dan negara, lalu isi harga di toko.${d.yakin && d.yakin < 0.6 ? ' Hasil kurang yakin, mohon dicek ulang.' : ''}</div></div>`;
    fokusAwal(f.hargaAsli);
  } else {
    ban.className = 'ai-banner warn';
    const pasang = r.code === 'NO_AI_KEY' && S.me.role === 'superadmin' ? ' <button type="button" class="link-btn" data-act="aiPasang">Pasang kunci AI</button>' : '';
    ban.innerHTML = `<i class="bi bi-exclamation-circle" aria-hidden="true"></i><div><b>Nama belum bisa diisi otomatis.</b><div class="small">${esc(r.message)}${pasang}</div></div>`;
    fokusAwal(f.nama);
  }
}
ACT.aiPasang = () => { closeModal(); S.ui.set = { tab: 'keamanan' }; const el = $('#v-a-pengaturan'); if (el) delete el.dataset.ready; go('a-pengaturan'); };

// ── Landing page: kupu-kupu mengikuti kursor, hinggap saat kursor diam ──
const KUPU_SVG = `<svg viewBox="0 0 64 56" width="44" height="39" aria-hidden="true">
  <defs><linearGradient id="kpA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE27A"/><stop offset=".5" stop-color="#FFB547"/><stop offset="1" stop-color="#FF7E5F"/></linearGradient>
    <linearGradient id="kpB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8CC6"/><stop offset="1" stop-color="#B57BFF"/></linearGradient></defs>
  <g class="kp-w kp-l"><path d="M31 25C26 10 14 3 6 6 0 9 2 20 9 25c6 4 15 3 22 0Z" fill="url(#kpA)" stroke="#2B1F55" stroke-width="1.3"/>
    <path d="M31 28C24 30 12 33 9 41c-2 6 4 10 10 7 6-3 11-11 12-20Z" fill="url(#kpB)" stroke="#2B1F55" stroke-width="1.3"/>
    <circle cx="13" cy="13" r="2.6" fill="#fff" opacity=".9"/><circle cx="19" cy="19" r="1.6" fill="#FFF6D5"/><circle cx="16" cy="40" r="1.8" fill="#fff" opacity=".85"/></g>
  <g class="kp-w kp-r"><path d="M33 25C38 10 50 3 58 6c6 3 4 14-3 19-6 4-15 3-22 0Z" fill="url(#kpA)" stroke="#2B1F55" stroke-width="1.3"/>
    <path d="M33 28c7 2 19 5 22 13 2 6-4 10-10 7-6-3-11-11-12-20Z" fill="url(#kpB)" stroke="#2B1F55" stroke-width="1.3"/>
    <circle cx="51" cy="13" r="2.6" fill="#fff" opacity=".9"/><circle cx="45" cy="19" r="1.6" fill="#FFF6D5"/><circle cx="48" cy="40" r="1.8" fill="#fff" opacity=".85"/></g>
  <ellipse cx="32" cy="28" rx="2.4" ry="12" fill="#2B1F55"/><circle cx="32" cy="15" r="2.6" fill="#2B1F55"/>
  <path d="M31 13c-2-5-5-8-8-9M33 13c2-5 5-8 8-9" stroke="#2B1F55" stroke-width="1.2" fill="none" stroke-linecap="round"/><circle cx="23" cy="4" r="1.3" fill="#2B1F55"/><circle cx="41" cy="4" r="1.3" fill="#2B1F55"/>
</svg>`;
function kupuInit() {
  if (window.__kupu || !window.matchMedia) return;
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const el = document.createElement('div');
  el.className = 'kupu'; el.setAttribute('aria-hidden', 'true'); el.innerHTML = KUPU_SVG;
  document.body.appendChild(el);
  const W = 44, H = 39;
  const k = { x: -100, y: -100, vx: 0, vy: 0, tx: 0, ty: 0, h: 0, ada: false, diam: 0, raf: 0, t0: 0 };
  window.__kupu = k;
  const aktif = () => S.route === 'home' && document.body.dataset.shell === 'pub' && !document.hidden && !document.body.classList.contains('modal-open');
  document.addEventListener('mousemove', e => {
    k.tx = e.clientX; k.ty = e.clientY;
    if (!k.ada) { k.x = e.clientX + 140; k.y = e.clientY - 110; k.ada = true; }
  }, { passive: true });
  const tick = t => {
    if (!aktif()) { k.raf = 0; el.classList.remove('on'); return; }
    // titik hinggap: tepat di ujung kursor (badan kupu-kupu sedikit di atasnya)
    const gx = k.tx + 3, gy = k.ty - 14;
    const dx = gx - k.x, dy = gy - k.y, jarak = Math.hypot(dx, dy);
    k.vx = (k.vx + dx * 0.014) * 0.86; k.vy = (k.vy + dy * 0.014) * 0.86;
    const laju = Math.hypot(k.vx, k.vy);
    const terbang = jarak > 1.6 || laju > 0.25;
    if (terbang) {
      const goyang = Math.min(1, laju / 6);
      k.x += k.vx + Math.sin(t / 95) * 0.9 * goyang;
      k.y += k.vy + Math.cos(t / 70) * 1.3 * goyang;
      k.diam = 0;
    } else { k.x = gx; k.y = gy; k.vx = k.vy = 0; k.diam++; }
    // arah kepala mengikuti arah terbang; saat hinggap kembali tegak perlahan
    const target = laju > 0.6 ? Math.atan2(k.vy, k.vx) * 180 / Math.PI + 90 : 0;
    let d = ((target - k.h + 540) % 360) - 180;
    if (laju <= 0.6) d = Math.max(-35, Math.min(35, d));
    k.h += d * (laju > 0.6 ? 0.12 : 0.06);
    el.style.transform = `translate3d(${k.x - W / 2}px,${k.y - H / 2}px,0) rotate(${k.h.toFixed(1)}deg)`;
    el.classList.toggle('hinggap', k.diam > 20);
    el.classList.toggle('on', k.ada);
    k.raf = requestAnimationFrame(tick);
  };
  setInterval(() => { if (!k.raf && aktif() && k.ada) k.raf = requestAnimationFrame(tick); if (!aktif()) el.classList.remove('on'); }, 300);
  document.addEventListener('mousemove', () => { if (!k.raf && aktif()) k.raf = requestAnimationFrame(tick); }, { passive: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kupuInit); else setTimeout(kupuInit, 0);

// ════════════════════════════════════════════════════════
// BAGIAN 30 (v1.3): SESI — keluar otomatis setelah diam & satu perangkat ditutup segera
// Catatan: modul ini memakai deklarasi function (ter-hoist) dan state malas di window,
// sehingga aman walau init() berjalan sebelum bagian ini dieksekusi.
// ════════════════════════════════════════════════════════
function idleMs() { return (Number(S.boot && S.boot.idleMenit) || 5) * 60e3; }
function sesiSt() { return window.__jstSesi || (window.__jstSesi = { last: Date.now(), idleT: null, cekT: null, ping: false, warn: false, tulisT: 0 }); }
/** Selisih jam server − jam perangkat (agar jam HP yang meleset tidak memutus sesi). Dihitung saat halaman dimuat. */
function skewMs() { return Number(window.__jstSkew) || 0; }
function kodeSesiHabis(c) { return c === 'SESSION_REPLACED' || c === 'SESSION_INVALID' || c === 'SESSION_IDLE'; }
function tokSid(t) {
  try { let b = String(t || '').split('.')[0].replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '='; return JSON.parse(atob(b)).s || ''; } catch (e) { return ''; }
}
/** Token bergulir dari server → pakai bila milik sesi yang sama dan lebih baru. */
function terimaToken(tok, exp) {
  if (!tok || !S.token || tokSid(tok) !== tokSid(S.token)) return;
  if (exp && S.tokExp && exp < S.tokExp) return;
  S.token = tok; if (exp) S.tokExp = exp;
  const s = store.get('sess');
  if (s && tokSid(s.token) === tokSid(tok)) { s.token = tok; s.exp = S.tokExp; store.set('sess', s); }
}
/** Tab lain mungkin sudah memperpanjang sesi yang sama → ambil token terbarunya. */
function ambilTokenTerbaru() {
  if (!S.token) return;
  const s = store.get('sess');
  if (s && s.token && s.token !== S.token && (s.exp || 0) > (S.tokExp || 0) && tokSid(s.token) === tokSid(S.token)) { S.token = s.token; S.tokExp = s.exp; }
}
function aktivitasTerakhir() { return Math.max(sesiSt().last, Number(store.get('lastAct', 0)) || 0); }
function batasSesi() {
  ambilTokenTerbaru();
  const a = aktivitasTerakhir() + idleMs();
  return S.tokExp ? Math.min(a, S.tokExp - skewMs()) : a;
}
function sesiMasihBerlaku(sess) {
  if (!sess || !sess.token) return false;
  if (sess.exp && sess.exp - skewMs() <= Date.now()) return false;
  const last = Number(store.get('lastAct', 0)) || 0;
  return !last || Date.now() - last < idleMs();
}
function catatAktivitas() {
  const st = sesiSt(), now = Date.now();
  if (!S.token) return;
  if (now >= batasSesi()) return keluarKarenaDiam(); // sudah lewat batas: jangan diperpanjang diam-diam
  st.last = now;
  if (now - st.tulisT > 4000) { st.tulisT = now; store.set('lastAct', now); }
  if (st.warn) sembunyikanPeringatanDiam();
  // Perpanjang sesi di server bila token sudah berumur > 30 detik (panggilan ringan)
  if (!st.ping && S.tokExp && S.tokExp - skewMs() - now < idleMs() - 30e3) {
    st.ping = true;
    api('auth.ping', {}, { silent: true }).then(() => { st.ping = false; });
  }
}
function cekDiam() {
  if (!S.token) return;
  const sisa = batasSesi() - Date.now();
  if (sisa <= 0) return keluarKarenaDiam();
  if (sisa <= 30e3) tampilkanPeringatanDiam(Math.ceil(sisa / 1000));
  else if (sesiSt().warn) sembunyikanPeringatanDiam();
}
function keluarKarenaDiam() {
  sembunyikanPeringatanDiam();
  if (!S.token) return;
  if (S.route === 'a-form') { try { formAutosaveFlush(); } catch (e) { /* abaikan */ } } // draf pesanan tetap aman
  // Server tidak perlu dihubungi: token di server kedaluwarsa dengan sendirinya.
  sessionEnded({ message: 'Anda keluar otomatis karena tidak ada aktivitas selama ' + Math.round(idleMs() / 60e3) + ' menit. Silakan masuk kembali.' });
}
function tampilkanPeringatanDiam(dtk) {
  let el = document.getElementById('idleWarn');
  if (!el) {
    el = document.createElement('div');
    el.id = 'idleWarn'; el.className = 'idle-warn'; el.setAttribute('role', 'alert');
    el.innerHTML = `<i class="bi bi-hourglass-split" aria-hidden="true"></i><div class="min-w-0"><b>Masih di sana?</b><div class="small">Anda akan keluar otomatis dalam <b class="num" data-idle-dtk></b> detik karena tidak ada aktivitas.</div></div><button type="button" class="btn btn-sm btn-primary" data-idle-ok>Tetap masuk</button>`;
    document.body.appendChild(el);
  }
  el.querySelector('[data-idle-dtk]').textContent = dtk; // hanya angka yang diperbarui (tombol tidak dibuat ulang)
  el.classList.add('on');
  sesiSt().warn = true;
}
function sembunyikanPeringatanDiam() {
  const el = document.getElementById('idleWarn');
  if (el) el.classList.remove('on');
  sesiSt().warn = false;
}
function mulaiPantauSesi() {
  const st = sesiSt();
  clearInterval(st.idleT); clearInterval(st.cekT);
  st.last = Date.now(); st.tulisT = st.last; store.set('lastAct', st.last);
  st.idleT = setInterval(cekDiam, 1000);
  // Satu perangkat: cek ringan tiap 15 detik saat tab terlihat (tidak memperpanjang sesi)
  st.cekT = setInterval(() => { if (document.visibilityState === 'visible') cekPerangkat(); }, 15000);
}
function hentikanPantauSesi() {
  const st = sesiSt();
  clearInterval(st.idleT); clearInterval(st.cekT);
  sembunyikanPeringatanDiam();
}
async function cekPerangkat(paksa) {
  if (!S.token || _syncing) return;
  if (!paksa && Date.now() - S.lastSync < 8000) return; // baru saja sinkron: sesi sudah diperiksa
  const res = await api('auth.cek', {}, { silent: true });
  if (res.success && res.data && res.data.ver && res.data.ver !== S.ver) scheduleSync(50);
}
(function pasangPemantauAktivitas() {
  let tGerak = 0;
  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev => document.addEventListener(ev, catatAktivitas, { passive: true, capture: true }));
  document.addEventListener('scroll', () => { const n = Date.now(); if (n - tGerak > 1000) { tGerak = n; catatAktivitas(); } }, { passive: true, capture: true });
  document.addEventListener('mousemove', () => { const n = Date.now(); if (n - tGerak > 1000) { tGerak = n; catatAktivitas(); } }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.token) { cekDiam(); if (S.token && Date.now() - S.lastSync > 8000) cekPerangkat(true); } });
  window.addEventListener('focus', () => { if (S.token) cekDiam(); });
  window.addEventListener('storage', e => {
    if (e.key !== 'jst_sess' || e.newValue || !S.token) return;
    let lama = null; try { lama = JSON.parse(e.oldValue || 'null'); } catch (er) { lama = null; }
    if (!lama || tokSid(lama.token) !== tokSid(S.token)) return; // sesi akun lain di tab lain: abaikan
    const diam = Date.now() - aktivitasTerakhir() >= idleMs() - 2000;
    sessionEnded({ message: diam ? 'Anda keluar otomatis karena tidak ada aktivitas selama ' + Math.round(idleMs() / 60e3) + ' menit. Silakan masuk kembali.' : 'Anda telah keluar dari akun ini di tab lain.' });
  });
})();

// ════════════════════════════════════════════════════════
// BAGIAN 31 (v1.3): OTP WAJIB UNTUK PENGURUS (setelah kata sandi benar)
// ════════════════════════════════════════════════════════
ROUTES.verifikasi = { shell: 'pub', title: 'Verifikasi Masuk', r: vVerifikasi, guest: true };
function kanalOpsi(v, ic, label, tujuan, ingat) {
  const last = ingat === v && tujuan;
  return `<button type="button" class="kanal-opt" data-act="v2faKirim" data-k="${v}" ${tujuan ? '' : 'disabled'}>
    <span class="kanal-ic ${v}" aria-hidden="true"><i class="bi ${ic}"></i></span>
    <span class="min-w-0 flex-fill text-start"><b class="d-block">${label}</b><small class="muted">${tujuan ? 'Kirim kode ke ' + esc(tujuan) : (v === 'wa' ? 'Belum tersedia untuk akun ini' : 'Email belum diisi di akun ini')}</small></span>
    ${last ? '<span class="pill primary nodot sm">Terakhir</span>' : '<i class="bi bi-chevron-right muted" aria-hidden="true"></i>'}</button>`;
}
function kotakOtpHtml() {
  return `<div class="otp-boxes" id="otpBoxes">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" maxlength="1" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" aria-label="Digit ${i + 1}">`).join('')}</div>`;
}
function pasangKotakOtp(boxes, penuh) {
  boxes.forEach((b, i) => {
    b.addEventListener('input', () => { b.value = b.value.replace(/\D/g, '').slice(-1); if (b.value && boxes[i + 1]) boxes[i + 1].focus(); if (boxes.every(x => x.value)) penuh(); });
    b.addEventListener('keydown', e => { if (e.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus(); });
    b.addEventListener('paste', e => { const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (t.length) { e.preventDefault(); t.split('').forEach((c, j) => { if (boxes[j]) boxes[j].value = c; }); boxes[Math.min(5, t.length)].focus(); if (t.length === 6) penuh(); } });
  });
}
let _2faTimer = null;
function vVerifikasi(el, p, re) {
  if (re) return;
  if (!p.tiket) return go('login', {}, { force: true });
  clearInterval(_2faTimer);
  const k = p.kanal || {};
  if (!p.terkirim) {
    const ingat = store.get('kanal2fa', '');
    el.innerHTML = `<div class="cardx auth-card">
      <div class="auth-logo"><span class="kpi-ic" style="width:60px;height:60px;font-size:26px;border-radius:18px"><i class="bi bi-shield-lock"></i></span></div>
      <h1>Verifikasi masuk</h1><p class="sub">Halo <b>${esc(p.nama || '')}</b>. Demi keamanan panel pengurus, masukkan kode verifikasi. Pilih cara menerima kode:</p>
      <div class="kanal-list">${kanalOpsi('wa', 'bi-whatsapp', 'WhatsApp', k.wa, ingat)}${kanalOpsi('email', 'bi-envelope', 'Email', k.email, ingat)}</div>
      <p class="text-center mt-3 mb-0"><button class="link-btn" data-act="v2faBatal"><i class="bi bi-arrow-left"></i> Kembali ke halaman masuk</button></p></div>`;
    return;
  }
  const wa = p.kanalAktif === 'wa';
  el.innerHTML = `<div class="cardx auth-card">
    <div class="auth-logo"><span class="kpi-ic" style="width:60px;height:60px;font-size:26px;border-radius:18px"><i class="bi ${wa ? 'bi-whatsapp' : 'bi-envelope'}"></i></span></div>
    <h1>Masukkan kode verifikasi</h1>
    <p class="sub">Kode 6 digit dikirim ke ${wa ? 'WhatsApp' : 'email'} <b>${esc(p.tujuan || '')}</b></p>
    <div id="otpErr"></div>
    <form id="f2fa" novalidate>${kotakOtpHtml()}
      <div class="d-flex justify-content-between small mb-3"><span class="muted">Kode berlaku <b id="otpLeft">05:00</b></span><button type="button" class="link-btn" id="otpResend" disabled>Kirim ulang kode</button></div>
      <button class="btn btn-primary btn-lg w-100" type="submit"><i class="bi bi-shield-check"></i>Verifikasi &amp; masuk</button>
    </form>
    <p class="text-center mt-3 mb-0"><button class="link-btn" data-act="v2faGanti"><i class="bi bi-arrow-repeat"></i> Pakai cara lain</button></p></div>`;
  const boxes = $$('#otpBoxes input');
  pasangKotakOtp(boxes, () => $('#f2fa').requestSubmit());
  boxes[0].focus();
  let left = 300, cool = 60;
  const resend = $('#otpResend');
  _2faTimer = setInterval(() => {
    if (!document.body.contains(resend)) return clearInterval(_2faTimer);
    left = Math.max(0, left - 1); cool = Math.max(0, cool - 1);
    $('#otpLeft').textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
    resend.disabled = cool > 0;
    resend.textContent = cool > 0 ? `Kirim ulang (${cool} dtk)` : 'Kirim ulang kode';
  }, 1000);
  resend.onclick = async () => {
    setBusy(resend, true);
    const r = await api('auth.2faKirim', { tiket: p.tiket, kanal: p.kanalAktif });
    setBusy(resend, false);
    if (!r.success) { if (r.code === 'TIKET_HABIS') { toast(r.message, 'warning'); return go('login', {}, { force: true }); } return toast(r.message, 'error'); }
    toast(r.message, r.data.gagal ? 'warning' : 'success');
    if (!r.data.gagal) { left = 300; cool = 60; }
  };
  $('#f2fa').onsubmit = async e => {
    e.preventDefault();
    const kode = boxes.map(b => b.value).join('');
    if (kode.length !== 6) return toast('Masukkan 6 digit kode.', 'warning');
    const btn = e.target.querySelector('[type=submit]');
    setBusy(btn, true, 'Memverifikasi…');
    const res = await api('auth.2faVerifikasi', { tiket: p.tiket, kode, device: deviceLabel() });
    setBusy(btn, false);
    if (res.success) { clearInterval(_2faTimer); toast(res.message, 'success'); startSession(res.data, p.next); return; }
    if (res.code === 'TIKET_HABIS') { clearInterval(_2faTimer); toast(res.message, 'warning'); return go('login', {}, { force: true }); }
    const box = $('#otpBoxes'); box.classList.remove('err'); void box.offsetWidth; box.classList.add('err');
    $('#otpErr').innerHTML = `<div class="alert-x danger"><i class="bi bi-exclamation-triangle"></i><div><b>Kode tidak valid</b><br>${esc(res.message)}</div></div>`;
    boxes.forEach(b => { b.value = ''; }); boxes[0].focus();
  };
}
ACT.v2faKirim = async b => {
  const p = S.params; const kanal = b.dataset.k;
  setBusy(b, true, 'Mengirim kode…');
  const r = await api('auth.2faKirim', { tiket: p.tiket, kanal });
  setBusy(b, false);
  if (!r.success) {
    if (r.code === 'TIKET_HABIS') { toast(r.message, 'warning'); return go('login', {}, { force: true }); }
    return toast(r.message, 'error');
  }
  if (r.data.gagal) return toast(r.message, 'warning', 'Kode belum terkirim');
  store.set('kanal2fa', kanal);
  toast(r.message, 'success');
  Object.assign(p, { terkirim: true, kanalAktif: kanal, tujuan: r.data.tujuan });
  vVerifikasi($('#v-verifikasi'), p);
};
ACT.v2faGanti = () => { const p = S.params; p.terkirim = false; vVerifikasi($('#v-verifikasi'), p); };
ACT.v2faBatal = () => { clearInterval(_2faTimer); go('login', {}, { force: true }); };

/** Super Admin: saklar OTP pengurus + kesiapan kanal tiap pengurus. */
function otpPengurusKartu() {
  const on = S.settings.otpPengurus === true;
  const staf = (S.d.users || []).filter(u => u.Role !== 'customer' && u.Status === 'Aktif');
  return `<div class="cardx pad-lg mb-4" id="otpPgrCard"><div class="d-flex justify-content-between align-items-start gap-3">
      <div class="min-w-0"><b class="fs-5 d-block mb-1"><i class="bi bi-shield-lock me-2" style="color:var(--primary)"></i>Verifikasi OTP untuk pengurus</b>
        <p class="muted small mb-0">Saat aktif, Super Admin, Owner, Admin Keuangan, dan Staff wajib memasukkan kode OTP setiap kali masuk. Pengurus memilih kode dikirim lewat WhatsApp atau email. Member tidak terpengaruh.</p></div>
      <div class="form-check form-switch m-0 fs-4"><input class="form-check-input" type="checkbox" role="switch" id="otpPgr" data-act="otpPengurusSaklar" ${on ? 'checked' : ''} aria-label="Wajibkan OTP untuk pengurus"></div></div>
    <div class="small fw-bold mt-3 mb-2">${on ? '<span style="color:var(--mint-ink)"><i class="bi bi-check-circle-fill"></i> Aktif</span>' : '<span class="muted">Nonaktif</span>'} · Kesiapan pengurus menerima kode</div>
    <div class="otp-staf">${staf.map(u => {
      const wa = /^62\d{8,13}$/.test(normHP(u.HP)), em = !!u.Email;
      return `<div class="otp-staf-row"><span class="min-w-0 flex-fill"><b class="d-block text-truncate">${esc(u.Nama)}</b><small class="muted">${esc(ROLE_LABEL[u.Role] || u.Role)}</small></span>
        <span class="pill sm nodot ${wa ? 'st-aktif' : ''}"><i class="bi bi-whatsapp"></i>${wa ? 'WhatsApp' : 'WA —'}</span><span class="pill sm nodot ${em ? 'st-aktif' : ''}"><i class="bi bi-envelope"></i>${em ? 'Email' : 'Email —'}</span>
        ${!wa && !em ? '<span class="pill sm nodot st-nonaktif">Belum bisa menerima kode</span>' : ''}</div>`;
    }).join('')}</div>
    <div class="form-text mt-2">Lengkapi nomor WhatsApp atau email pengurus di menu Manajemen User. Kode lewat WhatsApp butuh token Fonnte aktif.</div>
    <div class="note-box mt-3"><i class="bi bi-life-preserver"></i><div>Terkunci karena kode tidak sampai? Jalankan fungsi <code>matikanOtpPengurus</code> dari editor Apps Script, lalu masuk dengan kata sandi seperti biasa.</div></div></div>`;
}
ACT.otpPengurusSaklar = async b => {
  const on = b.checked;
  if (on && !(await confirmDlg({ title: 'Wajibkan OTP untuk pengurus?', text: 'Mulai login berikutnya, setiap pengurus harus memasukkan kode OTP dari WhatsApp atau email. Pastikan nomor/email semua pengurus sudah benar.', ok: 'Aktifkan', icon: 'bi-shield-lock' }))) { b.checked = false; return; }
  const res = await mutate('settings.simpan', { values: { otpPengurus: on } }, { rerenderView: false });
  if (res.success) { S.settings = res.data.settings; const c = $('#otpPgrCard'); if (c) c.outerHTML = otpPengurusKartu(); }
  else b.checked = !on;
};

// BAGIAN 32 (v1.3): masuk cepat dengan PIN per perangkat — dihapus di v1.3.5 (member kini masuk dengan PIN 6 digit, lihat BAGIAN 41)

// ════════════════════════════════════════════════════════
// BAGIAN 33 (v1.3): MEMBER — foto profil (v1.3.5: juga pengurus, dengan atur posisi & zoom)
// ════════════════════════════════════════════════════════
function fotoMember() { return isCustomer() ? ((S.customer && S.customer.Foto) || '') : ((S.me && S.me.foto) || ''); }
function avatarMember(cls = '') {
  const f = fotoMember();
  if (!f) return avatar(S.me.nama, cls).replace('<span ', '<span data-foto="" ');
  const src = S.ui.fotoPrev && S.ui.fotoPrev.id === f ? S.ui.fotoPrev.url : driveImg(f, 240);
  return `<span class="avatar has-foto ${cls}" data-foto="${esc(f)}" data-c="${colorIdx(S.me.nama)}" aria-hidden="true">${esc(initials(S.me.nama))}<img src="${esc(src)}" alt="" onerror="this.remove()"></span>`;
}
function fotoProfilHtml() {
  return `<div class="ava-edit">${avatarMember('lg')}<button type="button" class="ava-cam" data-act="fotoPilih" aria-label="Ganti foto profil" title="Ganti foto profil"><i class="bi bi-camera-fill" aria-hidden="true"></i></button><input type="file" id="fotoProfilIn" accept="image/*" class="d-none" tabindex="-1" aria-hidden="true"></div>`;
}
function fotoAksiHtml() {
  return `<span class="d-inline-flex gap-3 small" id="fotoAksi"><button type="button" class="link-btn" data-act="fotoPilih"><i class="bi bi-camera"></i> ${fotoMember() ? 'Ganti foto' : 'Tambah foto profil'}</button>${fotoMember() ? '<button type="button" class="link-btn text-danger" data-act="fotoHapus"><i class="bi bi-trash3"></i> Hapus</button>' : ''}</span>`;
}
function segarkanFotoUi(bilaBerubah) {
  const a = $('.ava-edit .avatar');
  if (bilaBerubah && (!a || (a.dataset.foto || '') === fotoMember())) return;
  if (a) a.outerHTML = avatarMember('lg');
  const k = $('#fotoAksi'); if (k) k.outerHTML = fotoAksiHtml();
  if (isInternal()) renderUserChip(); else renderPubNav();
}
ACT.fotoPilih = () => { const i = $('#fotoProfilIn'); if (i) { i.value = ''; i.click(); } };
document.addEventListener('change', e => { if (e.target.id === 'fotoProfilIn' && e.target.files[0]) fotoDipilih(e.target.files[0]); });
function muatGambar(file) {
  return new Promise((ok, gagal) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); gagal(new Error('Gambar tidak dapat dibaca. Pilih foto JPG atau PNG.')); };
    img.src = url;
  });
}
/** v1.3.5: foto dibuka di editor (geser posisi, zoom, putar) sebelum diunggah. */
function fotoDipilih(file) { editorFotoProfil(file); }
ACT.fotoHapus = async () => {
  if (!(await confirmDlg({ title: 'Hapus foto profil?', text: 'Avatar kembali menampilkan inisial nama Anda.', ok: 'Hapus', danger: true }))) return;
  const res = await mutate('profil.foto', { hapus: true }, { rerenderView: false });
  if (res.success) { if (isCustomer()) S.customer = Object.assign({}, S.customer || {}, { Foto: '' }); else simpanMeSesi(res.data.me || Object.assign({}, S.me, { foto: '' })); S.ui.fotoPrev = null; segarkanFotoUi(); persist(); }
};

// ════════════════════════════════════════════════════════
// BAGIAN 34 (v1.3): MEMBER — pilih metode bayar: transfer, QRIS, e-wallet
// ════════════════════════════════════════════════════════
function ewalletAktif() { return (sett().ewalletList || []).filter(e => e && e.aktif !== false && e.nomor && e.nama); }
function bankAktif() { return (sett().bankInfo || []).filter(b => b && b.bank && b.noRek); }
function adaMetodeBayar() { return bankAktif().length > 0 || qrisAktif().length > 0 || ewalletAktif().length > 0; }
const fmtNomor = v => String(v || '').replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
function metodeBayarList() {
  const out = ['Transfer Bank'];
  if (qrisAktif().length) out.push('QRIS');
  ewalletAktif().forEach(e => { if (!out.includes(e.nama)) out.push(e.nama); });
  if (!out.includes('E-Wallet')) out.push('E-Wallet');
  return out;
}
function rekeningHtml(o) {
  return `<div class="pay-list">${bankAktif().map(bk => `<div class="pay-acc"><span class="pay-ic" data-c="${colorIdx(bk.bank)}" aria-hidden="true"><i class="bi bi-bank"></i></span>
    <div class="min-w-0 flex-fill"><b class="d-block">${esc(bk.bank)}</b><span class="num pay-no">${esc(fmtNomor(bk.noRek))}</span><div class="small muted text-truncate">a.n. ${esc(bk.atasNama)}</div></div>
    <button class="btn btn-sm btn-light" data-act="copy" data-text="${esc(bk.noRek)}" aria-label="Salin nomor rekening ${esc(bk.bank)}"><i class="bi bi-copy"></i>Salin</button></div>`).join('')}</div>
    <ol class="qris-steps small mt-3"><li>Transfer tepat <b>${rp(o.Sisa)}</b> ke salah satu rekening di atas.</li><li>Simpan bukti transfer (tangkapan layar).</li><li>Tekan <b>Saya sudah bayar</b>, lalu unggah bukti transfer.</li></ol>`;
}
function ewalletHtml(o) {
  return `<div class="pay-list">${ewalletAktif().map(e => `<div class="pay-acc"><span class="pay-ic ew" data-c="${colorIdx(e.nama)}" aria-hidden="true"><i class="bi bi-wallet2"></i></span>
    <div class="min-w-0 flex-fill"><b class="d-block">${esc(e.nama)}</b><span class="num pay-no">${esc(fmtNomor(e.nomor))}</span><div class="small muted text-truncate">a.n. ${esc(e.atasNama)}</div></div>
    <button class="btn btn-sm btn-light" data-act="copy" data-text="${esc(e.nomor)}" aria-label="Salin nomor ${esc(e.nama)}"><i class="bi bi-copy"></i>Salin</button></div>`).join('')}</div>
    <ol class="qris-steps small mt-3"><li>Buka aplikasi e-wallet, pilih menu <b>Kirim</b> / <b>Transfer</b> ke nomor di atas.</li><li>Pastikan nama penerima sesuai, lalu kirim tepat <b>${rp(o.Sisa)}</b>.</li><li>Tekan <b>Saya sudah bayar</b>, lalu unggah bukti pembayaran.</li></ol>`;
}
function qrisBayarHtml(o) {
  const list = qrisAktif();
  const q = list.find(x => x.id === S.ui.qrisSel) || list[0];
  S.ui.qrisSel = q.id;
  return `${list.length > 1 ? `<div class="chips mb-3" role="radiogroup" aria-label="Pilih QRIS">${list.map(x => `<button class="chip ${x.id === q.id ? 'on' : ''}" data-act="qrisPilih" data-id="${esc(x.id)}" data-order="${o.ID}" role="radio" aria-checked="${x.id === q.id}">${esc(x.nama)}</button>`).join('')}</div>` : ''}
    <div class="qris-pay"><div class="qris-frame"><div class="qris-head"><i class="bi bi-qr-code-scan"></i>Scan QRIS</div><div class="qris-canvas" id="qrisBox"><span class="spin" aria-hidden="true"></span></div>
      <div class="qris-merchant"><b>${esc(q.merchant || q.nama)}</b>${q.kota ? `<span>${esc(q.kota)}</span>` : ''}</div></div>
      <button class="btn btn-light w-100 mt-2" data-act="qrisUnduh" data-order="${o.ID}"><i class="bi bi-download"></i>Simpan gambar QR</button>
      <ol class="qris-steps small"><li>Buka aplikasi m-banking atau e-wallet, pilih <b>Scan / Bayar QRIS</b>.</li><li>Membayar dari HP ini? Tekan <b>Simpan gambar QR</b>, lalu pilih gambar itu dari galeri di menu scan.</li><li>Pastikan nominal <b>${rp(o.Sisa)}</b> dan nama merchant sesuai, lalu bayar.</li><li>Setelah berhasil, tekan <b>Saya sudah bayar</b> dan unggah bukti pembayaran.</li></ol></div>`;
}
function gambarQrisBayar(o) {
  const q = qrisAktif().find(x => x.id === S.ui.qrisSel); const box = $('#qrisBox');
  if (!q || !box) return;
  let teks; try { teks = qrisDinamis(q.payload, o.Sisa); } catch (e) { teks = null; }
  if (!teks) { box.innerHTML = '<div class="small text-danger p-3">Kode QRIS tidak valid. Hubungi admin.</div>'; return; }
  const cv = document.createElement('canvas'); cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Kode QRIS senilai ' + rp(o.Sisa)); cv.id = 'qrisCanvas';
  gambarQr(cv, teks, 264).then(() => { if (document.body.contains(box)) { box.innerHTML = ''; box.appendChild(cv); } })
    .catch(er => { box.innerHTML = q.fileId ? `<img src="${esc(driveImg(q.fileId, 600))}" alt="QRIS ${esc(q.nama)}"><div class="small p-2" style="color:#B45309">QR otomatis gagal dibuat (${esc(er.message)}). Scan QR ini dan masukkan nominal <b>${rp(o.Sisa)}</b> secara manual.</div>` : `<div class="small text-danger p-3">${esc(er.message)}</div>`; });
}
function renderBayarBody(o, tab) {
  const body = $('#bayarBody'); if (!body || !o) return;
  body.innerHTML = tab === 'qris' ? qrisBayarHtml(o) : tab === 'ewallet' ? ewalletHtml(o) : rekeningHtml(o);
  const btn = $('#btnSudahBayar');
  if (btn) btn.dataset.metode = tab === 'qris' ? 'QRIS' : tab === 'ewallet' ? ((ewalletAktif()[0] || {}).nama || 'E-Wallet') : 'Transfer Bank';
  if (tab === 'qris') gambarQrisBayar(o);
}
ACT.bayarPilih = b => {
  const o = orderById(b.dataset.id);
  if (!o) return;
  if (!(o.Sisa > 0)) return toast('Pesanan ini sudah lunas.', 'success');
  const ada = { transfer: bankAktif().length > 0, qris: qrisAktif().length > 0, ewallet: ewalletAktif().length > 0 };
  const tabs = [['transfer', 'bi-bank', 'Transfer'], ['qris', 'bi-qr-code-scan', 'QRIS'], ['ewallet', 'bi-wallet2', 'E-wallet']].filter(t => ada[t[0]]);
  if (!tabs.length) return toast('Metode pembayaran belum diatur admin. Hubungi admin lewat WhatsApp.', 'info');
  let tab = b.dataset.tab || S.ui.bayarTab;
  if (!tabs.some(t => t[0] === tab)) tab = tabs[0][0];
  S.ui.bayarTab = tab;
  modal({
    title: 'Bayar pesanan',
    body: `<div class="bayar-amt"><div class="min-w-0"><span class="small muted">Total bayar · ${esc(o.NoOrder)}</span><b class="num d-block">${rp(o.Sisa)}</b></div><button class="btn btn-sm btn-light nowrap" data-act="copy" data-text="${Math.round(o.Sisa)}" aria-label="Salin nominal ${rp(o.Sisa)}"><i class="bi bi-copy"></i>Salin</button></div>
      ${tabs.length > 1 ? `<div class="seg-x pay-tabs mb-3" style="grid-template-columns:repeat(${tabs.length},1fr)" role="tablist" aria-label="Metode pembayaran">${tabs.map(([v, i, t]) => `<button type="button" role="tab" aria-selected="${v === tab}" class="${v === tab ? 'on' : ''}" data-act="bayarTab" data-t="${v}" data-id="${o.ID}"><i class="bi ${i}"></i>${t}</button>`).join('')}</div>` : ''}
      <div id="bayarBody" role="tabpanel"></div>`,
    foot: `<button class="btn btn-light" data-bs-dismiss="modal">Tutup</button><button class="btn btn-primary" id="btnSudahBayar" data-act="custBayar" data-id="${o.ID}"><i class="bi bi-check2-circle"></i>Saya sudah bayar</button>`
  });
  renderBayarBody(o, tab);
};
ACT.bayarTab = b => {
  S.ui.bayarTab = b.dataset.t;
  $$('.pay-tabs button').forEach(x => { const on = x.dataset.t === b.dataset.t; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
  renderBayarBody(orderById(b.dataset.id), b.dataset.t);
};
// Kompatibel dengan tombol lama "Bayar QRIS"
ACT.qrisBayar = b => ACT.bayarPilih({ dataset: { id: b.dataset.id, tab: 'qris' } });
ACT.qrisPilih = b => { S.ui.qrisSel = b.dataset.id; if ($('#bayarBody')) renderBayarBody(orderById(b.dataset.order), 'qris'); else ACT.qrisBayar({ dataset: { id: b.dataset.order } }); };

/** Pengaturan → QRIS & e-wallet: daftar e-wallet usaha. Tiap item disimpan langsung (tidak ada perubahan yang tertunda). */
function ewalletKartu() {
  const list = S.settings.ewalletList || [];
  return `<div class="cardx pad-lg mt-4" id="ewCard"><div class="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-3"><div><b class="fs-5 d-block">E-wallet untuk pembayaran member</b><span class="small muted">Nomor GoPay, DANA, OVO, ShopeePay, dan lainnya. Tampil di menu <b>Bayar sekarang</b> dan di invoice.</span></div><button type="button" class="btn btn-primary" data-act="ewForm"><i class="bi bi-plus-lg"></i>Tambah e-wallet</button></div>
    ${list.length ? `<div class="ew-grid">${list.map((e, i) => `<div class="ew-card ${e.aktif === false ? 'off' : ''}"><span class="pay-ic ew" data-c="${colorIdx(e.nama)}" aria-hidden="true"><i class="bi bi-wallet2"></i></span>
      <div class="min-w-0 flex-fill"><b class="d-block text-truncate">${esc(e.nama)}</b><span class="num">${esc(fmtNomor(e.nomor))}</span><div class="small muted text-truncate">a.n. ${esc(e.atasNama)}</div>
        <div class="d-flex align-items-center gap-2 mt-2 flex-wrap"><div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" data-act="ewToggle" data-i="${i}" ${e.aktif !== false ? 'checked' : ''} aria-label="Tampilkan ${esc(e.nama)} ke member"></div><span class="small">${e.aktif !== false ? 'Tampil ke member' : 'Disembunyikan'}</span>
          <span class="ms-auto"><button class="icon-btn sm" data-act="ewForm" data-i="${i}" aria-label="Ubah ${esc(e.nama)}"><i class="bi bi-pencil"></i></button><button class="icon-btn sm" data-act="ewHapus" data-i="${i}" aria-label="Hapus ${esc(e.nama)}"><i class="bi bi-trash3"></i></button></span></div></div></div>`).join('')}</div>`
      : emptyState('bi-wallet2', 'Belum ada e-wallet', 'Tambahkan nomor GoPay, DANA, atau e-wallet lain agar member bisa membayar ke sana.', '<button class="btn btn-primary" data-act="ewForm">Tambah e-wallet</button>')}</div>`;
}
const ewByIdx = i => (S.settings.ewalletList || [])[Number(i)];
/** Terapkan pengaturan terbaru dari server ke halaman (daftar QRIS & e-wallet ikut diperbarui). */
function terapkanPengaturan(res) {
  if (!res || !res.data || !res.data.settings) return;
  S.boot.settings = Object.assign({}, S.boot.settings || {}, { qrisList: res.data.settings.qrisList, ewalletList: res.data.settings.ewalletList });
  segarkanPengaturan(res);
}
function bindEwallet() { /* v1.3.1: tiap e-wallet disimpan lewat pop-up; tidak ada form massal */ }
ACT.ewForm = b => {
  const i = b && b.dataset && b.dataset.i !== undefined ? b.dataset.i : null;
  const e = i !== null ? ewByIdx(i) : null;
  modal({
    title: e ? 'Ubah ' + e.nama : 'Tambah e-wallet',
    body: `<form id="fEwM" class="row g-3" novalidate>
      <div class="col-12"><label class="form-label" for="ewNamaIn">Nama e-wallet <span class="req">*</span></label><input class="form-control" id="ewNamaIn" name="nama" list="ewNamaList" maxlength="24" value="${esc(e ? e.nama : '')}" placeholder="Contoh: GoPay" autocomplete="off">
        <datalist id="ewNamaList"><option value="GoPay"><option value="DANA"><option value="OVO"><option value="ShopeePay"><option value="LinkAja"></datalist></div>
      <div class="col-sm-6"><label class="form-label" for="ewNomorIn">Nomor akun <span class="req">*</span></label><input class="form-control" id="ewNomorIn" name="nomor" inputmode="numeric" maxlength="24" value="${esc(e ? e.nomor : '')}" placeholder="0812xxxxxxxx"></div>
      <div class="col-sm-6"><label class="form-label" for="ewAnIn">Atas nama <span class="req">*</span></label><input class="form-control" id="ewAnIn" name="atasNama" maxlength="60" value="${esc(e ? e.atasNama : '')}" placeholder="Nama pemilik akun"></div>
      <div class="col-12"><label class="form-check form-switch"><input class="form-check-input" type="checkbox" name="aktif" ${!e || e.aktif !== false ? 'checked' : ''}> Tampilkan ke member</label></div>
      <div class="col-12" id="ewErr" aria-live="polite"></div></form>`,
    foot: `<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnEw"><i class="bi bi-check2"></i>Simpan e-wallet</button>`
  });
  fokusAwal(e ? '#ewNomorIn' : '#ewNamaIn');
  const simpan = async () => {
    const f = $('#fEwM'); clearErr(f); $('#ewErr').innerHTML = '';
    const d = { id: e && e.id ? e.id : '', nama: f.nama.value.trim(), nomor: f.nomor.value.replace(/\D/g, ''), atasNama: f.atasNama.value.trim(), aktif: f.aktif.checked };
    if (d.nama.length < 2) return fieldErr(f, 'nama', 'Isi nama e-wallet, misalnya GoPay.');
    if (d.nomor.length < 8 || d.nomor.length > 20) return fieldErr(f, 'nomor', 'Nomor 8–20 angka.');
    if (d.atasNama.length < 2) return fieldErr(f, 'atasNama', 'Isi nama pemilik akun.');
    if (e && !e.id) d.lama = { nama: e.nama, nomor: e.nomor };
    const res = await simpanAman('ewallet.simpan', d, $('#btnEw'), () => (S.settings.ewalletList || []).some(x => x.nama.toLowerCase() === d.nama.toLowerCase() && x.nomor === d.nomor), '#ewErr');
    if (res) { closeModal(); terapkanPengaturan(res); }
  };
  $('#btnEw').onclick = simpan;
  $('#fEwM').onsubmit = ev => { ev.preventDefault(); simpan(); };
};
ACT.ewToggle = async b => {
  const e = ewByIdx(b.dataset.i); if (!e) return;
  const res = await mutate('ewallet.simpan', Object.assign({}, e, { aktif: b.checked }), { rerenderView: false });
  if (res.success) terapkanPengaturan(res); else b.checked = !b.checked;
};
ACT.ewHapus = async b => {
  const e = ewByIdx(b.dataset.i); if (!e) return;
  if (!(await confirmDlg({ title: 'Hapus ' + e.nama + '?', text: 'Member tidak bisa lagi membayar ke nomor ini.', ok: 'Hapus', danger: true }))) return;
  const res = await mutate('ewallet.hapus', e.id ? { id: e.id } : { index: Number(b.dataset.i) }, { rerenderView: false });
  if (res.success) terapkanPengaturan(res);
};
/**
 * Simpan pengaturan dengan aman: galat ditampilkan di dalam pop-up (tidak hilang seperti notifikasi),
 * dan bila koneksi putus setelah server sempat menyimpan, data dicek ulang sehingga tidak tampil "gagal" palsu.
 */
async function simpanAman(action, data, btn, sudahAda, boxSel) {
  const res = await mutate(action, data, { btn, busyLabel: 'Menyimpan…', rerenderView: false });
  if (res.success) return res;
  if (kodeSesiHabis(res.code)) return null;
  const box = $(boxSel);
  if (res.code === 'NET' || res.code === 'BAD_RESPONSE' || (!res.code && /Koneksi|Respons kosong|tidak dapat dikirim/i.test(res.message || ''))) { // v1.4: putus/timeout fetch
    if (box) box.innerHTML = '<div class="small muted">Memeriksa apakah data sudah tersimpan…</div>';
    const s = await api('data.sync', { ver: -1 }, { silent: true });
    if (s.success && s.data && s.data.settings) {
      hydrate(s.data); S.lastSync = Date.now();
      if (sudahAda()) { toast('Data sudah tersimpan.', 'success'); return { success: true, data: { settings: S.settings } }; }
    }
  }
  if (box) box.innerHTML = `<div class="alert-x danger mb-0"><i class="bi bi-x-circle"></i><div><b>Belum tersimpan.</b><br>${esc(res.message || 'Terjadi kesalahan.')}</div></div>`;
  return null;
}

// ════════════════════════════════════════════════════════
// BAGIAN 35 (v1.3): SUPER ADMIN — template pesan WhatsApp & email
// ════════════════════════════════════════════════════════
const PH_LABEL = { nama: 'Nama', noInvoice: 'No. invoice', noOrder: 'No. pesanan', total: 'Total', sisa: 'Sisa tagihan', jatuhTempo: 'Jatuh tempo', link: 'Link PDF', app: 'Nama usaha', kode: 'Kode OTP', menit: 'Masa berlaku' };
function daftarTemplate() {
  const inv = ['nama', 'noInvoice', 'noOrder', 'total', 'sisa', 'jatuhTempo', 'link', 'app'];
  const rem = ['nama', 'noOrder', 'sisa', 'total', 'jatuhTempo', 'link', 'app'];
  const otp = ['kode', 'menit', 'app', 'nama'];
  return [
    { id: 'invoiceWa', kanal: 'wa', judul: 'Invoice', ket: 'Keterangan gambar invoice JPG yang dikirim ke WhatsApp member.', isi: 'invoiceTemplateWA', ph: inv },
    { id: 'pengingatWa', kanal: 'wa', judul: 'Pengingat tagihan', ket: 'Dikirim lewat WhatsApp, sekaligus menjadi isi email pengingat.', isi: 'reminderTemplate', ph: rem },
    { id: 'otpWa', kanal: 'wa', judul: 'Kode OTP', ket: 'Pendaftaran, lupa sandi, dan verifikasi masuk pengurus.', isi: 'otpTemplateWA', ph: otp, wajib: 'kode' },
    { id: 'invoiceEmail', kanal: 'email', judul: 'Invoice', ket: 'PDF invoice dilampirkan otomatis.', subjek: 'emailInvoiceSubjek', isi: 'emailInvoiceIsi', ph: inv },
    { id: 'pengingatEmail', kanal: 'email', judul: 'Pengingat tagihan', ket: 'Isi email memakai template Pengingat tagihan (WhatsApp).', subjek: 'emailPengingatSubjek', isiDari: 'reminderTemplate', ph: rem },
    { id: 'otpEmail', kanal: 'email', judul: 'Kode OTP', ket: 'Verifikasi masuk pengurus lewat email.', subjek: 'otpEmailSubjek', isi: 'otpEmailIsi', ph: otp, wajib: 'kode' }
  ];
}
function contohData() {
  return { nama: 'Dewi Sartika', noInvoice: 'INV/JST/2026/11/0007', noOrder: 'JST-2611-0012', total: 'Rp 1.250.000', sisa: 'Rp 750.000', jatuhTempo: '12 November 2026', link: 'https://drive.google.com/file/d/…/view', app: sett().appName || 'Jastica', kode: '482913', menit: 5 };
}
const isiTpl = (t, d) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => d[k] === undefined ? '' : d[k]);
const waFormat = t => esc(t).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1<i>$2</i>').replace(/~([^~\n]+)~/g, '<s>$1</s>').replace(/\n/g, '<br>');
function templateTabHtml() {
  const list = daftarTemplate();
  const st = S.ui.tpl || (S.ui.tpl = { id: 'invoiceWa' });
  const grup = (k, label, ic) => `<div class="tpl-grp"><i class="bi ${ic}"></i>${label}</div>${list.filter(t => t.kanal === k).map(t => `<button type="button" class="tpl-item ${t.id === st.id ? 'on' : ''}" data-act="tplPilih" data-id="${t.id}" aria-pressed="${t.id === st.id}"><b>${t.judul}</b><small>${t.ket}</small></button>`).join('')}`;
  return `<div class="row g-4"><div class="col-lg-4"><div class="cardx pad"><nav class="tpl-list" aria-label="Daftar template">${grup('wa', 'WhatsApp', 'bi-whatsapp')}${grup('email', 'Email', 'bi-envelope')}</nav></div>
      <div class="note-box"><i class="bi bi-magic"></i><div>Kata dalam kurung kurawal seperti <code>{nama}</code> diganti otomatis dengan data asli saat pesan dikirim.</div></div></div>
    <div class="col-lg-8"><div class="cardx pad-lg" id="tplEditor"></div></div></div>`;
}
function bindTemplate() {
  const st = S.ui.tpl; const t = daftarTemplate().find(x => x.id === st.id) || daftarTemplate()[0];
  const s = S.settings; const wa = t.kanal === 'wa';
  $('#tplEditor').innerHTML = `<div class="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-3"><div class="min-w-0"><b class="fs-5 d-block">${t.judul}</b><span class="small muted">${t.ket}</span></div><span class="pill nodot ${wa ? 'st-aktif' : 'primary'}"><i class="bi ${wa ? 'bi-whatsapp' : 'bi-envelope'}"></i>${wa ? 'WhatsApp' : 'Email'}</span></div>
    <form id="fTpl" novalidate>
      ${t.subjek ? `<div class="mb-3"><label class="form-label" for="tplSubjek">Subjek email</label><input class="form-control" id="tplSubjek" name="subjek" maxlength="150" value="${esc(s[t.subjek] || '')}"></div>` : ''}
      ${t.isi ? `<div class="mb-2"><div class="d-flex justify-content-between"><label class="form-label" for="tplIsi">Isi pesan</label><small class="muted" id="tplHitung"></small></div><textarea class="form-control tpl-area" id="tplIsi" name="isi" rows="11" maxlength="1500">${esc(s[t.isi] || '')}</textarea></div>`
        : `<div class="alert-x info"><i class="bi bi-link-45deg"></i><div>Isi email pengingat memakai template <b>Pengingat tagihan</b> (WhatsApp), dibungkus tampilan email bermerek. <button type="button" class="link-btn" data-act="tplPilih" data-id="pengingatWa">Ubah isinya</button></div></div>`}
      <div class="small-caps mt-3 mb-2">Sisipkan data otomatis</div>
      <div class="tpl-chips">${t.ph.map(k => `<button type="button" class="chip" data-act="tplSisip" data-k="${k}"><code>{${k}}</code><span>${PH_LABEL[k] || k}</span></button>`).join('')}</div>
      ${wa ? '<div class="form-text">Format WhatsApp: <code>*tebal*</code>, <code>_miring_</code>, <code>~coret~</code>. Emoji boleh dipakai.</div>' : '<div class="form-text">Gunakan <code>*tebal*</code> untuk menebalkan teks. Baris baru dipertahankan.</div>'}
      <div class="small-caps mt-4 mb-2">Pratinjau dengan contoh data</div><div id="tplPrev"></div>
      <div class="d-flex gap-2 flex-wrap mt-4"><button class="btn btn-primary" type="submit"><i class="bi bi-check2"></i>Simpan template</button><button type="button" class="btn btn-light" data-act="tplReset"><i class="bi bi-arrow-counterclockwise"></i>Kembalikan bawaan</button></div>
    </form>`;
  const f = $('#fTpl');
  const prev = () => {
    const d = contohData();
    const isi = t.isi ? f.isi.value : (s[t.isiDari] || '');
    if (f.isi) $('#tplHitung').textContent = f.isi.value.length + '/1500';
    if (wa) {
      $('#tplPrev').innerHTML = `<div class="wa-prev">${t.id === 'invoiceWa' ? `<div class="wa-bubble img"><div class="wa-img"><i class="bi bi-receipt"></i><span>Invoice-${esc(d.noInvoice.split('/').pop())}.jpg</span></div>${waFormat(isiTpl(isi, d))}<span class="wa-time">10.24 <i class="bi bi-check2-all"></i></span></div>` : `<div class="wa-bubble">${waFormat(isiTpl(isi, d))}<span class="wa-time">10.24 <i class="bi bi-check2-all"></i></span></div>`}</div>`;
    } else {
      const subj = isiTpl(f.subjek ? f.subjek.value : '', d);
      $('#tplPrev').innerHTML = `<div class="mail-prev"><div class="mail-subj"><span class="muted">Subjek:</span> <b>${esc(subj)}</b></div>${emailBingkaiKlien(subj, isiTpl(isi, d))}</div>`;
    }
  };
  prev();
  f.addEventListener('input', debounce(prev, 120));
  ['isi', 'subjek'].forEach(n => { if (f[n]) f[n].addEventListener('focus', () => { S.ui.tplFokus = n; }); });
  f.onsubmit = async e => {
    e.preventDefault();
    const values = {};
    if (t.isi) values[t.isi] = f.isi.value;
    if (t.subjek) values[t.subjek] = f.subjek.value;
    if (t.wajib && t.isi && !f.isi.value.includes('{' + t.wajib + '}')) return toast('Template ini wajib memuat {' + t.wajib + '} agar kode terkirim.', 'warning');
    const res = await mutate('settings.simpan', { values }, { btn: f.querySelector('[type=submit]'), busyLabel: 'Menyimpan…', rerenderView: false });
    if (res.success) { S.settings = res.data.settings; bindTemplate(); }
  };
}
/** Pratinjau email: tampilan sama dengan emailBingkai_ di server. */
function emailBingkaiKlien(judul, teks) {
  const s = sett(); const warna = /^#[0-9a-f]{6}$/i.test(s.primaryColor || '') ? s.primaryColor : '#6C5CE7';
  const kontak = [s.bizHP ? 'WhatsApp ' + fmtHP(s.bizHP) : '', s.bizEmail || ''].filter(Boolean).map(esc).join(' · ');
  return `<div class="mail-frame"><div class="mail-head" style="background:${warna}"><b>${esc(s.appName || 'Jastica')}</b>${s.tagline ? `<small>${esc(s.tagline)}</small>` : ''}</div>
    <div class="mail-body"><div class="mail-title">${esc(judul)}</div>${waFormat(teks).replace(/<s>|<\/s>/g, '')}</div>
    <div class="mail-foot">${esc(s.appName || 'Jastica')}${s.bizAlamat ? ' · ' + esc(s.bizAlamat) : ''}${kontak ? '<br>' + kontak : ''}<br>Email ini dikirim otomatis, mohon tidak membalas ke alamat ini.</div></div>`;
}
ACT.tplPilih = b => { S.ui.tpl = { id: b.dataset.id }; $$('.tpl-item').forEach(x => { const on = x.dataset.id === b.dataset.id; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); bindTemplate(); };
ACT.tplSisip = b => {
  const f = $('#fTpl'); const el = f[S.ui.tplFokus] || f.isi || f.subjek; if (!el) return;
  const k = '{' + b.dataset.k + '}';
  const a = el.selectionStart ?? el.value.length, z = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, a) + k + el.value.slice(z);
  el.focus(); el.setSelectionRange(a + k.length, a + k.length);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
ACT.tplReset = async b => {
  const t = daftarTemplate().find(x => x.id === S.ui.tpl.id);
  if (!(await confirmDlg({ title: 'Kembalikan template bawaan?', text: 'Teks yang Anda ubah untuk "' + t.judul + '" diganti dengan teks bawaan aplikasi.', ok: 'Kembalikan' }))) return;
  const values = {}; if (t.isi) values[t.isi] = ''; if (t.subjek) values[t.subjek] = '';
  const res = await mutate('settings.simpan', { values }, { btn: b, rerenderView: false });
  if (res.success) { S.settings = res.data.settings; bindTemplate(); }
};

// ════════════════════════════════════════════════════════
// BAGIAN 36 (v1.3): INVOICE JPG — digambar di browser (Canvas), dikirim ke WhatsApp
// ════════════════════════════════════════════════════════
function siapFont() { return document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]) : Promise.resolve(); }
async function gambarInvoiceJpg(o) {
  await siapFont();
  const s = sett(); const inv = o.InvoiceID ? invById(o.InvoiceID) : null;
  const items = itemsOf(o.ID); const gab = jasaGabung();
  const W = 1080, P = 64, cv = document.createElement('canvas'); cv.width = W; cv.height = 7000;
  const c = cv.getContext('2d');
  const F = (w, px) => `${w} ${px}px "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif`;
  const warna = /^#[0-9a-f]{6}$/i.test(s.primaryColor || '') ? s.primaryColor : '#6C5CE7';
  const INK = '#1F1B3A', MUTED = '#6B6885', LINE = '#ECE9F6', SOFT = '#F7F5FD', RED = '#E11D48', GREEN = '#059669';
  const tulis = (t, x, y, font, color, align = 'left') => { c.font = font; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillText(String(t), x, y); };
  const lebar = (t, font) => { c.font = font; return c.measureText(String(t)).width; };
  const bungkus = (t, maxW, font, maks = 3) => {
    c.font = font; const kata = String(t || '').split(/\s+/); const out = []; let baris = '';
    kata.forEach(k => { const coba = baris ? baris + ' ' + k : k; if (c.measureText(coba).width <= maxW || !baris) baris = coba; else { out.push(baris); baris = k; } });
    if (baris) out.push(baris);
    if (out.length > maks) { const sisa = out.slice(0, maks); let b = sisa[maks - 1]; while (b && c.measureText(b + '…').width > maxW) b = b.slice(0, -1); sisa[maks - 1] = b + '…'; return sisa; }
    return out;
  };
  const kotak = (x, y, w, h, r, fill, stroke) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); } };
  c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, W, cv.height);

  // ── Kepala bermerek ──
  const HH = 220;
  c.fillStyle = warna; c.fillRect(0, 0, W, HH);
  const gr = c.createLinearGradient(0, 0, W, HH); gr.addColorStop(0, 'rgba(255,255,255,.10)'); gr.addColorStop(1, 'rgba(0,0,0,.18)'); c.fillStyle = gr; c.fillRect(0, 0, W, HH);
  kotak(P, 60, 92, 92, 24, '#FFFFFF');
  tulis(initials(s.appName || 'Jastica'), P + 46, 120, F(800, 36), warna, 'center');
  tulis(String(s.appName || 'Jastica').slice(0, 26), P + 118, 102, F(800, 40), '#FFFFFF');
  if (s.tagline) tulis(String(s.tagline).slice(0, 42), P + 118, 140, F(500, 22), 'rgba(255,255,255,.85)');
  tulis(inv ? 'INVOICE' : 'RINCIAN PESANAN', W - P, 92, F(700, 20), 'rgba(255,255,255,.8)', 'right');
  tulis(inv ? inv.NoInvoice : o.NoOrder, W - P, 132, F(800, 30), '#FFFFFF', 'right');
  let y = HH + 56;

  // ── Tanggal & status ──
  const kolTgl = [[inv ? 'Tanggal terbit' : 'Tanggal pesanan', tgl(inv ? inv.Tanggal : o.Tanggal), INK], ...(inv ? [['Jatuh tempo', tgl(inv.JatuhTempo), RED]] : []), ['No. pesanan', o.NoOrder, INK]];
  kolTgl.forEach(([k, v, col], i) => { const x = P + i * 250; tulis(k.toUpperCase(), x, y, F(700, 17), MUTED); tulis(v, x, y + 34, F(700, 25), col); });
  const st = o.StatusBayar === 'Lunas' ? ['LUNAS', '#D1FAE5', GREEN] : o.StatusBayar === 'DP' ? ['DP / SEBAGIAN', '#FEF3C7', '#B45309'] : ['BELUM LUNAS', '#FFE4E6', RED];
  const lw = lebar(st[0], F(800, 19)) + 40; kotak(W - P - lw, y - 8, lw, 46, 23, st[1]); tulis(st[0], W - P - lw / 2, y + 22, F(800, 19), st[2], 'center');
  y += 80;

  // ── Pelanggan & info jastip ──
  const BW = (W - 2 * P - 24) / 2;
  const alamat = bungkus(o.Pengiriman === 'Pickup' ? 'Ambil sendiri (pick up)' : (o.Alamat || '-'), BW - 48, F(500, 21), 3);
  const neg = negara(o.Negara);
  const BH = 150 + alamat.length * 28;
  kotak(P, y, BW, BH, 22, SOFT); kotak(P + BW + 24, y, BW, BH, 22, SOFT);
  tulis('DITAGIHKAN KEPADA', P + 24, y + 40, F(700, 17), MUTED);
  bungkus(o.CustomerNama, BW - 48, F(800, 27), 1).forEach(l => tulis(l, P + 24, y + 78, F(800, 27), INK));
  tulis(fmtHP(o.CustomerHP), P + 24, y + 112, F(500, 21), INK);
  alamat.forEach((l, i) => tulis(l, P + 24, y + 146 + i * 28, F(500, 21), MUTED));
  const X2 = P + BW + 48;
  tulis('INFORMASI JASTIP', X2, y + 40, F(700, 17), MUTED);
  tulis(neg.nama + ' (' + neg.mataUang + ')', X2, y + 78, F(800, 27), INK);
  tulis(o.Pengiriman === 'Pickup' ? 'Pengiriman: ambil sendiri' : 'Kurir: ' + (o.Kurir || '-'), X2, y + 112, F(500, 21), INK);
  tulis('Kurs terkunci saat pesanan dibuat', X2, y + 146, F(500, 21), MUTED);
  y += BH + 44;

  // ── Tabel barang ──
  const cQty = 650, cHarga = 820, cSub = W - P;
  kotak(P, y, W - 2 * P, 56, 14, '#F1EEFB');
  tulis('BARANG', P + 22, y + 36, F(800, 17), MUTED); tulis('QTY', cQty, y + 36, F(800, 17), MUTED, 'center');
  tulis('HARGA SATUAN', cHarga, y + 36, F(800, 17), MUTED, 'right'); tulis('SUBTOTAL', cSub - 22, y + 36, F(800, 17), MUTED, 'right');
  y += 56;
  const baris = items.length ? items : [];
  baris.forEach(it => {
    const nm = bungkus(it.Nama, 500, F(700, 23), 2);
    const sub = [it.Varian, negara(it.Negara).nama, it.MataUang && it.MataUang !== 'IDR' && !(Number(it.HargaJual) > 0) ? fmtAsli(it.MataUang, it.HargaAsli) : ''].filter(Boolean).join(' · ');
    const h = 30 + nm.length * 30 + (sub ? 28 : 0) + 14;
    nm.forEach((l, i) => tulis(l, P + 22, y + 40 + i * 30, F(700, 23), INK));
    if (sub) tulis(sub.slice(0, 60), P + 22, y + 40 + nm.length * 30, F(500, 19), MUTED);
    tulis(String(it.Qty), cQty, y + 40, F(700, 23), INK, 'center');
    const satuan = gab ? Math.round((Number(it.Subtotal) || 0) / Math.max(1, Number(it.Qty) || 1)) : (Number(it.HargaJual) > 0 ? Number(it.HargaJual) : Number(it.HargaIDR) || 0);
    tulis(num(satuan), cHarga, y + 40, F(600, 22), INK, 'right');
    if (!gab && Number(it.JasaIDR)) tulis('+ ' + (sett().memberJasaLabel || 'jasa').toLowerCase() + ' ' + num(it.JasaIDR), cHarga, y + 70, F(500, 18), MUTED, 'right');
    tulis(num(it.Subtotal), cSub - 22, y + 40, F(800, 23), INK, 'right');
    y += h;
    c.fillStyle = LINE; c.fillRect(P, y, W - 2 * P, 2);
  });
  if (!baris.length) { tulis('Rincian barang sedang disiapkan.', P + 22, y + 44, F(500, 21), MUTED); y += 70; }
  if (Number(o.Ongkir)) { tulis('Ongkir domestik' + (o.Kurir ? ' (' + o.Kurir + ')' : ''), P + 22, y + 42, F(600, 22), INK); tulis(num(o.Ongkir), cSub - 22, y + 42, F(800, 23), INK, 'right'); y += 64; c.fillStyle = LINE; c.fillRect(P, y, W - 2 * P, 2); }
  y += 36;

  // ── Total (kanan) & cara bayar (kiri) ──
  const TW = 470, TX = W - P - TW, LW = TX - P - 24;
  const rows = [];
  if (gab) rows.push(['Subtotal barang', rp((Number(o.Subtotal) || 0) + (Number(o.JasaTitip) || 0))]);
  else { rows.push(['Subtotal barang', rp(o.Subtotal)]); rows.push([sett().memberJasaLabel || 'Jasa titip', rp(o.JasaTitip)]); }
  rows.push(['Ongkos kirim', rp(o.Ongkir)]);
  if (Number(o.Diskon)) rows.push(['Diskon', '− ' + rp(o.Diskon)]);
  if (Number(o.PotonganVoucher)) rows.push(['Voucher ' + (o.KodeVoucher || ''), '− ' + rp(o.PotonganVoucher)]);
  if (Number(o.PotonganPoin)) rows.push(['Tukar poin', '− ' + rp(o.PotonganPoin)]);
  const TH = 40 + rows.length * 40 + 96 + 2 * 40 + 30;
  kotak(TX, y, TW, TH, 22, SOFT);
  let ty = y + 50;
  // v1.3.2: nominal selalu sebaris dengan labelnya — huruf nominal mengecil bila angkanya sangat besar (Rp 1.000.000.000)
  const nominal = (label, fontLabel, v, x, y, w, size, color) => { const maks = TW - 52 - lebar(label, fontLabel) - 18; let s = size; while (s > 12 && lebar(v, F(w, s)) > maks) s--; tulis(v, x, y, F(w, s), color, 'right'); };
  rows.forEach(([k, v]) => { tulis(k, TX + 26, ty, F(500, 21), MUTED); nominal(k, F(500, 21), v, TX + TW - 26, ty, 700, 21, INK); ty += 40; });
  ty += 6; c.fillStyle = '#DDD8F0'; c.fillRect(TX + 26, ty - 22, TW - 52, 2);
  tulis('TOTAL TAGIHAN', TX + 26, ty + 22, F(800, 19), INK); nominal('TOTAL TAGIHAN', F(800, 19), rp(o.Total), TX + TW - 26, ty + 26, 800, 32, warna);
  ty += 82;
  tulis('Sudah dibayar', TX + 26, ty, F(500, 21), MUTED); nominal('Sudah dibayar', F(500, 21), rp(o.Dibayar), TX + TW - 26, ty, 700, 21, GREEN); ty += 44;
  tulis('Sisa tagihan', TX + 26, ty, F(800, 22), INK); nominal('Sisa tagihan', F(800, 22), rp(o.Sisa), TX + TW - 26, ty + 2, 800, 28, RED);

  let ly = y + 8;
  tulis('CARA PEMBAYARAN', P, ly + 22, F(800, 17), MUTED); ly += 56;
  bankAktif().slice(0, 4).forEach(b => { tulis(b.bank + '  ' + fmtNomor(b.noRek), P, ly, F(800, 22), INK); tulis('a.n. ' + String(b.atasNama || '').slice(0, 34), P, ly + 28, F(500, 19), MUTED); ly += 66; });
  ewalletAktif().slice(0, 4).forEach(e => { tulis(e.nama + '  ' + fmtNomor(e.nomor), P, ly, F(800, 22), INK); tulis('a.n. ' + String(e.atasNama || '').slice(0, 34), P, ly + 28, F(500, 19), MUTED); ly += 66; });
  bungkus('Setelah membayar, kirim bukti transfer ke WhatsApp admin agar segera diverifikasi.', LW, F(500, 19), 3).forEach(l => { tulis(l, P, ly, F(500, 19), MUTED); ly += 27; });
  y = Math.max(y + TH, ly) + 50;

  // ── Kaki ──
  c.fillStyle = LINE; c.fillRect(P, y, W - 2 * P, 2); y += 52;
  tulis('Terima kasih telah titip di ' + (s.appName || 'Jastica') + '!', W / 2, y, F(800, 24), INK, 'center'); y += 36;
  const kontak = [s.bizHP ? 'WhatsApp ' + fmtHP(s.bizHP) : '', s.bizEmail || ''].filter(Boolean).join('  ·  ');
  if (kontak) { tulis(kontak, W / 2, y, F(500, 20), MUTED, 'center'); y += 30; }
  if (s.bizAlamat) { bungkus(s.bizAlamat, W - 2 * P, F(500, 19), 2).forEach(l => { tulis(l, W / 2, y, F(500, 19), MUTED, 'center'); y += 28; }); }
  y += 34;
  c.fillStyle = warna; c.fillRect(0, y, W, 14); y += 14;

  const out = document.createElement('canvas'); out.width = W; out.height = y;
  const oc = out.getContext('2d'); oc.drawImage(cv, 0, 0);
  const dataUrl = out.toDataURL('image/jpeg', 0.9);
  return { base64: dataUrl.split(',')[1], mime: 'image/jpeg', dataUrl };
}
/** Gambar invoice untuk WhatsApp; bila gagal, server mengirim teks + tautan PDF. */
async function siapkanGambarInvoice(o) {
  try { const g = await gambarInvoiceJpg(o); return { base64: g.base64, mime: g.mime }; } catch (e) { console.warn('Gambar invoice gagal:', e); return null; }
}

// ════════════════════════════════════════════════════════
// BAGIAN 37 (v1.3.1, gas-scale-turbo): DATA CEPAT — respons ringkas, muat bertahap,
// sinkron selisih, cache besar di IndexedDB, daftar panjang dirender bertahap.
// Semua fungsi memakai deklarasi function (ter-hoist) agar aman dipanggil init().
// ════════════════════════════════════════════════════════

/** Format ringkas dari server ({ __ringkas, k: kolom, r: baris }) → array objek seperti biasa. */
function bukaRingkas(data) {
  if (!data || typeof data !== 'object') return data;
  Object.keys(data).forEach(k => {
    const v = data[k];
    if (!v || !v.__ringkas) return;
    const kol = v.k, n = kol.length;
    data[k] = v.r.map(a => { const o = {}; for (let i = 0; i < n; i++) if (a[i] !== null) o[kol[i]] = a[i]; return o; });
  });
  return data;
}
function dihapusSesi() { return window.__jstHapus || (window.__jstHapus = new Set()); }

/** Sinkron selisih: hanya baris yang berubah/dihapus sejak versi browser yang diterapkan (upsert per ID). */
function gabungSelisih(data) {
  const rm = data.removed || {};
  Object.keys(rm).forEach(c => {
    if (!S.d[c] || !rm[c].length) return;
    const s = new Set(rm[c]);
    rm[c].forEach(id => dihapusSesi().add(id));
    S.d[c] = S.d[c].filter(r => !s.has(r.ID));
  });
  COLLS.forEach(c => {
    const rows = data[c];
    if (!rows || !rows.length) return;
    const arr = S.d[c] || (S.d[c] = []);
    const pos = new Map(arr.map((r, i) => [r.ID, i]));
    rows.forEach(rec => { const i = pos.get(rec.ID); if (i !== undefined) arr[i] = rec; else { pos.set(rec.ID, arr.length); arr.push(rec); } });
  });
  if (data.me) S.me = data.me;
  if (data.boot) S.boot = data.boot;
  if (data.stat && S.boot) S.boot.stat = data.stat; // v1.3.4: terjual, rating, sisa stok
  if (data.kurs && S.boot) S.boot.kurs = data.kurs;
  if (data.settings) S.settings = data.settings;
  if (data.customer !== undefined && data.customer !== null) S.customer = data.customer;
  if (data.saldoDompet) S.saldo = data.saldoDompet;
  if (data.ver) S.ver = data.ver;
  refreshBootLists();
  _ix = {};
  applyBrand();
  persist();
}
/** Muat bertahap tahap 2: pesanan lama (lunas, > 45 hari) disisipkan tanpa menimpa data yang lebih baru. */
function sisipkanLama(data) {
  const hapus = dihapusSesi();
  let n = 0;
  COLLS.forEach(c => {
    const rows = data[c];
    if (!rows || !rows.length) return;
    const arr = S.d[c] || (S.d[c] = []);
    const ada = new Set(arr.map(r => r.ID));
    rows.forEach(rec => { if (!ada.has(rec.ID) && !hapus.has(rec.ID)) { arr.push(rec); n++; } });
  });
  if (n) { _ix = {}; persist(); }
  return n;
}
let _lamaJalan = false;
async function muatBagianLama() {
  if (_lamaJalan || !S.token) return;
  _lamaJalan = true;
  const me = S.me && S.me.id;
  const res = await api('data.all', { ringkas: 1, bagian: 'lama' }, { silent: true });
  _lamaJalan = false;
  if (!res.success || !S.me || S.me.id !== me) return;
  bukaRingkas(res.data);
  if (sisipkanLama(res.data)) {
    const sibuk = document.querySelector('.modal.show') || ['a-form', 'a-pengaturan', 'a-akun'].includes(S.route);
    if (!sibuk) rerender();
  }
  if (res.data.ver && res.data.ver > S.ver) scheduleSync(200);
}

// ── Cache besar di IndexedDB (localStorage hanya ±5 MB) ──
function idbJst() { return window.__idbJst || (window.__idbJst = {
  buka() {
    if (this._p) return this._p;
    this._p = new Promise(ok => {
      const batal = setTimeout(() => ok(null), 1500);
      try {
        const r = indexedDB.open('jastica', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { clearTimeout(batal); ok(r.result); };
        r.onerror = r.onblocked = () => { clearTimeout(batal); ok(null); };
      } catch (e) { clearTimeout(batal); ok(null); }
    });
    return this._p;
  },
  async kerjakan(mode, fn) {
    const db = await this.buka();
    if (!db) return null;
    return new Promise(ok => {
      try { const tx = db.transaction('kv', mode); const q = fn(tx.objectStore('kv')); tx.oncomplete = () => ok(q && q.result !== undefined ? q.result : true); tx.onerror = tx.onabort = () => ok(null); } catch (e) { ok(null); }
    });
  },
  get(k) { return this.kerjakan('readonly', s => s.get(k)); },
  set(k, v) { return this.kerjakan('readwrite', s => s.put(v, k)); },
  del(k) { return this.kerjakan('readwrite', s => s.delete(k)); }
}); }
function jumlahBaris() { return COLLS.reduce((n, c) => n + ((S.d[c] && S.d[c].length) || 0), 0); }
/** Simpan salinan data untuk buka ulang instan: kecil → localStorage, besar → IndexedDB. */
function simpanSalinan() {
  if (!S.me) return;
  const key = 'cache_' + S.me.id;
  const snap = { ver: S.ver, d: S.d, saldo: S.saldo, settings: S.settings, customer: S.customer, boot: S.boot, me: S.me, at: Date.now() };
  if (jumlahBaris() < 2500 && store.set(key, snap)) { idbJst().del(key); return; }
  store.del(key);
  idbJst().set(key, snap);
}
/** Buka ulang: ambil salinan besar dari IndexedDB (maks. 1,5 detik), lalu sinkron selisih. */
async function pulihkanSalinanBesar(uid) {
  const c = await Promise.race([idbJst().get('cache_' + uid), new Promise(ok => setTimeout(() => ok(null), 1500))]);
  return c && c.d && c.me && c.me.id === uid ? c : null;
}

// ── Daftar panjang: tampilkan bertahap (tanpa jeda saat pindah menu) ──
var BATAS_DAFTAR = 100;
function potongDaftar(key, arr) {
  const b = (S.ui.batas || (S.ui.batas = {}))[key] || BATAS_DAFTAR;
  return { tampil: arr.length > b ? arr.slice(0, b) : arr, sisa: Math.max(0, arr.length - b), key };
}
function tombolLagi(p, kolom) {
  if (!p.sisa) return '';
  const b = `<button type="button" class="btn btn-light btn-sm w-100 my-2" data-act="daftarLagi" data-k="${p.key}"><i class="bi bi-chevron-down"></i>Tampilkan ${Math.min(p.sisa, BATAS_DAFTAR)} lagi <span class="muted">· ${p.sisa} tersisa</span></button>`;
  return kolom ? `<tr class="tr-lagi"><td colspan="${kolom}">${b}</td></tr>` : b;
}
ACT.daftarLagi = b => { const k = b.dataset.k; S.ui.batas[k] = (S.ui.batas[k] || BATAS_DAFTAR) + BATAS_DAFTAR; rerender(); };

// ════════════════════════════════════════════════════════
// BAGIAN 38 (v1.3.2): INPUT NOMINAL BERPEMISAH RIBUAN, NOMINAL TOTAL SELALU SEBARIS,
// MEMBER MEMBATALKAN PESANAN, TANGGAL TRIP AMAN DARI FORMAT BROWSER.
// Semua fungsi memakai deklarasi function (ter-hoist) agar aman dipanggil dari modul lain.
// ════════════════════════════════════════════════════════

// ── Angka dari input nominal ──
/** Rupiah dari input berpemisah titik ("2.000.000") atau angka mentah (2000000 / "12500.5"). */
function angkaUang(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (/^-?\d+\.\d+$/.test(s) && !/^-?\d{1,3}(\.\d{3})+$/.test(s)) return Number(s); // angka mentah dari data (bukan hasil format)
  return toNum(s);
}
/** Harga di toko: Rupiah tanpa desimal; mata uang asing tetap boleh desimal (SGD 12,90). */
function angkaHarga(v, mu) { return typeof v === 'number' ? (isFinite(v) ? v : 0) : mu === 'IDR' ? angkaUang(v) : toFloat(v); }
/** Nilai jasa titip: persen boleh desimal (7,5); Rp per pcs / flat berupa Rupiah. */
function angkaJasa(v, tipe) { return typeof v === 'number' ? (isFinite(v) ? v : 0) : tipe === 'persen' ? toFloat(v) : angkaUang(v); }

// ── Format otomatis saat mengetik: 2000000 → 2.000.000 (tanpa desimal) ──
function grupRibuan(d) { return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
/** Mata uang yang berlaku untuk input harga (dari pilihan negara di form/baris, atau label mata uang di sampingnya). */
function muInputUang(el) {
  const src = el.dataset.muDari;
  if (src) {
    const lingkup = el.closest('tr') || el.form || document;
    const s = lingkup.querySelector(src) || document.querySelector(src);
    if (s && s.value) return muOf(s.value);
  }
  const g = el.closest('.input-group');
  const lbl = g && g.querySelector('.input-group-text');
  if (lbl) return lbl.textContent.trim();
  const sm = el.parentElement && el.parentElement.querySelector('small');
  return sm ? sm.textContent.trim() : 'IDR';
}
/** Apakah input ini sedang berisi Rupiah (sebagian input bisa berganti persen / mata uang asing). */
function uangAktif(el) {
  if (el.disabled) return false;
  const m = el.dataset.uang;
  if (!m) return true;
  if (m === 'jasa') { const t = el.closest('tr') && el.closest('tr').querySelector('[data-r=tipe]'); return !t || t.value !== 'persen'; }
  if (m === 'jasa-item') { const t = el.closest('tr') && el.closest('tr').querySelector('[data-f=jasaTipe]'); return !!t && (t.value === 'nominal' || t.value === 'flat'); }
  if (m === 'vc') { const f = el.form || el.closest('form'); const on = f && f.querySelector('[data-vtipe].on, [data-vmtipe].on'); return !on || (on.dataset.vtipe || on.dataset.vmtipe) !== 'persen'; }
  if (m === 'mu') return muInputUang(el) === 'IDR';
  if (m === 'kurs-idr') { const a = document.getElementById('kcArah'); return !!a && a.value === 'fromIDR'; }
  return true;
}
/** Teks tempelan "Rp 2.000.000,00" / "2,000,000.50" → digit Rupiah tanpa desimal. */
function digitTempelan(s) {
  s = String(s).replace(/[^\d.,]/g, '');
  const d = s.match(/[.,](\d{1,2})$/);
  if (d) { const sep = s[s.length - d[1].length - 1]; if (s.split(sep).length === 2 || sep === ',') s = s.slice(0, -(d[1].length + 1)); }
  return s.replace(/\D/g, '');
}
function bersihDigit(d) { d = String(d).replace(/^0+(?=\d)/, ''); return d.length > 15 ? d.slice(0, 15) : d; }
function ketikUang(el, jenis) {
  const v = el.value;
  const pos = el.selectionStart === null || el.selectionStart === undefined ? v.length : el.selectionStart;
  const tempel = /^insertFrom|insertReplacementText/.test(jenis || '');
  let kiri = tempel ? digitTempelan(v.slice(0, pos)).length : v.slice(0, pos).replace(/\D/g, '').length;
  let mentah = tempel ? digitTempelan(v) : v.replace(/\D/g, '');
  let d = bersihDigit(mentah);
  kiri = Math.max(0, Math.min(d.length, kiri - (mentah.length - mentah.replace(/^0+(?=\d)/, '').length)));
  let out = d ? grupRibuan(d) : '';
  // Hapus tepat di titik pemisah → hapus angka di sebelahnya (titik tidak bisa dihapus sendirian)
  if (out === el._uangPrev && d && (jenis === 'deleteContentBackward' || jenis === 'deleteContentForward')) {
    const i = jenis === 'deleteContentBackward' ? kiri - 1 : kiri;
    if (i >= 0 && i < d.length) { d = bersihDigit(d.slice(0, i) + d.slice(i + 1)); kiri = Math.min(i, d.length); out = d ? grupRibuan(d) : ''; }
  }
  el._uangPrev = out;
  el.dataset.fmt = '1';
  if (out === v) return;
  el.value = out;
  if (document.activeElement === el) {
    let i = 0, n = 0;
    while (i < out.length && n < kiri) { if (out[i] !== '.') n++; i++; }
    try { el.setSelectionRange(i, i); } catch (e) { /* jenis input tidak mendukung seleksi */ }
  }
}
/** Rapikan nilai yang diisi aplikasi (bukan diketik): 15000 → 15.000; beralih ke persen/valas → titik dilepas. */
function rapikanUang(lingkup, kabari) { (lingkup || document).querySelectorAll('input[data-uang]').forEach(el => rapikanSatu(el, kabari)); }
function rapikanSatu(el, kabari) {
  const v = el.value.trim();
  const lama = el.value;
  if (uangAktif(el)) {
    if (!v) return;
    const n = Math.round(Math.abs(angkaUang(v)));
    const out = n ? grupRibuan(bersihDigit(String(n))) : (/\d/.test(v) ? '0' : '');
    if (out !== el.value) el.value = out;
    el._uangPrev = out; el.dataset.fmt = '1';
  } else if (el.dataset.fmt) {
    if (/^\d{1,3}(\.\d{3})+$/.test(v)) el.value = v.replace(/\./g, '');
    delete el.dataset.fmt; el._uangPrev = '';
  }
  // Perubahan karena pengguna mengganti pilihan → beri tahu kalkulasi/pratinjau form
  if (kabari && el.value !== lama) el.dispatchEvent(new Event('input', { bubbles: true }));
}
document.addEventListener('input', e => {
  const el = e.target;
  if (!el || el.tagName !== 'INPUT' || el.dataset.uang === undefined || !uangAktif(el)) return;
  ketikUang(el, e.inputType);
}, true); // fase capture: dijalankan sebelum pratinjau/kalkulasi form membaca nilainya
// Ganti negara / tipe jasa / jenis voucher / arah kurs → input di sekitarnya menyesuaikan
function rapikanSekitar(t) { setTimeout(() => rapikanUang((t.closest && (t.closest('tr') || t.closest('form') || t.closest('.modal-body') || t.closest('.view'))) || document, true), 0); }
document.addEventListener('change', e => { if (e.target && e.target.tagName === 'SELECT') rapikanSekitar(e.target); });
document.addEventListener('input', e => { if (e.target && e.target.tagName === 'SELECT') rapikanSekitar(e.target); });
document.addEventListener('click', e => { const b = e.target && e.target.closest && e.target.closest('[data-vtipe],[data-vmtipe]'); if (b) rapikanSekitar(b); });

// ── Nominal total selalu sebaris & rata kanan: Rp 1.000 sampai Rp 1.000.000.000 ──
var PAS_SEL = '.inv-paper .tot-box .grand, .sum-row, .sum-total, .receipt .total, .receipt .row-x';
/** Bila nominal tidak muat sebaris dengan labelnya, ukuran huruf nominal dikecilkan bertahap (min. 12 px). */
function pasBaris(row) {
  const b = row.lastElementChild;
  if (!b || b === row.firstElementChild || b.tagName !== 'B') return;
  row._pasT = b.textContent;
  const w = row.clientWidth;
  if (!w) return; // tersembunyi: ResizeObserver memanggil lagi saat tampil
  row._pasW = w;
  b.style.fontSize = '';
  if (row.dataset.pas) delete row.dataset.pas;
  if (!luberBaris(row, b)) return;
  let fs = parseFloat(getComputedStyle(b).fontSize) || 16;
  while (fs > 12 && luberBaris(row, b)) { fs -= 1; b.style.fontSize = fs + 'px'; }
  if (luberBaris(row, b)) { b.style.fontSize = ''; row.dataset.pas = 'turun'; } // layar sangat sempit: nominal turun ke baris sendiri, tetap rata kanan
}
/** Nominal keluar dari kotak atau menimpa label (dihitung sampai pecahan piksel). */
function luberBaris(row, b) {
  if (row.scrollWidth > row.clientWidth) return true;
  const cs = getComputedStyle(row), rr = row.getBoundingClientRect(), rb = b.getBoundingClientRect(), rl = row.firstElementChild.getBoundingClientRect();
  return rb.right > rr.right - (parseFloat(cs.paddingRight) || 0) - (parseFloat(cs.borderRightWidth) || 0) + 0.5 || rl.right > rb.left + 0.5;
}
var _pasRO = null, _pasSet = new Set(), _pasKotor = new Set(), _pasJadwal = 0;
/** Satu kali per frame setelah DOM berubah: baris total baru/berubah dipaskan, input nominal baru dirapikan. */
function pasSemua(paksa) {
  _pasJadwal = 0;
  _pasSet.forEach(r => { if (!r.isConnected) { _pasSet.delete(r); if (_pasRO) _pasRO.unobserve(r); } });
  document.querySelectorAll(PAS_SEL).forEach(r => {
    if (!_pasSet.has(r)) { _pasSet.add(r); if (_pasRO) _pasRO.observe(r); else _pasKotor.add(r); return; }
    const b = r.lastElementChild;
    if (paksa || (b && b.textContent !== r._pasT)) _pasKotor.add(r);
  });
  _pasKotor.forEach(r => { if (r.isConnected) pasBaris(r); });
  _pasKotor.clear();
  document.querySelectorAll('input[data-uang]:not([data-uang-siap])').forEach(el => { el.setAttribute('data-uang-siap', ''); rapikanSatu(el); });
}
function jadwalPas() { if (!_pasJadwal) _pasJadwal = requestAnimationFrame(() => pasSemua(false)); }
function mulaiPasNominal() {
  if (window.__pasNominal) return;
  window.__pasNominal = true;
  // Ukuran diubah di frame berikutnya (bukan di dalam callback) agar tidak memicu galat "ResizeObserver loop"
  if (window.ResizeObserver) _pasRO = new ResizeObserver(es => { let ada = false; es.forEach(e => { const r = e.target; if (r.isConnected && r.clientWidth !== r._pasW) { _pasKotor.add(r); ada = true; } }); if (ada) jadwalPas(); });
  else window.addEventListener('resize', () => { if (!_pasJadwal) _pasJadwal = requestAnimationFrame(() => pasSemua(true)); });
  new MutationObserver(() => jadwalPas()).observe(document.body, { childList: true, subtree: true }); // cukup menandai; kerja dilakukan sekali per frame
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => pasSemua(true));
  pasSemua(true);
}
if (document.body) mulaiPasNominal(); else document.addEventListener('DOMContentLoaded', mulaiPasNominal);

// ── Member: batalkan pesanan yang belum diproses & belum dibayar ──
function bisaBatalMember(o) {
  return !!o && o.Status === 'Baru' && !o._pending && !(Number(o.Dibayar) > 0) && !paysOf(o.ID).some(p => p.Status !== 'Ditolak');
}
ACT.custBatal = async b => {
  const o = orderById(b.dataset.id);
  if (!bisaBatalMember(o)) return toast('Pesanan ini sudah diproses atau sudah ada pembayaran. Hubungi admin untuk pembatalan.', 'warning');
  const tambahan = (Number(o.PoinDitukar) > 0 ? ' Poin yang ditukar dikembalikan.' : '') + (o.KodeVoucher ? ' Voucher ' + o.KodeVoucher + ' bisa dipakai lagi.' : '');
  if (!(await confirmDlg({ title: 'Batalkan pesanan ' + o.NoOrder + '?', text: 'Pesanan tidak akan diproses.' + tambahan + ' Pembatalan tidak bisa diurungkan.', ok: 'Ya, batalkan pesanan', danger: true, icon: 'bi-x-circle' }))) return;
  await mutate('cust.batal', { id: o.ID }, { btn: b, busyLabel: 'Membatalkan…', optimistic: () => upsertLocal('orders', { ID: o.ID, Status: 'Batal' }) });
};

// ── Tanggal dari input: selalu yyyy-mm-dd walau browser menampilkan / mengirim format lain ──
function polaTgl(s) { const m = String(s || '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); return m ? (Number(m[2]) > 12 ? 'mdy' : Number(m[1]) > 12 ? 'dmy' : '') : ''; }
/** "2026-11-08", "08/11/2026", "11/26/2026" (format AS) → "2026-11-26". pola: 'mdy' | 'dmy' dari pasangan tanggalnya. */
function tglIso(v, pola) {
  const s = String(v || '').trim();
  const p2 = n => String(n).padStart(2, '0');
  let y, mo, d;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) { y = m[1]; mo = Number(m[2]); d = Number(m[3]); }
  else {
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (!m) return '';
    const a = Number(m[1]), b = Number(m[2]);
    const as = b > 12 || (a <= 12 && pola === 'mdy');
    d = as ? b : a; mo = as ? a : b; y = m[3];
  }
  const t = new Date(Number(y), mo - 1, d);
  if (t.getFullYear() !== Number(y) || t.getMonth() !== mo - 1 || t.getDate() !== d) return '';
  return y + '-' + p2(mo) + '-' + p2(d);
}

// ── Jumlah Titip di kartu barang tidak kembali ke 1 saat katalog dirender ulang (mis. sinkron data di latar belakang) ──
function qtyTitip(id) { const q = S.ui.qtyTitip && S.ui.qtyTitip[id]; return q >= 1 && q <= 99 ? q : 1; }
function simpanQtyTitip(i) {
  const v = Math.round(Number(i.value));
  if (!(v >= 1)) return;
  (S.ui.qtyTitip || (S.ui.qtyTitip = {}))[i.dataset.item] = Math.min(99, v);
}
['input', 'change'].forEach(ev => document.addEventListener(ev, e => { const i = e.target; if (i && i.matches && i.matches('.stepper input[data-item]')) simpanQtyTitip(i); }));
/** Render ulang daftar barang tanpa memutus ketikan jumlah: fokus & posisi kursor dikembalikan ke kartu yang sama. */
function jagaStepper(sel, render) {
  const box = document.querySelector(sel);
  const a = document.activeElement;
  const id = box && a && a.matches && a.matches('.stepper input[data-item]') && box.contains(a) ? a.dataset.item : null;
  if (id) simpanQtyTitip(a);
  render();
  if (!id) return;
  const baru = box.querySelector(`.stepper input[data-item="${id}"]`);
  if (baru) { if (a.value !== '') baru.value = a.value; baru.focus({ preventScroll: true }); }
}

// ════════════════════════════════════════════════════════
// BAGIAN 39 (v1.3.3): HARGA JUAL KATALOG & RINCIAN KEUNTUNGAN DI BERANDA
// Keuntungan = (harga jual − harga pokok) + jasa titip − potongan (diskon, voucher, poin).
// Ongkir tidak dihitung sebagai keuntungan karena diteruskan ke kurir.
// ════════════════════════════════════════════════════════

/** Harga jual hanya diatur & dilihat di panel oleh Super Admin dan Owner. */
function bolehHargaJual() { return !!S.me && (S.me.role === 'superadmin' || S.me.role === 'owner'); }
/** Harga pokok per pcs barang katalog = harga toko × kurs berjalan. */
function hargaPokokItem(i) { return Math.round((Number(i.HargaAsli) || 0) * kursOf(i.MataUang || muOf(i.Negara))); }

// ── Form barang: harga jual + alat "Samakan dengan harga toko" ──
function kotakHargaJual(i) {
  if (!bolehHargaJual()) return '';
  return `<div class="col-12"><div class="hj-box" id="hjBox">
    <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-2"><b><i class="bi bi-tag me-1"></i>Harga jual ke member</b><span class="tag">Super Admin &amp; Owner</span></div>
    <div class="row g-2 align-items-end">
      <div class="col-sm-5"><label class="form-label small mb-1" for="iHj">Harga jual per pcs</label><div class="input-group"><span class="input-group-text">Rp</span><input class="form-control" id="iHj" name="hargaJual" inputmode="numeric" data-uang value="${Number(i.HargaJual) > 0 ? num(i.HargaJual) : ''}" placeholder="Sama dengan harga toko" autocomplete="off"></div></div>
      <div class="col-sm-4"><button type="button" class="btn btn-soft w-100" data-act="hjSamakan"><i class="bi bi-arrow-left-right"></i>Samakan dengan harga toko</button></div>
      <div class="col-sm-3"><div class="hj-info" id="hjInfo" aria-live="polite"></div></div>
    </div>
    <div class="form-text">Member hanya melihat harga jual. Bila sama dengan harga toko, harga jual ikut berubah mengikuti kurs berjalan.</div>
  </div></div>`;
}
/** Nilai yang disimpan: 0 = mengikuti harga toko (kosong atau sama persis dengan harga toko saat ini). */
function nilaiHargaJual(f) {
  if (!f.hargaJual) return undefined;
  const hj = Math.round(angkaUang(f.hargaJual.value));
  const pokok = Math.round(angkaHarga(f.hargaAsli.value, muOf(f.negara.value)) * kursOf(muOf(f.negara.value)));
  return !hj || hj === pokok ? 0 : hj;
}
function infoHargaJual(f) {
  const box = $('#hjInfo'); if (!box || !f.hargaJual) return;
  const mu = muOf(f.negara.value);
  const pokok = Math.round(angkaHarga(f.hargaAsli.value, mu) * kursOf(mu));
  const hj = Math.round(angkaUang(f.hargaJual.value));
  if (!hj || hj === pokok) { box.innerHTML = `<span class="muted">Ikut harga toko</span><b class="d-block">Margin Rp 0</b>`; return; }
  const m = hj - pokok;
  box.innerHTML = `<span class="muted">Pokok ${rp(pokok)}</span><b class="d-block" style="color:${m >= 0 ? 'var(--mint-ink)' : 'var(--danger)'}">${m >= 0 ? 'Margin +' : 'Rugi −'}${rp(Math.abs(m))}${pokok ? ` (${num(Math.abs(m) / pokok * 100, 1)}%)` : ''}</b>`;
}
ACT.hjSamakan = () => {
  const f = $('#fItem'); if (!f || !f.hargaJual) return;
  const mu = muOf(f.negara.value);
  const pokok = Math.round(angkaHarga(f.hargaAsli.value, mu) * kursOf(mu));
  f.hargaJual.value = pokok ? grupRibuan(String(pokok)) : '';
  f.hargaJual.dataset.fmt = '1'; f.hargaJual._uangPrev = f.hargaJual.value;
  infoHargaJual(f);
};
/** Kolom harga jual di tabel katalog panel (Super Admin & Owner). */
function selHargaJual(i) {
  // v1.3.5: barang bervarian → rentang harga jual varian
  const vh = varianOf(i).map(v => hargaVarian(i, v)).map(h => h.hargaJual > 0 ? h.hargaJual : Math.round(h.hargaAsli * kursOf(i.MataUang || muOf(i.Negara))));
  if (vh.length) { const lo = Math.min(...vh), hi = Math.max(...vh); return `<b>${rp(lo)}${hi !== lo ? ' – ' + num(hi) : ''}</b><small class="d-block muted">${vh.length} varian</small>`; }
  if (!(Number(i.HargaJual) > 0)) return '<span class="muted small">= harga toko</span>';
  const m = Number(i.HargaJual) - hargaPokokItem(i);
  return `<b>${rp(i.HargaJual)}</b><small class="d-block" style="color:${m >= 0 ? 'var(--mint-ink)' : 'var(--danger)'}">${m >= 0 ? '+' : '−'}${rp(Math.abs(m))}</small>`;
}

// ── Beranda: rincian keuntungan ──
/** Harga pokok, harga jual, margin, jasa titip, potongan, dan total keuntungan pesanan (bukan Batal) dalam rentang tanggal. */
function hitungLaba(a, b) {
  const orders = S.d.orders.filter(o => o.Status !== 'Batal' && inRange(o.Tanggal, a, b));
  const per = new Map();
  let pokok = 0, jual = 0, jasa = 0, potongan = 0, qty = 0;
  const tambah = (key, d) => {
    const r = per.get(key) || { nama: d.nama, negara: d.negara, custom: d.custom, qty: 0, pokok: 0, jual: 0, jasa: 0, n: 0 };
    r.qty += d.qty; r.pokok += d.pokok; r.jual += d.jual; r.jasa += d.jasa; r.n++;
    per.set(key, r);
    pokok += d.pokok; jual += d.jual; jasa += d.jasa; qty += d.qty;
  };
  orders.forEach(o => {
    potongan += (Number(o.Diskon) || 0) + (Number(o.PotonganVoucher) || 0) + (Number(o.PotonganPoin) || 0);
    const its = itemsOf(o.ID);
    if (!its.length) { // rincian barang belum termuat: pakai angka pesanan
      const sub = Number(o.Subtotal) || 0;
      tambah('o:' + o.ID, { nama: 'Pesanan ' + o.NoOrder, negara: o.Negara, custom: true, qty: 0, pokok: o.Modal === undefined ? sub : Number(o.Modal) || 0, jual: sub, jasa: Number(o.JasaTitip) || 0 });
      return;
    }
    its.forEach(i => {
      const q = Number(i.Qty) || 0, hp = Number(i.HargaIDR) || 0, hj = Number(i.HargaJual) > 0 ? Number(i.HargaJual) : hp;
      const key = i.ItemID ? 'i:' + i.ItemID : 'c:' + i.Negara + ':' + String(i.Nama || '').trim().toLowerCase();
      tambah(key, { nama: i.Nama, negara: i.Negara, custom: !i.ItemID, qty: q, pokok: hp * q, jual: hj * q, jasa: Number(i.JasaIDR) || 0 });
    });
  });
  const barang = Array.from(per.values()).map(r => Object.assign(r, { margin: r.jual - r.pokok, untung: r.jual - r.pokok + r.jasa })).sort((x, y) => y.untung - x.untung || y.jual - x.jual);
  const margin = jual - pokok;
  return { orders, pokok, jual, margin, jasa, potongan, total: margin + jasa - potongan, qty, barang };
}
/** Sama dengan hitungLaba, disimpan sampai data berubah (KPI & kartu Beranda memakai hasil yang sama). */
function labaPeriode(a, b) { return ix('laba_' + a + '_' + b, () => hitungLaba(a, b)); }
function rentangLaba(v) {
  const today = ymd();
  if (v === 'lalu') return monthRange(-1);
  if (v === '30') return [addDays(today, -29), today];
  if (v === '90') return [addDays(today, -89), today];
  return monthRange(0);
}
function kartuLaba() {
  const v = S.ui.labaRange || 'bulan';
  return `<div class="cardx mb-4" id="labaCard"><div class="cardx-head"><div><h3>Rincian Keuntungan</h3><div class="cardx-sub">Harga jual − harga pokok = margin barang. Jasa titip dihitung terpisah.</div></div>
    <div class="seg" role="tablist" aria-label="Periode keuntungan">${[['bulan', 'Bulan Ini'], ['lalu', 'Bulan Lalu'], ['30', '30 Hari'], ['90', '3 Bulan']].map(([k, t]) => `<button class="${v === k ? 'on' : ''}" data-act="labaRange" data-v="${k}" role="tab" aria-selected="${v === k}">${t}</button>`).join('')}</div></div>
    <div class="cardx-body" id="labaBody"></div></div>`;
}
const tandaRp = n => `<span style="color:${n >= 0 ? 'var(--mint-ink)' : 'var(--danger)'}">${n < 0 ? '− ' : ''}${rp(Math.abs(n))}</span>`;
function renderLaba() {
  const box = $('#labaBody'); if (!box) return;
  const [a, b] = rentangLaba(S.ui.labaRange || 'bulan');
  const L = labaPeriode(a, b);
  const p = potongDaftar('laba', L.barang);
  const ubin = (cls, label, val, sub) => `<div class="laba-ubin ${cls}"><small>${label}</small><b>${val}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
  const op = s => `<div class="laba-op" aria-hidden="true">${s}</div>`;
  const pct = (x, y) => y ? num(x / y * 100, 1) + '%' : '0%';
  box.innerHTML = `<div class="small muted mb-3">${tglPendek(a)} – ${tgl(b)} · ${L.orders.length} pesanan · ${num(L.qty)} barang</div>
    <div class="laba-alur">
      ${ubin('', 'Harga jual', rp(L.jual), 'dibayar member')}${op('−')}${ubin('', 'Harga pokok', rp(L.pokok), 'harga toko × kurs')}${op('=')}${ubin('mint', 'Margin barang', tandaRp(L.margin), pct(L.margin, L.jual) + ' dari harga jual')}
    </div>
    <div class="laba-alur mt-2">
      ${ubin('mint', 'Margin barang', tandaRp(L.margin))}${op('+')}${ubin('sky', 'Jasa titip', rp(L.jasa), 'fee jastip')}${L.potongan ? op('−') + ubin('coral', 'Potongan', rp(L.potongan), 'diskon, voucher, poin') : ''}${op('=')}${ubin('total', 'Total keuntungan', tandaRp(L.total), 'margin + jasa titip' + (L.potongan ? ' − potongan' : ''))}
    </div>
    <div class="tbl-wrap mt-3">${L.barang.length ? `<table class="tbl laba-tbl"><thead><tr><th>Barang</th><th class="r">Qty</th><th class="r">Harga pokok</th><th class="r">Harga jual</th><th class="r">Margin</th><th class="r">Jasa titip</th><th class="r">Keuntungan</th></tr></thead><tbody>
      ${p.tampil.map(r => `<tr><td><b class="d-block">${esc(r.nama)}</b><span class="small muted">${flag(r.negara)} ${esc(negara(r.negara).nama)}${r.custom ? ' · request khusus' : ''}</span></td>
        <td class="r num">${num(r.qty)}</td>
        <td class="r num">${rp(r.pokok)}${r.qty ? `<small class="d-block muted">@ ${rp(Math.round(r.pokok / r.qty))}</small>` : ''}</td>
        <td class="r num">${rp(r.jual)}${r.qty ? `<small class="d-block muted">@ ${rp(Math.round(r.jual / r.qty))}</small>` : ''}</td>
        <td class="r num">${tandaRp(r.margin)}</td><td class="r num">${rp(r.jasa)}</td><td class="r num"><b>${tandaRp(r.untung)}</b></td></tr>`).join('')}
      ${tombolLagi(p, 7)}</tbody>
      <tfoot><tr><td><b>Total</b></td><td class="r num"><b>${num(L.qty)}</b></td><td class="r num"><b>${rp(L.pokok)}</b></td><td class="r num"><b>${rp(L.jual)}</b></td><td class="r num"><b>${tandaRp(L.margin)}</b></td><td class="r num"><b>${rp(L.jasa)}</b></td><td class="r num"><b>${tandaRp(L.margin + L.jasa)}</b></td></tr>
      ${L.potongan ? `<tr><td colspan="6">Potongan (diskon, voucher, poin)</td><td class="r num"><b>− ${rp(L.potongan)}</b></td></tr><tr><td colspan="6"><b>Total keuntungan</b></td><td class="r num"><b>${tandaRp(L.total)}</b></td></tr>` : ''}</tfoot></table>`
      : emptyState('bi-graph-up-arrow', 'Belum ada penjualan', 'Keuntungan muncul otomatis setelah ada pesanan pada periode ini.')}</div>
    <div class="small muted mt-2"><i class="bi bi-info-circle"></i> Ongkir tidak dihitung sebagai keuntungan. Pesanan berstatus Batal tidak dihitung.${bolehHargaJual() ? ' Atur harga jual barang di <button class="link-btn small" data-go="a-katalog">Katalog &amp; Trip</button>.' : ''}</div>`;
}
ACT.labaRange = b => { S.ui.labaRange = b.dataset.v; if (S.ui.batas) delete S.ui.batas.laba; $$('[data-act=labaRange]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); renderLaba(); };
ACT.lihatLaba = () => { const c = $('#labaCard'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

// ════════════════════════════════════════════════════════
// BAGIAN 40 (v1.3.4): SISA STOK, ULASAN MEMBER, TERLARIS, IMPOR EXCEL, INGAT NAMA PENGGUNA (hapus latar foto dihapus di v1.3.5)
// Semua fungsi memakai deklarasi function (ter-hoist) agar aman dipanggil dari modul lain.
// ════════════════════════════════════════════════════════

// ── Statistik barang (dari server: terjual, rating, sisa stok) ──
function statItem(id) { return (S.boot && S.boot.stat && S.boot.stat[id]) || null; }
/** Sisa stok barang; null = tidak dibatasi. */
function sisaStok(it) {
  if (!it) return null;
  const s = statItem(it.ID);
  if (s && s.s !== null && s.s !== undefined) return Number(s.s);
  return it.StokSejak ? Math.max(0, Number(it.Stok) || 0) : null;
}
function stokTag(sisa) {
  if (sisa === null) return '';
  if (sisa <= 0) return '<span class="stok-tag habis">Stok habis</span>';
  return `<span class="stok-tag ${sisa <= 5 ? 'tipis' : ''}">${sisa <= 5 ? 'Sisa ' + num(sisa) + ' lagi' : 'Stok ' + num(sisa)}</span>`;
}
/** Bintang rating (karakter ★ agar tetap tampil tanpa font ikon). */
function bintangHtml(r, cls = '') {
  const v = Math.max(0, Math.min(5, Number(r) || 0));
  return `<span class="bintang-baca ${cls}" role="img" aria-label="Rating ${num(v, 1)} dari 5"><span class="isi" style="width:${v / 5 * 100}%">★★★★★</span><span class="dasar">★★★★★</span></span>`;
}
/** Terlaris (3 teratas per negara, terjual ≥ 2) & ulasan terbaik (3 teratas per negara, rating ≥ 4). */
function peringkatKatalog() {
  return ix('peringkatKat', () => {
    const laris = new Map(), terbaik = new Map();
    const per = {};
    (S.boot.items || []).forEach(i => { (per[i.Negara] || (per[i.Negara] = [])).push(i); });
    Object.keys(per).forEach(neg => {
      const xs = per[neg].map(i => ({ i, s: statItem(i.ID) || { t: 0, r: 0, n: 0 } }));
      xs.filter(x => x.s.t >= 2).sort((a, b) => b.s.t - a.s.t || b.s.r - a.s.r).slice(0, 3).forEach((x, k) => laris.set(x.i.ID, k));
      xs.filter(x => x.s.n >= 1 && x.s.r >= 4).sort((a, b) => b.s.r - a.s.r || b.s.n - a.s.n || b.s.t - a.s.t).slice(0, 3).forEach((x, k) => terbaik.set(x.i.ID, k));
    });
    return { laris, terbaik };
  });
}
/** Urutan "Paling populer" (v1.3.5): Terlaris lalu Populer di paling atas, berikutnya ulasan terbaik, sisanya seperti biasa. */
function urutanPopuler(list, dasar) {
  const rk = peringkatKatalog();
  const terjual = i => (statItem(i.ID) || {}).t || 0;
  const grup = i => rk.laris.has(i.ID) ? 0 : i.Promo ? 1 : rk.terbaik.has(i.ID) ? 2 : 3;
  return list.sort((a, b) => {
    const ga = grup(a), gb = grup(b);
    if (ga !== gb) return ga - gb;
    if (ga === 0) return terjual(b) - terjual(a) || dasar(a, b);
    if (ga === 2) return rk.terbaik.get(a.ID) - rk.terbaik.get(b.ID) || dasar(a, b);
    return dasar(a, b);
  });
}
/** Lencana kanan atas foto: tulisan Proper ("Terlaris" / "Populer"), ukuran sama dengan chip negara. */
function badgeKatalog(it) {
  if (peringkatKatalog().laris.has(it.ID)) return '<span class="chip-kat laris-badge"><span class="api" aria-hidden="true">🔥</span><span class="chip-txt">Terlaris</span></span>';
  if (it.Promo) return '<span class="chip-kat hot-badge"><i class="bi bi-fire" aria-hidden="true"></i><span class="chip-txt">Populer</span></span>';
  return '';
}
/** Lencana "Ulasan terbaik" di sudut kiri bawah foto. */
function badgeBawah(it) {
  return peringkatKatalog().terbaik.has(it.ID) ? '<div class="prod-chips-bawah"><span class="terbaik-badge"><span aria-hidden="true">★</span><span class="chip-txt">Ulasan terbaik</span></span></div>' : '';
}
function metaKatalog(it) {
  const s = statItem(it.ID), sisa = sisaStok(it);
  const bag = [];
  if (s && s.n) bag.push(`<span class="rate">${bintangHtml(s.r, 'kecil')}<b>${num(s.r, 1)}</b><span class="muted">(${num(s.n)})</span></span>`);
  if (s && s.t) bag.push(`<span class="terjual">Terjual ${num(s.t)}</span>`);
  if (sisa !== null) bag.push(stokTag(sisa));
  return bag.length ? `<div class="prod-meta">${bag.join('')}</div>` : '';
}

// ── Detail barang + ulasan pembeli: ACT.prodDetail ada di BAGIAN 41 (v1.3.5: galeri & varian) ──
function daftarUlasanHtml(d) {
  if (!d.n) return '<p class="muted mb-0">Belum ada ulasan untuk barang ini.</p>';
  const maks = Math.max(1, ...d.dist);
  return `<div class="ulasan-ringkas"><div class="nilai"><b>${num(d.rata, 1)}</b>${bintangHtml(d.rata)}<span class="small muted">${num(d.n)} ulasan</span></div>
      <div class="dist">${[5, 4, 3, 2, 1].map(k => `<div class="d-row"><span>${k} ★</span><div class="bar gold"><span style="width:${d.dist[k - 1] / maks * 100}%"></span></div><span class="muted">${num(d.dist[k - 1])}</span></div>`).join('')}</div></div>
    <div class="ulasan-list">${d.ulasan.map(u => `<article class="ulasan-item"><div class="d-flex justify-content-between gap-2 align-items-start"><div class="d-flex gap-2 align-items-center"><span class="avatar sm">${esc(String(u.NamaTampil || 'M').slice(0, 1))}</span><div><b class="d-block">${esc(u.NamaTampil || 'Member')}</b>${bintangHtml(u.Rating, 'kecil')}</div></div><span class="small muted nowrap">${tgl(u.Dibuat)}</span></div>
      ${u.Komentar ? `<p class="mb-0 mt-2 ulasan-teks">${esc(u.Komentar)}</p>` : ''}
      ${u.FotoFileId ? `<button type="button" class="ulasan-foto" data-act="ulasanFotoBesar" aria-label="Perbesar foto ulasan"><img src="${esc(driveImg(u.FotoFileId, 900))}" alt="Foto barang yang diterima pembeli" loading="lazy" onerror="this.parentNode.remove()"></button>` : ''}</article>`).join('')}</div>`;
}
ACT.ulasanFotoBesar = b => b.classList.toggle('besar');

// ── Member: ulas barang dari Pesanan Saya ──
function poinUlasan() { const s = sett(); return s.poinUlasan === undefined || s.poinUlasan === '' ? 10 : Math.max(0, Number(s.poinUlasan) || 0); }
function poinUlasanAktif() { return poinCfg().aktif && poinUlasan() > 0; }
function ulasanDari(oiId) { return (S.d.reviews || []).find(r => r.OrderItemID === oiId) || null; }
function barisBisaDiulas(o) { return o && o.Status === 'Selesai' ? itemsOf(o.ID).filter(i => i.ItemID) : []; }
function belumDiulas(o) { return barisBisaDiulas(o).filter(i => !ulasanDari(i.ID)).length; }
function kartuUlasanOrder(o) {
  const its = barisBisaDiulas(o);
  if (!its.length) {
    if (o.Status === 'Dikirim' && itemsOf(o.ID).some(i => i.ItemID) && poinUlasanAktif()) return `<div class="ulas-hint mt-3"><i class="bi bi-star"></i><div>Setelah barang diterima dan pesanan <b>Selesai</b>, beri ulasan untuk mendapat <b>+${num(poinUlasan())} poin</b> per barang.</div></div>`;
    return '';
  }
  return `<div class="cardx pad mt-3 ulas-card"><div class="d-flex justify-content-between align-items-center gap-2 mb-2 flex-wrap"><h3 class="fs-6 fw-bold mb-0">Ulas barang yang Anda terima</h3>${poinUlasanAktif() ? `<span class="tag gold">+${num(poinUlasan())} poin / barang</span>` : ''}</div>
    ${its.map(i => { const u = ulasanDari(i.ID); const kat = (S.boot.items || []).find(x => x.ID === i.ItemID); return `<div class="ulas-row">${kat ? prodImg(kat, 'cart-thumb') : '<div class="cart-thumb"></div>'}<div class="min-w-0 flex-fill"><b class="d-block text-truncate">${esc(i.Nama)}</b>${u ? `<div class="d-flex align-items-center gap-2 flex-wrap">${bintangHtml(u.Rating, 'kecil')}<span class="small muted text-truncate">${esc(u.Komentar || 'Tanpa komentar')}</span>${u.Status === 'Disembunyikan' ? '<span class="tag">Disembunyikan admin</span>' : ''}</div>` : `<span class="small muted">${i.Qty} pcs</span>`}</div>
      <button class="btn btn-sm ${u ? 'btn-light' : 'btn-primary'}" data-act="ulasForm" data-oi="${i.ID}">${u ? '<i class="bi bi-pencil"></i>Ubah' : `<i class="bi bi-star"></i>Beri ulasan`}</button></div>`; }).join('')}</div>`;
}
const LABEL_BINTANG = ['', 'Sangat kurang', 'Kurang', 'Cukup', 'Bagus', 'Sangat bagus'];
ACT.ulasForm = b => {
  const oi = (S.d.orderItems || []).find(x => x.ID === b.dataset.oi);
  if (!oi) return;
  const o = orderById(oi.OrderID), u = ulasanDari(oi.ID);
  const kat = (S.boot.items || []).find(x => x.ID === oi.ItemID);
  let rating = u ? Number(u.Rating) : 0;
  modal({ title: u ? 'Ubah ulasan' : 'Beri ulasan', body: `<form id="fUlas" novalidate>
      <div class="d-flex gap-3 align-items-center mb-3">${kat ? prodImg(kat, 'cart-thumb') : ''}<div><b>${esc(oi.Nama)}</b><div class="small muted">Pesanan ${esc(o ? o.NoOrder : '')}</div></div></div>
      <fieldset class="mb-3"><legend class="form-label">Rating <span class="req">*</span></legend>
        <div class="bintang-pilih" role="radiogroup" aria-label="Rating bintang">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="bintang ${n <= rating ? 'on' : ''}" data-act="ulasBintang" data-v="${n}" role="radio" aria-checked="${n === rating}" aria-label="${n} bintang">★</button>`).join('')}<span class="small fw-semibold ms-2" id="ulasLabel">${LABEL_BINTANG[rating] || 'Pilih 1–5 bintang'}</span></div></fieldset>
      <div class="mb-3"><label class="form-label" for="ulasKom">Komentar</label><textarea class="form-control" id="ulasKom" name="komentar" rows="3" maxlength="600" placeholder="Bagaimana kualitas barang, kemasan, dan kesesuaiannya dengan foto katalog?">${esc(u ? u.Komentar || '' : '')}</textarea><div class="form-text text-end"><span id="ulasCnt">${(u && u.Komentar || '').length}</span>/600</div></div>
      <div class="mb-2"><label class="form-label">Foto kondisi barang <span class="muted small">(opsional)</span></label>${dropzone('ulasFoto', u && u.FotoFileId ? 'Ganti foto barang yang diterima' : 'Ambil / unggah foto barang yang diterima', 'image/*')}
        ${u && u.FotoFileId ? `<div class="d-flex align-items-center gap-2 mt-2"><img src="${esc(driveImg(u.FotoFileId, 200))}" alt="Foto ulasan sebelumnya" class="ulas-thumb"><label class="form-check small"><input class="form-check-input" type="checkbox" id="ulasHapusFoto"> Hapus foto ini</label></div>` : ''}</div>
      <div id="ulasErr" aria-live="polite"></div></form>`,
    foot: `<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnUlas"><i class="bi bi-send"></i>${u ? 'Simpan ulasan' : 'Kirim ulasan' + (poinUlasanAktif() ? ` · +${num(poinUlasan())} poin` : '')}</button>` });
  const f = $('#fUlas');
  f.dataset.rating = rating;
  $('#ulasKom').addEventListener('input', e => { $('#ulasCnt').textContent = e.target.value.length; });
  $('#btnUlas').onclick = async e => {
    const btn = e.currentTarget, box = $('#ulasErr');
    box.innerHTML = '';
    const r = Number(f.dataset.rating) || 0;
    if (r < 1) { box.innerHTML = '<div class="alert-x warn mb-0"><i class="bi bi-star"></i><div>Pilih rating 1 sampai 5 bintang.</div></div>'; return; }
    const file = takeFile('ulasFoto');
    const data = { orderItemId: oi.ID, rating: r, komentar: $('#ulasKom').value.trim(), file, hapusFoto: !!($('#ulasHapusFoto') && $('#ulasHapusFoto').checked) };
    const res = await mutate('ulasan.simpan', data, { btn, busyLabel: file ? 'Mengunggah foto…' : 'Mengirim…', rerenderView: false, onOk: closeModal });
    if (res.success) rerender();
    else if (box.isConnected && !kodeSesiHabis(res.code)) box.innerHTML = `<div class="alert-x danger mb-0"><i class="bi bi-x-circle"></i><div><b>Ulasan belum terkirim.</b><br>${esc(res.message || '')}</div></div>`;
  };
};
ACT.ulasBintang = b => {
  const f = $('#fUlas'); if (!f) return;
  const v = Number(b.dataset.v);
  f.dataset.rating = v;
  $$('#fUlas .bintang').forEach(x => { const n = Number(x.dataset.v); x.classList.toggle('on', n <= v); x.setAttribute('aria-checked', n === v); });
  $('#ulasLabel').textContent = LABEL_BINTANG[v];
  const er = $('#ulasErr'); if (er) er.innerHTML = '';
};

// ── Panel: moderasi ulasan (tab Ulasan di Katalog & Trip) ──
function tabUlasanAdmin() {
  const list = (S.d.reviews || []).slice().sort((a, b) => String(b.Dibuat).localeCompare(String(a.Dibuat)));
  const p = potongDaftar('ulasanAdm', list);
  return `<div class="cardx"><div class="cardx-head"><div><h3>Ulasan member</h3><div class="cardx-sub">Ulasan tampil di katalog setiap barang. Sembunyikan ulasan yang tidak pantas; poin member tidak ditarik.</div></div></div>
    <div class="cardx-body pt-0">${list.length ? `<div class="ulasan-admin">${p.tampil.map(r => `<article class="ulasan-item ${r.Status === 'Tampil' ? '' : 'off'}">
      <div class="d-flex justify-content-between gap-3 align-items-start flex-wrap"><div class="min-w-0"><b class="d-block">${esc(r.NamaBarang || '-')}</b><div class="d-flex gap-2 align-items-center flex-wrap small">${bintangHtml(r.Rating, 'kecil')}<span>${esc(r.NamaTampil || '')}</span><span class="muted">· ${esc(r.NoOrder || '')} · ${tgl(r.Dibuat)}</span>${Number(r.Poin) ? `<span class="tag gold">+${num(r.Poin)} poin</span>` : ''}</div></div>
        <label class="form-check form-switch mb-0 small"><input class="form-check-input" type="checkbox" data-act="ulasanToggle" data-id="${r.ID}" ${r.Status === 'Tampil' ? 'checked' : ''}> Tampil di katalog</label></div>
      ${r.Komentar ? `<p class="mb-0 mt-2 ulasan-teks">${esc(r.Komentar)}</p>` : ''}
      ${r.FotoFileId ? `<button type="button" class="ulasan-foto" data-act="ulasanFotoBesar" aria-label="Perbesar foto ulasan"><img src="${esc(driveImg(r.FotoFileId, 900))}" alt="Foto ulasan" loading="lazy" onerror="this.parentNode.remove()"></button>` : ''}</article>`).join('')}${tombolLagi(p)}</div>`
      : emptyState('bi-star', 'Belum ada ulasan', 'Member bisa mengulas barang setelah pesanannya berstatus Selesai.')}</div></div>`;
}
ACT.ulasanToggle = async b => {
  const r = (S.d.reviews || []).find(x => x.ID === b.dataset.id); if (!r) return;
  const tampil = b.checked;
  const res = await mutate('ulasan.status', { id: r.ID, tampil }, { rerenderView: false, optimistic: () => upsertLocal('reviews', { ID: r.ID, Status: tampil ? 'Tampil' : 'Disembunyikan' }) });
  if (!res.success) b.checked = !tampil;
  const art = b.closest('.ulasan-item'); if (art) art.classList.toggle('off', !b.checked);
};

// ── Panel: kolom stok & penjualan di tabel katalog ──
function selStok(i) {
  const s = statItem(i.ID), sisa = sisaStok(i);
  const a = sisa === null ? '<span class="muted small">Tidak dibatasi</span>' : stokTag(sisa);
  const b = s && (s.t || s.n) ? `<small class="d-block muted">${s.t ? 'Terjual ' + num(s.t) : ''}${s.t && s.n ? ' · ' : ''}${s.n ? '★ ' + num(s.r, 1) + ' (' + num(s.n) + ')' : ''}</small>` : '';
  return a + b;
}
function stokAwalForm(i) { const s = i && i.ID ? sisaStok(i) : null; return s === null ? '' : String(s); }

// ── Login: ingat nama pengguna / nomor HP ──
function userTersimpan() { try { return localStorage.getItem('jst_ingat_user') || ''; } catch (e) { return ''; } }
function simpanUserLogin(ingat, user) { try { if (ingat && user) localStorage.setItem('jst_ingat_user', user); else localStorage.removeItem('jst_ingat_user'); } catch (e) { /* mode privat */ } }

// ════════════════════════════════════════════════════════
// IMPOR BARANG DARI EXCEL (.xlsx / .csv) — tanpa pustaka luar
// ════════════════════════════════════════════════════════
const TABEL_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = TABEL_CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
/** ZIP tanpa kompresi (cukup untuk .xlsx) → Blob. files: [{ nama, isi }] */
function buatZip(files, mime) {
  const enc = new TextEncoder(), bagian = [], pusat = [];
  let off = 0;
  files.forEach(f => {
    const nama = enc.encode(f.nama), data = enc.encode(f.isi), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nama.length, true);
    bagian.push(new Uint8Array(lh.buffer), nama, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nama.length, true); ch.setUint32(42, off, true);
    pusat.push(new Uint8Array(ch.buffer), nama);
    off += 30 + nama.length + data.length;
  });
  const panjangPusat = pusat.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, panjangPusat, true); e.setUint32(16, off, true);
  return new Blob(bagian.concat(pusat, [new Uint8Array(e.buffer)]), { type: mime || 'application/zip' });
}
async function bacaZip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Berkas bukan Excel (.xlsx) yang valid.');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const files = {}, dec = new TextDecoder();
  for (let k = 0; k < n && dv.getUint32(p, true) === 0x02014b50; k++) {
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    files[dec.decode(u8.subarray(p + 46, p + 46 + nl))] = { metode: dv.getUint16(p + 10, true), ukuran: dv.getUint32(p + 20, true), lho: dv.getUint32(p + 42, true) };
    p += 46 + nl + xl + cl;
  }
  const baca = async nama => {
    const f = files[nama]; if (!f) return null;
    const mulai = f.lho + 30 + dv.getUint16(f.lho + 26, true) + dv.getUint16(f.lho + 28, true);
    const data = u8.subarray(mulai, mulai + f.ukuran);
    if (f.metode === 0) return dec.decode(data);
    if (f.metode !== 8) throw new Error('Kompresi file Excel tidak didukung. Simpan ulang sebagai .xlsx atau .csv.');
    if (typeof DecompressionStream === 'undefined') throw new Error('Browser ini belum bisa membaca .xlsx. Simpan file sebagai CSV lalu unggah lagi.');
    return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  };
  return { files, baca };
}
const kolomKeIndeks = ref => { const m = String(ref).match(/^([A-Z]+)/); let n = 0; if (m) for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
/** .xlsx → array baris (sheet pertama). Sel teks/angka/boolean. */
async function bacaXlsx(buf) {
  const z = await bacaZip(buf);
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const semua = (doc, tag) => Array.from(doc.getElementsByTagNameNS('*', tag));
  let lokasi = 'xl/worksheets/sheet1.xml';
  try {
    const wb = xml(await z.baca('xl/workbook.xml')), rels = xml(await z.baca('xl/_rels/workbook.xml.rels'));
    const sh = semua(wb, 'sheet')[0];
    const rid = sh && (sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
    const rel = semua(rels, 'Relationship').find(r => r.getAttribute('Id') === rid);
    if (rel) { const t = rel.getAttribute('Target').replace(/^\//, ''); lokasi = t.startsWith('xl/') ? t : 'xl/' + t; }
  } catch (e) { /* pakai sheet1 */ }
  const ssTeks = await z.baca('xl/sharedStrings.xml');
  const ss = ssTeks ? semua(xml(ssTeks), 'si').map(si => semua(si, 't').map(t => t.textContent).join('')) : [];
  const shTeks = await z.baca(lokasi);
  if (!shTeks) throw new Error('Sheet pertama tidak ditemukan di file Excel.');
  const rows = [];
  semua(xml(shTeks), 'row').forEach(r => {
    const ri = Number(r.getAttribute('r')) - 1;
    const row = [];
    semua(r, 'c').forEach((c, ci) => {
      const t = c.getAttribute('t'), vEl = semua(c, 'v')[0], v = vEl ? vEl.textContent : '';
      const idx = c.getAttribute('r') ? kolomKeIndeks(c.getAttribute('r')) : ci;
      row[idx] = t === 's' ? (ss[Number(v)] || '') : t === 'inlineStr' ? semua(c, 't').map(x => x.textContent).join('') : t === 'b' ? v === '1' : t === 'str' || t === 'e' ? v : v === '' ? '' : Number(v);
    });
    rows[isNaN(ri) ? rows.length : ri] = row;
  });
  return Array.from(rows, r => r || []);
}
function bacaCsv(teks) {
  teks = teks.replace(/^﻿/, '');
  const baris1 = teks.split(/\r?\n/)[0] || '';
  const sep = (baris1.match(/;/g) || []).length > (baris1.match(/,/g) || []).length ? ';' : (baris1.match(/\t/g) || []).length > (baris1.match(/,/g) || []).length ? '\t' : ',';
  const rows = []; let row = [], sel = '', kutip = false;
  for (let i = 0; i < teks.length; i++) {
    const ch = teks[i];
    if (kutip) { if (ch === '"' && teks[i + 1] === '"') { sel += '"'; i++; } else if (ch === '"') kutip = false; else sel += ch; }
    else if (ch === '"') kutip = true;
    else if (ch === sep) { row.push(sel); sel = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && teks[i + 1] === '\n') i++; row.push(sel); rows.push(row); row = []; sel = ''; }
    else sel += ch;
  }
  if (sel !== '' || row.length) { row.push(sel); rows.push(row); }
  return rows;
}
const KOLOM_IMPOR = [['nama', /^nama|nama barang|product|produk/i], ['hargaJual', /harga\s*jual|jual/i], ['hargaAsli', /harga\s*(di\s*)?toko|harga\s*asli|harga\s*beli|harga\s*toko/i], ['kategori', /kategori|category/i], ['negara', /negara|country/i], ['stok', /stok|stock/i]];
/** Baris mentah → { kolom: {nama: idx,…}, data: [{ baris, nama, hargaAsli, hargaJual, kategori, negara, stok }] } */
function petakanImpor(rows) {
  const hi = rows.findIndex(r => r && r.some(v => /nama/i.test(String(v || ''))) && r.some(v => /harga/i.test(String(v || ''))));
  if (hi < 0) throw new Error('Baris judul tidak ditemukan. Pastikan ada kolom "Nama Barang" dan "Harga di Toko" seperti contoh format.');
  const kolom = {};
  rows[hi].forEach((v, i) => { const t = String(v || '').trim(); const k = KOLOM_IMPOR.find(([key, re]) => kolom[key] === undefined && re.test(t)); if (k) kolom[k[0]] = i; });
  if (kolom.nama === undefined || kolom.hargaAsli === undefined) throw new Error('Kolom "Nama Barang" dan "Harga di Toko" wajib ada.');
  const ambil = (r, k) => kolom[k] === undefined ? '' : r[kolom[k]] === undefined || r[kolom[k]] === null ? '' : r[kolom[k]];
  const data = [];
  rows.slice(hi + 1).forEach((r, i) => {
    if (!r || !r.some(v => String(v === undefined ? '' : v).trim() !== '')) return;
    data.push({ baris: hi + i + 2, nama: String(ambil(r, 'nama')).trim(), hargaAsli: ambil(r, 'hargaAsli'), hargaJual: ambil(r, 'hargaJual'), kategori: String(ambil(r, 'kategori')).trim(), negara: String(ambil(r, 'negara')).trim(), stok: ambil(r, 'stok') });
  });
  return { kolom, data };
}
function kodeNegaraDari(v) {
  const t = String(v || '').trim().toLowerCase(); if (!t) return '';
  const c = countries().find(x => x.kode.toLowerCase() === t || String(x.nama).toLowerCase() === t || String(x.mataUang).toLowerCase() === t);
  return c ? c.kode : null;
}
const angkaSel = (v, mu) => typeof v === 'number' ? v : String(v).trim() === '' ? NaN : angkaHarga(String(v).replace(/[^\d.,-]/g, ''), mu);
/** Validasi & normalisasi baris impor di browser (server tetap memeriksa ulang). */
function siapkanImpor(data, negDefault) {
  const ada = new Set((S.d.allItems || []).map(i => String(i.Nama).toLowerCase().replace(/\s+/g, ' ').trim() + '|' + i.Negara));
  const diFile = new Map();
  return data.map(r => {
    const kn = kodeNegaraDari(r.negara);
    const neg = kn || negDefault, mu = muOf(neg);
    const x = { baris: r.baris, nama: r.nama.replace(/\s+/g, ' '), negara: neg, kategori: r.kategori, hargaAsli: angkaSel(r.hargaAsli, mu) };
    const hj = angkaSel(r.hargaJual, 'IDR'); if (!isNaN(hj)) x.hargaJual = Math.round(hj);
    const sk = angkaSel(r.stok, 'IDR'); if (!isNaN(sk)) x.stok = Math.max(0, Math.round(sk));
    const k = x.nama.toLowerCase() + '|' + neg;
    x.status = !x.nama ? 'gagal' : kn === null ? 'gagal' : !(x.hargaAsli > 0) ? 'gagal' : diFile.has(k) ? 'duplikat' : ada.has(k) ? 'ada' : 'baru';
    x.alasan = !x.nama ? 'Nama barang kosong' : kn === null ? 'Negara "' + r.negara + '" tidak dikenal' : !(x.hargaAsli > 0) ? 'Harga di toko kosong / tidak valid' : diFile.has(k) ? 'Sama dengan baris ' + diFile.get(k) : '';
    if (x.nama && !diFile.has(k)) diFile.set(k, r.baris);
    return x;
  });
}
const esX = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function selX(ref, v, gaya) {
  if (typeof v === 'number') return `<c r="${ref}"${gaya ? ` s="${gaya}"` : ''}><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${gaya ? ` s="${gaya}"` : ''}><is><t xml:space="preserve">${esX(v)}</t></is></c>`;
}
function sheetX(rows, lebar) {
  const huruf = i => String.fromCharCode(65 + i);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${lebar.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => v === '' || v === null || v === undefined ? '' : selX(huruf(ci) + (ri + 1), v, ri === 0 ? 1 : typeof v === 'number' ? 2 : 0)).join('')}</row>`).join('')}</sheetData></worksheet>`;
}
/** Contoh format impor: Nama Barang | Harga di Toko | Harga Jual | Kategori (+ sheet Petunjuk). */
function templateImporXlsx() {
  const contoh = [['Nama Barang', 'Harga di Toko', 'Harga Jual', 'Kategori'], ['Kopi Susu Botol 250 ml', 15000, 20000, 'Minuman'], ['Keripik Pedas Level 5', 12000, 18000, 'Snack'], ['Bolu Kukus Pandan isi 10', 35000, '', 'Snack']];
  const petunjuk = [['Petunjuk impor barang ' + (sett().appName || 'Jastica')], ['1. Isi sheet "Barang" mulai baris ke-2. Jangan ubah judul kolom di baris pertama.'], ['2. Nama Barang dan Harga di Toko wajib diisi. Harga di Toko memakai mata uang negara yang dipilih saat impor (contoh: Jakarta = Rupiah, Jepang = Yen).'], ['3. Harga Jual (Rupiah, per pcs) boleh dikosongkan = sama dengan harga toko. Harga Jual hanya disimpan bila diimpor oleh Super Admin atau Owner.'], ['4. Kategori contoh: Snack, Kosmetik, Skincare, Fashion, Minuman, Elektronik, Lainnya.'], ['5. Opsional: tambahkan kolom "Negara" (Jakarta, Malaysia, Singapura, Jepang, Thailand) atau "Stok" bila perlu.'], ['6. Simpan sebagai .xlsx lalu unggah di Katalog & Trip → Impor Excel.']];
  const gaya = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF6C5CE7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  return buatZip([
    { nama: '[Content_Types].xml', isi: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { nama: '_rels/.rels', isi: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { nama: 'xl/workbook.xml', isi: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Barang" sheetId="1" r:id="rId1"/><sheet name="Petunjuk" sheetId="2" r:id="rId2"/></sheets></workbook>' },
    { nama: 'xl/_rels/workbook.xml.rels', isi: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { nama: 'xl/styles.xml', isi: gaya },
    { nama: 'xl/worksheets/sheet1.xml', isi: sheetX(contoh, [34, 16, 16, 16]) },
    { nama: 'xl/worksheets/sheet2.xml', isi: sheetX(petunjuk, [120]) }
  ], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
ACT.imporTemplate = () => { downloadBlob(templateImporXlsx(), 'Contoh-Impor-Barang-' + slug(sett().appName || 'Jastica') + '.xlsx'); toast('Contoh format diunduh. Isi lalu unggah kembali.', 'success'); };
let _impor = null;
ACT.imporExcel = () => {
  _impor = { mentah: null, baris: [], nama: '' };
  const boleh = bolehHargaJual();
  modal({ title: 'Impor barang dari Excel', size: 'xl', body: `<div class="impor-langkah">
      <div class="langkah"><span class="no">1</span><div class="flex-fill"><b>Unduh contoh format</b><div class="small muted">Kolom: Nama Barang · Harga di Toko · Harga Jual · Kategori. Bisa diisi di Excel atau Google Sheets.</div></div><button type="button" class="btn btn-soft btn-sm" data-act="imporTemplate"><i class="bi bi-file-earmark-spreadsheet"></i>Unduh contoh (.xlsx)</button></div>
      <div class="langkah"><span class="no">2</span><div class="flex-fill"><b>Negara asal barang</b><div class="small muted">Menentukan mata uang Harga di Toko (kecuali baris yang punya kolom Negara).</div></div><select class="form-select form-select-sm" id="impNeg" style="max-width:220px">${countries().map(c => `<option value="${c.kode}" ${c.kode === (S.ui.kk && S.ui.kk.neg || 'ID') ? 'selected' : ''}>${esc(c.nama)} (${c.mataUang})</option>`).join('')}</select></div>
      <div class="langkah"><span class="no">3</span><div class="flex-fill"><b>Unggah file</b><div class="small muted">.xlsx atau .csv, maksimal 500 barang sekali impor.${boleh ? '' : ' Kolom Harga Jual diabaikan (hanya Super Admin & Owner).'}</div></div><label class="btn btn-primary btn-sm mb-0" for="impFile"><i class="bi bi-upload"></i>Pilih file</label><input type="file" id="impFile" class="visually-hidden" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div>
    </div><div id="impHasil" class="mt-3" aria-live="polite"></div>`,
    foot: '<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnImpor" disabled><i class="bi bi-box-arrow-in-down"></i>Impor barang</button>' });
  $('#impFile').onchange = async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    const box = $('#impHasil');
    box.innerHTML = '<div class="small muted"><span class="spin me-1" aria-hidden="true"></span>Membaca file…</div>';
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('File maksimal 5 MB.');
      const rows = /\.csv$/i.test(file.name) || /csv/.test(file.type) ? bacaCsv(await file.text()) : await bacaXlsx(await file.arrayBuffer());
      _impor.mentah = petakanImpor(rows); _impor.nama = file.name;
      renderImpor();
    } catch (er) { _impor.mentah = null; $('#btnImpor').disabled = true; box.innerHTML = `<div class="alert-x danger mb-0"><i class="bi bi-x-circle"></i><div><b>File belum bisa dibaca.</b><br>${esc(er.message)}</div></div>`; }
  };
  $('#impNeg').onchange = () => { if (_impor.mentah) renderImpor(); };
  $('#btnImpor').onclick = e => kirimImpor(e.currentTarget);
};
function renderImpor() {
  const box = $('#impHasil'); if (!box || !_impor.mentah) return;
  const neg = $('#impNeg').value;
  const xs = _impor.baris = siapkanImpor(_impor.mentah.data, neg);
  const n = k => xs.filter(x => x.status === k).length;
  const perbarui = $('#impMode') ? $('#impMode').value === 'perbarui' : false;
  const boleh = bolehHargaJual();
  const label = { baru: ['Baru', 'mint'], ada: [perbarui ? 'Diperbarui' : 'Sudah ada · dilewati', perbarui ? 'sky' : ''], duplikat: ['Duplikat · dilewati', ''], gagal: ['Gagal', 'danger'] };
  box.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center mb-2"><b class="me-1">${esc(_impor.nama)}</b><span class="tag mint">${n('baru')} baru</span><span class="tag">${n('ada')} sudah ada</span>${n('duplikat') ? `<span class="tag">${n('duplikat')} duplikat</span>` : ''}${n('gagal') ? `<span class="tag danger">${n('gagal')} gagal</span>` : ''}
      <span class="ms-auto d-flex gap-2 flex-wrap align-items-center"><label class="small" for="impMode">Barang yang sudah ada:</label><select class="form-select form-select-sm" id="impMode" style="width:auto"><option value="lewati" ${perbarui ? '' : 'selected'}>Lewati</option><option value="perbarui" ${perbarui ? 'selected' : ''}>Perbarui harga & kategori</option></select>
      <label class="form-check form-switch small mb-0"><input class="form-check-input" type="checkbox" id="impAktif" ${!$('#impAktif') || $('#impAktif').checked ? 'checked' : ''}> Langsung tampil di katalog</label></span></div>
    <div class="tbl-wrap impor-tbl"><table class="tbl"><thead><tr><th class="r">Baris</th><th>Nama barang</th><th>Negara</th><th class="r">Harga di toko</th><th class="r">Harga jual</th><th>Kategori</th><th>Status</th></tr></thead><tbody>
      ${xs.slice(0, 300).map(x => `<tr class="${x.status === 'gagal' ? 'gagal' : ''}"><td class="r num muted">${x.baris}</td><td><b>${esc(x.nama || '—')}</b>${x.stok !== undefined ? `<span class="sub">Stok ${num(x.stok)}</span>` : ''}</td><td>${flag(x.negara)} ${esc(negara(x.negara).nama)}</td><td class="r num">${x.hargaAsli > 0 ? fmtAsli(muOf(x.negara), x.hargaAsli) : '—'}</td><td class="r num">${x.hargaJual > 0 ? (boleh ? rp(x.hargaJual) : `<s class="muted">${rp(x.hargaJual)}</s>`) : '<span class="muted">= harga toko</span>'}</td><td>${esc(x.kategori || 'Lainnya')}</td><td>${`<span class="tag ${label[x.status][1]}">${label[x.status][0]}</span>`}${x.alasan ? `<span class="sub">${esc(x.alasan)}</span>` : ''}</td></tr>`).join('')}
      ${xs.length > 300 ? `<tr><td colspan="7" class="muted small">… dan ${num(xs.length - 300)} baris lainnya</td></tr>` : ''}</tbody></table></div>`;
  $('#impMode').onchange = renderImpor;
  const siap = n('baru') + (perbarui ? n('ada') : 0);
  const btn = $('#btnImpor');
  btn.disabled = !siap;
  btn.innerHTML = `<i class="bi bi-box-arrow-in-down"></i>Impor ${num(siap)} barang`;
}
async function kirimImpor(btn) {
  const xs = (_impor && _impor.baris) || [];
  const perbarui = $('#impMode') && $('#impMode').value === 'perbarui';
  const kirim = xs.filter(x => x.status === 'baru' || (perbarui && x.status === 'ada')).map(x => ({ baris: x.baris, nama: x.nama, negara: x.negara, hargaAsli: x.hargaAsli, hargaJual: x.hargaJual, kategori: x.kategori, stok: x.stok }));
  if (!kirim.length) return;
  const negara = $('#impNeg').value, aktif = $('#impAktif') ? $('#impAktif').checked : true;
  let baru = 0, ubah = 0, gagal = [];
  for (let i = 0; i < kirim.length; i += 500) {
    const res = await mutate('item.impor', { negara, aktif, mode: perbarui ? 'perbarui' : 'lewati', rows: kirim.slice(i, i + 500) }, { btn, busyLabel: 'Mengimpor ' + Math.min(kirim.length, i + 500) + '/' + kirim.length + '…', rerenderView: false, quiet: true });
    if (!res.success) { const b = $('#impHasil'); if (b) b.insertAdjacentHTML('afterbegin', `<div class="alert-x danger mb-2"><i class="bi bi-x-circle"></i><div><b>Impor berhenti.</b><br>${esc(res.message || '')}</div></div>`); return; }
    baru += res.data.baru; ubah += res.data.ubah; gagal = gagal.concat(res.data.gagal || []);
  }
  closeModal(); rerender();
  toast(`Impor selesai: ${num(baru)} barang baru${ubah ? ', ' + num(ubah) + ' diperbarui' : ''}${gagal.length ? ', ' + num(gagal.length) + ' gagal' : ''}.`, gagal.length ? 'warning' : 'success');
}
// ════════════════════════════════════════════════════════
// BAGIAN 41 (v1.3.5): GALERI FOTO BARANG (GESER KIRI/KANAN), FOTO PERSEGI TANPA TERPOTONG, CHIP KATALOG,
// VARIAN WARNA/UKURAN/BERAT + JASA TITIP PER BARANG, MASUK MEMBER DENGAN PIN 6 DIGIT,
// FOTO PROFIL MEMBER & PENGURUS DENGAN ATUR POSISI/ZOOM.
// Semua fungsi memakai deklarasi function (ter-hoist) agar aman dipanggil dari modul lain.
// ════════════════════════════════════════════════════════

// ── JSON di kolom sheet (galeri, varian), di-cache per teks ──
// Catatan: init() bisa berjalan sebelum bagian ini dieksekusi, jadi tidak ada const/let tingkat atas yang dipakai saat render.
var _jsonKolom = null;
function jsonKolom(raw) {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  const m = _jsonKolom || (_jsonKolom = new Map());
  if (m.has(raw)) return m.get(raw);
  let v = null;
  try { v = JSON.parse(raw); } catch (e) { v = null; }
  if (m.size > 800) m.clear();
  m.set(raw, v);
  return v;
}

// ════════ Galeri foto barang ════════
function fotoLainIds(it) { const a = jsonKolom(it && it.FotoLain); return Array.isArray(a) ? a.filter(x => /^[\w-]{10,}$/.test(String(x))).map(String) : []; }
/** Semua foto barang (utama dulu). */
function fotoDaftar(it, w = 600) {
  if (!it) return [];
  const out = [];
  const utama = fotoItem(it, w); if (utama) out.push(utama);
  fotoLainIds(it).forEach(id => out.push(driveImg(id, w)));
  return out;
}
function chipNegara(it) { return `<span class="chip-kat tag flag">${flag(it.Negara)}<span class="chip-txt">${esc(negara(it.Negara).nama)}</span></span>`; }
var _galSeq = 0;
/** Foto barang: satu foto, atau beberapa foto yang bisa digeser kiri/kanan (titik penanda + panah di desktop). */
function galeriHtml(it, opt = {}) {
  const fotos = fotoDaftar(it, opt.w || 600);
  const neg = esc(it.Negara || 'ID');
  const ikon = `<i class="ph bi ${KAT_IKON[it.Kategori] || 'bi-bag-fill'}" aria-hidden="true"></i>`;
  const n = fotos.length;
  const label = k => esc(it.Nama) + (n > 1 ? ` (foto ${k + 1} dari ${n})` : '');
  const isi = (src, k) => `<div class="prod-img has-foto g-${neg}">${ikon}<img src="${esc(src)}" alt="${label(k)}" ${k ? 'loading="lazy"' : ''} draggable="false" onerror="this.parentNode.classList.remove('has-foto');this.remove()"></div>`;
  const slide = (html, k) => opt.act
    ? `<button type="button" class="galeri-slide prod-buka" data-act="${opt.act}" data-id="${it.ID}" aria-label="Lihat detail ${label(k)}">${html}</button>`
    : `<div class="galeri-slide">${html}</div>`;
  if (n <= 1) return `<div class="galeri tunggal">${slide(n ? isi(fotos[0], 0) : prodImg(it), 0)}</div>`;
  const gid = opt.id || ('gal' + (_galSeq = (_galSeq || 0) + 1));
  return `<div class="galeri" id="${gid}" data-n="${n}" role="group" aria-roledescription="galeri" aria-label="Foto ${esc(it.Nama)}">
    <div class="galeri-track">${fotos.map((src, k) => slide(isi(src, k), k)).join('')}</div>
    <button type="button" class="galeri-nav prev" data-act="galeriGeser" data-d="-1" aria-label="Foto sebelumnya"><i class="bi bi-chevron-left" aria-hidden="true"></i></button>
    <button type="button" class="galeri-nav next" data-act="galeriGeser" data-d="1" aria-label="Foto berikutnya"><i class="bi bi-chevron-right" aria-hidden="true"></i></button>
    <div class="galeri-dots" aria-hidden="true">${fotos.map((_, k) => `<span class="${k ? '' : 'on'}"></span>`).join('')}</div></div>`;
}
/** Deretan foto kecil di bawah galeri (detail barang). */
function galeriThumbs(it, gid) {
  const fotos = fotoDaftar(it, 160);
  if (fotos.length <= 1) return '';
  return `<div class="galeri-thumbs" role="group" aria-label="Pilih foto">${fotos.map((src, k) => `<button type="button" class="${k ? '' : 'on'}" data-act="galeriKe" data-gal="${gid}" data-k="${k}" aria-label="Foto ${k + 1}"><img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()"></button>`).join('')}</div>`;
}
function indeksGaleri(track) { return Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); }
function tandaiGaleri(track) {
  const g = track.closest('.galeri'); if (!g) return;
  const k = indeksGaleri(track);
  g.querySelectorAll('.galeri-dots span').forEach((d, i) => d.classList.toggle('on', i === k));
  if (g.id) document.querySelectorAll(`[data-gal="${g.id}"]`).forEach(b => b.classList.toggle('on', Number(b.dataset.k) === k));
}
document.addEventListener('scroll', e => {
  const t = e.target;
  if (!t || !t.classList || !t.classList.contains('galeri-track') || t._galRaf) return;
  t._galRaf = requestAnimationFrame(() => { t._galRaf = 0; tandaiGaleri(t); });
}, true);
function geserGaleriKe(track, k) {
  const n = track.children.length; if (!n) return;
  const j = ((k % n) + n) % n;
  track.scrollTo({ left: j * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
ACT.galeriGeser = b => { const tr = b.closest('.galeri') && b.closest('.galeri').querySelector('.galeri-track'); if (tr) geserGaleriKe(tr, indeksGaleri(tr) + Number(b.dataset.d)); };
ACT.galeriKe = b => { const g = document.getElementById(b.dataset.gal); const tr = g && g.querySelector('.galeri-track'); if (tr) geserGaleriKe(tr, Number(b.dataset.k)); };

// ════════ Varian & jasa titip per barang ════════
function varianOf(it) { const a = jsonKolom(it && it.Varian); return Array.isArray(a) ? a.filter(v => v && v.id) : []; }
function labelVarian(v) { return [v.w, v.u, v.b].filter(Boolean).join(' · '); }
/** Harga toko & harga jual yang berlaku (cermin hargaVarian_ server). */
function hargaVarian(it, v) {
  if (!v) return { hargaAsli: Number(it.HargaAsli) || 0, hargaJual: Number(it.HargaJual) || 0 };
  const ht = Number(v.ht) || 0, h = Number(v.h) || 0;
  return { hargaAsli: ht > 0 ? ht : Number(it.HargaAsli) || 0, hargaJual: h > 0 ? Math.round(h) : (ht > 0 ? 0 : Number(it.HargaJual) || 0) };
}
/** Jasa titip per barang (Rp/pcs); null = mengikuti aturan negara. */
function jasaItemOf(x) { if (x === '' || x === null || x === undefined) return null; const n = Number(x); return isFinite(n) && n >= 0 ? Math.round(n) : null; }
function hitungBarang(it, v, qty = 1) { const hv = hargaVarian(it, v); return hitungItem({ negara: it.Negara, mataUang: it.MataUang, hargaAsli: hv.hargaAsli, hargaJual: hv.hargaJual, jasaItem: it.JasaItem, qty }); }
function hargaMemberV(it, v) { const h = hitungBarang(it, v, 1); return jasaGabung() ? h.subtotal : h.hargaJual; }
/** Harga di kartu katalog: termurah (bila varian berbeda harga, diberi tanda "mulai") + jasa titip per pcs. */
function hargaKartu(it) {
  const vs = varianOf(it);
  if (!vs.length) return { harga: hargaMemberV(it, null), beda: false, jasa: hitungBarang(it, null).jasaIDR };
  const xs = vs.map(v => ({ v, h: hargaMemberV(it, v) })).sort((a, b) => a.h - b.h);
  return { harga: xs[0].h, beda: xs[xs.length - 1].h !== xs[0].h, jasa: hitungBarang(it, xs[0].v).jasaIDR };
}
function teksJasaKartu(jasa) { return `per pcs · ${jasaGabung() ? 'termasuk jasa titip' : 'jasa titip'} ${rp(jasa)}`; }
function kodeWarna(nama) {
  const W = { hitam: '#1F1F24', putih: '#FFFFFF', merah: '#E0313A', biru: '#2563EB', navy: '#1E2A5A', hijau: '#16A34A', tosca: '#14B8A6', kuning: '#FACC15', oranye: '#F97316', orange: '#F97316', jingga: '#F97316', ungu: '#7C3AED', pink: '#EC4899', 'merah muda': '#F472B6', coklat: '#7C4A2D', cokelat: '#7C4A2D', krem: '#EADBC0', cream: '#EADBC0', beige: '#E3D3B5', abu: '#9CA3AF', 'abu-abu': '#9CA3AF', silver: '#C0C4CC', perak: '#C0C4CC', emas: '#D4A017', gold: '#D4A017', maroon: '#7F1D1D', mint: '#A7F3D0', olive: '#6B7A2B', khaki: '#BDB07A', black: '#1F1F24', white: '#FFFFFF', red: '#E0313A', blue: '#2563EB', green: '#16A34A', brown: '#7C4A2D', grey: '#9CA3AF', gray: '#9CA3AF', purple: '#7C3AED' };
  const k = String(nama || '').toLowerCase().trim();
  return W[k] || W[k.split(/\s+/)[0]] || '';
}
function swatch(nama) { const c = kodeWarna(nama); return c ? `<span class="swatch" style="background:${c}" aria-hidden="true"></span>` : ''; }
function grupVarianAda(vs) { return [['w', 'Warna'], ['u', 'Ukuran'], ['b', 'Berat']].filter(([k]) => vs.some(v => v[k])); }
/** Ringkasan pilihan di kartu katalog: titik warna + "2 warna · 3 ukuran". */
function varianRingkas(it) {
  const vs = varianOf(it); if (!vs.length) return '';
  const warna = [...new Set(vs.map(v => v.w).filter(Boolean))];
  const bag = grupVarianAda(vs).map(([k, l]) => { const n = new Set(vs.map(v => v[k]).filter(Boolean)).size; return n + ' ' + l.toLowerCase(); });
  return `<div class="varian-ringkas">${warna.slice(0, 5).map(swatch).join('')}<span>${esc(bag.join(' · '))}</span></div>`;
}
function selVarian(it) {
  const vs = varianOf(it);
  let sel = S.ui.varSel;
  if (!sel || sel.id !== it.ID || !vs.some(v => v.id === sel.vid)) { const v0 = vs[0] || {}; sel = S.ui.varSel = { id: it.ID, vid: v0.id, w: v0.w || '', u: v0.u || '', b: v0.b || '' }; }
  return sel;
}
function varianTerpilih(it) { const vs = varianOf(it); if (!vs.length) return null; const sel = selVarian(it); return vs.find(v => v.id === sel.vid) || vs[0]; }
function pilihVarianHtml(it) {
  const vs = varianOf(it); if (!vs.length) return '';
  const sel = selVarian(it), grup = grupVarianAda(vs);
  return `<div class="varian-pilih" id="varPilih">${grup.map(([k, label]) => {
    const nilai = [...new Set(vs.map(v => v[k]).filter(Boolean))];
    return `<div class="vp-grup"><div class="vp-label" id="vpl_${k}">${label}: <b>${esc(sel[k] || '-')}</b></div><div class="vp-opsi" role="radiogroup" aria-labelledby="vpl_${k}">${nilai.map(n => {
      const ada = vs.some(v => v[k] === n && grup.every(([g]) => g === k || (v[g] || '') === (sel[g] || '')));
      const on = sel[k] === n;
      return `<button type="button" class="vp-chip ${on ? 'on' : ''} ${ada ? '' : 'redup'}" role="radio" aria-checked="${on}" data-act="varPilih" data-id="${it.ID}" data-k="${k}" data-v="${esc(n)}">${k === 'w' ? swatch(n) : ''}${esc(n)}</button>`;
    }).join('')}</div></div>`;
  }).join('')}</div>`;
}
function hargaDetailHtml(it) {
  const v = varianTerpilih(it);
  const h = hitungBarang(it, v, 1);
  return `<div class="price fs-3">${rp(jasaGabung() ? h.subtotal : h.hargaJual)}</div><div class="small muted">${[jasaKartuTampil() ? teksJasaKartu(h.jasaIDR) : '', v ? esc(labelVarian(v)) : ''].filter(Boolean).join(' · ')}</div>`;
}
ACT.varPilih = b => {
  const it = (S.boot.items || []).find(x => x.ID === b.dataset.id); if (!it) return;
  const vs = varianOf(it), sel = selVarian(it), k = b.dataset.k, nilai = b.dataset.v;
  sel[k] = nilai;
  const grup = grupVarianAda(vs);
  let v = vs.find(x => grup.every(([g]) => (x[g] || '') === (sel[g] || '')));
  if (!v) v = vs.find(x => x[k] === nilai) || vs[0]; // kombinasi tidak ada → pilihan lain menyesuaikan
  Object.assign(sel, { vid: v.id, w: v.w || '', u: v.u || '', b: v.b || '' });
  const box = $('#varPilih'); if (box) box.outerHTML = pilihVarianHtml(it);
  const hg = $('#detHarga'); if (hg) hg.innerHTML = hargaDetailHtml(it);
  const t = $('#detTitip'); if (t) t.dataset.varian = v.id;
  const fokus = $(`#varPilih [data-k="${k}"].on`); if (fokus) fokus.focus();
};

// ── Detail barang: galeri, varian, jasa titip, ulasan ──
ACT.prodDetail = async b => {
  const it = (S.boot.items || []).find(x => x.ID === b.dataset.id);
  if (!it) return;
  S.ui.varSel = null;
  const s = statItem(it.ID), sisa = sisaStok(it), qid = 'qd_' + it.ID.slice(0, 8), gid = 'galDet' + it.ID.slice(0, 8);
  const v0 = varianTerpilih(it);
  modal({ title: 'Detail barang', size: 'lg', body: `<div class="row g-4 detail-barang">
      <div class="col-md-5"><div class="prod-media detail-img">${galeriHtml(it, { id: gid, w: 1000 })}<div class="prod-chips">${chipNegara(it)}${badgeKatalog(it)}</div>${badgeBawah(it)}</div>${galeriThumbs(it, gid)}</div>
      <div class="col-md-7"><div class="d-flex gap-2 flex-wrap mb-2">${negaraTag(it.Negara)}${it.Kategori ? `<span class="tag">${esc(it.Kategori)}</span>` : ''}</div>
        <h2 class="fs-4 fw-bold mb-1">${esc(it.Nama)}</h2>
        ${metaKatalog(it) || '<div class="small muted mb-2">Belum ada ulasan</div>'}
        <div class="mt-2" id="detHarga">${hargaDetailHtml(it)}</div>
        ${pilihVarianHtml(it)}
        ${it.Deskripsi ? `<p class="mt-3 mb-0 text-2">${esc(it.Deskripsi)}</p>` : ''}
        ${S.me && S.me.role === 'customer' ? (sisa === 0 ? '<div class="alert-x warn mt-3"><i class="bi bi-hourglass"></i><div>Stok sedang habis.</div></div>'
          : `<div class="act mt-3"><div class="stepper" role="group" aria-label="Jumlah"><button type="button" data-act="stepDown" data-for="${qid}" aria-label="Kurangi">−</button><input id="${qid}" type="number" min="1" max="${sisa === null ? 99 : Math.min(99, sisa)}" value="1" aria-label="Jumlah ${esc(it.Nama)}"><button type="button" data-act="stepUp" data-for="${qid}" aria-label="Tambah">+</button></div>
            <button class="btn btn-primary" id="detTitip" data-act="addCart" data-id="${it.ID}" data-qty="${qid}" data-varian="${v0 ? v0.id : ''}"><i class="bi bi-plus-lg"></i>Titip</button></div>`)
          : !S.me ? '<button class="btn btn-primary mt-3" data-go="login" data-bs-dismiss="modal"><i class="bi bi-box-arrow-in-right"></i>Masuk untuk titip</button>' : ''}
      </div></div>
    <hr class="my-4"><div class="d-flex justify-content-between align-items-center mb-3"><h3 class="fs-5 fw-bold mb-0">Ulasan pembeli</h3>${s && s.n ? `<span class="small muted">${num(s.n)} ulasan</span>` : ''}</div>
    <div id="ulasanBox" aria-live="polite">${s && s.n ? '<div class="skel" style="height:90px"></div><div class="skel mt-2" style="height:90px"></div>' : '<p class="muted mb-0">Belum ada ulasan untuk barang ini. Ulasan muncul setelah member menerima pesanannya.</p>'}</div>` });
  if (!(s && s.n)) return;
  const kunci = it.ID + '_' + (S.boot.ver || '') + '_' + s.n;
  const cache = S.ui.ulasanCache || (S.ui.ulasanCache = {});
  const res = cache[kunci] || await api('ulasan.item', { itemId: it.ID }, { silent: true });
  const box = $('#ulasanBox'); if (!box) return;
  if (!res.success) { box.innerHTML = `<p class="small text-danger mb-0">${esc(res.message || 'Ulasan belum bisa dimuat.')}</p>`; return; }
  cache[kunci] = res;
  box.innerHTML = daftarUlasanHtml(res.data);
};

// ════════ Panel: jasa titip & varian di tabel katalog dan form barang (Super Admin & Owner) ════════
function selJasaItem(i) {
  const ji = jasaItemOf(i.JasaItem);
  const h = hitungBarang(i, null, 1);
  if (ji !== null) return `<b>${rp(ji)}</b><small class="d-block muted">per pcs · atur sendiri</small>`;
  const a = aturanJasa(i.Negara);
  return `<span>${rp(h.jasaIDR)}</span><small class="d-block muted">${a.tipe === 'persen' ? num(a.nilai, 1).replace(/,0$/, '') + '%' : 'aturan'} ${esc(negara(i.Negara).nama)}</small>`;
}
function varianRowHtml(v) {
  v = v || {};
  return `<div class="var-row" data-vid="${esc(v.id || '')}">
    <input class="form-control form-control-sm" data-v="w" value="${esc(v.w || '')}" placeholder="Hitam" maxlength="40" aria-label="Warna">
    <input class="form-control form-control-sm" data-v="u" value="${esc(v.u || '')}" placeholder="M / 42" maxlength="40" aria-label="Ukuran">
    <input class="form-control form-control-sm" data-v="b" value="${esc(v.b || '')}" placeholder="500 g" maxlength="40" aria-label="Berat">
    <input class="form-control form-control-sm" data-v="ht" inputmode="decimal" data-uang="mu" data-mu-dari="[name=negara]" value="${Number(v.ht) > 0 ? esc(String(v.ht)) : ''}" placeholder="Harga toko" aria-label="Harga toko varian (opsional)">
    <input class="form-control form-control-sm" data-v="h" inputmode="numeric" data-uang value="${Number(v.h) > 0 ? num(v.h) : ''}" placeholder="Harga jual Rp" aria-label="Harga jual varian (Rp)">
    <button type="button" class="icon-btn sm" data-act="varHapus" aria-label="Hapus varian"><i class="bi bi-x-lg" aria-hidden="true"></i></button></div>`;
}
function kotakVarianJasa(i) {
  if (!bolehHargaJual()) return '';
  const ji = jasaItemOf(i.JasaItem), a = aturanJasa(i.Negara || 'JP');
  return `<div class="col-12"><div class="hj-box var-box" id="varBox">
    <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-2"><b><i class="bi bi-palette me-1" aria-hidden="true"></i>Varian &amp; jasa titip</b><span class="tag">Super Admin &amp; Owner</span></div>
    <div class="row g-2 align-items-end mb-3"><div class="col-sm-6"><label class="form-label small mb-1" for="iJasa">Jasa titip per pcs</label><div class="input-group"><span class="input-group-text">Rp</span><input class="form-control" id="iJasa" name="jasaItem" inputmode="numeric" data-uang value="${ji !== null ? num(ji) : ''}" placeholder="Ikuti aturan negara" autocomplete="off"></div></div>
      <div class="col-sm-6"><div class="hj-info" id="jasaInfo" aria-live="polite"></div></div></div>
    <div class="small fw-semibold mb-1">Pilihan warna, ukuran &amp; berat</div>
    <div class="var-head" aria-hidden="true"><span>Warna</span><span>Ukuran</span><span>Berat</span><span>Harga toko</span><span>Harga jual</span><span></span></div>
    <div id="varList">${varianOf(i).map(varianRowHtml).join('')}</div>
    <button type="button" class="btn btn-soft btn-sm mt-1" data-act="varTambah"><i class="bi bi-plus-lg"></i>Tambah varian</button>
    <div class="form-text">Isi yang perlu saja (mis. hanya warna). Harga jual kosong = sama dengan harga barang; harga toko varian opsional untuk menghitung keuntungan. Contoh: Hitam Rp 1.000.000, Putih Rp 1.100.000. Aturan negara saat ini: ${a.tipe === 'persen' ? num(a.nilai, 1).replace(/,0$/, '') + '%' : rp(a.nilai)}${a.minimal ? ', min. ' + rpShort(a.minimal) : ''}.</div>
  </div></div>`;
}
ACT.varTambah = () => { const l = $('#varList'); if (!l) return; if (l.children.length >= 30) return toast('Maksimal 30 varian per barang.', 'warning'); l.insertAdjacentHTML('beforeend', varianRowHtml({})); l.lastElementChild.querySelector('input').focus(); };
ACT.varHapus = b => b.closest('.var-row').remove();
/** Varian dari form; undefined = bukan Super Admin/Owner (tidak dikirim). */
function ambilVarianForm(f) {
  const l = $('#varList'); if (!l) return { list: undefined };
  const mu = muOf(f.negara.value), out = [], kunci = new Set();
  for (const r of $$('.var-row', l)) {
    const g = k => r.querySelector(`[data-v="${k}"]`).value.trim();
    const v = { id: r.dataset.vid || '', w: g('w'), u: g('u'), b: g('b'), ht: angkaHarga(g('ht'), mu) || 0, h: Math.round(angkaUang(g('h'))) || 0 };
    if (!v.w && !v.u && !v.b) { if (v.h || v.ht) return { error: 'Isi warna, ukuran, atau berat untuk setiap varian yang diberi harga.', el: r.querySelector('[data-v=w]') }; continue; }
    const k = [v.w, v.u, v.b].join('|').toLowerCase();
    if (kunci.has(k)) return { error: `Varian "${labelVarian(v)}" tertulis dua kali.`, el: r.querySelector('[data-v=w]') };
    kunci.add(k); out.push(v);
  }
  return { list: out };
}
function nilaiJasaItem(f) { if (!f.jasaItem) return undefined; const t = String(f.jasaItem.value || '').trim(); return t === '' ? '' : Math.max(0, Math.round(angkaUang(t))); }
function infoJasaItem(f) {
  const box = $('#jasaInfo'); if (!box || !f.jasaItem) return;
  const t = String(f.jasaItem.value || '').trim();
  const mu = muOf(f.negara.value), a = aturanJasa(f.negara.value);
  if (t !== '') { box.innerHTML = `<span class="muted">Jasa per pcs</span><b class="d-block">${rp(angkaUang(t))}</b>`; return; }
  const hj = f.hargaJual ? Math.round(angkaUang(f.hargaJual.value)) : 0;
  const h = hitungItem({ negara: f.negara.value, mataUang: mu, hargaAsli: angkaHarga(f.hargaAsli.value, mu), hargaJual: hj, qty: 1 });
  box.innerHTML = `<span class="muted">Ikut aturan ${esc(negara(f.negara.value).nama)} (${a.tipe === 'persen' ? num(a.nilai, 1).replace(/,0$/, '') + '%' : rp(a.nilai)})</span><b class="d-block">${rp(h.jasaIDR)} / pcs</b>`;
}

// ════════ Panel: galeri foto di form barang ════════
function galeriMaks() { return 6; }
/** Foto barang distandarkan: persegi 1000×1000 px, latar putih, foto utuh di tengah (tidak ada sisi yang terpotong). */
async function fotoPersegi(file, N = 1000) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Pilih file gambar (JPG/PNG/WebP).');
  if (file.size > 20 * 1024 * 1024) throw new Error('Ukuran foto maksimal 20 MB.');
  const img = await muatGambar(file);
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, N, N);
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  const s = Math.min(N / img.width, N / img.height);
  const w = Math.round(img.width * s), h = Math.round(img.height * s);
  c.drawImage(img, Math.round((N - w) / 2), Math.round((N - h) / 2), w, h);
  const data = cv.toDataURL('image/jpeg', 0.86);
  return { base64: data.split(',')[1], mime: 'image/jpeg', nama: String(file.name || 'foto').replace(/\.\w+$/, '') + '.jpg', preview: data };
}
function galeriFormAwal(i) {
  const ids = [i.FotoFileId].concat(fotoLainIds(i)).filter(Boolean);
  S.ui.galForm = { list: ids.map(id => ({ id, src: driveImg(id, 300) })), awal: ids.join('|'), sibuk: 0 };
}
function galeriFormHtml() {
  return `<div class="col-12"><div class="d-flex justify-content-between align-items-center mb-1"><span class="form-label mb-0">Foto barang</span><span class="small muted" id="galInfo"></span></div>
    <div class="gal-form" id="galForm" aria-live="polite"></div>
    <input type="file" id="galCam" accept="image/*" capture="environment" class="visually-hidden" tabindex="-1"><input type="file" id="galUp" accept="image/*" multiple class="visually-hidden" tabindex="-1">
    <div class="form-text">Maksimal ${galeriMaks()} foto. Semua foto otomatis dibuat persegi 1000×1000 px dengan latar putih, utuh tanpa terpotong. Foto pertama menjadi foto utama; pakai tombol panah untuk mengatur urutan.</div></div>`;
}
function renderGaleriForm() {
  const box = $('#galForm'); if (!box) return;
  const g = S.ui.galForm || { list: [], sibuk: 0 };
  const n = g.list.length, sisa = galeriMaks() - n - g.sibuk;
  box.innerHTML = g.list.map((x, k) => `<div class="gal-tile ${k ? '' : 'utama'}"><img src="${esc(x.src)}" alt="Foto ${k + 1}" onerror="this.style.opacity=.3">${k ? '' : '<span class="gal-utama">Utama</span>'}${x.file ? '<span class="gal-baru">Baru</span>' : ''}
      <div class="gal-aksi">${k ? `<button type="button" data-act="galKiri" data-k="${k}" aria-label="Pindah foto ${k + 1} ke kiri${k === 1 ? ' (jadikan utama)' : ''}"><i class="bi bi-arrow-left" aria-hidden="true"></i></button>` : ''}<button type="button" data-act="galHapus" data-k="${k}" aria-label="Hapus foto ${k + 1}"><i class="bi bi-trash3" aria-hidden="true"></i></button></div></div>`).join('')
    + Array.from({ length: g.sibuk }, () => '<div class="gal-tile proses"><span class="spin" aria-hidden="true"></span><small>Memproses…</small></div>').join('')
    + (sisa > 0 ? `<label class="gal-add" for="galCam"><i class="bi bi-camera" aria-hidden="true"></i><span>Kamera</span></label><label class="gal-add" for="galUp"><i class="bi bi-images" aria-hidden="true"></i><span>Unggah</span></label>` : '');
  const info = $('#galInfo'); if (info) info.textContent = `${n}/${galeriMaks()} foto`;
  const url = $('#iFotoUrlBox'); if (url) url.hidden = n > 0;
}
ACT.galKiri = b => { const l = S.ui.galForm.list, k = Number(b.dataset.k); if (k > 0) { [l[k - 1], l[k]] = [l[k], l[k - 1]]; renderGaleriForm(); const t = $$('#galForm .gal-tile')[k - 1]; t && t.querySelector('button') && t.querySelector('button').focus(); } };
ACT.galHapus = b => { S.ui.galForm.list.splice(Number(b.dataset.k), 1); renderGaleriForm(); };
async function galTambahBerkas(files) {
  const g = S.ui.galForm; if (!g) return;
  const muat = Array.from(files || []).slice(0, Math.max(0, galeriMaks() - g.list.length - g.sibuk));
  if (files && files.length > muat.length) toast(`Maksimal ${galeriMaks()} foto per barang.`, 'warning');
  for (const file of muat) {
    g.sibuk++; renderGaleriForm();
    try { const f = await fotoPersegi(file); if (S.ui.galForm === g) g.list.push({ file: { base64: f.base64, mime: f.mime, nama: f.nama }, src: f.preview }); }
    catch (e) { toast(e.message, 'error'); }
    finally { g.sibuk--; if (S.ui.galForm === g) renderGaleriForm(); }
  }
}
document.addEventListener('change', e => {
  if ((e.target.id === 'galCam' || e.target.id === 'galUp') && e.target.files.length) { const fs = Array.from(e.target.files); e.target.value = ''; galTambahBerkas(fs); }
});
/** Isi payload galeri bila urutan/foto berubah. */
function payloadGaleri() {
  const g = S.ui.galForm; if (!g) return undefined;
  const sig = g.list.map(x => x.id || 'baru').join('|');
  return sig !== g.awal || g.list.some(x => x.file) ? g.list.map(x => x.id ? { id: x.id } : { file: x.file }) : undefined;
}

// ════════ Masuk member dengan PIN 6 digit ════════
/** Isian berupa nomor WhatsApp → member → kolom kedua menjadi PIN. */
function loginPakaiPin(v) { const s = String(v || '').replace(/[\s.-]/g, ''); return /^\+?\d{9,15}$/.test(s) && /^628\d{7,12}$/.test(normHP(s)); }
function aturModeLogin() {
  const u = $('#lgUser'), p = $('#lgPass'); if (!u || !p) return;
  const pin = loginPakaiPin(u.value);
  if (p.dataset.mode === (pin ? 'pin' : 'sandi')) return;
  p.dataset.mode = pin ? 'pin' : 'sandi';
  $('#lgPassLbl').innerHTML = (pin ? 'PIN' : 'Kata sandi') + ' <span class="req">*</span>';
  p.setAttribute('inputmode', pin ? 'numeric' : 'text');
  p.placeholder = pin ? '6 angka' : '';
  $('#lgIkonUser').className = 'bi ' + (pin ? 'bi-whatsapp' : 'bi-person');
  $('#lgPassIkon').className = 'bi ' + (pin ? 'bi-grid-3x3-gap' : 'bi-lock');
  const r = $('#lgReset span'); if (r) r.textContent = pin ? 'Lupa PIN?' : 'Reset Password';
  const eye = p.parentElement.querySelector('.eye'); if (eye) eye.setAttribute('aria-label', pin ? 'Tampilkan PIN' : 'Tampilkan kata sandi');
}
function pinLemahKlien(p) { return /^(\d)\1{5}$/.test(p) || ['123456', '654321', '012345', '543210', '121212', '112233'].includes(p); }
function cekPinKlien(f, nama, nama2) {
  const a = String(f[nama].value || ''), b = nama2 ? String(f[nama2].value || '') : a;
  if (!/^\d{6}$/.test(a)) return fieldErr(f, nama, 'PIN harus 6 angka.'), false;
  if (pinLemahKlien(a)) return fieldErr(f, nama, 'PIN terlalu mudah ditebak. Hindari angka berurutan atau sama semua.'), false;
  if (nama2 && a !== b) return fieldErr(f, nama2, 'PIN tidak sama.'), false;
  return true;
}
function inputPin(id, name, auto = 'new-password', ph = '••••••') { return `<input class="form-control pin-input" id="${id}" name="${name}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="${auto}" placeholder="${ph}">`; }
document.addEventListener('input', e => { if (e.target.classList && e.target.classList.contains('pin-input')) { const v = e.target.value.replace(/\D/g, '').slice(0, 6); if (v !== e.target.value) e.target.value = v; } });
/** Member lama yang masuk dengan kata sandi lama wajib membuat PIN sebelum melanjutkan. */
function forceBuatPin() {
  if (!S.me || S.me.role !== 'customer' || !S.me.wajibPin || $('#fBuatPin')) return;
  modal({
    title: 'Buat PIN 6 angka', static: true,
    body: `<div class="alert-x info mb-3"><i class="bi bi-shield-lock"></i><div>Mulai sekarang member masuk dengan <b>nomor WhatsApp dan PIN 6 angka</b>. Kata sandi lama tidak dipakai lagi.</div></div>
      <form id="fBuatPin" novalidate><div class="row g-3"><div class="col-6"><label class="form-label" for="bpBaru">PIN baru <span class="req">*</span></label>${inputPin('bpBaru', 'baru')}</div>
        <div class="col-6"><label class="form-label" for="bpUlang">Ulangi PIN <span class="req">*</span></label>${inputPin('bpUlang', 'baru2')}</div></div>
        <div class="form-text mb-3">Hindari angka berurutan (123456) atau sama semua (111111).</div>
        <button class="btn btn-primary w-100" type="submit"><i class="bi bi-check2"></i>Simpan PIN</button></form>`
  });
  fokusAwal('#bpBaru');
  // pop-up wajib: tidak bisa ditutup (tombol ×, Esc, klik luar) sampai PIN dibuat
  const el = $('#mdl'), x = el.querySelector('.btn-close');
  if (x) x.hidden = true;
  const tahan = e => { if (S.me && S.me.wajibPin) e.preventDefault(); };
  el.addEventListener('hide.bs.modal', tahan);
  el.addEventListener('hidden.bs.modal', () => { el.removeEventListener('hide.bs.modal', tahan); if (x) x.hidden = false; }, { once: true });
  $('#fBuatPin').onsubmit = async e => {
    e.preventDefault(); const f = e.target; clearErr(f);
    if (!cekPinKlien(f, 'baru', 'baru2')) return;
    const res = await mutate('auth.gantiPin', { baru: f.baru.value }, { btn: f.querySelector('[type=submit]'), busyLabel: 'Menyimpan…', rerenderView: false });
    if (res.success) { simpanMeSesi(res.data.me); closeModal(); const k = $('#pinGantiCard'); if (k) k.outerHTML = gantiPinCard(); bindGantiPin(); }
  };
}
function simpanMeSesi(me) { if (!me) return; S.me = me; const s = store.get('sess'); if (s) { s.me = S.me; store.set('sess', s); } }
function gantiPinCard() {
  const buat = !!(S.me && S.me.wajibPin);
  return `<div class="cardx pad-lg" id="pinGantiCard"><h3 class="fs-5 fw-bold mb-3"><i class="bi bi-shield-lock me-2" aria-hidden="true"></i>${buat ? 'Buat PIN masuk' : 'Ganti PIN'}</h3>
    <form id="fPinGanti" novalidate>
      <input type="text" class="d-none" name="username" value="${esc(S.me ? S.me.hp || '' : '')}" autocomplete="username" tabindex="-1" aria-hidden="true">
      ${buat ? '' : `<div class="mb-3"><label class="form-label" for="pgLama">PIN lama</label>${inputPin('pgLama', 'lama', 'current-password')}</div>`}
      <div class="row g-3 mb-3"><div class="col-6"><label class="form-label" for="pgBaru">PIN baru</label>${inputPin('pgBaru', 'baru')}</div><div class="col-6"><label class="form-label" for="pgUlang">Ulangi PIN</label>${inputPin('pgUlang', 'baru2')}</div></div>
      <button class="btn btn-outline-primary w-100" type="submit">${buat ? 'Simpan PIN' : 'Perbarui PIN'}</button></form>
    <div class="note-box"><i class="bi bi-phone"></i><div>Masuk dengan nomor WhatsApp dan PIN 6 angka. Satu akun hanya aktif di satu perangkat; masuk di perangkat lain otomatis mengakhiri sesi di perangkat ini. Lupa PIN? Gunakan <b>Lupa PIN</b> di halaman masuk.</div></div></div>`;
}
function bindGantiPin() {
  const f = $('#fPinGanti'); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault(); clearErr(f);
    if (f.lama && !/^\d{6}$/.test(f.lama.value)) return fieldErr(f, 'lama', 'Isi PIN lama (6 angka).');
    if (!cekPinKlien(f, 'baru', 'baru2')) return;
    const res = await mutate('auth.gantiPin', { lama: f.lama ? f.lama.value : '', baru: f.baru.value }, { btn: f.querySelector('[type=submit]'), busyLabel: 'Menyimpan…', rerenderView: false });
    if (res.success) { simpanMeSesi(res.data.me); const k = $('#pinGantiCard'); if (k) { k.outerHTML = gantiPinCard(); bindGantiPin(); } }
  };
}
ACT.otpModeSandi = () => { $('#otpPinBox').hidden = true; $('#otpSandiBox').hidden = false; S.ui.otpSandi = true; fokusAwal('#otpSandi'); };
ACT.otpModePin = () => { $('#otpPinBox').hidden = false; $('#otpSandiBox').hidden = true; S.ui.otpSandi = false; fokusAwal('#otpPin'); };

// ════════ Foto profil: atur posisi (geser), zoom, dan putar sebelum disimpan ════════
function gambarCrop(ctx, size, st) {
  const img = st.img, r = ((st.rot % 360) + 360) % 360, putar = r % 180 !== 0;
  const w = putar ? img.height : img.width, h = putar ? img.width : img.height;
  const sk = size / Math.min(w, h) * st.zoom;
  ctx.save();
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.translate(size / 2 + st.x * size, size / 2 + st.y * size);
  ctx.rotate(r * Math.PI / 180);
  ctx.scale(sk, sk);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}
/** Geser maksimum (pecahan lebar bingkai) agar foto selalu menutupi bingkai. */
function batasCrop(st) {
  const img = st.img, putar = (((st.rot % 360) + 360) % 360) % 180 !== 0;
  const w = putar ? img.height : img.width, h = putar ? img.width : img.height, m = Math.min(w, h);
  const mx = Math.max(0, (w / m * st.zoom - 1) / 2), my = Math.max(0, (h / m * st.zoom - 1) / 2);
  st.x = Math.max(-mx, Math.min(mx, st.x)); st.y = Math.max(-my, Math.min(my, st.y));
}
async function editorFotoProfil(file) {
  if (!/^image\//.test(file.type)) return toast('Pilih file gambar (JPG/PNG).', 'warning');
  if (file.size > 15 * 1024 * 1024) return toast('Ukuran foto maksimal 15 MB.', 'warning');
  let img;
  try { img = await muatGambar(file); } catch (er) { return toast(er.message, 'error'); }
  const st = { img, rot: 0, zoom: 1, x: 0, y: 0 };
  modal({
    title: 'Atur foto profil',
    body: `<div class="crop-box" id="cropBox"><canvas id="cropCv" width="560" height="560" tabindex="0" role="img" aria-label="Pratinjau foto profil. Geser untuk mengatur posisi; tombol panah juga bisa dipakai."></canvas><div class="crop-ring" aria-hidden="true"></div></div>
      <div class="crop-ctrl"><button type="button" class="icon-btn sm" id="cropKecil" aria-label="Perkecil"><i class="bi bi-zoom-out" aria-hidden="true"></i></button><input type="range" class="form-range" id="cropZoom" min="1" max="4" step="0.01" value="1" aria-label="Perbesar foto"><button type="button" class="icon-btn sm" id="cropBesar" aria-label="Perbesar"><i class="bi bi-zoom-in" aria-hidden="true"></i></button></div>
      <div class="d-flex justify-content-center gap-2 mt-2"><button type="button" class="btn btn-light btn-sm" id="cropPutar"><i class="bi bi-arrow-clockwise"></i>Putar</button><button type="button" class="btn btn-light btn-sm" id="cropUlang"><i class="bi bi-arrow-counterclockwise"></i>Atur ulang</button></div>
      <p class="small muted text-center mt-2 mb-0">Geser foto untuk mengatur posisi wajah di dalam lingkaran, lalu atur besar kecilnya.</p>`,
    foot: `<button class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnFotoSimpan"><i class="bi bi-check2"></i>Gunakan foto ini</button>`
  });
  const cv = $('#cropCv'), ctx = cv.getContext('2d'), zoom = $('#cropZoom');
  const gambar = () => { batasCrop(st); gambarCrop(ctx, cv.width, st); zoom.value = st.zoom; };
  const setZoom = z => { st.zoom = Math.max(1, Math.min(4, z)); gambar(); };
  gambar();
  const ptr = new Map(); let awal = null;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); awal = null; });
  cv.addEventListener('pointermove', e => {
    if (!ptr.has(e.pointerId)) return;
    const lama = ptr.get(e.pointerId), rc = cv.getBoundingClientRect();
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptr.size === 1) { st.x += (e.clientX - lama.x) / rc.width; st.y += (e.clientY - lama.y) / rc.height; gambar(); }
    else if (ptr.size === 2) {
      const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (awal) setZoom(st.zoom * d / awal); awal = d;
    }
  });
  const lepas = e => { ptr.delete(e.pointerId); awal = null; };
  cv.addEventListener('pointerup', lepas); cv.addEventListener('pointercancel', lepas);
  cv.addEventListener('wheel', e => { e.preventDefault(); setZoom(st.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
  cv.addEventListener('keydown', e => {
    const lk = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, -0.02], ArrowDown: [0, 0.02] }[e.key];
    if (lk) { e.preventDefault(); st.x += lk[0]; st.y += lk[1]; gambar(); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(st.zoom * 1.1); }
    else if (e.key === '-') { e.preventDefault(); setZoom(st.zoom / 1.1); }
  });
  zoom.addEventListener('input', () => setZoom(Number(zoom.value)));
  $('#cropKecil').onclick = () => setZoom(st.zoom / 1.15);
  $('#cropBesar').onclick = () => setZoom(st.zoom * 1.15);
  $('#cropPutar').onclick = () => { st.rot = (st.rot + 90) % 360; gambar(); };
  $('#cropUlang').onclick = () => { Object.assign(st, { rot: 0, zoom: 1, x: 0, y: 0 }); gambar(); };
  $('#btnFotoSimpan').onclick = async e => {
    const out = document.createElement('canvas'); out.width = out.height = 512;
    gambarCrop(out.getContext('2d'), 512, st);
    const url = out.toDataURL('image/jpeg', 0.88);
    const res = await mutate('profil.foto', { file: { base64: url.split(',')[1], mime: 'image/jpeg', nama: 'profil.jpg' } }, { btn: e.currentTarget, busyLabel: 'Mengunggah…', rerenderView: false });
    if (res.success) {
      S.ui.fotoPrev = { id: res.data.foto, url };
      if (isCustomer()) S.customer = Object.assign({}, S.customer || {}, { Foto: res.data.foto });
      else simpanMeSesi(res.data.me || Object.assign({}, S.me, { foto: res.data.foto }));
      closeModal(); segarkanFotoUi(); persist();
    }
  };
}

// ════════════════════════════════════════════════════════
// BAGIAN 42 (v1.4): FRONTEND STATIS (GITHUB PAGES) + BACKEND REST API (APPS SCRIPT)
// - Alamat API dibaca dari js/config.js (window.JASTICA_CONFIG.GAS_URL) — satu-satunya pengaturan frontend.
// - Data awal landing (boot) diambil lewat API. Salinannya disimpan di perangkat sehingga kunjungan
//   berikutnya tampil instan, lalu diperbarui di latar (stale-while-revalidate).
// Semua fungsi memakai deklarasi function (ter-hoist): bootSalinan() dipanggil saat state S dibuat.
// ════════════════════════════════════════════════════════
function versiWeb() { return '1.4.1'; }

/** Periksa js/config.js. URL /exec Apps Script bukan rahasia (keamanan dijaga token sesi + cek peran di server). */
function statusKonfig() {
  if (!window.JASTICA_CONFIG) return { ok: false, alasan: 'File js/config.js tidak termuat. Pastikan folder js/ berisi config.js ikut ter-upload ke GitHub.' };
  const c = window.JASTICA_CONFIG;
  const u = String(c.GAS_URL || '').trim();
  if (!u || /GANTI|XXXX|ID_DEPLOYMENT/i.test(u)) return { ok: false, alasan: 'GAS_URL di file js/config.js belum diisi dengan alamat Web App Apps Script.' };
  if (/\/dev(\?.*)?$/.test(u)) return { ok: false, alasan: 'GAS_URL memakai alamat /dev (khusus uji pemilik). Pakai alamat Web App yang berakhiran /exec.' };
  if (!/^https?:\/\/\S+\/exec$/.test(u)) return { ok: false, alasan: 'GAS_URL harus alamat Web App Apps Script yang berakhiran /exec, contoh https://script.google.com/macros/s/AKfy…/exec.' };
  if (/^http:/.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u)) return { ok: false, alasan: 'GAS_URL harus diawali https://.' };
  return { ok: true, url: u };
}
function gasUrl() { const k = statusKonfig(); return k.ok ? k.url : ''; }

/** Balasan server yang bukan JSON → penjelasan yang bisa ditindaklanjuti pemilik aplikasi. */
function pesanBukanJson(status, teks) {
  const t = String(teks || '');
  if (/Script function not found:?\s*do(Post|Get)/i.test(t)) return 'Server Apps Script masih versi lama. Di editor Apps Script: Terapkan → Kelola deployment → ✏️ Edit → Versi: Versi baru → Terapkan.';
  if (/accounts\.google\.com|ServiceLogin|signin/i.test(t)) return 'Web App meminta login Google. Ubah akses deployment menjadi "Siapa saja" (Anyone), lalu terapkan ulang.';
  if (status === 404) return 'Alamat server tidak ditemukan (404). Periksa GAS_URL di js/config.js.';
  return 'Server mengirim balasan yang tidak dikenali (HTTP ' + (status || '?') + '). Pastikan GAS_URL berakhiran /exec dan deployment Apps Script sudah versi terbaru.';
}

// ── Salinan data awal di perangkat ──
// Tanpa nilai awal: bootSalinan() sudah mengisinya saat state S dibuat, sebelum baris ini dieksekusi.
var _bootDariSalinan, _bootSig, _bootSegar;
function sigBoot(b) { try { const x = Object.assign({}, b || {}); delete x.serverTime; return JSON.stringify(x); } catch (e) { return ''; } }
function bootSalinan() {
  try {
    const s = JSON.parse(localStorage.getItem('jst_boot') || 'null');
    if (!s || s.v !== versiWeb() || !s.b || !s.b.settings || s.u !== String(((window.JASTICA_CONFIG || {}).GAS_URL) || '')) return null;
    _bootDariSalinan = true; _bootSig = sigBoot(s.b);
    return s.b;
  } catch (e) { return null; }
}
function simpanBootSalinan(b) {
  if (!b || !b.settings || b.setupRequired) return;
  try { localStorage.setItem('jst_boot', JSON.stringify({ v: versiWeb(), u: String(((window.JASTICA_CONFIG || {}).GAS_URL) || ''), t: Date.now(), b })); } catch (e) { /* penyimpanan penuh / mode privat */ }
}
/** Pasang data awal segar dari server. Mengembalikan true bila isinya berbeda dari yang sedang tampil. */
function terapkanBootBaru(b, tKirim, tTerima) {
  if (!b || typeof b !== 'object') return false;
  const t = Date.parse(b.serverTime || '');
  if (isFinite(t) && tKirim && tTerima) window.__jstSkew = t - Math.round((tKirim + tTerima) / 2);
  const sig = sigBoot(b), beda = sig !== _bootSig;
  _bootSig = sig; _bootSegar = true;
  S.boot = Object.assign({}, S.boot || {}, b);
  if (S.d.allItems.length || S.d.allTrips.length) refreshBootLists(); // pengurus: daftar katalog dari data lengkap
  _ix = {};
  simpanBootSalinan(b);
  return beda;
}
async function ambilBoot() {
  const t0 = Date.now();
  const res = await api('boot', {}, { silent: true, timeout: 60000 });
  return { res, t0, t1: Date.now() };
}
/** Kunjungan pertama (belum ada salinan): tunggu data awal, lalu jalankan init(). */
async function mulaiDenganBoot() {
  const { res, t0, t1 } = await ambilBoot();
  if (!res.success || !res.data) return layarBootGagal(res);
  terapkanBootBaru(res.data, t0, t1);
  if (!S.boot.settings && !S.boot.setupRequired) return layarBootGagal({ message: 'Data awal dari server tidak lengkap.' });
  init();
}
/** Kunjungan berikutnya: tampilan sudah memakai salinan; perbarui diam-diam bila server punya data lebih baru. */
async function segarkanBootLatar() {
  const { res, t0, t1 } = await ambilBoot();
  if (!res.success || !res.data) return;
  if (res.data.setupRequired) return;
  if (terapkanBootBaru(res.data, t0, t1)) { renderShellChrome(); rerender(); }
}

// ── Layar "belum siap" (konfigurasi / server) ──
function layarInfo({ ikon = 'bi-tools', judul, teks, langkah = [], ulang = false }) {
  const sp = document.getElementById('splash'); if (sp) sp.remove();
  document.body.dataset.shell = 'pub';
  document.body.innerHTML = `<div class="view-auth active" style="display:grid"><div class="cardx auth-card" role="alert">
    <div class="auth-logo"><span class="kpi-ic" style="width:60px;height:60px;font-size:26px"><i class="bi ${ikon}" aria-hidden="true"></i></span></div>
    <h1>${esc(judul)}</h1><p class="sub">${esc(teks || '')}</p>
    ${langkah.length ? `<ol class="small text-2">${langkah.map(l => `<li>${l}</li>`).join('')}</ol>` : ''}
    ${ulang ? '<button class="btn btn-primary w-100 mt-2" type="button" onclick="location.reload()"><i class="bi bi-arrow-clockwise" aria-hidden="true"></i>Coba lagi</button>' : ''}
  </div></div>`;
  window.__APP_READY__ = true;
}
function layarKonfigBelum(alasan) {
  layarInfo({
    ikon: 'bi-plug', judul: 'Konfigurasi belum lengkap', teks: alasan,
    langkah: ['Di editor Apps Script: <b>Terapkan → Kelola deployment</b>, salin <b>URL aplikasi web</b> (berakhiran <code>/exec</code>).',
      'Buka file <code>js/config.js</code> di folder frontend, tempel URL itu ke <code>GAS_URL</code>, simpan.',
      'Kirim ulang ke GitHub: <code>git add .</code> → <code>git commit -m "isi GAS_URL"</code> → <code>git push</code>, lalu muat ulang halaman ini.']
  });
}
function layarBootGagal(res) {
  res = res || {};
  if (res.code === 'NO_CONFIG') return layarKonfigBelum(res.message);
  layarInfo({
    ikon: 'bi-cloud-slash', judul: 'Server belum dapat dihubungi', teks: res.message || 'Data awal gagal dimuat.', ulang: true,
    langkah: ['Periksa koneksi internet, lalu tekan <b>Coba lagi</b>.',
      'Pemilik aplikasi: pastikan <code>GAS_URL</code> di <code>js/config.js</code> adalah URL <code>/exec</code> terbaru dan Web App di-deploy dengan <b>Jalankan sebagai: Saya</b> serta akses <b>Siapa saja</b>.']
  });
}

// ════════════════════════════════════════════════════════
// BAGIAN 43 (v1.4.1): HUBUNGI KAMI (INSTAGRAM & GRUP WHATSAPP), JASA DI KARTU KATALOG,
//                     PILIH & HAPUS VOUCHER MASSAL
// Semua deklarasi function (ter-hoist) — dipanggil dari modul sebelumnya.
// ════════════════════════════════════════════════════════
const POLA_IG_WEB = /^[A-Za-z0-9._]{1,30}$/;
const POLA_WA_GRUP_WEB = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}$/;

// ── Hubungi Kami (landing) ──
function kontakIgHtml(s) {
  const ig = String((s || {}).bizIG || '');
  if (!POLA_IG_WEB.test(ig)) return '';
  return `<a href="https://www.instagram.com/${encodeURIComponent(ig)}/" target="_blank" rel="noopener" class="kontak-ig"><i class="bi bi-instagram me-2" aria-hidden="true"></i>@${esc(ig)}</a>`;
}
function kontakGrupWaHtml(s) {
  const l = String((s || {}).waGrupLink || '');
  if (!POLA_WA_GRUP_WEB.test(l)) return ''; // hanya tautan undangan grup resmi yang ditampilkan
  return `<a href="${esc(l)}" target="_blank" rel="noopener" class="btn-grup-wa"><i class="bi bi-people-fill" aria-hidden="true"></i>Gabung Grup WhatsApp</a>`;
}
/** Kartu pengaturan khusus Super Admin di tab Identitas. */
function kartuKontakSA(s) {
  if (!S.me || S.me.role !== 'superadmin') return '';
  return `<div class="cardx pad-lg mt-4"><b class="fs-5 d-block mb-1">Hubungi Kami di landing page</b><p class="muted small mb-3">Tampil di bagian <b>Hubungi Kami</b>. Hanya Super Admin yang dapat mengubah. Kosongkan untuk menyembunyikan.</p><div class="row g-3">
    <div class="col-sm-6"><label class="form-label" for="sIG">Nama Instagram</label><div class="input-group"><span class="input-group-text"><i class="bi bi-instagram" aria-hidden="true"></i>&nbsp;@</span><input class="form-control" id="sIG" name="bizIG" value="${esc(s.bizIG || '')}" maxlength="80" placeholder="namausaha" autocomplete="off" autocapitalize="off" spellcheck="false"></div><div class="form-text">Boleh tempel tautan profil Instagram.</div></div>
    <div class="col-sm-6"><label class="form-label" for="sWaGrup">Tautan grup WhatsApp</label><input class="form-control" id="sWaGrup" name="waGrupLink" type="url" inputmode="url" value="${esc(s.waGrupLink || '')}" maxlength="120" placeholder="https://chat.whatsapp.com/…" autocomplete="off"><div class="form-text">Di WhatsApp: Info grup → Undang lewat tautan → Salin tautan.</div></div>
  </div></div>`;
}

// ── Baris "per pcs · termasuk jasa titip Rp …" di kartu katalog (Super Admin & Owner; bawaan disembunyikan) ──
function jasaKartuTampil() { return sett().katalogJasaKartu === true; }
function bolehAturJasaKartu() { return !!S.me && ['superadmin', 'owner'].includes(S.me.role); }
function toggleJasaKartu(s) {
  if (!bolehAturJasaKartu()) return '';
  return `<div class="pt-3 mt-3" style="border-top:1px dashed var(--border)"><label class="form-check form-switch mb-1"><input class="form-check-input" type="checkbox" name="katalogJasaKartu" ${s.katalogJasaKartu === true ? 'checked' : ''}> <b>Tampilkan "per pcs · jasa titip Rp …" di kartu katalog</b></label>
    <div class="form-text">Berlaku untuk semua barang di katalog dan detail barang. Bawaan: disembunyikan. Hanya Super Admin & Owner yang dapat mengubah.</div></div>`;
}

// ── Voucher: pilih satu / pilih semua → hapus sekaligus ──
function vcPilihSet() { const st = S.ui.vc; if (!Array.isArray(st.pilih)) st.pilih = []; return st.pilih; }
function vcBisaHapus(v) { return statusVoucher(v) !== 'Terpakai'; }
/** Bilah di atas tabel voucher: centang "Pilih semua", jumlah terpilih, tombol hapus. */
function vcBilahPilih(list) {
  const bisa = list.filter(vcBisaHapus);
  if (!bisa.length) return '';
  const pil = vcPilihSet().filter(id => bisa.some(v => v.ID === id));
  S.ui.vc.pilih = pil;
  const semua = pil.length === bisa.length;
  return `<div class="vc-bilah" id="vcBilah"><label class="form-check mb-0 d-inline-flex align-items-center gap-2"><input class="form-check-input mt-0" type="checkbox" id="vcSemua" data-act="vcPilihSemua" ${semua ? 'checked' : ''} aria-label="Pilih semua voucher"><span>Pilih semua <span class="muted">(${num(bisa.length)})</span></span></label>
    <span class="vc-bilah-n" id="vcPilihN" ${pil.length ? '' : 'hidden'}>${num(pil.length)} dipilih</span>
    <span class="grow"></span>
    <button class="btn btn-light btn-sm" type="button" data-act="vcPilihBatal" id="vcBatalPilih" ${pil.length ? '' : 'hidden'}>Batal pilih</button>
    <button class="btn btn-danger-soft btn-sm" type="button" data-act="vcHapusPilih" id="vcHapusPilih" ${pil.length ? '' : 'disabled'}><i class="bi bi-trash" aria-hidden="true"></i>Hapus terpilih</button></div>`;
}
function vcCekBaris(v) {
  if (!vcBisaHapus(v)) return '<td class="cek"></td>';
  return `<td class="cek"><input class="form-check-input" type="checkbox" data-act="vcPilih" data-id="${v.ID}" ${vcPilihSet().includes(v.ID) ? 'checked' : ''} aria-label="Pilih voucher ${esc(v.Kode)}"></td>`;
}
/** Perbarui bilah & centang di tempat (tanpa render ulang tabel). */
function vcSegarPilih() {
  const pil = vcPilihSet();
  const cek = $$('[data-act=vcPilih]');
  cek.forEach(c => { c.checked = pil.includes(c.dataset.id); c.closest('tr')?.classList.toggle('dipilih', c.checked); });
  const n = pil.length;
  const semua = $('#vcSemua'); if (semua) { semua.checked = cek.length > 0 && cek.every(c => c.checked); semua.indeterminate = n > 0 && !semua.checked; }
  const lbl = $('#vcPilihN'); if (lbl) { lbl.hidden = !n; lbl.textContent = num(n) + ' dipilih'; }
  const bt = $('#vcBatalPilih'); if (bt) bt.hidden = !n;
  const h = $('#vcHapusPilih'); if (h) h.disabled = !n;
}
ACT.vcPilih = b => {
  const pil = vcPilihSet(), id = b.dataset.id;
  if (b.checked) { if (!pil.includes(id)) pil.push(id); } else S.ui.vc.pilih = pil.filter(x => x !== id);
  vcSegarPilih();
};
ACT.vcPilihSemua = b => {
  const ids = $$('[data-act=vcPilih]').map(c => c.dataset.id);
  S.ui.vc.pilih = b.checked ? ids : [];
  vcSegarPilih();
};
ACT.vcPilihBatal = () => { S.ui.vc.pilih = []; vcSegarPilih(); };
ACT.vcHapusPilih = async b => {
  const ids = vcPilihSet().slice();
  if (!ids.length) return;
  const kode = (S.d.vouchers || []).filter(v => ids.includes(v.ID)).map(v => v.Kode);
  if (!(await confirmDlg({ title: `Hapus ${num(ids.length)} voucher?`, text: `${kode.slice(0, 6).join(', ')}${kode.length > 6 ? ` dan ${num(kode.length - 6)} lainnya` : ''}. Kode yang dihapus tidak bisa dipakai lagi.`, ok: 'Hapus semua', danger: true }))) return;
  S.ui.vc.pilih = [];
  await mutate('voucher.hapus', { ids }, { btn: b, busyLabel: 'Menghapus…', optimistic: () => ids.forEach(id => removeLocal('vouchers', id)) });
};
