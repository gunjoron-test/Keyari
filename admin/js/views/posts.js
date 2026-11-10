// লেখা, পাতা ও আয়োজন — তালিকা ও সম্পাদক
import { S, can, commit, cleanDoc, catName, catBySlug, topCats, childCats, authorName, authorBySlug, siteUrl, statusBadge, statusLabel, imgUrl, imgFallback, resolveImage } from '../state.js';
import { $, $$, esc, bn, bnDate, toast, modal, confirmBox, slugify, uid, nowIso, toLocalInput, fromLocalInput, postPath, wordCount, stripTags, jsonText, debounce, clone, blobToBase64, processImage, asciiSlug } from '../util.js';
import { createEditor, stylesToCss } from '../editor.js';
import { pickMedia } from './media.js';
import { go, setTop } from '../app.js';

const PER = 30;
const ownOnly = () => !can('others');
const myAuthor = () => S.me && S.me.author;

// ==================================================================== তালিকা
export function postsView(view, params) {
  const q = new URLSearchParams(params || '');
  let state = { status: q.get('status') || 'all', cat: q.get('cat') || '', author: q.get('author') || '', s: q.get('s') || '', page: +q.get('page') || 1, month: '' };
  const selected = new Set();
  const base = () => S.posts.filter((p) => !ownOnly() || p.author === myAuthor());
  const counts = () => {
    const c = { all: 0, published: 0, draft: 0, review: 0, scheduled: 0, trash: 0 };
    base().forEach((p) => { const [k] = statusLabel(p.status, p.date); if (k !== 'trash') c.all++; c[k] = (c[k] || 0) + 1; });
    return c;
  };
  const months = [...new Set(S.posts.map((p) => String(p.date).slice(0, 7)))].sort().reverse();

  view.innerHTML = `<div class="page-head"><div><h1>লেখাসমূহ</h1><p>সব লেখা খুঁজুন, ছাঁকুন ও সম্পাদনা করুন</p></div>
    <a class="btn" href="#/post/new">＋ নতুন লেখা</a></div>
    <div class="tabs" data-tabs></div>
    <div class="toolbar">
      <input class="input grow" type="search" placeholder="শিরোনাম, লেখক বা লেখার ভেতরে খুঁজুন…" data-s value="${esc(state.s)}">
      <select class="select" data-cat><option value="">সব বিভাগ</option>${topCats().map((c) => `<option value="${c.slug}">${esc(c.name)}</option>${childCats(c.slug).map((k) => `<option value="${k.slug}">— ${esc(k.name)}</option>`).join('')}`).join('')}</select>
      <select class="select" data-author ${ownOnly() ? 'hidden' : ''}><option value="">সব লেখক</option>${[...S.authors].sort((a, b) => a.name.localeCompare(b.name, 'bn')).map((a) => `<option value="${esc(a.slug)}">${esc(a.name)}</option>`).join('')}</select>
      <select class="select" data-month><option value="">সব মাস</option>${months.map((m) => `<option value="${m}">${bnDate(m + '-01').replace(/^\S+\s/, '')}</option>`).join('')}</select>
    </div>
    <div class="toolbar" data-bulk hidden><b data-bn></b>
      <select class="select" data-bulk-act><option value="">বাছাই করা লেখায়…</option>${can('publish') ? '<option value="published">প্রকাশ করুন</option>' : ''}<option value="draft">খসড়া করুন</option><option value="review">পর্যালোচনায় পাঠান</option>${can('others') ? '<option value="pick">পাঠকের পছন্দে যোগ/বাদ</option><option value="featured">সম্পাদকের বাছাই যোগ/বাদ</option>' : ''}<option value="trash">ট্র্যাশে সরান</option><option value="delete">স্থায়ীভাবে মুছুন</option></select>
      <button class="btn btn--sm" data-bulk-go>প্রয়োগ</button></div>
    <div class="card" style="padding:0"><div class="table-wrap"><table class="table"><thead><tr>
      <th style="width:36px"><input type="checkbox" data-all aria-label="সব বাছাই"></th><th class="hide-sm"></th><th>শিরোনাম</th><th class="hide-sm">লেখক</th><th class="hide-sm">বিভাগ</th><th>তারিখ</th><th>অবস্থা</th></tr></thead><tbody data-body></tbody></table></div></div>
    <div class="btn-row" style="justify-content:center;margin-top:16px" data-pages></div>`;
  $('[data-cat]', view).value = state.cat; $('[data-author]', view).value = state.author;

  const render = () => {
    const c = counts();
    $('[data-tabs]', view).innerHTML = [['all', 'সব'], ['published', 'প্রকাশিত'], ['draft', 'খসড়া'], ['review', 'পর্যালোচনায়'], ['scheduled', 'নির্ধারিত'], ['trash', 'ট্র্যাশ']]
      .map(([k, l]) => `<button class="tab ${state.status === k ? 'is-active' : ''}" data-st="${k}">${l} <span class="help">(${bn(c[k] || 0)})</span></button>`).join('');
    $$('[data-st]', view).forEach((b) => (b.onclick = () => { state.status = b.dataset.st; state.page = 1; render(); }));
    const s = state.s.trim().toLowerCase();
    let list = base().filter((p) => {
      const [k] = statusLabel(p.status, p.date);
      if (state.status === 'all' ? k === 'trash' : k !== state.status) return false;
      if (state.cat && !(p.categories || []).includes(state.cat) && !(childCats(state.cat).some((x) => (p.categories || []).includes(x.slug)))) return false;
      if (state.author && p.author !== state.author) return false;
      if (state.month && !String(p.date).startsWith(state.month)) return false;
      if (s && !(p.title + ' ' + authorName(p.author) + ' ' + (p.excerpt || '') + ' ' + (s.length > 3 ? stripTags(p.body || '').slice(0, 5000) : '')).toLowerCase().includes(s)) return false;
      return true;
    });
    const total = Math.max(1, Math.ceil(list.length / PER));
    state.page = Math.min(state.page, total);
    const rows = list.slice((state.page - 1) * PER, state.page * PER);
    $('[data-body]', view).innerHTML = rows.map((p) => `<tr>
      <td><input type="checkbox" data-sel="${esc(p.id)}" ${selected.has(p.id) ? 'checked' : ''} aria-label="বাছাই"></td>
      <td class="hide-sm">${p.cover?.src ? `<img class="thumb" src="${esc(imgUrl(p.cover.src))}" alt="" loading="lazy">` : '<span class="thumb"></span>'}</td>
      <td><a class="t-title" href="#/post/${encodeURIComponent(p.id)}">${esc(p.title || '(শিরোনামহীন)')}</a>${p.pick ? ' <span class="badge" title="পাঠকের পছন্দ">★</span>' : ''}${p.featured ? ' <span class="badge" title="সম্পাদকের বাছাই">◆</span>' : ''}${p.series ? ` <span class="badge">${esc(p.series.name)} · ${bn(p.series.part || '')}</span>` : ''}
        <div class="t-actions"><a href="#/post/${encodeURIComponent(p.id)}">সম্পাদনা</a>${p.status === 'published' ? `<a href="${esc(siteUrl(postPath(p)))}" target="_blank" rel="noopener">দেখুন ↗</a>` : ''}<a href="#" data-dup="${esc(p.id)}">অনুলিপি</a><span class="help">${bn(wordCount(p.body))} শব্দ</span></div></td>
      <td class="hide-sm">${esc(authorName(p.author))}</td>
      <td class="hide-sm">${(p.categories || []).map((c) => esc(catName(c))).join(', ')}</td>
      <td style="white-space:nowrap">${bnDate(p.date)}</td>
      <td>${statusBadge(p.status, p.date)}</td></tr>`).join('') || `<tr><td colspan="7" class="empty">কোনো লেখা পাওয়া যায়নি।</td></tr>`;
    $$('[data-body] img', view).forEach(imgFallback);
    $$('[data-sel]', view).forEach((cb) => (cb.onchange = () => { cb.checked ? selected.add(cb.dataset.sel) : selected.delete(cb.dataset.sel); bulkUi(); }));
    $$('[data-dup]', view).forEach((a) => (a.onclick = (e) => { e.preventDefault(); duplicate(a.dataset.dup); }));
    $('[data-pages]', view).innerHTML = total > 1 ? Array.from({ length: total }, (_, i) => `<button class="btn btn--sm ${i + 1 === state.page ? '' : 'btn--light'}" data-pg="${i + 1}">${bn(i + 1)}</button>`).join('') : '';
    $$('[data-pg]', view).forEach((b) => (b.onclick = () => { state.page = +b.dataset.pg; render(); window.scrollTo(0, 0); }));
    $('[data-all]', view).checked = rows.length && rows.every((r) => selected.has(r.id));
    $('[data-all]', view).onchange = (e) => { rows.forEach((r) => (e.target.checked ? selected.add(r.id) : selected.delete(r.id))); render(); };
    bulkUi();
  };
  const bulkUi = () => { $('[data-bulk]', view).hidden = !selected.size; $('[data-bn]', view).textContent = `${bn(selected.size)}টি বাছাই`; };
  $('[data-s]', view).addEventListener('input', debounce((e) => { state.s = e.target.value; state.page = 1; render(); }, 250));
  $('[data-cat]', view).onchange = (e) => { state.cat = e.target.value; state.page = 1; render(); };
  $('[data-author]', view).onchange = (e) => { state.author = e.target.value; state.page = 1; render(); };
  $('[data-month]', view).onchange = (e) => { state.month = e.target.value; state.page = 1; render(); };
  $('[data-bulk-go]', view).onclick = async () => {
    const act = $('[data-bulk-act]', view).value; if (!act) return;
    const docs = S.posts.filter((p) => selected.has(p.id));
    if (act === 'delete') {
      if (!(await confirmBox(`${bn(docs.length)}টি লেখা স্থায়ীভাবে মুছে যাবে। এটি ফেরানো যাবে শুধু Git ইতিহাস থেকে। নিশ্চিত?`, { ok: 'স্থায়ীভাবে মুছুন', danger: true }))) return;
      await commit(`${docs.length}টি লেখা মুছে ফেলা`, docs.map((d) => ({ path: d._path || `content/posts/${d.id}.json`, delete: true })));
      S.posts = S.posts.filter((p) => !selected.has(p.id));
    } else {
      docs.forEach((d) => {
        if (act === 'pick') d.pick = !d.pick; else if (act === 'featured') d.featured = !d.featured;
        else d.status = act;
        d.modified = nowIso();
      });
      await commit(`${docs.length}টি লেখার অবস্থা: ${act}`, docs.map((d) => ({ path: d._path || `content/posts/${d.id}.json`, text: jsonText(cleanDoc(d)) })));
    }
    selected.clear(); render();
  };
  render();
}

async function duplicate(id) {
  const src = S.posts.find((p) => p.id === id); if (!src) return;
  const d = clone(cleanDoc(src));
  d.id = uid('p'); d.title = src.title + ' (অনুলিপি)'; d.slug = slugify(d.title); d.status = 'draft'; d.date = nowIso(); d.modified = nowIso(); delete d.source;
  d._path = `content/posts/${d.id}.json`;
  await commit('অনুলিপি: ' + d.title, [{ path: d._path, text: jsonText(cleanDoc(d)) }]);
  S.posts.unshift(d); go('#/post/' + d.id);
}

// ==================================================================== পাতা ও আয়োজনের তালিকা
export function pagesView(view) {
  view.innerHTML = `<div class="page-head"><div><h1>পাতাসমূহ</h1><p>আপনকথা, বিশেষ বার্তা ও অন্যান্য স্থায়ী পাতা</p></div><a class="btn" href="#/page/new">＋ নতুন পাতা</a></div>
  <div class="card" style="padding:0"><table class="table"><thead><tr><th>শিরোনাম</th><th>ঠিকানা</th><th>টেমপ্লেট</th><th>অবস্থা</th></tr></thead><tbody>
  ${S.pages.map((p) => `<tr><td><a class="t-title" href="#/page/${encodeURIComponent(p.id)}">${esc(p.title)}</a><div class="t-actions"><a href="#/page/${encodeURIComponent(p.id)}">সম্পাদনা</a><a href="${esc(siteUrl('/' + p.slug + '/'))}" target="_blank" rel="noopener">দেখুন ↗</a></div></td>
  <td class="help">/${esc(p.slug)}/</td><td>${esc({ about: 'আপনকথা', guidelines: 'নির্দেশিকা (সূচিপত্রসহ)', default: 'সাধারণ' }[p.template || 'default'])}</td><td>${statusBadge(p.status)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">কোনো পাতা নেই</td></tr>'}
  </tbody></table></div>
  <div class="notice" style="margin-top:16px">স্বয়ংক্রিয় পাতা (সম্পাদনার দরকার নেই): মুখপাতা, বিষয়সূচি, লেখক তালিকা, আয়োজন, ধারাবাহিক, অনুসন্ধান, ৪০৪ — এগুলো লেখা ও সেটিংস থেকে নিজে তৈরি হয়।</div>`;
}

export function ayojonView(view) {
  view.innerHTML = `<div class="page-head"><div><h1>আয়োজন</h1><p>বিশেষ থিম্যাটিক সংখ্যা — সক্রিয় আয়োজনটি মুখপাতা ও /আয়োজন/ পাতায় দেখায়</p></div><a class="btn" href="#/ayojon/new">＋ নতুন আয়োজন</a></div>
  <div class="card" style="padding:0"><table class="table"><thead><tr><th class="hide-sm"></th><th>শিরোনাম</th><th>সংখ্যা</th><th>লেখা</th><th>অবস্থা</th></tr></thead><tbody>
  ${[...S.ayojon].sort((a, b) => (b.number || 0) - (a.number || 0)).map((a) => `<tr><td class="hide-sm">${a.banner?.src ? `<img class="thumb" src="${esc(imgUrl(a.banner.src))}" alt="">` : ''}</td><td><a class="t-title" href="#/ayojon/${encodeURIComponent(a.id)}">${esc(a.title)}</a> ${a.active ? '<span class="badge badge--published">সক্রিয়</span>' : ''}</td>
  <td>${bn(a.number || '')}</td><td>${bn((a.posts || []).length)}টি</td><td>${statusBadge(a.status || 'published')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">কোনো আয়োজন নেই</td></tr>'}
  </tbody></table></div>`;
  $$('img', view).forEach(imgFallback);
}

// ==================================================================== প্রিভিউ
function previewHtml(d, kind) {
  const base = S.cfg.base || '';
  const css = stylesToCss(S.styles);
  const a = authorBySlug(d.author) || { name: '' };
  const title = esc(d.title || '');
  const cover = kind === 'post' ? d.cover?.src : d.banner?.src;
  const body = (kind === 'ayojon' ? d.editorial : d.body) || '';
  let n = 0; const notes = [];
  const processed = body.replace(/<sup class="fn-ref" data-note="([^"]*)"[^>]*>.*?<\/sup>/gs, (m, t) => { notes.push(t); n++; return `<sup class="fn-ref"><a href="#fn-${n}">${bn(n)}</a></sup>`; });
  const fn = notes.length ? `<section class="footnotes"><h2 class="footnotes__title">টীকা ও তথ্যসূত্র</h2><ol>${notes.map((t, i) => `<li id="fn-${i + 1}">${t}</li>`).join('')}</ol></section>` : '';
  const lay = d.layout || {};
  return `<!doctype html><html lang="bn" data-scheme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>প্রিভিউ: ${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+Bengali:wght@100..900&family=Noto+Sans+Bengali:wght@100..900&family=Hind+Siliguri:wght@300;400;600;700&family=Tiro+Bangla&family=Anek+Bangla:wght@100..800&family=Baloo+Da+2:wght@400..800&family=Galada&family=Atma:wght@400;600;700&family=Mina:wght@400;700&display=swap">
<link rel="stylesheet" href="${location.origin}${base}/assets/css/site.css"><style>${css}</style>
<style>.pv-bar{position:sticky;top:0;z-index:9;background:#29294B;color:#fff;padding:8px 16px;font:14px 'Hind Siliguri',sans-serif;display:flex;gap:12px;align-items:center}.pv-bar button{margin-left:auto}</style></head>
<body class="single"><div class="pv-bar">প্রিভিউ — এখনো প্রকাশিত নয়। <span>প্রস্থ:</span><button onclick="document.body.style.maxWidth='';">ডেস্কটপ</button><button onclick="document.body.style.maxWidth='390px';document.body.style.margin='0 auto'">মোবাইল</button></div>
<main class="site-main"><article class="entry"><header class="entry-header container">
${kind === 'post' ? `<span class="entry-author">${esc(a.name)}</span>` : ''}<h1 class="entry-title">${title}</h1>
${d.subtitle ? `<p class="entry-subtitle">${esc(d.subtitle)}</p>` : ''}${d.translator ? `<p class="entry-translator">অনুবাদ : ${esc(d.translator)}</p>` : ''}
${kind === 'post' ? `<div class="entry-meta"><span>${bnDate(d.date)}</span><span>${bn(Math.max(1, Math.ceil(wordCount(body) / 180)))} মিনিটের পাঠ</span><span>${bn(wordCount(body))} শব্দ</span></div>` : ''}
${cover ? `<figure class="entry-cover"><img class="entry-cover__img" src="${esc(/^(https?:|blob:|data:)/.test(cover) ? cover : location.origin + base + cover)}" alt=""></figure>` : ''}
</header><div class="container entry-layout" style="grid-template-columns:minmax(0,760px);justify-content:center"><div class="entry-main">
<div class="entry-content${lay.justify === false ? ' no-justify' : ''}${lay.dropcap ? ' has-dropcap' : ''}">${processed}${fn}</div></div></div></article></main></body></html>`;
}

// ==================================================================== সম্পাদক (লেখা / পাতা / আয়োজন)
const DEFAULTS = {
  post: () => ({ id: uid('p'), title: '', subtitle: '', slug: '', date: nowIso(), modified: nowIso(), status: 'draft', author: myAuthor() || '', translator: '', categories: [], tags: [], cover: { src: '', alt: '', caption: '' }, excerpt: '', body: '', series: null, ayojon: '', featured: false, pick: false, comments: true, seo: { title: '', description: '', keyphrase: '', og_image: '', canonical: '', noindex: false }, layout: { justify: true, dropcap: false, toc: false } }),
  page: () => ({ id: uid('pg'), title: '', slug: '', status: 'draft', template: 'default', banner: { src: '', alt: '' }, body: '', seo: { title: '', description: '', noindex: false }, date: nowIso(), modified: nowIso() }),
  ayojon: () => ({ id: uid('ay'), number: (Math.max(0, ...S.ayojon.map((a) => a.number || 0)) + 1), title: '', subtitle: '', slug: '', status: 'draft', active: false, date: nowIso(), banner: { src: '', alt: '' }, editorial: '', section_title: 'লেখাসমূহ', posts: [], seo: { title: '', description: '' } }),
};
const COLL = { post: 'posts', page: 'pages', ayojon: 'ayojon' };
const DIR = { post: 'content/posts', page: 'content/pages', ayojon: 'content/ayojon' };
const LABEL = { post: 'লেখা', page: 'পাতা', ayojon: 'আয়োজন' };

export async function editorView(view, kind, id) {
  const isNew = id === 'new';
  const existing = isNew ? null : S[COLL[kind]].find((x) => x.id === decodeURIComponent(id));
  if (!isNew && !existing) { view.innerHTML = `<div class="view"><p class="empty">${LABEL[kind]} পাওয়া যায়নি।</p></div>`; return; }
  if (kind === 'post' && existing && ownOnly() && existing.author !== myAuthor()) { view.innerHTML = '<div class="view"><p class="empty">অন্যের লেখা সম্পাদনার অনুমতি নেই।</p></div>'; return; }
  const d = isNew ? DEFAULTS[kind]() : Object.assign(DEFAULTS[kind](), clone(cleanDoc(existing)));
  d.seo = Object.assign(DEFAULTS[kind]().seo, d.seo || {});
  if (kind === 'post') d.layout = Object.assign({ justify: true, dropcap: false, toc: false }, d.layout || {});
  const path = existing?._path || `${DIR[kind]}/${d.id}.json`;
  const bodyKey = kind === 'ayojon' ? 'editorial' : 'body';
  const blobMap = new Map(); // blob: URL → {file}
  let ed = null, slugTouched = !!d.slug;
  const autoKey = 'keyari-autosave-' + kind + '-' + d.id;

  view.classList.add('view--wide'); view.style.padding = '0';
  view.innerHTML = `<div class="ed"><div class="ed__main"><div class="ed__paper">
    <div data-restore></div>
    <input class="input input--title" data-f="title" placeholder="${kind === 'post' ? 'লেখার শিরোনাম' : kind === 'page' ? 'পাতার শিরোনাম' : 'আয়োজনের নাম'}" value="${esc(d.title)}" aria-label="শিরোনাম">
    ${kind !== 'page' ? `<input class="input input--sub" data-f="subtitle" placeholder="${kind === 'post' ? 'উপশিরোনাম / সাবটাইটেল (ঐচ্ছিক)' : 'উপশিরোনাম (যেমন: দশ লেখকের দশটি গদ্য-কলাম)'}" value="${esc(d.subtitle || '')}">` : ''}
    <p class="help" style="margin:6px 0 14px">স্থায়ী ঠিকানা: <span data-permalink></span> <a href="#" data-edit-slug>বদলান</a></p>
    <div data-ed-wrap><div class="ed-loading"><span><span class="spinner spinner--sm"></span> এডিটর লোড হচ্ছে…</span></div><textarea data-ed hidden></textarea></div>
    <div class="ed__stats" data-stats></div>
  </div></div><aside class="ed__side" data-side></aside></div>`;

  // ---------- টপবার ----------
  const publishLabel = () => {
    if (kind === 'post' && !can('publish')) return 'পর্যালোচনায় পাঠান';
    return d.status === 'published' && !isNew ? 'হালনাগাদ' : 'প্রকাশ করুন';
  };
  const renderTop = () => setTop(`<a class="btn btn--ghost btn--sm" href="#/${COLL[kind]}">← ${LABEL[kind]}সমূহ</a>
    <span class="top__title">${esc(d.title || 'নতুন ' + LABEL[kind])}</span>
    <span class="help" data-dirty></span>${statusBadge(d.status, d.date)}
    <button class="btn btn--light btn--sm" data-preview>প্রিভিউ</button>
    <button class="btn btn--light btn--sm" data-save-draft>${d.status === 'published' ? 'খসড়া করুন' : 'খসড়া সংরক্ষণ'}</button>
    <button class="btn btn--sm" data-publish>${publishLabel()}</button>`, (top) => {
    $('[data-preview]', top).onclick = preview;
    $('[data-save-draft]', top).onclick = () => save(d.status === 'published' ? 'draft' : d.status === 'review' ? 'review' : 'draft');
    $('[data-publish]', top).onclick = () => save(kind === 'post' && !can('publish') ? 'review' : 'published');
  });
  renderTop();
  const markDirty = () => { S.dirty = true; const el = $('[data-dirty]'); if (el) el.textContent = '● অসংরক্ষিত'; autosave(); updateStats(); };
  const autosave = debounce(() => { try { localStorage.setItem(autoKey, JSON.stringify({ t: Date.now(), d: collect() })); } catch (e) { /* */ } }, 1500);

  // ---------- পারমালিংক ----------
  const permalink = () => {
    const slug = d.slug || slugify(d.title) || '…';
    if (kind === 'post') return postPath({ ...d, slug });
    if (kind === 'page') return `/${slug}/`;
    return `/আয়োজন/${slug}/`;
  };
  const showPermalink = () => { $('[data-permalink]', view).textContent = siteUrl(permalink()); };
  showPermalink();
  $('[data-edit-slug]', view).onclick = async (e) => {
    e.preventDefault();
    const m = modal({ title: 'স্থায়ী ঠিকানা (স্লাগ)', body: `<div class="field"><label>স্লাগ</label><input class="input" value="${esc(d.slug || slugify(d.title))}"><p class="help">বাংলা অক্ষর চলবে। শব্দের মাঝে হাইফেন (-)। প্রকাশিত লেখার স্লাগ বদলালে পুরোনো লিংক ভেঙে যাবে — সতর্ক থাকুন।</p></div>`, foot: '<button class="btn" data-ok>ঠিক আছে</button>' });
    $('[data-ok]', m.el).onclick = () => { d.slug = slugify($('input', m.el).value) || slugify(d.title); slugTouched = true; showPermalink(); markDirty(); m.close(); };
  };

  // ---------- শিরোনাম ইত্যাদি ----------
  $$('[data-f]', view).forEach((inp) => inp.addEventListener('input', () => {
    d[inp.dataset.f] = inp.value;
    if (inp.dataset.f === 'title') { if (!slugTouched && (isNew || d.status !== 'published')) d.slug = slugify(d.title); showPermalink(); const tt = $('.top__title'); if (tt) tt.textContent = d.title || 'নতুন ' + LABEL[kind]; refreshSeo(); }
    markDirty();
  }));

  // ---------- পাশের প্যানেল ----------
  const side = $('[data-side]', view);
  side.innerHTML = sidePanels(kind, d);
  bindSide(kind, d, side, markDirty, () => refreshSeo());

  // ---------- অটোসেভ পুনরুদ্ধার ----------
  try {
    const saved = JSON.parse(localStorage.getItem(autoKey) || 'null');
    if (saved && saved.t > new Date(d.modified || 0).getTime() + 2000 && saved.d && saved.d[bodyKey] !== d[bodyKey]) {
      $('[data-restore]', view).innerHTML = `<div class="notice notice--warn">এই ${LABEL[kind]}র একটি অসংরক্ষিত খসড়া পাওয়া গেছে (${bnDate(new Date(saved.t).toISOString(), true)})। <button class="btn btn--sm" data-r>ফিরিয়ে আনুন</button> <button class="btn btn--sm btn--light" data-rx>বাদ দিন</button></div>`;
      $('[data-r]', view).onclick = () => { Object.assign(d, saved.d); ed && ed.setContent(d[bodyKey] || ''); $$('[data-f]', view).forEach((i) => (i.value = d[i.dataset.f] || '')); side.innerHTML = sidePanels(kind, d); bindSide(kind, d, side, markDirty, refreshSeo); $('[data-restore]', view).innerHTML = ''; markDirty(); };
      $('[data-rx]', view).onclick = () => { localStorage.removeItem(autoKey); $('[data-restore]', view).innerHTML = ''; };
    }
  } catch (e) { /* */ }

  // ---------- এডিটর ----------
  const ta = $('[data-ed]', view);
  const getBody = () => (ed ? ed.getContent() : ta.value);
  ta.value = d[bodyKey] || '';
  try {
    ed = await createEditor(ta, {
      styles: S.styles,
      siteCss: location.origin + (S.cfg.base || '') + '/assets/css/site.css',
      justify: d.layout ? d.layout.justify !== false : true,
      mini: false,
      pickMedia: () => pickMedia(),
      resolveImage,
      openStyles: () => go('#/styles'),
      onChange: () => { if (ed && ed.isDirty()) markDirty(); },
    });
    $('.ed-loading', view)?.remove();
    ed.setDirty(false);
    S.dirty = false;
    updateStats();
    refreshSeo();
    // কপি-পেস্ট বা টেনে আনা ছবির blob ধরে রাখা
  } catch (e) {
    const ld = $('.ed-loading', view) || $('[data-ed-wrap]', view).appendChild(document.createElement('div'));
    console.error(e);
    ld.innerHTML = `<div class="notice notice--danger">এডিটর চালু হয়নি: ${esc(e.message)}। নিচের HTML বক্সে সরাসরি লিখতে পারেন।</div>`;
    ta.hidden = false; ta.className = 'textarea input--mono'; ta.style.minHeight = '500px';
    ta.addEventListener('input', markDirty);
  }

  function updateStats() {
    const html = getBody();
    const w = wordCount(html);
    const chars = stripTags(html).length;
    const el = $('[data-stats]', view);
    if (el) el.innerHTML = `<span>${bn(w)} শব্দ</span><span>${bn(chars)} অক্ষর</span><span>পড়তে ~${bn(Math.max(1, Math.ceil(w / (S.settings.reading?.words_per_minute || 180))))} মিনিট</span><span>অনুচ্ছেদ ${bn((html.match(/<p[\s>]/g) || []).length)}টি</span>${(html.match(/class="fn-ref"/g) || []).length ? `<span>টীকা ${bn((html.match(/class="fn-ref"/g) || []).length)}টি</span>` : ''}`;
  }

  function collect() {
    const out = clone(d);
    out[bodyKey] = getBody();
    return out;
  }

  // ---------- SEO ----------
  function refreshSeo() {
    const box = $('[data-seo-box]', side); if (!box) return;
    const html = getBody(), text = stripTags(html);
    const st = (S.settings.seo?.title_separator) || '|';
    const t = d.seo.title || (kind === 'post' ? `${d.title} — ${authorName(d.author)}` : d.title);
    const fullT = `${t} ${st} ${S.settings.site_name || 'কেয়ারি'}`;
    const desc = d.seo.description || (kind === 'post' ? (d.subtitle || d.excerpt || text.slice(0, 160)) : text.slice(0, 160));
    const kp = (d.seo.keyphrase || '').trim();
    const checks = [];
    const add = (ok, msg, mid) => checks.push([ok ? 'ok' : mid ? 'mid' : 'bad', msg]);
    add(fullT.length <= 65, `শিরোনামের দৈর্ঘ্য ${bn(fullT.length)} অক্ষর ${fullT.length <= 65 ? '(ভালো)' : '(৬০–৬৫-এর কম হলে ভালো)'}`, fullT.length <= 80);
    add(desc.length >= 70 && desc.length <= 160, `বর্ণনা ${bn(desc.length)} অক্ষর (৭০–১৬০ আদর্শ)`, desc.length > 30);
    if (kind === 'post') {
      add(!!d.cover?.src, d.cover?.src ? 'কভার ছবি আছে (শেয়ার ও গুগল ডিসকভারের জন্য জরুরি)' : 'কভার ছবি নেই');
      add(!!(d.cover?.src && d.cover?.alt), 'কভার ছবির বিকল্প লেখা (alt)', !!d.cover?.src);
      add((d.categories || []).length > 0, 'অন্তত একটি বিভাগ নির্বাচিত');
      add(!!(d.excerpt || '').trim(), 'সারাংশ লেখা হয়েছে', true);
    }
    const w = text ? text.split(/\s+/).length : 0;
    add(w >= 300, `লেখার দৈর্ঘ্য ${bn(w)} শব্দ ${w >= 300 ? '' : '(৩০০+ শব্দ হলে র‍্যাংকিং ভালো)'}`, w >= 120);
    if (kp) {
      add(d.title.includes(kp), 'মূল শব্দ শিরোনামে আছে', false);
      add(desc.includes(kp), 'মূল শব্দ বর্ণনায় আছে', true);
      add(text.slice(0, 600).includes(kp), 'মূল শব্দ প্রথম অনুচ্ছেদে আছে', true);
      const dens = w ? (text.split(kp).length - 1) : 0;
      add(dens >= 2 && dens <= Math.max(6, w / 100), `মূল শব্দ লেখায় ${bn(dens)} বার`, dens >= 1);
      add((d.slug || '').includes(slugify(kp).split('-')[0] || '§'), 'মূল শব্দ ঠিকানায় (স্লাগ) আছে', true);
    } else checks.push(['mid', 'মূল শব্দ (ফোকাস কিওয়ার্ড) দিন — বিশ্লেষণ আরও নির্ভুল হবে']);
    const links = (html.match(/<a\s[^>]*href=/g) || []).length;
    add(links > 0, `লেখায় লিংক ${bn(links)}টি (অন্য লেখার লিংক দিলে ভালো)`, true);
    add(!/<h1[\s>]/.test(html), 'লেখার ভেতরে H1 নেই (শিরোনামই H1)', true);
    const imgsNoAlt = (html.match(/<img(?![^>]*alt="[^"]+")[^>]*>/g) || []).length;
    add(!imgsNoAlt, imgsNoAlt ? `${bn(imgsNoAlt)}টি ছবিতে alt নেই` : 'সব ছবিতে alt আছে', true);
    const score = Math.round(100 * checks.filter((c) => c[0] === 'ok').length / checks.length);
    const color = score >= 75 ? 'var(--accent)' : score >= 50 ? 'var(--warn)' : 'var(--danger)';
    box.innerHTML = `<div class="seo-score"><span class="seo-score__dot" style="background:${color}"></span>SEO স্কোর: ${bn(score)}/১০০</div>
      <div class="serp"><div class="serp__url">${esc(siteUrl(permalink()))}</div><div class="serp__title">${esc(fullT.slice(0, 70))}${fullT.length > 70 ? '…' : ''}</div><div class="serp__desc">${esc(desc.slice(0, 160))}${desc.length > 160 ? '…' : ''}</div></div>
      <ul class="seo-checks">${checks.map(([k, m]) => `<li class="${k}"><span>${k === 'ok' ? '✔' : k === 'mid' ? '◐' : '✖'}</span><span>${esc(m)}</span></li>`).join('')}</ul>`;
  }
  side.addEventListener('input', debounce(refreshSeo, 400));

  // ---------- সংরক্ষণ ----------
  async function save(status) {
    const out = collect();
    out.title = (out.title || '').trim();
    if (!out.title) { toast('শিরোনাম লিখুন', 'err'); $('[data-f=title]', view).focus(); return; }
    if (kind === 'post' && status === 'published' && !(out.categories || []).length) { toast('অন্তত একটি বিভাগ নির্বাচন করুন', 'err'); return; }
    if (kind === 'post' && !out.author) { toast('লেখক নির্বাচন করুন', 'err'); return; }
    out.slug = slugify(out.slug || out.title) || out.id;
    // স্লাগ যেন অনন্য হয়
    const coll = S[COLL[kind]];
    const clash = coll.find((x) => x.id !== out.id && (kind === 'post' ? postPath(x) === postPath(out) : x.slug === out.slug));
    if (clash) { out.slug += '-' + Date.now().toString(36).slice(-3); d.slug = out.slug; }
    out.status = status;
    out.modified = nowIso();
    if (kind === 'post' && status === 'published' && isNew && new Date(out.date) < new Date(Date.now() - 864e5)) { /* পুরোনো তারিখ ইচ্ছাকৃত হতে পারে */ }
    // ছবি: blob/data → আপলোড
    const changes = [];
    let html = out[bodyKey] || '';
    const srcs = [...new Set([...html.matchAll(/<img[^>]+src="((?:blob|data):[^"]+)"/g)].map((m) => m[1]))];
    for (const src of srcs) {
      try {
        const blob = await (await fetch(src)).blob();
        const proc = await processImage(blob, 1600);
        const dt = new Date();
        const p = `static/uploads/${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${asciiSlug(out.slug) || 'img'}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.${proc.ext}`;
        changes.push({ path: p, base64: await blobToBase64(proc.blob) });
        html = html.split(src).join(p.replace(/^static/, ''));
      } catch (e) { console.warn(e); }
    }
    out[bodyKey] = html;
    if (kind === 'post' && !out.excerpt) out.excerpt = stripTags(html).slice(0, 220).replace(/\s\S*$/, '') + '…';
    if (kind === 'ayojon' && out.active) {
      S.ayojon.filter((a) => a.id !== out.id && a.active).forEach((a) => { a.active = false; changes.push({ path: a._path || `content/ayojon/${a.id}.json`, text: jsonText(cleanDoc(a)) }); });
    }
    changes.push({ path, text: jsonText(cleanDoc(out)) });
    const btns = $$('.top .btn'); btns.forEach((b) => (b.disabled = true));
    try {
      const verb = status === 'published' ? (new Date(out.date) > new Date() ? 'নির্ধারিত' : 'প্রকাশ') : status === 'review' ? 'পর্যালোচনা' : 'খসড়া';
      await commit(`${LABEL[kind]} ${verb}: ${out.title}`, changes);
      Object.assign(d, out);
      if (srcs.length && ed) ed.setContent(html);
      const idx = coll.findIndex((x) => x.id === out.id);
      const stored = { ...out, _path: path };
      if (idx > -1) coll[idx] = stored; else coll.unshift(stored);
      S.dirty = false; ed && ed.setDirty(false);
      localStorage.removeItem(autoKey);
      if (isNew) { history.replaceState(null, '', `#/${kind}/${encodeURIComponent(out.id)}`); }
      view._cleanup && view._cleanup();
      editorView(view, kind, out.id);
      if (status === 'published') showPublished(kind, out);
    } catch (e) {
      toast('সংরক্ষণ ব্যর্থ: ' + e.message, 'err');
      btns.forEach((b) => (b.disabled = false));
    }
  }

  function preview() {
    const w = window.open('', '_blank');
    if (!w) { toast('পপআপ ব্লক হয়েছে — অনুমতি দিন', 'err'); return; }
    w.document.open(); w.document.write(previewHtml(collect(), kind)); w.document.close();
  }

  // Ctrl+S
  const keyH = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(d.status === 'published' ? 'published' : d.status || 'draft'); } };
  document.addEventListener('keydown', keyH);
  view._cleanup = () => { document.removeEventListener('keydown', keyH); if (ed) { ed.remove(); ed = null; } };
}

function showPublished(kind, d) {
  const url = siteUrl(kind === 'post' ? postPath(d) : kind === 'page' ? `/${d.slug}/` : `/আয়োজন/${d.slug}/`);
  const future = new Date(d.date) > new Date();
  const m = modal({
    title: future ? 'প্রকাশ নির্ধারিত হয়েছে' : 'প্রকাশিত হয়েছে 🎉',
    body: `<p>${future ? `এই লেখাটি ${bnDate(d.date, true)}-এ স্বয়ংক্রিয়ভাবে প্রকাশিত হবে (প্রতি ঘণ্টায় সাইট হালনাগাদ হয়)।` : S.be.mode === 'local' ? 'লোকাল সাইটে দেখা যাচ্ছে।' : 'GitHub Actions সাইট তৈরি করছে — ১–২ মিনিটের মধ্যে লাইভ হবে।'}</p>
      <div class="field"><label>লিংক</label><input class="input input--mono" readonly value="${esc(url)}"></div>
      <div class="btn-row"><a class="btn btn--light" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}">ফেসবুকে শেয়ার</a><a class="btn btn--light" href="#/deploy">প্রকাশের অবস্থা দেখুন</a></div>`,
    foot: `<button class="btn btn--light" data-c>লিংক কপি</button><a class="btn" target="_blank" rel="noopener" href="${esc(url)}">সাইটে দেখুন ↗</a>`,
  });
  $('[data-c]', m.el).onclick = () => { navigator.clipboard.writeText(url); toast('কপি হয়েছে'); };
}

// ---------- পাশের প্যানেল ----------
function sidePanels(kind, d) {
  const dateInput = `<div class="field"><label>প্রকাশের তারিখ ও সময় (ঢাকা)</label><input class="input" type="datetime-local" data-s="date" value="${toLocalInput(d.date)}"><p class="help">ভবিষ্যতের সময় দিলে সেই সময়ে নিজে থেকে প্রকাশ হবে।</p></div>`;
  const statusSel = `<div class="field"><label>অবস্থা</label><select class="select" data-s="status">${[['draft', 'খসড়া'], ['review', 'পর্যালোচনায়'], ...(can('publish') || kind !== 'post' ? [['published', 'প্রকাশিত']] : []), ['trash', 'ট্র্যাশ']].map(([v, l]) => `<option value="${v}" ${d.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select><p class="help">উপরের বোতাম দিয়ে সংরক্ষণ করলে অবস্থা বদলায়।</p></div>`;
  const history = `<details class="panel"><summary>সংস্করণ ইতিহাস</summary><div class="panel__body" data-history><button class="btn btn--light btn--sm" data-load-history>ইতিহাস দেখুন</button></div></details>`;
  const danger = `<button class="btn btn--light btn--sm" data-trash style="color:var(--danger)">${kind === 'post' ? 'ট্র্যাশে সরান' : 'মুছে ফেলুন'}</button>`;

  if (kind === 'page') {
    return `<details class="panel" open><summary>প্রকাশ</summary><div class="panel__body">${statusSel}
      <div class="field"><label>টেমপ্লেট</label><select class="select" data-s="template">${[['default', 'সাধারণ'], ['about', 'আপনকথা (অর্থ-কার্ড, বিভাগ-গ্রিড, সম্পাদক)'], ['guidelines', 'নির্দেশিকা (বামে সূচিপত্র, ইমেইল বক্স)']].map(([v, l]) => `<option value="${v}" ${d.template === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${danger}</div></details>
      ${imagePanel('ব্যানার ছবি', 'banner', d.banner)}${seoPanel(d, false)}${history}`;
  }
  if (kind === 'ayojon') {
    return `<details class="panel" open><summary>প্রকাশ</summary><div class="panel__body">${statusSel}
      <div class="grid2"><div class="field"><label>সংখ্যা নম্বর</label><input class="input" type="number" min="1" data-s="number" value="${esc(d.number || '')}"></div>
      <div class="field"><label>অংশের শিরোনাম</label><input class="input" data-s="section_title" value="${esc(d.section_title || '')}"></div></div>
      ${dateInput}<label class="check"><input type="checkbox" data-s="active" ${d.active ? 'checked' : ''}> সক্রিয় আয়োজন (মুখপাতায় দেখাবে)</label>${danger}</div></details>
      ${imagePanel('ব্যানার ছবি', 'banner', d.banner)}
      <details class="panel" open><summary>এই আয়োজনের লেখা (${bn((d.posts || []).length)})</summary><div class="panel__body" data-ay-posts></div></details>
      ${seoPanel(d, false)}${history}`;
  }
  // post
  const catTree = topCats().map((c) => `<label class="check"><input type="checkbox" data-cat="${c.slug}" ${(d.categories || []).includes(c.slug) ? 'checked' : ''}> <b>${esc(c.name)}</b></label>
    <div class="sub">${childCats(c.slug).map((k) => `<label class="check"><input type="checkbox" data-cat="${k.slug}" data-parent="${c.slug}" ${(d.categories || []).includes(k.slug) ? 'checked' : ''}> ${esc(k.name)}</label>`).join('')}</div>`).join('');
  const authorsOpts = [...S.authors].sort((a, b) => a.name.localeCompare(b.name, 'bn')).map((a) => `<option value="${esc(a.slug)}" ${d.author === a.slug ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  const seriesNames = [...new Set(S.posts.filter((p) => p.series?.name).map((p) => p.series.name))];
  return `<details class="panel" open><summary>প্রকাশ</summary><div class="panel__body">${statusSel}${dateInput}
      <label class="check"><input type="checkbox" data-s="comments" ${d.comments !== false ? 'checked' : ''}> মন্তব্য চালু</label>
      ${can('others') ? `<label class="check"><input type="checkbox" data-s="pick" ${d.pick ? 'checked' : ''}> ★ পাঠকের পছন্দ (স্লাইডারে)</label>
      <label class="check"><input type="checkbox" data-s="featured" ${d.featured ? 'checked' : ''}> ◆ সম্পাদকের বাছাই</label>` : ''}
      <div style="margin-top:10px">${danger}</div></div></details>
    <details class="panel" open><summary>বিভাগ</summary><div class="panel__body"><div class="cat-tree">${catTree}</div><p class="help">উপ-বিভাগ বাছলে মূল বিভাগও নিজে থেকে বাছাই হবে।</p></div></details>
    <details class="panel" open><summary>লেখক</summary><div class="panel__body">
      <div class="field"><select class="select" data-s="author" ${!can('others') && myAuthor() ? 'disabled' : ''}><option value="">— লেখক বাছুন —</option>${authorsOpts}</select>
      <a href="#" data-new-author class="help">＋ নতুন লেখক যোগ করুন</a></div>
      <div class="field"><label>অনুবাদক (অনুবাদ হলে)</label><input class="input" data-s="translator" value="${esc(d.translator || '')}" placeholder="যেমন: ওমর ইবনে আব্দুর রউফ"></div></div></details>
    ${imagePanel('কভার ছবি (১৬:৯)', 'cover', d.cover, true)}
    <details class="panel" open><summary>সারাংশ</summary><div class="panel__body"><textarea class="textarea" data-s="excerpt" placeholder="কার্ডে ও গুগলে দেখানো ২–৩ লাইনের সারাংশ">${esc(d.excerpt || '')}</textarea><div class="counter" data-cnt="excerpt"></div></div></details>
    <details class="panel"><summary>ট্যাগ</summary><div class="panel__body"><div class="tagbox" data-tags>${(d.tags || []).map((t) => `<span class="chip">${esc(t)}<button type="button" data-rm="${esc(t)}" aria-label="সরান">×</button></span>`).join('')}<input placeholder="লিখে Enter চাপুন" data-tag-in></div></div></details>
    <details class="panel" ${d.series ? 'open' : ''}><summary>ধারাবাহিক / পর্ব</summary><div class="panel__body">
      <div class="field"><label>ধারাবাহিকের নাম</label><input class="input" list="series-list" data-series-name value="${esc(d.series?.name || '')}" placeholder="যেমন: অবিনশ্বর"><datalist id="series-list">${seriesNames.map((n) => `<option value="${esc(n)}">`).join('')}</datalist></div>
      <div class="grid2"><div class="field"><label>পর্ব নম্বর</label><input class="input" type="number" min="1" data-series-part value="${esc(d.series?.part || '')}"></div>
      <div class="field"><label>একক</label><select class="select" data-series-unit>${['পর্ব', 'কিস্তি', 'খণ্ড', 'অধ্যায়'].map((u) => `<option ${d.series?.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>
      <p class="help">একই নামের সব পর্ব একসাথে "পূর্ববর্তী/পরবর্তী পর্ব" নেভিগেশনে যুক্ত হবে।</p></div></details>
    <details class="panel"><summary>আয়োজন</summary><div class="panel__body"><select class="select" data-s="ayojon"><option value="">— নেই —</option>${S.ayojon.map((a) => `<option value="${esc(a.id)}" ${d.ayojon === a.id ? 'selected' : ''}>${esc(a.title)}</option>`).join('')}</select></div></details>
    <details class="panel"><summary>পাঠের বিন্যাস</summary><div class="panel__body">
      <label class="check"><input type="checkbox" data-l="justify" ${d.layout.justify !== false ? 'checked' : ''}> সমপ্রান্তিক (justify) লেখা — মোবাইলে নিজে বামে হয়</label>
      <label class="check"><input type="checkbox" data-l="dropcap" ${d.layout.dropcap ? 'checked' : ''}> প্রথম অনুচ্ছেদে ড্রপ ক্যাপ</label>
      <label class="check"><input type="checkbox" data-l="toc" ${d.layout.toc ? 'checked' : ''}> উপশিরোনাম থেকে সূচিপত্র দেখান</label></div></details>
    ${seoPanel(d, true)}${history}`;
}

function imagePanel(title, key, img = {}, withCaption = false) {
  return `<details class="panel" open><summary>${title}</summary><div class="panel__body">
    <div class="cover-box" data-img="${key}" tabindex="0" role="button" aria-label="${title} বাছুন">${img?.src ? `<img src="${esc(imgUrl(img.src))}" alt="">` : '<span>＋ ছবি বাছুন বা টেনে আনুন</span>'}</div>
    <div class="btn-row" style="margin:8px 0">${img?.src ? `<button class="btn btn--light btn--sm" data-img-rm="${key}">সরান</button>` : ''}</div>
    <div class="field"><label>বিকল্প লেখা (alt)</label><input class="input" data-img-alt="${key}" value="${esc(img?.alt || '')}" placeholder="ছবির সংক্ষিপ্ত বর্ণনা"></div>
    ${withCaption ? `<div class="field"><label>ক্যাপশন / চিত্রকর্ম</label><input class="input" data-img-cap="${key}" value="${esc(img?.caption || '')}" placeholder="যেমন: প্রচ্ছদ — শিল্পীর নাম"></div>` : ''}
    <p class="help">আদর্শ: ১৬:৯ অনুপাত (যেমন ১৬০০×৯০০)। কেয়ারির ক্যালিগ্রাফিক কভার-টেমপ্লেট বজায় রাখুন।</p></div></details>`;
}

function seoPanel(d, isPost) {
  return `<details class="panel"><summary>SEO — সার্চ র‍্যাংকিং</summary><div class="panel__body">
    <div data-seo-box></div><hr style="border:0;border-top:1px solid var(--line-2);margin:14px 0">
    <div class="field"><label>মূল শব্দ (ফোকাস কিওয়ার্ড)</label><input class="input" data-seo="keyphrase" value="${esc(d.seo.keyphrase || '')}" placeholder="যেমন: বাংলা গল্প"></div>
    <div class="field"><label>SEO শিরোনাম</label><input class="input" data-seo="title" value="${esc(d.seo.title || '')}" placeholder="ফাঁকা থাকলে: শিরোনাম — লেখক"><div class="counter" data-cnt="seo.title"></div></div>
    <div class="field"><label>মেটা বর্ণনা</label><textarea class="textarea" data-seo="description" placeholder="গুগলের ফলাফলে দেখানো ১২০–১৬০ অক্ষরের বর্ণনা">${esc(d.seo.description || '')}</textarea><div class="counter" data-cnt="seo.description"></div></div>
    ${isPost ? `<div class="field"><label>শেয়ারের ছবি (ঐচ্ছিক, না দিলে কভার)</label><input class="input" data-seo="og_image" value="${esc(d.seo.og_image || '')}" placeholder="/uploads/… বা https://…"></div>
    <div class="field"><label>ক্যানোনিকাল URL (অন্য কোথাও আগে প্রকাশিত হলে)</label><input class="input" data-seo="canonical" value="${esc(d.seo.canonical || '')}"></div>` : ''}
    <label class="check"><input type="checkbox" data-seo-noindex ${d.seo.noindex ? 'checked' : ''}> সার্চ ইঞ্জিনে দেখাবে না (noindex)</label>
  </div></details>`;
}

function bindSide(kind, d, side, markDirty, refreshSeo) {
  // সাধারণ ফিল্ড
  $$('[data-s]', side).forEach((el) => el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
    const k = el.dataset.s;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'date') v = fromLocalInput(el.value);
    if (k === 'number') v = +el.value || '';
    d[k] = v; markDirty();
  }));
  $$('[data-l]', side).forEach((el) => el.addEventListener('change', () => { d.layout[el.dataset.l] = el.checked; markDirty(); }));
  $$('[data-seo]', side).forEach((el) => el.addEventListener('input', () => { d.seo[el.dataset.seo] = el.value; markDirty(); counters(); }));
  const ni = $('[data-seo-noindex]', side); if (ni) ni.onchange = () => { d.seo.noindex = ni.checked; markDirty(); };
  const counters = () => {
    $$('[data-cnt]', side).forEach((c) => {
      const path = c.dataset.cnt.split('.'); const v = path.length > 1 ? d[path[0]][path[1]] : d[path[0]];
      const n = (v || '').length, max = c.dataset.cnt.includes('title') ? 60 : 160;
      c.textContent = `${bn(n)} / ${bn(max)}`; c.className = 'counter ' + (n > max ? 'is-bad' : n > 0 ? 'is-good' : '');
    });
  };
  counters();
  // বিভাগ
  $$('[data-cat]', side).forEach((cb) => cb.addEventListener('change', () => {
    if (cb.checked && cb.dataset.parent) { const p = $(`[data-cat="${cb.dataset.parent}"]`, side); if (p) p.checked = true; }
    d.categories = $$('[data-cat]', side).filter((x) => x.checked).map((x) => x.dataset.cat);
    markDirty();
  }));
  // ট্যাগ
  const tagBox = $('[data-tags]', side);
  if (tagBox) {
    const tin = $('[data-tag-in]', tagBox);
    const redraw = () => { $$('.chip', tagBox).forEach((c) => c.remove()); (d.tags || []).forEach((t) => { const s = document.createElement('span'); s.className = 'chip'; s.innerHTML = `${esc(t)}<button type="button" aria-label="সরান">×</button>`; $('button', s).onclick = () => { d.tags = d.tags.filter((x) => x !== t); redraw(); markDirty(); }; tagBox.insertBefore(s, tin); }); };
    redraw();
    tin.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ',') && tin.value.trim()) { e.preventDefault(); d.tags = [...new Set([...(d.tags || []), tin.value.trim().replace(/^#/, '')])]; tin.value = ''; redraw(); markDirty(); } });
  }
  // ধারাবাহিক
  const sn = $('[data-series-name]', side);
  if (sn) {
    const upd = () => { const name = sn.value.trim(); d.series = name ? { name, part: +$('[data-series-part]', side).value || 1, unit: $('[data-series-unit]', side).value } : null; markDirty(); };
    [sn, $('[data-series-part]', side), $('[data-series-unit]', side)].forEach((el) => el.addEventListener('input', upd));
  }
  // নতুন লেখক
  const na = $('[data-new-author]', side);
  if (na) na.onclick = async (e) => {
    e.preventDefault();
    const { authorModal } = await import('./site.js');
    authorModal(null, (a) => { const sel = $('[data-s=author]', side); sel.insertAdjacentHTML('beforeend', `<option value="${esc(a.slug)}">${esc(a.name)}</option>`); sel.value = a.slug; d.author = a.slug; markDirty(); });
  };
  // ছবি
  $$('[data-img]', side).forEach((box) => {
    const key = box.dataset.img;
    const choose = async () => { const r = await pickMedia({ title: 'ছবি বাছাই' }); if (r && r.url) { d[key] = { ...(d[key] || {}), src: r.url, alt: r.alt || d[key]?.alt || d.title }; rebindImg(); markDirty(); } };
    box.onclick = choose; box.onkeydown = (e) => { if (e.key === 'Enter') choose(); };
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('is-drag'); });
    box.addEventListener('dragleave', () => box.classList.remove('is-drag'));
    box.addEventListener('drop', async (e) => {
      e.preventDefault(); box.classList.remove('is-drag');
      const f = e.dataTransfer.files[0]; if (!f) return;
      const { uploadFiles } = await import('./media.js');
      const res = await uploadFiles([f]); if (res[0]) { d[key] = { ...(d[key] || {}), src: res[0].url, alt: d[key]?.alt || d.title }; rebindImg(); markDirty(); }
    });
    const im = $('img', box); if (im) imgFallback(im);
    function rebindImg() { box.innerHTML = d[key]?.src ? `<img src="${esc(imgUrl(d[key].src))}" alt="">` : '<span>＋ ছবি বাছুন</span>'; const i2 = $('img', box); i2 && imgFallback(i2); const alt = $(`[data-img-alt="${key}"]`, side); if (alt) alt.value = d[key]?.alt || ''; refreshSeo(); }
  });
  $$('[data-img-rm]', side).forEach((b) => (b.onclick = () => { d[b.dataset.imgRm] = { src: '', alt: '', caption: '' }; const box = $(`[data-img="${b.dataset.imgRm}"]`, side); box.innerHTML = '<span>＋ ছবি বাছুন</span>'; b.remove(); markDirty(); }));
  $$('[data-img-alt]', side).forEach((i) => i.addEventListener('input', () => { d[i.dataset.imgAlt] = { ...(d[i.dataset.imgAlt] || {}), alt: i.value }; markDirty(); }));
  $$('[data-img-cap]', side).forEach((i) => i.addEventListener('input', () => { d[i.dataset.imgCap] = { ...(d[i.dataset.imgCap] || {}), caption: i.value }; markDirty(); }));
  // আয়োজনের লেখা
  const ap = $('[data-ay-posts]', side);
  if (ap) {
    const draw = () => {
      const list = (d.posts || []).map((id) => S.posts.find((p) => p.id === id)).filter(Boolean);
      ap.innerHTML = `<ul class="sortable">${list.map((p, i) => `<li><span class="grow">${bn(i + 1)}. ${esc(p.title)}<br><span class="help">${esc(authorName(p.author))}</span></span>
        <button class="btn btn--ghost btn--sm" data-up="${i}" aria-label="উপরে">↑</button><button class="btn btn--ghost btn--sm" data-rm="${i}" aria-label="সরান">✕</button></li>`).join('')}</ul>
        <div class="field" style="margin-top:10px"><input class="input" placeholder="লেখা খুঁজে যোগ করুন…" data-find></div><div class="picker-list" data-res hidden></div>`;
      $$('[data-up]', ap).forEach((b) => (b.onclick = () => { const i = +b.dataset.up; if (i > 0) { [d.posts[i - 1], d.posts[i]] = [d.posts[i], d.posts[i - 1]]; draw(); markDirty(); } }));
      $$('[data-rm]', ap).forEach((b) => (b.onclick = () => { d.posts.splice(+b.dataset.rm, 1); draw(); markDirty(); }));
      const f = $('[data-find]', ap), res = $('[data-res]', ap);
      f.oninput = () => {
        const q = f.value.trim(); res.hidden = !q;
        res.innerHTML = S.posts.filter((p) => !(d.posts || []).includes(p.id) && (p.title + authorName(p.author)).includes(q)).slice(0, 12).map((p) => `<button type="button" data-add="${esc(p.id)}">${esc(p.title)} <span class="help">— ${esc(authorName(p.author))}</span></button>`).join('') || '<p class="help" style="padding:8px">পাওয়া যায়নি</p>';
        $$('[data-add]', res).forEach((b) => (b.onclick = () => { d.posts = [...(d.posts || []), b.dataset.add]; draw(); markDirty(); }));
      };
    };
    draw();
  }
  // ইতিহাস
  const hb = $('[data-load-history]', side);
  if (hb) hb.onclick = async () => {
    const box = $('[data-history]', side);
    const path = (S[COLL[kind]].find((x) => x.id === d.id) || {})._path || `${DIR[kind]}/${d.id}.json`;
    box.innerHTML = '<span class="spinner spinner--sm"></span>';
    try {
      const h = await S.be.history(path);
      box.innerHTML = h.length ? `<div class="list">${h.map((c) => `<div class="list__item"><div class="list__main"><span class="list__title">${esc(c.message.split('\n')[0])}</span><span class="list__meta">${bnDate(c.date, true)} · ${esc(c.author)}</span></div><button class="btn btn--light btn--sm" data-restore-sha="${c.sha}">ফেরান</button></div>`).join('')}</div>` : '<p class="help">ইতিহাস নেই (লোকাল মোডে git log দেখুন)।</p>';
      $$('[data-restore-sha]', box).forEach((b) => (b.onclick = async () => {
        if (!(await confirmBox('এই সংস্করণের লেখা এডিটরে আনা হবে (সংরক্ষণ না করা পর্যন্ত কিছু বদলাবে না)। আনবেন?'))) return;
        const old = JSON.parse(await S.be.readAt(path, b.dataset.restoreSha));
        const bodyKey = kind === 'ayojon' ? 'editorial' : 'body';
        const e = tinymce.activeEditor; if (e) e.setContent(old[bodyKey] || '');
        Object.assign(d, old); toast('পুরোনো সংস্করণ আনা হয়েছে — সংরক্ষণ করুন', 'ok'); markDirty();
      }));
    } catch (e) { box.innerHTML = `<p class="help">ইতিহাস আনা যায়নি: ${esc(e.message)}</p>`; }
  };
  // ট্র্যাশ/মুছুন
  const tr = $('[data-trash]', side);
  if (tr) tr.onclick = async () => {
    const coll = S[COLL[kind]];
    const ex = coll.find((x) => x.id === d.id);
    if (!ex) { go('#/' + COLL[kind]); return; }
    if (kind === 'post' && d.status !== 'trash') {
      if (!(await confirmBox('লেখাটি ট্র্যাশে যাবে (সাইট থেকে সরবে, পরে ফেরানো যাবে)। নিশ্চিত?', { ok: 'ট্র্যাশে সরান', danger: true }))) return;
      ex.status = 'trash'; ex.modified = nowIso();
      await commit('ট্র্যাশে: ' + ex.title, [{ path: ex._path, text: jsonText(cleanDoc(ex)) }]);
    } else {
      if (!(await confirmBox(`"${esc(ex.title)}" স্থায়ীভাবে মুছে যাবে। নিশ্চিত?`, { ok: 'স্থায়ীভাবে মুছুন', danger: true }))) return;
      await commit(`${LABEL[kind]} মুছে ফেলা: ${ex.title}`, [{ path: ex._path, delete: true }]);
      S[COLL[kind]] = coll.filter((x) => x.id !== d.id);
    }
    S.dirty = false; go('#/' + COLL[kind]);
  };
}
