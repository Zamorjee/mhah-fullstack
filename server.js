require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const Stripe = require('stripe');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-now';
const HTG_RATE = Number(process.env.HTG_RATE || 132);

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

const PAYPAL_ENV = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || '';
const PAYPAL_BASE = PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

const MONCASH_MODE = (process.env.MONCASH_MODE || 'sandbox').toLowerCase();
const MONCASH_CLIENT_ID = process.env.MONCASH_CLIENT_ID || '';
const MONCASH_CLIENT_SECRET = process.env.MONCASH_CLIENT_SECRET || '';
const MONCASH_API_BASE = MONCASH_MODE === 'live'
  ? 'https://moncashbutton.digicelgroup.com/Api'
  : 'https://sandbox.moncashbutton.digicelgroup.com/Api';
const MONCASH_GATEWAY_BASE = MONCASH_MODE === 'live'
  ? 'https://moncashbutton.digicelgroup.com/Moncash-middleware'
  : 'https://sandbox.moncashbutton.digicelgroup.com/Moncash-middleware';

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const RETURN_PATHS = { stripe: '/payment-return/stripe', paypal: '/payment-return/paypal', moncash: '/payment-return/moncash' };

function buildAppUrl(pathname, params){
  const url = new URL(pathname, APP_BASE_URL.endsWith('/') ? APP_BASE_URL : APP_BASE_URL + '/');
  Object.entries(params || {}).forEach(([key, value]) => {
    if(value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
}

app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

function nowIso(){ return new Date().toISOString(); }
function randomId(prefix){ return `${prefix}${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`.toUpperCase(); }
function clone(obj){ return JSON.parse(JSON.stringify(obj)); }
function round2(value){ return Math.round((Number(value) || 0) * 100) / 100; }
function htgFromUsd(usd){ return round2((Number(usd) || 0) * HTG_RATE); }
function usdFromHtg(htg){ return round2((Number(htg) || 0) / HTG_RATE); }
function looksConfigured(value){ return !!value && !String(value).startsWith('your_') && !String(value).startsWith('change-'); }
function isStripeConfigured(){ return looksConfigured(STRIPE_SECRET_KEY); }
function isPayPalConfigured(){ return looksConfigured(PAYPAL_CLIENT_ID) && looksConfigured(PAYPAL_CLIENT_SECRET); }
function isMonCashConfigured(){ return looksConfigured(MONCASH_CLIENT_ID) && looksConfigured(MONCASH_CLIENT_SECRET); }
function paymentTypeLabelFromProvider(provider){ return provider === 'paypal' ? 'PayPal' : provider === 'moncash' ? 'MonCash' : 'Stripe'; }

function readDb(){
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDb(db){
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function hashIfNeeded(value){
  if(!value) return '';
  return value.startsWith('$2') ? value : bcrypt.hashSync(value, 10);
}

function seedDb(){
  if(fs.existsSync(DB_FILE)) return;
  const db = {
    admins: {
      national: { passwordHash: hashIfNeeded('admin2026'), name: 'Admin National' },
      artibonite: { passwordHash: hashIfNeeded('arti2026'), name: 'Admin Artibonite' },
      centre: { passwordHash: hashIfNeeded('cent2026'), name: 'Admin Centre' },
      grandanse: { passwordHash: hashIfNeeded('gran2026'), name: "Admin Grand'Anse" },
      nippes: { passwordHash: hashIfNeeded('nipp2026'), name: 'Admin Nippes' },
      nord: { passwordHash: hashIfNeeded('nord2026'), name: 'Admin Nord' },
      nordest: { passwordHash: hashIfNeeded('nest2026'), name: 'Admin Nord-Est' },
      nordouest: { passwordHash: hashIfNeeded('noue2026'), name: 'Admin Nord-Ouest' },
      ouest: { passwordHash: hashIfNeeded('oues2026'), name: 'Admin Ouest' },
      sud: { passwordHash: hashIfNeeded('sud_2026'), name: 'Admin Sud' },
      sudest: { passwordHash: hashIfNeeded('sest2026'), name: 'Admin Sud-Est' }
    },
    members: [
      { code:'MHAH2024-JEAN01-OUST', nom:'Jean Pierre', dob:'1985-03-15', birthPlace:'Port-au-Prince', cin:'04-01-85-0001', email:'jean@email.com', phone:'+50937001234', address:'Pétion-Ville', dept:'Ouest', commune:'Pétion-Ville', status:'Fondateur', passwordHash:hashIfNeeded('password'), dateJoined:'2024-01-15', profession:'Ingénieur', sexe:'Masculin', notes:'' },
      { code:'MHAH2024-MARI02-NORD', nom:'Marie Claire', dob:'1990-07-22', birthPlace:'Cap-Haïtien', cin:'03-02-90-0034', email:'marie@email.com', phone:'+50938002345', address:'Cap-Haïtien', dept:'Nord', commune:'Cap-Haïtien', status:"d'honneur", passwordHash:hashIfNeeded('password'), dateJoined:'2024-02-20', profession:'Médecin', sexe:'Féminin', notes:'' },
      { code:'MHAH2024-PAUL03-ARTI', nom:'Paul Antoine', dob:'1988-11-05', birthPlace:'Gonaïves', cin:'01-03-88-0078', email:'paul@email.com', phone:'+50936003456', address:'Gonaïves', dept:'Artibonite', commune:'Gonaïves', status:'Adhérent', passwordHash:hashIfNeeded('password'), dateJoined:'2024-03-10', profession:'Agriculteur', sexe:'Masculin', notes:'' },
      { code:'MHAH2024-ROSE04-SUD_', nom:'Rose Angèle', dob:'1992-05-18', birthPlace:'Les Cayes', cin:'09-04-92-0012', email:'rose@email.com', phone:'+50939004567', address:'Les Cayes', dept:'Sud', commune:'Les Cayes', status:'Fondateur', passwordHash:hashIfNeeded('password'), dateJoined:'2024-04-05', profession:'Avocate', sexe:'Féminin', notes:'' },
      { code:'MHAH2024-ALEX05-CENT', nom:'Alex Beaumont', dob:'1987-09-30', birthPlace:'Hinche', cin:'02-05-87-0056', email:'alex@email.com', phone:'+50934005678', address:'Hinche', dept:'Centre', commune:'Hinche', status:"d'honneur", passwordHash:hashIfNeeded('password'), dateJoined:'2024-05-12', profession:'Comptable', sexe:'Masculin', notes:'' },
      { code:'MHAH2024-SOPH06-OUST', nom:'Sophie Delatour', dob:'1995-01-20', birthPlace:'Delmas', cin:'04-06-95-0090', email:'sophie@email.com', phone:'+50933006789', address:'Delmas', dept:'Ouest', commune:'Delmas', status:'Adhérent', passwordHash:hashIfNeeded('password'), dateJoined:'2024-06-01', profession:'Enseignante', sexe:'Féminin', notes:'' }
    ],
    payments: [
      { id:1, memberCode:'MHAH2024-JEAN01-OUST', amount:100, date:'2024-06-01', type:'Cotisation', note:'Annuel' },
      { id:2, memberCode:'MHAH2024-MARI02-NORD', amount:50, date:'2024-07-15', type:'Don', note:'Vol.' }
    ],
    chats: [
      { id:1, ch:'general', scope:'national', user:'Admin National', role:'admin', msg:'Bienvenue à tous les membres MHAH! 🇭🇹', time:new Date('2024-09-01T10:00:00Z').toISOString() },
      { id:2, ch:'dept_Ouest', scope:'Ouest', user:'Admin Ouest', role:'admin', msg:'Message pour les membres de l\'Ouest uniquement', time:new Date('2024-09-02T11:00:00Z').toISOString() },
      { id:3, ch:'annonces', scope:'national', user:'Admin National', role:'admin', msg:'📢 Prochaine réunion le 15 octobre', time:new Date('2024-09-03T09:00:00Z').toISOString() }
    ],
    requests: [],
    moncash: [
      { id:'MC1A', memberCode:'MHAH2024-JEAN01-OUST', phone:'+50937001234', amount:500, type:'Mensuelle', status:'completed', date:'2024-08-01T14:30:00Z', note:'', ref:'TXN1' }
    ],
    zelle: [
      { id:'ZL1A', memberCode:'MHAH2024-JEAN01-OUST', amount:25, type:'Mensuelle', status:'completed', date:'2024-08-10T11:00:00Z', note:'', ref:'ZR1', senderName:'Jean Pierre', senderBank:'Chase' }
    ],
    cards: [
      { id:'CB1A', memberCode:'MHAH2024-MARI02-NORD', amount:50, type:'Don', method:'visa', status:'completed', date:'2024-09-01T10:00:00Z', note:'', cardLast4:'4242', cardHolder:'Marie Claire', ref:'CBREF1' },
      { id:'CB2B', memberCode:'MHAH2024-JEAN01-OUST', amount:25, type:'Mensuelle', method:'paypal', status:'completed', date:'2024-09-15T14:00:00Z', note:'', cardLast4:'', cardHolder:'', ref:'PP1', paypalEmail:'jean@email.com' }
    ],
    pendingPayments: {},
    webhooks: []
  };
  writeDb(db);
}

function normalizeDb(){
  const db = readDb();
  let changed = false;
  Object.keys(db.admins || {}).forEach((role) => {
    const item = db.admins[role];
    if(item.password && !item.passwordHash){ item.passwordHash = hashIfNeeded(item.password); delete item.password; changed = true; }
    if(item.passwordHash && !item.passwordHash.startsWith('$2')){ item.passwordHash = hashIfNeeded(item.passwordHash); changed = true; }
  });
  (db.members || []).forEach((member) => {
    if(member.password && !member.passwordHash){ member.passwordHash = hashIfNeeded(member.password); delete member.password; changed = true; }
    if(member.passwordHash && !member.passwordHash.startsWith('$2')){ member.passwordHash = hashIfNeeded(member.passwordHash); changed = true; }
  });
  if(changed) writeDb(db);
}

function sanitizeMembers(members){
  return members.map((member) => {
    const clean = Object.assign({}, member);
    delete clean.passwordHash;
    delete clean.password;
    return clean;
  });
}

function buildSnapshot(db){
  return {
    members: sanitizeMembers(db.members || []),
    payments: clone(db.payments || []),
    chats: clone(db.chats || []),
    requests: clone(db.requests || []),
    moncash: clone(db.moncash || []),
    zelle: clone(db.zelle || []),
    cards: clone(db.cards || [])
  };
}

function signSession(session){
  return jwt.sign(session, JWT_SECRET, { expiresIn: '7d' });
}

function authRequired(req, res, next){
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if(!token) return res.status(401).json({ error: 'Session requise' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch(err){
    return res.status(401).json({ error: 'Session invalide' });
  }
}

function requireAdmin(req, res, next){
  if(!req.user || req.user.type !== 'admin') return res.status(403).json({ error: 'Accès admin requis' });
  next();
}

function assertMemberExists(db, code){
  return (db.members || []).find((m) => String(m.code).toLowerCase() === String(code || '').toLowerCase());
}

function allowedAmount(amount){
  return Number.isFinite(amount) && amount > 0 && amount <= 1000000;
}

function verifyMemberAccess(req, memberCode){
  if(req.user.type === 'admin') return true;
  return req.user.code === memberCode;
}

function pushGeneralPayment(db, payment){
  db.payments.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    memberCode: payment.memberCode,
    amount: round2(payment.amount),
    date: new Date().toISOString().split('T')[0],
    type: payment.type,
    note: payment.note || ''
  });
}

function createPendingPayment(db, cfg){
  db.pendingPayments[cfg.txRef] = Object.assign({
    createdAt: nowIso(),
    status: 'pending'
  }, cfg);
  writeDb(db);
  return db.pendingPayments[cfg.txRef];
}

function recordSuccessfulCardPayment(txRef, details){
  const db = readDb();
  const pending = db.pendingPayments[txRef];
  if(!pending) return buildSnapshot(db);
  const already = (db.cards || []).some((item) => item.ref === txRef || (details.sessionId && item.sessionId === details.sessionId) || (details.orderId && item.orderId === details.orderId));
  if(!already){
    const cardTx = {
      id: randomId('CB'),
      memberCode: pending.memberCode,
      amount: round2(pending.amountUsd || pending.amount),
      type: pending.typeLabel,
      method: pending.method,
      status: 'completed',
      date: nowIso(),
      note: details.note || '',
      ref: txRef,
      cardLast4: details.cardLast4 || '',
      cardHolder: pending.memberName || '',
      sessionId: details.sessionId || '',
      orderId: details.orderId || ''
    };
    if(pending.method === 'paypal' && pending.paypalEmail) cardTx.paypalEmail = pending.paypalEmail;
    db.cards.push(cardTx);
    pushGeneralPayment(db, {
      memberCode: pending.memberCode,
      amount: pending.amountUsd || pending.amount,
      type: pending.method === 'paypal' ? 'PayPal' : 'Stripe',
      note: `${pending.typeLabel} ${String(pending.method || '').toUpperCase()}`
    });
  }
  delete db.pendingPayments[txRef];
  writeDb(db);
  return buildSnapshot(db);
}

function recordSuccessfulMonCashPayment(txRef, details){
  const db = readDb();
  const pending = db.pendingPayments[txRef];
  if(!pending) return buildSnapshot(db);
  const transactionId = String(details.transactionId || details.reference || txRef);
  const already = (db.moncash || []).some((item) => item.ref === transactionId || item.orderId === txRef);
  if(!already){
    const amountHtg = round2(details.amountHtg || pending.amountHtg || 0);
    db.moncash.push({
      id: randomId('MC'),
      memberCode: pending.memberCode,
      phone: details.payer || pending.phone || '',
      amount: amountHtg,
      type: pending.typeLabel,
      status: 'completed',
      date: nowIso(),
      note: details.note || 'MonCash validé',
      ref: transactionId,
      orderId: txRef,
      payer: details.payer || ''
    });
    pushGeneralPayment(db, {
      memberCode: pending.memberCode,
      amount: pending.amountUsd || usdFromHtg(amountHtg),
      type: 'MonCash',
      note: `${pending.typeLabel} ${amountHtg.toLocaleString('fr-FR')} HTG`
    });
  }
  delete db.pendingPayments[txRef];
  writeDb(db);
  return buildSnapshot(db);
}

function sanitizeIncomingMembers(currentMembers, incomingMembers){
  const currentMap = new Map(currentMembers.map((item) => [item.code, item]));
  return (incomingMembers || []).map((item) => {
    const previous = currentMap.get(item.code) || {};
    const clean = Object.assign({}, previous, item);
    if(item.password) clean.passwordHash = hashIfNeeded(item.password);
    delete clean.password;
    return clean;
  });
}

async function safeJson(response){
  const contentType = response.headers.get('content-type') || '';
  if(contentType.includes('application/json')) return response.json();
  const text = await response.text();
  try { return JSON.parse(text); } catch(err){ return { raw: text }; }
}

async function getPayPalAccessToken(){
  if(!isPayPalConfigured()) throw new Error('PayPal non configuré');
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await safeJson(response);
  if(!response.ok) throw new Error(data.error_description || data.error || 'Token PayPal impossible');
  return data.access_token;
}

async function getPayPalOrder(orderId){
  const token = await getPayPalAccessToken();
  const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await safeJson(response);
  if(!response.ok) throw new Error(data.message || 'Lecture commande PayPal impossible');
  return { token, order: data };
}

async function capturePayPalOrder(orderId){
  const { token } = await getPayPalOrder(orderId);
  const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  const data = await safeJson(response);
  if(!response.ok) throw new Error(data.message || 'Capture PayPal impossible');
  return data;
}

async function verifyPayPalWebhook(headers, body){
  if(!looksConfigured(PAYPAL_WEBHOOK_ID)) return false;
  const token = await getPayPalAccessToken();
  const response = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: PAYPAL_WEBHOOK_ID,
      webhook_event: body
    })
  });
  const data = await safeJson(response);
  return response.ok && data.verification_status === 'SUCCESS';
}

async function getMonCashAccessToken(){
  if(!isMonCashConfigured()) throw new Error('MonCash non configuré');
  const auth = Buffer.from(`${MONCASH_CLIENT_ID}:${MONCASH_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${MONCASH_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'scope=read,write&grant_type=client_credentials'
  });
  const data = await safeJson(response);
  if(!response.ok) throw new Error(data.message || data.error || 'Token MonCash impossible');
  return data.access_token;
}

async function createMonCashHostedPayment(orderId, amountHtg){
  const token = await getMonCashAccessToken();
  const response = await fetch(`${MONCASH_API_BASE}/v1/CreatePayment`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ amount: round2(amountHtg), orderId })
  });
  const data = await safeJson(response);
  if(!response.ok) throw new Error(data.message || data.error || 'Création paiement MonCash impossible');
  const paymentToken = data.payment_token && data.payment_token.token;
  if(!paymentToken) throw new Error('Token MonCash introuvable');
  return {
    url: `${MONCASH_GATEWAY_BASE}/Payment/Redirect?token=${encodeURIComponent(paymentToken)}`,
    paymentToken,
    raw: data
  };
}

async function retrieveMonCashPayment({ orderId, transactionId }){
  const token = await getMonCashAccessToken();
  const endpoint = transactionId ? 'RetrieveTransactionPayment' : 'RetrieveOrderPayment';
  const body = transactionId ? { transactionId } : { orderId };
  const response = await fetch(`${MONCASH_API_BASE}/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await safeJson(response);
  if(!response.ok) throw new Error(data.message || data.error || 'Vérification MonCash impossible');
  return data.payment || {};
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    appBaseUrl: APP_BASE_URL,
    stripeConfigured: isStripeConfigured(),
    paypalConfigured: isPayPalConfigured(),
    moncashConfigured: isMonCashConfigured(),
    moncashMode: MONCASH_MODE,
    htgRate: HTG_RATE,
    returnUrls: {
      stripe: buildAppUrl(RETURN_PATHS.stripe),
      paypal: buildAppUrl(RETURN_PATHS.paypal),
      moncash: buildAppUrl(RETURN_PATHS.moncash)
    }
  });
});

app.get('/api/payments/providers', authRequired, (req, res) => {
  res.json({
    stripe: { enabled: isStripeConfigured() },
    paypal: { enabled: isPayPalConfigured() },
    moncash: { enabled: isMonCashConfigured(), mode: MONCASH_MODE, htgRate: HTG_RATE },
    zelle: { enabled: true }
  });
});

app.post('/api/auth/member/login', async (req, res) => {
  const code = String(req.body.code || '').trim();
  const password = String(req.body.password || '');
  if(!code || !password) return res.status(400).json({ error: 'Code et mot de passe requis' });
  const db = readDb();
  const member = assertMemberExists(db, code);
  if(!member) return res.status(404).json({ error: 'Code introuvable' });
  const ok = member.passwordHash ? await bcrypt.compare(password, member.passwordHash) : password === member.password;
  if(!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });
  const session = { type: 'member', role: 'member', code: member.code, name: member.nom };
  res.json({ token: signSession(session), session, snapshot: buildSnapshot(db) });
});

app.post('/api/auth/admin/login', async (req, res) => {
  const role = String(req.body.role || '').trim();
  const password = String(req.body.password || '');
  const db = readDb();
  const admin = db.admins[role];
  if(!admin) return res.status(404).json({ error: 'Rôle admin inconnu' });
  const ok = admin.passwordHash ? await bcrypt.compare(password, admin.passwordHash) : password === admin.password;
  if(!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });
  const session = { type: 'admin', role, name: admin.name || `Admin ${role}` };
  res.json({ token: signSession(session), session, snapshot: buildSnapshot(db) });
});

app.get('/api/session', authRequired, (req, res) => {
  const db = readDb();
  res.json({ session: req.user, snapshot: buildSnapshot(db) });
});

app.post('/api/member/change-password', authRequired, async (req, res) => {
  if(req.user.type !== 'member') return res.status(403).json({ error: 'Réservé aux membres' });
  const { oldPassword, newPassword, confirmPassword } = req.body || {};
  if(!oldPassword || !newPassword || !confirmPassword) return res.status(400).json({ error: 'Champs requis' });
  if(newPassword.length < 4) return res.status(400).json({ error: 'Mot de passe trop court' });
  if(newPassword !== confirmPassword) return res.status(400).json({ error: 'Confirmation différente' });
  const db = readDb();
  const member = assertMemberExists(db, req.user.code);
  if(!member) return res.status(404).json({ error: 'Membre introuvable' });
  const ok = await bcrypt.compare(oldPassword, member.passwordHash);
  if(!ok) return res.status(401).json({ error: 'Ancien mot de passe invalide' });
  member.passwordHash = await bcrypt.hash(newPassword, 10);
  writeDb(db);
  res.json({ ok: true });
});

app.post('/api/data/snapshot', authRequired, requireAdmin, (req, res) => {
  const snapshot = req.body.snapshot || {};
  const db = readDb();
  if(Array.isArray(snapshot.members)) db.members = sanitizeIncomingMembers(db.members, snapshot.members);
  if(Array.isArray(snapshot.payments)) db.payments = snapshot.payments;
  if(Array.isArray(snapshot.chats)) db.chats = snapshot.chats;
  if(Array.isArray(snapshot.requests)) db.requests = snapshot.requests;
  if(Array.isArray(snapshot.moncash)) db.moncash = snapshot.moncash;
  if(Array.isArray(snapshot.zelle)) db.zelle = snapshot.zelle;
  if(Array.isArray(snapshot.cards)) db.cards = snapshot.cards;
  writeDb(db);
  res.json({ ok: true, snapshot: buildSnapshot(db) });
});

app.post('/api/payments/manual', authRequired, (req, res) => {
  const body = req.body || {};
  const provider = String(body.provider || '');
  const status = String(body.status || 'pending');
  const memberCode = String(body.memberCode || '').trim();
  const amount = Number(body.amount);
  const type = String(body.type || 'Autre');
  if(!['moncash','zelle'].includes(provider)) return res.status(400).json({ error: 'Provider manuel invalide' });
  if(!['pending','completed'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  if(!memberCode || !allowedAmount(amount)) return res.status(400).json({ error: 'Montant ou code invalide' });
  if(!verifyMemberAccess(req, memberCode)) return res.status(403).json({ error: 'Accès membre refusé' });
  const db = readDb();
  const member = assertMemberExists(db, memberCode);
  if(!member) return res.status(404).json({ error: 'Membre introuvable' });
  if(provider === 'moncash'){
    const tx = { id: randomId('MC'), memberCode, phone: String(body.phone || member.phone || ''), amount: round2(amount), type, status, date: nowIso(), note: '', ref: String(body.ref || randomId('TXN')) };
    db.moncash.push(tx);
    if(status === 'completed') pushGeneralPayment(db, { memberCode, amount: usdFromHtg(amount), type: 'MonCash', note: `${type} ${round2(amount).toLocaleString('fr-FR')} HTG` });
  } else {
    const tx = { id: randomId('ZL'), memberCode, amount: round2(amount), type, status, date: nowIso(), note: '', ref: String(body.ref || randomId('ZR')), senderName: String(body.senderName || member.nom), senderBank: String(body.senderBank || '') };
    db.zelle.push(tx);
    if(status === 'completed') pushGeneralPayment(db, { memberCode, amount, type: 'Zelle', note: `${type} $${round2(amount)}` });
  }
  writeDb(db);
  res.json({ ok: true, snapshot: buildSnapshot(db) });
});

app.post('/api/payments/create', authRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const provider = String(body.provider || '').toLowerCase();
    const method = String(body.method || provider).toLowerCase();
    const memberCode = String(body.member_code || '').trim();
    const typeLabel = String(body.type_label || body.package_id || 'Paiement');
    const paymentType = String(body.payment_type || 'cotisation');
    const amountInput = Number(body.amount);
    const currency = String(body.currency || 'USD').toUpperCase();

    if(!['stripe','paypal','moncash'].includes(provider)) return res.status(400).json({ error: 'Provider non pris en charge' });
    if(!memberCode || !allowedAmount(amountInput)) return res.status(400).json({ error: 'Montant ou membre invalide' });
    if(!verifyMemberAccess(req, memberCode)) return res.status(403).json({ error: 'Accès membre refusé' });

    const db = readDb();
    const member = assertMemberExists(db, memberCode);
    if(!member) return res.status(404).json({ error: 'Membre introuvable' });

    const amountUsd = provider === 'moncash' && currency === 'HTG' ? usdFromHtg(amountInput) : round2(amountInput);
    const amountHtg = provider === 'moncash' ? (currency === 'HTG' ? round2(amountInput) : htgFromUsd(amountInput)) : null;
    const txRef = randomId(provider === 'paypal' ? 'PP' : provider === 'moncash' ? 'MC' : 'STR');

    createPendingPayment(db, {
      txRef,
      provider,
      method,
      memberCode: member.code,
      memberName: member.nom,
      amount: provider === 'moncash' ? amountHtg : amountUsd,
      amountUsd,
      amountHtg,
      currency: provider === 'moncash' ? 'HTG' : 'USD',
      paymentType,
      typeLabel,
      paypalEmail: member.email || '',
      phone: member.phone || ''
    });

    if(provider === 'stripe'){
      if(!isStripeConfigured() || !stripe) return res.status(501).json({ error: 'Stripe non configuré' });
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: member.email || undefined,
        success_url: buildAppUrl(RETURN_PATHS.stripe, { payment_success: 'true', provider: 'stripe', session_id: '{CHECKOUT_SESSION_ID}', tx_ref: txRef }),
        cancel_url: buildAppUrl(RETURN_PATHS.stripe, { payment_cancelled: 'true', provider: 'stripe', tx_ref: txRef }),
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'usd',
            product_data: { name: typeLabel, description: `MHAH ${paymentType}` },
            unit_amount: Math.round(amountUsd * 100)
          }
        }],
        metadata: {
          tx_ref: txRef,
          member_code: member.code,
          member_name: member.nom,
          payment_type: paymentType,
          method,
          type_label: typeLabel
        }
      });
      return res.json({ provider, url: session.url, session_id: session.id, tx_ref: txRef });
    }

    if(provider === 'paypal'){
      if(!isPayPalConfigured()) return res.status(501).json({ error: 'PayPal non configuré' });
      const accessToken = await getPayPalAccessToken();
      const createResponse = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            reference_id: txRef,
            custom_id: txRef,
            invoice_id: txRef,
            description: typeLabel,
            amount: { currency_code: 'USD', value: amountUsd.toFixed(2) }
          }],
          application_context: {
            brand_name: 'MHAH',
            user_action: 'PAY_NOW',
            return_url: buildAppUrl(RETURN_PATHS.paypal, { payment_success: 'true', provider: 'paypal', tx_ref: txRef }),
            cancel_url: buildAppUrl(RETURN_PATHS.paypal, { payment_cancelled: 'true', provider: 'paypal', tx_ref: txRef })
          }
        })
      });
      const orderData = await safeJson(createResponse);
      if(!createResponse.ok) return res.status(502).json({ error: orderData.message || 'Création commande PayPal impossible' });
      const approve = (orderData.links || []).find((item) => item.rel === 'approve');
      if(!approve || !approve.href) return res.status(502).json({ error: 'URL PayPal introuvable' });
      return res.json({ provider, url: approve.href, order_id: orderData.id, tx_ref: txRef });
    }

    if(!isMonCashConfigured()) return res.status(501).json({ error: 'MonCash non configuré' });
    const moncash = await createMonCashHostedPayment(txRef, amountHtg);
    return res.json({
      provider,
      url: moncash.url,
      tx_ref: txRef,
      order_id: txRef,
      amount_htg: amountHtg,
      amount_usd: amountUsd,
      payment_token: moncash.paymentToken
    });
  } catch(err){
    console.error('payment create error', err);
    res.status(500).json({ error: err.message || 'Erreur création paiement' });
  }
});

app.post('/api/payments/verify-return', authRequired, async (req, res) => {
  try {
    const provider = String(req.body.provider || 'stripe').toLowerCase();
    const txRef = String(req.body.tx_ref || req.body.order_id || '');
    if(!txRef) return res.status(400).json({ error: 'tx_ref requis' });

    if(provider === 'stripe'){
      if(!isStripeConfigured() || !stripe) return res.status(501).json({ error: 'Stripe non configuré' });
      const sessionId = String(req.body.session_id || '');
      if(!sessionId) return res.status(400).json({ error: 'session_id requis' });
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if(session.payment_status !== 'paid') return res.status(400).json({ error: 'Paiement Stripe non payé' });
      const snapshot = recordSuccessfulCardPayment(txRef, { sessionId, note: 'Stripe Checkout confirmé' });
      return res.json({ ok: true, snapshot });
    }

    if(provider === 'paypal'){
      if(!isPayPalConfigured()) return res.status(501).json({ error: 'PayPal non configuré' });
      const orderId = String(req.body.order_id || req.body.token || '');
      if(!orderId) return res.status(400).json({ error: 'order_id requis' });
      const captureData = await capturePayPalOrder(orderId);
      const status = captureData.status || (((captureData.purchase_units || [])[0] || {}).payments || {}).captures?.[0]?.status;
      if(status !== 'COMPLETED') return res.status(400).json({ error: 'Paiement PayPal non complété' });
      const snapshot = recordSuccessfulCardPayment(txRef, { orderId, note: 'PayPal capturé' });
      return res.json({ ok: true, snapshot });
    }

    if(provider === 'moncash'){
      if(!isMonCashConfigured()) return res.status(501).json({ error: 'MonCash non configuré' });
      const transactionId = String(req.body.transaction_id || req.body.transactionId || '');
      const orderId = String(req.body.order_id || req.body.orderId || txRef);
      const payment = await retrieveMonCashPayment({ orderId, transactionId });
      const success = String(payment.message || '').toLowerCase() === 'successful' || Number(payment.transaction_id || 0) > 0;
      if(!success) return res.status(400).json({ error: 'Paiement MonCash non confirmé' });
      const snapshot = recordSuccessfulMonCashPayment(orderId, {
        transactionId: payment.transaction_id || transactionId,
        reference: payment.reference || orderId,
        amountHtg: Number(payment.cost || 0),
        payer: payment.payer || '',
        note: payment.message || 'MonCash validé'
      });
      return res.json({ ok: true, snapshot });
    }

    return res.status(400).json({ error: 'Provider de vérification invalide' });
  } catch(err){
    console.error('payment verify error', err);
    res.status(500).json({ error: err.message || 'Erreur vérification paiement' });
  }
});

async function stripeWebhookHandler(req, res){
  try {
    if(!isStripeConfigured() || !looksConfigured(STRIPE_WEBHOOK_SECRET) || !stripe) return res.status(400).send('Stripe webhook non configuré');
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    const db = readDb();
    db.webhooks.push({ provider: 'stripe', eventId: event.id, type: event.type, receivedAt: nowIso() });
    writeDb(db);
    if(event.type === 'checkout.session.completed'){
      const session = event.data.object;
      const txRef = session.metadata && session.metadata.tx_ref;
      if(txRef) recordSuccessfulCardPayment(txRef, { sessionId: session.id, note: 'Stripe webhook' });
    }
    res.json({ received: true });
  } catch(err){
    console.error('Stripe webhook error', err);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
}

app.post('/api/webhooks/paypal', async (req, res) => {
  try {
    if(!isPayPalConfigured() || !looksConfigured(PAYPAL_WEBHOOK_ID)) return res.status(400).json({ error: 'Webhook PayPal non configuré' });
    const event = req.body;
    const ok = await verifyPayPalWebhook(req.headers, event);
    if(!ok) return res.status(400).json({ error: 'Signature PayPal invalide' });
    const db = readDb();
    db.webhooks.push({ provider: 'paypal', eventId: event.id, type: event.event_type, receivedAt: nowIso() });
    writeDb(db);
    if(event.event_type === 'PAYMENT.CAPTURE.COMPLETED'){
      const txRef = event.resource && event.resource.custom_id;
      if(txRef) recordSuccessfulCardPayment(txRef, { orderId: event.resource?.supplementary_data?.related_ids?.order_id || '', note: 'PayPal webhook' });
    }
    res.json({ received: true });
  } catch(err){
    console.error('PayPal webhook error', err);
    res.status(500).json({ error: err.message || 'Erreur webhook PayPal' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

seedDb();
normalizeDb();
app.listen(PORT, () => {
  console.log(`MHAH server running on ${APP_BASE_URL}`);
});
