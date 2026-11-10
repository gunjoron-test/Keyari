#!/usr/bin/env python3
"""
WordPress → কেয়ারি কনটেন্ট ইমপোর্টার (শুধু Python স্ট্যান্ডার্ড লাইব্রেরি)

ব্যবহার:
  python tools/import_wordpress.py https://thekeyari.com
  python tools/import_wordpress.py https://thekeyari.com --download-images
  python tools/import_wordpress.py https://thekeyari.com --keep-existing

--download-images  : কভার ও লেখার ভেতরের ছবি static/uploads/wp/ ফোল্ডারে নামিয়ে লিংক বদলে দেয়
                     (পুরোনো WordPress সাইট বন্ধ করার আগে অবশ্যই একবার চালাবেন)
--keep-existing    : আগে থেকে থাকা লেখার ফাইল বদলাবে না (শুধু নতুনগুলো যোগ হবে)
"""
import argparse
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
UPLOADS = ROOT / "static" / "uploads" / "wp"
UA = {"User-Agent": "Mozilla/5.0 (compatible; KeyariMigrator/1.0)"}

ORDINALS = {"প্রথম": 1, "দ্বিতীয়": 2, "তৃতীয়": 3, "চতুর্থ": 4, "পঞ্চম": 5, "ষষ্ঠ": 6,
            "সপ্তম": 7, "অষ্টম": 8, "নবম": 9, "দশম": 10, "একাদশ": 11, "দ্বাদশ": 12,
            "শেষ": 99}
BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def get_json(url, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r), r.headers
        except Exception as e:  # noqa
            if i == retries - 1:
                raise
            print("  আবার চেষ্টা:", e)
            time.sleep(2 + i * 2)


def get_all(base, endpoint, params=""):
    out, page = [], 1
    while True:
        url = f"{base}/wp-json/wp/v2/{endpoint}?per_page=100&page={page}{params}"
        try:
            data, headers = get_json(url)
        except urllib.error.HTTPError as e:
            if e.code == 400:
                break
            raise
        out.extend(data)
        total_pages = int(headers.get("X-WP-TotalPages") or 1)
        print(f"  {endpoint}: পাতা {page}/{total_pages}")
        if page >= total_pages:
            break
        page += 1
    return out


def strip_tags(s):
    s = re.sub(r"<[^>]+>", "", s or "")
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def clean_excerpt(s):
    s = strip_tags(s)
    s = re.sub(r"\s*(\[(…|&hellip;|\.\.\.)\]|Discover More|Read More)\s*$", "", s)
    return s.strip()


def detect_series(title):
    m = re.match(r"^(.*?)\s*[\(（]\s*(\S+)\s*(পর্ব|কিস্তি|খণ্ড|অধ্যায়)\s*[\)）]\s*$", title)
    if not m:
        return None
    name, word, unit = m.group(1).strip(), m.group(2), m.group(3)
    part = ORDINALS.get(word)
    if part is None:
        try:
            part = int(word.translate(BN_DIGITS))
        except ValueError:
            part = None
    if part is None:
        return None
    return {"name": name, "part": part, "unit": unit}


def download(url, dest: Path):
    if dest.exists():
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=120) as r:
            dest.write_bytes(r.read())
        return True
    except Exception as e:  # noqa
        print("  ছবি নামানো যায়নি:", url, e)
        return False


def localize_image(url, site, enabled):
    """WP আপলোডের ছবি লোকাল করে /uploads/wp/... পাথ ফেরত দেয়"""
    if not enabled or not url:
        return url
    p = urllib.parse.urlparse(url)
    if not p.netloc or urllib.parse.urlparse(site).netloc not in p.netloc:
        return url
    m = re.search(r"/wp-content/uploads/(.+)$", p.path)
    if not m:
        return url
    rel = urllib.parse.unquote(m.group(1))
    rel = re.sub(r"[^\w.\-/]", "-", rel)
    dest = UPLOADS / rel
    if download(url, dest):
        return "/uploads/wp/" + rel
    return url


def rewrite_body(body, site, dl):
    host = urllib.parse.urlparse(site).netloc

    def img_sub(m):
        return m.group(1) + localize_image(m.group(2), site, dl) + m.group(3)

    if dl:
        body = re.sub(r'(<img[^>]+src=")([^"]+)(")', img_sub, body)
        body = re.sub(r'\s(srcset|sizes)="[^"]*"', "", body)
    # অভ্যন্তরীণ লিংক আপেক্ষিক করা (ছবি বাদে)
    def link_sub(m):
        url = m.group(2)
        if "/wp-content/" in url:
            return m.group(0)
        p = urllib.parse.urlparse(url)
        path = urllib.parse.unquote(p.path) or "/"
        return m.group(1) + path + (("?" + p.query) if p.query else "") + (("#" + p.fragment) if p.fragment else "") + m.group(3)
    body = re.sub(r'(href=")(https?://(?:www\.)?' + re.escape(host) + r'[^"]*)(")', link_sub, body)
    return body.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("site", nargs="?", default="https://thekeyari.com")
    ap.add_argument("--download-images", action="store_true")
    ap.add_argument("--keep-existing", action="store_true")
    a = ap.parse_args()
    site = a.site.rstrip("/")
    dl = a.download_images

    (CONTENT / "posts").mkdir(parents=True, exist_ok=True)
    (CONTENT / "pages").mkdir(parents=True, exist_ok=True)

    # ---------- বিভাগ ----------
    print("বিভাগ আনা হচ্ছে…")
    wp_cats = get_all(site, "categories")
    cat_by_id = {c["id"]: c for c in wp_cats}
    cats_path = CONTENT / "categories.json"
    cats = json.loads(cats_path.read_text("utf-8")) if cats_path.exists() else []
    known = {c["slug"]: c for c in cats}
    for c in wp_cats:
        slug = urllib.parse.unquote(c["slug"])
        if slug == "uncategorized":
            continue
        desc = strip_tags(c.get("description", ""))
        if slug in known:
            if desc and not known[slug].get("description"):
                known[slug]["description"] = desc
        else:
            parent = cat_by_id.get(c.get("parent"))
            item = {"slug": slug, "name": html.unescape(c["name"]),
                    "parent": urllib.parse.unquote(parent["slug"]) if parent else None,
                    "order": 99, "description": desc}
            cats.append(item)
            known[slug] = item
    cats_path.write_text(json.dumps(cats, ensure_ascii=False, indent=2) + "\n", "utf-8")

    # ---------- লেখক ----------
    print("লেখক আনা হচ্ছে…")
    try:
        wp_users = get_all(site, "users")
    except Exception as e:  # noqa
        print("  users endpoint বন্ধ:", e)
        wp_users = []
    authors_path = CONTENT / "authors.json"
    authors = json.loads(authors_path.read_text("utf-8")) if authors_path.exists() else []
    a_known = {x["slug"]: x for x in authors}
    user_by_id = {}
    for u in wp_users:
        slug = urllib.parse.unquote(u["slug"])
        user_by_id[u["id"]] = slug
        bio = strip_tags(u.get("description", ""))
        if slug in a_known:
            if bio and not a_known[slug].get("bio"):
                a_known[slug]["bio"] = bio
            continue
        item = {"slug": slug, "name": html.unescape(u["name"]), "bio": bio, "photo": "",
                "email": "", "facebook": "", "website": ""}
        authors.append(item)
        a_known[slug] = item

    # ---------- লেখা ----------
    print("লেখা আনা হচ্ছে…")
    posts = get_all(site, "posts", "&_embed=author,wp:featuredmedia,wp:term")
    count = 0
    for p in posts:
        pid = f"wp-{p['id']}"
        path = CONTENT / "posts" / f"{pid}.json"
        if a.keep_existing and path.exists():
            continue
        emb = p.get("_embedded", {})
        au = (emb.get("author") or [{}])[0]
        a_slug = urllib.parse.unquote(au.get("slug") or user_by_id.get(p["author"], "")) or "keyari"
        if a_slug not in a_known:
            item = {"slug": a_slug, "name": html.unescape(au.get("name") or a_slug), "bio": strip_tags(au.get("description", "")),
                    "photo": "", "email": "", "facebook": "", "website": ""}
            authors.append(item)
            a_known[a_slug] = item
        terms = emb.get("wp:term") or [[], []]
        cat_slugs = [urllib.parse.unquote(t["slug"]) for t in (terms[0] if terms else []) if t.get("taxonomy") == "category"]
        cat_slugs = [c for c in cat_slugs if c != "uncategorized"]
        tags = [html.unescape(t["name"]) for t in (terms[1] if len(terms) > 1 else []) if t.get("taxonomy") == "post_tag"]
        fm = (emb.get("wp:featuredmedia") or [{}])[0]
        cover = fm.get("source_url", "") if isinstance(fm, dict) else ""
        title = strip_tags(p["title"]["rendered"])
        post = {
            "id": pid,
            "title": title,
            "subtitle": "",
            "slug": urllib.parse.unquote(p["slug"]),
            "date": p["date"] + "+06:00",
            "modified": p.get("modified", p["date"]) + "+06:00",
            "status": "published" if p["status"] == "publish" else "draft",
            "author": a_slug,
            "translator": "",
            "categories": cat_slugs,
            "tags": tags,
            "cover": {"src": localize_image(cover, site, dl), "alt": (fm.get("alt_text") if isinstance(fm, dict) else "") or title, "caption": ""},
            "excerpt": clean_excerpt(p["excerpt"]["rendered"]),
            "body": rewrite_body(p["content"]["rendered"], site, dl),
            "series": detect_series(title),
            "ayojon": "",
            "featured": bool(p.get("sticky")),
            "pick": False,
            "comments": p.get("comment_status") == "open",
            "seo": {"title": "", "description": "", "keyphrase": "", "og_image": "", "canonical": "", "noindex": False},
            "layout": {"justify": True, "dropcap": False},
            "source": {"wp_id": p["id"], "link": urllib.parse.unquote(p["link"])}
        }
        path.write_text(json.dumps(post, ensure_ascii=False, indent=2) + "\n", "utf-8")
        count += 1
    print(f"  {count}টি লেখা লেখা হলো")

    authors_path.write_text(json.dumps(authors, ensure_ascii=False, indent=2) + "\n", "utf-8")

    # ---------- পাতা ----------
    print("পাতা আনা হচ্ছে…")
    pages = get_all(site, "pages")
    for pg in pages:
        slug = urllib.parse.unquote(pg["slug"])
        path = CONTENT / "pages" / f"wp-page-{pg['id']}.json"
        if path.exists() and a.keep_existing:
            continue
        if path.exists():
            old = json.loads(path.read_text("utf-8"))
            if old.get("custom_template"):
                continue  # হাতে বানানো উন্নত টেমপ্লেট অক্ষুণ্ণ থাকবে
        page = {"id": f"wp-page-{pg['id']}", "title": strip_tags(pg["title"]["rendered"]), "slug": slug,
                "status": "published" if pg["status"] == "publish" else "draft",
                "template": "default", "body": rewrite_body(pg["content"]["rendered"], site, dl),
                "seo": {"title": "", "description": strip_tags(pg.get("excerpt", {}).get("rendered", ""))[:160], "noindex": False},
                "date": pg["date"] + "+06:00", "modified": pg.get("modified", pg["date"]) + "+06:00"}
        path.write_text(json.dumps(page, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print("সম্পন্ন ✔")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
