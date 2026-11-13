// সাইট কাঠামো: বিভাগ, লেখক, মেনু, মুখপাতা, স্টাইল শিট, সেটিংস, ব্যবহারকারী, মন্তব্য
import { S, ROLES, can, commit, saveSingle, PATHS, topCats, childCats, catName, imgUrl, imgFallback, siteUrl } from '../state.js';
import { $, $$, esc, bn, toast, modal, confirmBox, slugify, asciiSlug, jsonText, clone, imageChanges, debounce } from '../util.js';
import { stylesToCss } from '../editor.js';
import { pickMedia } from './media.js';

const postCount = (slug) => S.posts.filter((p) => (p.categories || []).includes(slug) && p.status !== 'trash').length;

// ==================================================================== বিভাগ
export function categoriesView(view) {
  const cats = clone(S.categories);
  const draw = () => {
    const rows = [];
    const tops = cats.filter((c) => !c.parent).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    tops.forEach((c) => { rows.push(c); cats.filter((k) => k.parent === c.slug).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).forEach((k) => rows.push(k)); });
    cats.filter((c) => c.parent && !cats.some((t) => t.slug === c.parent)).forEach((c) => rows.push(c));
    view.innerHTML = `<div class="page-head"><div><h1>বিভাগ ও উপ-বিভাগ</h1><p>মেগা মেনু, মুখপাতার বিষয়-পিল ও ঠিকানা (/category/…) এখান থেকে নিয়ন্ত্রিত</p></div>
      <div class="btn-row"><button class="btn btn--light" data-add>＋ নতুন বিভাগ</button><button class="btn" data-save>সংরক্ষণ</button></div></div>
      <div class="notice">স্লাগ (ঠিকানা) বদলালে পুরোনো লিংক ভেঙে যাবে — প্রকাশিত বিভাগের স্লাগ না বদলানোই ভালো। মেগা মেনুর কলাম ১–৩ ও ক্রম অনুযায়ী সাজানো হয়।</div>
      <div class="card" style="padding:0"><div class="table-wrap"><table class="table"><thead><tr><th>আইকন</th><th>নাম</th><th>স্লাগ</th><th>মূল বিভাগ</th><th>কলাম</th><th>ক্রম</th><th>মুখপাতায়</th><th>লেখা</th><th></th></tr></thead><tbody>
      ${rows.map((c) => { const i = cats.indexOf(c); return `<tr>
        <td><input class="input" style="width:56px;text-align:center" data-k="icon" data-i="${i}" value="${esc(c.icon || '')}" ${c.parent ? 'disabled' : ''}></td>
        <td>${c.parent ? '<span class="help">└ </span>' : ''}<input class="input" style="display:inline-block;width:${c.parent ? '160px' : '180px'};font-weight:${c.parent ? 400 : 700}" data-k="name" data-i="${i}" value="${esc(c.name)}"></td>
        <td><input class="input input--mono" style="width:150px" data-k="slug" data-i="${i}" value="${esc(c.slug)}"></td>
        <td><select class="select" data-k="parent" data-i="${i}" style="width:140px"><option value="">— মূল —</option>${cats.filter((t) => !t.parent && t !== c).map((t) => `<option value="${esc(t.slug)}" ${c.parent === t.slug ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></td>
        <td>${c.parent ? '' : `<select class="select" data-k="column" data-i="${i}" style="width:70px">${[1, 2, 3].map((n) => `<option value="${n}" ${+c.column === n ? 'selected' : ''}>${bn(n)}</option>`).join('')}</select>`}</td>
        <td><input class="input" type="number" style="width:70px" data-k="order" data-i="${i}" value="${esc(c.order ?? '')}"></td>
        <td>${c.parent ? '' : `<input type="checkbox" data-k="home_pill" data-i="${i}" ${c.home_pill !== false ? 'checked' : ''} aria-label="মুখপাতায় দেখান">`}</td>
        <td>${bn(postCount(c.slug))}</td>
        <td><button class="btn btn--ghost btn--sm" data-desc="${i}">বিবরণ</button><button class="btn btn--ghost btn--sm" data-del="${i}" aria-label="মুছুন">✕</button></td></tr>`; }).join('')}
      </tbody></table></div></div>`;
    $$('[data-k]', view).forEach((el) => el.addEventListener('change', () => {
      const c = cats[+el.dataset.i], k = el.dataset.k;
      c[k] = el.type === 'checkbox' ? el.checked : k === 'order' || k === 'column' ? +el.value : k === 'parent' ? (el.value || null) : el.value;
      if (k === 'slug') c.slug = slugify(el.value) || asciiSlug(c.name);
      if (k === 'parent' || k === 'order') draw();
    }));
    $$('[data-desc]', view).forEach((b) => (b.onclick = () => {
      const c = cats[+b.dataset.desc];
      const m = modal({ title: `${c.name} — বিবরণ ও SEO`, body: `<div class="field"><label>বিবরণ (বিভাগ পাতায় ও গুগলে)</label><textarea class="textarea" data-d>${esc(c.description || '')}</textarea></div><div class="field"><label>SEO শিরোনাম (ঐচ্ছিক)</label><input class="input" data-t value="${esc(c.seo_title || '')}"></div>`, foot: '<button class="btn" data-ok>ঠিক আছে</button>' });
      $('[data-ok]', m.el).onclick = () => { c.description = $('[data-d]', m.el).value; c.seo_title = $('[data-t]', m.el).value; m.close(); };
    }));
    $$('[data-del]', view).forEach((b) => (b.onclick = async () => {
      const c = cats[+b.dataset.del]; const n = postCount(c.slug);
      if (!(await confirmBox(n ? `"${esc(c.name)}" বিভাগে ${bn(n)}টি লেখা আছে। বিভাগ মুছলে লেখাগুলো থেকে যাবে কিন্তু এই বিভাগের পাতা থাকবে না। মুছবেন?` : `"${esc(c.name)}" মুছবেন?`, { ok: 'মুছুন', danger: true }))) return;
      cats.splice(+b.dataset.del, 1); cats.forEach((x) => { if (x.parent === c.slug) x.parent = null; }); draw();
    }));
    $('[data-add]', view).onclick = () => { cats.push({ slug: 'notun-' + Date.now().toString(36).slice(-4), name: 'নতুন বিভাগ', parent: null, column: 1, order: 99, icon: '•', home_pill: true, description: '' }); draw(); };
    $('[data-save]', view).onclick = async () => {
      const slugs = cats.map((c) => c.slug); const dup = slugs.find((s, i) => slugs.indexOf(s) !== i);
      if (dup) { toast('একই স্লাগ দুবার: ' + dup, 'err'); return; }
      S.categories = cats; await saveSingle('categories', 'বিভাগ হালনাগাদ');
    };
  };
  draw();
}

// ==================================================================== লেখক
export function authorModal(author, onSaved) {
  const a = author ? clone(author) : { slug: '', name: '', bio: '', photo: '', email: '', facebook: '', website: '' };
  const isNew = !author;
  const m = modal({
    title: isNew ? 'নতুন লেখক' : 'লেখক সম্পাদনা',
    body: `<div style="display:grid;grid-template-columns:120px 1fr;gap:18px;align-items:start">
      <div><div class="cover-box" style="aspect-ratio:1;border-radius:50%" data-photo>${a.photo ? `<img src="${esc(imgUrl(a.photo))}" alt="">` : '<span>＋ ছবি</span>'}</div><p class="help" style="text-align:center">বর্গাকার ছবি</p></div>
      <div><div class="field"><label>নাম</label><input class="input" data-k="name" value="${esc(a.name)}"></div>
      <div class="field"><label>স্লাগ (ইংরেজিতে, ঠিকানায় যাবে: /author/…)</label><input class="input input--mono" data-k="slug" value="${esc(a.slug)}" ${isNew ? '' : 'readonly'} placeholder="যেমন: saif-siraj"></div></div></div>
      <div class="field"><label>পরিচিতি (৮০ শব্দের মধ্যে)</label><textarea class="textarea" data-k="bio">${esc(a.bio || '')}</textarea></div>
      <div class="grid3"><div class="field"><label>ইমেইল (প্রকাশ্য)</label><input class="input" data-k="email" value="${esc(a.email || '')}"></div>
      <div class="field"><label>ফেসবুক</label><input class="input" data-k="facebook" value="${esc(a.facebook || '')}"></div>
      <div class="field"><label>ওয়েবসাইট</label><input class="input" data-k="website" value="${esc(a.website || '')}"></div></div>`,
    foot: `<button class="btn btn--light" data-no>বাতিল</button><button class="btn" data-ok>সংরক্ষণ</button>`,
  });
  const ph = $('[data-photo]', m.el); const im = $('img', ph); im && imgFallback(im);
  ph.onclick = async () => { const r = await pickMedia({ title: 'লেখকের ছবি' }); if (r?.url) { a.photo = r.url; ph.innerHTML = `<img src="${esc(imgUrl(r.url))}" alt="">`; imgFallback($('img', ph)); } };
  $$('[data-k]', m.el).forEach((el) => el.addEventListener('input', () => { a[el.dataset.k] = el.value; if (el.dataset.k === 'name' && isNew) { const s = $('[data-k=slug]', m.el); if (!s.dataset.touched) s.value = asciiSlug(el.value) || ''; a.slug = s.value; } if (el.dataset.k === 'slug') el.dataset.touched = 1; }));
  $('[data-no]', m.el).onclick = () => m.close();
  $('[data-ok]', m.el).onclick = async () => {
    a.name = a.name.trim(); a.slug = (a.slug || asciiSlug(a.name) || 'author-' + Date.now().toString(36)).trim();
    if (!a.name) { toast('নাম দিন', 'err'); return; }
    if (isNew && S.authors.some((x) => x.slug === a.slug)) { toast('এই স্লাগে লেখক আগে থেকেই আছে', 'err'); return; }
    const list = clone(S.authors); const i = list.findIndex((x) => x.slug === a.slug);
    if (i > -1) list[i] = a; else list.push(a);
    S.authors = list; await saveSingle('authors', `লেখক: ${a.name}`);
    m.close(); onSaved && onSaved(a);
  };
}

export function authorsView(view) {
  const counts = {}; S.posts.forEach((p) => { if (p.status !== 'trash') counts[p.author] = (counts[p.author] || 0) + 1; });
  let q = '';
  const draw = () => {
    const list = [...S.authors].filter((a) => !q || (a.name + a.slug).toLowerCase().includes(q)).sort((a, b) => (counts[b.slug] || 0) - (counts[a.slug] || 0) || a.name.localeCompare(b.name, 'bn'));
    $('[data-body]', view).innerHTML = list.map((a) => `<tr><td>${a.photo ? `<img class="thumb" style="width:44px;aspect-ratio:1;border-radius:50%" src="${esc(imgUrl(a.photo))}" alt="">` : '<span class="thumb" style="width:44px;aspect-ratio:1;border-radius:50%"></span>'}</td>
      <td><a class="t-title" href="#" data-ed="${esc(a.slug)}">${esc(a.name)}</a><div class="help">${esc((a.bio || '').slice(0, 90))}</div></td><td class="help input--mono">${esc(a.slug)}</td>
      <td><a href="#/posts?author=${encodeURIComponent(a.slug)}">${bn(counts[a.slug] || 0)}টি</a></td>
      <td><button class="btn btn--ghost btn--sm" data-ed="${esc(a.slug)}">সম্পাদনা</button>${!counts[a.slug] ? `<button class="btn btn--ghost btn--sm" data-del="${esc(a.slug)}">✕</button>` : ''}</td></tr>`).join('');
    $$('[data-body] img', view).forEach(imgFallback);
    $$('[data-ed]', view).forEach((b) => (b.onclick = (e) => { e.preventDefault(); authorModal(S.authors.find((x) => x.slug === b.dataset.ed), draw); }));
    $$('[data-del]', view).forEach((b) => (b.onclick = async () => { if (!(await confirmBox('লেখককে তালিকা থেকে মুছবেন?', { danger: true, ok: 'মুছুন' }))) return; S.authors = S.authors.filter((x) => x.slug !== b.dataset.del); await saveSingle('authors', 'লেখক মুছে ফেলা'); draw(); }));
  };
  view.innerHTML = `<div class="page-head"><div><h1>লেখক</h1><p>${bn(S.authors.length)} জন লেখক · ছবি ও পরিচিতি দিলে লেখক পাতা ও লেখার শেষে "লেখক পরিচিতি" সমৃদ্ধ হয়</p></div><button class="btn" data-new>＋ নতুন লেখক</button></div>
    <div class="toolbar"><input class="input grow" placeholder="লেখক খুঁজুন…" data-q></div>
    <div class="card" style="padding:0"><table class="table"><thead><tr><th></th><th>নাম</th><th>স্লাগ</th><th>লেখা</th><th></th></tr></thead><tbody data-body></tbody></table></div>`;
  $('[data-new]', view).onclick = () => authorModal(null, draw);
  $('[data-q]', view).oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
  draw();
}

// ==================================================================== মেনু
export function menuView(view) {
  const menu = clone(S.menu);
  menu.header = menu.header || []; menu.footer = menu.footer || [];
  const linkRow = (it, path) => `<li><span class="grow" style="display:grid;grid-template-columns:1fr 1.4fr auto;gap:8px">
      <input class="input" data-p="${path}" data-k="label" value="${esc(it.label)}" placeholder="লেবেল">
      ${it.type === 'mega' ? '<span class="help" style="align-self:center">মেগা মেনু — বিভাগ থেকে নিজে তৈরি হয়</span>' : `<input class="input input--mono" data-p="${path}" data-k="url" value="${esc(it.url || '')}" placeholder="/ঠিকানা/ বা https://…">`}
      <span class="btn-row"><button class="btn btn--ghost btn--sm" data-up="${path}">↑</button><button class="btn btn--ghost btn--sm" data-rm="${path}">✕</button></span></span></li>`;
  const draw = () => {
    view.innerHTML = `<div class="page-head"><div><h1>মেনু</h1><p>হেডারের প্রধান মেনু ও ফুটারের লিংক</p></div><button class="btn" data-save>সংরক্ষণ</button></div>
      <div class="dash"><div class="card"><div class="card__head"><h2 class="card__title">প্রধান মেনু (হেডার)</h2><button class="btn btn--light btn--sm" data-add-h>＋ আইটেম</button></div>
      <ul class="sortable">${menu.header.map((it, i) => linkRow(it, `h.${i}`) + (it.children ? `<li style="margin-left:28px;display:block;background:var(--highlight)"><p class="help" style="margin:0 0 6px">"${esc(it.label)}"-এর ড্রপডাউন</p><ul class="sortable">${it.children.map((c, j) => linkRow(c, `h.${i}.${j}`)).join('')}</ul><button class="btn btn--ghost btn--sm" data-add-c="${i}" style="margin-top:6px">＋ উপ-আইটেম</button></li>` : `<li style="margin-left:28px;background:none;border:0;padding:0">${it.type === 'mega' ? '' : `<button class="btn btn--ghost btn--sm" data-add-c="${i}">＋ ড্রপডাউন যোগ</button>`}</li>`)).join('')}</ul></div>
      <div class="card"><div class="card__head"><h2 class="card__title">ফুটার কলাম</h2><button class="btn btn--light btn--sm" data-add-f>＋ কলাম</button></div>
      ${menu.footer.map((col, i) => `<div style="margin-bottom:16px"><div class="btn-row" style="margin-bottom:6px"><input class="input" data-fc="${i}" value="${esc(col.title)}" style="flex:1;font-weight:700"><button class="btn btn--ghost btn--sm" data-rm-f="${i}">✕</button></div>
        <ul class="sortable">${(col.links || []).map((l, j) => linkRow(l, `f.${i}.${j}`)).join('')}</ul><button class="btn btn--ghost btn--sm" data-add-fl="${i}">＋ লিংক</button></div>`).join('')}
      <p class="help">"বিভাগসমূহ" ও "লেখা পাঠান" কলাম ফুটারে নিজে থেকে থাকে।</p></div></div>`;
    const resolve = (path) => { const [g, a, b] = path.split('.'); if (g === 'h') return b !== undefined ? [menu.header[+a].children, +b] : [menu.header, +a]; return [menu.footer[+a].links, +b]; };
    $$('[data-p]', view).forEach((el) => el.addEventListener('input', () => { const [arr, i] = resolve(el.dataset.p); arr[i][el.dataset.k] = el.value; }));
    $$('[data-up]', view).forEach((b) => (b.onclick = () => { const [arr, i] = resolve(b.dataset.up); if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; draw(); } }));
    $$('[data-rm]', view).forEach((b) => (b.onclick = () => { const [arr, i] = resolve(b.dataset.rm); arr.splice(i, 1); if (b.dataset.rm.split('.').length === 3 && b.dataset.rm[0] === 'h') { const p = menu.header[+b.dataset.rm.split('.')[1]]; if (p.children && !p.children.length) delete p.children; } draw(); }));
    $('[data-add-h]', view).onclick = () => { menu.header.push({ label: 'নতুন', url: '/' }); draw(); };
    $$('[data-add-c]', view).forEach((b) => (b.onclick = () => { const it = menu.header[+b.dataset.addC]; it.children = it.children || []; it.children.push({ label: 'নতুন', url: '/' }); draw(); }));
    $('[data-add-f]', view).onclick = () => { menu.footer.push({ title: 'নতুন কলাম', links: [] }); draw(); };
    $$('[data-add-fl]', view).forEach((b) => (b.onclick = () => { menu.footer[+b.dataset.addFl].links.push({ label: 'নতুন', url: '/' }); draw(); }));
    $$('[data-rm-f]', view).forEach((b) => (b.onclick = () => { menu.footer.splice(+b.dataset.rmF, 1); draw(); }));
    $$('[data-fc]', view).forEach((el) => el.addEventListener('input', () => { menu.footer[+el.dataset.fc].title = el.value; }));
    $('[data-save]', view).onclick = async () => { S.menu = menu; await saveSingle('menu', 'মেনু হালনাগাদ'); };
  };
  draw();
}

// ==================================================================== মুখপাতা বিন্যাস
const SECTION_NAMES = { hero: 'হিরো (বড় লেখা + পাশে ৩টি)', category_pills: 'বিষয়-পিল', ayojon: 'চলমান আয়োজন ব্যানার', feed: 'সর্বশেষ লেখা + সাইডবার', category_blocks: 'বিভাগভিত্তিক ব্লক', series: 'ধারাবাহিক', authors: 'লেখক পরিচিতি', cta: '"লেখা পাঠান" আহ্বান' };
export function homeView(view) {
  const h = clone(S.home); h.hero = h.hero || {}; h.slider = h.slider || {}; h.sections = h.sections || [];
  const published = S.posts.filter((p) => p.status === 'published');
  const opt = (sel) => `<option value="">— স্বয়ংক্রিয় —</option>` + published.slice(0, 200).map((p) => `<option value="${esc(p.id)}" ${sel === p.id ? 'selected' : ''}>${esc(p.title)}</option>`).join('');
  const draw = () => {
    view.innerHTML = `<div class="page-head"><div><h1>মুখপাতার বিন্যাস</h1><p>কোন অংশ কোথায়, কোন লেখা হিরোতে — সব এখান থেকে</p></div><div class="btn-row"><a class="btn btn--light" target="_blank" href="${esc(siteUrl('/'))}">মুখপাতা দেখুন ↗</a><button class="btn" data-save>সংরক্ষণ</button></div></div>
    <div class="dash"><div>
      <div class="card"><h2 class="card__title" style="margin-bottom:12px">অংশের ক্রম ও দৃশ্যমানতা</h2><ul class="sortable">${h.sections.map((s, i) => `<li><label class="check grow"><input type="checkbox" data-en="${i}" ${s.enabled !== false ? 'checked' : ''}> <b>${esc(SECTION_NAMES[s.type] || s.type)}</b></label>
        ${'title' in s || ['category_pills', 'feed', 'series', 'authors', 'cta'].includes(s.type) ? `<input class="input" style="max-width:220px" data-title="${i}" value="${esc(s.title || '')}" placeholder="শিরোনাম">` : ''}
        <button class="btn btn--ghost btn--sm" data-up="${i}">↑</button></li>`).join('')}</ul>
        <p class="help" style="margin-top:8px">বর্তমান সাইটে অংশগুলো একটি নির্দিষ্ট ক্রমে আসে; এখানে চালু/বন্ধ ও শিরোনাম বদলানো যায়।</p></div>
      <div class="card"><h2 class="card__title" style="margin-bottom:12px">বিভাগভিত্তিক ব্লক</h2>
        <div class="grid3">${topCats().map((c) => { const cb = h.sections.find((s) => s.type === 'category_blocks') || {}; return `<label class="check"><input type="checkbox" data-cb="${c.slug}" ${(cb.categories || []).includes(c.slug) ? 'checked' : ''}> ${esc(c.name)}</label>`; }).join('')}</div>
        <div class="field" style="margin-top:10px"><label>প্রতিটিতে লেখা</label><input class="input" type="number" min="2" max="8" data-cbn value="${esc((h.sections.find((s) => s.type === 'category_blocks') || {}).count || 4)}" style="max-width:100px"></div>
        <div class="field"><label>"লেখা পাঠান" অংশের বার্তা</label><textarea class="textarea" data-cta>${esc((h.sections.find((s) => s.type === 'cta') || {}).text || '')}</textarea></div></div>
    </div><div>
      <div class="card"><h2 class="card__title" style="margin-bottom:12px">হিরো</h2>
        <div class="field"><label>পদ্ধতি</label><select class="select" data-hm><option value="auto" ${h.hero.mode !== 'manual' ? 'selected' : ''}>স্বয়ংক্রিয়</option><option value="manual" ${h.hero.mode === 'manual' ? 'selected' : ''}>নিজে বাছাই</option></select></div>
        <div data-auto ${h.hero.mode === 'manual' ? 'hidden' : ''}><div class="field"><label>বড় লেখা আসবে এই বিভাগের সর্বশেষ লেখা থেকে</label><select class="select" data-hc>${topCats().map((c) => `<option value="${c.slug}" ${h.hero.main_category === c.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div><p class="help">পাশের ৩টি = সর্বশেষ ৩টি লেখা।</p></div>
        <div data-manual ${h.hero.mode === 'manual' ? '' : 'hidden'}><div class="field"><label>বড় লেখা</label><select class="select" data-main>${opt(h.hero.main)}</select></div>
        ${[0, 1, 2].map((i) => `<div class="field"><label>পাশের লেখা ${bn(i + 1)}</label><select class="select" data-side="${i}">${opt((h.hero.side || [])[i])}</select></div>`).join('')}</div></div>
      <div class="card"><h2 class="card__title" style="margin-bottom:12px">স্লাইডার (সাইডবার)</h2>
        <div class="field"><label>শিরোনাম</label><input class="input" data-st value="${esc(h.slider.title || 'পাঠকের পছন্দ')}"></div>
        <div class="field"><label>উৎস</label><select class="select" data-sm><option value="picks" ${h.slider.mode !== 'latest' ? 'selected' : ''}>★ পাঠকের পছন্দ চিহ্নিত লেখা (না থাকলে সর্বশেষ)</option><option value="latest" ${h.slider.mode === 'latest' ? 'selected' : ''}>সর্বশেষ লেখা</option></select></div>
        <div class="field"><label>স্লাইড সংখ্যা</label><input class="input" type="number" min="3" max="10" data-sc value="${esc(h.slider.count || 5)}"></div></div>
    </div></div>`;
    $$('[data-en]', view).forEach((el) => (el.onchange = () => { h.sections[+el.dataset.en].enabled = el.checked; }));
    $$('[data-title]', view).forEach((el) => (el.oninput = () => { h.sections[+el.dataset.title].title = el.value; }));
    $$('[data-up]', view).forEach((b) => (b.onclick = () => { const i = +b.dataset.up; if (i > 0) { [h.sections[i - 1], h.sections[i]] = [h.sections[i], h.sections[i - 1]]; draw(); } }));
    const cbSec = () => { let s = h.sections.find((x) => x.type === 'category_blocks'); if (!s) { s = { type: 'category_blocks', enabled: true, categories: [], count: 4 }; h.sections.push(s); } return s; };
    $$('[data-cb]', view).forEach((el) => (el.onchange = () => { const s = cbSec(); s.categories = $$('[data-cb]', view).filter((x) => x.checked).map((x) => x.dataset.cb); }));
    $('[data-cbn]', view).oninput = (e) => { cbSec().count = +e.target.value || 4; };
    $('[data-cta]', view).oninput = (e) => { const s = h.sections.find((x) => x.type === 'cta'); if (s) s.text = e.target.value; };
    $('[data-hm]', view).onchange = (e) => { h.hero.mode = e.target.value; $('[data-auto]', view).hidden = h.hero.mode === 'manual'; $('[data-manual]', view).hidden = h.hero.mode !== 'manual'; };
    $('[data-hc]', view).onchange = (e) => { h.hero.main_category = e.target.value; };
    $('[data-main]', view).onchange = (e) => { h.hero.main = e.target.value; };
    $$('[data-side]', view).forEach((el) => (el.onchange = () => { h.hero.side = $$('[data-side]', view).map((x) => x.value).filter(Boolean); }));
    $('[data-st]', view).oninput = (e) => { h.slider.title = e.target.value; };
    $('[data-sm]', view).onchange = (e) => { h.slider.mode = e.target.value; };
    $('[data-sc]', view).oninput = (e) => { h.slider.count = +e.target.value || 5; };
    $('[data-save]', view).onclick = async () => { S.home = h; await saveSingle('home', 'মুখপাতার বিন্যাস হালনাগাদ'); };
  };
  draw();
}

// ==================================================================== স্টাইল শিট (InDesign-এর মতো)
const PROPS = ['font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-align-last', 'text-indent', 'text-transform', 'text-decoration', 'text-underline-offset', 'white-space', 'hyphens',
  'color', 'background', 'background-color', 'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'padding', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
  'border', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-radius', 'border-collapse', 'border-spacing', 'box-shadow', 'width', 'max-width', 'column-count', 'column-gap', 'column-rule', 'break-inside', 'orphans', 'widows', 'vertical-align', 'font-variant-numeric', 'opacity'];
const KIND_LABEL = { paragraph: ['অনুচ্ছেদ স্টাইল', 'ps-', 'p'], character: ['অক্ষর স্টাইল', 'cs-', 'span'], table: ['টেবিল স্টাইল', 'ts-', 'table'], cell: ['সেল স্টাইল', 'tc-', 'td'] };
export function stylesView(view) {
  const st = clone(S.styles); ['paragraph', 'character', 'table', 'cell'].forEach((k) => (st[k] = st[k] || []));
  let kind = 'paragraph', idx = 0;
  const sample = () => {
    const s = st[kind][idx]; if (!s) return '';
    const cls = KIND_LABEL[kind][1] + s.id;
    if (kind === 'paragraph') return `<p>আগের অনুচ্ছেদ — সাধারণ লেখা, যাতে তুলনা করা যায়। কেয়ারি মনন ও চিন্তনের এক নিবিড় ঠিকানা।</p><p class="${cls}">মাথার কেশদামে সযত্নে কাটা হয় যে সিঁথি, তার নাম কেয়ারি। শখের বাগানে বাখারির বেড়ায় বিশেষিত যে অংশ, তারও নাম কেয়ারি। প্রিয় মানুষ, প্রিয় জিনিসের প্রতি যে প্রেম-প্রযত্ন, তাতেও থাকে কেয়ারির ছাপ।</p><p>পরের অনুচ্ছেদ — সাধারণ লেখা।</p>`;
    if (kind === 'character') return `<p>শিল্পের সুষমা, <span class="${cls}">সাহিত্যের ব্যঞ্জনা</span>, চিন্তার উদ্ভাস, ঐতিহ্যের আকর—এই তার চারকোনা শামিয়ানা।</p>`;
    if (kind === 'table') return `<table class="${cls}"><thead><tr><th>বিভাগ</th><th>শব্দসীমা</th><th>মন্তব্য</th></tr></thead><tbody><tr><td>রচনাবলি</td><td>৫০০০</td><td>ফিচারে ৩০০০</td></tr><tr><td>গদ্যলেখা</td><td>৫০০০</td><td>মুক্তগদ্যে ৩০০০</td></tr><tr><td>কথাসাহিত্য</td><td>৫০০০</td><td>কিস্তিতে ৪০০০</td></tr></tbody></table>`;
    return `<table class="ts-basic"><tr><td>সাধারণ সেল</td><td class="${cls}">এই স্টাইলের সেল</td></tr></table>`;
  };
  const draw = () => {
    const list = st[kind]; const s = list[idx];
    view.innerHTML = `<div class="page-head"><div><h1>স্টাইল শিট</h1><p>InDesign-এর Paragraph/Character Styles-এর মতো — একবার সংজ্ঞায়িত করুন, সব লেখায় এক ক্লিকে প্রয়োগ করুন। স্টাইল বদলালে সব লেখায় একসাথে বদলাবে।</p></div><button class="btn" data-save>সংরক্ষণ</button></div>
    <div class="tabs">${Object.entries(KIND_LABEL).map(([k, [l]]) => `<button class="tab ${k === kind ? 'is-active' : ''}" data-kind="${k}">${l} (${bn(st[k].length)})</button>`).join('')}</div>
    <div class="style-layout"><div class="card"><div class="style-list">${list.map((x, i) => `<button class="${i === idx ? 'is-active' : ''}" data-i="${i}"><span>${esc(x.name)}</span><code>${KIND_LABEL[kind][1]}${esc(x.id)}</code></button>`).join('')}</div>
      <div class="btn-row" style="margin-top:12px"><button class="btn btn--light btn--sm" data-new>＋ নতুন</button>${s ? '<button class="btn btn--light btn--sm" data-dup>অনুলিপি</button><button class="btn btn--light btn--sm" data-del style="color:var(--danger)">মুছুন</button>' : ''}</div></div>
    ${s ? `<div><div class="card"><div class="grid2"><div class="field"><label>নাম</label><input class="input" data-name value="${esc(s.name)}"></div><div class="field"><label>আইডি (ক্লাস: ${KIND_LABEL[kind][1]}…)</label><input class="input input--mono" data-id value="${esc(s.id)}"></div></div>
      <p class="label">বৈশিষ্ট্য (CSS)</p><div data-props>${Object.entries(s.css || {}).map(([k, v], i) => `<div class="prop-row"><input class="input input--mono" list="css-props" data-pk="${i}" value="${esc(k)}"><input class="input input--mono" data-pv="${i}" value="${esc(v)}"><button class="btn btn--ghost btn--sm" data-prm="${i}">✕</button></div>`).join('')}</div>
      <datalist id="css-props">${PROPS.map((p) => `<option value="${p}">`).join('')}</datalist>
      <button class="btn btn--light btn--sm" data-padd>＋ বৈশিষ্ট্য</button>
      <div class="field" style="margin-top:14px"><label>উন্নত CSS (ঐচ্ছিক) — <code>&amp;</code> = এই স্টাইল। যেমন <code>&amp;::first-letter{…}</code> বা <code>&amp; td{…}</code></label><textarea class="textarea input--mono" data-extra>${esc(s.extra || '')}</textarea></div>
      <p class="help">রঙে থিমের ভ্যারিয়েবল ব্যবহার করা যায়: <code>var(--accent)</code> সবুজ, <code>var(--text-muted)</code> ধূসর, <code>var(--line)</code> বিভাজক, <code>var(--highlight)</code> হালকা পটভূমি — ডার্ক মোডেও মানানসই থাকে।</p></div>
      <div class="card"><p class="label" style="margin-bottom:10px">প্রিভিউ</p><style data-pcss></style><div class="style-preview entry-content" data-prev>${sample()}</div></div></div>` : '<div class="card empty">একটি স্টাইল বাছুন বা নতুন যোগ করুন</div>'}</div>`;
    const prevCss = () => { const el = $('[data-pcss]', view); if (el) el.textContent = stylesToCss(st).replace(/(^|\})\s*([^{}]+)\{/g, (m, a, sel) => `${a} ${sel.split(',').map((x) => '.style-preview ' + x.trim()).join(',')}{`); };
    prevCss();
    $$('[data-kind]', view).forEach((b) => (b.onclick = () => { kind = b.dataset.kind; idx = 0; draw(); }));
    $$('[data-i]', view).forEach((b) => (b.onclick = () => { idx = +b.dataset.i; draw(); }));
    $('[data-new]', view).onclick = () => { list.push({ id: 'notun-' + Date.now().toString(36).slice(-3), name: 'নতুন স্টাইল', css: kind === 'paragraph' ? { 'text-align': 'left' } : { color: 'var(--accent)' } }); idx = list.length - 1; draw(); };
    if (!s) return;
    $('[data-dup]', view).onclick = () => { const c = clone(s); c.id += '-2'; c.name += ' (অনুলিপি)'; list.splice(idx + 1, 0, c); idx++; draw(); };
    $('[data-del]', view).onclick = async () => { if (!(await confirmBox(`"${esc(s.name)}" মুছলে যেসব লেখায় এটি ব্যবহৃত, সেখানে স্টাইল আর কাজ করবে না। মুছবেন?`, { danger: true, ok: 'মুছুন' }))) return; list.splice(idx, 1); idx = Math.max(0, idx - 1); draw(); };
    $('[data-name]', view).oninput = (e) => { s.name = e.target.value; };
    $('[data-id]', view).onchange = (e) => { s.id = asciiSlug(e.target.value) || s.id; e.target.value = s.id; draw(); };
    const readProps = () => { const css = {}; $$('[data-pk]', view).forEach((k) => { const v = $(`[data-pv="${k.dataset.pk}"]`, view).value.trim(); if (k.value.trim()) css[k.value.trim()] = v; }); s.css = css; prevCss(); };
    $$('[data-pk], [data-pv]', view).forEach((el) => el.addEventListener('input', debounce(readProps, 200)));
    $$('[data-prm]', view).forEach((b) => (b.onclick = () => { const keys = Object.keys(s.css); delete s.css[keys[+b.dataset.prm]]; draw(); }));
    $('[data-padd]', view).onclick = () => { s.css = { ...(s.css || {}), '': '' }; draw(); };
    $('[data-extra]', view).oninput = debounce((e) => { s.extra = e.target.value; prevCss(); }, 250);
    $('[data-save]', view).onclick = async () => {
      Object.values(st).forEach((arr) => Array.isArray(arr) && arr.forEach((x) => { if (x.css) delete x.css['']; }));
      S.styles = st; await saveSingle('styles', 'স্টাইল শিট হালনাগাদ');
    };
  };
  draw();
}

// ==================================================================== সেটিংস
export function settingsView(view) {
  const s = clone(S.settings);
  s.seo = s.seo || {}; s.social = s.social || {}; s.comments = s.comments || { provider: 'none' }; s.reading = s.reading || {};
  ['giscus', 'cusdis', 'disqus'].forEach((k) => (s.comments[k] = s.comments[k] || {}));
  const f = (path, label, help = '', type = 'text', ph = '') => {
    const v = path.split('.').reduce((o, k) => (o || {})[k], s) ?? '';
    return `<div class="field"><label>${label}</label>${type === 'textarea' ? `<textarea class="textarea" data-path="${path}" placeholder="${esc(ph)}">${esc(v)}</textarea>` : `<input class="input" type="${type}" data-path="${path}" value="${esc(v)}" placeholder="${esc(ph)}">`}${help ? `<p class="help">${help}</p>` : ''}</div>`;
  };
  let tab = 'general';
  const draw = () => {
    const tabs = { general: 'সাধারণ', brand: 'লোগো ও ব্র্যান্ড', seo: 'SEO ও অ্যানালিটিক্স', social: 'সোশ্যাল', comments: 'মন্তব্য', reading: 'পাঠ ও প্রদর্শন', domain: 'ডোমেইন' };
    let body = '';
    if (tab === 'general') body = f('site_name', 'সাইটের নাম') + f('site_name_en', 'ইংরেজি নাম') + f('tagline', 'ট্যাগলাইন') + f('description', 'সাইটের বর্ণনা (গুগল ও শেয়ারে)', '১৫০–১৬০ অক্ষর আদর্শ', 'textarea') + `<div class="grid2">${f('editor_name', 'সম্পাদকের নাম')}${f('email', 'যোগাযোগ ইমেইল', '', 'email')}</div>` + f('footer_notice', 'ফুটারের স্বত্ব-বার্তা', '', 'textarea') + f('copyright_start', 'স্বত্বের শুরুর সাল', '', 'number');
    if (tab === 'brand') body = imgField('logo', 'লোগো (স্বচ্ছ PNG/SVG, ৬৭×৪০ অনুপাত)') + imgField('logo_dark', 'ডার্ক মোডের লোগো (ঐচ্ছিক — হালকা রঙের)') + imgField('favicon', 'ফেভিকন (বর্গাকার)') + imgField('default_og_image', 'ডিফল্ট শেয়ার ছবি (১২০০×৬৩০)');
    if (tab === 'seo') body = `<div class="notice">সাইটটি আগে থেকেই SEO-বান্ধব: প্রতি পাতায় আলাদা শিরোনাম ও বর্ণনা, Open Graph, Article/Breadcrumb স্কিমা, sitemap.xml, news-sitemap.xml, robots.txt, RSS ও দ্রুত লোড।</div>` +
      f('seo.title_separator', 'শিরোনামের বিভাজক', 'যেমন: আগুনের জল — সমর ইসলাম | কেয়ারি') + f('seo.keywords', 'সাইটের মূল বিষয়/কিওয়ার্ড') +
      `<div class="grid2">${f('seo.google_analytics', 'Google Analytics আইডি', 'G-XXXXXXX')}${f('seo.google_site_verification', 'Google Search Console যাচাই কোড', 'HTML ট্যাগ পদ্ধতির content="…" অংশ')}${f('seo.bing_site_verification', 'Bing যাচাই কোড')}${f('seo.facebook_app_id', 'Facebook App ID')}${f('seo.twitter_handle', 'X/Twitter হ্যান্ডল', '', 'text', '@keyari')}</div>`;
    if (tab === 'social') body = f('facebook', 'ফেসবুক পেজ', 'ফুটারের ফেসবুক আইকন ও লেখা শেয়ারে ব্যবহৃত', 'url') + f('app_url', '"অ্যাপে পড়ুন" বোতামের লিংক', 'হেডারের সবুজ বোতাম এখানে যায় (যেমন Play Store বা অ্যাপ ডাউনলোডের ঠিকানা)', 'url') + `<div class="grid2">${f('social.x', 'X / Twitter', '', 'url')}${f('social.youtube', 'YouTube', '', 'url')}${f('social.instagram', 'Instagram', '', 'url')}${f('social.whatsapp', 'WhatsApp চ্যানেল', '', 'url')}</div>`;
    if (tab === 'comments') body = `<div class="field"><label>মন্তব্য ব্যবস্থা</label><select class="select" data-path="comments.provider">${[['none', 'নেই — ইমেইল/ফেসবুকে মতামত বোতাম'], ['cusdis', 'Cusdis (প্রস্তাবিত: বিনামূল্যে, অ্যাকাউন্ট ছাড়াই মন্তব্য, মডারেশনসহ)'], ['giscus', 'Giscus (GitHub Discussions — পাঠকের GitHub অ্যাকাউন্ট লাগে)'], ['disqus', 'Disqus'], ['facebook', 'Facebook Comments']].map(([v, l]) => `<option value="${v}" ${s.comments.provider === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="grid2"><div class="card"><b>Cusdis</b>${f('comments.cusdis.app_id', 'App ID', 'cusdis.com-এ ফ্রি অ্যাকাউন্ট → নতুন ওয়েবসাইট → App ID')}${f('comments.cusdis.host', 'হোস্ট', 'ডিফল্ট: https://cusdis.com')}</div>
      <div class="card"><b>Giscus</b>${f('comments.giscus.repo', 'রিপো (owner/name)')}${f('comments.giscus.repo_id', 'Repo ID')}${f('comments.giscus.category', 'Category')}${f('comments.giscus.category_id', 'Category ID')}<p class="help">giscus.app থেকে মানগুলো নিন</p></div>
      <div class="card"><b>Disqus</b>${f('comments.disqus.shortname', 'Shortname')}</div></div>`;
    if (tab === 'reading') body = `<div class="grid2">${f('posts_per_page', 'মুখপাতায় প্রতি পাতায় লেখা', '', 'number')}${f('archive_per_page', 'বিভাগ/লেখক পাতায় প্রতি পাতায় লেখা', '', 'number')}${f('reading.words_per_minute', 'পড়ার গতি (শব্দ/মিনিট)', '"৮ মিনিটের পাঠ" হিসাবের জন্য', 'number')}${f('reading.font_size', 'লেখার ডিফল্ট ফন্ট সাইজ (px)', '', 'number')}</div>`;
    if (tab === 'domain') body = f('site_url', 'সাইটের পূর্ণ ঠিকানা', 'যেমন https://thekeyari.com — ক্যানোনিকাল, সাইটম্যাপ ও শেয়ারে ব্যবহৃত', 'url') + f('custom_domain', 'কাস্টম ডোমেইন (GitHub Pages)', 'যেমন thekeyari.com — দিলে CNAME ফাইল তৈরি হবে। ডোমেইনের DNS-এ GitHub Pages-এর A রেকর্ড দিতে হবে (README দেখুন)।');
    view.innerHTML = `<div class="page-head"><div><h1>সেটিংস</h1></div><button class="btn" data-save>সংরক্ষণ</button></div>
      <div class="tabs">${Object.entries(tabs).map(([k, l]) => `<button class="tab ${k === tab ? 'is-active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div class="card" style="max-width:900px">${body}</div>`;
    $$('[data-tab]', view).forEach((b) => (b.onclick = () => { tab = b.dataset.tab; draw(); }));
    $$('[data-path]', view).forEach((el) => el.addEventListener('input', () => setPath(s, el.dataset.path, el.type === 'number' ? +el.value : el.value)));
    $$('[data-img-key]', view).forEach((b) => (b.onclick = async () => { const r = await pickMedia(); if (r?.url) { s[b.dataset.imgKey] = r.url; draw(); } }));
    $$('[data-img-clear]', view).forEach((b) => (b.onclick = () => { s[b.dataset.imgClear] = ''; draw(); }));
    $$('img', view).forEach(imgFallback);
    $('[data-save]', view).onclick = async () => { S.settings = s; await saveSingle('settings', 'সেটিংস হালনাগাদ'); };
  };
  const imgField = (k, label) => `<div class="field"><label>${label}</label><div class="btn-row">${s[k] ? `<img src="${esc(imgUrl(s[k]))}" alt="" style="max-height:60px;max-width:200px;background:var(--highlight);border-radius:8px;padding:6px">` : ''}<button class="btn btn--light btn--sm" data-img-key="${k}">বাছুন / আপলোড</button>${s[k] ? `<button class="btn btn--ghost btn--sm" data-img-clear="${k}">সরান</button>` : ''}</div><input class="input input--mono" data-path="${k}" value="${esc(s[k] || '')}" style="margin-top:6px"></div>`;
  draw();
}
function setPath(o, path, v) { const ks = path.split('.'); let c = o; ks.slice(0, -1).forEach((k) => { c[k] = c[k] || {}; c = c[k]; }); c[ks[ks.length - 1]] = v; }

// ==================================================================== ব্যবহারকারী ও ভূমিকা
export function usersView(view) {
  const u = clone(S.users); u.users = u.users || [];
  const draw = () => {
    view.innerHTML = `<div class="page-head"><div><h1>ব্যবহারকারী ও ভূমিকা</h1><p>কে কী করতে পারবেন</p></div><div class="btn-row"><button class="btn btn--light" data-add>＋ ব্যবহারকারী</button><button class="btn" data-save>সংরক্ষণ</button></div></div>
    <div class="notice"><b>কীভাবে নতুন সম্পাদক যোগ করবেন:</b> (১) GitHub রিপোর Settings → Collaborators-এ তার GitHub অ্যাকাউন্ট যোগ করুন; (২) তিনি নিজের GitHub-এ একটি টোকেন বানিয়ে এই প্যানেলে ঢুকবেন; (৩) নিচে তার GitHub ইউজারনেম ও ভূমিকা দিন। "লেখক"/"অবদানকারী" ভূমিকায় নিজের লেখক-প্রোফাইল জুড়ে দিন — তিনি শুধু নিজের লেখা দেখবেন।</div>
    <div class="card" style="padding:0"><table class="table"><thead><tr><th>GitHub ইউজারনেম</th><th>নাম</th><th>ভূমিকা</th><th>লেখক-প্রোফাইল</th><th></th></tr></thead><tbody>
    ${u.users.map((x, i) => `<tr><td><input class="input input--mono" data-i="${i}" data-k="github" value="${esc(x.github)}" placeholder="* = সবাই"></td><td><input class="input" data-i="${i}" data-k="name" value="${esc(x.name || '')}"></td>
      <td><select class="select" data-i="${i}" data-k="role">${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${x.role === k ? 'selected' : ''}>${r.name}</option>`).join('')}</select></td>
      <td><select class="select" data-i="${i}" data-k="author"><option value="">—</option>${S.authors.map((a) => `<option value="${esc(a.slug)}" ${x.author === a.slug ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></td>
      <td><button class="btn btn--ghost btn--sm" data-rm="${i}">✕</button></td></tr>`).join('')}</tbody></table></div>
    <div class="card"><h2 class="card__title">ভূমিকার অনুমতি</h2><ul>
      <li><b>প্রশাসক</b> — সবকিছু: সেটিংস, ব্যবহারকারী, আমদানি</li>
      <li><b>সম্পাদক</b> — সবার লেখা, প্রকাশ, পাতা, আয়োজন, বিভাগ, লেখক, মেনু, মুখপাতা, স্টাইল শিট</li>
      <li><b>লেখক</b> — নিজের লেখা লেখা ও প্রকাশ, মিডিয়া</li>
      <li><b>অবদানকারী</b> — নিজের লেখা লেখা ও পর্যালোচনায় পাঠানো (প্রকাশ নয়)</li></ul>
      <p class="help">নোট: এই ভূমিকা প্যানেলের ভেতরে প্রযোজ্য। রিপোতে লেখার মূল অনুমতি GitHub কোলাবোরেটর সেটিং থেকেই আসে।</p></div>`;
    $$('[data-k]', view).forEach((el) => el.addEventListener('input', () => { u.users[+el.dataset.i][el.dataset.k] = el.value; }));
    $$('[data-rm]', view).forEach((b) => (b.onclick = () => { u.users.splice(+b.dataset.rm, 1); draw(); }));
    $('[data-add]', view).onclick = () => { u.users.push({ github: '', name: '', role: 'author' }); draw(); };
    $('[data-save]', view).onclick = async () => { S.users = u; await saveSingle('users', 'ব্যবহারকারী হালনাগাদ'); };
  };
  draw();
}

// ==================================================================== মন্তব্য
export function commentsView(view) {
  const c = S.settings.comments || {};
  const p = c.provider || 'none';
  const links = {
    cusdis: ['Cusdis ড্যাশবোর্ডে মন্তব্য অনুমোদন/মুছুন', 'https://cusdis.com/dashboard'],
    giscus: ['GitHub Discussions-এ মন্তব্য দেখুন', c.giscus?.repo ? `https://github.com/${c.giscus.repo}/discussions` : 'https://giscus.app'],
    disqus: ['Disqus মডারেশন', c.disqus?.shortname ? `https://${c.disqus.shortname}.disqus.com/admin/moderate/` : 'https://disqus.com/admin/'],
    facebook: ['Facebook মন্তব্য মডারেশন', 'https://developers.facebook.com/tools/comments/'],
  };
  view.innerHTML = `<div class="page-head"><div><h1>মন্তব্য</h1><p>পাঠকের মন্তব্য ব্যবস্থাপনা</p></div><a class="btn btn--light" href="#/settings">মন্তব্যের সেটিংস</a></div>
    ${p === 'none' ? `<div class="notice notice--warn">এখন কোনো মন্তব্য ব্যবস্থা চালু নেই — লেখার নিচে "ইমেইলে/ফেসবুকে মতামত" বোতাম দেখায়।<br><br><b>প্রস্তাবনা:</b> <a href="https://cusdis.com" target="_blank" rel="noopener">Cusdis</a> — বিনামূল্যে, পাঠককে অ্যাকাউন্ট খুলতে হয় না, প্রতিটি মন্তব্য আপনি অনুমোদন দিলে প্রকাশ হয়, ইমেইলে নোটিফিকেশন আসে। সেটিংস → মন্তব্য-এ App ID দিলেই চালু।</div>`
    : `<div class="card"><p>সক্রিয়: <b>${esc(p)}</b></p><p class="help">স্ট্যাটিক সাইটের মন্তব্য একটি বাইরের সেবায় জমা থাকে; সেখান থেকেই অনুমোদন, মুছে ফেলা ও উত্তর দেওয়া হয়।</p><a class="btn" target="_blank" rel="noopener" href="${esc(links[p]?.[1] || '#')}">${esc(links[p]?.[0] || 'মডারেশন')} ↗</a></div>`}
    <div class="card"><h2 class="card__title">লেখাভিত্তিক মন্তব্য নিয়ন্ত্রণ</h2><p class="help">মন্তব্য বন্ধ আছে এমন লেখা: ${bn(S.posts.filter((x) => x.comments === false).length)}টি। লেখা সম্পাদকের "প্রকাশ" প্যানেলে "মন্তব্য চালু" টিক দিয়ে বদলানো যায়।</p></div>`;
}
