#!/usr/bin/env python3
"""Holt neue eigene Fotos aus dem Obsidian-Ordner „Eigene Fotos“.
Für jedes noch nicht übernommene Foto:
  - GPS-Position aus dem Foto lesen (tools/photo_gps.swift)
  - Foto als JPEG (max. 1600 px) nach images/o-NN-eigen.jpg kopieren
  - Adresse über OpenStreetMap/Nominatim bestimmen
  - Arrondissement über die offiziellen Grenzen bestimmen
  - nahe bestehende Pieces (< 80 m) als mögliche Treffer melden
Ergebnis: research/own-photos.json (Liste aller übernommenen Fotos) – danach werden die Einträge
von Hand recherchiert und in research/group-o.json bzw. research/fixes.json eingetragen."""
import json, os, subprocess, math, time, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOLDER = os.path.expanduser("~/Library/Mobile Documents/iCloud~md~obsidian/Documents/obsidian/Schule/Seminarfach/Paris-Produkt/Eigene Fotos")
INDEX = os.path.join(ROOT, "research", "own-photos.json")
EXT = (".jpg", ".jpeg", ".heic", ".png")
UA = "street-art-seminar-project/1.0 (school project)"

def load_js(name):
    return json.loads(open(os.path.join(ROOT, "data", name)).read().split("=", 1)[1].rstrip().rstrip(";"))

def in_ring(x, y, ring):
    inside = False
    for i in range(len(ring)):
        x1, y1 = ring[i]; x2, y2 = ring[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside

def arrondissement(lat, lng, arr):
    for f in arr["features"]:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            if in_ring(lng, lat, poly[0]):
                return f["properties"]["c_ar"]
    return None

def dist_m(a, b, c, d):
    k = math.pi / 180
    x = (d - b) * k * math.cos((a + c) / 2 * k); y = (c - a) * k
    return 6371000 * math.hypot(x, y)

def address(lat, lng):
    url = "https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode({"lat": lat, "lon": lng, "format": "jsonv2", "zoom": 18, "accept-language": "fr"})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
            a = json.load(r).get("address", {})
        street = " ".join(x for x in [a.get("house_number"), a.get("road") or a.get("pedestrian") or a.get("square")] if x)
        return ", ".join(x for x in [street, a.get("postcode"), "Paris"] if x)
    except Exception as e:
        return "unbekannt (%s)" % e

if not os.path.isdir(FOLDER):
    raise SystemExit("Ordner fehlt: " + FOLDER)
index = json.load(open(INDEX)) if os.path.exists(INDEX) else []
known = {e["quelle"] for e in index}
pieces = load_js("pieces.js"); arr = load_js("arrondissements.js")
nr = len(index)
new = []
for name in sorted(os.listdir(FOLDER)):
    if not name.lower().endswith(EXT) or name in known:
        continue
    src = os.path.join(FOLDER, name)
    nr += 1
    pid = "o-%02d" % nr
    dest = "images/%s-eigen.jpg" % pid
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "80", "-Z", "1600", src, "--out", os.path.join(ROOT, dest)], capture_output=True)
    gps = json.loads(subprocess.run(["swift", os.path.join(ROOT, "tools", "photo_gps.swift"), src], capture_output=True, text=True).stdout or "{}")
    e = {"id": pid, "quelle": name, "datei": dest, "lat": gps.get("lat"), "lng": gps.get("lng"), "datum": gps.get("date"),
         "adresse": None, "arr": None, "nahe": [], "status": "neu"}
    if e["lat"] is not None:
        e["adresse"] = address(e["lat"], e["lng"]); time.sleep(1.1)
        e["arr"] = arrondissement(e["lat"], e["lng"], arr)
        near = sorted((round(dist_m(e["lat"], e["lng"], p["lat"], p["lng"])), p["id"], p["titel"]["de"]) for p in pieces)
        e["nahe"] = [{"id": i, "titel": t, "meter": m} for m, i, t in near if m < 80][:3]
    index.append(e); new.append(e)
    print(pid, name, "->", e["adresse"] or "KEIN STANDORT im Foto", "| Arr.", e["arr"], "| nahe:", [(n["id"], n["meter"]) for n in e["nahe"]])
json.dump(index, open(INDEX, "w"), ensure_ascii=False, indent=1)
print(len(new), "neue Fotos übernommen")
