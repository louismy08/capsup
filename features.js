/* CAP SUP : personnalisation, assistant, statistiques, révision espacée, cahier d'erreurs */
(function () {
"use strict";
var st = document.createElement("style");
st.textContent = "textarea{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 12px;width:100%;color:var(--tx);font:inherit;resize:vertical;min-height:70px}.chat{max-height:55vh;overflow-y:auto;padding:4px}.msg{max-width:90%;padding:10px 14px;border-radius:14px;margin:8px 0;white-space:pre-wrap;line-height:1.5}.msg.u{background:var(--p);color:#fff;margin-left:auto}.msg.a{background:var(--panel);border:1px solid var(--line)}.msg .opt{margin:6px 0}.pbar{height:8px;background:var(--panel);border-radius:8px;overflow:hidden;min-width:80px}.pbar i{display:block;height:100%;background:linear-gradient(90deg,var(--p),var(--p2))}.sw{display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:8px;vertical-align:-2px}";
document.head.appendChild(st);

ICO.chat = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>';
ICO.chart = '<path d="M18 20V10M12 20V4M6 20v-6"/>';
NAVS = [["dash","grid","Aujourd’hui"],["fich","book","Fiches"],["qcm","edit","QCM"],["cards","layers","Cartes mémo"],["plan","cal","Planning"],["asst","chat","Assistant"],["stats","chart","Statistiques"],["prem","award","Abonnement"],["prof","user","Profil"]];

/* ---------- thèmes ---------- */
var BASE = {"--bg":"#0d0820","--panel":"#171033","--card":"#1f1745","--line":"#33286b","--tx":"#f1ecff","--mu":"#a89fd1","--p":"#8b5cf6","--p2":"#c084fc"};
var TH = {
  violet: {},
  bleu: {"--p":"#3b82f6","--p2":"#7dd3fc"},
  vert: {"--p":"#10b981","--p2":"#6ee7b7"},
  rose: {"--p":"#ec4899","--p2":"#f9a8d4"},
  clair: {"--bg":"#f6f3ff","--panel":"#ffffff","--card":"#ffffff","--line":"#ddd3fb","--tx":"#1b1530","--mu":"#6b6490","--p":"#7c3aed","--p2":"#a855f7"}
};
var THN = {violet:"Violet",bleu:"Bleu",vert:"Vert",rose:"Rose",clair:"Clair"};
function applyTheme() {
  var t = TH[(S && S.theme) || "violet"] || {}, r = document.documentElement;
  Object.keys(BASE).forEach(function (k) { r.style.setProperty(k, t[k] || BASE[k]); });
  r.style.colorScheme = (S && S.theme == "clair") ? "light" : "dark";
}

/* ---------- utilitaires ---------- */
var GOALS = {annee:"Réussir mon année", exam:"Préparer un examen précis", concours:"Préparer un concours", rattrapage:"Rattraper mon retard", approf:"Approfondir"};
var STYLES = {mixte:"Un peu de tout", fiches:"Surtout lire les fiches", qcm:"Surtout m’entraîner avec des QCM", cartes:"Surtout les cartes mémo"};
var LV = ["","Très fragile","Fragile","Moyen","À l’aise","Très à l’aise"];
var IV = [0, 1, 3, 7, 14, 30];
function shuf(a) { return a.slice().sort(function () { return Math.random() - .5; }); }
function dec(s) { var t = document.createElement("textarea"); t.innerHTML = s; return t.value; }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
var STOP = "le la les un une des du de et ou en au aux est sont que qui quoi quel quelle quels quelles pour par sur dans avec sans comment pourquoi ce cette ces mon ma mes ton ta tes je tu il elle on nous vous ils elles me te se moi toi ne pas plus qu explique expliquer donne peux peut dis dire montre fais veux voudrais besoin propos fiche chapitre cours".split(" ").map(norm);
function toks(s) { return norm(s).split(" ").filter(function (w) { return w.length > 2 && STOP.indexOf(w) < 0; }); }
function daysTo(d) { return d ? Math.ceil((new Date(d + "T00:00:00") - new Date(dk() + "T00:00:00")) / 864e5) : null; }
function streak() { var n = 0, d = new Date(); if (!(S.days[dk(d)] > 0)) d.setDate(d.getDate() - 1); while (S.days[dk(d)] > 0) { n++; d.setDate(d.getDate() - 1); } return n; }
function lowSub() { return subs().slice().sort(function (a, b) { return (S.prog[a] || 0) - (S.prog[b] || 0); })[0]; }
function ensure() {
  S.pf = Object.assign({goal:"annee", exam:"", days:[0,1,2,3,4], style:"mixte", lvl:{}, done:false, skip:false}, S.pf || {});
  S.err = S.err || []; S.notes = S.notes || {}; S.leit = S.leit || {}; S.chat = S.chat || []; S.theme = S.theme || "violet";
}
function opts(o, cur) { return Object.keys(o).map(function (k) { return '<option value="' + k + '"' + (k == cur ? " selected" : "") + ">" + o[k] + "</option>"; }).join(""); }

/* ---------- cycle de vie ---------- */
var _sa = showApp;
showApp = function () { ensure(); applyTheme(); _sa(); if (!S.pf.done && !S.pf.skip) setTimeout(A.onb, 350); };
var _sl = showLand;
showLand = function () { applyTheme(); _sl(); };
var _r = render;
render = function () { _r(); var m = $("cm"); if (m) m.scrollTop = m.scrollHeight; };

/* ---------- questionnaire de personnalisation ---------- */
A.onb = function () {
  var p = S.pf, sb = subs();
  $("auth").innerHTML = '<div class="box" style="max-width:540px;position:relative"><h2 style="margin:0 0 4px">Personnalise ton espace</h2><p class="mu" style="margin:0 0 6px">Quelques questions pour adapter planning, conseils et révisions à toi.</p>' +
    '<label for="o_g">Ton objectif</label><select id="o_g">' + opts(GOALS, p.goal) + '</select>' +
    '<label for="o_e">Date de ton prochain examen (facultatif)</label><input id="o_e" type="date" value="' + E(p.exam || "") + '">' +
    '<label>Jours où tu peux réviser</label><div class="tabs" id="o_d">' + DAYS.map(function (n, i) { return '<button type="button" class="' + (p.days.indexOf(i) > -1 ? "on" : "") + '" data-a="odays" data-v="' + i + '">' + n.slice(0, 3) + '</button>'; }).join("") + '</div>' +
    '<label for="o_h">Heures de révision par semaine</label><select id="o_h">' + [2,3,5,8,12,16].map(function (h) { return '<option value="' + h + '"' + (h == S.goal ? " selected" : "") + ">" + h + " h</option>"; }).join("") + '</select>' +
    '<label for="o_s">Ta façon préférée de réviser</label><select id="o_s">' + opts(STYLES, p.style) + '</select>' +
    '<label>Comment te sens-tu dans chaque matière ?</label>' + sb.map(function (m, i) { return '<div class="row" style="margin:4px 0"><span style="flex:1;min-width:120px">' + E(m) + '</span><select id="o_l' + i + '" style="flex:1">' + [1,2,3,4,5].map(function (n) { return '<option value="' + n + '"' + ((p.lvl[m] || 3) == n ? " selected" : "") + ">" + LV[n] + "</option>"; }).join("") + '</select></div>'; }).join("") +
    '<div class="row" style="margin-top:16px">' + B("onbsave", "", "Enregistrer et créer mon planning") + B("onbskip", "", "Plus tard", "ghost") + '</div></div>';
  $("auth").style.display = "flex";
};
A.odays = function (v) { var b = document.querySelector('#o_d [data-v="' + v + '"]'); if (b) b.classList.toggle("on"); };
A.onbsave = function () {
  var p = S.pf, d = Array.prototype.slice.call(document.querySelectorAll("#o_d button.on")).map(function (b) { return +b.dataset.v; });
  p.goal = $("o_g").value; p.exam = $("o_e").value; p.days = d.length ? d : [0,1,2,3,4]; p.style = $("o_s").value;
  subs().forEach(function (m, i) { p.lvl[m] = +$("o_l" + i).value; });
  S.goal = +$("o_h").value; p.done = true; p.skip = false;
  A.genplan(true); save(); A.closeauth(); toast("Ton espace est personnalisé."); go("dash");
};
A.onbskip = function () { S.pf.skip = true; save(); A.closeauth(); };

/* ---------- génération du planning personnalisé ---------- */
A.genplan = function (quiet) {
  var p = S.pf, sb = subs(), days = p.days.length ? p.days : [0,1,2,3,4];
  S.tasks = S.tasks.filter(function (t) { return !t.auto; });
  var mins = Math.round(S.goal * 60 / days.length), sess = Math.max(1, Math.min(4, Math.round(mins / 30))), each = Math.round(mins / sess);
  var w = {};
  sb.forEach(function (m) { w[m] = (6 - (p.lvl[m] || 3)) * 2 + (100 - (S.prog[m] || 0)) / 20 + (p.goal == "rattrapage" ? 1 : 0); });
  var avgw = sb.reduce(function (a, m) { return a + w[m]; }, 0) / sb.length, wheel = [];
  sb.forEach(function (m) { for (var k = 0, n = Math.max(1, Math.round(w[m] / avgw * 2)); k < n; k++) wheel.push(m); });
  wheel = shuf(wheel);
  var pools = {};
  sb.forEach(function (m) { pools[m] = list().filter(function (x) { return x.m == m && S.read.indexOf(x.id) < 0; }).sort(function (a, b) { return (b.n == S.year) - (a.n == S.year) || a.id - b.id; }); });
  var seq = {mixte:["f","q","c","f"], fiches:["f","f","q","f"], qcm:["q","f","q","q"], cartes:["c","f","c","q"]}[p.style] || ["f","q","c","f"], ptr = 0, planned = {};
  days.forEach(function (day) {
    for (var k = 0; k < sess; k++) {
      var kind = seq[k % seq.length], m = wheel[ptr++ % wheel.length];
      if (kind == "f") {
        var x = pools[m].shift();
        if (x) { S.tasks.push({t:"Lire : " + x.t + " (" + each + " min)", m:m, d:day, done:false, auto:true, fid:x.id}); continue; }
        kind = "q";
      }
      if (kind == "q") S.tasks.push({t:"QCM " + m + " · 10 questions (" + each + " min)", m:m, d:day, done:false, auto:true, act:"qcm"});
      else S.tasks.push({t:"Cartes mémo : série du jour (" + each + " min)", m:sb[0], d:day, done:false, auto:true, act:"cards"});
    }
    if (S.err.length && !planned[day] && days.indexOf(day) == days.length - 1) S.tasks.push({t:"Revoir mon cahier d’erreurs", m:lowSub(), d:day, done:false, auto:true, act:"err"});
  });
  save(); if (!quiet) { toast("Planning régénéré selon ton profil."); render(); }
};
A.dotask = function (i) {
  var t = S.tasks[+i]; if (!t) return;
  if (t.fid != null) A.open(t.fid); else if (t.act == "qcm") A.startQ(t.m); else if (t.act == "cards") A.gocards(); else if (t.act == "err") A.errs();
};
var _tg = A.tg;
A.tg = function (v) {
  var t = S.tasks[+v], was = t && t.done; _tg(v);
  if (t && t.done && !was && t.fid != null && S.read.indexOf(t.fid) < 0) { S.read.push(t.fid); save(); }
};
var _pl = V.plan;
V.plan = function () {
  return _pl() + '<div class="card" style="margin-top:16px"><h2>Planning personnalisé</h2><p class="mu">Généré selon ton objectif (' + GOALS[S.pf.goal] + '), tes jours disponibles, tes ' + S.goal + ' h par semaine et ton niveau perçu dans chaque matière. Les tâches ajoutées à la main sont conservées.</p><div class="row">' + B("genplan", "", "Régénérer mon planning") + B("onb", "", "Modifier mon profil d’apprentissage", "ghost") + '</div></div>';
};

/* ---------- révision espacée (cartes mémo) ---------- */
function dueCards() { var t = dk(), s = subs(); return Object.keys(S.leit).map(Number).filter(function (id) { var x = F[id]; return x && s.indexOf(x.m) > -1 && S.leit[id].d <= t; }); }
function upLeit(id, ok) { var c = S.leit[id] || {b:0}, b = ok ? Math.min(5, c.b + 1) : 1, d = new Date(); d.setDate(d.getDate() + IV[b]); S.leit[id] = {b:b, d:dk(d)}; }
A.gocards = function () { go("cards"); A.fcs(); };
A.fcs = function () {
  var seen = Object.keys(S.leit).map(Number), fresh = list().filter(function (x) { return seen.indexOf(x.id) < 0; });
  var mine = fresh.filter(function (x) { return x.n == S.year; }), other = fresh.filter(function (x) { return x.n != S.year; });
  var ids = shuf(dueCards()).concat(shuf(mine).map(function (x) { return x.id; })).concat(shuf(other).map(function (x) { return x.id; })).slice(0, 10);
  fc = {l:ids, i:0, f:false, k:0}; render();
};
var _fck = A.fck;
A.fck = function (v) { var id = fc.l[fc.i]; upLeit(id, v == "1"); _fck(v); };
var _cd = V.cards;
V.cards = function () {
  if (fc) return _cd();
  var due = dueCards().length, tot = list().length, seen = Object.keys(S.leit).length;
  return '<h1>Cartes mémo</h1><p class="sub">Révision espacée : les cartes que tu connais reviennent de moins en moins souvent, celles qui te posent problème reviennent demain.</p><div class="grid"><div class="card mu">À réviser aujourd’hui<div class="big">' + due + '</div></div><div class="card mu">Cartes en apprentissage<div class="big">' + seen + '/' + tot + '</div></div></div><div class="card"><p class="mu">Chaque série mélange tes cartes dues et de nouvelles cartes de ton année (' + S.year + ').</p>' + B("fcs", "", "Lancer une série") + '</div>';
};

/* ---------- cahier d'erreurs ---------- */
function recErr(q) {
  var f = S.err.filter(function (e) { return e.q == q.q; })[0];
  if (f) { f.n++; f.t = Date.now(); } else S.err.unshift({m:q.m, q:q.q, o:q.o, a:q.a, e:q.e, fid:q.fid, y:q.y, n:1, t:Date.now()});
  S.err = S.err.slice(0, 200);
}
var _ans = A.ans;
A.ans = function (v) {
  if (!qz || qz.r !== null) return;
  var q = qz.l[qz.i]; _ans(v);
  if (q) { if (qz.r == q.a) { if (q._err) S.err = S.err.filter(function (e) { return e.q != q.q; }); } else recErr(q); save(); }
};
A.errs = function () {
  if (!S.err.length) { toast("Aucune erreur enregistrée. Bravo !"); return; }
  var l = shuf(S.err).slice(0, 10).map(function (e) { return {m:e.m, d:2, q:e.q, o:e.o, a:e.a, e:e.e, fid:e.fid, y:e.y, _err:1}; });
  qz = {sub:"Mes erreurs", l:l, i:0, s:0, r:null, w:[], done:false}; cur = "qcm"; op = null; render();
};
var _q = V.qcm;
V.qcm = function () {
  var h = _q(); if (qz) return h;
  return h + '<div class="card" style="margin-top:16px"><h2>Mon cahier d’erreurs</h2><p class="mu">' + (S.err.length ? S.err.length + " question" + (S.err.length > 1 ? "s" : "") + " à retravailler. Chaque bonne réponse la retire de la liste." : "Aucune erreur enregistrée pour l’instant : tes erreurs de QCM apparaîtront ici.") + '</p>' + (S.err.length ? B("errs", "", "Revoir mes erreurs") : "") + '</div>';
};

/* ---------- tableau de bord personnalisé ---------- */
function nextAction() {
  var due = dueCards().length;
  if (due) return {t:"Révise tes " + due + " carte" + (due > 1 ? "s" : "") + " mémo du jour.", b:B("gocards", "", "Commencer")};
  if (S.err.length) return {t:"Reprends tes " + S.err.length + " erreur" + (S.err.length > 1 ? "s" : "") + " pour les transformer en points forts.", b:B("errs", "", "Revoir mes erreurs")};
  var low = lowSub();
  return {t:"Ta matière la plus fragile est " + low + " (" + (S.prog[low] || 0) + " %). Un QCM de 10 questions te fera progresser.", b:B("startQ", low, "QCM " + low)};
}
function todayHTML() { return ""; }
var DASH_CSS = ".dsec{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mu);margin:26px 0 10px;font-weight:700}" +
  ".dh{display:grid;gap:16px;grid-template-columns:1.5fr 1fr;margin-bottom:6px}.dh .card{margin:0}" +
  ".dh .acc{border-color:var(--p2);background:linear-gradient(160deg,var(--card),var(--panel))}" +
  ".dhd{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.dhd h2{margin:0}" +
  ".chip{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:3px 12px;font-size:13px;color:var(--p2);font-weight:700;white-space:nowrap}" +
  ".kp{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}" +
  ".kp .card{padding:14px 16px;margin:0}.kp .kl{font-size:12px;color:var(--mu);text-transform:uppercase;letter-spacing:.05em}" +
  ".kp .kv{font-size:26px;font-weight:800;color:var(--p2);margin:4px 0 2px;line-height:1.1}.kp .ks{font-size:12px;color:var(--mu)}.kp .bar{margin:8px 0 0}" +
  ".d2{display:grid;gap:16px;grid-template-columns:1fr 1fr}.d2 .card{margin:0}" +
  ".mrow{display:flex;justify-content:space-between;gap:8px;font-size:14px}.mrow b{color:var(--p2)}.weak{font-size:11px;background:var(--panel);border:1px solid var(--p2);color:var(--p2);border-radius:10px;padding:1px 8px;margin-left:6px}" +
  "nav button svg,.card h2 svg,.btn svg{margin-right:8px !important;vertical-align:-3px}.badge svg{margin-right:0 !important}" +
  "@media(max-width:860px){.dh,.d2{grid-template-columns:1fr}}";
(function () { var s = document.createElement("style"); s.textContent = DASH_CSS; document.head.appendChild(s); })();
V.dash = function () {
  var s = subs(), w = week(), goal = S.goal * 60, pct = Math.min(100, Math.round(w.t / goal * 100)), d = dayIdx(), L = list(), low = lowSub(),
    td = S.tasks.map(function (x, i) { return [x, i]; }).filter(function (p) { return p[0].d == d; }), tdn = td.filter(function (p) { return p[0].done; }).length,
    ex = daysTo(S.pf.exam), st = streak(), na = nextAction(), due = dueCards().length,
    mx = Math.max(30, Math.max.apply(null, w.a.map(function (b) { return b[1]; }))),
    un = L.filter(function (x) { return S.read.indexOf(x.id) < 0 && x.m == low; })[0] || L.filter(function (x) { return S.read.indexOf(x.id) < 0; })[0],
    rd = L.filter(function (x) { return S.read.indexOf(x.id) > -1; }).length,
    bd = [["book", "Première fiche lue", S.read.length > 0], ["target", "QCM parfait", S.hist.some(function (h) { return h.s == h.n && h.n > 0; })], ["ok", "5 tâches validées", S.tasks.filter(function (t) { return t.done; }).length >= 5], ["clock", "1 h cette semaine", w.t >= 60], ["award", "Premium", S.prem != "Gratuit"]];
  var tl = td.length ? td.map(function (p) { var x = p[0]; return '<div class="task' + (x.done ? " done" : "") + '"><input type="checkbox" data-a="tg" data-v="' + p[1] + '" ' + (x.done ? "checked" : "") + ' aria-label="Valider"><span>' + E(x.t) + '</span>' + ((x.fid != null || x.act) && !x.done ? B("dotask", p[1], "Commencer", "sm ghost") : "") + '</div>'; }).join("") : '<p class="mu">Rien de prévu aujourd’hui.</p>' + B("genplan", "", "Générer mon planning");
  var cd = ex === null ? "-" : ex >= 0 ? "J-" + ex : "Passé";
  var kpi = function (l, v, sub, extra) { return '<div class="card"><div class="kl">' + l + '</div><div class="kv">' + v + '</div><div class="ks">' + sub + '</div>' + (extra || "") + '</div>'; };
  return '<h1>Bonjour ' + E(S.nom) + '</h1><p class="sub">' + E(S.form) + ' · ' + S.year + ' · Plan ' + S.prem + '</p>' +
    (!S.pf.done ? '<div class="card" style="margin:0 0 16px;border-color:var(--p2)"><b>Personnalise ton espace</b><p class="mu" style="margin:6px 0 10px">Réponds à quelques questions pour obtenir un planning et des conseils adaptés à toi.</p>' + B("onb", "", "Commencer") + '</div>' : "") +
    '<div class="dh"><div class="card"><div class="dhd"><h2>Aujourd’hui</h2><span class="chip">' + tdn + '/' + td.length + ' fait' + (tdn > 1 ? "s" : "") + '</span></div>' + tl + '</div>' +
    '<div class="card acc"><div class="dhd"><h2>À faire maintenant</h2></div><p style="margin:0 0 14px">' + na.t + '</p><div class="row">' + na.b + B("go", "asst", I("chat") + "Poser une question", "ghost") + '</div></div></div>' +
    '<div class="dsec">En un coup d’oeil</div><div class="kp">' +
    kpi("Progression", avg() + " %", rd + "/" + L.length + " fiches lues", '<div class="bar"><i style="width:' + avg() + '%"></i></div>') +
    kpi("Cette semaine", Math.floor(w.t / 60) + " h " + ("0" + w.t % 60).slice(-2), "objectif " + S.goal + " h (" + pct + " %)", '<div class="bar"><i style="width:' + pct + '%"></i></div>') +
    kpi("Série", st + " j", "jours consécutifs") +
    kpi("Examen", cd, ex === null ? "date non renseignée" : E(GOALS[S.pf.goal])) +
    kpi("Cartes à revoir", due, due ? "à réviser aujourd’hui" : "rien en retard") +
    kpi("Erreurs", S.err.length, S.err.length ? "à reprendre" : "carnet à zéro") + '</div>' +
    '<div class="dsec">Ma progression</div><div class="d2"><div class="card"><h2>Par matière</h2>' +
    s.map(function (k) { var v = S.prog[k] || 0; return '<div class="mrow"><span>' + E(k) + (k == low && s.length > 1 ? '<span class="weak">à renforcer</span>' : "") + '</span><b>' + v + ' %</b></div><div class="bar"><i style="width:' + v + '%"></i></div>'; }).join("") + '</div>' +
    '<div class="card"><h2>Temps de révision (7 jours)</h2><div class="chart">' + w.a.map(function (b) { return '<div><b style="height:' + Math.round(b[1] / mx * 90) + 'px"></b>' + b[0] + '</div>'; }).join("") + '</div></div></div>' +
    '<div class="dsec">Outils</div><div class="d2"><div class="card"><h2>' + I("clock") + 'Minuteur de révision</h2><div class="big" id="tmv">' + fmt(tm.s) + '</div><p class="mu">Le temps est ajouté à ton bilan à l’arrêt.</p>' + B("tm", "", tm.on ? "Arrêter" : "Démarrer") + '</div>' +
    '<div class="card"><h2>' + I("zap") + 'Recommandations</h2><p class="mu">Ta matière la plus fragile : <b>' + low + '</b> (' + (S.prog[low] || 0) + ' %).</p><div class="row">' + B("startQ", low, "QCM " + low, "sm") + (un ? B("open", un.id, "Lire « " + un.t + " »", "sm ghost") : "") + B("go", "plan", "Planning", "sm ghost") + '</div></div></div>' +
    '<div class="dsec">Mes badges</div><div class="card">' + bd.map(function (b) { return '<span class="badge' + (b[2] ? "" : " off") + '">' + I(b[0]) + b[1] + '</span>'; }).join("") + '</div>';
};

/* ---------- notes personnelles ---------- */
/* ---------- cours détaillé ---------- */
var COURS_CSS = ".cs{margin-top:16px}.cs h2{display:flex;justify-content:space-between;align-items:center;gap:8px}.cs .tg{font-size:12px;font-weight:600;color:var(--p2);background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:2px 10px}.cs h3{margin:18px 0 6px;font-size:15px;color:var(--p2)}.cs ul{margin:0;padding-left:20px}.cs li{margin:6px 0;line-height:1.5}.cs .err h3{color:#f59e0b}";
(function () { var s = document.createElement("style"); s.textContent = COURS_CSS; document.head.appendChild(s); })();
function coursHTML(x) {
  var c = (typeof COURS != "undefined") && COURS[x.m + "|" + x.t]; if (!c) return "";
  return '<div class="card cs"><h2>Cours complet<span class="tg">' + c.length + ' parties</span></h2>' + c.map(function (s) {
    var err = /^(Erreurs|Pièges)/.test(s[0]);
    return '<div class="' + (err ? "err" : "") + '"><h3>' + E(s[0]) + '</h3><ul>' + s[1].map(function (t) { return '<li>' + E(t) + '</li>'; }).join("") + '</ul></div>';
  }).join("") + '</div>';
}
var _f = V.fich;
V.fich = function () {
  var h = _f(); if (op === null) return h;
  var x = F[op];
  return h + coursHTML(x) + '<div class="card" style="margin-top:16px"><h2>Mes notes</h2><textarea id="nt" placeholder="Écris ici ce qui t’aide à retenir : astuces, exemples du cours, questions…">' + E(S.notes[x.id] || "") + '</textarea><div class="row" style="margin:12px 0 0">' + B("askfiche", x.id, I("chat") + "Demander à l’assistant d’expliquer", "ghost") + '</div></div>';
};
document.addEventListener("input", function (e) { if (e.target.id == "nt" && op !== null) { S.notes[op] = e.target.value; save(); } });
A.askfiche = function (id) { go("asst"); A.send("Explique-moi « " + F[+id].t + " » en détail"); };

/* ---------- statistiques ---------- */
V.stats = function () {
  var s = subs(), L = list(), w = week(), mx = Math.max(30, Math.max.apply(null, w.a.map(function (b) { return b[1]; })));
  var rows = s.map(function (m) {
    var f = L.filter(function (x) { return x.m == m; }), r = f.filter(function (x) { return S.read.indexOf(x.id) > -1; }).length, h = S.hist.filter(function (x) { return x.sub == m; });
    var q = h.length ? Math.round(h.reduce(function (a, x) { return a + x.s / x.n * 100; }, 0) / h.length) + " %" : "—";
    return '<tr><td>' + E(m) + '</td><td>' + r + '/' + f.length + '</td><td>' + q + '</td><td><div class="pbar"><i style="width:' + (S.prog[m] || 0) + '%"></i></div></td></tr>';
  }).join("");
  var yrs = (YEARS[S.form] || []).map(function (y) {
    var f = L.filter(function (x) { return x.n == y; }), r = f.filter(function (x) { return S.read.indexOf(x.id) > -1; }).length;
    return '<div class="row" style="margin:6px 0;flex-wrap:nowrap"><span style="min-width:90px">' + y + (y == S.year ? " ★" : "") + '</span><div class="pbar" style="flex:1"><i style="width:' + (f.length ? Math.round(r / f.length * 100) : 0) + '%"></i></div><span class="mu" style="min-width:60px;text-align:right">' + r + '/' + f.length + '</span></div>';
  }).join("");
  var byF = {}; S.err.forEach(function (e) { if (e.fid != null) byF[e.fid] = (byF[e.fid] || 0) + e.n; });
  var weak = Object.keys(byF).sort(function (a, b) { return byF[b] - byF[a]; }).slice(0, 5).map(function (id) { return '<div class="task"><span>' + E(F[id].t) + ' <span class="tag">' + E(F[id].m) + '</span></span><span class="mu">' + byF[id] + ' erreur' + (byF[id] > 1 ? "s" : "") + '</span>' + B("open", id, "Revoir", "sm ghost") + '</div>'; }).join("") || '<p class="mu">Aucune fiche à retravailler pour l’instant.</p>';
  var qn = S.hist.length, qa = qn ? Math.round(S.hist.reduce(function (a, x) { return a + x.s / x.n * 100; }, 0) / qn) : 0;
  return '<h1>Mes statistiques</h1><p class="sub">' + E(S.form) + ' · ' + S.year + '</p><div class="grid"><div class="card mu">Progression globale<div class="big">' + avg() + ' %</div></div><div class="card mu">Fiches lues<div class="big">' + S.read.length + '</div>sur ' + L.length + ' dans ton domaine</div><div class="card mu">QCM terminés<div class="big">' + qn + '</div>score moyen ' + qa + ' %</div><div class="card mu">Révision 7 jours<div class="big">' + Math.floor(w.t / 60) + ' h ' + w.t % 60 + '</div>objectif ' + S.goal + ' h</div></div>' +
    '<div class="grid"><div class="card"><h2>Temps de révision</h2><div class="chart">' + w.a.map(function (b) { return '<div><b style="height:' + Math.round(b[1] / mx * 90) + 'px"></b>' + b[0] + '</div>'; }).join("") + '</div></div><div class="card"><h2>Fiches lues par année</h2>' + yrs + '</div></div>' +
    '<div class="card" style="overflow-x:auto"><h2>Par matière</h2><table class="tbl"><tr><th>Matière</th><th>Fiches lues</th><th>QCM moyen</th><th>Maîtrise</th></tr>' + rows + '</table></div><br><div class="card"><h2>À retravailler</h2>' + weak + '</div>';
};

/* ---------- assistant de révision ---------- */
function search(q, n) {
  var T = toks(q); if (!T.length) return [];
  var pool = list().length ? list() : F;
  return pool.map(function (x) {
    var ti = norm(x.t), mm = norm(x.m), bo = norm([x.f.join(" "), x.e, x.c, (x.k || []).join(" "), x.p || ""].join(" ")), sc = 0;
    T.forEach(function (w) { if (ti.indexOf(w) > -1) sc += 6; if (mm.indexOf(w) > -1) sc += 2; if (bo.indexOf(w) > -1) sc += 1; });
    if (sc && x.n == S.year) sc += 1;
    return {x:x, sc:sc};
  }).filter(function (r) { return r.sc > 0; }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, n || 3).map(function (r) { return r.x; });
}
function explain(x) {
  return "« " + x.t + " » (" + x.m + ", " + x.n + ")\n\nÀ connaître :\n" + x.f.map(function (f) { return "• " + f; }).join("\n") + "\n\nExemple : " + x.e + "\nMéthode : " + cap(x.c) +
    (x.k && x.k.length ? "\n\nÀ retenir :\n" + x.k.map(function (k) { return "• " + k; }).join("\n") : "") + (x.p ? "\n\nPiège à éviter : " + x.p : "");
}
function slim(x) { return {t:x.t, m:x.m, n:x.n, f:x.f, e:x.e, c:x.c, k:x.k, p:x.p}; }
var cq = null;
function bilan() {
  var s = subs(), srt = s.slice().sort(function (a, b) { return (S.prog[b] || 0) - (S.prog[a] || 0); }), hi = srt[0], low = srt[srt.length - 1], w = week(), ex = daysTo(S.pf.exam);
  return {t:"Voici ton point, " + S.nom + " :\n• Progression globale : " + avg() + " %\n• Révision sur 7 jours : " + Math.floor(w.t / 60) + " h " + w.t % 60 + " min (objectif " + S.goal + " h)\n• Matière la plus solide : " + hi + " (" + (S.prog[hi] || 0) + " %)\n• Matière à renforcer : " + low + " (" + (S.prog[low] || 0) + " %)\n• Erreurs à revoir : " + S.err.length + "\n• Cartes dues aujourd’hui : " + dueCards().length + (ex !== null && ex >= 0 ? "\n• Examen dans " + ex + " jour" + (ex > 1 ? "s" : "") : ""), act:[["startQ", low, "QCM " + low], ["go", "stats", "Voir mes statistiques"]]};
}
function planReply() {
  var d = dayIdx(), t = S.tasks.filter(function (x) { return x.d == d; });
  if (!t.length) return {t:"Tu n’as rien de prévu aujourd’hui. Je peux générer un planning adapté à ton profil.", act:[["genplan", "", "Générer mon planning"]]};
  return {t:"Programme d’aujourd’hui (" + DAYS[d] + ") :\n" + t.map(function (x) { return (x.done ? "✔ " : "• ") + x.t; }).join("\n"), act:[["go", "plan", "Ouvrir mon planning"], ["genplan", "", "Régénérer"]]};
}
function askQ(n) {
  var s = subs(), m = s.filter(function (x) { return n.indexOf(norm(x)) > -1; })[0], my = YEARS[S.form] || [];
  var pool = Q.filter(function (q) { return s.indexOf(q.m) > -1 && (!m || q.m == m); }), py = pool.filter(function (q) { return !q.y || my.indexOf(q.y) > -1; });
  if (py.length) pool = py;
  if (!pool.length) return {t:"Je n’ai pas encore de question pour cette matière."};
  cq = pool[Math.floor(Math.random() * pool.length)];
  return {h:'<b>Question · ' + E(cq.m) + '</b><br>' + E(dec(cq.q)) + cq.o.map(function (t, k) { return '<button class="opt" data-a="cans" data-v="' + k + '">' + E(t) + '</button>'; }).join("")};
}
function reply(q) {
  var n = norm(q), s = subs();
  if (/^(bonjour|salut|coucou|hello|bonsoir)\b/.test(n)) return {t:"Bonjour " + S.nom + " ! Je peux t’expliquer un chapitre de " + S.dom + ", te poser une question, faire le point sur ta progression ou organiser ta semaine. Que veux-tu faire ?"};
  if (/\bmerci\b/.test(n)) return {t:"Avec plaisir ! Je suis là pour la suite de tes révisions."};
  if (/(ou j en suis|bilan|progress|points faibles|statist)/.test(n)) return bilan();
  if (/(planning|programme|emploi du temps|ma semaine|organis)/.test(n)) return planReply();
  if (/(pose|interroge|teste|entraine|quiz|une question|question de)/.test(n) && !/(comment|pourquoi|c est quoi|qu est ce)/.test(n)) return askQ(n);
  var refs = search(q, 3);
  if (!refs.length) return {t:"Je n’ai pas trouvé de fiche correspondant à « " + q + " » dans ton domaine. Essaie avec un mot-clé du cours (nom d’un théorème, d’un chapitre) ou choisis un chapitre :", act:shuf(list()).slice(0, 3).map(function (x) { return ["open", x.id, x.t]; }), ai:true};
  return {t:"J’ai trouvé " + (refs.length > 1 ? "ces fiches" : "cette fiche") + " :\n\n" + explain(refs[0]) + (refs.length > 1 ? "\n\nÀ voir aussi : " + refs.slice(1).map(function (x) { return x.t; }).join(", ") + "." : ""), refs:refs.map(function (x) { return x.id; }), ai:true, ctx:refs};
}
function msgHTML(m) {
  return '<div class="msg ' + (m.r == "u" ? "u" : "a") + '">' + (m.h || E(m.t || "")) +
    (m.refs || []).map(function (id) { return '<div style="margin-top:8px">' + B("open", id, "Ouvrir : " + F[id].t, "sm ghost") + B("qfiche", id, "QCM", "sm ghost") + '</div>'; }).join("") +
    ((m.act || []).length ? '<div class="row" style="margin:8px 0 0">' + m.act.map(function (a) { return B(a[0], a[1], a[2], "sm ghost"); }).join("") + '</div>' : "") + '</div>';
}
V.asst = function () {
  var W = {r:"a", t:"Bonjour " + S.nom + " ! Je suis ton assistant de révision (" + S.form + ", " + S.year + "). Demande-moi d’expliquer une notion, de te poser une question, de faire le point sur ta progression ou d’organiser ta semaine."};
  var ms = S.chat.length ? S.chat : [W];
  return '<h1>Assistant de révision</h1><p class="sub">' + (window.TUTOR_API ? "Réponses par IA, appuyées sur les fiches du site." : "Réponses construites à partir des fiches du site.") + '</p><div class="card"><div id="cm" class="chat">' + ms.map(msgHTML).join("") + '</div>' +
    '<div class="row" style="margin:12px 0 0">' + B("send", "Pose-moi une question", "Pose-moi une question", "sm ghost") + B("send", "Où j’en suis ?", "Où j’en suis ?", "sm ghost") + B("send", "Mon planning", "Mon planning", "sm ghost") + '</div>' +
    '<div class="row" style="margin:10px 0 0;flex-wrap:nowrap"><textarea id="ci" rows="2" placeholder="Ex : explique-moi la loi d’Ohm, ou pose-moi une question de droit civil"></textarea>' + B("send", "", "Envoyer") + '</div></div>' +
    (S.chat.length ? '<p style="text-align:right">' + B("clearchat", "", "Effacer la conversation", "sm ghost") + '</p>' : "");
};
A.send = function (txt) {
  var el = $("ci"), q = (typeof txt == "string" && txt) ? txt : (el ? el.value : "");
  q = (q || "").trim(); if (!q) return; if (el) el.value = "";
  S.chat.push({r:"u", t:q});
  var loc = reply(q), strip = function (m) { var c = Object.assign({r:"a"}, m); delete c.ctx; delete c.ai; return c; };
  if (window.TUTOR_API && loc.ai) {
    var hist = S.chat.slice(-7, -1).map(function (m) { return {r:m.r, t:m.t || ""}; }), tmp = {r:"a", t:"Je réfléchis…"};
    S.chat.push(tmp);
    window.TUTOR(q, (loc.ctx || []).map(slim), hist)
      .then(function (t) { Object.assign(tmp, {t:t, refs:loc.refs || [], act:loc.act}); })
      .catch(function (e) { Object.assign(tmp, strip(loc), {t:loc.t + "\n\n(" + e.message + ")"}); })
      .then(function () { S.chat = S.chat.slice(-40); save(); if (cur == "asst") render(); });
  } else S.chat.push(strip(loc));
  S.chat = S.chat.slice(-40); save(); render();
};
A.cans = function (k) {
  if (!cq) { toast("Cette question a expiré : demande-en une nouvelle."); return; }
  var q = cq, ok = +k == q.a; cq = null;
  if (ok) bump(q.m, 1); else recErr(q);
  S.chat.push({r:"u", t:"Ma réponse : " + dec(q.o[+k])});
  S.chat.push({r:"a", t:(ok ? "Bonne réponse !" : "Pas tout à fait. La bonne réponse était : " + dec(q.o[q.a])) + (q.e ? "\n" + dec(q.e) : "") + (ok ? "" : "\nJ’ai ajouté cette question à ton cahier d’erreurs."), act:[["send", "Pose-moi une question", "Une autre question"]].concat(q.fid != null ? [["open", q.fid, "Revoir la fiche"]] : [])});
  S.chat = S.chat.slice(-40); save(); render();
};
A.clearchat = function () { S.chat = []; cq = null; save(); render(); };
document.addEventListener("keydown", function (e) { if (e.target.id == "ci" && e.key == "Enter" && !e.shiftKey) { e.preventDefault(); A.send(); } });

/* ---------- profil : apparence et profil d'apprentissage ---------- */
var _p = V.prof;
V.prof = function () {
  var p = S.pf, sb = subs();
  return _p() + '<div class="card" style="max-width:460px;margin-top:16px"><h2>Mon profil d’apprentissage</h2><p class="mu" style="margin:0 0 6px">Objectif : <b>' + E(GOALS[p.goal]) + '</b>' + (p.exam ? ' · examen le ' + E(p.exam) : "") + '</p><p class="mu" style="margin:0 0 6px">Jours : ' + p.days.map(function (i) { return DAYS[i].slice(0, 3); }).join(", ") + ' · ' + S.goal + ' h par semaine</p><p class="mu" style="margin:0 0 12px">Style : ' + E(STYLES[p.style]) + '</p>' + B("onb", "", "Modifier mon profil d’apprentissage", "ghost") +
    '</div><div class="card" style="max-width:460px;margin-top:16px"><h2>Apparence</h2><div class="row">' + Object.keys(THN).map(function (k) { return B("theme", k, '<span class="sw" style="background:' + (TH[k]["--p"] || BASE["--p"]) + '"></span>' + THN[k], S.theme == k ? "sm" : "sm ghost"); }).join("") + '</div></div>';
};
A.theme = function (v) { S.theme = v; applyTheme(); save(); render(); };
})();
