/* Connexion du site au serveur : comptes, sauvegarde et paiement Stripe. */
(function () {
  var SUPPORT_EMAIL = "contact@exemple.fr"; // À REMPLACER par ton adresse de support
  var authed = false, timer = null;

  function api(path, method, body) {
    return fetch("/api" + path, {
      method: method || "GET",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || "Erreur réseau");
        return d;
      });
    });
  }
  function clean() { var c = JSON.parse(JSON.stringify(S)); delete c.pw; delete c.email; delete c.prem; return c; }
  function adopt(d) { S = Object.assign(def(), d.state); authed = true; }

  // Sauvegarde automatique sur le serveur (remplace la sauvegarde locale)
  window.save = function () {
    if (!authed || !S) return;
    clearTimeout(timer);
    timer = setTimeout(function () { api("/state", "PUT", { state: clean() }).catch(function () {}); }, 700);
  };

  A.signup = function () {
    var n = $("an").value.trim(), m = $("ae").value.trim().toLowerCase(), p = $("ap").value, er = $("err");
    if (!n) { er.textContent = "Entre ton prénom."; return; }
    if (!/\S+@\S+\.\S+/.test(m)) { er.textContent = "Adresse e-mail invalide."; return; }
    if (p.length < 8) { er.textContent = "Mot de passe : 8 caractères minimum."; return; }
    var st = def(); st.nom = n; S = st; setF($("sf").value); S.year = $("sy").value; seed();
    api("/signup", "POST", { nom: n, email: m, password: p, state: clean() })
      .then(function (d) { adopt(d); A.closeauth(); showApp(); })
      .catch(function (e) { S = null; er.textContent = e.message; });
  };
  A.dologin = function () {
    var m = $("ae").value.trim().toLowerCase(), p = $("ap").value, er = $("err");
    api("/login", "POST", { email: m, password: p })
      .then(function (d) { adopt(d); A.closeauth(); showApp(); })
      .catch(function (e) { er.textContent = e.message; });
  };
  A.logout = function () {
    clearInterval(tm.iv); tm = { on: false, s: 0, iv: null };
    var f = function () { authed = false; S = null; qz = null; fc = null; showLand(); };
    api("/logout", "POST").then(f, f);
  };
  A.wipe = function () {
    var er = $("err"), m = ($("ae").value || "").trim().toLowerCase();
    if (!/\S+@\S+\.\S+/.test(m)) { er.textContent = "Écris d’abord ton e-mail dans la case ci-dessus, puis clique sur « Mot de passe oublié ? »."; return; }
    er.style.color = "var(--mu)"; er.textContent = "Envoi en cours…";
    api("/forgot", "POST", { email: m })
      .then(function (d) { er.textContent = d.message; })
      .catch(function (e) { er.style.color = ""; er.textContent = e.message + " (" + SUPPORT_EMAIL + ")"; });
  };
  // Limite de 3 sessions QCM par jour (comptes gratuits) : vérifiée par le serveur
  var startQ = A.startQ;
  A.startQ = function (v) {
    if (!authed || S.prem != "Gratuit") return startQ(v);
    api("/qcm/start", "POST").then(function (d) {
      if (d.used != null) S.qd = { d: dk(), n: d.used - 1 };
      startQ(v);
    }).catch(function (e) {
      toast(e.message);
      if (/Limite/.test(e.message)) { S.qd = { d: dk(), n: 3 }; go("prem"); }
    });
  };
  // Réinitialisation du mot de passe depuis le lien reçu par e-mail
  function resetScreen(token) {
    var box = '<div class="box"><h2 style="margin:8px 0 4px">Nouveau mot de passe</h2><p class="mu" style="margin:0 0 6px">Choisis un mot de passe de 8 caractères minimum.</p>' +
      '<label for="rp">Mot de passe</label><input id="rp" type="password" autocomplete="new-password" placeholder="8 caractères minimum">' +
      '<div class="err" id="rerr"></div><button class="btn lg" style="width:100%" id="rgo">Enregistrer</button></div>';
    $("auth").innerHTML = box; $("auth").style.display = "flex";
    $("rgo").onclick = function () {
      api("/reset", "POST", { token: token, password: $("rp").value })
        .then(function (d) { history.replaceState(null, "", location.pathname); adopt(d); A.closeauth(); showApp(); toast("Mot de passe modifié."); })
        .catch(function (e) { $("rerr").textContent = e.message; });
    };
  }
  A.reset = function () {
    if (!arm) { arm = true; render(); return; }
    arm = false;
    api("/account", "DELETE").then(function () { authed = false; S = null; showLand(); })
      .catch(function (e) { toast(e.message); });
  };
  var planModal = A.plan;
  window.PROD = true;
  window.TUTOR_API = true;
  window.TUTOR = function (q, ctx, hist) {
    return api("/tutor", "POST", { q: q, ctx: ctx, hist: hist }).then(function (d) { return d.text; });
  };
  A.plan = function (v) {
    if (v == "Gratuit") { if (S.prem != "Gratuit") A.portal(); return; }
    if (!authed) { toast("Crée un compte ou connecte-toi pour passer en Premium."); return; }
    if (S.prem != "Gratuit") { A.portal(); return; }
    planModal(v);
  };
  A.doPay = function (v) {
    api("/checkout", "POST", { plan: v == "Premium" ? "monthly" : "annual" })
      .then(function (d) { location.href = d.url; })
      .catch(function (e) {
        var er = $("err");
        if (er) { er.style.fontSize = "15px"; er.style.fontWeight = "600"; er.textContent = e.message; }
        toast(e.message);
      });
  };
  A.portal = function () {
    api("/portal", "POST").then(function (d) { location.href = d.url; })
      .catch(function (e) { toast(e.message); });
  };

  function refresh(left) {
    api("/me").then(function (d) {
      var was = S.prem; adopt(d);
      if (S.prem != was) { toast("Premium activé. Merci !"); render(); }
      else if (left > 0) setTimeout(function () { refresh(left - 1); }, 3000);
    }).catch(function () {});
  }
  window.__boot = function () {
    var rt = /[?&]reset=([a-f0-9]{64})/.exec(location.search);
    if (rt) { showLand(); resetScreen(rt[1]); return; }
    api("/me").then(function (d) {
      adopt(d); showApp();
      if (/[?&]paid=1/.test(location.search)) {
        history.replaceState(null, "", location.pathname);
        toast("Merci ! Ton abonnement est en cours d’activation.");
        refresh(4);
      }
    }).catch(function () { showLand(); });
  };
})();
