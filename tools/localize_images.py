#!/usr/bin/env python3
"""
পুরোনো WordPress সাইটে থাকা সব ছবি রিপোতে নামিয়ে এনে লিংক বদলে দেয়।
পুরোনো সাইট বন্ধ / ডোমেইন সরানোর আগে একবার চালান (GitHub Actions থেকেও চালানো যায়)।

  python tools/localize_images.py                       (ডিফল্ট: thekeyari.com)
  python tools/localize_images.py --host example.com
"""
import argparse
import json
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


def fetch(url, dest):
    if dest.exists() and dest.stat().st_size > 0:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                dest.write_bytes(r.read())
            return True
        except Exception as e:  # noqa
            if i == 2:
                print("  ✖", url, e)
                return False
            time.sleep(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="thekeyari.com")
    a = ap.parse_args()
    pat = re.compile(r"https?://(?:www\.)?" + re.escape(a.host) + r"/wp-content/uploads/([^\"'\s)<>]+)")
    files = [p for p in CONTENT.rglob("*.json")]
    total = changed = 0
    for f in files:
        text = f.read_text("utf-8")
        urls = set(pat.findall(text))
        if not urls:
            continue
        new = text
        for rel in urls:
            clean = urllib.parse.unquote(rel)
            safe = re.sub(r"[^\w.\-/]", "-", clean)
            src = f"https://{a.host}/wp-content/uploads/{rel}"
            if fetch(src, UPLOADS / safe):
                new = re.sub(r"https?://(?:www\.)?" + re.escape(a.host) + r"/wp-content/uploads/" + re.escape(rel), "/uploads/wp/" + safe, new)
                total += 1
        if new != text:
            json.loads(new)  # যাচাই
            f.write_text(new, "utf-8")
            changed += 1
            print("✔", f.relative_to(ROOT))
    print(f"সম্পন্ন: {total}টি ছবি, {changed}টি ফাইল হালনাগাদ")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
