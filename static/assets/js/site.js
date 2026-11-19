/* কেয়ারি — সাইটের ইন্টারঅ্যাকশন (কোনো লাইব্রেরি ছাড়া) */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  doc.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-more]');
    if (!b) return;
    var wrap = b.parentNode, grid = wrap.previousElementSibling;
    if (!grid) return;
    var open = grid.classList.toggle('is-open');
    b.classList.toggle('is-open', open);
    b.setAttribute('aria-label', open ? 'কম দেখান' : 'আরও দেখুন');
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) {
      var sec = grid.closest('section') || grid;
      var top = sec.getBoundingClientRect().top;
      if (top < 0) window.scrollBy({ top: top - 90, behavior: 'smooth' });
    }
  });
  // ইউটিউব কার্ড: ক্লিক করলে সেখানেই ভিডিও চলে (তার আগে কোনো বাইরের স্ক্রিপ্ট লোড হয় না)
  doc.addEventListener('click', function (e) {
    var m = e.target.closest && e.target.closest('.vid__media');
    if (!m || m.classList.contains('is-playing')) return;
    var id = m.parentNode.getAttribute('data-vid');
    var f = doc.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1&playsinline=1';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.setAttribute('allowfullscreen', ''); f.title = 'ইউটিউব ভিডিও';
    m.classList.add('is-playing'); m.appendChild(f);
  });
  var BASE = (window.KEYARI && window.KEYARI.base) || '';
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var BN = '০১২৩৪৫৬৭৮৯';
  var bn = function (n) { return String(n).replace(/\d/g, function (d) { return BN[d]; }); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  // ---------- পুরোনো WordPress সার্চ লিংক (/?s=) ----------
  var params = new URLSearchParams(location.search);
  if (params.get('s') && !doc.body.classList.contains('search-page')) {
    location.replace(BASE + '/search/?s=' + encodeURIComponent(params.get('s')));
    return;
  }

  // ---------- টোস্ট ----------
  var toastEl = $('.toast'), toastT;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.hidden = true; }, 2200);
  }

  // ---------- ডার্ক মোড ----------
  $$('[data-scheme-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var next = root.getAttribute('data-scheme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-scheme', next); store.set('keyari-scheme', next);
    });
  });

  // ---------- স্মার্ট স্টিকি হেডার, প্রোগ্রেস, স্ক্রল-টপ ----------
  var header = $('[data-header]'), lastY = window.scrollY, toTop = $('[data-to-top]');
  var dockRing = $('.autoscroll__ring circle'), ring = toTop && $('circle', toTop), bar = $('.read-progress span');
  var article = doc.body.classList.contains('single') ? $('.entry-content') : null;
  var ticking = false, compact = false;
  function setCompact(v) {
    if (v === compact) return;
    compact = v;
    header.classList.toggle('is-compact', v);
    root.classList.toggle('hdr-compact', v);
    if (v && typeof closeSearch === 'function') closeSearch();
  }
  var hidden = false;
  function setHidden(v) {
    if (v === hidden) return;
    hidden = v;
    header.classList.toggle('is-hidden', v);
    doc.body.classList.toggle('hdr-off', v);
    if (v && typeof closeSearch === 'function') closeSearch();
  }
  // মোবাইলে পড়ার মাঝে পর্দা ছুঁলে (লিংক/বোতাম ছাড়া) হেডার ফিরে আসে
  doc.addEventListener('click', function (e) {
    if (!header || window.innerWidth >= 992) return;
    if (e.target.closest('a, button, input, textarea, select, label, [data-autoscroll], .offcanvas, .cm, .share-row, .autoscroll')) return;
    if (hidden) { setHidden(false); lastY = window.scrollY; return; }
    // লেখার পাতায়: আবার ছুঁলে হেডার (ও সাথে নিচের ডক) চলে যায়; ছুঁলে আসে, আবার ছুঁলে যায়
    if (doc.body.classList.contains('single') && window.scrollY > 140 && !(window.getSelection && String(window.getSelection()))) { setHidden(true); lastY = window.scrollY; }
  });
  function onScroll() {
    var y = window.scrollY, h = doc.documentElement.scrollHeight - window.innerHeight;
    if (header) {
      var menuOpen = $('.nav__item.is-open') || ($('#search-pop') && !$('#search-pop').hidden);
      var dy = y - lastY;
      if (window.innerWidth < 992) {
        // মোবাইল: নিচে গেলে হেডার পুরো লুকায়, ওপরে গেলে ফেরে
        setCompact(false);
        if (y < 140) setHidden(false);
        else if (dy > 6 && !menuOpen) setHidden(true);
        else if (dy < -6) setHidden(false);
      } else {
        setHidden(false);
        if (y < 140) setCompact(false);
        else if (dy > 6 && !menuOpen) setCompact(true);
        else if (dy < -6) setCompact(false);
      }
      if (Math.abs(dy) > 6 || y < 140) lastY = y;
    } else lastY = y;
    var p = h > 0 ? Math.min(1, y / h) : 0;
    if (ring) ring.style.strokeDashoffset = String(138.2 * (1 - p));
    if (dockRing) dockRing.style.strokeDashoffset = String(125.7 * (1 - p));
    if (toTop) toTop.classList.toggle('is-visible', y > 600);
    if (bar && article) {
      var r = article.getBoundingClientRect();
      var total = r.height - window.innerHeight * 0.6;
      var done = Math.min(1, Math.max(0, (-r.top + window.innerHeight * 0.2) / (total || 1)));
      bar.style.width = (done * 100) + '%';
    }
    ticking = false;
  }
  window.addEventListener('scroll', function () { if (!ticking) { requestAnimationFrame(onScroll); ticking = true; } }, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  // ---------- মেনু (কি-বোর্ড ও টাচ) ----------
  $$('.nav__item.has-sub').forEach(function (li) {
    var link = $('.nav__link', li);
    function setOpen(v) {
      $$('.nav__item.is-open').forEach(function (o) { if (o !== li) { o.classList.remove('is-open'); $('.nav__link', o).setAttribute('aria-expanded', 'false'); } });
      li.classList.toggle('is-open', v); link.setAttribute('aria-expanded', v ? 'true' : 'false');
    }
    link.addEventListener('click', function (e) {
      if (compact && window.innerWidth < 992) {
        e.preventDefault();
        var idx = $$('.nav__list > .nav__item').indexOf(li), mi = $$('.m-nav > .m-item')[idx];
        ocOpen();
        if (mi && !mi.classList.contains('is-open')) { var tg = $('.m-toggle', mi); tg && tg.click(); }
        return;
      }
      if (matchMedia('(hover: none)').matches || link.getAttribute('href') === '#') {
        if (!li.classList.contains('is-open')) { e.preventDefault(); setOpen(true); }
      }
    });
    link.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); setOpen(true); var f = $('.dropdown a, .mega a', li); if (f) f.focus(); }
    });
    li.addEventListener('focusout', function (e) { if (!li.contains(e.relatedTarget)) setOpen(false); });
    li.addEventListener('mouseleave', function () { setOpen(false); });
  });
  doc.addEventListener('click', function (e) {
    if (!e.target.closest('.nav__item')) $$('.nav__item.is-open').forEach(function (o) { o.classList.remove('is-open'); });
  });

  // ---------- সার্চ (ঝাপসা পটভূমির ওপর) + রিয়েল-টাইম ফলাফল ----------
  var pop = $('#search-pop'), openBtn = $('[data-search-open]');
  var sxInput = pop && $('input[name="s"]', pop), sxRes = pop && $('[data-sx-results]', pop), sxClear = pop && $('[data-sx-clear]', pop);
  var sxIdx = null, sxActive = -1, sxT;
  var BNn = '০১২৩৪৫৬৭৮৯';
  var sxNorm = function (s) { return String(s || '').toLowerCase().normalize('NFC').replace(/[‌‍]/g, '').replace(/[০-৯]/g, function (d) { return BNn.indexOf(d); }); };
  var sxEsc = function (s) { return String(s || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function sxLoad(cb) {
    if (sxIdx) return cb();
    fetch(BASE + '/search-index.json').then(function (r) { return r.json(); }).then(function (d) { sxIdx = d; cb(); }).catch(function () { sxIdx = []; cb(); });
  }
  function sxRender() {
    var q = sxInput.value.trim();
    sxClear.hidden = !q;
    sxActive = -1;
    if (!q) { sxRes.hidden = true; sxRes.innerHTML = ''; return; }
    var terms = sxNorm(q).split(/\s+/).filter(Boolean);
    var scored = [];
    (sxIdx || []).forEach(function (it) {
      var t = sxNorm(it.t), a = sxNorm(it.a), c = sxNorm(it.c), e = sxNorm(it.e), g = sxNorm(it.g), sc = 0;
      for (var k = 0; k < terms.length; k++) {
        var w = terms[k], hit = false;
        if (t.indexOf(w) > -1) { sc += t.indexOf(w) === 0 ? 14 : 10; hit = true; }
        if (a.indexOf(w) > -1) { sc += 6; hit = true; }
        if (c.indexOf(w) > -1 || g.indexOf(w) > -1) { sc += 4; hit = true; }
        if (e.indexOf(w) > -1) { sc += 2; hit = true; }
        if (!hit) return;
      }
      scored.push({ it: it, s: sc });
    });
    scored.sort(function (x, y) { return y.s - x.s; });
    var top = scored.slice(0, 7);
    sxRes.hidden = false;
    if (!top.length) { sxRes.innerHTML = '<p class="sx__none">কোনো ফলাফল নেই।</p>'; return; }
    var mark = function (txt) {
      var out = sxEsc(txt);
      terms.forEach(function (w) { if (!w) return; try { out = out.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'i'), '<mark>$1</mark>'); } catch (e) {} });
      return out;
    };
    sxRes.innerHTML = top.map(function (x, n) {
      var it = x.it;
      return '<a class="sx__item" role="option" data-i="' + n + '" href="' + it.u + '">' +
        '<span class="sx__thumb">' + (it.i ? '<img src="' + sxEsc(it.i) + '" alt="" loading="lazy">' : '') + '</span>' +
        '<span class="sx__txt"><span class="sx__title">' + mark(it.t) + '</span>' +
        '<span class="sx__meta">' + sxEsc(it.a) + (it.cl ? ' · ' + sxEsc(it.cl) : '') + '</span></span></a>';
    }).join('') + '<a class="sx__all" href="' + BASE + '/search/?s=' + encodeURIComponent(q) + '">সব ফলাফল (' + bn(scored.length) + ') ›</a>';
  }
  function closeSearch() {
    if (pop && !pop.hidden) { pop.hidden = true; doc.body.classList.remove('sx-open'); openBtn && openBtn.setAttribute('aria-expanded', 'false'); }
  }
  function openSearch() {
    pop.hidden = false; doc.body.classList.add('sx-open'); openBtn && openBtn.setAttribute('aria-expanded', 'true');
    sxLoad(function () { if (sxInput.value) sxRender(); });
    setTimeout(function () { sxInput.focus(); sxInput.select(); }, 30);
  }
  if (openBtn && pop) {
    openBtn.addEventListener('click', function (e) { e.stopPropagation(); if (pop.hidden) openSearch(); else closeSearch(); });
    $$('[data-search-close]', pop).forEach(function (b) { b.addEventListener('click', closeSearch); });
    sxInput.addEventListener('input', function () { clearTimeout(sxT); sxT = setTimeout(function () { sxLoad(sxRender); }, 40); });
    sxClear.addEventListener('click', function () { sxInput.value = ''; sxRender(); sxInput.focus(); });
    sxInput.addEventListener('keydown', function (e) {
      var items = $$('.sx__item', sxRes);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!items.length) return;
        e.preventDefault();
        sxActive = (sxActive + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach(function (it, k) { it.classList.toggle('is-active', k === sxActive); });
        items[sxActive].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && sxActive > -1 && items[sxActive]) {
        e.preventDefault(); location.href = items[sxActive].getAttribute('href');
      }
    });
    $('form', pop).addEventListener('submit', function (e) { if (!sxInput.value.trim()) e.preventDefault(); });
  }

  // ---------- অফ-ক্যানভাস মেনু ----------
  var oc = $('#offcanvas'), bd = $('.offcanvas-backdrop'), lastFocus;
  function ocOpen() {
    if (!oc) return; lastFocus = doc.activeElement;
    oc.classList.add('is-open'); oc.setAttribute('aria-hidden', 'false'); bd.hidden = false; doc.body.style.overflow = 'hidden';
    setTimeout(function () { var c = $('[data-offcanvas-close]', oc); c && c.focus(); }, 50);
  }
  function ocClose() {
    if (!oc || !oc.classList.contains('is-open')) return;
    oc.classList.remove('is-open'); oc.setAttribute('aria-hidden', 'true'); bd.hidden = true; doc.body.style.overflow = '';
    lastFocus && lastFocus.focus();
  }
  $$('[data-offcanvas-open]').forEach(function (b) { b.addEventListener('click', ocOpen); });
  $$('[data-offcanvas-close]').forEach(function (b) { b.addEventListener('click', ocClose); });
  $$('.m-toggle').forEach(function (b) {
    b.addEventListener('click', function () {
      var li = b.closest('.m-item'), open = !li.classList.contains('is-open');
      li.classList.toggle('is-open', open); b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeSearch(); ocClose();
      $$('.nav__item.is-open').forEach(function (o) { o.classList.remove('is-open'); });
    }
  });

  // ---------- স্লাইডার ----------
  $$('[data-slider]').forEach(function (sl) {
    var slides = $$('.slide', sl), dots = $$('.slider__dot', sl), i = 0, t;
    if (!slides.length) return;
    var iv = sl.getAttribute('data-interval');
    var interval = iv === null ? 5000 : +iv;
    var counter = $('.slider__count', sl);
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function go(n) {
      i = (n + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle('is-active', k === i); s.setAttribute('aria-hidden', k === i ? 'false' : 'true'); $$('a', s).forEach(function (a) { a.tabIndex = k === i ? 0 : -1; }); });
      dots.forEach(function (d, k) { d.classList.toggle('is-active', k === i); d.setAttribute('aria-current', k === i ? 'true' : 'false'); });
      if (counter) counter.textContent = bn(i + 1) + ' / ' + bn(slides.length);
    }
    function play() { if (reduce || !interval) return; stop(); t = setInterval(function () { go(i + 1); }, interval); }
    function stop() { clearInterval(t); }
    dots.forEach(function (d, k) { d.addEventListener('click', function () { go(k); play(); }); });
    var prev = $('.slider__arrow--prev', sl), next = $('.slider__arrow--next', sl);
    prev && prev.addEventListener('click', function () { go(i - 1); play(); });
    next && next.addEventListener('click', function () { go(i + 1); play(); });
    sl.addEventListener('mouseenter', stop); sl.addEventListener('mouseleave', play);
    sl.addEventListener('focusin', stop); sl.addEventListener('focusout', play);
    var x0 = null;
    sl.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    sl.addEventListener('touchend', function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) { go(i + (dx < 0 ? 1 : -1)); play(); } x0 = null; });
    go(0); play();
  });

  // ---------- কপি ----------
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-copy');
      (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { toast('কপি হয়েছে ✓'); }, function () {
        var ta = doc.createElement('textarea'); ta.value = v; doc.body.appendChild(ta); ta.select();
        try { doc.execCommand('copy'); toast('কপি হয়েছে ✓'); } catch (e) { toast(v); } ta.remove();
      });
    });
  });

  // ---------- অটো-স্ক্রল (গতি কম-বেশি করা যায়; চলার সময়ও নিজে স্ক্রল করা যায়) ----------
  var asBox = $('[data-autoscroll]');
  if (asBox) {
    var asFab = $('[data-as-fab]', asBox), asPanel = $('#as-panel'), asSpeedEl = $('[data-as-speed]', asBox);
    var asSlow = $('[data-as-slower]', asBox), asFast = $('[data-as-faster]', asBox);
    var LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3], BASE_PX = 36; // ১× = সেকেন্ডে ৩৬ পিক্সেল
    var asIdx = parseInt(store.get('keyari-as-speed'), 10);
    if (!(asIdx >= 0 && asIdx < LEVELS.length)) asIdx = 2;
    var asRun = false, asLast = 0, asAcc = 0, asHoldUntil = 0, asTouching = false;
    var asBody = $('.entry-content');
    var fmtSpeed = function (v) { return bn(String(v).replace(/^0\./, '০.')) + '×'; };
    var asPaint = function () {
      asSpeedEl.textContent = fmtSpeed(LEVELS[asIdx]);
      asSlow.disabled = asIdx === 0; asFast.disabled = asIdx === LEVELS.length - 1;
      asBox.classList.toggle('is-running', asRun);
      asFab.setAttribute('aria-pressed', asRun ? 'true' : 'false');
      asFab.setAttribute('aria-label', asRun ? 'অটো-স্ক্রল থামান' : 'অটো-স্ক্রল চালু করুন');
      asFab.title = asRun ? 'থামান' : 'অটো-স্ক্রল — নিজে নিজে পড়ে যান';
      var pb = $('[data-as-play]', asBox); if (pb) { pb.setAttribute('aria-label', asRun ? 'অটো-স্ক্রল থামান' : 'অটো-স্ক্রল চালু করুন'); pb.title = asRun ? 'থামান' : 'অটো-স্ক্রল'; }
      var lb = $('[data-as-label]', asBox); if (lb) lb.textContent = asRun ? 'থামান' : 'অটো-স্ক্রল';
    };
    var atEnd = function () {
      var docEnd = window.innerHeight + window.scrollY >= doc.documentElement.scrollHeight - 2;
      var bodyEnd = asBody ? asBody.getBoundingClientRect().bottom < window.innerHeight * 0.55 : false;
      return docEnd || bodyEnd;
    };
    var asFrame = function (t) {
      if (!asRun) return;
      if (asLast) {
        var dt = Math.min(80, t - asLast) / 1000;
        if (!asTouching && t > asHoldUntil) {
          asAcc += BASE_PX * LEVELS[asIdx] * dt;
          var step = Math.floor(asAcc);
          if (step >= 1) { asAcc -= step; window.scrollBy(0, step); }
        }
      }
      asLast = t;
      if (atEnd()) { asStop(); toast('লেখার শেষে পৌঁছেছেন'); return; }
      requestAnimationFrame(asFrame);
    };
    var asIdleT;
    var asWake = function () {
      asBox.classList.remove('is-idle'); clearTimeout(asIdleT);
      if (asRun) asIdleT = setTimeout(function () { asBox.classList.add('is-idle'); }, 2500);
    };
    asBox.addEventListener('pointerdown', asWake);
    var asStart = function () {
      if (atEnd()) { toast('লেখার শেষে আছেন'); return; }
      asRun = true; asLast = 0; asAcc = 0;
      asPanel.hidden = false; asBox.classList.add('has-panel');
      asPaint(); asWake(); requestAnimationFrame(asFrame);
    };
    function asStop() { asRun = false; asPaint(); asWake(); }
    var asClose = function () { asStop(); asPanel.hidden = true; asBox.classList.remove('has-panel'); };
    var asMenu = $('#as-menu'), asPlay = $('[data-as-play]', asBox), asDesk = window.matchMedia('(min-width: 768px)');
    var asMenuSet = function (v) { if (!asMenu) return; asMenu.hidden = !v; asBox.classList.toggle('is-menu', v); asFab.setAttribute('aria-expanded', v ? 'true' : 'false'); };
    asFab.addEventListener('click', function () {
      if (asDesk.matches && asMenu) asMenuSet(asMenu.hidden);
      else if (asRun) asStop(); else asStart();
    });
    if (asPlay) asPlay.addEventListener('click', function () { if (asRun) asStop(); else asStart(); });
    doc.addEventListener('pointerdown', function (e) { if (asMenu && !asMenu.hidden && !asBox.contains(e.target)) asMenuSet(false); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && asMenu && !asMenu.hidden && !asRun) asMenuSet(false); });
    asSlow.addEventListener('click', function () { if (asIdx > 0) { asIdx--; store.set('keyari-as-speed', asIdx); asPaint(); } });
    asFast.addEventListener('click', function () { if (asIdx < LEVELS.length - 1) { asIdx++; store.set('keyari-as-speed', asIdx); asPaint(); } });
    $('[data-as-close]', asBox).addEventListener('click', asClose);
    // পাঠক নিজে স্ক্রল করলে: চাকা/কি-বোর্ডে সঙ্গে সঙ্গে মিশে যায়; আঙুলে টানলে টানার সময়টুকু থেমে থাকে
    window.addEventListener('touchstart', function (e) { if (asRun && !asBox.contains(e.target)) asTouching = true; }, { passive: true });
    window.addEventListener('touchend', function () { if (asTouching) { asTouching = false; asHoldUntil = performance.now() + 700; } }, { passive: true });
    window.addEventListener('wheel', function () { if (asRun) asHoldUntil = performance.now() + 250; }, { passive: true });
    doc.addEventListener('keydown', function (e) { if (asRun && e.key === 'Escape') asStop(); });
    doc.addEventListener('visibilitychange', function () { if (doc.hidden && asRun) asStop(); });
    // মোবাইলে নিচের ডক: স্ক্রল করলে নিচ থেকে উঠে আসে; লেখার শুরুর কাছে থাকলে লুকিয়ে থাকে
    var topBtn = $('[data-as-top]', asBox);
    if (topBtn) topBtn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    doc.body.classList.toggle('dock-on', true);
    asPaint();
  }

  // ---------- কম্পিউটারে লেখার পাতা: লেখা ছোট/বড় (মনে রাখে) ----------
  var fzDown = $('[data-fz-down]'), fzUp = $('[data-fz-up]');
  if (fzDown && fzUp) {
    var FZ = [16, 18, 20, 22, 24, 26], fzI = parseInt(store.get('keyari-fz'), 10);
    if (!(fzI >= 0 && fzI < FZ.length)) fzI = 2;
    var fzPaint = function () {
      root.style.setProperty('--art-size', FZ[fzI] + 'px');
      fzDown.disabled = fzI === 0; fzUp.disabled = fzI === FZ.length - 1;
    };
    fzDown.addEventListener('click', function () { if (fzI > 0) { fzI--; store.set('keyari-fz', fzI); fzPaint(); } });
    fzUp.addEventListener('click', function () { if (fzI < FZ.length - 1) { fzI++; store.set('keyari-fz', fzI); fzPaint(); } });
    fzPaint();
  }

  // ---------- লেখার আকার ----------
  var fsBtns = $$('[data-fs]');
  if (fsBtns.length) {
    var fsVal = $('[data-fs-val]');
    var fsBase = 17, fsMin = 14, fsMax = 24;
    var fsPaint = function () {
      var cur = parseFloat(getComputedStyle(root).getPropertyValue('--read-size')) || fsBase;
      if (fsVal) { fsVal.textContent = bn(Math.round(cur / fsBase * 100)) + '%'; fsVal.parentNode.hidden = Math.round(cur) === fsBase; }
      fsBtns.forEach(function (b) {
        var d = +b.getAttribute('data-fs');
        b.disabled = (d > 0 && cur >= fsMax) || (d < 0 && cur <= fsMin);
      });
    };
    fsBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var d = +b.getAttribute('data-fs');
        var cur = parseFloat(getComputedStyle(root).getPropertyValue('--read-size')) || fsBase;
        var nv = d === 0 ? fsBase : Math.min(fsMax, Math.max(fsMin, cur + d));
        root.style.setProperty('--read-size', nv + 'px'); store.set('keyari-fs', nv);
        fsPaint();
      });
    });
    fsPaint();
  }

  // ---------- পড়ার সংখ্যা: লেখায় ৮ সেকেন্ড থাকলে একবার গোনা (এক সেশনে একবার) ----------
  var vArt = $('[data-views]');
  if (vArt) {
    var vKey = 'keyari-v-' + vArt.getAttribute('data-post');
    var vDone = false; try { vDone = !!sessionStorage.getItem(vKey); } catch (e) {}
    if (!vDone) {
      setTimeout(function () {
        if (doc.hidden) return;
        try { sessionStorage.setItem(vKey, '1'); } catch (e) {}
        fetch(vArt.getAttribute('data-views-endpoint') + '/view', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ post: vArt.getAttribute('data-post') }), keepalive: true }).catch(function () {});
      }, 8000);
    }
  }

  // ---------- নিজস্ব মন্তব্য (অনুমোদনসাপেক্ষ) ----------
  var cm = $('[data-cm]');
  if (cm) {
    var cmEnd = cm.getAttribute('data-endpoint'), cmPost = cm.getAttribute('data-post');
    var cmDemo = cm.hasAttribute('data-demo');
    var cmForm = $('[data-cm-form]', cm), cmList = $('[data-cm-list]', cm), cmMsg = $('[data-cm-msg]', cm), cmCount = $('[data-cm-count]', cm);
    var PKEY = 'keyari-pending-comments';
    var readP = function () { try { return JSON.parse(localStorage.getItem(PKEY) || '{}'); } catch (e) { return {}; } };
    var writeP = function (o) { try { localStorage.setItem(PKEY, JSON.stringify(o)); } catch (e) {} };
    var BNd = '০১২৩৪৫৬৭৮৯';
    var toBn = function (n) { return String(n).replace(/\d/g, function (d) { return BNd[d]; }); };
    var fmt = function (ts) {
      try { return new Date(ts).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; }
    };
    var el = function (tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    var ANON = 'নাম প্রকাশে অনিচ্ছুক';
    var card = function (c, pending) {
      var wrap = el('article', 'cm__item' + (pending ? ' is-pending' : ''));
      var nm = (c.name || '').trim();
      wrap.appendChild(el('span', 'cm__avatar' + (nm ? '' : ' is-anon'), nm ? nm.charAt(0) : 'অ'));
      var body = el('div', 'cm__body');
      var head = el('div', 'cm__meta');
      head.appendChild(el('strong', 'cm__who' + (nm ? '' : ' is-anon'), nm || ANON));
      head.appendChild(el('time', 'cm__time', fmt(c.ts)));
      if (pending) head.appendChild(el('span', 'cm__badge', 'অনুমোদনের অপেক্ষায়'));
      body.appendChild(head);
      body.appendChild(el('p', 'cm__text', c.text));
      if (c.reply) {
        var r = el('div', 'cm__reply');
        r.appendChild(el('strong', 'cm__reply-who', 'কেয়ারির উত্তর'));
        r.appendChild(el('p', '', c.reply));
        body.appendChild(r);
      }
      wrap.appendChild(body);
      return wrap;
    };
    var render = function (approved) {
      var p = readP(), mine = p[cmPost] || [];
      var have = {}; approved.forEach(function (c) { have[c.id] = 1; });
      var still = mine.filter(function (c) { return !have[c.id]; });
      if (still.length !== mine.length) { p[cmPost] = still; writeP(p); }
      cmList.textContent = '';
      still.slice().reverse().forEach(function (c) { cmList.appendChild(card(c, true)); });
      approved.slice().reverse().forEach(function (c) { cmList.appendChild(card(c, false)); });
      cmCount.textContent = approved.length ? '(' + toBn(approved.length) + ')' : '';
      if (!approved.length && !still.length) cmList.appendChild(el('p', 'cm__empty', 'এখনো কোনো মন্তব্য নেই।'));
    };
    var fetchList = function () {
      if (cmDemo) { render([]); return; }
      fetch(cmEnd + '/comments?post=' + encodeURIComponent(cmPost)).then(function (r) { return r.json(); })
        .then(function (d) { render(d.comments || []); })
        .catch(function () { render([]); });
    };
    if ('IntersectionObserver' in window) {
      var cmIo = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { cmIo.disconnect(); fetchList(); } }, { rootMargin: '600px 0px' });
      cmIo.observe(cm);
    } else fetchList();
    cmForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = cmForm.elements, text = f.text.value.trim();
      if (!f.name.value.trim()) { cmMsg.textContent = 'আপনার নাম লিখুন।'; cmMsg.className = 'cm__msg is-err'; f.name.focus(); return; }
      if (text.length < 2) { cmMsg.textContent = 'আগে মন্তব্য লিখুন।'; cmMsg.className = 'cm__msg is-err'; f.text.focus(); return; }
      var btn = $('.cm__send', cmForm); btn.disabled = true; btn.textContent = 'পাঠানো হচ্ছে…';
      var name = f.name.value.trim();
      if (cmDemo) {
        var pd = readP(); (pd[cmPost] = pd[cmPost] || []).push({ id: 'demo' + Date.now(), name: name, text: text, ts: Date.now() }); writeP(pd);
        f.text.value = '';
        cmMsg.textContent = 'ধন্যবাদ, আপনার মন্তব্য জমা হয়েছে।';
        cmMsg.className = 'cm__msg is-ok'; btn.disabled = false; btn.textContent = 'মন্তব্য পাঠান'; fetchList(); return;
      }
      fetch(cmEnd + '/comments', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ post: cmPost, title: cm.getAttribute('data-title'), url: cm.getAttribute('data-url'), name: name, text: text, website: f.website.value })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (x) {
        if (!x.ok) throw new Error(x.d.error || 'পাঠানো যায়নি');
        var p = readP(); (p[cmPost] = p[cmPost] || []).push({ id: x.d.id, name: name, text: text, ts: Date.now() }); writeP(p);
        f.text.value = '';
        cmMsg.textContent = 'ধন্যবাদ, আপনার মন্তব্য জমা হয়েছে।';
        cmMsg.className = 'cm__msg is-ok';
        fetchList();
      }).catch(function (err) {
        cmMsg.textContent = err.message || 'পাঠানো যায়নি, আবার চেষ্টা করুন।'; cmMsg.className = 'cm__msg is-err';
      }).then(function () { btn.disabled = false; btn.textContent = 'মন্তব্য পাঠান'; });
    });
  }

  // ---------- মন্তব্য (ক্লিকে লোড) ----------
  var cBtn = $('[data-comments-open]');
  if (cBtn) {
    var load = function () {
      var tpl = $('[data-comments-tpl]'), body = $('[data-comments-body]');
      if (!tpl || body.childNodes.length) return;
      var html = tpl.innerHTML;
      var wrap = doc.createElement('div'); wrap.innerHTML = html;
      $$('script', wrap).forEach(function (s) {
        var n = doc.createElement('script');
        Array.prototype.forEach.call(s.attributes, function (a) { n.setAttribute(a.name, a.value); });
        n.text = s.text; s.replaceWith(n);
      });
      while (wrap.firstChild) body.appendChild(wrap.firstChild);
      cBtn.hidden = true;
    };
    cBtn.addEventListener('click', load);
    if (location.hash === '#comments') load();
  }

  // ---------- সূচিপত্রে বর্তমান অংশ ----------
  var tocLinks = $$('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    tocLinks.forEach(function (a) { map[decodeURIComponent(a.hash.slice(1))] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { tocLinks.forEach(function (a) { a.classList.remove('is-current'); }); var a = map[en.target.id]; a && a.classList.add('is-current'); }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    Object.keys(map).forEach(function (id) { var el = doc.getElementById(id); el && io.observe(el); });
  }

  // ---------- তালিকা ফিল্টার (লেখক তালিকা) ----------
  $$('[data-filter]').forEach(function (inp) {
    var items = $$(inp.getAttribute('data-filter'));
    inp.addEventListener('input', function () {
      var q = inp.value.trim().toLowerCase();
      items.forEach(function (el) { el.hidden = q && el.textContent.toLowerCase().indexOf(q) === -1; });
    });
  });

  // ---------- লেখক পাতার বিভাগ-ছাঁকনি ----------
  $$('.chips').forEach(function (box) {
    var cards = $$('[data-grid] .card-g');
    $$('.chip-btn', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-chip');
        $$('.chip-btn', box).forEach(function (x) { var on = x === b; x.classList.toggle('is-active', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        cards.forEach(function (c) { c.hidden = !!k && c.getAttribute('data-cat') !== k; });
      });
    });
  });

  // ---------- অনুসন্ধান পাতা ----------
  var results = $('[data-search-results]');
  if (results) {
    var q = (params.get('s') || '').trim();
    var input = $('#ps'); if (input) input.value = q;
    var countEl = $('[data-search-count]'), titleEl = $('[data-search-title]'), pagesEl = $('[data-search-pages]');
    var esc = function (s) { return String(s || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var norm = function (s) { return String(s || '').toLowerCase().normalize('NFC').replace(/[‌‍]/g, '').replace(/[০-৯]/g, function (d) { return BN.indexOf(d); }); };
    if (!q) { countEl.textContent = 'কী খুঁজছেন লিখুন।'; }
    else {
      titleEl.textContent = 'অনুসন্ধানের ফলাফল: ' + q;
      doc.title = 'অনুসন্ধান: ' + q + ' | কেয়ারি';
      fetch(BASE + '/search-index.json').then(function (r) { return r.json(); }).then(function (idx) {
        var terms = norm(q).split(/\s+/).filter(Boolean);
        var scored = idx.map(function (it) {
          var t = norm(it.t), a = norm(it.a), c = norm(it.c), e = norm(it.e), g = norm(it.g), s = 0;
          for (var k = 0; k < terms.length; k++) {
            var w = terms[k], hit = false;
            if (t.indexOf(w) > -1) { s += 10; hit = true; }
            if (a.indexOf(w) > -1) { s += 6; hit = true; }
            if (c.indexOf(w) > -1 || g.indexOf(w) > -1) { s += 4; hit = true; }
            if (e.indexOf(w) > -1) { s += 2; hit = true; }
            if (!hit) return null;
          }
          return { it: it, s: s };
        }).filter(Boolean).sort(function (x, y) { return y.s - x.s; });
        var per = 12, page = Math.max(1, +params.get('page') || 1), total = Math.ceil(scored.length / per);
        countEl.textContent = scored.length ? bn(scored.length) + 'টি লেখা পাওয়া গেছে' : 'দুঃখিত, কিছু পাওয়া যায়নি। অন্য শব্দে খুঁজে দেখুন।';
        results.innerHTML = scored.slice((page - 1) * per, page * per).map(function (x) {
          var it = x.it;
          var h = 0, sl = it.as || 'x'; for (var q = 0; q < sl.length; q++) h += sl.charCodeAt(q); h = h % 360;
          var av = it.ap ? '<img class="avatar avatar--xs" src="' + esc(it.ap) + '" alt="" width="26" height="26" loading="lazy">' : '<span class="avatar avatar--xs avatar--ph" style="--h:' + h + '" aria-hidden="true">' + esc((it.a || '?').charAt(0)) + '</span>';
          return '<article class="card-g"><a class="card-g__media" href="' + it.u + '" tabindex="-1" aria-hidden="true">' +
            (it.i ? '<img class="card-g__img" data-lz src="' + esc(it.i) + '" alt="' + esc(it.t) + '" loading="lazy" width="1169" height="658">' : '<div class="ph card-g__img" role="img"><span class="sr-only">কেয়ারি</span></div>') +
            '</a><div class="card-g__body">' +
            (it.cl ? '<p class="card-g__cat"><a href="' + (it.cu || '#') + '">' + esc(it.cl) + '</a></p>' : '') +
            '<h3 class="card-g__title"><a href="' + it.u + '">' + esc(it.t) + '</a></h3>' +
            '<p class="card__excerpt clamp-3">' + esc(it.e) + '</p>' +
            '<p class="card-g__by"><span class="card__author"><span class="aname">' + av + '<span class="aname__t">' + esc(it.a) + '</span></span></span><span aria-hidden="true"> · </span><time>' + esc(it.d) + '</time></p></div></article>';
        }).join('');
        if (total > 1 && pagesEl) {
          var h = '';
          for (var n = 1; n <= total; n++) {
            var href = BASE + '/search/?s=' + encodeURIComponent(q) + '&page=' + n;
            h += n === page ? '<span class="pg pg--cur" aria-current="page">' + bn(n) + '</span>' : '<a class="pg" href="' + href + '">' + bn(n) + '</a>';
          }
          pagesEl.innerHTML = h;
        }
      }).catch(function () { countEl.textContent = 'অনুসন্ধান সূচি লোড হয়নি। একটু পরে আবার চেষ্টা করুন।'; });
    }
  }
})();
