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
import urllib.request
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


CAT_ICON_PATHS = {
    'kothamukh': '<path class="t" d="M12 3.2l5.2 7.3L12 20.8 6.8 10.5z"/><path d="M12 3.2l5.2 7.3L12 20.8 6.8 10.5z"/><path d="M12 12.4v8.4"/><circle cx="12" cy="10.7" r="1.4"/><path d="M9.2 7.1h5.6"/>',
    'rochonaboli': '<path class="t" d="M7.5 4h10.5a2 2 0 0 1 2 2v11.5a2.5 2.5 0 0 1-2.5 2.5H8a2.5 2.5 0 0 1-2.5-2.5V6a2 2 0 0 1 2-2z"/><path d="M7.5 4A2 2 0 0 0 5.5 6v11.5A2.5 2.5 0 0 0 8 20h9.5a2.5 2.5 0 0 0 2.5-2.5V6a2 2 0 0 0-2-2z"/><path d="M5.5 7.5h14.5"/><path d="M9.2 11.4h6.6M9.2 14.6h6.6M9.2 17.6h3.6"/>',
    'godyolekha': '<path class="t" d="M20.6 3.4c-7 .3-12.1 4.2-13.7 11.3l-1.9 4.4 4.4-1.9c6.4-1.7 10.7-6.9 11.2-13.8z"/><path d="M20.6 3.4c-7 .3-12.1 4.2-13.7 11.3l-1.9 4.4 4.4-1.9c6.4-1.7 10.7-6.9 11.2-13.8z"/><path d="M4.9 19.7l9.7-9.8"/><path d="M9.4 15.1h4.3M11.5 12.9h4"/>',
    'kobitapunjo': '<path class="t" d="M12 11.6c0-4.3 3-7.2 8-7.6.1 4.8-3.2 7.9-8 7.6z"/><path class="t" d="M12 14.6c0-3.3-2.4-5.6-7-5.6.1 3.6 2.6 5.9 7 5.6z"/><path d="M12 11.6c0-4.3 3-7.2 8-7.6.1 4.8-3.2 7.9-8 7.6z"/><path d="M12 14.6c0-3.3-2.4-5.6-7-5.6.1 3.6 2.6 5.9 7 5.6z"/><path d="M12 21v-9.4M12 11.6l4.8-4.3M12 14.6L8.4 11.4M8.6 21h6.8"/>',
    'kothasahityo': '<path class="t" d="M12 6.2C9.8 4.7 6.8 4.2 3.8 4.4v13.9c3-.2 6 .3 8.2 1.8z"/><path class="t" d="M12 6.2c2.2-1.5 5.2-2 8.2-1.8v13.9c-3-.2-6 .3-8.2 1.8z" style="fill-opacity:.08"/><path d="M12 6.2C9.8 4.7 6.8 4.2 3.8 4.4v13.9c3-.2 6 .3 8.2 1.8z"/><path d="M12 6.2c2.2-1.5 5.2-2 8.2-1.8v13.9c-3-.2-6 .3-8.2 1.8z"/><path d="M12 6.2v13.9"/><path d="M6.3 8.6c1.5 0 3 .3 4.2.9M6.3 11.8c1.5 0 3 .3 4.2.9M13.5 9.5c1.2-.6 2.7-.9 4.2-.9M13.5 12.7c1.2-.6 2.7-.9 4.2-.9"/>',
    'jibonisahityo': '<circle class="t" cx="12" cy="8" r="3.7"/><path class="t" d="M4.5 20.5c0-4 3.4-6.7 7.5-6.7s7.5 2.7 7.5 6.7z"/><circle cx="12" cy="8" r="3.7"/><path d="M4.5 20.5c0-4 3.4-6.7 7.5-6.7s7.5 2.7 7.5 6.7"/><path d="M3.5 20.5h17"/>',
    'somalochona': '<circle class="t" cx="10.5" cy="10.5" r="6.6"/><circle cx="10.5" cy="10.5" r="6.6"/><path d="M15.4 15.4l5.1 5.1" style="stroke-width:2.2"/><path d="M7.4 9.4a3.5 3.5 0 0 1 2.6-2.2"/><path d="M8 12.6l1.6 1.5 3-3.4"/>',
    'alapon': '<path class="t" d="M12.5 8h6.4a2 2 0 0 1 2 2v4.8a2 2 0 0 1-2 2h-.4v3l-3.6-3h-2.4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z"/><path d="M15 8V6.5a2 2 0 0 0-2-2H5.5a2 2 0 0 0-2 2v5.2a2 2 0 0 0 2 2h.4v3.1l3.7-3.1H10"/><path d="M12.5 8h6.4a2 2 0 0 1 2 2v4.8a2 2 0 0 1-2 2h-.4v3l-3.6-3h-2.4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z"/><circle class="f" cx="6.6" cy="9.1" r=".75"/><circle class="f" cx="9.1" cy="9.1" r=".75"/>',
    'shilposomachar': '<path class="t" d="M12 3.2a8.8 8.8 0 1 0 0 17.6c1.2 0 1.9-.9 1.6-1.9-.4-1.2.4-2.2 1.6-2.2H17a3.9 3.9 0 0 0 3.8-4c-.2-5.2-4.2-9.5-8.8-9.5z"/><path d="M12 3.2a8.8 8.8 0 1 0 0 17.6c1.2 0 1.9-.9 1.6-1.9-.4-1.2.4-2.2 1.6-2.2H17a3.9 3.9 0 0 0 3.8-4c-.2-5.2-4.2-9.5-8.8-9.5z"/><circle class="f" cx="7.6" cy="11.4" r="1.15"/><circle class="f" cx="10.4" cy="7.4" r="1.15"/><circle class="f" cx="15.2" cy="7.9" r="1.15"/><circle class="f" cx="17" cy="12.2" r="1.15"/>',
}
MEAN_ICONS = [
    '<svg class="cat-ico" viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17.5c2.5-4 5-4 7.5 0s5 4 7.5 0c1-1.6 2-2.4 3-2.8"/><path d="M3 13.5c2.5-5 5-5 7.5 0s5 5 7.5 0c1-2 2-3 3-3.5"/><path d="M3 8.5c2.5-4 5-4 7.5 0s5 4 7.5 0c1-1.6 2-2.4 3-2.8"/></svg>',
    '<svg class="cat-ico" viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + CAT_ICON_PATHS["kobitapunjo"] + '</svg>',
    '<svg class="cat-ico" viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="t" d="M12 20.5C5 15.6 3 12.3 3 9.2A4.7 4.7 0 0 1 7.7 4.5c1.8 0 3.3.9 4.3 2.4 1-1.5 2.5-2.4 4.3-2.4A4.7 4.7 0 0 1 21 9.2c0 3.1-2 6.4-9 11.3z"/><path d="M12 20.5C5 15.6 3 12.3 3 9.2A4.7 4.7 0 0 1 7.7 4.5c1.8 0 3.3.9 4.3 2.4 1-1.5 2.5-2.4 4.3-2.4A4.7 4.7 0 0 1 21 9.2c0 3.1-2 6.4-9 11.3z"/></svg>',
]
CAT_ICON_DEFAULT = '<path class="t" d="M3.5 12.2V5.3a1 1 0 0 1 1-1h6.9l8.6 8.6-7.9 7.9z"/><path d="M3.5 12.2V5.3a1 1 0 0 1 1-1h6.9l8.6 8.6-7.9 7.9z"/><circle cx="8.2" cy="9" r="1.3"/>'


def cat_ico(c, size=22):
    """বিভাগের আসল ভেক্টর আইকন (ইমোজি নয়); রঙ ব্র্যান্ড-সবুজ (CSS-এ)"""
    p = CAT_ICON_PATHS.get(c.get("slug"), CAT_ICON_DEFAULT)
    return ('<svg class="cat-ico" viewBox="0 0 24 24" width="' + str(size) + '" height="' + str(size) + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>")


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


def views_endpoint():
    c = (S.get("comments") or {})
    return ((c.get("native") or {}).get("endpoint") or "").strip().rstrip("/")


def safe_id(pid):
    return re.sub(r"[^A-Za-z0-9_-]", "_", str(pid))


def load_views():
    """মন্তব্য-সার্ভার (Worker) থেকে লেখাভিত্তিক পড়ার সংখ্যা; সংযোগ না থাকলে ফাঁকা (তখন পছন্দ-চিহ্নিত, তারপর সর্বশেষ লেখা)"""
    ep = views_endpoint()
    if not ep or os.environ.get("KEYARI_NO_NET"):
        return {}
    try:
        req = urllib.request.Request(ep + "/views", headers={"User-Agent": "keyari-build"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8"))
        return {str(k): int(v) for k, v in (data.get("views") or {}).items()}
    except Exception as e:  # noqa
        print("  ⚠ পড়ার সংখ্যা আনা যায়নি:", e)
        return {}


VIEWS = load_views()


def view_count(p):
    return VIEWS.get(safe_id(p["id"]), 0)

PAGES = [p for p in load_dir("pages") if is_live(p) or p.get("status") == "published"]
ISSUES = sorted([x for x in (load("issues.json", {}) or {}).get("items", []) if x.get("status", "published") == "published"],
                key=lambda x: (x.get("number") or 0, x.get("title", "")))


def issue_path(x):
    return "/সংখ্যাগুচ্ছ/" + (x.get("slug") or x["id"]) + "/"


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
            tag = m.group(0)
            nm = re.search(r'data-note="([^"]*)"', tag)
            if not nm:
                return tag
            note = html.unescape(nm.group(1))
            nn = re.search(r'data-fn="(\d+)"', tag)
            idx = len(notes) + 1
            n = int(nn.group(1)) if nn else idx
            notes.append((n, note))
            return (f'<sup class="fn-ref" id="fnref-{idx}"><button type="button" class="fn-dot" data-fn-note="{esc(note)}" '
                    f'aria-haspopup="dialog" aria-label="টীকা {bn(n)}">{bn(n)}</button></sup>')
        b = re.sub(r'<sup\b[^>]*\bclass="[^"]*\bfn-ref\b[^"]*"[^>]*>.*?</sup>', fn, b, flags=re.S)
        if notes:
            items = "".join(f'<li value="{n}" id="fn-{i}">{esc(t)}</li>' for i, (n, t) in enumerate(notes, 1))
            b += f'<section class="footnotes" aria-label="টীকা"><h2 class="footnotes__title">টীকা</h2><ol>{items}</ol></section>'
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
        parts.append(f'<a class="meta__author" href="{u("/author/" + a["slug"] + "/")}">{aname(a)}</a>')
    if date:
        parts.append(f'<time class="meta__date" datetime="{p["_date"].isoformat()}">{bn_date(p["_date"])}</time>')
    return '<div class="meta">' + '<span class="meta__dot" aria-hidden="true">·</span>'.join(parts) + "</div>"


def translator_line(p):
    t = p.get("translator")
    return f'<p class="card__translator">অনুবাদ : {esc(t)}</p>' if t else ""


def card_h(p, eager=False):
    return f'''<article class="card-h">
  <a class="card-h__media" href="{p["_url"]}" tabindex="-1" aria-hidden="true">{img_tag(p["cover"].get("src"), p["cover"].get("alt") or p["title"], "card-h__img", eager=eager, sizes="(max-width: 575px) 100vw, 400px")}</a>
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


def yt_id(url):
    """ইউটিউব লিংক (watch / youtu.be / shorts / embed) বা সরাসরি ১১ অক্ষরের আইডি থেকে ভিডিও-আইডি"""
    t = (url or "").strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", t):
        return t
    m = re.search(r"(?:youtu\.be/|[?&]v=|/embed/|/shorts/|/live/)([A-Za-z0-9_-]{11})", t)
    return m.group(1) if m else ""


_YT_TITLES = {}


def yt_title(vid):
    if vid in _YT_TITLES:
        return _YT_TITLES[vid]
    t = ""
    if not os.environ.get("KEYARI_NO_NET"):
        try:
            q = urllib.parse.quote("https://www.youtube.com/watch?v=" + vid, safe="")
            with urllib.request.urlopen(urllib.request.Request("https://www.youtube.com/oembed?format=json&url=" + q, headers={"User-Agent": "keyari-build"}), timeout=8) as r:
                t = json.loads(r.read().decode("utf-8")).get("title", "")
        except Exception:  # noqa
            t = ""
    _YT_TITLES[vid] = t
    return t


def video_card(v):
    vid = yt_id(v.get("url") or v.get("id"))
    if not vid:
        return ""
    title = (v.get("title") or "").strip() or yt_title(vid) or "ভিডিও"
    play = '<svg viewBox="1 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z"/></svg>'
    return f'''<article class="card-g vid" data-vid="{vid}">
  <button class="card-g__media vid__media" type="button" aria-label="চালান: {esc(title)}">
    <img class="card-g__img" src="https://i.ytimg.com/vi/{vid}/hqdefault.jpg" alt="" loading="lazy" decoding="async">
    <span class="vid__play">{play}</span>
  </button>
  <div class="card-g__body"><h3 class="card-g__title vid__title">{esc(title)}</h3></div>
</article>'''


def video_section(tone):
    cfg = load("videos.json", {}) or {}
    if cfg.get("enabled", True) is False:
        return ""
    cards = [c for c in (video_card(v) for v in cfg.get("items", []) if v.get("active", True) is not False) if c]
    if not cards:
        return ""
    return f'''<section class="cat-block container video-block tone tone-{tone}" aria-label="ভিডিও">
  {section_head(cfg.get("title") or "ভিডিও", u("/ভিডিও/"), "সব ভিডিও")}
  {more_grid("".join(cards), len(cards), "feed__list more-grid")}
</section>'''


def more_grid(items_html, n, cls="more-grid"):
    """৩ কলামের গ্রিড: কম্পিউটারে প্রথম ৬টি (২ সারি), মোবাইলে প্রথম ৩টি; বাকিগুলো 'আরও দেখুন'-এ একই পাতায় খোলে"""
    btn = ""
    if n > 3:
        btn = '<div class="more-wrap' + (" more-wrap--m" if n <= 6 else "") + '"><button class="btn btn--ghost more-btn" type="button" data-more aria-expanded="false" aria-label="আরও দেখুন"><svg class="more-ico" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button></div>'
    return '<div class="' + cls + '" data-more-grid>' + items_html + "</div>" + btn


def series_card(s):
    """ধারাবাহিকের কার্ড: অন্য সেকশনের মতোই ওপরে ছবি, নিচে শিরোনাম ও লেখক"""
    url = u("/ধারাবাহিক/" + s["slug"] + "/")
    first = s["posts"][0]
    last = max(s["posts"], key=lambda x: x["_date"])
    return f'''<article class="card-g">
  <a class="card-g__media" href="{url}" tabindex="-1" aria-hidden="true">{img_tag(s["posts"][-1]["cover"].get("src"), s["name"], "card-g__img", sizes="(max-width: 575px) 100vw, 280px")}</a>
  <div class="card-g__body">
    <p class="card-g__cat">ধারাবাহিক · {bn(len(s["posts"]))}টি পর্ব</p>
    <h3 class="card-g__title"><a href="{url}">{esc(s["name"])}</a></h3>
    <p class="card__excerpt clamp-3">{esc(first["_long"])}</p>
    <p class="card-g__by"><a class="card__author" href="{u("/author/" + first["_author"]["slug"] + "/")}">{aname(first["_author"])}</a><span aria-hidden="true"> · </span><time datetime="{last["_date"].isoformat()}">{bn_date(last["_date"])}</time></p>
  </div>
</article>'''


def card_g(p):
    """সর্বশেষ লেখার গ্রিড-কার্ড: ওপরে ছবি, নিচে বিভাগ, শিরোনাম, সারাংশ, শেষে লেখক ও তারিখ"""
    cat = p["_sub"] or p["_top"]
    cat_html = ('<p class="card-g__cat"><a href="' + cat_url(cat) + '">' + esc(CAT[cat]["name"]) + "</a></p>") if cat else ""
    return f'''<article class="card-g">
  <a class="card-g__media" href="{p["_url"]}" tabindex="-1" aria-hidden="true">{img_tag(p["cover"].get("src"), p["cover"].get("alt") or p["title"], "card-g__img", sizes="(max-width: 575px) 100vw, 280px")}</a>
  <div class="card-g__body">
    {cat_html}
    <h3 class="card-g__title"><a href="{p["_url"]}">{esc(p["title"])}</a></h3>
    <p class="card__excerpt clamp-3">{esc(p["_long"])}</p>
    <p class="card-g__by"><a class="card__author" href="{u("/author/" + p["_author"]["slug"] + "/")}">{aname(p["_author"])}</a><span aria-hidden="true"> · </span><time datetime="{p["_date"].isoformat()}">{bn_date(p["_date"])}</time></p>
  </div>
</article>'''


def card_v(p, show_date=True, heading="h3"):
    """পুরোনো নাম; সব জায়গায় এখন একই লেখার-কার্ড (card_g)"""
    return card_g(p)


def card_small(p):
    return f'''<article class="card-s">
  <div class="card-s__body">
    {('<p class="card-g__cat card-s__cat"><a href="' + cat_url(p["_sub"] or p["_top"]) + '">' + esc(CAT[p["_sub"] or p["_top"]]["name"]) + "</a></p>") if (p["_sub"] or p["_top"]) else ""}
    <a class="card-s__author" href="{u("/author/" + p["_author"]["slug"] + "/")}">{aname(p["_author"])}</a>
    <h3 class="card-s__title"><a href="{p["_url"]}">{esc(p["title"])}</a></h3>
    <p class="card__excerpt card-s__excerpt">{esc(p["_long"])}</p>
  </div>
  <a class="card-s__media" href="{p["_url"]}" tabindex="-1" aria-hidden="true">{img_tag(p["cover"].get("src"), p["title"], "card-s__img", 1169, 658, sizes="(max-width: 575px) 100vw, 220px")}</a>
</article>'''


def card_overlay(p):
    return f'''<a class="card-o" href="{p["_url"]}">
  {img_tag(p["cover"].get("src"), p["title"], "card-o__img", sizes="370px")}
  <span class="card-o__shade"></span>
  <span class="card-o__body"><span class="card-o__title">{esc(p["title"])}</span><span class="card-o__author">{aname(p["_author"])}</span></span>
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


def section_head(title, link=None, link_label="সব লেখা", center=False, h="h2"):
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


def author_more_widget(a, exclude):
    """লেখার পাতার ডানে: শুধু এই লেখকেরই আরও লেখা। প্রথম ৩টি দেখায়, বাকিগুলো 'আরও দেখুন'-এ একই জায়গায় খোলে।"""
    mine = [x for x in a.get("_posts", []) if x is not exclude]
    if not mine:
        return '<div class="widget more-by more-by--cards"><h2 class="more-by__head">লেখকের আরও লেখা</h2><p class="more-by__none">এই লেখকের আর লেখা নেই।</p></div>'
    shown = mine[:12]
    cards = "".join(card_g(x) for x in shown)
    btn = ""
    if len(shown) > 3:
        btn = '<div class="more-wrap"><button class="btn btn--ghost more-btn" type="button" data-more aria-expanded="false" aria-label="আরও দেখুন"><svg class="more-ico" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button></div>'
    all_link = ""
    if len(mine) > len(shown):
        all_link = '<a class="more-by__all" href="' + u("/author/" + a["slug"] + "/") + '">' + esc(a["name"]) + "-এর সব লেখা " + icon("right", 15) + "</a>"
    return ('<div class="widget more-by more-by--cards"><h2 class="more-by__head">লেখকের আরও লেখা</h2>'
            '<div class="more-by__cards" data-more-grid>' + cards + "</div>" + btn + all_link + "</div>")


def sidebar(exclude=None, minimal=True, author=None):
    cta = f'''<div class="widget widget--cta">
    <h2 class="cta-mini__title">লেখা পাঠান</h2>
    <p>আপনার অপ্রকাশিত রচনা ও শিল্পকাজ পাঠান কেয়ারির ঠিকানায়।</p>
    <a class="btn btn--light" href="{u("/বিশেষ-বার্তা/")}">নীতিমালা পড়ুন</a>
    <a class="cta-mini__mail" href="mailto:{esc(S.get("email"))}">{icon("mail", 16)} {esc(S.get("email"))}</a>
  </div>'''
    if minimal:  # সব জায়গায় পাশে শুধু "লেখা পাঠান" (পূর্ণ সাইডবার চাইলে minimal=False)
        more = author_more_widget(author, exclude) if (author and exclude) else ""
        return f'<aside class="sidebar" aria-label="লেখকের আরও লেখা">{more}</aside>'
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
        f'<div><a class="mini__title" href="{p["_url"]}">{esc(p["title"])}</a><span class="mini__author">{aname(p["_author"])}</span></div></li>'
        for p in featured)
    cat_list = "".join(
        f'<li><a href="{cat_url(c["slug"])}"><span>{esc(c["name"])}</span><span class="count">{bn(cat_count(c["slug"]))}</span></a></li>'
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
  {cta}
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
            feature = ""  # মেগা-মেনুতে "সর্বশেষ আয়োজন" কার্ড আর নেই
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
<header class="site-header" data-header>
  <div class="container site-header__inner">
    <button class="icon-btn hamburger" type="button" data-offcanvas-open aria-label="মেনু খুলুন" aria-controls="offcanvas">{icon("menu", 22)}</button>
    <a class="site-logo" href="{u("/")}" rel="home" aria-label="{esc(SITE)} — মুখপাতা">{logo_img(eager=True)}</a>
    <nav class="nav" aria-label="প্রধান মেনু"><ul class="nav__list">{"".join(items)}</ul></nav>
    <div class="header-tools">
      <button class="icon-btn" type="button" data-search-open aria-label="অনুসন্ধান" aria-controls="search-pop" aria-expanded="false">{icon("search", 20)}</button>
      <span class="header-tools__sep" aria-hidden="true"></span>
      {toggle}
      <a class="btn btn--fb" href="{esc(S.get("app_url") or "#")}"{app_attrs()}>বুক অ্যাপ</a>
    </div>
  </div>
</header>
<div class="sx" id="search-pop" role="dialog" aria-modal="true" aria-label="অনুসন্ধান" hidden>
  <div class="sx__backdrop" data-search-close></div>
  <div class="sx__panel">
    <form class="sx__form" action="{u("/search/")}" method="get" role="search">
      <span class="sx__ico" aria-hidden="true">{icon("search", 22)}</span>
      <label class="sr-only" for="hs">লেখা, লেখক, বিষয়</label>
      <input id="hs" type="search" name="s" placeholder="লেখা, লেখক, বিষয়…" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="sx__clear" type="button" data-sx-clear hidden aria-label="মুছুন">{icon("close", 16)}</button>
      <button class="btn sx__go" type="submit">খুঁজুন</button>
    </form>
    <div class="sx__results" data-sx-results role="listbox" hidden></div>
  </div>
</div>
<div class="offcanvas" id="offcanvas" aria-hidden="true" aria-label="মোবাইল মেনু" role="dialog">
  <div class="offcanvas__head">
    <a href="{u("/")}" class="site-logo">{logo_img()}</a>
    <button class="icon-btn" type="button" data-offcanvas-close aria-label="মেনু বন্ধ করুন">{icon("close", 22)}</button>
  </div>
  <ul class="m-nav">{"".join(m_items)}</ul>
  <a class="btn btn--block" href="{esc(S.get("app_url") or "#")}"{app_attrs()}>বুক অ্যাপ</a>
  <div class="offcanvas__foot">{toggle}</div>
</div>
<div class="offcanvas-backdrop" data-offcanvas-close hidden></div>'''


BRAND = {
    # নাম: (রং, অফিসিয়াল ২৪×২৪ ভেক্টর পাথ, লেবেল)
    "facebook": ("#1877F2", "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z", "ফেসবুক"),
    "youtube": ("#FF0000", "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z", "ইউটিউব"),
    "linkedin": ("#0A66C2", "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z", "লিংকডইন"),
    "instagram": ("#E4405F", "M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z", "ইনস্টাগ্রাম"),
    "x": ("currentColor", "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z", "এক্স (টুইটার)"),
    "whatsapp": ("#25D366", "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z", "হোয়াটসঅ্যাপ"),
    "telegram": ("#26A5E4", "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z", "টেলিগ্রাম"),
    "tiktok": ("currentColor", "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z", "টিকটক"),
}


def _xform(d, sc, tx, ty):
    """সরল পাথ-রূপান্তর (M L H V h v l Z): স্কেল + সরানো — শুধু এক্স-এর পাথের জন্য"""
    toks = re.findall(r"[A-Za-z]|-?\d*\.?\d+", d)
    out, i, cmd = [], 0, None
    n_args = {"M": 2, "L": 2, "l": 2, "m": 2, "H": 1, "V": 1, "h": 1, "v": 1, "Z": 0, "z": 0}
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]
            i += 1
            out.append(cmd)
            if cmd in "Zz":
                continue
        k = n_args[cmd]
        vals = [float(x) for x in toks[i:i + k]]
        i += k
        if cmd in "ML":
            vals = [vals[0] * sc + tx, vals[1] * sc + ty]
        elif cmd == "H":
            vals = [vals[0] * sc + tx]
        elif cmd == "V":
            vals = [vals[0] * sc + ty]
        else:
            vals = [v * sc for v in vals]
        out.append(" ".join(f"{v:.3f}".rstrip("0").rstrip(".") for v in vals))
        if cmd == "M":
            cmd = "L"
    return " ".join(out)


def _wa_solid():
    """হোয়াটসঅ্যাপ: আংটির মতো ফাঁপা নয়, পুরো ভরাট বুদবুদ; ভেতরে ফোনের চিহ্ন কাটা (evenodd)"""
    p = BRAND["whatsapp"][1]
    parts = re.split(r"(?=[Mm])", p)
    parts = [x for x in parts if x.strip()]
    phone = parts[0]
    outer = parts[-1]
    if outer[0] == "m":
        outer = "M20.463 3.488" + outer[len("m8.413-18.297"):]
    return phone + outer


_X_GLYPH = "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"
_CIRCLE = "M12 .5a11.5 11.5 0 1 0 0 23 11.5 11.5 0 1 0 0-23Z"
# ভরাট-আইকনের সেট: (পাথ, fill-rule) — পুরো সাইটে একই ছন্দ: ভরাট আকার + ভেতরে কাটা চিহ্ন
SOLID = {
    "whatsapp": (_wa_solid(), "evenodd"),
    "x": (_CIRCLE + _xform(_X_GLYPH, 0.46, 6.48, 6.48), "evenodd"),
    "youtube": (_CIRCLE + "M9.9 7.9v8.2L16.7 12Z", "evenodd"),
    "linkedin": (_CIRCLE + "M7.55 6.8a1.45 1.45 0 1 1 0 2.9 1.45 1.45 0 0 1 0-2.9ZM6.4 10.6h2.3v6.8H6.4ZM10.4 10.6h2.2v.95c.35-.65 1.2-1.15 2.3-1.15 2.2 0 2.7 1.4 2.7 3.2v3.8h-2.3v-3.4c0-.8-.1-1.5-1.1-1.5-1 0-1.4.7-1.4 1.6v3.3h-2.4Z", "evenodd"),
    "instagram": (_CIRCLE + "M8.9 6.3h6.2a2.6 2.6 0 0 1 2.6 2.6v6.2a2.6 2.6 0 0 1-2.6 2.6H8.9a2.6 2.6 0 0 1-2.6-2.6V8.9a2.6 2.6 0 0 1 2.6-2.6Z"
                  "M9.2 7.6h5.6a1.6 1.6 0 0 1 1.6 1.6v5.6a1.6 1.6 0 0 1-1.6 1.6H9.2a1.6 1.6 0 0 1-1.6-1.6V9.2a1.6 1.6 0 0 1 1.6-1.6Z"
                  "M12 9.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2ZM15 8.1a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z", "evenodd"),
    "mail": (_CIRCLE +
             "M7 7.4h10a1.4 1.4 0 0 1 1.1.55L12 12.1 5.9 7.95A1.4 1.4 0 0 1 7 7.4Z"
             "M5.5 9.7 12 14.1l6.5-4.4V15a1.6 1.6 0 0 1-1.6 1.6H7.1A1.6 1.6 0 0 1 5.5 15Z", "evenodd"),
}


def glyph(k):
    if k in SOLID:
        return SOLID[k]
    return (BRAND[k][1], "nonzero")


def solid_svg(k, size=20, color="currentColor"):
    path, rule = glyph(k)
    return ('<svg viewBox="0 0 24 24" width="' + str(size) + '" height="' + str(size) + '" fill="' + color + '" aria-hidden="true">'
            '<path fill-rule="' + rule + '" clip-rule="' + rule + '" d="' + path + '"/></svg>')



def social_links():
    """অ্যাডমিন → সেটিংস → সোশ্যাল-এ যে লিংক দেওয়া আছে শুধু সেগুলোর আসল ব্র্যান্ড-আইকন"""
    soc = S.get("social", {}) or {}
    out = []
    for k, (color, path, label) in BRAND.items():
        href = ((S.get("facebook") if k == "facebook" else soc.get(k)) or "").strip()
        if not href:
            continue
        out.append(sbtn(k, href, label))
    return ('<div class="footer__social" aria-label="সোশ্যাল মিডিয়া">' + "".join(out) + "</div>") if out else ""


def editor_icons():
    """সম্পাদকের ব্যক্তিগত সোশ্যাল আইকন (অ্যাডমিন → সেটিংস → সাধারণ)"""
    es = S.get("editor_social", {}) or {}
    out = []
    items = [("facebook", "ফেসবুক"), ("instagram", "ইনস্টাগ্রাম"), ("whatsapp", "হোয়াটসঅ্যাপ"), ("linkedin", "লিংকডইন"), ("x", "এক্স")]
    for k, label in items:
        href = (es.get(k) or "").strip()
        if href:
            if k == "whatsapp" and not href.startswith("http"):
                href = "https://wa.me/" + re.sub(r"\D", "", href)
            out.append(sbtn(k, href, "সম্পাদকের " + label))
    mail = (es.get("email") or S.get("email") or "").strip()
    if mail:
        out.append(sbtn("mail", "mailto:" + mail, "সম্পাদককে ইমেইল", ext=False))
    return '<div class="footer__social footer__social--editor">' + "".join(out) + "</div>" if out else ""


def footer():
    year = NOW.year
    start = S.get("copyright_start", year)
    yr = bn(year) if start == year else f"{bn(start)}–{bn(year)}"
    # অ্যাডমিনের মেনু → ফুটার কলামে লিংক দিলে নিচে ছোট লিংক-সারি আসে
    links = []
    for col in MENU.get("footer", []):
        for l in col.get("links", []):
            links.append('<a href="' + u(l["url"]) + '">' + esc(l["label"]) + "</a>")
    link_row = ('<nav class="footer__links" aria-label="ফুটার লিংক">' + "".join(links) + "</nav>") if links else ""
    editor = esc(S.get("editor_name") or "")
    role = esc(S.get("editor_role") or "সম্পাদক, প্রকাশক")
    ed_name = ('<p class="sf__editor-name">' + editor + "</p>") if editor else ""
    tagline = esc(S.get("tagline") or "")
    notice = esc(S.get("footer_notice") or "")
    logo_src = asset(S.get("logo") or "/assets/img/logo.svg")
    soc = social_links()
    phone = (S.get("phone") or "").strip()
    phone_tel = re.sub(r"[^0-9+]", "", phone)
    return f'''<footer class="site-footer sf">
  <div class="container">
    <div class="sf__top">
      <div class="sf__brand">
        <a href="{u("/")}" class="site-logo footer__logo" aria-label="{esc(SITE)} — মুখপাতা">{logo_img()}</a>
        {f'<p class="sf__tagline">{tagline}</p>' if tagline else ""}
        {f'<p class="sf__notice">{notice}</p>' if notice else ""}
      </div>
      <div class="sf__editor">
        {ed_name}
        <p class="sf__role">{role}</p>
        {editor_icons()}
      </div>
      <div class="sf__contact">
        <p class="sf__heading">যোগাযোগ</p>
        {f'<a class="sf__link" href="tel:{esc(phone_tel)}">{esc(phone)}</a>' if phone else ""}
        {f'<a class="sf__link" href="mailto:{esc(S.get("email"))}">{esc(S.get("email"))}</a>' if S.get("email") else ""}
      </div>
      <div class="sf__follow">
        {f'<p class="sf__heading">সাথে থাকুন</p>{soc}' if soc else ""}
      </div>
    </div>
    {link_row}
    <div class="sf__line" aria-hidden="true"></div>
    <div class="sf__bottom">
      <p class="sf__copy">মালিকানা {bn(year)} — {esc(SITE)}</p>
      <span class="sf__bar" aria-hidden="true"></span>
      <p class="sf__credit">বিনির্মাণে <a href="https://gunjoronit.github.io/" target="_blank" rel="noopener">গুঞ্জরণ আইটি</a></p>
    </div>
  </div>
</footer>
<button class="to-top" type="button" data-to-top aria-label="উপরে যান">
  <svg class="to-top__ring" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22"/></svg>{icon("up", 20)}</button>
<div class="toast" role="status" aria-live="polite" hidden><span class="toast__txt"></span></div>'''


def jsonld(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False).replace("</", "<\\/") + "</script>"


def org_ld():
    logo = "/assets/img/favicon.svg"
    return {"@type": "Organization", "@id": SITE_URL + "/#org", "name": SITE, "alternateName": S.get("site_name_en"),
            "url": SITE_URL + u("/"), "logo": {"@type": "ImageObject", "url": absu(logo)},
            "email": S.get("email"), "sameAs": [x for x in [S.get("facebook")] + list(S.get("social", {}).values()) if x]}


def _tone_classes(html):
    """মুখপাতার রঙিন পটিগুলোকে ক্রমানুসারে আলাদা রং (tc-0…5) ও ঢেউয়ের দিক (wv-0/1) দেওয়া হয় — পাশাপাশি দুটো কখনো এক রঙের হয় না,
    আর এক পটির নিচের ঢেউ ঠিক পরের পটির ওপরের ঢেউয়ের সঙ্গে মেলে"""
    n = [0]

    def f(m):
        i = n[0]
        n[0] += 1
        return 'class="' + m.group(1) + f' tc-{i % 8} wt-{(i - 1) % 8} wb-{i % 8}"'
    return re.sub(r'class="([^"]*\btone\b[^"]*)"', f, html)


def layout(*, title, description, path, body, active="", og_image="", og_type="website", ld=None,
           extra_head="", noindex=False, body_class="", fonts=None, prev_next=None):
    body = _tone_classes(body)
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
<link rel="icon" type="image/svg+xml" sizes="any" href="{asset(S.get("favicon") or "/assets/img/favicon.svg")}">
<link rel="manifest" href="{u("/manifest.webmanifest")}">
<link rel="alternate" type="application/rss+xml" title="{esc(SITE)} — ফিড" href="{u("/feed.xml")}">
<link rel="preload" href="{u("/assets/fonts/NotoSerifByGunjoron-Regular.woff")}?v={FONT_V}" as="font" type="font/woff" crossorigin>
<link rel="preload" href="{u("/assets/fonts/NotoSerifByGunjoron-Bold.woff")}?v={FONT_V}" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="{u("/assets/css/fonts.css")}?v={BUILD_ID}">
<link rel="stylesheet" href="{u("/assets/css/site.css")}?v={BUILD_ID}">
<link rel="stylesheet" href="{u("/assets/css/styles.css")}?v={BUILD_ID}">
<script>(function(){{try{{var s=localStorage.getItem('keyari-scheme');if(!s)s=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-scheme',s);document.documentElement.classList.add('js');localStorage.removeItem('keyari-fs')}}catch(e){{}}}})();window.KEYARI={{base:"{BASE}"}};</script>
<meta name="build" content="{BUILD_ID}">
<script>(function(){{try{{var m=document.querySelector('meta[name=build]');if(!m||!window.fetch)return;var b=m.getAttribute('content');fetch("{u("/version.json")}?t="+Date.now(),{{cache:'no-store'}}).then(function(r){{return r.json()}}).then(function(j){{if(!j||!j.v||j.v===b)return;var k='keyari-rl';if(sessionStorage.getItem(k)===j.v)return;sessionStorage.setItem(k,j.v);location.reload()}}).catch(function(){{}})}}catch(e){{}}}})();</script>
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


def _font_version():
    import hashlib
    h = hashlib.sha1()
    fd = STATIC / "assets" / "fonts"
    for f in sorted(fd.glob("*.woff")):
        h.update(f.name.encode("utf-8"))
        h.update(f.read_bytes())
    return h.hexdigest()[:10]


FONT_V = _font_version()


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
    return "", ld  # দৃশ্যমান পথ-লিংক বাদ; শুধু সার্চ ইঞ্জিনের জন্য JSON-LD


# ------------------------------------------------------------------ pages
def banner_slider(fname="slides.json", kind="banner"):
    """মুখপাতার ব্যানার-স্লাইডার: "banner" = হেডারের নিচে (slides.json), "ad" = বিজ্ঞাপন (ads.json)"""
    cfg = load(fname, {}) or {}
    if not cfg.get("enabled", True):
        return ""
    items = []
    for sl in cfg.get("items", []):
        if sl.get("active", True) is False or not sl.get("image"):
            continue
        if sl.get("start") and parse_date(sl["start"]) > NOW:
            continue
        if sl.get("end") and parse_date(sl["end"]) < NOW:
            continue
        items.append(sl)
    if not items:
        return ""
    slides = ""
    for i, sl in enumerate(items):
        alt = esc(sl.get("alt") or SITE)
        loading = 'fetchpriority="high" decoding="async"' if i == 0 else 'loading="lazy" decoding="async"'
        pic = "<picture>" + '<img src="' + asset(sl["image"]) + '" alt="' + alt + '" width="' + ("1880" if kind == "ad" else "2244") + '" height="' + ("496" if kind == "ad" else "592") + '" ' + loading + "></picture>"
        link = sl.get("link") or ""
        if link:
            href = u(link) if link.startswith("/") else link
            tgt = ' target="_blank" rel="noopener"' if sl.get("new_tab") else ""
            inner = '<a href="' + esc(href) + '"' + tgt + ">" + pic + "</a>"
        else:
            inner = "<div>" + pic + "</div>"
        slides += ('<div class="slide" role="group" aria-roledescription="স্লাইড" aria-label="' + bn(i + 1) + " / " + bn(len(items)) + '">' + inner + "</div>")
    controls = ""
    if len(items) > 1:
        if len(items) <= 12:
            dots = "".join('<button class="slider__dot" type="button" aria-label="স্লাইড ' + bn(k + 1) + '"></button>' for k in range(len(items)))
            controls += '<div class="slider__dots">' + dots + "</div>"
        else:
            controls += '<div class="slider__count" aria-hidden="true"></div>'
        controls += ('<button class="slider__arrow slider__arrow--prev" type="button" aria-label="আগের স্লাইড">' + icon("left", 20) + "</button>"
                     '<button class="slider__arrow slider__arrow--next" type="button" aria-label="পরের স্লাইড">' + icon("right", 20) + "</button>")
    interval = int(float(cfg.get("interval", 6) or 6) * 1000) if (cfg.get("autoplay", True) and len(items) > 1) else 0
    style = ("--bn-d:7/2;" if kind == "ad" else "--bn-d:3/1;")
    tag = '<span class="ad-slider__tag">' + esc(cfg.get("label") or "বিজ্ঞাপন") + "</span>" if (kind == "ad" and cfg.get("show_label", True)) else ""
    cls = "ad-slider banner-slider container" if kind == "ad" else ("banner-slider banner-slider--ayojon container" if kind == "ayojon" else "banner-slider container")
    aria = "বিজ্ঞাপন" if kind == "ad" else ("আয়োজন" if kind == "ayojon" else "প্রধান ব্যানার")
    return ('<section class="' + cls + '" aria-label="' + aria + '" style="' + style + '">'
            '<div class="slider" data-slider data-interval="' + str(interval) + '"><div class="slider__track">' + slides + "</div>" + tag + controls + "</div></section>")


def build_home():
    per = S.get("posts_per_page", 12)
    per = max(3, round(per / 3) * 3)  # ৩ কলামের গ্রিডে পুরো সারি ভরতে ৩-এর গুণিতক
    hero_cfg = HOME.get("hero", {})
    main = None
    if hero_cfg.get("main") in POST_BY_ID:
        main = POST_BY_ID[hero_cfg["main"]]
    if not main:
        mc = hero_cfg.get("main_category")
        main = next((p for p in POSTS if mc and mc in p["_cats"]), None) or (POSTS[0] if POSTS else None)
    side = []
    for i in hero_cfg.get("side", []):
        if i in POST_BY_ID and POST_BY_ID[i] is not main and POST_BY_ID[i] not in side:
            side.append(POST_BY_ID[i])
    for p in POSTS:
        if len(side) >= 3:
            break
        if p is not main and p not in side:
            side.append(p)
    hero_ids = {id(main)} | {id(p) for p in side}
    feed = [p for p in POSTS if id(p) not in hero_ids]
    # পাঠকের পছন্দ: বেশি পড়া লেখা আগে; সমান হলে নতুন আগে। পড়ার সংখ্যা না থাকলে পছন্দ-চিহ্নিত লেখা আগে, তারপর সর্বশেষ
    if any(view_count(p) for p in feed):
        feed.sort(key=lambda p: -view_count(p))
    else:
        feed.sort(key=lambda p: 0 if p.get("pick") else 1)
    total = max(1, math.ceil(len(feed) / per))
    sections = {s["type"]: s for s in HOME.get("sections", [])}

    def on(t):
        return sections.get(t, {}).get("enabled", True)

    for page in (1,):  # হোম শুধু একটি পাতা; বাকি সব লেখা /সব-লেখা/ আর্কাইভে (পাতা ১, ২, ৩…)
        chunk = feed[(page - 1) * per: page * per]
        parts = []
        if page == 1:
            parts.append("<noscript><style>.more-grid>*{display:block!important}.feed__list>*{display:flex!important}.more-wrap{display:none!important}</style></noscript>")
            parts.append(banner_slider())
        if page == 1 and on("hero") and main:
            parts.append(f'''<section class="hero container tone tone-8" aria-label="প্রধান লেখা">
  <article class="hero__main">
    <a class="hero__media" href="{main["_url"]}" tabindex="-1" aria-hidden="true">{img_tag(main["cover"].get("src"), main["cover"].get("alt") or main["title"], "hero__img", eager=True, sizes="(max-width: 991px) 100vw, 720px")}</a>
    <div class="hero__body">
      {('<p class="card-g__cat hero__cat"><a href="' + cat_url(main["_sub"] or main["_top"]) + '">' + esc(CAT[main["_sub"] or main["_top"]]["name"]) + "</a></p>") if (main["_sub"] or main["_top"]) else ""}
      <p class="hero__by"><a class="card__author" href="{u("/author/" + main["_author"]["slug"] + "/")}">{aname(main["_author"])}</a><span aria-hidden="true"> · </span><time datetime="{main["_date"].isoformat()}">{bn_date(main["_date"])}</time></p>
      <h2 class="hero__title"><a href="{main["_url"]}">{esc(main["title"])}</a></h2>
      <p class="hero__excerpt clamp-3">{esc(main.get("subtitle") or main["_long"])}</p>
    </div>
  </article>
  <div class="hero__side">{"".join(card_small(p) for p in side)}</div>
</section>''')
        if page == 1 and on("category_pills"):
            pills_html = "".join(f'<a class="pill-lg" href="{cat_url(c["slug"])}">{esc(c["name"])}</a>'
                                 for c in TOP_CATS if c.get("home_pill", True))
            parts.append(f'''<section class="topics container" aria-labelledby="topics-h">
  <h2 class="sec-label sec-label--center" id="topics-h">{esc(sections.get("category_pills", {}).get("title", "পছন্দসই বিষয়ে লেখা পড়ুন"))}</h2>
  <div class="topics__list">{pills_html}</div>
</section>''')
        if page == 1 and on("ayojon") and AYOJON:
            a = AYOJON[0]
            aps = [POST_BY_ID[i] for i in a.get("posts", []) if i in POST_BY_ID]
            cards = "".join(f'<a class="ay-card" href="{p["_url"]}">{img_tag(p["cover"].get("src"), p["title"], "ay-card__img", sizes="260px")}<span class="ay-card__title">{esc(p["title"])}</span><span class="ay-card__author">{aname(p["_author"])}</span></a>' for p in aps)
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
        feed_title = sections.get("feed", {}).get("title", "পাঠকের পছন্দ")
        parts.append(f'''<div class="container feed-wrap{" feed-wrap--top" if page > 1 else " tone tone-1"}">
  <section class="feed" aria-labelledby="feed-h">
    {section_head(feed_title if page == 1 else feed_title + " — পাতা " + bn(page), u("/সব-লেখা/") if feed else None, "সব লেখা", h="h2").replace('class="sec-head__title"', 'class="sec-head__title" id="feed-h"')}
    {more_grid("".join(card_g(p) for p in chunk), len(chunk), "feed__list more-grid")}
    {pagination(page, total, "/") if page > 1 else ""}
  </section>
</div>''')
        if page == 1:
            parts.append(banner_slider("ads.json", "ad"))  # পাঠকের পছন্দের নিচে, রচনাবলির ওপরে
        if page == 1 and on("category_blocks"):
            cb = sections.get("category_blocks", {})
            blocks = ""
            tone = 1  # ১ = সর্বশেষ লেখা; এরপর প্রতিটি সেকশন আলাদা হালকা রঙের পটি
            for slug in cb.get("categories", []):
                if slug not in CAT:
                    continue
                ps = cat_posts(slug)[: max(6, cb.get("count", 12))]
                if not ps:
                    continue
                tone += 1
                blocks += f'''<section class="cat-block container tone tone-{tone}" aria-label="{esc(CAT[slug]["name"])}">
  {section_head(CAT[slug]["name"], cat_url(slug))}
  {more_grid("".join(card_g(p) for p in ps), len(ps), "feed__list more-grid")}
</section>'''
            parts.append(blocks)
        if page == 1 and on("series") and SERIES:
            ser = sorted(SERIES.values(), key=lambda s: max(p["_date"] for p in s["posts"]), reverse=True)[:12]
            items = "".join(series_card(x) for x in ser)
            parts.append(f'''<section class="series-block container tone tone-{(tone + 1) if on("category_blocks") else 2}" aria-label="ধারাবাহিক">
  {section_head(sections.get("series", {}).get("title", "ধারাবাহিক"), u("/ধারাবাহিক/"))}
  {more_grid(items, len(ser), "feed__list more-grid")}</section>''')
        if page == 1 and on("cta"):
            c = sections.get("cta", {})
            parts.append(f'''<section class="cta container" aria-labelledby="cta-h">
  <div class="cta__box">
    <h2 class="cta__title" id="cta-h">{esc(c.get("title", "আপনার লেখা পাঠান"))}</h2>
    <p class="cta__text">{esc(c.get("text", ""))}</p>
    <div class="cta__actions"><a class="btn btn--light" href="{u("/বিশেষ-বার্তা/")}">লেখা পাঠানোর নীতিমালা</a>
    <button class="btn btn--ghost" type="button" data-copy="{esc(S.get("email"))}">{icon("copy", 16)} {esc(S.get("email"))}</button></div>
  </div></section>''')
        if page == 1:
            parts.append(video_section((tone + 2) if on("category_blocks") else 3))
        path = "/" if page == 1 else f"/page/{page}/"
        prev_p = None if page == 1 else ("/" if page == 2 else f"/page/{page - 1}/")
        next_p = f"/page/{page + 1}/" if page < total else None
        for n_old in range(2, total + 1):
            tgt = absu("/সব-লেখা/")
            write(f"/page/{n_old}/", '<!doctype html><html lang="bn"><meta charset="utf-8"><title>পাঠকের পছন্দ</title>'
                  f'<link rel="canonical" href="{tgt}"><meta name="robots" content="noindex">'
                  f'<meta http-equiv="refresh" content="0;url={u("/সব-লেখা/")}"><p><a href="{u("/সব-লেখা/")}">সব লেখা</a></p></html>')
        write(path, layout(
            title=SITE if page == 1 else f"সর্বশেষ লেখা — পাতা {bn(page)}",
            description=S.get("description"), path=path, body="\n".join(parts), active="মুখপাতা",
            og_image=(main["cover"].get("src") if (page == 1 and main) else ""), body_class="home",
            ld=[{"@type": "CollectionPage", "url": absu(path), "name": SITE, "inLanguage": "bn",
                 "isPartOf": {"@id": SITE_URL + "/#website"}}], prev_next=(prev_p, next_p)))


def author_sub(a):
    """নামের নিচের লাইন: পরিচয় • শহর (দুটোই না থাকলে শুধু "লেখক")"""
    parts = [esc(x.strip()) for x in (a.get("role") or "", a.get("city") or "") if x and x.strip()]
    if parts:
        return '<span class="author-chip__dot" aria-hidden="true">•</span>'.join(parts)
    return "লেখক"


def aname(a, size=22):
    """লেখকের নামের বাঁয়ে ছোট গোল ছবি (ছবি না থাকলে নামের প্রথম অক্ষর) + নাম"""
    if a.get("photo"):
        av = '<img class="avatar avatar--xs" src="' + asset(a["photo"]) + '" alt="" width="' + str(size) + '" height="' + str(size) + '" loading="lazy">'
    else:
        initial = (a.get("name") or "?").strip()[:1]
        hue = sum(ord(ch) for ch in a.get("slug", "x")) % 360
        av = '<span class="avatar avatar--xs avatar--ph" style="--h:' + str(hue) + '" aria-hidden="true">' + esc(initial) + "</span>"
    return '<span class="aname">' + av + '<span class="aname__t">' + esc(a["name"]) + "</span></span>"


def avatar(a, size=64):
    if a.get("photo"):
        return f'<img class="avatar" src="{asset(a["photo"])}" alt="{esc(a["name"])}" width="{size}" height="{size}" style="width:{size}px;height:{size}px" loading="lazy">'
    initial = (a.get("name") or "?").strip()[:1]
    hue = sum(ord(ch) for ch in a.get("slug", "x")) % 360
    return f'<span class="avatar avatar--ph" style="--h:{hue};width:{size}px;height:{size}px;font-size:{round(size * 0.4)}px" aria-hidden="true">{esc(initial)}</span>'


def brand_svg(k, size=20, color=None):
    return solid_svg(k, size, color or BRAND[k][0])


A_PLUS = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 19 8 6l5 13M5 14.5h6"/><path d="M18 4v6M15 7h6"/></svg>'
A_MINUS = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 19 8 6l5 13M5 14.5h6"/><path d="M15 7h6"/></svg>'
SHARE_ICO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>'


SHARE_GLYPH = {
    # শেয়ার-বোতামের জন্য বৃত্তহীন, পরিষ্কার চিহ্ন (বোতাম নিজেই গোল): ফেসবুকের "f" ও টেলিগ্রামের কাগজের-বিমান
    "facebook": ("2.6 2.85 19.5 19.5", "M13.6 21v-7.6h2.55l.4-3h-2.95V8.5c0-.87.24-1.46 1.5-1.46H16.7V4.37A21 21 0 0 0 14.4 4.25c-2.27 0-3.83 1.39-3.83 3.93v2.2H8v3h2.57V21z"),
    "telegram": ("3.6 5.1 14.9 14.9", "M16.906 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"),
}


def outline_svg(k, size=20):
    """একরঙা ভরাট আইকন; মাউস নিলে CSS-এ সাদা হয়ে সবুজ বোতামে বসে"""
    vb, path = SHARE_GLYPH.get(k, ("0 0 24 24", BRAND[k][1]))
    return '<svg class="ico-stroke" viewBox="' + vb + '" width="' + str(size) + '" height="' + str(size) + '" fill="currentColor" stroke="none" aria-hidden="true"><path d="' + path + '"/></svg>'


LINK_ICO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'


_MAIL_GLYPH = "M4 4.6h16A2.1 2.1 0 0 1 22.1 6.7v10.6A2.1 2.1 0 0 1 20 19.4H4a2.1 2.1 0 0 1-2.1-2.1V6.7A2.1 2.1 0 0 1 4 4.6ZM3.3 6.9 12 13.2l8.7-6.3v1.9L12 15.1 3.3 8.8Z"
# বোতামের ভেতরের চিহ্ন: key -> (viewBox, path, fill-rule, আকার px) — সব চিহ্ন চোখে সমান মাপের মনে হয় এমন করে বসানো
GLYPHS = {
    "facebook": (SHARE_GLYPH["facebook"][0], SHARE_GLYPH["facebook"][1], "nonzero", 20),
    "telegram": (SHARE_GLYPH["telegram"][0], SHARE_GLYPH["telegram"][1], "nonzero", 19),
    "x": ("0 0 24 24", BRAND["x"][1], "nonzero", 17),
    "whatsapp": ("0 0 24 24", BRAND["whatsapp"][1], "nonzero", 20),
    "youtube": ("0 3.2 24 17.6", BRAND["youtube"][1], "nonzero", 22),
    "instagram": ("0 0 24 24", BRAND["instagram"][1], "nonzero", 19),
    "linkedin": ("0 0 24 24", BRAND["linkedin"][1], "nonzero", 17),
    "tiktok": ("0 0 24 24", BRAND["tiktok"][1], "nonzero", 17),
    "mail": ("0 0 24 24", _MAIL_GLYPH, "evenodd", 21),
}


def glyph_svg(k):
    if k == "link":
        return LINK_ICO
    vb, path, rule, size = GLYPHS[k]
    return ('<svg class="ico-stroke" viewBox="' + vb + '" width="' + str(size) + '" height="' + str(size) + '" fill="currentColor" stroke="none" aria-hidden="true">'
            '<path fill-rule="' + rule + '" clip-rule="' + rule + '" d="' + path + '"/></svg>')


def sbtn(k, href, label, ext=True):
    """পুরো সাইটে একই সোশ্যাল/ইমেইল বোতাম (ফুটার, সম্পাদক, পরিবার, লেখক): গোল, সরু বর্ডার, গাঢ় চিহ্ন; মাউস নিলে ব্র্যান্ড সবুজ"""
    attrs = ' target="_blank" rel="noopener me"' if ext else ""
    return '<a class="sbtn" href="' + esc(href) + '"' + attrs + ' aria-label="' + esc(label) + '" title="' + esc(label) + '">' + glyph_svg(k) + "</a>"



def share_row(p):
    """লেখার শেষে শেয়ার-সারি (পাশের উল্লম্ব সারির বদলে)"""
    full = absu(p["_path"])
    url = urllib.parse.quote(full, safe="")
    t = urllib.parse.quote(p["title"], safe="")
    return f'''<div class="share-row" aria-label="লেখাটি শেয়ার করুন">
  <span class="share-row__label">শেয়ার করুন</span>
  <a class="share-row__btn" href="https://www.facebook.com/sharer/sharer.php?u={url}" target="_blank" rel="noopener" aria-label="ফেসবুকে শেয়ার" title="ফেসবুক">{outline_svg("facebook", 20)}</a>
  <a class="share-row__btn" href="https://x.com/intent/post?url={url}&text={t}" target="_blank" rel="noopener" aria-label="এক্স-এ শেয়ার" title="এক্স">{outline_svg("x", 18)}</a>
  <a class="share-row__btn" href="https://api.whatsapp.com/send?text={t}%20{url}" target="_blank" rel="noopener" aria-label="হোয়াটসঅ্যাপে শেয়ার" title="হোয়াটসঅ্যাপ">{outline_svg("whatsapp", 20)}</a>
  <a class="share-row__btn" href="https://t.me/share/url?url={url}&text={t}" target="_blank" rel="noopener" aria-label="টেলিগ্রামে শেয়ার" title="টেলিগ্রাম">{outline_svg("telegram", 20)}</a>
  <button class="share-row__btn" type="button" data-copy="{esc(full)}" aria-label="লিংক কপি করুন" title="লিংক কপি">{LINK_ICO}</button>
</div>'''


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
    endpoint = ((c.get("native") or {}).get("endpoint") or "").strip().rstrip("/")
    if prov == "native":
        pid = re.sub(r"[^A-Za-z0-9_-]", "_", str(p["id"]))
        return f'''<section class="comments cm" id="comments" aria-label="মন্তব্য" data-cm{" data-demo" if not endpoint else ""} data-endpoint="{esc(endpoint)}" data-post="{esc(pid)}" data-title="{esc(p["title"])}" data-url="{esc(url)}">
  <h2 class="cm__title">মন্তব্য করুন <span class="cm__count" data-cm-count></span></h2>
  <form class="cm__form" data-cm-form novalidate>
    <label class="cm__label" for="cm-name">আপনার নাম <span class="cm__req" aria-hidden="true">*</span></label>
    <input id="cm-name" class="cm__name" name="name" maxlength="60" autocomplete="name" required placeholder="আপনার নাম লিখুন">
    <label class="cm__label" for="cm-text">আপনার মতামত <span class="cm__req" aria-hidden="true">*</span></label>
    <textarea id="cm-text" name="text" rows="4" maxlength="2000" required placeholder="লেখাটি নিয়ে আপনার ভাবনা লিখুন…"></textarea>
    <div class="cm__row">
      <button class="btn cm__send" type="submit">মন্তব্য পাঠান</button>
    </div>
    <input class="cm__hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <p class="cm__msg" role="status" aria-live="polite" data-cm-msg></p>
  </form>
  <div class="cm__list" data-cm-list></div>
  <noscript><p class="cm__hint">মন্তব্য করতে জাভাস্ক্রিপ্ট চালু থাকতে হবে।</p></noscript>
</section>'''
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
    vep = views_endpoint()
    views_attr = (' data-views data-views-endpoint="' + esc(vep) + '" data-post="' + esc(safe_id(p["id"])) + '"') if vep else ""
    content = f'''<article class="entry"{views_attr} itemscope itemtype="https://schema.org/Article">
  <header class="entry-header container">
    {bc_html}
    <div class="entry-byline">
      <a class="entry-author" href="{u("/author/" + a["slug"] + "/")}">{aname(a, 28)}</a>
      <span class="entry-byline__dot" aria-hidden="true">•</span>
      <time datetime="{p["_date"].isoformat()}" itemprop="datePublished">{bn_date(p["_date"])}</time>
    </div>
    <h1 class="entry-title" itemprop="headline">{esc(p["title"])}</h1>
    {f'<p class="entry-subtitle">{esc(p["subtitle"])}</p>' if p.get("subtitle") else ""}
    {f'<p class="entry-translator">অনুবাদ : {esc(p["translator"])}</p>' if p.get("translator") else ""}
    {ay}
    <figure class="entry-cover">{img_tag(cover.get("src"), cover.get("alt") or p["title"], "entry-cover__img", eager=True, sizes="(max-width: 1296px) 100vw, 1248px")}
    {f'<figcaption>{esc(cover["caption"])}</figcaption>' if cover.get("caption") else ""}</figure>
  </header>
  <div class="container entry-layout">
    <div class="entry-main">
      {series_html if p["series"] and (p["series"].get("part") or 0) > 1 else ""}
      {toc}
      <div class="{body_cls}" itemprop="articleBody">{body}</div>
      {series_html}
      {share_row(p)}
      {comments_html(p)}
    </div>
    {sidebar(exclude=p, author=a)}
  </div>
<div class="autoscroll" data-autoscroll>
  <div class="autoscroll__size" id="as-menu" role="group" aria-label="পড়ার সুবিধা" hidden>
    <button class="as-m" type="button" data-fz-down aria-label="লেখা ছোট করুন" title="লেখা ছোট করুন"><span class="as-fz as-fz--s">অ</span></button>
    <button class="as-m" type="button" data-fz-up aria-label="লেখা বড় করুন" title="লেখা বড় করুন"><span class="as-fz as-fz--l">অ</span></button>
    <span class="as-m-sep" aria-hidden="true"></span>
    <button class="as-m autoscroll__play" type="button" data-as-play aria-label="অটো-স্ক্রল চালু করুন" title="অটো-স্ক্রল"><svg class="ap-play" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.52.85l10.2-6.4a1 1 0 0 0 0-1.7L9.52 4.75A1 1 0 0 0 8 5.6z"/></svg><svg class="ap-pause" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="7" y="6" width="3.6" height="12" rx="1.2"/><rect x="13.4" y="6" width="3.6" height="12" rx="1.2"/></svg><span class="as-plabel">অটো-স্ক্রল</span></button>
    <span class="as-spd">
      <button class="as-m as-m--sm" type="button" data-as-slower aria-label="গতি কমান" title="গতি কমান"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg></button>
      <b class="as-spd__v" data-as-speed>১×</b>
      <button class="as-m as-m--sm" type="button" data-as-faster aria-label="গতি বাড়ান" title="গতি বাড়ান"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12M12 6v12"/></svg></button>
    </span>
  </div>
    <div class="autoscroll__panel" id="as-panel" role="group" aria-label="অটো-স্ক্রলের গতি" hidden>
    <button class="autoscroll__btn" type="button" data-as-slower aria-label="গতি কমান" title="গতি কমান"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg></button>
    <span class="autoscroll__speed" aria-live="polite"><b data-as-speed>১×</b><small>গতি</small></span>
    <button class="autoscroll__btn" type="button" data-as-faster aria-label="গতি বাড়ান" title="গতি বাড়ান"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12M12 6v12"/></svg></button>
    <span class="autoscroll__sep" aria-hidden="true"></span>
    <button class="autoscroll__btn" type="button" data-as-close aria-label="অটো-স্ক্রল বন্ধ করুন" title="বন্ধ করুন"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
  </div>
  <button class="autoscroll__fab" type="button" data-as-fab aria-controls="as-panel" aria-pressed="false" aria-label="অটো-স্ক্রল চালু করুন" title="অটো-স্ক্রল — নিজে নিজে পড়ে যান">
    <svg class="as-ico as-ico--play" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 6.5l5 5 5-5M7 12.5l5 5 5-5"/></svg>
    <svg class="as-ico as-ico--tri" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6.5C10.2 5.2 7.6 4.7 4.5 5v12c3.1-.3 5.7.2 7.5 1.5 1.8-1.3 4.4-1.8 7.5-1.5V5c-3.1-.3-5.7.2-7.5 1.5zM12 6.5v12"/></svg>
    <svg class="as-ico as-ico--pause" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><rect x="7" y="6" width="3.6" height="12" rx="1.2"/><rect x="13.4" y="6" width="3.6" height="12" rx="1.2"/></svg>
    <span class="autoscroll__tip" aria-hidden="true">অটো-স্ক্রল</span>
    <span class="autoscroll__label" data-as-label>অটো-স্ক্রল</span>
  </button>
  <button class="autoscroll__top" type="button" data-as-top aria-label="উপরে যান" title="উপরে যান"><svg class="autoscroll__ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20"/></svg><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg></button>
</div>
  <section class="read-next container" aria-labelledby="rn-h">
    <h2 class="read-next__title" id="rn-h">আরও পড়ুন</h2>
    <div class="feed__list">{"".join(card_g(x) for x in related)}</div>
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
                 header_cls="archive-header", before_grid="", card_fn=None, empty_msg="এই বিভাগে এখনো কোনো লেখা প্রকাশিত হয়নি।"):
    per = per or S.get("archive_per_page", 12)
    total = max(1, math.ceil(len(items) / per))
    bc_html, bc_ld = breadcrumb(crumbs)
    for page in range(1, total + 1):
        chunk = items[(page - 1) * per: page * per]
        ppath = path if page == 1 else f"{path}page/{page}/"
        grid = "".join((card_fn or card_v)(p) for p in chunk) or f'<p class="empty">{empty_msg}</p>'
        body = f'''<div class="container archive">
  {bc_html}
  <header class="{header_cls}">{header_html}</header>
  {before_grid}
  <div class="feed__list" data-grid>{grid}</div>
  {pagination(page, total, path)}
</div>'''
        prev_p = None if page == 1 else (path if page == 2 else f"{path}page/{page - 1}/")
        next_p = f"{path}page/{page + 1}/" if page < total else None
        write(ppath, layout(title=title if page == 1 else f"{title} — পাতা {bn(page)}", description=description,
                            path=ppath, body=body, active=active, ld=[{"@type": ld_type, "url": absu(ppath), "name": title, "inLanguage": "bn"}, bc_ld],
                            og_image=(chunk[0]["cover"].get("src") if chunk else ""), prev_next=(prev_p, next_p)))


def build_all_posts():
    """/সব-লেখা/ — সব লেখা পাঠকের পছন্দের ক্রমে (বেশি পড়া আগে; না থাকলে পছন্দ-চিহ্নিত, তারপর নতুন); পাতা ১, ২, ৩… অন্য আর্কাইভের মতোই"""
    sections = {x["type"]: x for x in HOME.get("sections", [])}
    title = sections.get("feed", {}).get("title", "পাঠকের পছন্দ")
    items = list(POSTS)
    if any(view_count(p) for p in items):
        items.sort(key=lambda p: -view_count(p))
    else:
        items.sort(key=lambda p: 0 if p.get("pick") else 1)
    header_html = f'<h1 class="archive-title">{esc(title)}</h1>'
    archive_page(path="/সব-লেখা/", title=title, items=items, crumbs=[("মুখপাতা", "/"), (title, "/সব-লেখা/")], header_html=header_html,
                 description=f"{SITE}-এর সব লেখা — {title} ক্রমে।", active="মুখপাতা")


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
        header_html = f'''<h1 class="archive-title">{esc(c["name"])}</h1>
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
  <div class="topic-card__body"><h2 class="topic-card__title"><a href="{cat_url(c["slug"])}">{esc(c["name"])}</a></h2>
  <p class="archive-desc">{esc(c.get("description", ""))}</p><p class="card__meta">{bn(cat_count(c["slug"]))}টি লেখা</p>
  {f'<ul class="topic-card__kids">{kids}</ul>' if kids else ""}</div></article>'''
    bc_html, bc_ld = breadcrumb([("মুখপাতা", "/"), ("বিষয়সূচি", "/বিষয়সূচি/")])
    write("/বিষয়সূচি/", layout(title="বিষয়সূচি", description=f"{SITE}-এর সব বিভাগ ও উপ-বিভাগ: " + ", ".join(c["name"] for c in TOP_CATS),
                               path="/বিষয়সূচি/", active="বিষয়সূচি", ld=[bc_ld],
                               body=f'<div class="container archive">{bc_html}<header class="archive-header"><h1 class="archive-title">বিষয়সূচি</h1></header><div class="grid grid--3">{cards}</div></div>'))


def build_authors():
    for a in AUTHORS:
        if not a["_posts"]:
            continue
        path = f"/author/{a['slug']}/"
        social = ""
        for k, ic in [("facebook", "facebook"), ("website", "link"), ("email", "mail")]:
            if a.get(k):
                href = ("mailto:" + a[k]) if k == "email" else a[k]
                social += sbtn(ic, href, k, ext=(k != "email"))
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
                     card_fn=lambda p: card_g(p).replace('<article class="card-g">', f'<article class="card-g" data-cat="{p["_top"] or ""}">', 1),
                     crumbs=[("মুখপাতা", "/"), ("লেখকতালিকা", "/লেখক-তালিকা/"), (a["name"], path)],
                     description=a.get("bio") or f'{a["name"]}-এর লেখা — {SITE}', ld_type="ProfilePage")
    # লেখক তালিকা
    with_posts = sorted([a for a in AUTHORS if a["_posts"]], key=lambda a: a["name"])
    cards = "".join(f'''<a class="author-card" href="{u("/author/" + a["slug"] + "/")}">{avatar(a, 96)}
<span class="author-card__name">{esc(a["name"])}</span>
<span class="author-card__bio clamp-2">{esc(a.get("bio") or "")}</span>
<span class="author-card__count">{bn(len(a["_posts"]))}টি লেখা</span></a>''' for a in with_posts)
    bc_html, bc_ld = breadcrumb([("মুখপাতা", "/"), ("লেখকতালিকা", "/লেখক-তালিকা/")])
    body = f'''<div class="container archive">{bc_html}
<header class="archive-header"><h1 class="archive-title">লেখকতালিকা</h1>

<label class="sr-only" for="af">লেখক খুঁজুন</label><input class="filter-input" id="af" type="search" placeholder="লেখক খুঁজুন…" data-author-search autocomplete="off"></header>
<div class="author-grid">{cards}</div></div>'''
    write("/লেখক-তালিকা/", layout(title="লেখকতালিকা", description=f"{SITE}-এর সব লেখকের তালিকা, পরিচিতি ও লেখা।",
                                path="/লেখক-তালিকা/", body=body, active="বাতায়ন", ld=[bc_ld]))


def build_pages():
    for pg in PAGES:
        path = f"/{pg['slug']}/"
        tpl = pg.get("template", "default")
        body = process_body(pg.get("body", ""))
        banner = pg.get("banner") or {}
        bc_html, bc_ld = breadcrumb([("মুখপাতা", "/"), (pg["title"], path)])
        if tpl == "about":
            members = [m for m in (load("family.json", {}) or {}).get("items", []) if m.get("active", True) is not False and m.get("name")]
            cards = ""
            for m in members:
                ico = []
                for k, label in [("facebook", "ফেসবুক"), ("instagram", "ইনস্টাগ্রাম"), ("whatsapp", "হোয়াটসঅ্যাপ"), ("linkedin", "লিংকডইন"), ("x", "এক্স")]:
                    v = (m.get(k) or "").strip()
                    if v:
                        if k == "whatsapp" and not v.startswith("http"):
                            v = "https://wa.me/" + re.sub(r"\D", "", v)
                        ico.append(sbtn(k, v, label))
                if (m.get("website") or "").strip():
                    ico.append(sbtn("link", m["website"].strip(), "ওয়েবসাইট"))
                if (m.get("email") or "").strip():
                    ico.append(sbtn("mail", "mailto:" + m["email"].strip(), "ইমেইল", ext=False))
                ph = {"name": m["name"], "slug": m.get("id", m["name"]), "photo": m.get("photo", "")}
                cards += ('<article class="member">' + avatar(ph, 104)
                          + '<h3 class="member__name">' + esc(m["name"]) + "</h3>"
                          + (('<p class="member__role">' + esc(m["role"]) + "</p>") if m.get("role") else "")
                          + (('<p class="member__bio">' + esc(m["bio"]) + "</p>") if m.get("bio") else "")
                          + (('<div class="member__social">' + "".join(ico) + "</div>") if ico else "") + "</article>")
            fam_head = section_head("কেয়ারি পরিবার", h="h2").replace('class="sec-head__title"', 'class="sec-head__title" id="fam-h"')
            family = ('<section class="family" aria-labelledby="fam-h">' + fam_head + '<div class="family__grid">' + cards + "</div></section>") if cards else ""
            content = f'''<div class="container page page--about">{bc_html}
<header class="page-hero"><h1 class="page-title">{esc(pg["title"])}</h1><p class="page-lead">{esc(S.get("tagline"))}</p></header>
<div class="entry-content entry-content--page">{body}</div>
{family}
</div>'''
        elif tpl == "guidelines":
            content = f'''<div class="container page page--guide">{bc_html}
<header class="page-hero"><h1 class="page-title">{esc(pg["title"])}</h1></header>
{f'<figure class="page-banner page-banner--small">{img_tag(banner.get("src"), banner.get("alt") or pg["title"], "page-banner__img", 1169, 614, eager=True)}</figure>' if banner.get("src") else ""}
<div class="guide-layout">
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
<header class="page-hero">
<h1 class="page-title">{esc(a["title"])}</h1>{f'<p class="page-lead">{esc(a["subtitle"])}</p>' if a.get("subtitle") else ""}</header>
<figure class="page-banner">{img_tag(a.get("banner", {}).get("src"), a.get("banner", {}).get("alt") or a["title"], "page-banner__img", eager=True)}</figure>
<div class="entry-content entry-content--page ay-editorial"><p class="sec-label">সম্পাদকীয়</p>{process_body(a.get("editorial", ""))}</div>
</div>
<section class="container ay-posts" aria-label="{esc(a.get("section_title", "লেখাসমূহ"))}">{section_head(a.get("section_title", "লেখাসমূহ"), center=True)}
<div class="feed__list">{"".join(card_g(p) for p in aps)}</div></section>{other_html}'''
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


def issue_card(x):
    """সংখ্যার কার্ড: হোমের লেখার কার্ডের মতোই — ওপরে প্রচ্ছদ, নিচে সংখ্যা নম্বর, শিরোনাম, সারাংশ, তারিখ"""
    url = u(issue_path(x))
    num = ("সংখ্যা " + bn(x["number"])) if x.get("number") else "বিশেষ সংখ্যা"
    return f'''<article class="card-g">
  <a class="card-g__media" href="{url}" tabindex="-1" aria-hidden="true">{img_tag(x.get("cover"), x["title"], "card-g__img", sizes="(max-width: 575px) 100vw, 280px")}</a>
  <div class="card-g__body">
    <p class="card-g__cat">{num}</p>
    <h3 class="card-g__title"><a href="{url}">{esc(x["title"])}</a></h3>
    <p class="card__excerpt clamp-3">{esc(x.get("summary", ""))}</p>
    <p class="card-g__by"><time datetime="{parse_date(x.get("date")).isoformat()}">{bn_date(parse_date(x.get("date")))}</time></p>
  </div>
</article>'''


def build_issues():
    """সংখ্যাগুচ্ছ — সব সংখ্যা এক জায়গায় (কম্পিউটারে ৬টি, মোবাইলে ৩টি, বাকিগুলো 'আরও দেখুন')"""
    cards = "".join(issue_card(x) for x in ISSUES)
    bc_html, bc_ld = breadcrumb([("মুখপাতা", "/"), ("সংখ্যাগুচ্ছ", "/সংখ্যাগুচ্ছ/")])
    body = (f'<div class="container archive">{bc_html}<header class="archive-header"><h1 class="archive-title">সংখ্যাগুচ্ছ</h1>'
            f'</header>'
            f'{more_grid(cards, len(ISSUES), "feed__list more-grid") if cards else EMPTY_SOON}</div>')
    write("/সংখ্যাগুচ্ছ/", layout(title="সংখ্যাগুচ্ছ", description=f"{SITE}-এর সব সংখ্যা এক জায়গায়।",
                                  path="/সংখ্যাগুচ্ছ/", body=body, active="সংখ্যাগুচ্ছ", ld=[bc_ld],
                                  og_image=((ISSUES[0].get("cover") or "") if ISSUES else "")))
    for x in ISSUES:
        ps = [POST_BY_ID[i] for i in x.get("posts", []) if i in POST_BY_ID]
        num = ("সংখ্যা " + bn(x["number"])) if x.get("number") else "বিশেষ সংখ্যা"
        header_html = (f'<h1 class="archive-title">{esc(x["title"])}</h1>'
                       + (f'<p class="archive-desc">{esc(x["summary"])}</p>' if x.get("summary") else ""))
        archive_page(path=issue_path(x), title=x["title"] + " — সংখ্যাগুচ্ছ", items=ps, header_html=header_html, card_fn=card_g,
                     crumbs=[("মুখপাতা", "/"), ("সংখ্যাগুচ্ছ", "/সংখ্যাগুচ্ছ/"), (x["title"], issue_path(x))],
                     description=(x.get("summary") or x["title"]) + " — " + SITE, active="সংখ্যাগুচ্ছ",
                     empty_msg="এই সংখ্যার লেখাগুলো শীঘ্রই যুক্ত হবে।")


def build_series():
    items = sorted(SERIES.values(), key=lambda s: max(p["_date"] for p in s["posts"]), reverse=True)
    cards = "".join(series_card(x) for x in items)
    bc_html, bc_ld = breadcrumb([("মুখপাতা", "/"), ("ধারাবাহিক", "/ধারাবাহিক/")])
    write("/ধারাবাহিক/", layout(title="ধারাবাহিক", description="কেয়ারির ধারাবাহিক উপন্যাস, জীবনী ও রচনা — পর্ব অনুযায়ী।", path="/ধারাবাহিক/",
                                body=f'<div class="container archive">{bc_html}<header class="archive-header"><h1 class="archive-title">ধারাবাহিক</h1></header><div class="feed__list">{cards}</div></div>', ld=[bc_ld]))
    for s in items:
        path = f"/ধারাবাহিক/{s['slug']}/"
        header_html = f'<h1 class="archive-title">{esc(s["name"])}</h1><p class="archive-desc">{esc(s["posts"][0]["_author"]["name"])}</p>'
        archive_page(path=path, title=s["name"] + " — ধারাবাহিক", items=s["posts"], header_html=header_html,
                     crumbs=[("মুখপাতা", "/"), ("ধারাবাহিক", "/ধারাবাহিক/"), (s["name"], path)],
                     description=f'{s["name"]} — সব পর্ব একসাথে। {SITE}')


def build_videos():
    """/ভিডিও/ — অ্যাডমিনে যোগ করা সব ইউটিউব ভিডিও, ৩ কলামে"""
    cfg = load("videos.json", {}) or {}
    if cfg.get("enabled", True) is False:
        return
    cards = [c for c in (video_card(v) for v in cfg.get("items", []) if v.get("active", True) is not False) if c]
    if not cards:
        return
    title = cfg.get("title") or "ভিডিও"
    bc_html, bc_ld = breadcrumb([("মুখপাতা", "/"), (title, "/ভিডিও/")])
    write("/ভিডিও/", layout(title=title, description=f"{SITE} — {title}", path="/ভিডিও/",
                              body=f'<div class="container archive">{bc_html}<header class="archive-header"><h1 class="archive-title">{esc(title)}</h1></header><div class="feed__list">{"".join(cards)}</div></div>', ld=[bc_ld]))


def build_tags():
    tags = {}
    for p in POSTS:
        for t in p.get("tags", []):
            tags.setdefault(t, []).append(p)
    for t, items in tags.items():
        path = f"/tag/{slugify(t)}/"
        archive_page(path=path, title=f"#{t}", items=items, header_html=f'<h1 class="archive-title">#{esc(t)}</h1>',
                     crumbs=[("মুখপাতা", "/"), (f"#{t}", path)], description=f"‘{t}’ বিষয়ক লেখা — {SITE}")


def build_search():
    idx = [{"t": p["title"], "a": p["_author"]["name"], "ap": asset(p["_author"].get("photo", "")) if p["_author"].get("photo") else "", "as": p["_author"].get("slug", ""), "cl": (CAT[p["_sub"] or p["_top"]]["name"] if (p["_sub"] or p["_top"]) else ""), "cu": (cat_url(p["_sub"] or p["_top"]) if (p["_sub"] or p["_top"]) else ""), "c": " ".join(CAT[c]["name"] for c in p["_cats"]),
            "e": p["excerpt"][:200], "u": p["_url"], "i": asset(p["cover"].get("src", "")), "d": bn_date(p["_date"]),
            "g": " ".join(p.get("tags", []))} for p in POSTS]
    (DIST / "search-index.json").write_text(json.dumps(idx, ensure_ascii=False, separators=(",", ":")), "utf-8")
    body = f'''<div class="container archive">
<header class="archive-header"><h1 class="archive-title" data-search-title>অনুসন্ধান</h1>
<form class="search-form search-form--page" action="{u("/search/")}" method="get" role="search">
<label class="sr-only" for="ps">খুঁজুন</label><input id="ps" type="search" name="s" placeholder="লেখা, লেখক বা বিষয়…" required data-sx-trigger autocomplete="off"><button class="btn" type="submit">খুঁজুন</button></form>
<p class="archive-desc" data-search-count aria-live="polite"></p></header>
<div class="feed__list" data-search-results></div>
<nav class="pagination" data-search-pages aria-label="পাতা নম্বর"></nav>
</div>'''
    write("/search/", layout(title="অনুসন্ধান", description=f"{SITE}-এ লেখা, লেখক ও বিষয় খুঁজুন।", path="/search/", body=body, noindex=True, body_class="search-page"))


def build_404():
    body = f'''<div class="container nf">
<div class="nf__icon">{icon("file-x", 56)}</div>
<h1 class="nf__title">পাতাটি খুঁজে পাওয়া যায়নি</h1>
<p class="nf__text">দুঃখিত, আপনি যে পাতাটি খুঁজছেন তা এখানে নেই। হয়তো ঠিকানাটি বদলেছে বা মুছে ফেলা হয়েছে।</p>
<form class="search-form search-form--page" action="{u("/search/")}" method="get" role="search"><label class="sr-only" for="nfs">খুঁজুন</label><input id="nfs" type="search" name="s" placeholder="খুঁজে দেখুন…" required data-sx-trigger autocomplete="off"><button class="btn" type="submit">খুঁজুন</button></form>
<p><a class="btn" href="{u("/")}">মুখপাতায় ফিরুন</a></p>
<div class="feed__list nf__latest">{"".join(card_g(p) for p in POSTS[:3])}</div>
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
        _fc = DIST / "assets" / "css" / "fonts.css"
        if _fc.exists():
            _fc.write_text(_fc.read_text(encoding="utf-8").replace(".woff)", ".woff?v=" + FONT_V + ")"), encoding="utf-8")
    (DIST / "assets" / "css").mkdir(parents=True, exist_ok=True)
    (DIST / "assets" / "css" / "styles.css").write_text(style_css(), "utf-8")
    if ADMIN.exists():
        shutil.copytree(ADMIN, DIST / "admin", dirs_exist_ok=True)
        # অ্যাডমিনের সব মডিউল/স্টাইলে বিল্ড-সংস্করণ বসানো — গিটহাব পেজেস-এর ১০ মিনিটের ক্যাশে পুরোনো কোড আটকে থাকবে না
        _ad = DIST / "admin"
        for _f in _ad.rglob("*.js"):
            _t = _f.read_text(encoding="utf-8")
            _t = re.sub(r"""((?:from\s+|import\()\s*['"])(\.{1,2}/[^'"?]+\.js)(['"])""", lambda m: m.group(1) + m.group(2) + "?v=" + BUILD_ID + m.group(3), _t)
            _f.write_text(_t, encoding="utf-8")
        _ix = _ad / "index.html"
        if _ix.exists():
            _h = _ix.read_text(encoding="utf-8")
            _h = _h.replace('src="js/app.js"', 'src="js/app.js?v=' + BUILD_ID + '"').replace('admin.css"', 'admin.css?v=' + BUILD_ID + '"')
            _ix.write_text(_h, encoding="utf-8")
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
        "icons": [{"src": u("/assets/img/favicon.svg"), "sizes": "any", "type": "image/svg+xml", "purpose": "any"}]},
        ensure_ascii=False), "utf-8")


def main():
    t0 = datetime.now()
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    build_static()
    build_home()
    build_all_posts()
    for p in POSTS:
        build_post(p)
    build_categories()
    build_authors()
    build_pages()
    build_ayojon()
    build_issues()
    build_series()
    build_videos()
    build_tags()
    build_search()
    build_404()
    build_feeds()
    extra = ["/বিষয়সূচি/", "/লেখক-তালিকা/", "/আয়োজন/", "/সংখ্যাগুচ্ছ/", "/ধারাবাহিক/", "/সব-লেখা/"] + [f"/{p['slug']}/" for p in PAGES] + \
            [ayojon_path(a) for a in AYOJON] + [issue_path(x) for x in ISSUES] + [f"/ধারাবাহিক/{s}/" for s in SERIES] + (["/ভিডিও/"] if (DIST / "ভিডিও" / "index.html").exists() else [])
    build_sitemaps(extra)
    (DIST / "version.json").write_text(json.dumps({"v": BUILD_ID}), encoding="utf-8")
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
