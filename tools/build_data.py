#!/usr/bin/env python3
"""Führt die Recherche-Dateien zusammen.
  python3 tools/build_data.py de      -> research/merged-de.json (Auswahl, deutsch)
  python3 tools/build_data.py site    -> data/pieces.js (mit Übersetzungen aus research/translations-*.json)"""
import json, glob, os, re, sys, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = lambda *a: os.path.join(ROOT, *a)

KEEP = {
    "a": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18],
    "b": [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14],
    "c": [1, 2, 4, 5, 6, 7, 9, 10, 11, 13, 14, 15, 16, 17],
    "d": [1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14],
    "e": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    "f": [1, 2, 3, 4, 8, 9, 10, 11, 12, 13, 14, 15, 16],
}
# Bilder, die bei der Sichtprüfung durchgefallen sind (zeigen nicht das Werk)
BAD_IMAGES = set(json.load(open(R("research", "bad-images.json")))) if os.path.exists(R("research", "bad-images.json")) else set()
# Handkorrekturen einzelner Felder
FIX = json.load(open(R("research", "fixes.json"))) if os.path.exists(R("research", "fixes.json")) else {}

def load_all():
    out = {}
    for f in sorted(glob.glob(R("research", "group-*.json"))):
        for p in json.load(open(f)):
            out[p["id"]] = p
    return out

def own_ids(allp):
    """Eigene Pieces (research/group-o.json) kommen immer vollständig auf die Karte."""
    return sorted(i for i in allp if i.startswith("o-"))

def norm(p, web):
    ex = (p.get("existiert_noch") or "unbekannt").strip().lower()
    y = re.search(r"(19|20)\d\d", ex)
    existiert = "ja" if ex.startswith("ja") else ("nein" if ex.startswith("nein") else "unbekannt")
    q = {
        "id": p["id"], "titel": p["titel"], "kuenstler": p["kuenstler"], "jahr": str(p.get("jahr") or ""),
        "arr": int(p["arrondissement"]), "adresse": p["adresse"], "lat": float(p["lat"]), "lng": float(p["lng"]),
        "status": "geduldet" if p["status"].startswith("geduldet") else p["status"],
        "begruendung": p["status_begruendung"], "beschreibung": p["beschreibung"],
        "existiert": existiert, "entfernt_jahr": y.group(0) if (existiert == "nein" and y) else "",
        "bild": None, "bild_urheber": None, "bild_lizenz": None, "bild_quelle": None,
        "link": p.get("image_link") or (p.get("quellen") or [None])[0],
        "quellen": [u for u in dict.fromkeys(([p.get("status_quelle")] if p.get("status_quelle") else []) + (p.get("quellen") or [])) if u][:5],
        "sicherheit": p.get("sicherheit", ""),
        "eigen_foto": bool(p.get("eigen_foto")),
    }
    if p.get("bild_datei") and os.path.exists(R(p["bild_datei"])) and p["id"] not in BAD_IMAGES:
        q.update(bild=p["bild_datei"], bild_urheber=p.get("bild_urheber"), bild_lizenz=p.get("bild_lizenz"), bild_quelle=p.get("bild_quelle"))
    elif p["id"] in web and p["id"] not in BAD_IMAGES and os.path.exists(R(web[p["id"]]["datei"])):
        w = web[p["id"]]
        q.update(bild=w["datei"], bild_urheber="via " + w["host"], bild_lizenz="© Urheber – nicht frei lizenziert", bild_quelle=w["seite"])
    q.update(FIX.get(p["id"], {}))
    return q

def spread(items):
    """Zieht Punkte auseinander, die (fast) auf derselben Stelle liegen."""
    for i, a in enumerate(items):
        n = 0
        for b in items[:i]:
            if abs(a["lat"] - b["lat"]) < 0.00018 and abs(a["lng"] - b["lng"]) < 0.00027:
                n += 1
        if n:
            ang = n * 2.1
            a["lat"] = round(a["lat"] + 0.00028 * math.sin(ang), 6)
            a["lng"] = round(a["lng"] + 0.00042 * math.cos(ang), 6)
    return items

def selected():
    allp = load_all()
    web = json.load(open(R("research", "web-images.json"))) if os.path.exists(R("research", "web-images.json")) else {}
    out = []
    for g, nums in KEEP.items():
        for n in nums:
            out.append(norm(allp["%s-%02d" % (g, n)], web))
    for i in own_ids(allp):
        out.append(norm(allp[i], web))
    out.sort(key=lambda p: (p["arr"], p["id"]))
    return spread(out)

mode = sys.argv[1] if len(sys.argv) > 1 else "de"
items = selected()
if mode == "de":
    json.dump(items, open(R("research", "merged-de.json"), "w"), ensure_ascii=False, indent=1)
    print(len(items), "Pieces;", sum(1 for p in items if p["bild"]), "mit Bild")
else:
    tr = {}
    for f in sorted(glob.glob(R("research", "translations-*.json"))):
        tr.update(json.load(open(f)))
    missing = [p["id"] for p in items if p["id"] not in tr]
    for p in items:
        t = tr.get(p["id"], {})
        for k in ("titel", "begruendung", "beschreibung"):
            de = (t.get(k) or {}).get("de") or p[k]
            p[k] = {"de": de, "en": (t.get(k) or {}).get("en") or de, "fr": (t.get(k) or {}).get("fr") or de}
        del p["sicherheit"]
    open(R("data", "pieces.js"), "w").write("window.PIECES = " + json.dumps(items, ensure_ascii=False, indent=1) + ";\n")
    print(len(items), "Pieces geschrieben; ohne Übersetzung:", missing)
