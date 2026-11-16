(function () {
  "use strict";

  var PIECES = window.PIECES || [];
  var ARR = window.ARRONDISSEMENTS || null;
  var STATUSES = ["erlaubt", "unerlaubt", "geduldet"];
  var POS = ["stadtbild_plus", "kunst_plus", "botschaft", "ort_plus"];
  var NEG = ["stadtbild_minus", "sachbeschaedigung", "ort_minus", "kunst_minus"];
  var KEY_R = "sap.ratings.v1", KEY_L = "sap.lang", KEY_D = "sap.demo";

  // ---------- Speicher (nur dieses Gerät) ----------
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  var ratings = load(KEY_R, []);
  var lang = load(KEY_L, null) || ((navigator.language || "de").slice(0, 2));
  if (!window.I18N[lang]) lang = "de";
  var demoOn = load(KEY_D, true);
  var current = null, draft = null, forceForm = false;

  function t(k) { return (window.I18N[lang] && window.I18N[lang][k]) || window.I18N.de[k] || k; }
  function L10n(v) { if (v && typeof v === "object") return v[lang] || v.de || ""; return v || ""; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : "#"; }

  // ---------- Beispieldaten (fest, damit sie bei jedem Laden gleich sind) ----------
  function rng(seedStr) {
    var h = 1779033703 ^ seedStr.length;
    for (var i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }
  var DEMO_COMMENTS = {
    like: {
      de: ["Macht die Straße lebendiger.", "Würde ich mir länger ansehen.", "Passt gut ins Viertel.", "Stark gemacht, egal wer es erlaubt hat."],
      en: ["Brings the street to life.", "I'd stop to look at this.", "Fits the neighbourhood well.", "Well made, whoever allowed it."],
      fr: ["Ça rend la rue plus vivante.", "Je m'arrêterais pour regarder.", "Ça va bien avec le quartier.", "Bien fait, peu importe qui l'a autorisé."]
    },
    dislike: {
      de: ["An einer fremden Hauswand finde ich das schwierig.", "Wirkt hier fehl am Platz.", "Nicht mein Geschmack.", "Für mich eher Schmiererei."],
      en: ["On someone else's wall I find this difficult.", "Looks out of place here.", "Not my taste.", "More of a scrawl to me."],
      fr: ["Sur le mur de quelqu'un d'autre, ça me gêne.", "Ça n'a pas sa place ici.", "Pas à mon goût.", "Pour moi, c'est plutôt du gribouillage."]
    }
  };
  var demoCache = {};
  function demoFor(p) {
    if (demoCache[p.id]) return demoCache[p.id];
    var r = rng("demo-" + p.id), n = 6 + Math.floor(r() * 10), out = [];
    var pLike = 0.45 + r() * 0.4; // je Werk verschieden, unabhängig vom Status
    for (var i = 0; i < n; i++) {
      var like = r() < pLike, pool = like ? POS : NEG, asp = [];
      pool.forEach(function (a) { if (r() < 0.4) asp.push(a); });
      if (!asp.length) asp.push(pool[Math.floor(r() * pool.length)]);
      var c = r() < 0.25 ? Math.floor(r() * 4) : -1;
      out.push({ id: p.id, vote: like ? "like" : "dislike", aspects: asp, demoComment: c, demo: true, ts: 0 });
    }
    demoCache[p.id] = out;
    return out;
  }
  function commentText(r) {
    if (r.demo) return r.demoComment >= 0 ? DEMO_COMMENTS[r.vote][lang][r.demoComment] : "";
    return r.comment || "";
  }
  function ratingsFor(p) {
    var real = ratings.filter(function (r) { return r.id === p.id; });
    return demoOn ? real.concat(demoFor(p)) : real;
  }
  function allRatings() {
    var out = [];
    PIECES.forEach(function (p) { out = out.concat(ratingsFor(p)); });
    return out;
  }
  function isRevealed(p) { return ratings.some(function (r) { return r.id === p.id; }); }

  // ---------- Karte ----------
  var map = L.map("map", { zoomControl: true, attributionControl: true, zoomSnap: 0.5 }).setView([48.8589, 2.347], 12);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, className: "tiles-dark",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  if (ARR && ARR.features) {
    // Je mehr Werke in einem Arrondissement, desto kräftiger die gelbe Fläche.
    var arrCount = {}, arrMax = 1;
    PIECES.forEach(function (p) { arrCount[p.arr] = (arrCount[p.arr] || 0) + 1; if (arrCount[p.arr] > arrMax) arrMax = arrCount[p.arr]; });
    L.geoJSON(ARR, {
      interactive: false,
      style: function (f) {
        var n = arrCount[f.properties && f.properties.c_ar] || 0;
        return { color: "#ffe600", weight: 1.4, opacity: 0.6, fillColor: "#ffe600", fillOpacity: 0.02 + 0.2 * (n / arrMax), dashArray: "5 5" };
      },
      onEachFeature: function (f, layer) {
        var n = f.properties && (f.properties.c_ar || f.properties.nr);
        if (!n) return;
        var c = layer.getBounds().getCenter();
        if (f.properties.center) c = L.latLng(f.properties.center[0], f.properties.center[1]);
        L.marker(c, { interactive: false, icon: L.divIcon({ className: "arr-label", html: n + "<sup>e</sup>", iconSize: [30, 18] }) }).addTo(map);
      }
    }).addTo(map);
  }

  // Marker als Farbklecks: weiß mit „?“ vor der Bewertung, danach in der Farbe des Status.
  var GLYPH = { erlaubt: "✓", unerlaubt: "✕", geduldet: "~" };
  var SPLAT_SHAPES = '<rect x="19.2" y="28" width="3.6" height="13" rx="1.8"/><rect x="27" y="28" width="2.6" height="8" rx="1.3"/>' +
    '<circle cx="7" cy="11" r="2.4"/><circle cx="36" cy="9" r="1.8"/><circle cx="38.5" cy="27" r="2.6"/><circle cx="6.5" cy="30" r="2"/><circle cx="23" cy="4" r="1.6"/>' +
    '<circle cx="22" cy="21" r="12"/>';
  function splatSvg(glyph, angle) {
    return '<svg class="splat-svg" viewBox="0 0 44 44" aria-hidden="true"><g transform="rotate(' + angle + ' 22 21)">' +
      '<g class="o">' + SPLAT_SHAPES + '</g><g class="f">' + SPLAT_SHAPES + "</g></g>" +
      '<text x="22" y="26.4" text-anchor="middle">' + glyph + "</text></svg>";
  }
  var angles = {};
  function angleFor(p) { if (!(p.id in angles)) angles[p.id] = Math.round(rng("rot-" + p.id)() * 36 - 18); return angles[p.id]; }

  var markers = {};
  function iconFor(p) {
    var shown = isRevealed(p), sel = current && current.id === p.id;
    return L.divIcon({
      className: "splat" + (shown ? " " + p.status : "") + (sel ? " sel" : ""),
      html: splatSvg(shown ? GLYPH[p.status] : "?", angleFor(p)), iconSize: [44, 44], iconAnchor: [22, 21]
    });
  }
  PIECES.forEach(function (p) {
    if (typeof p.lat !== "number" || typeof p.lng !== "number") return;
    var m = L.marker([p.lat, p.lng], { icon: iconFor(p), title: p.kuenstler || "" }).addTo(map);
    m.on("click", function () { openPiece(p); });
    markers[p.id] = m;
  });
  if (PIECES.length) {
    var b = L.latLngBounds(PIECES.filter(function (p) { return typeof p.lat === "number"; }).map(function (p) { return [p.lat, p.lng]; }));
    if (b.isValid()) map.fitBounds(b.pad(0.03));
  }
  // Beim Herauszoomen werden die Kleckse kleiner, damit sie sich weniger überdecken.
  function zoomClass() {
    var z = map.getZoom(), el = map.getContainer();
    el.classList.toggle("zoom-far", z < 12.75);
    el.classList.toggle("zoom-mid", z >= 12.75 && z < 13.75);
  }
  map.on("zoomend", zoomClass); zoomClass();

  function updateProgress() {
    var done = PIECES.filter(isRevealed).length;
    document.getElementById("progress").innerHTML = "<b>" + done + "<i>/" + PIECES.length + "</i></b><small>" + t("progress") + "</small>";
  }
  function refreshMarkers() {
    PIECES.forEach(function (p) {
      if (!markers[p.id]) return;
      markers[p.id].setIcon(iconFor(p));
      markers[p.id].setZIndexOffset(current && current.id === p.id ? 1000 : 0);
    });
    updateProgress();
  }

  // ---------- Panel ----------
  var panel = document.getElementById("panel");

  function openPiece(p) {
    current = p; draft = { vote: null, aspects: [], comment: "" }; forceForm = false;
    renderPanel(); panel.classList.add("open"); panel.scrollTop = 0; refreshMarkers();
    if (window.innerWidth <= 720) {
      var pt = map.project([p.lat, p.lng], map.getZoom()); pt.y += map.getSize().y * 0.36;
      map.panTo(map.unproject(pt, map.getZoom()));
    }
  }
  function closePanel() { panel.classList.remove("open"); current = null; refreshMarkers(); }

  function resultsHtml(list) {
    if (!list.length) return '<p class="empty">' + t("no_votes") + "</p>";
    var likes = list.filter(function (r) { return r.vote === "like"; }).length;
    var pct = Math.round((likes / list.length) * 100);
    var h = '<div class="barrow"><span>' + t("like") + '</span><div class="bar"><i style="width:' + pct + '%"></i><i class="neg" style="width:' + (100 - pct) + '%"></i></div><span class="n">' + pct + "%</span></div>";
    h += '<small style="color:var(--muted)">' + list.length + " " + t("votes") + (list.some(function (r) { return r.demo; }) ? " · " + t("incl_demo") : "") + "</small>";
    return h;
  }
  function reasonsHtml(list, max) {
    var counts = {};
    list.forEach(function (r) { (r.aspects || []).forEach(function (a) { counts[a] = (counts[a] || 0) + 1; }); });
    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, max || 4);
    if (!keys.length) return '<p class="empty">–</p>';
    var top = counts[keys[0]];
    return keys.map(function (a) {
      var neg = NEG.indexOf(a) >= 0;
      return '<div class="barrow"><span>' + t("a_" + a) + '</span><div class="bar"><i class="' + (neg ? "neg" : "") + '" style="width:' + Math.round((counts[a] / top) * 100) + '%"></i></div><span class="n">' + counts[a] + "</span></div>";
    }).join("");
  }
  function commentsHtml(list, max, withTitle) {
    var c = list.filter(function (r) { return commentText(r); });
    c.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    if (!c.length) return '<p class="empty">' + t("no_comments") + "</p>";
    return c.slice(0, max).map(function (r) {
      var title = "";
      if (withTitle) { var p = PIECES.filter(function (x) { return x.id === r.id; })[0]; if (p) title = "<small>" + esc(L10n(p.titel)) + "</small>"; }
      return '<div class="comment ' + r.vote + '">' + title + esc(commentText(r)) + (r.demo ? ' <span class="demo-tag">' + t("demo") + "</span>" : "") + "</div>";
    }).join("");
  }

  function renderPanel() {
    var p = current; if (!p) return;
    var h = '<button class="panel-close" aria-label="×">×</button>';
    if (p.bild) {
      h += '<div class="photo" title="' + esc(t("zoom")) + '"><img src="' + esc(p.bild) + '" alt="' + esc(L10n(p.titel)) + '"></div>';
      h += '<div class="credit">' + t("photo") + ": " + esc(p.bild_urheber || t("unknown")) + (p.bild_lizenz ? " · " + esc(p.bild_lizenz) : "") +
        (p.bild_quelle ? ' · <a href="' + esc(safeUrl(p.bild_quelle)) + '" target="_blank" rel="noopener">' + t("sources") + "</a>" : "") + "</div>";
    } else {
      h += '<div class="noimg"><div><p>' + t("no_image") + "</p>" +
        (p.link ? '<a class="btn" href="' + esc(safeUrl(p.link)) + '" target="_blank" rel="noopener">' + t("open_image") + " ↗</a>" : "") + "</div></div>";
    }
    h += '<div class="panel-body"><h2><span>' + esc(L10n(p.titel)) + "</span></h2>";
    h += '<div class="meta"><b>' + esc(p.kuenstler || t("unknown")) + "</b>" + (p.jahr ? " · " + esc(p.jahr) : "") + "<br>" +
      esc(p.adresse || "") + (p.arr ? " · " + p.arr + "<sup>e</sup> " + t("arr") : "") + "</div>";

    if (!isRevealed(p) || forceForm) {
      h += '<div class="box rate"><h3>' + t("rate_title") + '</h3><div class="vote">' +
        '<button class="like' + (draft.vote === "like" ? " on" : "") + '" data-vote="like">👍 ' + t("like") + "</button>" +
        '<button class="dislike' + (draft.vote === "dislike" ? " on" : "") + '" data-vote="dislike">👎 ' + t("dislike") + "</button></div>";
      if (draft.vote) {
        h += '<span class="label">' + t("why") + '</span><div class="chips">' +
          (draft.vote === "like" ? POS : NEG).map(function (a) {
            return '<button class="chip' + (draft.aspects.indexOf(a) >= 0 ? " on" : "") + '" data-aspect="' + a + '">' + t("a_" + a) + "</button>";
          }).join("") + "</div>";
        h += '<label class="label" for="cmt">' + t("comment") + '</label><textarea id="cmt" maxlength="200" placeholder="' + esc(t("comment_ph")) + '">' + esc(draft.comment) + "</textarea>" +
          '<div class="count"><span id="cnt">' + draft.comment.length + "</span>/200</div>";
      } else {
        h += '<p class="label">' + t("choose_first") + "</p>";
      }
      h += '<button class="btn wide" id="submit"' + (draft.vote ? "" : " disabled") + ">" + t("submit") + "</button></div>";
    }

    if (isRevealed(p) && !forceForm) {
      var list = ratingsFor(p);
      h += '<div class="reveal"><div class="label">' + t("status_is") + '</div><div class="stamp ' + p.status + '">' + t("st_" + p.status) + "</div>";
      if (p.existiert === "nein") h += '<div><span class="gone">✕ ' + t("gone") + (p.entfernt_jahr ? " (" + t("gone_since") + " " + esc(p.entfernt_jahr) + ")" : "") + "</span></div>";
      else if (p.existiert === "unbekannt") h += '<div><span class="gone">? ' + t("exists_unknown") + "</span></div>";
      h += "<p>" + esc(L10n(p.begruendung)) + "</p>";
      h += '<div class="box"><h3>' + t("background") + "</h3><p style=\"margin:0\">" + esc(L10n(p.beschreibung)) + "</p></div>";
      h += '<div class="box"><h3>' + t("results") + "</h3>" + resultsHtml(list) +
        '<span class="label">' + t("top_reasons") + "</span>" + reasonsHtml(list, 4) +
        '<span class="label">' + t("comments") + "</span>" + commentsHtml(list, 5, false) + "</div>";
      if (p.quellen && p.quellen.length) {
        h += '<div class="box"><h3>' + t("sources") + '</h3><ol class="sources">' + p.quellen.map(function (u) {
          var host = u; try { host = new URL(u).hostname.replace(/^www\./, ""); } catch (e) {}
          return '<li><a href="' + esc(safeUrl(u)) + '" target="_blank" rel="noopener">' + esc(host) + "</a></li>";
        }).join("") + "</ol></div>";
      }
      if (p.bild && p.link) h += '<a class="btn ghost wide" style="text-align:center" href="' + esc(safeUrl(p.link)) + '" target="_blank" rel="noopener">' + t("open_image") + " ↗</a>";
      h += '<button class="btn ghost wide" id="again">' + t("rate_again") + "</button></div>";
    }
    h += "</div>";
    panel.innerHTML = h;
  }

  // Großansicht des Bildes
  var lightbox = document.getElementById("lightbox");
  lightbox.addEventListener("click", function () { lightbox.classList.remove("open"); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") lightbox.classList.remove("open"); });

  panel.addEventListener("click", function (e) {
    var ph = e.target.closest(".photo");
    if (ph) { lightbox.querySelector("img").src = ph.querySelector("img").src; lightbox.classList.add("open"); return; }
    var el = e.target.closest("button"); if (!el) return;
    if (el.classList.contains("panel-close")) return closePanel();
    if (el.dataset.vote) { if (draft.vote !== el.dataset.vote) draft.aspects = []; draft.vote = el.dataset.vote; return keepScroll(renderPanel); }
    if (el.dataset.aspect) {
      var i = draft.aspects.indexOf(el.dataset.aspect);
      if (i >= 0) draft.aspects.splice(i, 1); else draft.aspects.push(el.dataset.aspect);
      el.classList.toggle("on"); return;
    }
    if (el.id === "submit" && draft.vote) {
      ratings.push({ id: current.id, vote: draft.vote, aspects: draft.aspects.slice(), comment: draft.comment.trim().slice(0, 200), ts: Date.now() });
      save(KEY_R, ratings); forceForm = false; draft = { vote: null, aspects: [], comment: "" };
      renderPanel(); refreshMarkers();
      var rv = panel.querySelector(".reveal"); if (rv) rv.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (el.id === "again") { forceForm = true; draft = { vote: null, aspects: [], comment: "" }; renderPanel(); panel.scrollTop = 0; }
  });
  panel.addEventListener("input", function (e) {
    if (e.target.id === "cmt") { draft.comment = e.target.value; var c = document.getElementById("cnt"); if (c) c.textContent = draft.comment.length; }
  });
  function keepScroll(fn) { var s = panel.scrollTop; fn(); panel.scrollTop = s; }
  map.on("click", function () { if (current) closePanel(); });

  // ---------- Auswertung ----------
  function renderStats() {
    var el = document.getElementById("stats"), all = allRatings();
    var byId = {}; PIECES.forEach(function (p) { byId[p.id] = p; });
    var h = "<h1>" + t("stats_title") + '</h1><p class="lead">' + t("stats_lead") + "</p>";
    h += '<div class="toolbar"><button class="btn ghost" id="demo-toggle">' + (demoOn ? t("demo_on") : t("demo_off")) + "</button>" +
      '<button class="btn danger" id="reset">' + t("reset") + '</button><small style="color:var(--muted)">' + t("local_note") + "</small></div>";
    if (demoOn) h += '<div class="banner">⚠ ' + t("demo_banner") + "</div>";

    h += "<h2>" + t("by_status") + '</h2><div class="cards">';
    STATUSES.forEach(function (s) {
      var list = all.filter(function (r) { return byId[r.id] && byId[r.id].status === s; });
      var n = PIECES.filter(function (p) { return p.status === s; }).length;
      var likes = list.filter(function (r) { return r.vote === "like"; }).length;
      var pct = list.length ? Math.round((likes / list.length) * 100) : null;
      h += '<div class="card ' + s + '"><div class="k">' + t("st_" + s) + '</div><div class="big">' + (pct === null ? "–" : pct + "%") + "</div><small>" +
        t("like_share") + " · " + list.length + " " + t("votes") + " · " + n + " " + t("pieces") + "</small>" +
        (pct === null ? "" : '<div class="bar" style="margin-top:10px"><i style="width:' + pct + '%"></i><i class="neg" style="width:' + (100 - pct) + '%"></i></div>') + "</div>";
    });
    h += "</div>";

    h += "<h2>" + t("reasons_by_status") + '</h2><div class="cols">';
    STATUSES.forEach(function (s) {
      var list = all.filter(function (r) { return byId[r.id] && byId[r.id].status === s; });
      h += '<div class="card ' + s + '"><div class="k">' + t("st_" + s) + "</div>" + reasonsHtml(list, 5) + "</div>";
    });
    h += "</div>";

    h += "<h2>" + t("per_arr") + '</h2><p class="lead">' + t("per_arr_lead") + '</p><div class="arrbars">';
    var counts = {}, max = 1;
    PIECES.forEach(function (p) { counts[p.arr] = (counts[p.arr] || 0) + 1; if (counts[p.arr] > max) max = counts[p.arr]; });
    for (var a = 1; a <= 20; a++) {
      var c = counts[a] || 0;
      h += '<div class="barrow"><span>' + a + '<sup>e</sup></span><div class="bar"><i style="width:' + Math.round((c / max) * 100) + '%"></i></div><span class="n">' + c + "</span></div>";
    }
    h += "</div>";

    h += "<h2>" + t("latest_comments") + "</h2>" + commentsHtml(all, 20, true);
    el.innerHTML = h;
  }
  document.getElementById("stats").addEventListener("click", function (e) {
    if (e.target.id === "demo-toggle") { demoOn = !demoOn; save(KEY_D, demoOn); renderStats(); }
    if (e.target.id === "reset" && window.confirm(t("reset_confirm"))) { ratings = []; save(KEY_R, ratings); renderStats(); refreshMarkers(); if (current) renderPanel(); }
  });

  // ---------- Über ----------
  var SITE_URL = "https://motte200999.github.io/street-art-website/";
  function siteUrl() {
    return /github\.io$/.test(location.hostname) ? location.origin + location.pathname.replace(/index\.html$/, "") : SITE_URL;
  }
  function qrHtml() {
    if (typeof window.qrcode !== "function") return "";
    try {
      var q = window.qrcode(0, "M"); q.addData(siteUrl()); q.make();
      return '<div class="qr">' + q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }) +
        "<div><b>" + t("qr_title") + "</b>" + t("qr_text") + "<small>" + esc(siteUrl().replace(/^https?:\/\//, "")) + "</small></div></div>";
    } catch (e) { return ""; }
  }
  function renderAbout() {
    document.getElementById("about").innerHTML =
      "<h1>" + t("about_title") + "</h1><p>" + t("about_p1") + "</p><p>" + t("about_p2") + "</p>" + qrHtml() +
      "<h2>" + t("about_h_cat") + '</h2><div class="cards">' +
      '<div class="card erlaubt">' + t("about_cat1") + '</div><div class="card unerlaubt">' + t("about_cat2") + '</div><div class="card geduldet">' + t("about_cat3") + "</div></div>" +
      "<h2>" + t("about_h_img") + "</h2><p>" + t("about_img") + "</p>";
  }

  // ---------- Sprache und Navigation ----------
  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll(".lang button").forEach(function (b) { b.classList.toggle("active", b.dataset.lang === lang); });
    document.getElementById("legend").innerHTML =
      '<span><i class="lsplat">' + splatSvg("?", 0) + "</i>" + t("leg_unrated") + "</span>" +
      STATUSES.map(function (s) { return '<span><i class="lsplat ' + s + '">' + splatSvg(GLYPH[s], 0) + "</i>" + t("leg_" + s) + "</span>"; }).join("") +
      '<span><i class="ldens"></i>' + t("leg_density") + "</span>";
    renderStats(); renderAbout(); renderIntro(); updateProgress(); if (current) renderPanel();
  }

  // ---------- Startbildschirm ----------
  var intro = document.getElementById("intro");
  function renderIntro() {
    intro.innerHTML = '<div class="intro-card"><div class="intro-kicker">' + t("intro_kicker").replace("{n}", PIECES.length) + "</div>" +
      '<h1><span class="i1">STREET ART</span><span class="i2">PARIS</span></h1>' +
      '<div class="intro-q">' + t("intro_q") + "</div><p>" + t("intro_text") + "</p>" +
      '<ol class="steps"><li><b>1</b>' + t("intro_s1") + "</li><li><b>2</b>" + t("intro_s2") + "</li><li><b>3</b>" + t("intro_s3") + "</li></ol>" +
      '<button class="btn big" id="intro-go">' + t("intro_go") + " →</button></div>";
  }
  function showIntro(on) {
    intro.classList.toggle("open", on);
    if (!on) { try { sessionStorage.setItem("sap.intro", "1"); } catch (e) {} }
  }
  intro.addEventListener("click", function (e) { if (e.target.id === "intro-go") showIntro(false); });
  document.getElementById("brand").addEventListener("click", function () { showIntro(true); });
  var introSeen = false;
  try { introSeen = sessionStorage.getItem("sap.intro") === "1"; } catch (e) {}
  if (!introSeen) showIntro(true);
  document.querySelector(".lang").addEventListener("click", function (e) {
    if (e.target.dataset.lang) { lang = e.target.dataset.lang; save(KEY_L, lang); applyLang(); }
  });
  document.querySelector(".nav").addEventListener("click", function (e) {
    var v = e.target.dataset.view; if (!v) return;
    document.querySelectorAll(".nav button").forEach(function (b) { b.classList.toggle("active", b === e.target); });
    document.querySelectorAll(".view").forEach(function (s) { s.classList.toggle("active", s.id === "view-" + v); });
    if (v === "map") setTimeout(function () { map.invalidateSize(); }, 50);
    if (v === "stats") renderStats();
  });

  applyLang();
})();
