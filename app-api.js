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
  A.wipe = function () { $("err").textContent = "Mot de passe oublié ? Écris-nous à " + SUPPORT_EMAIL + "."; };
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
      .catch(function (e) { var er = $("err"); if (er) er.textContent = e.message; else toast(e.message); });
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
