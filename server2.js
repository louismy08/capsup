require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const Stripe = require("stripe");

for (const k of ["JWT_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "PRICE_MONTHLY", "PRICE_ANNUAL"]) {
  if (!process.env[k]) { console.error("Variable d'environnement manquante : " + k); process.exit(1); }
}
const { JWT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PRICE_MONTHLY, PRICE_ANNUAL } = process.env;
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const PORT = process.env.PORT || 3000;

const stripe = Stripe(STRIPE_SECRET_KEY);
const db = new Database(process.env.DB_PATH || "capsup.db");
db.pragma("journal_mode = WAL");
db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  nom TEXT NOT NULL,
  salt TEXT NOT NULL,
  pw TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  stripe_customer TEXT,
  stripe_sub TEXT,
  state TEXT NOT NULL DEFAULT '{}',
  created INTEGER NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS qcm_use (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires INTEGER NOT NULL
)`);
const FREE_QCM_PER_DAY = 3;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const q = {
  qcmGet: db.prepare("SELECT n FROM qcm_use WHERE user_id = ? AND day = ?"),
  qcmInc: db.prepare("INSERT INTO qcm_use (user_id, day, n) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET n = n + 1"),
  tokPut: db.prepare("INSERT INTO reset_tokens (token_hash, user_id, expires) VALUES (?, ?, ?)"),
  tokGet: db.prepare("SELECT * FROM reset_tokens WHERE token_hash = ?"),
  tokDelUser: db.prepare("DELETE FROM reset_tokens WHERE user_id = ?"),
  setPw: db.prepare("UPDATE users SET salt = ?, pw = ? WHERE id = ?"),
  byEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  byId: db.prepare("SELECT * FROM users WHERE id = ?"),
  byCustomer: db.prepare("SELECT * FROM users WHERE stripe_customer = ?"),
  insert: db.prepare("INSERT INTO users (email, nom, salt, pw, state, created) VALUES (?, ?, ?, ?, ?, ?)"),
  setState: db.prepare("UPDATE users SET state = ?, nom = ? WHERE id = ?"),
  setPlan: db.prepare("UPDATE users SET plan = ?, stripe_customer = ?, stripe_sub = ? WHERE id = ?"),
  del: db.prepare("DELETE FROM users WHERE id = ?")
};

const PLAN_BY_PRICE = { [PRICE_MONTHLY]: "monthly", [PRICE_ANNUAL]: "annual" };
const LABEL = { free: "Gratuit", monthly: "Premium", annual: "Premium annuel" };

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString("hex");
function checkPw(pw, salt, h) {
  const a = Buffer.from(hash(pw, salt), "hex"), b = Buffer.from(h, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const COOKIE = { httpOnly: true, sameSite: "lax", secure: BASE_URL.startsWith("https"), maxAge: 30 * 864e5 };
const sign = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: "30d" });
function auth(req, res, next) {
  try {
    const { id } = jwt.verify(req.cookies.t, JWT_SECRET);
    const u = q.byId.get(id);
    if (!u) throw new Error("inconnu");
    req.user = u;
    next();
  } catch (e) { res.status(401).json({ error: "Non connecté." }); }
}
function view(u) {
  let st = {};
  try { st = JSON.parse(u.state || "{}"); } catch (e) { st = {}; }
  return { email: u.email, plan: u.plan, state: Object.assign(st, { nom: u.nom, prem: LABEL[u.plan] || "Gratuit" }) };
}
function cleanState(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return null;
  delete s.pw; delete s.email; delete s.prem;
  const j = JSON.stringify(s);
  return j.length > 500000 ? null : j;
}

async function syncSubscription(sub) {
  const uid = Number(sub.metadata && sub.metadata.user_id) || (q.byCustomer.get(sub.customer) || {}).id;
  if (!uid) return;
  // past_due = paiement refusé mais Stripe relance encore : on garde l'accès pendant la relance
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  const price = sub.items && sub.items.data[0] && sub.items.data[0].price.id;
  q.setPlan.run(active ? (PLAN_BY_PRICE[price] || "monthly") : "free", sub.customer, sub.id, uid);
}
async function handleEvent(ev) {
  const o = ev.data.object;
  if (ev.type === "checkout.session.completed" && o.mode === "subscription") {
    const sub = await stripe.subscriptions.retrieve(o.subscription);
    sub.metadata = Object.assign({}, sub.metadata, { user_id: o.client_reference_id });
    await syncSubscription(sub);
  } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(ev.type)) {
    await syncSubscription(o);
  }
}

const app = express();
app.set("trust proxy", 1);

// Le webhook Stripe doit recevoir le corps brut : à déclarer AVANT express.json()
app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  let ev;
  try { ev = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET); }
  catch (e) { return res.status(400).send("Signature invalide"); }
  try { await handleEvent(ev); res.json({ received: true }); }
  catch (e) { console.error("Webhook :", e); res.status(500).send("Erreur"); }
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null
    }
  }
}));
app.use(express.json({ limit: "600kb" }));
app.use(cookieParser());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });

app.post("/api/signup", limiter, (req, res) => {
  const b = req.body || {};
  const email = String(b.email || "").trim().toLowerCase();
  const nom = String(b.nom || "").trim().slice(0, 30);
  const pw = String(b.password || "");
  const st = cleanState(b.state) || "{}";
  if (!nom || !/^\S+@\S+\.\S+$/.test(email) || pw.length < 8)
    return res.status(400).json({ error: "Prénom, e-mail valide et mot de passe de 8 caractères minimum requis." });
  if (q.byEmail.get(email)) return res.status(409).json({ error: "Un compte existe déjà avec cet e-mail." });
  const salt = crypto.randomBytes(16).toString("hex");
  const info = q.insert.run(email, nom, salt, hash(pw, salt), st, Date.now());
  res.cookie("t", sign(info.lastInsertRowid), COOKIE).json(view(q.byId.get(info.lastInsertRowid)));
});

app.post("/api/login", limiter, (req, res) => {
  const b = req.body || {};
  const u = q.byEmail.get(String(b.email || "").trim().toLowerCase());
  if (!u || !checkPw(String(b.password || ""), u.salt, u.pw)) return res.status(401).json({ error: "E-mail ou mot de passe incorrect." });
  res.cookie("t", sign(u.id), COOKIE).json(view(u));
});

// ---- Mot de passe oublié : lien à usage unique valable 1 heure, envoyé par e-mail (Resend) ----
const forgotLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false, message: { error: "Trop de demandes, réessaie plus tard." } });
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
async function sendMail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY manquante");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM || "CAP SUP <onboarding@resend.dev>", to: [to], subject, html })
  });
  if (!r.ok) throw new Error("Resend " + r.status + " " + (await r.text()).slice(0, 200));
}
app.post("/api/forgot", forgotLimit, async (req, res) => {
  const email = String((req.body && req.body.email) || "").trim().toLowerCase();
  const OK = { ok: true, message: "Si un compte existe avec cet e-mail, un lien de réinitialisation vient d’être envoyé (valable 1 heure). Pense à regarder les courriers indésirables." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Adresse e-mail invalide." });
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: "L’envoi d’e-mails n’est pas encore configuré. Écris-nous pour récupérer ton compte." });
  const u = q.byEmail.get(email);
  if (!u) return res.json(OK);
  try {
    const token = crypto.randomBytes(32).toString("hex");
    q.tokDelUser.run(u.id);
    q.tokPut.run(sha(token), u.id, Date.now() + 3600 * 1000);
    const link = BASE_URL + "/?reset=" + token;
    await sendMail(u.email, "Réinitialise ton mot de passe CAP SUP",
      "<p>Bonjour " + String(u.nom).replace(/[<>&]/g, "") + ",</p><p>Pour choisir un nouveau mot de passe, clique ici (lien valable 1 heure) :</p><p><a href=\"" + link + "\">" + link + "</a></p><p>Si tu n’as rien demandé, ignore ce message : ton mot de passe ne change pas.</p>");
  } catch (e) { console.error("Forgot :", e.message); }
  res.json(OK);
});
app.post("/api/reset", limiter, (req, res) => {
  const token = String((req.body && req.body.token) || "");
  const pw = String((req.body && req.body.password) || "");
  if (pw.length < 8) return res.status(400).json({ error: "Mot de passe : 8 caractères minimum." });
  const t = token ? q.tokGet.get(sha(token)) : null;
  if (!t || t.expires < Date.now()) return res.status(400).json({ error: "Lien invalide ou expiré. Fais une nouvelle demande." });
  const salt = crypto.randomBytes(16).toString("hex");
  q.setPw.run(salt, hash(pw, salt), t.user_id);
  q.tokDelUser.run(t.user_id);
  res.cookie("t", sign(t.user_id), COOKIE).json(view(q.byId.get(t.user_id)));
});

// ---- Limite de sessions QCM des comptes gratuits, appliquée côté serveur ----
app.post("/api/qcm/start", auth, (req, res) => {
  if (req.user.plan !== "free") return res.json({ used: null, left: null });
  const day = today();
  const row = q.qcmGet.get(req.user.id, day);
  const n = row ? row.n : 0;
  if (n >= FREE_QCM_PER_DAY) return res.status(402).json({ error: "Limite de " + FREE_QCM_PER_DAY + " sessions atteinte : passe en Premium." });
  q.qcmInc.run(req.user.id, day);
  res.json({ used: n + 1, left: FREE_QCM_PER_DAY - n - 1 });
});

app.post("/api/logout", (req, res) => res.clearCookie("t").json({ ok: true }));
app.get("/api/me", auth, (req, res) => res.json(view(req.user)));

app.put("/api/state", auth, (req, res) => {
  const s = req.body && req.body.state;
  const j = cleanState(s);
  if (!j) return res.status(400).json({ error: "État invalide." });
  const nom = typeof s.nom === "string" && s.nom.trim() ? s.nom.trim().slice(0, 30) : req.user.nom;
  q.setState.run(j, nom, req.user.id);
  res.json({ ok: true });
});

app.post("/api/checkout", auth, async (req, res) => {
  try {
    const price = { monthly: PRICE_MONTHLY, annual: PRICE_ANNUAL }[req.body && req.body.plan];
    if (!price) return res.status(400).json({ error: "Formule inconnue." });
    if (req.user.plan !== "free") return res.status(409).json({ error: "Tu as déjà un abonnement : utilise « Gérer mon abonnement »." });
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      ...(req.user.stripe_customer ? { customer: req.user.stripe_customer } : { customer_email: req.user.email }),
      client_reference_id: String(req.user.id),
      subscription_data: { metadata: { user_id: String(req.user.id) } },
      success_url: BASE_URL + "/?paid=1",
      cancel_url: BASE_URL + "/?cancel=1",
      locale: "fr",
      allow_promotion_codes: true,
      custom_text: { submit: { message: "En payant, tu demandes l’accès immédiat au service. Les conditions de rétractation et de résiliation figurent dans les CGV." } }
    });
    res.json({ url: session.url });
  } catch (e) { console.error("Checkout :", e.message); res.status(500).json({ error: "Paiement indisponible pour le moment." }); }
});

const tutorLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 40, keyGenerator: (req) => String(req.user ? req.user.id : req.ip), standardHeaders: true, legacyHeaders: false, message: { error: "Limite horaire atteinte, réessaie plus tard." } });
app.post("/api/tutor", auth, tutorLimit, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "Assistant IA non configuré." });
  if (req.user.plan === "free") return res.status(402).json({ error: "L’assistant IA est réservé aux abonnés Premium." });
  const b = req.body || {};
  const question = String(b.q || "").slice(0, 1000);
  if (!question) return res.status(400).json({ error: "Question vide." });
  const ctx = (Array.isArray(b.ctx) ? b.ctx : []).slice(0, 4).map((c) => JSON.stringify(c).slice(0, 3000)).join("\n---\n");
  const hist = (Array.isArray(b.hist) ? b.hist : []).slice(-6).filter((m) => m && typeof m.t === "string")
    .map((m) => ({ role: m.r === "u" ? "user" : "assistant", content: m.t.slice(0, 1500) }));
  while (hist.length && hist[0].role !== "user") hist.shift();
  const msgs = [];
  for (const m of hist) { if (msgs.length && msgs[msgs.length - 1].role === m.role) continue; msgs.push(m); }
  if (msgs.length && msgs[msgs.length - 1].role === "user") msgs.pop();
  msgs.push({ role: "user", content: question });
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.TUTOR_MODEL || "claude-sonnet-5-5",
        max_tokens: 700,
        system: "Tu es l’assistant de révision de CAP SUP. Réponds en français, clairement et de façon concise, pour un élève/étudiant. Appuie-toi sur les fiches fournies quand elles sont pertinentes et dis-le si tu sors de leur contenu. Ne fais pas les devoirs à la place de l’élève : explique la démarche. Si tu n’es pas sûr, dis-le." + (ctx ? "\n\nFiches du site :\n" + ctx : ""),
        messages: msgs
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error((d.error && d.error.message) || "Erreur API");
    res.json({ text: (d.content || []).map((c) => c.text || "").join("").trim() });
  } catch (e) { console.error("Tutor :", e.message); res.status(500).json({ error: "Assistant indisponible pour le moment." }); }
});

app.post("/api/portal", auth, async (req, res) => {
  try {
    if (!req.user.stripe_customer) return res.status(400).json({ error: "Aucun abonnement à gérer." });
    const s = await stripe.billingPortal.sessions.create({ customer: req.user.stripe_customer, return_url: BASE_URL });
    res.json({ url: s.url });
  } catch (e) { console.error("Portail :", e.message); res.status(500).json({ error: "Portail indisponible pour le moment." }); }
});

app.delete("/api/account", auth, async (req, res) => {
  try { if (req.user.stripe_sub) await stripe.subscriptions.cancel(req.user.stripe_sub); } catch (e) { console.error("Résiliation :", e.message); }
  q.del.run(req.user.id);
  res.clearCookie("t").json({ ok: true });
});

app.get("/healthz", (req, res) => res.send("ok"));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.listen(PORT, () => console.log("CAP SUP sur " + BASE_URL + " (port " + PORT + ")"));
