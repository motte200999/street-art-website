#!/usr/bin/env python3
"""Holt für Einträge ohne Bilddatei das Vorschaubild (og:image) der verlinkten Seite.
Ergebnis: research/web-images.json  { id: {"datei":..., "seite":..., "host":...} }"""
import json, glob, os, re, subprocess, sys, html
from urllib.parse import urlparse, urljoin

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "research", "web-images.json")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"

def curl(url, dest=None):
    cmd = ["curl", "-sL", "--max-time", "30", "-A", UA, url]
    if dest:
        cmd += ["-o", dest]
        return subprocess.run(cmd).returncode == 0
    return subprocess.run(cmd, capture_output=True).stdout.decode("utf-8", "ignore")

def og_image(page_html):
    for pat in (r'<meta[^>]+property=["\']og:image(?::secure_url)?["\'][^>]+content=["\']([^"\']+)',
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image',
                r'<meta[^>]+name=["\']twitter:image(?::src)?["\'][^>]+content=["\']([^"\']+)'):
        m = re.search(pat, page_html, re.I)
        if m:
            return html.unescape(m.group(1))
    return None

done = json.load(open(OUT)) if os.path.exists(OUT) else {}
only = set(sys.argv[1:])
for f in sorted(glob.glob(os.path.join(ROOT, "research", "group-*.json"))):
    for p in json.load(open(f)):
        pid = p["id"]
        if only and pid not in only: continue
        if p.get("bild_datei") or pid in done or not p.get("image_link"): continue
        link = p["image_link"]
        img = link if re.search(r"\.(jpe?g|png|webp)(\?|$)", link, re.I) else og_image(curl(link))
        if not img:
            print(pid, "kein Bild gefunden:", link); continue
        img = urljoin(link, img)
        tmp = os.path.join(ROOT, "images", pid + "-web.tmp")
        if not curl(img, tmp) or not os.path.exists(tmp):
            print(pid, "Download fehlgeschlagen"); continue
        kind = subprocess.run(["file", "-b", "--mime-type", tmp], capture_output=True).stdout.decode().strip()
        if kind not in ("image/jpeg", "image/png", "image/webp") or os.path.getsize(tmp) < 8000:
            print(pid, "keine brauchbare Bilddatei:", kind, os.path.getsize(tmp)); os.remove(tmp); continue
        dest = os.path.join(ROOT, "images", pid + "-web.jpg")
        r = subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "80", "-Z", "1280", tmp, "--out", dest], capture_output=True)
        os.remove(tmp)
        if r.returncode != 0 or not os.path.exists(dest):
            print(pid, "Umwandlung fehlgeschlagen"); continue
        done[pid] = {"datei": "images/" + pid + "-web.jpg", "seite": link, "host": urlparse(link).netloc.replace("www.", "")}
        print(pid, "ok", done[pid]["host"])
        json.dump(done, open(OUT, "w"), ensure_ascii=False, indent=1)
json.dump(done, open(OUT, "w"), ensure_ascii=False, indent=1)
print(len(done), "Bilder aus Webquellen")
