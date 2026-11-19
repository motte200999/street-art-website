#!/usr/bin/env python3
"""Berechnet für jedes Arrondissement einen Fußweg durch alle seine Pieces.
Nutzt den freien OSRM-Fußgänger-Router von FOSSGIS (routing.openstreetmap.de).
Für jeden möglichen Startpunkt wird die beste Reihenfolge berechnet; die kürzeste Route gewinnt.
Ergebnis: data/routes.js  ->  window.ROUTES = { "13": {order, distance, duration, coords}, ... }"""
import json, os, time, subprocess, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://routing.openstreetmap.de/routed-foot/trip/v1/driving/"
UA = "street-art-seminar-project/1.0 (school project)"

def trip(points, first):
    """points: [(lat,lng)], first: Index des Startpunkts. Gibt (trip, waypoints) zurück."""
    pts = [points[first]] + [p for i, p in enumerate(points) if i != first]
    coords = ";".join("%.6f,%.6f" % (p[1], p[0]) for p in pts)
    url = BASE + coords + "?roundtrip=false&source=first&destination=any&overview=full&geometries=geojson"
    for attempt in range(4):
        try:
            # curl statt urllib: das Python der Command Line Tools hat eine zu alte SSL-Bibliothek für diesen Server
            res = subprocess.run(["curl", "-s", "--max-time", "60", "-A", UA, url], capture_output=True, text=True)
            d = json.loads(res.stdout)
            if d.get("code") == "Ok":
                # waypoint_index der i-ten Eingabe -> Position in der Route
                order = [None] * len(pts)
                for i, w in enumerate(d["waypoints"]):
                    order[w["waypoint_index"]] = i
                mapping = [first] + [i for i in range(len(points)) if i != first]
                return d["trips"][0], [mapping[i] for i in order]
            print("  Antwort:", d.get("code"))
        except Exception as e:
            print("  Fehler:", e)
        time.sleep(3 * (attempt + 1))
    return None, None

pieces = json.loads(open(os.path.join(ROOT, "data", "pieces.js")).read().split("=", 1)[1].rstrip().rstrip(";"))
by_arr = collections.defaultdict(list)
for p in pieces:
    by_arr[p["arr"]].append(p)

routes = {}
for arr in sorted(by_arr):
    ps = by_arr[arr]
    if len(ps) < 2:
        print(arr, "– nur ein Piece, keine Route")
        continue
    pts = [(p["lat"], p["lng"]) for p in ps]
    best = None
    for first in range(len(ps)):
        t, order = trip(pts, first)
        time.sleep(1.1)  # höflich zum freien Server
        if t and (best is None or t["distance"] < best[0]["distance"]):
            best = (t, order)
    if not best:
        print(arr, "– keine Route erhalten"); continue
    t, order = best
    routes[str(arr)] = {
        "order": [ps[i]["id"] for i in order],
        "distance": round(t["distance"]),
        "duration": round(t["duration"]),
        "coords": [[round(c[1], 5), round(c[0], 5)] for c in t["geometry"]["coordinates"]],
    }
    print(arr, len(ps), "Pieces,", round(t["distance"]), "m,", round(t["duration"] / 60), "min")

open(os.path.join(ROOT, "data", "routes.js"), "w").write("window.ROUTES = " + json.dumps(routes, separators=(",", ":")) + ";\n")
print(len(routes), "Routen gespeichert")
