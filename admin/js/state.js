// অ্যাডমিনের কেন্দ্রীয় অবস্থা: কনটেন্ট লোড, সংরক্ষণ, ভূমিকা
import { jsonText, toast, bn } from './util.js';

export const S = {
  be: null, user: null, role: 'admin', cfg: {}, tree: [],
  settings: {}, categories: [], authors: [], menu: { header: [], footer: [] }, home: {}, styles: {}, users: { users: [] },
  posts: [], pages: [], ayojon: [], media: [],
  dirty: false,
};

export const ROLES = {
  admin: { name: 'প্রশাসক', can: ['*'] },
  editor: { name: 'সম্পাদক', can: ['posts', 'publish', 'others', 'pages', 'ayojon', 'categories', 'authors', 'media', 'home', 'menu', 'comments', 'seo', 'deploy', 'styles'] },
  author: { name: 'লেখক', can: ['posts', 'publish', 'media'] },
  contributor: { name: 'অবদানকারী', can: ['posts', 'media'] },
};
export const can = (perm) => { const r = ROLES[S.role] || ROLES.contributor; return r.can.includes('*') || r.can.includes(perm); };

const SINGLES = {
  settings: 'content/settings.json', categories: 'content/categories.json', authors: 'content/authors.json',
  menu: 'content/menu.json', home: 'content/home.json', styles: 'content/styles.json', users: 'content/users.json',
};
export const PATHS = SINGLES;

async function pool(items, n, fn, onProgress) {
  let i = 0, done = 0;
  const out = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(n, items.length) || 1 }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); done++; onProgress && onProgress(done, items.length); }
  }));
  return out;
}

export async function loadAll(onProgress) {
  S.tree = await S.be.tree();
  const shaOf = Object.fromEntries(S.tree.map((t) => [t.path, t.sha]));
  const readJSON = async (path) => {
    try { return JSON.parse(await S.be.readText(path, shaOf[path])); } catch (e) { console.warn('পড়া যায়নি', path, e); return null; }
  };
  for (const [k, p] of Object.entries(SINGLES)) {
    const v = shaOf[p] ? await readJSON(p) : null;
    if (v) S[k] = v;
  }
  const collect = async (dir) => {
    const files = S.tree.filter((t) => t.path.startsWith(dir + '/') && t.path.endsWith('.json'));
    const docs = await pool(files, 10, async (f) => {
      const d = await readJSON(f.path);
      if (d) { d.id = d.id || f.path.split('/').pop().replace(/\.json$/, ''); d._path = f.path; }
      return d;
    }, onProgress);
    return docs.filter(Boolean);
  };
  S.posts = await collect('content/posts');
  S.pages = await collect('content/pages');
  S.ayojon = await collect('content/ayojon');
  refreshMedia();
  S.posts.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
  // ভূমিকা নির্ধারণ
  const list = (S.users && S.users.users) || [];
  const me = list.find((u) => u.github && S.user && u.github.toLowerCase() === String(S.user.login).toLowerCase()) || list.find((u) => u.github === '*');
  S.role = S.be.mode === 'local' ? 'admin' : (me ? me.role : 'contributor');
  S.me = me || {};
}

export function refreshMedia() {
  S.media = S.tree.filter((t) => t.path.startsWith('static/uploads/') && /\.(webp|jpe?g|png|gif|svg|avif)$/i.test(t.path) && !/-640\.webp$/.test(t.path))
    .map((t) => ({ path: t.path, url: t.path.replace(/^static/, ''), size: t.size }))
    .sort((a, b) => b.path.localeCompare(a.path));
}

/** এক কমিটে একাধিক ফাইল সংরক্ষণ */
export async function commit(message, changes) {
  const res = await S.be.commit(message, changes);
  // গাছ (tree) হালনাগাদ
  for (const ch of changes) {
    const i = S.tree.findIndex((t) => t.path === ch.path);
    if (ch.delete) { if (i > -1) S.tree.splice(i, 1); }
    else if (i === -1) S.tree.push({ path: ch.path, sha: 'new-' + Date.now(), size: (ch.text || ch.base64 || '').length });
  }
  refreshMedia();
  if (S.be.mode === 'local') toast('সংরক্ষিত হয়েছে ও সাইট নতুন করে তৈরি হয়েছে ✓', 'ok');
  else toast('সংরক্ষিত হয়েছে ✓ — সাইটে প্রকাশ হতে ১–২ মিনিট লাগবে', 'ok');
  return res;
}
export const saveSingle = (key, msg) => commit(msg || `${key} হালনাগাদ`, [{ path: SINGLES[key], text: jsonText(S[key]) }]);

export function cleanDoc(d) {
  const o = { ...d };
  Object.keys(o).forEach((k) => { if (k.startsWith('_')) delete o[k]; });
  return o;
}

// ---------- সহায়ক ----------
export const catBySlug = (s) => S.categories.find((c) => c.slug === s);
export const catName = (s) => (catBySlug(s) || { name: s }).name;
export const topCats = () => S.categories.filter((c) => !c.parent).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
export const childCats = (slug) => S.categories.filter((c) => c.parent === slug).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
export const authorBySlug = (s) => S.authors.find((a) => a.slug === s);
export const authorName = (s) => (authorBySlug(s) || { name: s || '—' }).name;
export const siteUrl = (path) => {
  const base = S.cfg.base || '';
  if (S.be && S.be.mode === 'local') return location.origin + base + path;
  return (S.cfg.site_url || (S.settings.site_url || '')).replace(/\/$/, '') + base + path;
};
export const statusLabel = (st, date) => {
  if (st === 'published' && date && new Date(date) > new Date()) return ['scheduled', 'নির্ধারিত'];
  return [st, { published: 'প্রকাশিত', draft: 'খসড়া', review: 'পর্যালোচনায়', scheduled: 'নির্ধারিত', trash: 'ট্র্যাশ' }[st] || st];
};
export const statusBadge = (st, date) => { const [k, l] = statusLabel(st, date); return `<span class="badge badge--${k}">${l}</span>`; };
export const countBn = (n) => bn(n);

/** অপ্রকাশিত ছবি API থেকে দেখানো */
const imgCache = {};
export async function resolveImage(src) {
  if (!src || /^(blob:|data:)/.test(src)) return null;
  let p = src;
  try { p = decodeURIComponent(new URL(src, location.href).pathname); } catch (e) { /* */ }
  const base = S.cfg.base || '';
  if (base && p.startsWith(base)) p = p.slice(base.length);
  if (!p.startsWith('/uploads/')) return null;
  const repoPath = 'static' + p;
  if (imgCache[repoPath]) return imgCache[repoPath];
  try { const b = await S.be.readBlob(repoPath); imgCache[repoPath] = URL.createObjectURL(b); return imgCache[repoPath]; } catch (e) { return null; }
}
/** অ্যাডমিনে ছবি দেখানোর URL (BASE সহ) */
export const imgUrl = (u) => (!u ? '' : /^(https?:|blob:|data:)/.test(u) ? u : (S.cfg.base || '') + u);
export function imgFallback(el) {
  el.addEventListener('error', () => { if (el.dataset.tried) return; el.dataset.tried = 1; resolveImage(el.getAttribute('src')).then((u) => { if (u) el.src = u; }); }, { once: false });
}
