// মিডিয়া লাইব্রেরি ও ছবি বাছাই
import { S, commit, imgUrl, imgFallback, can } from '../state.js';
import { $, $$, esc, modal, toast, imageChanges, confirmBox, bn } from '../util.js';

export async function uploadFiles(files, onEach) {
  const changes = [], urls = [];
  for (const f of files) {
    if (!f.type.startsWith('image/')) { toast(`${f.name}: শুধু ছবি আপলোড করা যায়`, 'err'); continue; }
    const r = await imageChanges(f);
    changes.push(...r.changes); urls.push(r);
    onEach && onEach(r);
  }
  if (!changes.length) return [];
  await commit(`মিডিয়া আপলোড: ${urls.length}টি ছবি`, changes);
  return urls;
}

function grid(container, { selectable = false, onPick, filter = '' } = {}) {
  const items = S.media.filter((m) => !filter || m.path.toLowerCase().includes(filter.toLowerCase()));
  container.innerHTML = items.length ? items.slice(0, 400).map((m) => `
    <button type="button" class="media-item" data-url="${esc(m.url)}" title="${esc(m.url)}">
      <img src="${esc(imgUrl(m.url))}" alt="" loading="lazy"><span class="media-item__name">${esc(m.path.split('/').pop())}</span>
    </button>`).join('') : '<p class="empty">এখনো কোনো ছবি আপলোড হয়নি।</p>';
  $$('img', container).forEach(imgFallback);
  $$('.media-item', container).forEach((b) => b.addEventListener('click', () => {
    if (selectable) { $$('.media-item', container).forEach((x) => x.classList.remove('is-selected')); b.classList.add('is-selected'); onPick && onPick(b.dataset.url); }
    else onPick && onPick(b.dataset.url);
  }));
}

function dropzone(el, onFiles) {
  const input = $('input[type=file]', el);
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('is-drag'); });
  el.addEventListener('dragleave', () => el.classList.remove('is-drag'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('is-drag'); onFiles([...e.dataTransfer.files]); });
  input.addEventListener('change', () => { onFiles([...input.files]); input.value = ''; });
}

/** ছবি বাছাই মোডাল → {url, alt} */
export function pickMedia({ title = 'ছবি বাছাই করুন' } = {}) {
  return new Promise((resolve) => {
    let chosen = null;
    const m = modal({
      title, wide: true,
      body: `<div class="dropzone" data-dz><p><b>ছবি এখানে টেনে আনুন</b> অথবা <label class="btn btn--sm" style="cursor:pointer">কম্পিউটার থেকে বাছুন<input type="file" accept="image/*" multiple hidden></label></p>
        <p class="help">ছবি স্বয়ংক্রিয়ভাবে WebP-তে রূপান্তর ও ছোট (সর্বোচ্চ ১৬০০px) হবে — সাইট দ্রুত লোড হবে।</p><div class="progress" hidden><span></span></div></div>
        <div class="toolbar"><input class="input grow" placeholder="ফাইলের নাম দিয়ে খুঁজুন…" data-f><input class="input" placeholder="অথবা ছবির পূর্ণ URL দিন (https://…)" data-ext style="min-width:320px"></div>
        <div class="field"><label>বিকল্প লেখা (alt) — দৃষ্টিপ্রতিবন্ধী পাঠক ও SEO-র জন্য</label><input class="input" data-alt placeholder="ছবিতে কী আছে, সংক্ষেপে"></div>
        <div class="media-grid" data-g></div>`,
      foot: `<button class="btn btn--light" data-no>বাতিল</button><button class="btn" data-ok disabled>নির্বাচন করুন</button>`,
      onClose: () => resolve(null),
    });
    const g = $('[data-g]', m.el), ok = $('[data-ok]', m.el);
    const render = (f = '') => grid(g, { selectable: true, filter: f, onPick: (u) => { chosen = u; ok.disabled = false; } });
    render();
    $('[data-f]', m.el).addEventListener('input', (e) => render(e.target.value));
    $('[data-ext]', m.el).addEventListener('input', (e) => { chosen = e.target.value.trim() || null; ok.disabled = !chosen; });
    dropzone($('[data-dz]', m.el), async (files) => {
      const pr = $('.progress', m.el); pr.hidden = false; $('span', pr).style.width = '30%';
      try {
        const res = await uploadFiles(files);
        $('span', pr).style.width = '100%';
        if (res.length) { chosen = res[0].url; ok.disabled = false; render(); const first = $(`.media-item[data-url="${CSS.escape(chosen)}"]`, g); first && first.classList.add('is-selected'); }
      } catch (e) { toast('আপলোড ব্যর্থ: ' + e.message, 'err'); }
      setTimeout(() => (pr.hidden = true), 600);
    });
    $('[data-no]', m.el).onclick = () => m.close();
    ok.onclick = () => { resolve({ url: chosen, alt: $('[data-alt]', m.el).value.trim() }); m.el.remove(); };
  });
}

export function mediaView(view) {
  view.innerHTML = `<div class="page-head"><div><h1>মিডিয়া লাইব্রেরি</h1><p>${bn(S.media.length)}টি ছবি · নতুন ছবি স্বয়ংক্রিয়ভাবে WebP-তে রূপান্তরিত হয়</p></div></div>
    <div class="dropzone" data-dz><p><b>ছবি এখানে টেনে আনুন</b> অথবা <label class="btn btn--sm" style="cursor:pointer">ছবি আপলোড<input type="file" accept="image/*" multiple hidden></label></p><div class="progress" hidden><span></span></div></div>
    <div class="toolbar"><input class="input grow" placeholder="খুঁজুন…" data-f></div>
    <div class="media-grid" data-g></div>`;
  const g = $('[data-g]', view);
  const render = (f = '') => grid(g, { filter: f, onPick: showDetail });
  render();
  $('[data-f]', view).addEventListener('input', (e) => render(e.target.value));
  dropzone($('[data-dz]', view), async (files) => {
    const pr = $('.progress', view); pr.hidden = false; $('span', pr).style.width = '40%';
    try { await uploadFiles(files); render(); } catch (e) { toast('আপলোড ব্যর্থ: ' + e.message, 'err'); }
    pr.hidden = true;
  });
  function showDetail(url) {
    const item = S.media.find((m) => m.url === url);
    const used = S.posts.filter((p) => JSON.stringify(p).includes(url)).map((p) => p.title);
    const m = modal({
      title: 'ছবির বিবরণ', wide: true,
      body: `<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:20px"><img src="${esc(imgUrl(url))}" style="width:100%;border-radius:12px" alt="">
        <div><div class="field"><label>ঠিকানা (URL)</label><input class="input input--mono" readonly value="${esc(url)}"></div>
        <p class="help">আকার: ${bn(Math.round((item?.size || 0) / 1024))} KB</p>
        <p class="label">যেখানে ব্যবহৃত (${bn(used.length)})</p><ul>${used.slice(0, 10).map((t) => `<li>${esc(t)}</li>`).join('') || '<li class="help">কোথাও ব্যবহৃত হয়নি</li>'}</ul></div></div>`,
      foot: `${can('*') || can('media') ? '<button class="btn btn--danger" data-del>মুছে ফেলুন</button>' : ''}<button class="btn btn--light" data-copy>URL কপি</button><button class="btn" data-x2>বন্ধ</button>`,
    });
    imgFallback($('img', m.el));
    $('[data-copy]', m.el).onclick = () => { navigator.clipboard.writeText(url); toast('কপি হয়েছে'); };
    $('[data-x2]', m.el).onclick = () => m.close();
    const del = $('[data-del]', m.el);
    if (del) del.onclick = async () => {
      if (!(await confirmBox(used.length ? `এই ছবি ${bn(used.length)}টি লেখায় ব্যবহৃত। তবুও মুছবেন?` : 'ছবিটি স্থায়ীভাবে মুছে যাবে (Git ইতিহাসে থেকে যাবে)। মুছবেন?', { ok: 'মুছুন', danger: true }))) return;
      const thumb = item.path.replace(/\.webp$/, '-640.webp');
      const ch = [{ path: item.path, delete: true }];
      if (S.tree.some((t) => t.path === thumb)) ch.push({ path: thumb, delete: true });
      await commit('মিডিয়া মুছে ফেলা: ' + item.path.split('/').pop(), ch);
      m.close(); render();
    };
  }
}
