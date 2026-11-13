#!/usr/bin/env python3
"""
কেয়ারি — স্ট্যাটিক সাইট বিল্ডার
শুধু Python 3.9+ স্ট্যান্ডার্ড লাইব্রেরি; কোনো বাড়তি প্যাকেজ লাগে না।

  python build.py                 → dist/ ফোল্ডারে পুরো সাইট তৈরি
  python build.py --serve         → তৈরি করে http://localhost:8000 এ দেখায়
  python build.py --drafts        → খসড়াসহ তৈরি (শুধু পরীক্ষার জন্য)

পরিবেশ ভ্যারিয়েবল (GitHub Actions নিজে বসিয়ে দেয়):
  SITE_URL   = https://thekeyari.com   (না দিলে settings.json থেকে)
  BASE_PATH  = /repo-name              (GitHub Pages প্রজেক্ট সাইট হলে)
  GITHUB_REPOSITORY, GITHUB_REF_NAME → অ্যাডমিন প্যানেলের কনফিগে যায়
"""
import html
import json
import math
import os
import re
import shutil
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
STATIC = ROOT / "static"
ADMIN = ROOT / "admin"
DIST = ROOT / "dist"
TZ = timezone(timedelta(hours=6))
NOW = datetime.now(TZ)
INCLUDE_DRAFTS = "--drafts" in sys.argv

# ------------------------------------------------------------------ helpers
BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")
MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট",
          "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"]


def bn(n):
    return str(n).translate(BN_DIGITS)


def bn_date(dt):
    return f"{bn(dt.day)} {MONTHS[dt.month - 1]} {bn(dt.year)}"


def esc(s):
    return html.escape(str(s or ""), quote=True)


def strip_tags(s):
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", s or "", flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def truncate(s, n):
    s = s.strip()
    return s if len(s) <= n else s[: n].rsplit(" ", 1)[0] + "…"


def parse_date(s):
    if not s:
        return NOW
    s = s.replace("Z", "+00:00")
    try:
        d = datetime.fromisoformat(s)
    except ValueError:
        d = datetime.fromisoformat(s[:19])
    if d.tzinfo is None:
        d = d.replace(tzinfo=TZ)
    return d.astimezone(TZ)


def slugify(s):
    s = re.sub(r"[\s‌‍]+", "-", s.strip())
    s = re.sub(r"[^\w\-ঀ-৿]", "", s)
    return re.sub(r"-+", "-", s).strip("-").lower()


def load(name, default=None):
    p = CONTENT / name
    if not p.exists():
        return default
    return json.loads(p.read_text("utf-8"))


def load_dir(name):
    d = CONTENT / name
    out = []
    if d.exists():
        for f in sorted(d.glob("*.json")):
            try:
                item = json.loads(f.read_text("utf-8"))
            except json.JSONDecodeError as e:
                print(f"⚠ JSON ত্রুটি: {f}: {e}")
                continue
            item.setdefault("id", f.stem)
            out.append(item)
    return out


# ------------------------------------------------------------------ config
S = load("settings.json", {})
SITE_URL = (os.environ.get("SITE_URL") or S.get("site_url") or "").rstrip("/")
BASE = (os.environ.get("BASE_PATH") or "").rstrip("/")
_pages = os.environ.get("PAGES_BASE_URL")  # GitHub Pages-এর আসল ঠিকানা (Actions দেয়)
if _pages and not os.environ.get("SITE_URL"):
    _pp = urllib.parse.urlparse(_pages)
    SITE_URL = f"{_pp.scheme}://{_pp.netloc}"
    BASE = _pp.path.rstrip("/")
if BASE and not BASE.startswith("/"):
    BASE = "/" + BASE
SITE = S.get("site_name", "কেয়ারি")
SEP = S.get("seo", {}).get("title_separator", "|")


def u(path):
    """সাইটের ভেতরের লিংক (BASE সহ, এনকোড করা)"""
    if not path:
        return BASE + "/"
    if re.match(r"^(https?:|mailto:|tel:|#|data:|blob:)", path):
        return path
    if not path.startswith("/"):
        path = "/" + path
    return urllib.parse.quote(BASE + path, safe="/:?=&#%+@,;~")


def absu(path):
    if re.match(r"^https?:", path or ""):
        return path
    return SITE_URL + u(path)


def asset(path):
    """ছবির পাথ — বাইরের URL হলে অপরিবর্তিত, ভেতরের হলে BASE সহ"""
    if not path:
        return ""
    if re.match(r"^(https?:|data:)", path):
        return path
    return u(path)


# ------------------------------------------------------------------ data
CATS = load("categories.json", [])
CAT = {c["slug"]: c for c in CATS}
for c in CATS:
    c.setdefault("order", 99)
    c["children"] = sorted([x for x in CATS if x.get("parent") == c["slug"]], key=lambda x: x.get("order", 99))
TOP_CATS = sorted([c for c in CATS if not c.get("parent")], key=lambda x: x.get("order", 99))


def cat_url(slug):
    c = CAT.get(slug)
    if not c:
        return u("/")
    if c.get("parent"):
        return u(f"/category/{c['parent']}/{slug}/")
    return u(f"/category/{slug}/")


def cat_path(slug):
    c = CAT[slug]
    return f"/category/{c['parent']}/{slug}/" if c.get("parent") else f"/category/{slug}/"


AUTHORS = load("authors.json", [])
AUTH = {a["slug"]: a for a in AUTHORS}
MENU = load("menu.json", {"header": [], "footer": []})
HOME = load("home.json", {})
STYLES = load("styles.json", {})


def is_live(item):
    st = item.get("status", "draft")
    if INCLUDE_DRAFTS and st != "trash":
        return True
    if st not in ("published", "scheduled"):
        return False
    return parse_date(item.get("date")) <= NOW


POSTS_ALL = load_dir("posts")
POSTS = [p for p in POSTS_ALL if is_live(p)]


def post_sort_key(p):
    m = re.search(r"\d+", p["id"])
    return (p["_date"], int(m.group()) if m else 0)


for p in POSTS:
    p["_date"] = parse_date(p.get("date"))
    p["_modified"] = parse_date(p.get("modified") or p.get("date"))
    p["slug"] = p.get("slug") or slugify(p["title"])
    p["_path"] = f"/{p['_date']:%Y/%m/%d}/{p['slug']}/"
    p["_url"] = u(p["_path"])
    text = strip_tags(p.get("body", ""))
    p["_words"] = len(text.split())
    if not p.get("excerpt"):
        p["excerpt"] = truncate(text, 220)
    # কার্ডে ৩ লাইন ভরার মতো লম্বা সারাংশ (CSS তৃতীয় লাইনে "…" বসায়)
    p["_long"] = p["excerpt"] if len(p["excerpt"]) >= 240 else truncate(text, 320)
    cats = [c for c in p.get("categories", []) if c in CAT]
    # প্রধান বিভাগ (টপ-লেভেল) ও উপ-বিভাগ
    top = next((c for c in cats if not CAT[c].get("parent")), None)
    sub = next((c for c in cats if CAT[c].get("parent")), None)
    if not top and sub:
        top = CAT[sub]["parent"]
    p["_top"], p["_sub"] = top, sub
    p["_cats"] = [c for c in [top, sub] if c] + [c for c in cats if c not in (top, sub)]
    p["_author"] = AUTH.get(p.get("author")) or {"slug": p.get("author") or "keyari", "name": p.get("author") or SITE}

POSTS.sort(key=post_sort_key, reverse=True)
POST_BY_ID = {p["id"]: p for p in POSTS}

PAGES = [p for p in load_dir("pages") if is_live(p) or p.get("status") == "published"]
AYOJON = sorted([a for a in load_dir("ayojon") if a.get("status", "published") == "published"],
                key=lambda a: (a.get("number", 0), a.get("date", "")), reverse=True)

# সিরিজ (ধারাবাহিক)
SERIES = {}
for p in POSTS:
    s = p.get("series")
    if s and s.get("name"):
        key = slugify(s["name"])
        SERIES.setdefault(key, {"name": s["name"], "slug": key, "posts": []})["posts"].append(p)
for s in SERIES.values():
    s["posts"].sort(key=lambda x: (x["series"].get("part") or 0, x["_date"]))
    for p in s["posts"]:
        p["_series"] = s

# লেখকের লেখা
for a in AUTHORS:
    a["_posts"] = [p for p in POSTS if p["_author"].get("slug") == a["slug"]]

# ------------------------------------------------------------------ HTML processing


def process_body(body, with_footnotes=True):
    b = body or ""
    # Word/Elementor-এর আবর্জনা বাদ
    b = re.sub(r"<!--\[if.*?endif\]-->", "", b, flags=re.S)
    b = re.sub(r"</?o:p>", "", b)
    b = re.sub(r"mso-[\w-]+:[^;\"']*;?\s*", "", b)
    b = re.sub(r"font-family\s*:[^;\"]*;?", "", b)  # শুধু সাইটের একটি ফন্ট
    b = re.sub(r'\s(?:face)="[^"]*"', "", b)
    b = re.sub(r'\sstyle="\s*"', "", b)
    b = re.sub(r'\s(data-elementor-[\w-]+|data-element_type|data-e-type|data-widget_type|data-id)="[^"]*"', "", b)
    b = re.sub(r"<script\b.*?</script>", "", b, flags=re.S | re.I)
    # ছবি: lazy-load
    b = re.sub(r"<img(?![^>]*\bloading=)", '<img loading="lazy" decoding="async"', b)
    # ভেতরের /uploads পাথে BASE যোগ
    if BASE:
        b = re.sub(r'(src|href)="/(?!/)', lambda m: f'{m.group(1)}="{BASE}/', b)
    # টেবিল স্ক্রল র‍্যাপার
    b = re.sub(r"(<table\b.*?</table>)", r'<div class="table-wrap">\1</div>', b, flags=re.S)
    # শিরোনামে id (সূচিপত্রের জন্য)
    seen = set()

    def hid(m):
        tag, attrs, inner = m.group(1), m.group(2), m.group(3)
        if "id=" in attrs:
            return m.group(0)
        base = slugify(strip_tags(inner))[:60] or "section"
        i, hid_ = 2, base
        while hid_ in seen:
            hid_ = f"{base}-{i}"
            i += 1
        seen.add(hid_)
        return f'<{tag} id="{hid_}"{attrs}>{inner}</{tag}>'
    b = re.sub(r"<(h[2-4])([^>]*)>(.*?)</\1>", hid, b, flags=re.S)
    notes = []
    if with_footnotes:
        def fn(m):
            notes.append(html.unescape(m.group(1)))
            n = len(notes)
            return f'<sup class="fn-ref" id="fnref-{n}"><a href="#fn-{n}" aria-label="টীকা {bn(n)}">{bn(n)}</a></sup>'
        b = re.sub(r'<sup class="fn-ref" data-note="([^"]*)"[^>]*>.*?</sup>', fn, b, flags=re.S)
        if notes:
            items = "".join(f'<li id="fn-{i}">{esc(t)} <a href="#fnref-{i}" class="fn-back" aria-label="ফিরে যান">↩</a></li>'
                            for i, t in enumerate(notes, 1))
            b += f'<section class="footnotes" aria-label="টীকা"><h2 class="footnotes__title">টীকা ও তথ্যসূত্র</h2><ol>{items}</ol></section>'
    return b


def toc_from(body):
    items = re.findall(r'<h([23]) id="([^"]+)"[^>]*>(.*?)</h\1>', body, flags=re.S)
    if len(items) < 2:
        return ""
    lis = "".join(f'<li class="toc__l{lvl}"><a href="#{hid}">{esc(strip_tags(t))}</a></li>' for lvl, hid, t in items)
    return f'<nav class="toc" aria-label="সূচিপত্র"><p class="toc__title">সূচিপত্র</p><ol>{lis}</ol></nav>'


def fonts_in(body):
    return []


def style_css():
    """styles.json → CSS (InDesign-এর মতো স্টাইল শিট)"""
    out = ["/* স্বয়ংক্রিয়ভাবে তৈরি — content/styles.json থেকে। হাতে বদলাবেন না। */"]
    prefix = {"paragraph": ".ps-", "character": ".cs-", "table": "table.ts-", "cell": ".tc-"}
    for kind, pre in prefix.items():
        for st in STYLES.get(kind, []):
            sel = pre + st["id"]
            decl = ";".join(f"{k}:{v}" for k, v in (st.get("css") or {}).items() if v not in (None, ""))
            if decl:
                out.append(f"{sel}{{{decl}}}")
            if st.get("extra"):
                extra = st["extra"].replace("&", sel)
                out.append(extra)
    return "\n".join(out) + "\n"


# ------------------------------------------------------------------ icons
def icon(name, size=20):
    paths = {
        "search": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
        "menu": '<path d="M4 7h16M4 12h16M4 17h16"/>',
        "close": '<path d="M6 6l12 12M18 6 6 18"/>',
        "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
        "moon": '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
        "chev": '<path d="m6 9 6 6 6-6"/>',
        "right": '<path d="m9 6 6 6-6 6"/>',
        "left": '<path d="m15 6-6 6 6 6"/>',
        "up": '<path d="m6 15 6-6 6 6"/>',
        "facebook": '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H8v4h2v6h4v-6h3l1-4h-4V8a0 0 0 0 1 0 0z"/>',
        "x": '<path d="M4 4l16 16M20 4 4 20"/>',
        "linkedin": '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/>',
        "whatsapp": '<path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 9.5c.5 2 2.5 4 4.5 4.5l1-1 2 1c-.3 1.2-1.3 1.8-2.5 1.6C11 15 9 13 8.4 10.5 8.2 9.3 8.8 8.3 10 8l1 2z"/>',
        "link": '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
        "rss": '<path d="M5 19h.01M5 12a7 7 0 0 1 7 7M5 5a14 14 0 0 1 14 14"/>',
        "mail": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
        "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        "calendar": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
        "file-x": '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9.5 12.5l5 5M14.5 12.5l-5 5"/>',
        "copy": '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
        "youtube": '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/>',
        "instagram": '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5v.01"/>',
    }
    return (f'<svg class="i i-{name}" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths.get(name, "")}</svg>')


# ------------------------------------------------------------------ components
def logo_img(cls="logo", eager=False):
    src = asset(S.get("logo") or "/assets/img/logo.svg")
    dark = asset(S.get("logo_dark") or "")
    fallback = u("/assets/img/logo.svg")
    attrs = f'width="92" height="54" alt="{esc(SITE)}" onerror="this.onerror=null;this.src=\'{fallback}\'"'
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    if dark:
        return (f'<picture class="{cls}"><source srcset="{dark}" media="(prefers-color-scheme: dark)" data-dark>'
                f'<img src="{src}" {attrs} {load}></picture>')
    return f'<img class="{cls}" src="{src}" {attrs} {load}>'


def img_tag(src, alt, cls="", w=1169, h=658, eager=False, sizes=""):
    if not src:
        return f'<div class="ph {cls}" role="img" aria-label="{esc(alt)}"><span class="sr-only">{esc(SITE)}</span></div>'
    s = asset(src)
    srcset = ""
    m = re.match(r"^(/uploads/.+?)(\.webp)$", src)
    if m and (STATIC / (m.group(1).lstrip("/") + "-640.webp")).exists():
        srcset = f' srcset="{asset(m.group(1) + "-640.webp")} 640w, {s} 1600w" sizes="{sizes or "(max-width: 768px) 100vw, 800px"}"'
    load = 'fetchpriority="high" decoding="async"' if eager else 'loading="lazy" decoding="async"'
    return f'<img class="{cls}" data-lz src="{s}"{srcset} alt="{esc(alt)}" width="{w}" height="{h}" {load}>'


def pills(p, cls="pill", limit=2):
    out = []
    for slug in p["_cats"][:limit]:
        c = CAT[slug]
        out.append(f'<a class="{cls}" href="{cat_url(slug)}">{esc(c["name"])}</a>')
    return "".join(out)


def meta_line(p, author=True, date=True, read=True):
    parts = []
    if author:
        a = p["_author"]
        parts.append(f'<a class="meta__author" href="{u("/author/" + a["slug"] + "/")}">{esc(a["name"])}</a>')
    if date:
        parts.append(f'<time class="meta__date" datetime="{p["_date"].isoformat()}">{bn_date(p["_date"])}</time>')
    return '<div class="meta">' + '<span class="meta__dot" aria-hidden="true">·</span>'.join(parts) + "</div>"


def translator_line(p):
    t = p.get("translator")
    return f'<p class="card__translator">অনুবাদ : {esc(t)}</p>' if t else ""


def card_h(p, eager=False):
    return f'''<article class="card-h">
  <a class="card-h__media" href="{p["_url"]}" tabindex="-1" aria-hidden="true">{img_tag(p["cover"].get("src"), p["cover"].get("alt") or p["title"], "card-h__img", eager=eager, sizes="(max-width: 575px) 100vw, 400px")}</a>
  <div class="card-h__pills">{pills(p, "pill pill--img")}</div>
  <div class="card-h__body">
    <a class="card__author" href="{u("/author/" + p["_author"]["slug"] + "/")}">{esc(p["_author"]["name"])}</a>
    <h3 class="card-h__title"><a href="{p["_url"]}">{esc(p["title"])}</a></h3>
    <p class="card__excerpt clamp-3">{esc(p["_long"])}</p>
    <div class="card__foot">
      <a class="btn" href="{p["_url"]}">পুরোটা পড়ুন<span class="sr-only">: {esc(p["title"])}</span></a>
      <span class="card__meta">{bn_date(p["_date"])}</span>
    </div>
  </div>
</article>'''


def card_v(p, show_date=True, heading="h3"):
    return f'''<article class="card-v">
  <div class="card-v__media"><a href="{p["_url"]}" tabindex="-1" aria-hidden="true">{img_tag(p["cover"].get("src"), p["cover"].get("alt") or p["title"], "card-v__img", sizes="(max-width: 767px) 100vw, 400px")}</a>
  <div class="card-v__pills">{pills(p, "pill pill--img")}</div></div>
  {('<p class="card__meta"><a class="card__author" href="' + u("/author/" + p["_author"]["slug"] + "/") + '">' + esc(p["_author"]["name"]) + '</a> · ' + bn_date(p["_date"]) + '</p>') if show_date else ''}
  <{heading} class="card-v__title"><a href="{p["_url"]}">{esc(p["title"])}</a></{heading}>
  <p class="card__excerpt clamp-3">{esc(p["_long"])}</p>
</article>'''


def card_small(p):
    return f'''<article class="card-s">
  <div class="card-s__body">
    <h3 class="card-s__title"><a href="{p["_url"]}">{esc(p["title"])}</a></h3>
    <p class="card__excerpt clamp-3">{esc(p["_long"])}</p>
    <div class="card-s__pills">{pills(p, "pill pill--soft")}</div>
  </div>
  <a class="card-s__media" href="{p["_url"]}" tabindex="-1" aria-hidden="true">{img_tag(p["cover"].get("src"), p["title"], "card-s__img", 160, 160, sizes="160px")}</a>
</article>'''


def card_overlay(p):
    return f'''<a class="card-o" href="{p["_url"]}">
  {img_tag(p["cover"].get("src"), p["title"], "card-o__img", sizes="370px")}
  <span class="card-o__shade"></span>
  <span class="card-o__body"><span class="badge">{esc(CAT[p["_cats"][0]]["name"]) if p["_cats"] else ""}</span>
  <span class="card-o__title">{esc(p["title"])}</span><span class="card-o__author">{esc(p["_author"]["name"])}</span></span>
</a>'''


def pagination(cur, total, base):
    if total <= 1:
        return ""

    def href(n):
        return u(base) if n == 1 else u(f"{base}page/{n}/")
    pages = sorted({1, total, cur - 1, cur, cur + 1} & set(range(1, total + 1)))
    out, last = [], 0
    if cur > 1:
        out.append(f'<a class="pg pg--nav" href="{href(cur - 1)}" rel="prev" aria-label="পূর্ববর্তী পাতা">{icon("left", 18)}</a>')
    for n in pages:
        if n - last > 1:
            out.append('<span class="pg pg--gap" aria-hidden="true">…</span>')
        if n == cur:
            out.append(f'<span class="pg pg--cur" aria-current="page">{bn(n)}</span>')
        else:
            out.append(f'<a class="pg" href="{href(n)}">{bn(n)}</a>')
        last = n
    if cur < total:
        out.append(f'<a class="pg pg--nav" href="{href(cur + 1)}" rel="next" aria-label="পরবর্তী পাতা">{icon("right", 18)}</a>')
    return f'<nav class="pagination" aria-label="পাতা নম্বর">{"".join(out)}</nav>'


def section_head(title, link=None, link_label="সব দেখুন", center=False, h="h2"):
    more = f'<a class="sec-head__more" href="{link}">{link_label} {icon("right", 16)}</a>' if link else ""
    return f'<div class="sec-head{" sec-head--center" if center else ""}"><{h} class="sec-head__title">{esc(title)}</{h}>{more}</div>'


def slider_posts():
    cfg = HOME.get("slider", {})
    n = cfg.get("count", 5)
    picks = [p for p in POSTS if p.get("pick")]
    if cfg.get("mode") == "latest":
        picks = []
    for p in POSTS:
        if len(picks) >= n:
            break
        if p not in picks:
            picks.append(p)
    return picks[:n]


def sidebar(exclude=None):
    sl = slider_posts()
    slides = "".join(f'<div class="slide" role="group" aria-roledescription="স্লাইড" aria-label="{bn(i + 1)} / {bn(len(sl))}">{card_overlay(p)}</div>' for i, p in enumerate(sl))
    dots = "".join(f'<button class="slider__dot" type="button" aria-label="স্লাইড {bn(i + 1)}"></button>' for i in range(len(sl)))
    title = HOME.get("slider", {}).get("title", "পাঠকের পছন্দ")
    featured = [p for p in POSTS if p.get("featured") and p is not exclude][:4]
    if len(featured) < 4:
        pool = [p for p in POSTS[10:] if p is not exclude and p not in featured and p not in sl]
        step = max(1, len(pool) // 4) if pool else 1
        featured += pool[::step][: 4 - len(featured)]
    feat_html = "".join(
        f'<li class="mini"><a class="mini__media" href="{p["_url"]}" tabindex="-1" aria-hidden="true">{img_tag(p["cover"].get("src"), p["title"], "mini__img", 96, 96, sizes="96px")}</a>'
        f'<div><a class="mini__title" href="{p["_url"]}">{esc(p["title"])}</a><span class="mini__author">{esc(p["_author"]["name"])}</span></div></li>'
        for p in featured)
    cat_list = "".join(
        f'<li><a href="{cat_url(c["slug"])}"><span>{esc(c.get("icon", ""))} {esc(c["name"])}</span><span class="count">{bn(cat_count(c["slug"]))}</span></a></li>'
        for c in TOP_CATS)
    ay = ""
    if AYOJON:
        a = AYOJON[0]
        ay = f'''<div class="widget"><h2 class="sec-label">চলমান আয়োজন</h2>
<a class="ay-mini" href="{u(ayojon_path(a))}">{img_tag(a.get("banner", {}).get("src"), a["title"], "ay-mini__img", sizes="370px")}<span class="ay-mini__title">{esc(a["title"])}</span></a></div>'''
    return f'''<aside class="sidebar" aria-label="পার্শ্বতালিকা">
  <div class="widget">
    <h2 class="sec-label">{esc(title)}</h2>
    <div class="slider" data-slider data-interval="5000">
      <div class="slider__track">{slides}</div>
      <button class="slider__arrow slider__arrow--prev" type="button" aria-label="আগের স্লাইড">{icon("left", 18)}</button>
      <button class="slider__arrow slider__arrow--next" type="button" aria-label="পরের স্লাইড">{icon("right", 18)}</button>
      <div class="slider__dots">{dots}</div>
    </div>
  </div>
  <div class="widget"><h2 class="sec-label">সম্পাদকের বাছাই</h2><ul class="mini-list">{feat_html}</ul></div>
  {ay}
  <div class="widget"><h2 class="sec-label">বিভাগসমূহ</h2><ul class="cat-list">{cat_list}</ul></div>
  <div class="widget widget--cta">
    <h2 class="cta-mini__title">লেখা পাঠান</h2>
    <p>আপনার অপ্রকাশিত রচনা ও শিল্পকাজ পাঠান কেয়ারির ঠিকানায়।</p>
    <a class="btn btn--light" href="{u("/বিশেষ-বার্তা/")}">নীতিমালা পড়ুন</a>
    <a class="cta-mini__mail" href="mailto:{esc(S.get("email"))}">{icon("mail", 16)} {esc(S.get("email"))}</a>
  </div>
</aside>'''


_cat_counts = {}


def cat_posts(slug):
    keys = {slug} | {c["slug"] for c in CAT[slug]["children"]}
    return [p for p in POSTS if keys & set(p["_cats"])]


def cat_count(slug):
    if slug not in _cat_counts:
        _cat_counts[slug] = len(cat_posts(slug))
    return _cat_counts[slug]


def ayojon_path(a):
    return f"/আয়োজন/{a.get('slug') or a['id']}/"


# ------------------------------------------------------------------ layout
def app_attrs():
    return ' target="_blank" rel="noopener"' if S.get("app_url") else ""


def header(active=""):
    def is_act(item):
        return active and item.get("label") == active

    items = []
    for it in MENU.get("header", []):
        cls = "nav__item" + (" is-active" if is_act(it) else "")
        if it.get("type") == "mega":
            cols = {}
            for c in TOP_CATS:
                cols.setdefault(c.get("column", 1), []).append(c)
            col_html = ""
            for k in sorted(cols):
                groups = ""
                for c in cols[k]:
                    subs = "".join(f'<li><a href="{cat_url(s["slug"])}">{esc(s["name"])}</a></li>' for s in c["children"])
                    groups += (f'<div class="mega__group"><a class="mega__cat" href="{cat_url(c["slug"])}">{esc(c["name"])}</a>'
                               + (f'<ul class="mega__subs">{subs}</ul>' if subs else "") + "</div>")
                col_html += f'<div class="mega__col">{groups}</div>'
            feature = ""
            if AYOJON:
                a = AYOJON[0]
                feature = (f'<a class="mega__feature" href="{u(ayojon_path(a))}">{img_tag(a.get("banner", {}).get("src"), a["title"], "mega__feature-img", sizes="260px")}'
                           f'<span class="mega__feature-label">সর্বশেষ আয়োজন</span><span class="mega__feature-title">{esc(a["title"])}</span></a>')
            items.append(f'''<li class="{cls} has-sub has-mega">
  <a class="nav__link" href="{u(it.get("url") or "/বিষয়সূচি/")}" aria-haspopup="true" aria-expanded="false">{esc(it["label"])}{icon("chev", 14)}</a>
  <div class="mega" role="region" aria-label="{esc(it["label"])}"><div class="mega__cols">{col_html}</div>{feature}</div>
</li>''')
        elif it.get("children"):
            subs = "".join(f'<li><a href="{u(c["url"])}">{esc(c["label"])}</a></li>' for c in it["children"])
            items.append(f'''<li class="{cls} has-sub">
  <a class="nav__link" href="{u(it.get("url") or "#")}" aria-haspopup="true" aria-expanded="false">{esc(it["label"])}{icon("chev", 14)}</a>
  <ul class="dropdown">{subs}</ul>
</li>''')
        else:
            items.append(f'<li class="{cls}"><a class="nav__link" href="{u(it.get("url", "/"))}"{" aria-current=page" if is_act(it) else ""}>{esc(it["label"])}</a></li>')

    # মোবাইল মেনু
    m_items = []
    for it in MENU.get("header", []):
        if it.get("type") == "mega":
            subs = ""
            for c in TOP_CATS:
                kids = "".join(f'<li><a href="{cat_url(s["slug"])}">{esc(s["name"])}</a></li>' for s in c["children"])
                subs += f'<li><a class="m-cat" href="{cat_url(c["slug"])}">{esc(c["name"])}</a>' + (f'<ul class="m-kids">{kids}</ul>' if kids else "") + "</li>"
            m_items.append(f'<li class="m-item"><div class="m-row"><a href="{u(it.get("url") or "/বিষয়সূচি/")}">{esc(it["label"])}</a><button class="m-toggle" type="button" aria-expanded="false" aria-label="{esc(it["label"])} খুলুন">{icon("chev", 18)}</button></div><ul class="m-sub">{subs}</ul></li>')
        elif it.get("children"):
            subs = "".join(f'<li><a href="{u(c["url"])}">{esc(c["label"])}</a></li>' for c in it["children"])
            m_items.append(f'<li class="m-item"><div class="m-row"><a href="{u(it.get("url") or "#")}">{esc(it["label"])}</a><button class="m-toggle" type="button" aria-expanded="false" aria-label="{esc(it["label"])} খুলুন">{icon("chev", 18)}</button></div><ul class="m-sub">{subs}</ul></li>')
        else:
            m_items.append(f'<li class="m-item"><div class="m-row"><a href="{u(it.get("url", "/"))}">{esc(it["label"])}</a></div></li>')

    toggle = f'''<button class="scheme-toggle" type="button" data-scheme-toggle aria-label="আলো/আঁধার মোড বদলান">
      <span class="scheme-toggle__opt scheme-toggle__opt--light">{icon("sun", 16)}</span><span class="scheme-toggle__opt scheme-toggle__opt--dark">{icon("moon", 16)}</span></button>'''
    return f'''<a class="skip-link" href="#main">মূল লেখায় যান</a>
<div class="read-progress" aria-hidden="true"><span></span></div>
<header class="site-header" data-header>
  <div class="container site-header__inner">
    <button class="icon-btn hamburger" type="button" data-offcanvas-open aria-label="মেনু খুলুন" aria-controls="offcanvas">{icon("menu", 22)}</button>
    <a class="site-logo" href="{u("/")}" rel="home" aria-label="{esc(SITE)} — মুখপাতা">{logo_img(eager=True)}</a>
    <nav class="nav" aria-label="প্রধান মেনু"><ul class="nav__list">{"".join(items)}</ul></nav>
    <div class="header-tools">
      <button class="icon-btn" type="button" data-search-open aria-label="অনুসন্ধান" aria-controls="search-pop" aria-expanded="false">{icon("search", 20)}</button>
      <span class="header-tools__sep" aria-hidden="true"></span>
      {toggle}
      <a class="btn btn--fb" href="{esc(S.get("app_url") or "#")}"{app_attrs()}>অ্যাপে পড়ুন</a>
    </div>
    <div class="search-pop" id="search-pop" role="dialog" aria-label="অনুসন্ধান" hidden>
      <button class="icon-btn search-pop__close" type="button" data-search-close aria-label="বন্ধ করুন">{icon("close", 18)}</button>
      <form class="search-form" action="{u("/search/")}" method="get" role="search">
        <label class="sr-only" for="hs">লেখা, লেখক বা বিষয় খুঁজুন</label>
        <input id="hs" type="search" name="s" placeholder="লেখা, লেখক বা বিষয় খুঁজুন…" autocomplete="off" required>
        <button class="btn" type="submit">খুঁজুন</button>
      </form>
    </div>
  </div>
</header>
<div class="offcanvas" id="offcanvas" aria-hidden="true" aria-label="মোবাইল মেনু" role="dialog">
  <div class="offcanvas__head">
    <a href="{u("/")}" class="site-logo">{logo_img()}</a>
    <button class="icon-btn" type="button" data-offcanvas-close aria-label="মেনু বন্ধ করুন">{icon("close", 22)}</button>
  </div>
  <form class="search-form search-form--m" action="{u("/search/")}" method="get" role="search">
    <label class="sr-only" for="ms">খুঁজুন</label><input id="ms" type="search" name="s" placeholder="খুঁজুন…" required><button class="btn" type="submit">খুঁজুন</button>
  </form>
  <ul class="m-nav">{"".join(m_items)}</ul>
  <a class="btn btn--block" href="{esc(S.get("app_url") or "#")}"{app_attrs()}>অ্যাপে পড়ুন</a>
  <div class="offcanvas__foot">{toggle}</div>
</div>
<div class="offcanvas-backdrop" data-offcanvas-close hidden></div>'''


def footer():
    year = NOW.year
    start = S.get("copyright_start", year)
    yr = bn(year) if start == year else f"{bn(start)}–{bn(year)}"
    cats = "".join(f'<li><a href="{cat_url(c["slug"])}">{esc(c["name"])}</a></li>' for c in TOP_CATS)
    cols = ""
    for col in MENU.get("footer", []):
        links = "".join(f'<li><a href="{u(l["url"])}">{esc(l["label"])}</a></li>' for l in col.get("links", []))
        cols += f'<div class="footer__col"><h2 class="footer__title">{esc(col["title"])}</h2><ul>{links}</ul></div>'
    social = [f'<a class="social" href="{esc(S.get("facebook"))}" target="_blank" rel="noopener" aria-label="ফেসবুক">{icon("facebook", 18)}</a>']
    for k, ic, label in [("x", "x", "এক্স"), ("youtube", "youtube", "ইউটিউব"), ("instagram", "instagram", "ইনস্টাগ্রাম")]:
        if S.get("social", {}).get(k):
            social.append(f'<a class="social" href="{esc(S["social"][k])}" target="_blank" rel="noopener" aria-label="{label}">{icon(ic, 18)}</a>')
    social.append(f'<a class="social" href="{u("/feed.xml")}" aria-label="আরএসএস ফিড">{icon("rss", 18)}</a>')
    return f'''<footer class="site-footer">
  <div class="container">
    <div class="footer__grid">
      <div class="footer__col footer__brand">
        <a href="{u("/")}" class="site-logo">{logo_img()}</a>
        <p class="footer__desc">{esc(S.get("tagline"))} — {esc(S.get("description", "").split("—")[-1].strip()[:140])}</p>
        <div class="footer__social">{"".join(social)}</div>
      </div>
      <div class="footer__col"><h2 class="footer__title">বিভাগসমূহ</h2><ul class="footer__cats">{cats}</ul></div>
      {cols}
      <div class="footer__col"><h2 class="footer__title">লেখা পাঠান</h2>
        <p class="footer__desc">অপ্রকাশিত রচনা ও শিল্পকাজ পাঠানোর আগে <a href="{u("/বিশেষ-বার্তা/")}">বিশেষ বার্তা</a> পড়ে নিন।</p>
        <a class="footer__mail" href="mailto:{esc(S.get("email"))}">{icon("mail", 16)} {esc(S.get("email"))}</a>
        <p class="footer__desc">সম্পাদক : {esc(S.get("editor_name"))}</p>
      </div>
    </div>
    <div class="footer__bottom">
      <p>{esc(S.get("footer_notice"))}</p>
      <p>স্বত্ব © {yr} — {esc(SITE)} · সকল বিষয় সংরক্ষিত</p>
    </div>
  </div>
</footer>
<button class="to-top" type="button" data-to-top aria-label="উপরে যান">
  <svg class="to-top__ring" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22"/></svg>{icon("up", 20)}</button>
<div class="toast" role="status" aria-live="polite" hidden></div>'''


def jsonld(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False).replace("</", "<\\/") + "</script>"


def org_ld():
    logo = "/assets/img/icon-512.png"
    return {"@type": "Organization", "@id": SITE_URL + "/#org", "name": SITE, "alternateName": S.get("site_name_en"),
            "url": SITE_URL + u("/"), "logo": {"@type": "ImageObject", "url": absu(logo)},
            "email": S.get("email"), "sameAs": [x for x in [S.get("facebook")] + list(S.get("social", {}).values()) if x]}


def layout(*, title, description, path, body, active="", og_image="", og_type="website", ld=None,
           extra_head="", noindex=False, body_class="", fonts=None, prev_next=None):
    canonical = absu(path)
    full_title = title if title == SITE else f"{title} {SEP} {SITE}"
    desc = truncate(strip_tags(description or S.get("description", "")), 158)
    img = absu(og_image or S.get("default_og_image") or "/assets/img/og-default.png")
    seo = S.get("seo", {})
    ga = seo.get("google_analytics")
    lds = [{"@context": "https://schema.org", "@graph": [org_ld(), {
        "@type": "WebSite", "@id": SITE_URL + "/#website", "url": SITE_URL + u("/"), "name": SITE, "inLanguage": "bn",
        "description": S.get("description"), "publisher": {"@id": SITE_URL + "/#org"},
        "potentialAction": {"@type": "SearchAction", "target": SITE_URL + u("/search/") + "?s={search_term_string}",
                            "query-input": "required name=search_term_string"}}] + (ld or [])}]
    verify = ""
    if seo.get("google_site_verification"):
        verify += f'<meta name="google-site-verification" content="{esc(seo["google_site_verification"])}">'
    if seo.get("bing_site_verification"):
        verify += f'<meta name="msvalidate.01" content="{esc(seo["bing_site_verification"])}">'
    pn = ""
    if prev_next:
        if prev_next[0]:
            pn += f'<link rel="prev" href="{absu(prev_next[0])}">'
        if prev_next[1]:
            pn += f'<link rel="next" href="{absu(prev_next[1])}">'
    analytics = ""
    if ga:
        analytics = (f'<script async src="https://www.googletagmanager.com/gtag/js?id={esc(ga)}"></script>'
                     f"<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}gtag('js',new Date());gtag('config','{esc(ga)}');</script>")
    return f'''<!doctype html>
<html lang="bn" dir="ltr" data-scheme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(full_title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{canonical}">
<meta name="robots" content="{"noindex, follow" if noindex else "index, follow, max-image-preview:large, max-snippet:-1"}">
{pn}
<meta property="og:locale" content="bn_BD">
<meta property="og:site_name" content="{esc(SITE)}">
<meta property="og:type" content="{og_type}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{canonical}">
{f'<meta property="og:image" content="{esc(img)}"><meta property="og:image:alt" content="{esc(title)}">' if img else ""}
{f'<meta property="fb:app_id" content="{esc(seo["facebook_app_id"])}">' if seo.get("facebook_app_id") else ""}
<meta name="twitter:card" content="summary_large_image">
{f'<meta name="twitter:site" content="{esc(seo["twitter_handle"])}">' if seo.get("twitter_handle") else ""}
<meta name="theme-color" content="#FDFDFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1C1C1C" media="(prefers-color-scheme: dark)">
{verify}
<link rel="icon" href="{asset(S.get("favicon") or "/assets/img/favicon.svg")}">
<link rel="icon" type="image/png" sizes="192x192" href="{u("/assets/img/icon-192.png")}">
<link rel="apple-touch-icon" href="{u("/assets/img/icon-180.png")}">
<link rel="manifest" href="{u("/manifest.webmanifest")}">
<link rel="alternate" type="application/rss+xml" title="{esc(SITE)} — ফিড" href="{u("/feed.xml")}">
<link rel="preload" href="{u("/assets/fonts/NotoSerifByGunjoron-Regular.woff")}" as="font" type="font/woff" crossorigin>
<link rel="preload" href="{u("/assets/fonts/NotoSerifByGunjoron-Bold.woff")}" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="{u("/assets/css/fonts.css")}?v={BUILD_ID}">
<link rel="stylesheet" href="{u("/assets/css/site.css")}?v={BUILD_ID}">
<link rel="stylesheet" href="{u("/assets/css/styles.css")}?v={BUILD_ID}">
<script>(function(){{try{{var s=localStorage.getItem('keyari-scheme');if(!s)s=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-scheme',s);var f=localStorage.getItem('keyari-fs');if(f)document.documentElement.style.setProperty('--read-size',f+'px')}}catch(e){{}}}})();window.KEYARI={{base:"{BASE}"}};</script>
{extra_head}
{"".join(jsonld(x) for x in lds)}
{analytics}
</head>
<body class="{body_class}">
{header(active)}
<main id="main" class="site-main">
{body}
</main>
{footer()}
<script src="{u("/assets/js/site.js")}?v={BUILD_ID}" defer></script>
</body>
</html>'''


BUILD_ID = NOW.strftime("%Y%m%d%H%M")


def write(path, content):
    path = path.strip("/")
    target = DIST / path
    if not path or not re.search(r"\.[a-z0-9]+$", path):
        target = target / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, "utf-8")


def breadcrumb(items):
    """items: [(label, path or None)]"""
    lis = []
    for i, (label, path) in enumerate(items):
        if path and i < len(items) - 1:
            lis.append(f'<li><a href="{u(path)}">{esc(label)}</a></li>')
        else:
            lis.append(f'<li aria-current="page">{esc(label)}</li>')
    ld = {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": label, **({"item": absu(path)} if path else {})}
        for i, (label, path) in enumerate(items)]}
    return f'<nav class="breadcrumb" aria-label="অবস্থান"><ol>{"".join(lis)}</ol></nav>', ld


# ------------------------------------------------------------------ pages
def build_home():
    per = S.get("posts_per_page", 10)
    hero_cfg = HOME.get("hero", {})
    main = None
    if hero_cfg.get("mode") == "manual" and hero_cfg.get("main") in POST_BY_ID:
        main = POST_BY_ID[hero_cfg["main"]]
    if not main:
        mc = hero_cfg.get("main_category")
        main = next((p for p in POSTS if mc and mc in p["_cats"]), None) or (POSTS[0] if POSTS else None)
    side = [POST_BY_ID[i] for i in hero_cfg.get("side", []) if i in POST_BY_ID] if hero_cfg.get("mode") == "manual" else []
    for p in POSTS:
        if len(side) >= 3:
            break
        if p is not main and p not in side:
            side.append(p)
    hero_ids = {id(main)} | {id(p) for p in side}
    feed = [p for p in POSTS if id(p) not in hero_ids]
    total = max(1, math.ceil(len(feed) / per))
    sections = {s["type"]: s for s in HOME.get("sections", [])}

    def on(t):
        return sections.get(t, {}).get("enabled", True)

    for page in range(1, total + 1):
        chunk = feed[(page - 1) * per: page * per]
        parts = []
        if page == 1 and on("hero") and main:
            parts.append(f'''<section class="hero container" aria-label="প্রধান লেখা">
  <article class="hero__main">
    <a class="hero__media" href="{main["_url"]}" tabindex="-1" aria-hidden="true">{img_tag(main["cover"].get("src"), main["cover"].get("alt") or main["title"], "hero__img", eager=True, sizes="(max-width: 991px) 100vw, 720px")}</a>
    <span class="badge badge--img">{esc(CAT[main["_cats"][0]]["name"]) if main["_cats"] else ""}</span>
    <div class="hero__body">
      <a class="card__author" href="{u("/author/" + main["_author"]["slug"] + "/")}">{esc(main["_author"]["name"])}</a>
      <h2 class="hero__title"><a href="{main["_url"]}">{esc(main["title"])}</a></h2>
      <p class="hero__excerpt clamp-3">{esc(main.get("subtitle") or main["_long"])}</p>
      <p class="card__meta">{bn_date(main["_date"])}</p>
    </div>
  </article>
  <div class="hero__side">{"".join(card_small(p) for p in side)}</div>
</section>''')
        if page == 1 and on("category_pills"):
            pills_html = "".join(f'<a class="pill-lg" href="{cat_url(c["slug"])}"><span aria-hidden="true">{esc(c.get("icon", ""))}</span>{esc(c["name"])}</a>'
                                 for c in TOP_CATS if c.get("home_pill", True))
            parts.append(f'''<section class="topics container" aria-labelledby="topics-h">
  <h2 class="sec-label sec-label--center" id="topics-h">{esc(sections.get("category_pills", {}).get("title", "পছন্দসই বিষয়ে লেখা পড়ুন"))}</h2>
  <div class="topics__list">{pills_html}</div>
</section>''')
        if page == 1 and on("ayojon") and AYOJON:
            a = AYOJON[0]
            aps = [POST_BY_ID[i] for i in a.get("posts", []) if i in POST_BY_ID]
            cards = "".join(f'<a class="ay-card" href="{p["_url"]}">{img_tag(p["cover"].get("src"), p["title"], "ay-card__img", sizes="260px")}<span class="ay-card__title">{esc(p["title"])}</span><span class="ay-card__author">{esc(p["_author"]["name"])}</span></a>' for p in aps)
            parts.append(f'''<section class="ayojon-band" aria-labelledby="ay-h">
  <div class="container ayojon-band__inner">
    <div class="ayojon-band__intro">
      <p class="sec-label">চলমান আয়োজন{(" · সংখ্যা " + bn(a["number"])) if a.get("number") else ""}</p>
      <h2 class="ayojon-band__title" id="ay-h"><a href="{u(ayojon_path(a))}">{esc(a["title"])}</a></h2>
      <p class="ayojon-band__sub">{esc(a.get("subtitle", ""))}</p>
      <a class="btn" href="{u(ayojon_path(a))}">পুরো আয়োজন দেখুন</a>
    </div>
    <a class="ayojon-band__banner" href="{u(ayojon_path(a))}" tabindex="-1" aria-hidden="true">{img_tag(a.get("banner", {}).get("src"), a["title"], "ayojon-band__img", sizes="(max-width: 991px) 100vw, 600px")}</a>
  </div>
  <div class="container"><div class="hscroll" tabindex="0" aria-label="আয়োজনের লেখাসমূহ">{cards}</div></div>
</section>''')
        feed_title = sections.get("feed", {}).get("title", "সর্বশেষ লেখা")
        parts.append(f'''<div class="container with-sidebar{" with-sidebar--top" if page > 1 else ""}">
  <section class="feed" aria-labelledby="feed-h">
    {section_head(feed_title if page == 1 else feed_title + " — পাতা " + bn(page), h="h2").replace('class="sec-head__title"', 'class="sec-head__title" id="feed-h"')}
    <div class="feed__list">{"".join(card_h(p) for p in chunk)}</div>
    {pagination(page, total, "/")}
  </section>
  {sidebar()}
</div>''')
        if page == 1 and on("category_blocks"):
            cb = sections.get("category_blocks", {})
            blocks = ""
            for slug in cb.get("categories", []):
                if slug not in CAT:
                    continue
                ps = cat_posts(slug)[: cb.get("count", 4)]
                if not ps:
                    continue
                blocks += f'''<section class="cat-block container" aria-label="{esc(CAT[slug]["name"])}">
  {section_head(CAT[slug]["name"], cat_url(slug))}
  <div class="grid grid--4">{"".join(card_v(p, show_date=False) for p in ps)}</div>
</section>'''
            parts.append(blocks)
        if page == 1 and on("series") and SERIES:
            ser = sorted(SERIES.values(), key=lambda s: max(p["_date"] for p in s["posts"]), reverse=True)[:6]
            items = "".join(f'''<a class="series-card" href="{u("/ধারাবাহিক/" + s["slug"] + "/")}">
  {img_tag(s["posts"][-1]["cover"].get("src"), s["name"], "series-card__img", sizes="300px")}
  <span class="series-card__body"><span class="series-card__name">{esc(s["name"])}</span>
  <span class="series-card__count">{bn(len(s["posts"]))}টি পর্ব · {esc(s["posts"][0]["_author"]["name"])}</span></span></a>''' for s in ser)
            parts.append(f'''<section class="series-block container" aria-label="ধারাবাহিক">
  {section_head(sections.get("series", {}).get("title", "ধারাবাহিক"), u("/ধারাবাহিক/"))}
  <div class="grid grid--3">{items}</div></section>''')
        if page == 1 and on("authors"):
            n = sections.get("authors", {}).get("count", 12)
            top_authors = sorted([a for a in AUTHORS if a["_posts"]], key=lambda a: (-len(a["_posts"]), a["name"]))[:n]
            items = "".join(f'<a class="author-chip" href="{u("/author/" + a["slug"] + "/")}">{avatar(a, 64)}<span class="author-chip__name">{esc(a["name"])}</span><span class="author-chip__count">{bn(len(a["_posts"]))}টি লেখা</span></a>' for a in top_authors)
            parts.append(f'''<section class="authors-strip container" aria-label="লেখক পরিচিতি">
  {section_head(sections.get("authors", {}).get("title", "লেখক পরিচিতি"), u("/লেখক-তালিকা/"), "সব লেখক")}
  <div class="authors-strip__list">{items}</div></section>''')
        if page == 1 and on("cta"):
            c = sections.get("cta", {})
            parts.append(f'''<section class="cta container" aria-labelledby="cta-h">
  <div class="cta__box">
    <h2 class="cta__title" id="cta-h">{esc(c.get("title", "আপনার লেখা পাঠান"))}</h2>
    <p class="cta__text">{esc(c.get("text", ""))}</p>
    <div class="cta__actions"><a class="btn btn--light" href="{u("/বিশেষ-বার্তা/")}">লেখা পাঠানোর নীতিমালা</a>
    <button class="btn btn--ghost" type="button" data-copy="{esc(S.get("email"))}">{icon("copy", 16)} {esc(S.get("email"))}</button></div>
  </div></section>''')
        path = "/" if page == 1 else f"/page/{page}/"
        prev_p = None if page == 1 else ("/" if page == 2 else f"/page/{page - 1}/")
        next_p = f"/page/{page + 1}/" if page < total else None
        write(path, layout(
            title=SITE if page == 1 else f"সর্বশেষ লেখা — পাতা {bn(page)}",
            description=S.get("description"), path=path, body="\n".join(parts), active="মুখপাতা",
            og_image=(main["cover"].get("src") if (page == 1 and main) else ""), body_class="home",
            ld=[{"@type": "CollectionPage", "url": absu(path), "name": SITE, "inLanguage": "bn",
                 "isPartOf": {"@id": SITE_URL + "/#website"}}], prev_next=(prev_p, next_p)))


def avatar(a, size=64):
    if a.get("photo"):
        return f'<img class="avatar" src="{asset(a["photo"])}" alt="{esc(a["name"])}" width="{size}" height="{size}" style="width:{size}px;height:{size}px" loading="lazy">'
    initial = (a.get("name") or "?").strip()[:1]
    hue = sum(ord(ch) for ch in a.get("slug", "x")) % 360
    return f'<span class="avatar avatar--ph" style="--h:{hue};width:{size}px;height:{size}px;font-size:{round(size * 0.4)}px" aria-hidden="true">{esc(initial)}</span>'


def share_bar(p):
    url = urllib.parse.quote(absu(p["_path"]), safe="")
    t = urllib.parse.quote(p["title"], safe="")
    return f'''<div class="share" aria-label="শেয়ার করুন">
  <span class="share__label">শেয়ার</span>
  <a class="share__btn" href="https://www.facebook.com/sharer/sharer.php?u={url}" target="_blank" rel="noopener" aria-label="ফেসবুকে শেয়ার">{icon("facebook", 18)}</a>
  <a class="share__btn" href="https://x.com/intent/post?url={url}&text={t}" target="_blank" rel="noopener" aria-label="এক্স-এ শেয়ার">{icon("x", 18)}</a>
  <a class="share__btn" href="https://api.whatsapp.com/send?text={t}%20{url}" target="_blank" rel="noopener" aria-label="হোয়াটসঅ্যাপে শেয়ার">{icon("whatsapp", 18)}</a>
  <a class="share__btn" href="https://www.linkedin.com/sharing/share-offsite/?url={url}" target="_blank" rel="noopener" aria-label="লিংকডইনে শেয়ার">{icon("linkedin", 18)}</a>
  <button class="share__btn" type="button" data-copy="{esc(absu(p["_path"]))}" aria-label="লিংক কপি করুন">{icon("link", 18)}</button>
</div>'''


def comments_html(p):
    if p.get("comments") is False:
        return ""
    c = S.get("comments", {})
    prov = c.get("provider", "none")
    url = absu(p["_path"])
    if prov == "giscus" and c.get("giscus", {}).get("repo"):
        g = c["giscus"]
        embed = (f'<script src="https://giscus.app/client.js" data-repo="{esc(g["repo"])}" data-repo-id="{esc(g["repo_id"])}" '
                 f'data-category="{esc(g["category"])}" data-category-id="{esc(g["category_id"])}" data-mapping="pathname" '
                 f'data-reactions-enabled="1" data-input-position="top" data-theme="preferred_color_scheme" data-lang="bn" crossorigin="anonymous" async></script>')
    elif prov == "cusdis" and c.get("cusdis", {}).get("app_id"):
        cu = c["cusdis"]
        host = cu.get("host") or "https://cusdis.com"
        embed = (f'<div id="cusdis_thread" data-host="{esc(host)}" data-app-id="{esc(cu["app_id"])}" data-page-id="{esc(p["id"])}" '
                 f'data-page-url="{esc(url)}" data-page-title="{esc(p["title"])}" data-theme="auto"></div>'
                 f'<script async defer src="{esc(host)}/js/cusdis.es.js"></script>')
    elif prov == "disqus" and c.get("disqus", {}).get("shortname"):
        sn = c["disqus"]["shortname"]
        embed = (f'<div id="disqus_thread"></div><script>var disqus_config=function(){{this.page.url="{url}";this.page.identifier="{esc(p["id"])}";this.language="bn"}};'
                 f'(function(){{var d=document,s=d.createElement("script");s.src="https://{esc(sn)}.disqus.com/embed.js";s.setAttribute("data-timestamp",+new Date());(d.head||d.body).appendChild(s)}})();</script>')
    elif prov == "facebook":
        embed = (f'<div id="fb-root"></div><script async defer crossorigin="anonymous" src="https://connect.facebook.net/bn_IN/sdk.js#xfbml=1&version=v19.0"></script>'
                 f'<div class="fb-comments" data-href="{esc(url)}" data-width="100%" data-numposts="10"></div>')
    else:
        embed = (f'<div class="comment-fallback"><p>লেখাটি নিয়ে আপনার মতামত জানাতে ইমেইল করুন অথবা আমাদের ফেসবুক পেজে লিখুন।</p>'
                 f'<p><a class="btn btn--light" href="mailto:{esc(S.get("email"))}?subject={urllib.parse.quote("মতামত: " + p["title"])}">{icon("mail", 16)} ইমেইলে মতামত</a> '
                 f'<a class="btn btn--light" href="{esc(S.get("facebook"))}" target="_blank" rel="noopener">{icon("facebook", 16)} ফেসবুকে মতামত</a></p></div>')
    tpl = embed  # <template>-এর ভেতরের script নিষ্ক্রিয় থাকে; ক্লিকে site.js চালু করে
    return f'''<section class="comments" id="comments" aria-label="মন্তব্য">
  <button class="btn" type="button" data-comments-open>মন্তব্য লিখুন</button>
  <template data-comments-tpl>{tpl}</template>
  <div class="comments__body" data-comments-body></div>
</section>'''


def build_post(p):
    a = p["_author"]
    crumbs = [("মুখপাতা", "/")]
    if p["_top"]:
        crumbs.append((CAT[p["_top"]]["name"], cat_path(p["_top"])))
    if p["_sub"]:
        crumbs.append((CAT[p["_sub"]]["name"], cat_path(p["_sub"])))
    crumbs.append((p["title"], p["_path"]))
    bc_html, bc_ld = breadcrumb(crumbs)
    body = process_body(p.get("body", ""))
    layout_opts = p.get("layout") or {}
    is_poetry = any(c == "kobitapunjo" or (CAT[c].get("parent") == "kobitapunjo") for c in p["_cats"])
    body_cls = "entry-content" + ("" if (layout_opts.get("justify", True) and not is_poetry) else " no-justify") + (" has-dropcap" if layout_opts.get("dropcap") else "")
    # সিরিজ
    series_html = ""
    s = p.get("_series")
    if s and len(s["posts"]) > 1:
        idx = s["posts"].index(p)
        prev_p = s["posts"][idx - 1] if idx > 0 else None
        next_p = s["posts"][idx + 1] if idx < len(s["posts"]) - 1 else None
        lis = "".join(f'<li{" aria-current=true" if x is p else ""}><a href="{x["_url"]}">{esc(x["title"])}</a></li>' for x in s["posts"])
        series_html = f'''<nav class="series-nav" aria-label="ধারাবাহিক: {esc(s["name"])}">
  <p class="series-nav__label">ধারাবাহিক · <a href="{u("/ধারাবাহিক/" + s["slug"] + "/")}">{esc(s["name"])}</a></p>
  <ol class="series-nav__list">{lis}</ol>
  <div class="series-nav__pn">
    {f'<a class="btn btn--light" href="{prev_p["_url"]}" rel="prev">{icon("left", 16)} পূর্ববর্তী পর্ব</a>' if prev_p else '<span></span>'}
    {f'<a class="btn" href="{next_p["_url"]}" rel="next">পরবর্তী পর্ব {icon("right", 16)}</a>' if next_p else ''}
  </div>
</nav>'''
    # সম্পর্কিত
    related = [x for x in POSTS if x is not p and p["_top"] and p["_top"] in x["_cats"]][:3]
    for x in POSTS:
        if len(related) >= 3:
            break
        if x is not p and x not in related:
            related.append(x)
    others = [x for x in a.get("_posts", []) if x is not p][:4] if a.get("_posts") is not None else []
    other_html = "".join(f'<li><a href="{x["_url"]}">{esc(x["title"])}</a></li>' for x in others)
    cats_html = "".join(f'<a class="pill pill--soft" href="{cat_url(c)}">{esc(CAT[c]["name"])}</a>' for c in p["_cats"])
    tags_html = "".join(f'<span class="tag">#{esc(t)}</span>' for t in p.get("tags", []))
    cover = p.get("cover") or {}
    ay = ""
    if p.get("ayojon"):
        aobj = next((x for x in AYOJON if x["id"] == p["ayojon"]), None)
        if aobj:
            ay = f'<p class="entry-ayojon">আয়োজন : <a href="{u(ayojon_path(aobj))}">{esc(aobj["title"])}</a></p>'
    toc = toc_from(body) if layout_opts.get("toc") else ""
    content = f'''<article class="entry" itemscope itemtype="https://schema.org/Article">
  <header class="entry-header container">
    {bc_html}
    <a class="entry-author" href="{u("/author/" + a["slug"] + "/")}">{esc(a["name"])}</a>
    <h1 class="entry-title" itemprop="headline">{esc(p["title"])}</h1>
    {f'<p class="entry-subtitle">{esc(p["subtitle"])}</p>' if p.get("subtitle") else ""}
    {f'<p class="entry-translator">অনুবাদ : {esc(p["translator"])}</p>' if p.get("translator") else ""}
    <div class="entry-meta">
      <span>{icon("calendar", 16)} <time datetime="{p["_date"].isoformat()}" itemprop="datePublished">{bn_date(p["_date"])}</time></span>
      <span>{bn(p["_words"])} শব্দ</span>
    </div>
    {ay}
    <figure class="entry-cover">{img_tag(cover.get("src"), cover.get("alt") or p["title"], "entry-cover__img", eager=True, sizes="(max-width: 1296px) 100vw, 1248px")}
    {f'<figcaption>{esc(cover["caption"])}</figcaption>' if cover.get("caption") else ""}</figure>
  </header>
  <div class="container entry-layout">
    <div class="entry-rail">{share_bar(p)}
      <div class="font-tools" aria-label="লেখার আকার"><button type="button" data-fs="-1" aria-label="লেখা ছোট করুন">অ-</button><button type="button" data-fs="0" aria-label="স্বাভাবিক আকার">অ</button><button type="button" data-fs="1" aria-label="লেখা বড় করুন">অ+</button></div>
    </div>
    <div class="entry-main">
      {series_html if p["series"] and (p["series"].get("part") or 0) > 1 else ""}
      {toc}
      <div class="{body_cls}" itemprop="articleBody">{body}</div>
      {series_html}
      <footer class="entry-footer">
        <div class="entry-footer__by"><a class="meta__author" href="{u("/author/" + a["slug"] + "/")}">{esc(a["name"])}</a> · {bn_date(p["_date"])}</div>
        <div class="entry-footer__cats">{cats_html}</div>
        {f'<div class="entry-footer__tags">{tags_html}</div>' if tags_html else ""}
      </footer>
      <div class="share share--inline-wrap">{share_bar(p)}</div>
      <section class="author-box" aria-label="লেখক পরিচিতি">
        {avatar(a, 88)}
        <div class="author-box__body">
          <p class="sec-label">লেখক পরিচিতি</p>
          <h2 class="author-box__name"><a href="{u("/author/" + a["slug"] + "/")}">{esc(a["name"])}</a></h2>
          {f'<p class="author-box__bio">{esc(a["bio"])}</p>' if a.get("bio") else ""}
          {f'<p class="sec-label">লেখকের আরও লেখা</p><ul class="author-box__more">{other_html}</ul>' if other_html else ""}
        </div>
      </section>
      {comments_html(p)}
    </div>
    {sidebar(exclude=p)}
  </div>
  <section class="read-next container" aria-labelledby="rn-h">
    <h2 class="read-next__title" id="rn-h">আরও পড়ুন</h2>
    <div class="grid grid--3">{"".join(card_v(x) for x in related)}</div>
  </section>
</article>'''
    seo = p.get("seo") or {}
    img = seo.get("og_image") or cover.get("src") or ""
    ld = [{
        "@type": "Article", "@id": absu(p["_path"]) + "#article", "headline": p["title"][:110],
        "description": seo.get("description") or p["excerpt"], "inLanguage": "bn",
        "image": [absu(img)] if img else None, "datePublished": p["_date"].isoformat(),
        "dateModified": p["_modified"].isoformat(), "wordCount": p["_words"],
        "author": {"@type": "Person", "name": a["name"], "url": absu("/author/" + a["slug"] + "/")},
        "publisher": {"@id": SITE_URL + "/#org"}, "mainEntityOfPage": absu(p["_path"]),
        "articleSection": [CAT[c]["name"] for c in p["_cats"]], "keywords": ", ".join(p.get("tags", [])) or None,
        **({"translator": {"@type": "Person", "name": p["translator"]}} if p.get("translator") else {}),
        **({"isPartOf": {"@type": "CreativeWorkSeries", "name": p["series"]["name"]}} if p.get("series") else {}),
    }, bc_ld]
    ld[0] = {k: v for k, v in ld[0].items() if v is not None}
    title = seo.get("title") or f'{p["title"]} — {a["name"]}'
    extra = (f'<meta property="article:published_time" content="{p["_date"].isoformat()}">'
             f'<meta property="article:modified_time" content="{p["_modified"].isoformat()}">'
             f'<meta property="article:author" content="{esc(a["name"])}">'
             + "".join(f'<meta property="article:section" content="{esc(CAT[c]["name"])}">' for c in p["_cats"][:1])
             + "".join(f'<meta property="article:tag" content="{esc(t)}">' for t in p.get("tags", [])))
    if seo.get("canonical"):
        extra += ""  # canonical নিচে layout-এ path থেকে আসে
    write(p["_path"], layout(title=title, description=seo.get("description") or p.get("subtitle") or p["excerpt"],
                             path=p["_path"], body=content, active="বিষয়সূচি", og_image=img, og_type="article", ld=ld,
                             extra_head=extra, noindex=seo.get("noindex", False) or p.get("status") != "published",
                             body_class="single", fonts=fonts_in(p.get("body"))))


def archive_page(*, path, title, items, crumbs, header_html, description, active="বিষয়সূচি", per=None, ld_type="CollectionPage",
                 header_cls="archive-header", before_grid="", card_fn=None):
    per = per or S.get("archive_per_page", 12)
    total = max(1, math.ceil(len(items) / per))
    bc_html, bc_ld = breadcrumb(crumbs)
    for page in range(1, total + 1):
        chunk = items[(page - 1) * per: page * per]
        ppath = path if page == 1 else f"{path}page/{page}/"
        grid = "".join((card_fn or card_v)(p) for p in chunk) or '<p class="empty">এই বিভাগে এখনো কোনো লেখা প্রকাশিত হয়নি।</p>'
        body = f'''<div class="container archive">
  {bc_html}
  <header class="{header_cls}">{header_html}</header>
  {before_grid}
  <div class="grid grid--3" data-grid>{grid}</div>
  {pagination(page, total, path)}
</div>'''
        prev_p = None if page == 1 else (path if page == 2 else f"{path}page/{page - 1}/")
        next_p = f"{path}page/{page + 1}/" if page < total else None
        write(ppath, layout(title=title if page == 1 else f"{title} — পাতা {bn(page)}", description=description,
                            path=ppath, body=body, active=active, ld=[{"@type": ld_type, "url": absu(ppath), "name": title, "inLanguage": "bn"}, bc_ld],
                            og_image=(chunk[0]["cover"].get("src") if chunk else ""), prev_next=(prev_p, next_p)))


def build_categories():
    for c in CATS:
        items = cat_posts(c["slug"])
        crumbs = [("মুখপাতা", "/"), ("বিষয়সূচি", "/বিষয়সূচি/")]
        if c.get("parent") and c["parent"] in CAT:
            crumbs.append((CAT[c["parent"]]["name"], cat_path(c["parent"])))
        crumbs.append((c["name"], cat_path(c["slug"])))
        kids = "".join(f'<a class="pill-lg pill-lg--sm" href="{cat_url(k["slug"])}">{esc(k["name"])} <span class="count">{bn(cat_count(k["slug"]))}</span></a>' for k in c["children"])
        siblings = ""
        if c.get("parent") and c["parent"] in CAT:
            sib = CAT[c["parent"]]["children"]
            siblings = "".join(f'<a class="pill-lg pill-lg--sm{" is-active" if k["slug"] == c["slug"] else ""}" href="{cat_url(k["slug"])}">{esc(k["name"])}</a>' for k in sib)
        header_html = f'''<p class="sec-label">{"উপ-বিভাগ" if c.get("parent") else "বিভাগ"} · {bn(len(items))}টি লেখা</p>
<h1 class="archive-title">{esc(c.get("icon", "") + " " if not c.get("parent") else "")}{esc(c["name"])}</h1>
{f'<p class="archive-desc">{esc(c["description"])}</p>' if c.get("description") else ""}
{f'<div class="archive-kids">{kids or siblings}</div>' if (kids or siblings) else ""}'''
        archive_page(path=cat_path(c["slug"]), title=c.get("seo_title") or c["name"], items=items, crumbs=crumbs, header_html=header_html,
                     description=c.get("description") or f'{c["name"]} বিভাগের সব লেখা — {SITE}')
    # বিষয়সূচি (সব বিভাগ)
    cards = ""
    for c in TOP_CATS:
        latest = cat_posts(c["slug"])[:1]
        kids = "".join(f'<li><a href="{cat_url(k["slug"])}">{esc(k["name"])}</a> <span class="count">{bn(cat_count(k["slug"]))}</span></li>' for k in c["children"])
        cards += f'''<article class="topic-card">
  <a class="topic-card__media" href="{cat_url(c["slug"])}" tabindex="-1" aria-hidden="true">{img_tag(latest[0]["cover"].get("src") if latest else "", c["name"], "topic-card__img", sizes="400px")}</a>
  <div class="topic-card__body"><h2 class="topic-card__title"><a href="{cat_url(c["slug"])}"><span aria-hidden="true">{esc(c.get("icon", ""))}</span> {esc(c["name"])}</a></h2>
  <p class="archive-desc">{esc(c.get("description", ""))}</p><p class="card__meta">{bn(cat_count(c["slug"]))}টি লেখা</p>
  {f'<ul class="topic-card__kids">{kids}</ul>' if kids else ""}</div></article>'''
    bc_html, bc_ld = breadcrumb([("মুখপাতা", "/"), ("বিষয়সূচি", "/বিষয়সূচি/")])
    write("/বিষয়সূচি/", layout(title="বিষয়সূচি", description=f"{SITE}-এর সব বিভাগ ও উপ-বিভাগ: " + ", ".join(c["name"] for c in TOP_CATS),
                               path="/বিষয়সূচি/", active="বিষয়সূচি", ld=[bc_ld],
                               body=f'<div class="container archive">{bc_html}<header class="archive-header"><h1 class="archive-title">বিষয়সূচি</h1><p class="archive-desc">কেয়ারির নয়টি বিভাগ ও তাদের উপ-বিভাগ।</p></header><div class="grid grid--3">{cards}</div></div>'))


def build_authors():
    for a in AUTHORS:
        if not a["_posts"]:
            continue
        path = f"/author/{a['slug']}/"
        social = ""
        for k, ic in [("facebook", "facebook"), ("website", "link"), ("email", "mail")]:
            if a.get(k):
                href = ("mailto:" + a[k]) if k == "email" else a[k]
                social += f'<a class="social" href="{esc(href)}" target="_blank" rel="noopener" aria-label="{k}">{icon(ic, 16)}</a>'
        posts = a["_posts"]
        cat_counts = {}
        for p in posts:
            if p["_top"]:
                cat_counts[p["_top"]] = cat_counts.get(p["_top"], 0) + 1
        latest = max(p["_date"] for p in posts)
        stats = (f'<div><dt>লেখা</dt><dd>{bn(len(posts))}</dd></div>'
                 f'<div><dt>বিভাগ</dt><dd>{bn(len(cat_counts))}</dd></div>'
                 f'<div><dt>সর্বশেষ প্রকাশ</dt><dd>{bn_date(latest)}</dd></div>')
        header_html = f'''<div class="author-hero__ring">{avatar(a, 144)}</div>
<div class="author-hero__main">
  <p class="author-hero__kicker">লেখক</p>
  <h1 class="author-hero__name">{esc(a["name"])}</h1>
  {f'<p class="author-hero__bio">{esc(a["bio"])}</p>' if a.get("bio") else ""}
  <dl class="author-stats">{stats}</dl>
  {f'<div class="author-hero__social">{social}</div>' if social else ""}
</div>'''
        chips = ""
        per_page = 24
        if 6 <= len(posts) <= per_page and len(cat_counts) > 1:
            chips = ('<div class="chips" role="group" aria-label="বিভাগ অনুযায়ী ছাঁকুন"><button type="button" class="chip-btn is-active" data-chip="" aria-pressed="true">সব <span class="count">' + bn(len(posts)) + '</span></button>'
                     + "".join(f'<button type="button" class="chip-btn" data-chip="{k}" aria-pressed="false">{esc(CAT[k]["name"])} <span class="count">{bn(v)}</span></button>' for k, v in sorted(cat_counts.items(), key=lambda kv: -kv[1])) + "</div>")
        before = f'<div class="author-works">{section_head("লেখাসমূহ", h="h2")}{chips}</div>'
        archive_page(path=path, title=a["name"], items=posts, header_html=header_html, active="বাতায়ন", per=per_page,
                     header_cls="author-hero", before_grid=before,
                     card_fn=lambda p: card_v(p).replace('<article class="card-v">', f'<article class="card-v" data-cat="{p["_top"] or ""}">', 1),
                     crumbs=[("মুখপাতা", "/"), ("লেখক তালিকা", "/লেখক-তালিকা/"), (a["name"], path)],
                     description=a.get("bio") or f'{a["name"]}-এর লেখা — {SITE}', ld_type="ProfilePage")
    # লেখক তালিকা
    with_posts = sorted([a for a in AUTHORS if a["_posts"]], key=lambda a: a["name"])
    cards = "".join(f'''<a class="author-card" href="{u("/author/" + a["slug"] + "/")}">{avatar(a, 96)}
<span class="author-card__name">{esc(a["name"])}</span>
<span class="author-card__bio clamp-2">{esc(a.get("bio") or "")}</span>
<span class="author-card__count">{bn(len(a["_posts"]))}টি লেখা</span></a>''' for a in with_posts)
    bc_html, bc_ld = breadcrumb([("মুখপাতা", "/"), ("লেখক তালিকা", "/লেখক-তালিকা/")])
    body = f'''<div class="container archive">{bc_html}
<header class="archive-header"><p class="sec-label">বাতায়ন</p><h1 class="archive-title">লেখক তালিকা</h1>
<p class="archive-desc">কেয়ারিতে লিখেছেন {bn(len(with_posts))} জন লেখক।</p>
<label class="sr-only" for="af">লেখক খুঁজুন</label><input class="filter-input" id="af" type="search" placeholder="লেখকের নাম লিখুন…" data-filter=".author-card"></header>
<div class="author-grid">{cards}</div></div>'''
    write("/লেখক-তালিকা/", layout(title="লেখক তালিকা", description=f"{SITE}-এর সব লেখকের তালিকা, পরিচিতি ও লেখা।",
                                path="/লেখক-তালিকা/", body=body, active="বাতায়ন", ld=[bc_ld]))


def build_pages():
    for pg in PAGES:
        path = f"/{pg['slug']}/"
        tpl = pg.get("template", "default")
        body = process_body(pg.get("body", ""))
        banner = pg.get("banner") or {}
        bc_html, bc_ld = breadcrumb([("মুখপাতা", "/"), (pg["title"], path)])
        if tpl == "about":
            meanings = [("সিঁথি", "মাথার কেশদামে সযত্নে কাটা হয় যে সিঁথি, তার নাম কেয়ারি।", "〰"),
                        ("বাগানের কেয়ারি", "শখের বাগানে বাখারির বেড়ায় বিশেষিত যে অংশ, তারও নাম কেয়ারি।", "🌱"),
                        ("প্রেম-প্রযত্ন", "প্রিয় মানুষ, প্রিয় জিনিসের প্রতি যে প্রেম-প্রযত্ন, তাতেও থাকে কেয়ারির ছাপ।", "♡")]
            mean_html = "".join(f'<div class="meaning"><span class="meaning__icon" aria-hidden="true">{ic}</span><h2 class="meaning__title">{t}</h2><p>{d}</p></div>' for t, d, ic in meanings)
            cats = "".join(f'<a class="topic-mini" href="{cat_url(c["slug"])}"><span class="topic-mini__icon" aria-hidden="true">{esc(c.get("icon", ""))}</span><span>{esc(c["name"])}</span><span class="count">{bn(cat_count(c["slug"]))}টি লেখা</span></a>' for c in TOP_CATS)
            content = f'''<div class="container page page--about">{bc_html}
<header class="page-hero"><h1 class="page-title">{esc(pg["title"])}</h1><p class="page-lead">{esc(S.get("tagline"))}</p></header>
{f'<figure class="page-banner">{img_tag(banner.get("src"), banner.get("alt") or pg["title"], "page-banner__img", eager=True)}</figure>' if banner.get("src") else ""}
<div class="meanings">{mean_html}</div>
<div class="entry-content entry-content--page">{body}</div>
<section class="about-cats" aria-label="বিভাগসমূহ">{section_head("কেয়ারির শামিয়ানা", center=True)}<div class="topic-grid">{cats}</div></section>
<section class="editor-card"><p class="sec-label">সম্পাদক</p><h2 class="editor-card__name">{esc(S.get("editor_name"))}</h2>
<p><a href="mailto:{esc(S.get("email"))}">{esc(S.get("email"))}</a></p></section>
</div>'''
        elif tpl == "guidelines":
            toc = toc_from(body)
            content = f'''<div class="container page page--guide">{bc_html}
<header class="page-hero"><h1 class="page-title">{esc(pg["title"])}</h1></header>
{f'<figure class="page-banner page-banner--small">{img_tag(banner.get("src"), banner.get("alt") or pg["title"], "page-banner__img", 1169, 614, eager=True)}</figure>' if banner.get("src") else ""}
<div class="guide-layout"><aside class="guide-toc">{toc}</aside>
<div class="entry-content entry-content--page">{body}
<div class="mail-cta"><p class="sec-label">লেখা জমা দিন</p><p class="mail-cta__mail">{esc(S.get("email"))}</p>
<div class="cta__actions"><button class="btn" type="button" data-copy="{esc(S.get("email"))}">{icon("copy", 16)} ইমেইল কপি করুন</button>
<a class="btn btn--light" href="mailto:{esc(S.get("email"))}">{icon("mail", 16)} ইমেইল পাঠান</a></div></div>
</div></div></div>'''
        else:
            content = f'''<div class="container page">{bc_html}<header class="page-hero"><h1 class="page-title">{esc(pg["title"])}</h1></header>
{f'<figure class="page-banner">{img_tag(banner.get("src"), banner.get("alt") or pg["title"], "page-banner__img", eager=True)}</figure>' if banner.get("src") else ""}
<div class="entry-content entry-content--page">{body}</div></div>'''
        seo = pg.get("seo") or {}
        write(path, layout(title=seo.get("title") or pg["title"], description=seo.get("description") or strip_tags(body)[:160],
                           path=path, body=content, active="বাতায়ন", ld=[bc_ld], og_image=banner.get("src", ""),
                           noindex=seo.get("noindex", False), fonts=fonts_in(pg.get("body"))))


def build_ayojon():
    if not AYOJON:
        write("/আয়োজন/", layout(title="আয়োজন", description="কেয়ারির বিশেষ আয়োজন", path="/আয়োজন/", active="আয়োজন",
                                body='<div class="container page"><h1 class="page-title">আয়োজন</h1><p class="empty">শীঘ্রই আসছে।</p></div>'))
        return

    def render(a, path, is_index=False):
        aps = [POST_BY_ID[i] for i in a.get("posts", []) if i in POST_BY_ID]
        bc_items = [("মুখপাতা", "/"), ("আয়োজন", "/আয়োজন/")] + ([] if is_index else [(a["title"], path)])
        bc_html, bc_ld = breadcrumb(bc_items)
        others = [x for x in AYOJON if x is not a]
        other_html = ""
        if others:
            other_html = f'<section class="container ay-archive">{section_head("পূর্ববর্তী আয়োজন")}<div class="grid grid--3">' + "".join(
                f'<a class="series-card" href="{u(ayojon_path(x))}">{img_tag(x.get("banner", {}).get("src"), x["title"], "series-card__img")}<span class="series-card__body"><span class="series-card__name">{esc(x["title"])}</span><span class="series-card__count">{bn(len(x.get("posts", [])))}টি লেখা</span></span></a>'
                for x in others) + "</div></section>"
        body = f'''<div class="container page page--ayojon">{bc_html}
<header class="page-hero"><p class="sec-label">আয়োজন{(" · সংখ্যা " + bn(a["number"])) if a.get("number") else ""}</p>
<h1 class="page-title">{esc(a["title"])}</h1>{f'<p class="page-lead">{esc(a["subtitle"])}</p>' if a.get("subtitle") else ""}</header>
<figure class="page-banner">{img_tag(a.get("banner", {}).get("src"), a.get("banner", {}).get("alt") or a["title"], "page-banner__img", eager=True)}</figure>
<div class="entry-content entry-content--page ay-editorial"><p class="sec-label">সম্পাদকীয়</p>{process_body(a.get("editorial", ""))}</div>
</div>
<section class="container ay-posts" aria-label="{esc(a.get("section_title", "লেখাসমূহ"))}">{section_head(a.get("section_title", "লেখাসমূহ"), center=True)}
<div class="grid grid--3">{"".join(card_v(p) for p in aps)}</div></section>{other_html}'''
        write(path, layout(title=a.get("seo", {}).get("title") or (a["title"] + " — আয়োজন"),
                           description=a.get("seo", {}).get("description") or strip_tags(a.get("editorial", ""))[:160],
                           path=path, body=body, active="আয়োজন", og_image=a.get("banner", {}).get("src", ""),
                           ld=[{"@type": "CollectionPage", "name": a["title"], "url": absu(path), "inLanguage": "bn",
                                "hasPart": [{"@type": "Article", "headline": p["title"], "url": absu(p["_path"])} for p in aps]}, bc_ld]))

    active = next((a for a in AYOJON if a.get("active")), AYOJON[0])
    render(active, "/আয়োজন/", is_index=True)
    for a in AYOJON:
        render(a, ayojon_path(a))


EMPTY_SOON = '<p class="empty">শীঘ্রই আসছে।</p>'


def build_issues():
    """সংখ্যাগুচ্ছ — সব সংখ্যা (আয়োজন) একসাথে, নতুন থেকে পুরোনো"""
    cards = ""
    for a in AYOJON:
        n = len([i for i in a.get("posts", []) if i in POST_BY_ID])
        cards += f'''<a class="series-card" href="{u(ayojon_path(a))}">{img_tag(a.get("banner", {}).get("src"), a["title"], "series-card__img", sizes="400px")}
<span class="series-card__body"><span class="series-card__count">{("সংখ্যা " + bn(a["number"])) if a.get("number") else "বিশেষ সংখ্যা"}</span><span class="series-card__name">{esc(a["title"])}</span>
<span class="series-card__count">{esc(a.get("subtitle", ""))}{" · " if a.get("subtitle") else ""}{bn(n)}টি লেখা</span></span></a>'''
    bc_html, bc_ld = breadcrumb([("মুখপাতা", "/"), ("সংখ্যাগুচ্ছ", "/সংখ্যাগুচ্ছ/")])
    body = (f'<div class="container archive">{bc_html}<header class="archive-header"><h1 class="archive-title">সংখ্যাগুচ্ছ</h1>'
            f'<p class="archive-desc">কেয়ারির প্রকাশিত সব সংখ্যা এক জায়গায়, নতুন থেকে পুরোনো ক্রমে।</p></header>'
            f'<div class="grid grid--3">{cards or EMPTY_SOON}</div></div>')
    write("/সংখ্যাগুচ্ছ/", layout(title="সংখ্যাগুচ্ছ", description=f"{SITE}-এর সব সংখ্যা ও বিশেষ আয়োজন একসাথে।",
                                  path="/সংখ্যাগুচ্ছ/", body=body, active="সংখ্যাগুচ্ছ", ld=[bc_ld],
                                  og_image=(AYOJON[0].get("banner", {}).get("src", "") if AYOJON else "")))


def build_series():
    items = sorted(SERIES.values(), key=lambda s: max(p["_date"] for p in s["posts"]), reverse=True)
    cards = "".join(f'''<a class="series-card" href="{u("/ধারাবাহিক/" + s["slug"] + "/")}">{img_tag(s["posts"][-1]["cover"].get("src"), s["name"], "series-card__img")}
<span class="series-card__body"><span class="series-card__name">{esc(s["name"])}</span><span class="series-card__count">{bn(len(s["posts"]))}টি পর্ব · {esc(s["posts"][0]["_author"]["name"])}</span></span></a>''' for s in items)
    bc_html, bc_ld = breadcrumb([("মুখপাতা", "/"), ("ধারাবাহিক", "/ধারাবাহিক/")])
    write("/ধারাবাহিক/", layout(title="ধারাবাহিক", description="কেয়ারির ধারাবাহিক উপন্যাস, জীবনী ও রচনা — পর্ব অনুযায়ী।", path="/ধারাবাহিক/",
                                body=f'<div class="container archive">{bc_html}<header class="archive-header"><h1 class="archive-title">ধারাবাহিক</h1><p class="archive-desc">পর্বে পর্বে প্রকাশিত লেখাগুলো একসাথে।</p></header><div class="grid grid--3">{cards}</div></div>', ld=[bc_ld]))
    for s in items:
        path = f"/ধারাবাহিক/{s['slug']}/"
        header_html = f'<p class="sec-label">ধারাবাহিক · {bn(len(s["posts"]))}টি পর্ব</p><h1 class="archive-title">{esc(s["name"])}</h1><p class="archive-desc">{esc(s["posts"][0]["_author"]["name"])}</p>'
        archive_page(path=path, title=s["name"] + " — ধারাবাহিক", items=s["posts"], header_html=header_html,
                     crumbs=[("মুখপাতা", "/"), ("ধারাবাহিক", "/ধারাবাহিক/"), (s["name"], path)],
                     description=f'{s["name"]} — সব পর্ব একসাথে। {SITE}')


def build_tags():
    tags = {}
    for p in POSTS:
        for t in p.get("tags", []):
            tags.setdefault(t, []).append(p)
    for t, items in tags.items():
        path = f"/tag/{slugify(t)}/"
        archive_page(path=path, title=f"#{t}", items=items, header_html=f'<p class="sec-label">ট্যাগ</p><h1 class="archive-title">#{esc(t)}</h1>',
                     crumbs=[("মুখপাতা", "/"), (f"#{t}", path)], description=f"‘{t}’ বিষয়ক লেখা — {SITE}")


def build_search():
    idx = [{"t": p["title"], "a": p["_author"]["name"], "c": " ".join(CAT[c]["name"] for c in p["_cats"]),
            "e": p["excerpt"][:200], "u": p["_url"], "i": asset(p["cover"].get("src", "")), "d": bn_date(p["_date"]),
            "g": " ".join(p.get("tags", []))} for p in POSTS]
    (DIST / "search-index.json").write_text(json.dumps(idx, ensure_ascii=False, separators=(",", ":")), "utf-8")
    body = f'''<div class="container archive">
<header class="archive-header"><h1 class="archive-title" data-search-title>অনুসন্ধান</h1>
<form class="search-form search-form--page" action="{u("/search/")}" method="get" role="search">
<label class="sr-only" for="ps">খুঁজুন</label><input id="ps" type="search" name="s" placeholder="লেখা, লেখক বা বিষয়…" required><button class="btn" type="submit">খুঁজুন</button></form>
<p class="archive-desc" data-search-count aria-live="polite"></p></header>
<div class="grid grid--3" data-search-results></div>
<nav class="pagination" data-search-pages aria-label="পাতা নম্বর"></nav>
</div>'''
    write("/search/", layout(title="অনুসন্ধান", description=f"{SITE}-এ লেখা, লেখক ও বিষয় খুঁজুন।", path="/search/", body=body, noindex=True, body_class="search-page"))


def build_404():
    body = f'''<div class="container nf">
<div class="nf__icon">{icon("file-x", 56)}</div>
<h1 class="nf__title">পাতাটি খুঁজে পাওয়া যায়নি</h1>
<p class="nf__text">দুঃখিত, আপনি যে পাতাটি খুঁজছেন তা এখানে নেই। হয়তো ঠিকানাটি বদলেছে বা মুছে ফেলা হয়েছে।</p>
<form class="search-form search-form--page" action="{u("/search/")}" method="get" role="search"><label class="sr-only" for="nfs">খুঁজুন</label><input id="nfs" type="search" name="s" placeholder="খুঁজে দেখুন…" required><button class="btn" type="submit">খুঁজুন</button></form>
<p><a class="btn" href="{u("/")}">মুখপাতায় ফিরুন</a></p>
<div class="grid grid--3 nf__latest">{"".join(card_v(p) for p in POSTS[:3])}</div>
</div>'''
    (DIST / "404.html").write_text(layout(title="পাতাটি খুঁজে পাওয়া যায়নি", description="", path="/404.html", body=body, noindex=True), "utf-8")


def build_feeds():
    def x(s):
        return html.escape(s or "", quote=False)
    items = ""
    for p in POSTS[:30]:
        cats = "".join(f"<category>{x(CAT[c]['name'])}</category>" for c in p["_cats"])
        items += f"""<item><title>{x(p['title'])}</title><link>{absu(p['_path'])}</link><guid isPermaLink="true">{absu(p['_path'])}</guid>
<pubDate>{p['_date'].strftime('%a, %d %b %Y %H:%M:%S %z')}</pubDate><dc:creator>{x(p['_author']['name'])}</dc:creator>{cats}
<description>{x(p['excerpt'])}</description><content:encoded><![CDATA[{process_body(p.get('body', '')).replace(']]>', ']]&gt;')}]]></content:encoded>
{f'<enclosure url="{x(absu(p["cover"]["src"]))}" type="image/jpeg" length="0"/>' if p["cover"].get("src") else ""}</item>\n"""
    rss = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>{x(SITE)}</title><link>{SITE_URL}{u('/')}</link><description>{x(S.get('description'))}</description><language>bn</language>
<atom:link href="{absu('/feed.xml')}" rel="self" type="application/rss+xml"/><lastBuildDate>{NOW.strftime('%a, %d %b %Y %H:%M:%S %z')}</lastBuildDate>
{items}</channel></rss>"""
    (DIST / "feed.xml").write_text(rss, "utf-8")
    (DIST / "feed").mkdir(exist_ok=True)
    (DIST / "feed" / "index.xml").write_text(rss, "utf-8")
    (DIST / "feed" / "index.html").write_text(
        f'<!doctype html><html lang="bn"><meta charset="utf-8"><title>ফিড</title><link rel="alternate" type="application/rss+xml" href="{u("/feed.xml")}">'
        f'<meta http-equiv="refresh" content="0; url={u("/feed.xml")}"><a href="{u("/feed.xml")}">RSS ফিড</a></html>', "utf-8")


def build_sitemaps(extra_paths):
    def x(s):
        return html.escape(s, quote=False)
    urls = [("/", NOW, "daily", "1.0", None)]
    for p in POSTS:
        if (p.get("seo") or {}).get("noindex"):
            continue
        urls.append((p["_path"], p["_modified"], "monthly", "0.8", p["cover"].get("src")))
    for c in CATS:
        urls.append((cat_path(c["slug"]), NOW, "weekly", "0.6", None))
    for a in AUTHORS:
        if a["_posts"]:
            urls.append((f"/author/{a['slug']}/", NOW, "weekly", "0.5", None))
    for pth in extra_paths:
        urls.append((pth, NOW, "weekly", "0.6", None))
    body = ""
    for path, mod, freq, pri, img in urls:
        im = f"<image:image><image:loc>{x(absu(img))}</image:loc></image:image>" if img else ""
        body += f"<url><loc>{x(absu(path))}</loc><lastmod>{mod.date().isoformat()}</lastmod><changefreq>{freq}</changefreq><priority>{pri}</priority>{im}</url>\n"
    (DIST / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' + body + "</urlset>\n", "utf-8")
    recent = [p for p in POSTS if (NOW - p["_date"]).days <= 2]
    news = "".join(f"""<url><loc>{x(absu(p['_path']))}</loc><news:news><news:publication><news:name>{x(SITE)}</news:name><news:language>bn</news:language></news:publication>
<news:publication_date>{p['_date'].isoformat()}</news:publication_date><news:title>{x(p['title'])}</news:title></news:news></url>\n""" for p in recent)
    (DIST / "news-sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n' + news + "</urlset>\n", "utf-8")
    (DIST / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nDisallow: {BASE}/admin/\nDisallow: {BASE}/search/\n\nSitemap: {SITE_URL}{BASE}/sitemap.xml\nSitemap: {SITE_URL}{BASE}/news-sitemap.xml\n", "utf-8")


def build_static():
    if STATIC.exists():
        shutil.copytree(STATIC, DIST, dirs_exist_ok=True)
    (DIST / "assets" / "css").mkdir(parents=True, exist_ok=True)
    (DIST / "assets" / "css" / "styles.css").write_text(style_css(), "utf-8")
    if ADMIN.exists():
        shutil.copytree(ADMIN, DIST / "admin", dirs_exist_ok=True)
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    owner, _, name = repo.partition("/")
    cfg = {"owner": owner, "repo": name, "branch": os.environ.get("GITHUB_REF_NAME", "main"),
           "site_url": SITE_URL, "base": BASE, "built": NOW.isoformat()}
    (DIST / "admin" / "config.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2), "utf-8")
    (DIST / ".nojekyll").write_text("", "utf-8")
    domain = S.get("custom_domain") or ""
    if domain:
        (DIST / "CNAME").write_text(domain.strip() + "\n", "utf-8")
    (DIST / "manifest.webmanifest").write_text(json.dumps({
        "name": SITE, "short_name": SITE, "lang": "bn", "start_url": u("/"), "display": "standalone",
        "background_color": "#FDFDFF", "theme_color": "#00A664",
        "icons": [{"src": u("/assets/img/favicon.svg"), "sizes": "any", "type": "image/svg+xml"},
                  {"src": u("/assets/img/icon-192.png"), "sizes": "192x192", "type": "image/png", "purpose": "any"},
                  {"src": u("/assets/img/icon-512.png"), "sizes": "512x512", "type": "image/png", "purpose": "any"}]},
        ensure_ascii=False), "utf-8")


def main():
    t0 = datetime.now()
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    build_static()
    build_home()
    for p in POSTS:
        build_post(p)
    build_categories()
    build_authors()
    build_pages()
    build_ayojon()
    build_issues()
    build_series()
    build_tags()
    build_search()
    build_404()
    build_feeds()
    extra = ["/বিষয়সূচি/", "/লেখক-তালিকা/", "/আয়োজন/", "/সংখ্যাগুচ্ছ/", "/ধারাবাহিক/"] + [f"/{p['slug']}/" for p in PAGES] + \
            [ayojon_path(a) for a in AYOJON] + [f"/ধারাবাহিক/{s}/" for s in SERIES]
    build_sitemaps(extra)
    n = sum(1 for _ in DIST.rglob("*.html"))
    print(f"✔ {len(POSTS)}টি লেখা, {n}টি HTML পাতা তৈরি হলো ({(datetime.now() - t0).total_seconds():.1f} সেকেন্ড) → {DIST}")


def serve(port=8000):
    """লোকাল প্রিভিউ সার্ভার + অ্যাডমিন প্যানেলের জন্য লোকাল API (শুধু এই কম্পিউটার থেকে)।
    অ্যাডমিন প্যানেল localhost-এ খুললে GitHub টোকেন ছাড়াই 'লোকাল মোডে' সরাসরি content/ ফোল্ডারে লেখে।"""
    import base64
    import hashlib
    import http.server
    import subprocess
    import threading

    lock = threading.Lock()
    allowed = [CONTENT.resolve(), (STATIC / "uploads").resolve()]

    def safe(rel):
        p = (ROOT / rel).resolve()
        if not any(str(p).startswith(str(a)) for a in allowed):
            raise PermissionError(rel)
        return p

    def rebuild():
        r = subprocess.run([sys.executable, str(ROOT / "build.py")], capture_output=True, text=True, encoding="utf-8")
        return r.returncode == 0, (r.stdout + r.stderr)[-2000:]

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(DIST), **kw)

        def log_message(self, fmt, *args):
            if "/_api/" in (args[0] if args else ""):
                sys.stderr.write("api: " + (fmt % args) + "\n")

        def _json(self, obj, code=200):
            data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            q = urllib.parse.parse_qs(parsed.query)
            if parsed.path == "/_api/status":
                return self._json({"ok": True, "mode": "local"})
            if parsed.path == "/_api/tree":
                out = []
                for base in allowed:
                    for f in base.rglob("*"):
                        if f.is_file() and not f.name.startswith("."):
                            st = f.stat()
                            out.append({"path": f.relative_to(ROOT).as_posix(), "size": st.st_size,
                                        "sha": hashlib.sha1(f"{st.st_mtime_ns}-{st.st_size}".encode()).hexdigest()})
                return self._json({"tree": out})
            if parsed.path == "/_api/raw":
                try:
                    p = safe(q.get("path", [""])[0])
                    data = p.read_bytes()
                except (PermissionError, FileNotFoundError):
                    return self._json({"error": "not found"}, 404)
                self.send_response(200)
                self.send_header("Content-Type", self.guess_type(str(p)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(data)
                return
            # লোকাল মোডে নতুন আপলোড করা ছবি সরাসরি static/ থেকে দেখানো
            if parsed.path.startswith("/uploads/"):
                f = STATIC / urllib.parse.unquote(parsed.path).lstrip("/")
                if f.exists() and not (DIST / urllib.parse.unquote(parsed.path).lstrip("/")).exists():
                    self.send_response(200)
                    self.send_header("Content-Type", self.guess_type(str(f)))
                    self.end_headers()
                    self.wfile.write(f.read_bytes())
                    return
            return super().do_GET()

        def do_POST(self):
            if self.path != "/_api/commit":
                return self._json({"error": "unknown"}, 404)
            host = self.headers.get("Host", "")
            if not (host.startswith("localhost") or host.startswith("127.0.0.1")):
                return self._json({"error": "forbidden"}, 403)
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            with lock:
                try:
                    for ch in body.get("changes", []):
                        p = safe(ch["path"])
                        if ch.get("delete"):
                            if p.exists():
                                p.unlink()
                            continue
                        p.parent.mkdir(parents=True, exist_ok=True)
                        if "base64" in ch:
                            p.write_bytes(base64.b64decode(ch["base64"]))
                        else:
                            p.write_text(ch.get("text", ""), "utf-8")
                except PermissionError as e:
                    return self._json({"error": f"অনুমতি নেই: {e}"}, 403)
                ok, log = rebuild()
            print(f"✎ লোকাল কমিট: {body.get('message', '')} ({len(body.get('changes', []))}টি ফাইল) → পুনর্নির্মাণ {'সফল' if ok else 'ব্যর্থ'}")
            return self._json({"ok": ok, "log": log})

    print(f"→ সাইট:  http://localhost:{port}{BASE or ''}/")
    print(f"→ অ্যাডমিন: http://localhost:{port}{BASE or ''}/admin/  (লোকাল মোড)   বন্ধ করতে Ctrl+C")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
    if "--serve" in sys.argv:
        serve()
