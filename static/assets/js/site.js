/* কেয়ারি — সাইটের ইন্টারঅ্যাকশন (কোনো লাইব্রেরি ছাড়া) */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
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
  var ring = toTop && $('circle', toTop), bar = $('.read-progress span');
  var article = doc.body.classList.contains('single') ? $('.entry-content') : null;
  var ticking = false;
  function onScroll() {
    var y = window.scrollY, h = doc.documentElement.scrollHeight - window.innerHeight;
    if (header) {
      var menuOpen = $('.nav__item.is-open') || ($('#search-pop') && !$('#search-pop').hidden);
      if (y > lastY && y > 200 && !menuOpen) header.classList.add('is-hidden');
      else header.classList.remove('is-hidden');
    }
    lastY = y;
    var p = h > 0 ? Math.min(1, y / h) : 0;
    if (ring) ring.style.strokeDashoffset = String(138.2 * (1 - p));
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

  // ---------- সার্চ ড্রপডাউন ----------
  var pop = $('#search-pop'), openBtn = $('[data-search-open]');
  function closeSearch() { if (pop && !pop.hidden) { pop.hidden = true; openBtn && openBtn.setAttribute('aria-expanded', 'false'); } }
  if (openBtn && pop) {
    openBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (pop.hidden) { pop.hidden = false; openBtn.setAttribute('aria-expanded', 'true'); setTimeout(function () { $('input', pop).focus(); }, 20); }
      else closeSearch();
    });
    $('[data-search-close]', pop).addEventListener('click', closeSearch);
    doc.addEventListener('click', function (e) { if (!pop.contains(e.target)) closeSearch(); });
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
    var interval = +sl.getAttribute('data-interval') || 5000;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function go(n) {
      i = (n + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle('is-active', k === i); s.setAttribute('aria-hidden', k === i ? 'false' : 'true'); $$('a', s).forEach(function (a) { a.tabIndex = k === i ? 0 : -1; }); });
      dots.forEach(function (d, k) { d.classList.toggle('is-active', k === i); d.setAttribute('aria-current', k === i ? 'true' : 'false'); });
    }
    function play() { if (reduce) return; stop(); t = setInterval(function () { go(i + 1); }, interval); }
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

  // ---------- লেখার আকার ----------
  var fsBtns = $$('[data-fs]');
  if (fsBtns.length) {
    fsBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var d = +b.getAttribute('data-fs');
        var cur = parseFloat(getComputedStyle(root).getPropertyValue('--read-size')) || 17;
        var nv = d === 0 ? 17 : Math.min(24, Math.max(14, cur + d));
        root.style.setProperty('--read-size', nv + 'px'); store.set('keyari-fs', nv);
        toast('লেখার আকার: ' + bn(nv));
      });
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
          return '<article class="card-v"><div class="card-v__media"><a href="' + it.u + '" tabindex="-1">' +
            (it.i ? '<img class="card-v__img" src="' + esc(it.i) + '" alt="' + esc(it.t) + '" loading="lazy" width="1169" height="658">' : '<div class="ph"><span>কেয়ারি</span></div>') +
            '</a></div><p class="card__meta"><span class="card__author">' + esc(it.a) + '</span> · ' + esc(it.d) + ' · ' + esc(it.c) + '</p>' +
            '<h2 class="card-v__title"><a href="' + it.u + '">' + esc(it.t) + '</a></h2><p class="card__excerpt clamp-3">' + esc(it.e) + '</p></article>';
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
