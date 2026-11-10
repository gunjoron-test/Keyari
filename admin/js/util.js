// সাধারণ সহায়ক ফাংশন
export const $ = (s, c = document) => c.querySelector(s);
export const $$ = (s, c = document) => [...c.querySelectorAll(s)];

const BN = '০১২৩৪৫৬৭৮৯';
export const bn = (n) => String(n).replace(/\d/g, (d) => BN[d]);
export const MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
export function bnDate(iso, withTime = false) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  let s = `${bn(d.getDate())} ${MONTHS[d.getMonth()]} ${bn(d.getFullYear())}`;
  if (withTime) s += `, ${bn(String(d.getHours()).padStart(2, '0'))}:${bn(String(d.getMinutes()).padStart(2, '0'))}`;
  return s;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const stripTags = (h) => { const d = document.createElement('div'); d.innerHTML = h || ''; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
export const wordCount = (h) => { const t = stripTags(h); return t ? t.split(/\s+/).length : 0; };

export function slugify(s) {
  return String(s || '').trim()
    .replace(/[\s‌‍]+/g, '-')
    .replace(/[^\p{L}\p{M}\p{N}\-_]/gu, '')
    .replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}
export function asciiSlug(s) {
  return String(s || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').toLowerCase().slice(0, 40);
}
export const uid = (p = 'p') => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ISO তারিখ (+06:00 ঢাকা সময়) ↔ datetime-local ইনপুট
export function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  const dh = new Date(d.getTime() + 6 * 3600e3);
  return dh.toISOString().slice(0, 16);
}
export function fromLocalInput(v) {
  if (!v) return nowIso();
  return v.length === 16 ? `${v}:00+06:00` : `${v}+06:00`;
}
export function nowIso() {
  const d = new Date(Date.now() + 6 * 3600e3);
  return d.toISOString().slice(0, 19) + '+06:00';
}
export function postPath(p) {
  const d = new Date(new Date(p.date).getTime() + 6 * 3600e3);
  const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, '0'), day = String(d.getUTCDate()).padStart(2, '0');
  return `/${y}/${m}/${day}/${p.slug}/`;
}

export function debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const jsonText = (o) => JSON.stringify(o, null, 2) + '\n';

// ---------- টোস্ট ----------
export function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' toast--' + type : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 6000 : 3200);
}

// ---------- মোডাল ----------
export function modal({ title, body, foot, wide = false, onClose }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal${wide ? ' modal--wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal__head"><h2>${esc(title)}</h2><button class="btn btn--ghost btn--icon" data-x aria-label="বন্ধ করুন">✕</button></div>
    <div class="modal__body"></div>${foot !== false ? '<div class="modal__foot"></div>' : ''}</div>`;
  const bodyEl = $('.modal__body', back);
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  const footEl = $('.modal__foot', back);
  if (footEl && foot) { if (typeof foot === 'string') footEl.innerHTML = foot; else footEl.appendChild(foot); }
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  $('[data-x]', back).onclick = close;
  $('#modal-root').appendChild(back);
  setTimeout(() => { const f = $('input, select, textarea', bodyEl); f && f.focus(); }, 30);
  return { el: back, body: bodyEl, foot: footEl, close };
}
export function confirmBox(message, { ok = 'হ্যাঁ', danger = false } = {}) {
  return new Promise((res) => {
    const m = modal({ title: 'নিশ্চিত করুন', body: `<p>${message}</p>`, foot: `<button class="btn btn--light" data-no>বাতিল</button><button class="btn ${danger ? 'btn--danger' : ''}" data-yes>${esc(ok)}</button>`, onClose: () => res(false) });
    $('[data-no]', m.el).onclick = () => { m.close(); };
    $('[data-yes]', m.el).onclick = () => { res(true); m.el.remove(); };
  });
}
export function promptBox(title, label, value = '', { multiline = false, placeholder = '' } = {}) {
  return new Promise((res) => {
    const m = modal({
      title, body: `<div class="field"><label>${esc(label)}</label>${multiline ? `<textarea class="textarea" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input class="input" value="${esc(value)}" placeholder="${esc(placeholder)}">`}</div>`,
      foot: `<button class="btn btn--light" data-no>বাতিল</button><button class="btn" data-yes>ঠিক আছে</button>`, onClose: () => res(null)
    });
    const inp = $('input, textarea', m.el);
    const ok = () => { res(inp.value); m.el.remove(); };
    $('[data-yes]', m.el).onclick = ok;
    $('[data-no]', m.el).onclick = () => m.close();
    if (!multiline) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  });
}

// ---------- ছবি প্রসেসিং (WebP-তে রূপান্তর ও ছোট করা) ----------
export async function processImage(file, maxW = 1600, quality = 0.85) {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return { blob: file, ext: file.type === 'image/gif' ? 'gif' : 'svg', width: 0, height: 0 };
  }
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return { blob: file, ext: (file.name.split('.').pop() || 'jpg').toLowerCase(), width: 0, height: 0 };
  const scale = Math.min(1, maxW / bmp.width);
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise((r) => c.toBlob(r, 'image/webp', quality));
  if (!blob || blob.type !== 'image/webp') {
    const jb = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
    return { blob: jb, ext: 'jpg', width: w, height: h, bitmap: bmp };
  }
  return { blob, ext: 'webp', width: w, height: h, bitmap: bmp };
}
export function blobToBase64(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
}
/** একটি ছবি ফাইল থেকে কমিটযোগ্য পরিবর্তন (মূল + ৬৪০px থাম্ব) */
export async function imageChanges(file, baseName) {
  const main = await processImage(file, 1600);
  const d = new Date();
  const dir = `static/uploads/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const name = (asciiSlug(baseName || file.name.replace(/\.[^.]+$/, '')) || 'image') + '-' + Date.now().toString(36);
  const changes = [{ path: `${dir}/${name}.${main.ext}`, base64: await blobToBase64(main.blob) }];
  if (main.ext === 'webp' && main.width > 700) {
    const thumb = await processImage(file, 640, 0.8);
    changes.push({ path: `${dir}/${name}-640.webp`, base64: await blobToBase64(thumb.blob) });
  }
  const url = changes[0].path.replace(/^static/, '');
  return { url, changes, previewUrl: URL.createObjectURL(main.blob), width: main.width, height: main.height };
}

export function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// বাংলা টাইপোগ্রাফি টুল
export const toBnDigits = (s) => s.replace(/\d/g, (d) => BN[d]);
export function fixPunctuation(s) {
  return s
    .replace(/[ \t]+([।,;:?!॥])/g, '$1')
    .replace(/([।?!॥])(?=[^\s<"”’)\]])/g, '$1 ')
    .replace(/ {2,}/g, ' ')
    .replace(/\.\.\./g, '…')
    .replace(/ -- /g, ' — ');
}
export function smartQuotes(s) {
  return s.replace(/(^|[\s(\[{>—–-])"/g, '$1“').replace(/"/g, '”')
    .replace(/(^|[\s(\[{>—–-])'/g, '$1‘').replace(/'/g, '’');
}
