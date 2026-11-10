// সরঞ্জাম: SEO নিরীক্ষা, আমদানি/রপ্তানি, প্রকাশের অবস্থা
import { S, commit, cleanDoc, siteUrl, authorName, catName, statusBadge } from '../state.js';
import { $, $$, esc, bn, bnDate, toast, confirmBox, jsonText, download, stripTags, wordCount, postPath, slugify } from '../util.js';

// ==================================================================== SEO নিরীক্ষা
export function seoView(view) {
  const pub = S.posts.filter((p) => p.status === 'published');
  const issues = pub.map((p) => {
    const t = []; const text = stripTags(p.body || '');
    if (!p.cover?.src) t.push('কভার ছবি নেই');
    else if (!p.cover.alt) t.push('কভারের alt নেই');
    if (!(p.excerpt || '').trim() && !(p.seo?.description)) t.push('সারাংশ/বর্ণনা নেই');
    if ((p.title || '').length > 70) t.push('শিরোনাম খুব লম্বা');
    if (!(p.categories || []).length) t.push('বিভাগ নেই');
    if (text.split(/\s+/).length < 150) t.push('খুব ছোট লেখা');
    if (/<img(?![^>]*alt="[^"]+")/.test(p.body || '')) t.push('লেখার ভেতরের ছবিতে alt নেই');
    if (!S.authors.find((a) => a.slug === p.author)?.bio) t.push('লেখকের পরিচিতি নেই');
    return { p, t };
  }).filter((x) => x.t.length);
  const noPhoto = S.authors.filter((a) => !a.photo && S.posts.some((p) => p.author === a.slug)).length;
  const sm = siteUrl('/sitemap.xml');
  view.innerHTML = `<div class="page-head"><div><h1>SEO ও সার্চ র‍্যাংকিং</h1><p>গুগলে প্রথম সারিতে থাকতে যা যা দরকার</p></div></div>
  <div class="stats"><div class="stat"><div class="stat__n">${bn(pub.length - issues.length)}</div><div class="stat__l">সম্পূর্ণ ঠিক লেখা</div></div>
  <div class="stat"><div class="stat__n" style="color:var(--warn)">${bn(issues.length)}</div><div class="stat__l">উন্নতির সুযোগ আছে</div></div>
  <div class="stat"><div class="stat__n">${bn(noPhoto)}</div><div class="stat__l">লেখকের ছবি নেই</div></div></div>
  <div class="dash"><div class="card"><h2 class="card__title" style="margin-bottom:12px">যেসব লেখায় উন্নতি দরকার</h2>
    <div class="list">${issues.slice(0, 200).map(({ p, t }) => `<div class="list__item"><div class="list__main"><a class="list__title" href="#/post/${encodeURIComponent(p.id)}">${esc(p.title)}</a><span class="list__meta">${t.map(esc).join(' · ')}</span></div></div>`).join('') || '<p class="empty">সব লেখা ঠিক আছে 🎉</p>'}</div></div>
  <div><div class="card"><h2 class="card__title" style="margin-bottom:10px">স্বয়ংক্রিয়ভাবে যা হচ্ছে</h2><ul style="padding-left:18px;margin:0;line-height:1.9">
    <li>প্রতিটি পাতা আগে থেকে তৈরি HTML — গুগল সঙ্গে সঙ্গে পড়তে পারে</li><li><code>lang="bn"</code>, বাংলা তারিখ ও সংখ্যা</li>
    <li>আলাদা শিরোনাম, মেটা বর্ণনা, ক্যানোনিকাল</li><li>Open Graph ও টুইটার কার্ড (ফেসবুক শেয়ারে বড় ছবি)</li>
    <li>Article, BreadcrumbList, WebSite+SearchAction, Organization স্কিমা</li><li>sitemap.xml (ছবিসহ), news-sitemap.xml, robots.txt, RSS</li>
    <li>পুরোনো WordPress-এর সব ঠিকানা অপরিবর্তিত — র‍্যাংকিং হারাবে না</li><li>ছবি lazy-load ও WebP, ফন্ট একবার লোড — দ্রুত গতি</li></ul></div>
  <div class="card"><h2 class="card__title" style="margin-bottom:10px">একবার যা করতে হবে</h2><ol style="padding-left:18px;margin:0;line-height:1.9">
    <li><a href="https://search.google.com/search-console" target="_blank" rel="noopener">Google Search Console</a>-এ সাইট যোগ করুন, যাচাই কোড <a href="#/settings">সেটিংস → SEO</a>-তে দিন</li>
    <li>সাইটম্যাপ জমা দিন: <code>${esc(sm)}</code></li>
    <li><a href="https://www.bing.com/webmasters" target="_blank" rel="noopener">Bing Webmaster</a>-এও একই কাজ</li>
    <li><a href="https://search.google.com/test/rich-results" target="_blank" rel="noopener">Rich Results Test</a> ও <a href="https://pagespeed.web.dev/" target="_blank" rel="noopener">PageSpeed</a> দিয়ে পরীক্ষা করুন</li></ol>
    <div class="btn-row" style="margin-top:12px"><a class="btn btn--light btn--sm" target="_blank" href="${esc(sm)}">sitemap.xml ↗</a><a class="btn btn--light btn--sm" target="_blank" href="${esc(siteUrl('/robots.txt'))}">robots.txt ↗</a><a class="btn btn--light btn--sm" target="_blank" href="${esc(siteUrl('/feed.xml'))}">RSS ↗</a></div></div></div></div>`;
}

// ==================================================================== আমদানি ও ব্যাকআপ
export function importView(view) {
  view.innerHTML = `<div class="page-head"><div><h1>আমদানি ও ব্যাকআপ</h1></div></div>
  <div class="dash"><div class="card"><h2 class="card__title">WordPress থেকে আমদানি</h2>
    <p class="help">পুরোনো WordPress সাইটের সব লেখা, বিভাগ, লেখক ও পাতা এখানে আনুন (WordPress REST API ব্যবহার করে)। একই লেখা আবার আনলে হালনাগাদ হবে।</p>
    <div class="field"><label>WordPress সাইটের ঠিকানা</label><input class="input" data-wp value="https://thekeyari.com"></div>
    <label class="check"><input type="checkbox" data-keep checked> আগে থেকে থাকা লেখা বদলাবেন না (শুধু নতুনগুলো আনুন)</label>
    <div class="btn-row" style="margin-top:12px"><button class="btn" data-go>আমদানি শুরু</button></div>
    <div class="progress" style="margin-top:14px" hidden><span></span></div><div class="log" data-log hidden style="margin-top:10px"></div>
    <div class="notice notice--warn" style="margin-top:14px">ছবিগুলো পুরোনো সাইটের ঠিকানায় থেকে যায়। পুরোনো সাইট বন্ধ করার আগে GitHub-এ <b>Actions → "WordPress আমদানি" → Run workflow</b> (download images টিক দিয়ে) চালান — সব ছবি রিপোতে চলে আসবে।</div></div>
  <div><div class="card"><h2 class="card__title">পূর্ণ ব্যাকআপ</h2><p class="help">সব লেখা, পাতা, আয়োজন, বিভাগ, লেখক, সেটিংস একটি JSON ফাইলে (ছবি বাদে; ছবি GitHub রিপোতে সুরক্ষিত)।</p>
    <button class="btn btn--light" data-export>ব্যাকআপ ডাউনলোড</button></div>
  <div class="card"><h2 class="card__title">ব্যাকআপ থেকে ফেরানো</h2><p class="help">আগের ডাউনলোড করা ব্যাকআপ ফাইল দিন — সব কনটেন্ট সেই অবস্থায় ফিরবে (এক কমিটে)।</p>
    <input type="file" accept=".json,application/json" data-imp class="input"></div>
  <div class="card"><h2 class="card__title">CSV রপ্তানি</h2><p class="help">লেখার তালিকা (শিরোনাম, লেখক, বিভাগ, তারিখ, শব্দ, লিংক) স্প্রেডশিটে খোলার জন্য।</p><button class="btn btn--light" data-csv>CSV ডাউনলোড</button></div></div></div>`;
  const log = (m) => { const l = $('[data-log]', view); l.hidden = false; l.textContent += m + '\n'; l.scrollTop = l.scrollHeight; };
  const prog = (x) => { const p = $('.progress', view); p.hidden = false; $('span', p).style.width = Math.round(x * 100) + '%'; };
  $('[data-export]', view).onclick = () => {
    const data = { version: 1, exported: new Date().toISOString(), settings: S.settings, categories: S.categories, authors: S.authors, menu: S.menu, home: S.home, styles: S.styles, users: S.users,
      posts: S.posts.map(cleanDoc), pages: S.pages.map(cleanDoc), ayojon: S.ayojon.map(cleanDoc) };
    download(`keyari-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data));
  };
  $('[data-csv]', view).onclick = () => {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = [['শিরোনাম', 'লেখক', 'বিভাগ', 'তারিখ', 'অবস্থা', 'শব্দ', 'লিংক'].map(q).join(',')].concat(S.posts.map((p) => [p.title, authorName(p.author), (p.categories || []).map(catName).join('; '), String(p.date).slice(0, 10), p.status, wordCount(p.body), siteUrl(postPath(p))].map(q).join(',')));
    download('keyari-posts.csv', '﻿' + rows.join('\n'), 'text/csv');
  };
  $('[data-imp]', view).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    let data; try { data = JSON.parse(await f.text()); } catch (er) { toast('ফাইলটি সঠিক JSON নয়', 'err'); return; }
    if (!(await confirmBox(`ব্যাকআপে ${bn((data.posts || []).length)}টি লেখা আছে। বর্তমান কনটেন্ট এর দ্বারা প্রতিস্থাপিত হবে। এগোবেন?`, { danger: true, ok: 'ফেরান' }))) return;
    const ch = [];
    ['settings', 'categories', 'authors', 'menu', 'home', 'styles', 'users'].forEach((k) => data[k] && ch.push({ path: `content/${k}.json`, text: jsonText(data[k]) }));
    (data.posts || []).forEach((p) => ch.push({ path: `content/posts/${p.id}.json`, text: jsonText(p) }));
    (data.pages || []).forEach((p) => ch.push({ path: `content/pages/${p.id}.json`, text: jsonText(p) }));
    (data.ayojon || []).forEach((p) => ch.push({ path: `content/ayojon/${p.id}.json`, text: jsonText(p) }));
    await commit('ব্যাকআপ থেকে ফেরানো', ch); location.reload();
  };
  $('[data-go]', view).onclick = async () => {
    const site = $('[data-wp]', view).value.trim().replace(/\/$/, ''); const keep = $('[data-keep]', view).checked;
    const btn = $('[data-go]', view); btn.disabled = true;
    try {
      const strip = (h) => stripTags(h);
      const dec = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };
      const all = async (ep, extra = '') => {
        const out = []; let page = 1, total = 1;
        do {
          const r = await fetch(`${site}/wp-json/wp/v2/${ep}?per_page=100&page=${page}${extra}`);
          if (!r.ok) { if (r.status === 400) break; throw new Error(`${ep}: ${r.status}`); }
          total = +r.headers.get('X-WP-TotalPages') || 1; out.push(...(await r.json())); log(`${ep}: পাতা ${bn(page)}/${bn(total)}`); page++;
        } while (page <= total);
        return out;
      };
      log('বিভাগ আনা হচ্ছে…'); const cats = await all('categories'); prog(0.1);
      const catById = Object.fromEntries(cats.map((c) => [c.id, c]));
      const newCats = [...S.categories];
      cats.forEach((c) => { const slug = dec(c.slug); if (slug === 'uncategorized' || newCats.some((x) => x.slug === slug)) return; const par = catById[c.parent]; newCats.push({ slug, name: c.name, parent: par ? dec(par.slug) : null, order: 99, description: strip(c.description) }); });
      log('লেখা আনা হচ্ছে…'); const posts = await all('posts', '&_embed=author,wp:featuredmedia,wp:term'); prog(0.6);
      const authors = [...S.authors]; const ch = [];
      const host = new URL(site).host;
      const relLinks = (h) => h.replace(new RegExp(`href="https?://(www\\.)?${host.replace(/\./g, '\\.')}([^"]*)"`, 'g'), (m, w, p) => (p.includes('/wp-content/') ? m : `href="${dec(p) || '/'}"`));
      let added = 0;
      for (const p of posts) {
        const id = 'wp-' + p.id;
        if (keep && S.posts.some((x) => x.id === id)) continue;
        const emb = p._embedded || {}; const au = (emb.author || [{}])[0];
        const aslug = dec(au.slug || 'keyari');
        if (!authors.some((a) => a.slug === aslug)) authors.push({ slug: aslug, name: au.name || aslug, bio: strip(au.description || ''), photo: '', email: '', facebook: '', website: '' });
        const terms = emb['wp:term'] || [[], []]; const fm = (emb['wp:featuredmedia'] || [{}])[0] || {};
        const title = strip(p.title.rendered);
        const m = title.match(/^(.*?)\s*\(\s*(\S+)\s*(পর্ব|কিস্তি|খণ্ড|অধ্যায়)\s*\)\s*$/);
        const ord = { প্রথম: 1, দ্বিতীয়: 2, তৃতীয়: 3, চতুর্থ: 4, পঞ্চম: 5, ষষ্ঠ: 6, সপ্তম: 7, অষ্টম: 8, নবম: 9, দশম: 10 };
        const doc = { id, title, subtitle: '', slug: dec(p.slug), date: p.date + '+06:00', modified: (p.modified || p.date) + '+06:00', status: p.status === 'publish' ? 'published' : 'draft', author: aslug, translator: '',
          categories: (terms[0] || []).map((t) => dec(t.slug)).filter((s) => s !== 'uncategorized'), tags: (terms[1] || []).map((t) => t.name),
          cover: { src: fm.source_url || '', alt: fm.alt_text || title, caption: '' }, excerpt: strip(p.excerpt.rendered).replace(/\s*\[…\]\s*$/, ''), body: relLinks(p.content.rendered),
          series: m && ord[m[2]] ? { name: m[1].trim(), part: ord[m[2]], unit: m[3] } : null, ayojon: '', featured: !!p.sticky, pick: false, comments: p.comment_status === 'open',
          seo: { title: '', description: '', keyphrase: '', og_image: '', canonical: '', noindex: false }, layout: { justify: true, dropcap: false }, source: { wp_id: p.id, link: dec(p.link) } };
        ch.push({ path: `content/posts/${id}.json`, text: jsonText(doc) }); added++;
      }
      ch.push({ path: 'content/categories.json', text: jsonText(newCats) }, { path: 'content/authors.json', text: jsonText(authors) });
      log(`${bn(added)}টি লেখা কমিট করা হচ্ছে…`); prog(0.8);
      await commit(`WordPress আমদানি: ${added}টি লেখা`, ch); prog(1);
      log('সম্পন্ন ✔ পাতা রিলোড হচ্ছে…'); setTimeout(() => location.reload(), 1500);
    } catch (e) {
      log('ত্রুটি: ' + e.message + (e.message.includes('Failed to fetch') ? '\n(ব্রাউজার থেকে সংযোগ বন্ধ — CORS। বিকল্প: GitHub Actions-এর "WordPress আমদানি" ওয়ার্কফ্লো চালান।)' : ''));
      btn.disabled = false;
    }
  };
}

// ==================================================================== প্রকাশের অবস্থা
export async function deployView(view) {
  view.innerHTML = `<div class="page-head"><div><h1>প্রকাশের অবস্থা</h1><p>প্রতিটি সংরক্ষণের পর GitHub Actions সাইট নতুন করে তৈরি করে (১–২ মিনিট)। প্রতি ঘণ্টায়ও একবার চলে — নির্ধারিত লেখা প্রকাশের জন্য।</p></div>
    <div class="btn-row"><button class="btn btn--light" data-refresh>হালনাগাদ</button><button class="btn" data-run>এখনই সাইট তৈরি করুন</button></div></div><div data-body><span class="spinner"></span></div>`;
  const draw = async () => {
    const body = $('[data-body]', view);
    if (S.be.mode === 'local') { body.innerHTML = '<div class="notice notice--ok">লোকাল মোড: প্রতিটি সংরক্ষণের সঙ্গে সঙ্গে সাইট তৈরি হয়। অনলাইনে প্রকাশ করতে git push করুন।</div>'; return; }
    try {
      const runs = await S.be.runs();
      body.innerHTML = `<div class="card" style="padding:0"><table class="table"><thead><tr><th></th><th>বিবরণ</th><th>শুরু</th><th>ফল</th></tr></thead><tbody>${runs.map((r) => {
        const st = r.status !== 'completed' ? ['run', 'চলছে…'] : r.conclusion === 'success' ? ['ok', 'সফল'] : ['err', r.conclusion === 'cancelled' ? 'বাতিল' : 'ব্যর্থ'];
        return `<tr><td><span class="dot dot--${st[0]}"></span></td><td><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title || r.name)}</a><div class="help">${esc(r.name)} · ${esc(r.event)}</div></td><td>${bnDate(r.created, true)}</td><td>${st[1]}</td></tr>`;
      }).join('') || '<tr><td colspan="4" class="empty">এখনো কোনো রান হয়নি</td></tr>'}</tbody></table></div>
      ${runs.some((r) => r.status !== 'completed') ? '<p class="help">স্বয়ংক্রিয় হালনাগাদ হচ্ছে…</p>' : ''}`;
      if (runs.some((r) => r.status !== 'completed') && document.body.contains(view)) setTimeout(() => document.body.contains(view) && draw(), 8000);
    } catch (e) { body.innerHTML = `<div class="notice notice--warn">অবস্থা দেখা যায়নি: ${esc(e.message)}। টোকেনে "Actions: Read" অনুমতি আছে কিনা দেখুন।</div>`; }
  };
  $('[data-refresh]', view).onclick = draw;
  $('[data-run]', view).onclick = async () => { try { await S.be.dispatch('deploy.yml'); toast('সাইট তৈরি শুরু হয়েছে', 'ok'); setTimeout(draw, 3000); } catch (e) { toast('শুরু করা যায়নি: ' + e.message + ' (টোকেনে Actions: Read & Write লাগবে)', 'err'); } };
  draw();
}
