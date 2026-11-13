// কেয়ারি সম্পাদনা কক্ষ — প্রবেশ, কাঠামো, রাউটার, ড্যাশবোর্ড
import { Backend } from './api.js';
import { S, ROLES, can, loadAll, commit, statusBadge, authorName, siteUrl } from './state.js';
import { $, $$, esc, bn, bnDate, toast, uid, nowIso, jsonText, stripTags, wordCount, MONTHS } from './util.js';

const AUTH_KEY = 'keyari-admin-auth';
let currentView = null;

// ==================================================================== বুট
async function boot() {
  try { S.cfg = await (await fetch('config.json', { cache: 'no-store' })).json(); } catch (e) { S.cfg = {}; }
  window.__KEYARI_BASE = S.cfg.base || '';
  const saved = readAuth();
  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  let localOk = false;
  if (isLocalHost) { try { localOk = (await fetch((S.cfg.base || '') + '/_api/status', { cache: 'no-store' })).ok; } catch (e) { /* */ } }
  if (saved && saved.token) { if (await connect(new Backend.GitHubBackend(saved), true)) return; }
  if (localOk && sessionStorage.getItem('keyari-local') !== 'off') { if (await connect(new Backend.LocalBackend(), true)) return; }
  loginScreen(localOk);
}
function readAuth() { try { return JSON.parse(localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY) || 'null'); } catch (e) { return null; } }

async function connect(be, silent) {
  const app = $('#app');
  app.innerHTML = `<div class="boot"><img class="boot__logo" src="../assets/img/logo.svg" alt="কেয়ারি"><div class="spinner"></div><p data-msg>সংযোগ হচ্ছে…</p><div class="progress" style="width:260px"><span data-p></span></div></div>`;
  try {
    S.be = be;
    S.user = await be.verify();
    $('[data-msg]').textContent = 'কনটেন্ট লোড হচ্ছে…';
    await loadAll((d, t) => { const p = $('[data-p]'); if (p) p.style.width = Math.round((d / t) * 100) + '%'; const m = $('[data-msg]'); if (m) m.textContent = `কনটেন্ট লোড হচ্ছে… ${bn(d)}/${bn(t)}`; });
    shell();
    window.addEventListener('hashchange', route);
    route();
    return true;
  } catch (e) {
    console.error(e);
    if (!silent) toast('সংযোগ ব্যর্থ: ' + e.message, 'err');
    if (be.mode === 'github' && (e.status === 401 || e.status === 403 || e.status === 404)) { localStorage.removeItem(AUTH_KEY); sessionStorage.removeItem(AUTH_KEY); }
    loginScreen(false, e.message);
    return false;
  }
}

function loginScreen(localOk, err = '') {
  const saved = readAuth() || {};
  const c = S.cfg;
  $('#app').innerHTML = `<div class="login">
    <div class="login__art"><img class="login__brand" src="../assets/img/logo.svg" alt="কেয়ারি">
      <p class="login__quote">“কেয়ারি চায় এমন একটি বীজতলা গড়তে—যেখানে হবে সুন্দরের চাষবাস, শুদ্ধতার পরিচর্যা।”</p>
      <p style="opacity:.85">সম্পাদনা কক্ষ · লেখা, সম্পাদনা ও প্রকাশ</p></div>
    <div class="login__form"><form class="login__card" data-form>
      <h1>প্রবেশ করুন</h1><p class="help">আপনার GitHub টোকেন দিয়ে প্রবেশ করুন। টোকেন শুধু এই ব্রাউজারে থাকে।</p>
      ${err ? `<div class="notice notice--danger">${esc(err)}</div>` : ''}
      <div class="grid2"><div class="field"><label for="ow">GitHub মালিক</label><input class="input" id="ow" name="owner" required value="${esc(saved.owner || c.owner || '')}" placeholder="username"></div>
      <div class="field"><label for="rp">রিপো</label><input class="input" id="rp" name="repo" required value="${esc(saved.repo || c.repo || '')}" placeholder="keyari"></div></div>
      <div class="field"><label for="br">ব্রাঞ্চ</label><input class="input" id="br" name="branch" value="${esc(saved.branch || c.branch || 'main')}"></div>
      <div class="field"><label for="tk">টোকেন (Fine-grained personal access token)</label><input class="input input--mono" id="tk" name="token" type="password" required autocomplete="off" placeholder="github_pat_…">
        <p class="help"><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">টোকেন বানান ↗</a> — শুধু এই রিপো বাছুন; অনুমতি: <b>Contents: Read and write</b>, <b>Actions: Read and write</b>। বিস্তারিত README-তে।</p></div>
      <label class="check"><input type="checkbox" name="remember" checked> এই কম্পিউটারে মনে রাখুন</label>
      <button class="btn btn--block" style="margin-top:14px" type="submit">প্রবেশ</button>
      ${localOk ? `<p class="login__or">অথবা</p><button class="btn btn--light btn--block" type="button" data-local>লোকাল মোডে চালান (এই কম্পিউটারের ফাইলে সরাসরি)</button>` : ''}
    </form></div></div>`;
  $('[data-form]').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const auth = { owner: fd.get('owner').trim(), repo: fd.get('repo').trim(), branch: fd.get('branch').trim() || 'main', token: fd.get('token').trim() };
    (fd.get('remember') ? localStorage : sessionStorage).setItem(AUTH_KEY, JSON.stringify(auth));
    await connect(new Backend.GitHubBackend(auth));
  };
  const lb = $('[data-local]'); if (lb) lb.onclick = () => { sessionStorage.removeItem('keyari-local'); connect(new Backend.LocalBackend()); };
}

// ==================================================================== কাঠামো
const NAV = [
  ['মূল', [['dashboard', '◧', 'ড্যাশবোর্ড'], ['posts', '✎', 'লেখাসমূহ', 'posts'], ['post/new', '＋', 'নতুন লেখা', 'posts'], ['media', '▣', 'মিডিয়া', 'media']]],
  ['প্রকাশনা', [['pages', '▤', 'পাতাসমূহ', 'pages'], ['ayojon', '✦', 'আয়োজন', 'ayojon'], ['categories', '☰', 'বিভাগ', 'categories'], ['authors', '☺', 'লেখক', 'authors'], ['comments', '✉', 'মন্তব্য', 'comments']]],
  ['নকশা', [['home', '⌂', 'মুখপাতার বিন্যাস', 'home'], ['menu', '≡', 'মেনু', 'menu'], ['styles', '¶', 'স্টাইল শিট', 'styles']]],
  ['ব্যবস্থাপনা', [['seo', '↗', 'SEO ও র‍্যাংকিং', 'seo'], ['deploy', '⟳', 'প্রকাশের অবস্থা', 'deploy'], ['settings', '⚙', 'সেটিংস', 'settings'], ['users', '⚇', 'ব্যবহারকারী', 'users'], ['import', '⇅', 'আমদানি ও ব্যাকআপ', 'import']]],
];

function shell() {
  try { document.body.classList.toggle('side-collapsed', !!localStorage.getItem('keyari-side')); } catch (e) { /* */ }
  const role = ROLES[S.role] || ROLES.contributor;
  $('#app').innerHTML = `<div class="shell">
    <aside class="side" data-side><div class="side__brand"><img src="../assets/img/logo.svg" alt="কেয়ারি" width="58" height="34"><small>সম্পাদনা কক্ষ</small></div>
      <nav class="side__nav" aria-label="অ্যাডমিন মেনু">${NAV.map(([g, items]) => {
        const vis = items.filter((it) => !it[3] || can(it[3]));
        return vis.length ? `<div class="side__group">${g}</div>` + vis.map(([r, ico, label]) => `<a class="side__link" href="#/${r}" data-r="${r}"><span class="ico" aria-hidden="true">${ico}</span>${label}${r === 'posts' ? `<span class="n" data-n-posts>${bn(S.posts.filter((p) => p.status !== 'trash').length)}</span>` : ''}</a>`).join('') : '';
      }).join('')}</nav>
      <div class="side__foot">
        <div style="display:flex;gap:10px;align-items:center">${S.user.avatar ? `<img src="${esc(S.user.avatar)}" alt="" width="32" height="32" style="border-radius:50%">` : ''}<div><b>${esc(S.user.name || S.user.login)}</b><br>${esc(role.name)}${S.be.mode === 'local' ? ' · লোকাল' : ''}</div></div>
        <div class="btn-row"><a class="btn btn--light btn--sm" href="${esc(siteUrl('/'))}" target="_blank" rel="noopener">সাইট দেখুন ↗</a><button class="btn btn--ghost btn--sm" data-theme title="আলো/আঁধার">◐</button><button class="btn btn--ghost btn--sm" data-logout>প্রস্থান</button></div>
      </div></aside>
    <div class="main"><header class="top" data-top></header><div class="view" data-view></div></div></div>`;
  $('[data-theme]').onclick = () => { const n = document.documentElement.getAttribute('data-scheme') === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-scheme', n); localStorage.setItem('keyari-admin-scheme', n); };
  $('[data-logout]').onclick = () => { localStorage.removeItem(AUTH_KEY); sessionStorage.removeItem(AUTH_KEY); sessionStorage.setItem('keyari-local', 'off'); Backend.clearCache(); location.hash = ''; location.reload(); };
  window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
}

export function setTop(html, bind) {
  const top = $('[data-top]'); if (!top) return;
  top.innerHTML = `<button class="btn btn--ghost btn--icon top__menu" data-menu aria-label="মেনু">☰</button>${html}`;
  $('[data-menu]', top).onclick = () => {
    if (window.innerWidth > 860) { const on = document.body.classList.toggle('side-collapsed'); try { localStorage.setItem('keyari-side', on ? '1' : ''); } catch (e) { /* */ } }
    else $('[data-side]').classList.toggle('is-open');
  };
  bind && bind(top);
}
export function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

let lastHash = '';
async function route() {
  const hash = location.hash || '#/dashboard';
  if (S.dirty && hash !== lastHash) {
    if (!window.confirm('অসংরক্ষিত পরিবর্তন আছে। না রেখেই চলে যাবেন?')) { history.replaceState(null, '', lastHash); return; }
    S.dirty = false;
  }
  lastHash = hash;
  const [pathPart, query] = hash.slice(2).split('?');
  const parts = pathPart.split('/');
  const view = $('[data-view]');
  if (currentView && currentView._cleanup) { try { currentView._cleanup(); } catch (e) { /* */ } }
  view.className = 'view'; view.style.padding = ''; view._cleanup = null;
  currentView = view;
  $$('.side__link').forEach((a) => a.classList.toggle('is-active', a.dataset.r === pathPart || (a.dataset.r === parts[0] && parts.length === 1)));
  $('[data-side]').classList.remove('is-open');
  const n = $('[data-n-posts]'); if (n) n.textContent = bn(S.posts.filter((p) => p.status !== 'trash').length);
  const title = { dashboard: 'ড্যাশবোর্ড', posts: 'লেখাসমূহ', media: 'মিডিয়া', pages: 'পাতাসমূহ', ayojon: 'আয়োজন', categories: 'বিভাগ', authors: 'লেখক', comments: 'মন্তব্য', home: 'মুখপাতার বিন্যাস', menu: 'মেনু', styles: 'স্টাইল শিট', seo: 'SEO', deploy: 'প্রকাশের অবস্থা', settings: 'সেটিংস', users: 'ব্যবহারকারী', import: 'আমদানি ও ব্যাকআপ' }[parts[0]] || '';
  setTop(`<span class="top__title">${esc(title)}</span><a class="btn btn--light btn--sm" href="#/post/new">＋ নতুন লেখা</a>`);
  view.innerHTML = '<div class="empty"><span class="spinner"></span></div>';
  window.scrollTo(0, 0);
  try {
    const V = await import('./views/posts.js');
    const Site = await import('./views/site.js');
    const T = await import('./views/tools.js');
    const M = await import('./views/media.js');
    const guard = (perm, fn) => (can(perm) ? fn() : (view.innerHTML = '<p class="empty">এই অংশে প্রবেশের অনুমতি নেই।</p>'));
    switch (parts[0]) {
      case 'dashboard': case '': dashboard(view); break;
      case 'posts': V.postsView(view, query); break;
      case 'post': await V.editorView(view, 'post', parts[1] || 'new'); break;
      case 'pages': guard('pages', () => V.pagesView(view)); break;
      case 'page': guard('pages', () => V.editorView(view, 'page', parts[1] || 'new')); break;
      case 'ayojon': guard('ayojon', () => (parts[1] ? V.editorView(view, 'ayojon', parts[1]) : V.ayojonView(view))); break;
      case 'media': guard('media', () => M.mediaView(view)); break;
      case 'categories': guard('categories', () => Site.categoriesView(view)); break;
      case 'authors': guard('authors', () => Site.authorsView(view)); break;
      case 'menu': guard('menu', () => Site.menuView(view)); break;
      case 'home': guard('home', () => Site.homeView(view)); break;
      case 'styles': guard('styles', () => Site.stylesView(view)); break;
      case 'settings': guard('settings', () => Site.settingsView(view)); break;
      case 'users': guard('users', () => Site.usersView(view)); break;
      case 'comments': guard('comments', () => Site.commentsView(view)); break;
      case 'seo': guard('seo', () => T.seoView(view)); break;
      case 'import': guard('import', () => T.importView(view)); break;
      case 'deploy': guard('deploy', () => T.deployView(view)); break;
      default: view.innerHTML = '<p class="empty">পাতা পাওয়া যায়নি।</p>';
    }
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="notice notice--danger">ত্রুটি: ${esc(e.message)}</div>`;
  }
}

// ==================================================================== ড্যাশবোর্ড
function dashboard(view) {
  const mine = can('others') ? S.posts : S.posts.filter((p) => p.author === S.me?.author);
  const now = new Date();
  const pub = mine.filter((p) => p.status === 'published' && new Date(p.date) <= now);
  const sched = mine.filter((p) => (p.status === 'published' || p.status === 'scheduled') && new Date(p.date) > now);
  const drafts = mine.filter((p) => p.status === 'draft');
  const review = mine.filter((p) => p.status === 'review');
  const words = pub.reduce((s, p) => s + wordCount(p.body), 0);
  // গত ১২ মাস
  const months = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push([`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, MONTHS[d.getMonth()].slice(0, 3)]); }
  const counts = months.map(([k]) => pub.filter((p) => String(p.date).startsWith(k)).length);
  const max = Math.max(1, ...counts);
  const li = (p) => `<div class="list__item"><div class="list__main"><a class="list__title" href="#/post/${encodeURIComponent(p.id)}">${esc(p.title || '(শিরোনামহীন)')}</a><span class="list__meta">${esc(authorName(p.author))} · ${bnDate(p.date, true)}</span></div>${statusBadge(p.status, p.date)}</div>`;
  const hr = now.getHours();
  const greet = hr < 12 ? 'শুভ সকাল' : hr < 17 ? 'শুভ অপরাহ্ণ' : 'শুভ সন্ধ্যা';
  view.innerHTML = `<div class="page-head"><div><h1>${greet}, ${esc((S.user.name || S.user.login || '').split(' ')[0])}</h1><p>আজ ${bnDate(new Date().toISOString())} · কেয়ারির সম্পাদনা কক্ষে স্বাগত</p></div>
    <div class="btn-row"><a class="btn" href="#/post/new">＋ নতুন লেখা</a><a class="btn btn--light" href="${esc(siteUrl('/'))}" target="_blank" rel="noopener">সাইট দেখুন ↗</a></div></div>
    <div class="stats">
      <a class="stat" href="#/posts?status=published"><div class="stat__n">${bn(pub.length)}</div><div class="stat__l">প্রকাশিত লেখা</div></a>
      <a class="stat" href="#/posts?status=review"><div class="stat__n">${bn(review.length)}</div><div class="stat__l">পর্যালোচনার অপেক্ষায়</div></a>
      <a class="stat" href="#/posts?status=draft"><div class="stat__n">${bn(drafts.length)}</div><div class="stat__l">খসড়া</div></a>
      <a class="stat" href="#/posts?status=scheduled"><div class="stat__n">${bn(sched.length)}</div><div class="stat__l">নির্ধারিত</div></a>
      <a class="stat" href="#/authors"><div class="stat__n">${bn(new Set(pub.map((p) => p.author)).size)}</div><div class="stat__l">লেখক</div></a>
      <div class="stat"><div class="stat__n">${bn(Math.round(words / 1000))}k</div><div class="stat__l">প্রকাশিত শব্দ</div></div>
    </div>
    <div class="dash"><div>
      <div class="card"><div class="card__head"><h2 class="card__title">গত ১২ মাসে প্রকাশ</h2></div>
        <div class="bars" style="margin-bottom:26px">${counts.map((c, i) => `<div class="bars__b" style="height:${(c / max) * 100}%" title="${bn(c)}টি"><em>${c ? bn(c) : ''}</em><span>${months[i][1]}</span></div>`).join('')}</div></div>
      ${review.length && can('publish') ? `<div class="card"><div class="card__head"><h2 class="card__title">পর্যালোচনার অপেক্ষায়</h2><a href="#/posts?status=review">সব</a></div><div class="list">${review.slice(0, 6).map(li).join('')}</div></div>` : ''}
      <div class="card"><div class="card__head"><h2 class="card__title">সাম্প্রতিক খসড়া</h2><a href="#/posts?status=draft">সব</a></div><div class="list">${drafts.slice(0, 6).map(li).join('') || '<p class="help">কোনো খসড়া নেই</p>'}</div></div>
      <div class="card"><div class="card__head"><h2 class="card__title">সর্বশেষ প্রকাশিত</h2><a href="#/posts?status=published">সব</a></div><div class="list">${pub.slice(0, 6).map(li).join('')}</div></div>
    </div><div>
      <div class="card"><h2 class="card__title" style="margin-bottom:12px">দ্রুত খসড়া</h2>
        <div class="field"><input class="input" placeholder="শিরোনাম" data-qt></div><div class="field"><textarea class="textarea" placeholder="ভাবনাটা লিখে রাখুন…" data-qb></textarea></div>
        <button class="btn btn--light" data-qs>খসড়া সংরক্ষণ</button></div>
      ${sched.length ? `<div class="card"><h2 class="card__title" style="margin-bottom:8px">নির্ধারিত প্রকাশ</h2><div class="list">${sched.slice(0, 6).map(li).join('')}</div></div>` : ''}
      <div class="card" data-deploy><h2 class="card__title" style="margin-bottom:8px">প্রকাশের অবস্থা</h2><p class="help">${S.be.mode === 'local' ? 'লোকাল মোড — সংরক্ষণেই সাইট তৈরি হয়।' : '<span class="spinner spinner--sm"></span>'}</p></div>
      <div class="card"><h2 class="card__title" style="margin-bottom:8px">দ্রুত লিংক</h2><div class="btn-row">
        <a class="btn btn--light btn--sm" href="#/home">মুখপাতা সাজান</a><a class="btn btn--light btn--sm" href="#/ayojon">আয়োজন</a><a class="btn btn--light btn--sm" href="#/styles">স্টাইল শিট</a><a class="btn btn--light btn--sm" href="#/seo">SEO নিরীক্ষা</a></div></div>
    </div></div>`;
  $('[data-qs]', view).onclick = async () => {
    const t = $('[data-qt]', view).value.trim(), b = $('[data-qb]', view).value.trim();
    if (!t) { toast('শিরোনাম দিন', 'err'); return; }
    const d = { id: uid('p'), title: t, subtitle: '', slug: '', date: nowIso(), modified: nowIso(), status: 'draft', author: S.me?.author || '', translator: '', categories: [], tags: [], cover: { src: '', alt: '', caption: '' }, excerpt: '', body: b.split(/\n{2,}/).map((x) => `<p>${esc(x).replace(/\n/g, '<br>')}</p>`).join(''), series: null, ayojon: '', featured: false, pick: false, comments: true, seo: { title: '', description: '', keyphrase: '', og_image: '', canonical: '', noindex: false }, layout: { justify: true, dropcap: false, toc: false } };
    const path = `content/posts/${d.id}.json`;
    await commit('দ্রুত খসড়া: ' + t, [{ path, text: jsonText(d) }]);
    S.posts.unshift({ ...d, _path: path }); dashboard(view);
  };
  if (S.be.mode !== 'local') S.be.runs().then((runs) => {
    const r = runs[0]; const box = $('[data-deploy] .help', view); if (!box) return;
    if (!r) { box.textContent = 'এখনো কোনো প্রকাশ-রান হয়নি।'; return; }
    const st = r.status !== 'completed' ? ['run', 'সাইট তৈরি হচ্ছে…'] : r.conclusion === 'success' ? ['ok', 'সাইট হালনাগাদ আছে'] : ['err', 'শেষ রান ব্যর্থ — দেখুন'];
    box.innerHTML = `<span class="dot dot--${st[0]}"></span> ${st[1]} · ${bnDate(r.updated, true)} <a href="#/deploy">বিস্তারিত</a>`;
  }).catch(() => { const box = $('[data-deploy] .help', view); if (box) box.textContent = 'অবস্থা দেখা যায়নি (টোকেনে Actions অনুমতি দিন)'; });
}

boot();
