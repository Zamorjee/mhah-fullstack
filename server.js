require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-now';
const HTG_RATE = Number(process.env.HTG_RATE || 132);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Supabase configuration missing. Please set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runSupabaseQuery(query, label) {
  const { data, error } = await query;
  if (error) {
    console.error(`Supabase ${label} failed:`, error);
    throw error;
  }
  return data;
}

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
const RETURN_PATHS = { stripe: '/payment-return/stripe', paypal: '/payment-return/paypal', moncash: '/payment-return/moncash' };

// ========== FONCTIONS BASE DE DONNÉES ==========

async function getAdmins() {
  const { data, error } = await supabase.from('admins').select('*');
  if (error) throw error;
  return data.reduce((acc, admin) => {
    acc[admin.role] = { passwordHash: admin.password_hash, name: admin.name };
    return acc;
  }, {});
}

async function getMembers() {
  const { data, error } = await supabase.from('members').select('*');
  if (error) throw error;
  return data.map(member => ({
    code: member.code,
    nom: member.nom,
    dob: member.dob,
    birthPlace: member.birth_place,
    cin: member.cin,
    email: member.email,
    phone: member.phone,
    address: member.address,
    dept: member.dept,
    commune: member.commune,
    status: member.status,
    passwordHash: member.password_hash,
    dateJoined: member.date_joined,
    profession: member.profession,
    sexe: member.sexe,
    notes: member.notes
  }));
}

async function getPayments() {
  const { data, error } = await supabase.from('payments').select('*');
  if (error) throw error;
  return data.map(payment => ({
    id: payment.id,
    memberCode: payment.member_code,
    amount: payment.amount,
    date: payment.date,
    type: payment.type,
    note: payment.note
  }));
}

async function getChats() {
  const { data, error } = await supabase.from('chats').select('*');
  if (error) throw error;
  return data.map(chat => ({
    id: chat.id,
    ch: chat.ch,
    scope: chat.scope,
    user: chat.username,
    role: chat.role,
    msg: chat.msg,
    time: chat.time
  }));
}

async function getRequests() {
  const { data, error } = await supabase.from('requests').select('*');
  if (error) throw error;
  return data;
}

async function getMoncash() {
  const { data, error } = await supabase.from('moncash').select('*');
  if (error) throw error;
  return data.map(item => ({
    id: item.id,
    memberCode: item.member_code,
    phone: item.phone,
    amount: item.amount,
    type: item.type,
    status: item.status,
    date: item.date,
    note: item.note,
    ref: item.ref,
    orderId: item.order_id,
    payer: item.payer
  }));
}

async function getZelle() {
  const { data, error } = await supabase.from('zelle').select('*');
  if (error) throw error;
  return data.map(item => ({
    id: item.id,
    memberCode: item.member_code,
    amount: item.amount,
    type: item.type,
    status: item.status,
    date: item.date,
    note: item.note,
    ref: item.ref,
    senderName: item.sender_name,
    senderBank: item.sender_bank
  }));
}

async function getCards() {
  const { data, error } = await supabase.from('cards').select('*');
  if (error) throw error;
  return data.map(item => ({
    id: item.id,
    memberCode: item.member_code,
    amount: item.amount,
    type: item.type,
    method: item.method,
    status: item.status,
    date: item.date,
    note: item.note,
    ref: item.ref,
    cardLast4: item.card_last4,
    cardHolder: item.card_holder,
    sessionId: item.session_id,
    orderId: item.order_id,
    paypalEmail: item.paypal_email
  }));
}

async function getPendingPayments() {
  const { data, error } = await supabase.from('pending_payments').select('*');
  if (error) throw error;
  return data.reduce((acc, payment) => {
    acc[payment.tx_ref] = {
      txRef: payment.tx_ref,
      provider: payment.provider,
      method: payment.method,
      memberCode: payment.member_code,
      memberName: payment.member_name,
      amount: payment.amount,
      amountUsd: payment.amount_usd,
      amountHtg: payment.amount_htg,
      currency: payment.currency,
      paymentType: payment.payment_type,
      typeLabel: payment.type_label,
      paypalEmail: payment.paypal_email,
      phone: payment.phone,
      createdAt: payment.created_at,
      status: payment.status
    };
    return acc;
  }, {});
}

async function getWebhooks() {
  const { data, error } = await supabase.from('webhooks').select('*');
  if (error) throw error;
  return data.map(webhook => ({
    provider: webhook.provider,
    eventId: webhook.event_id,
    type: webhook.type,
    receivedAt: webhook.received_at
  }));
}

async function readDb() {
  try {
    const [admins, members, payments, chats, requests, moncash, zelle, cards, pendingPayments, webhooks] = await Promise.all([
      getAdmins(),
      getMembers(),
      getPayments(),
      getChats(),
      getRequests(),
      getMoncash(),
      getZelle(),
      getCards(),
      getPendingPayments(),
      getWebhooks()
    ]);
    return {
      admins,
      members,
      payments,
      chats,
      requests,
      moncash,
      zelle,
      cards,
      pendingPayments,
      webhooks
    };
  } catch (error) {
    console.error('Error reading from database:', error);
    throw error;
  }
}

async function writeDb(db) {
  try {
    // Update admins
    if (db.admins) {
      await supabase.from('admins').delete().neq('role', '');
      const adminsData = Object.entries(db.admins).map(([role, admin]) => ({
        role,
        password_hash: admin.passwordHash,
        name: admin.name
      }));
      if (adminsData.length > 0) {
        await supabase.from('admins').insert(adminsData);
      }
    }

    // Update members
    if (db.members) {
      await runSupabaseQuery(supabase.from('members').delete().neq('code', ''), 'delete members');
      const membersData = db.members.map(member => ({
        code: member.code,
        nom: member.nom,
        dob: member.dob,
        birth_place: member.birthPlace,
        cin: member.cin,
        email: member.email,
        phone: member.phone,
        address: member.address,
        dept: member.dept,
        commune: member.commune,
        status: member.status,
        password_hash: member.passwordHash,
        date_joined: member.dateJoined,
        profession: member.profession,
        sexe: member.sexe,
        notes: member.notes
      }));
      if (membersData.length > 0) {
        await runSupabaseQuery(supabase.from('members').insert(membersData), 'insert members');
      }
    }

    // Update payments
    if (db.payments && db.payments.length > 0) {
      await supabase.from('payments').delete().neq('id', 0);
      await supabase.from('payments').insert(db.payments.map(payment => ({
        id: payment.id,
        member_code: payment.memberCode,
        amount: payment.amount,
        date: payment.date,
        type: payment.type,
        note: payment.note
      })));
    }

    // Update chats
    if (db.chats && db.chats.length > 0) {
      await runSupabaseQuery(supabase.from('chats').delete().neq('id', 0), 'delete chats');
      await runSupabaseQuery(supabase.from('chats').insert(db.chats.map(chat => ({
        id: chat.id,
        ch: chat.ch,
        scope: chat.scope,
        username: chat.user,
        role: chat.role,
        msg: chat.msg,
        time: chat.time
      }))), 'insert chats');
    }

    // Update requests
    if (db.requests && db.requests.length > 0) {
      await runSupabaseQuery(supabase.from('requests').delete().neq('id', ''), 'delete requests');
      await runSupabaseQuery(supabase.from('requests').insert(db.requests), 'insert requests');
    }

    // Update moncash
    if (db.moncash && db.moncash.length > 0) {
      await runSupabaseQuery(supabase.from('moncash').delete().neq('id', ''), 'delete moncash');
      await runSupabaseQuery(supabase.from('moncash').insert(db.moncash.map(item => ({
        id: item.id,
        member_code: item.memberCode,
        phone: item.phone,
        amount: item.amount,
        type: item.type,
        status: item.status,
        date: item.date,
        note: item.note,
        ref: item.ref,
        order_id: item.orderId,
        payer: item.payer
      }))), 'insert moncash');
    }

    // Update zelle
    if (db.zelle && db.zelle.length > 0) {
      await runSupabaseQuery(supabase.from('zelle').delete().neq('id', ''), 'delete zelle');
      await runSupabaseQuery(supabase.from('zelle').insert(db.zelle.map(item => ({
        id: item.id,
        member_code: item.memberCode,
        amount: item.amount,
        type: item.type,
        status: item.status,
        date: item.date,
        note: item.note,
        ref: item.ref,
        sender_name: item.senderName,
        sender_bank: item.senderBank
      }))), 'insert zelle');
    }

    // Update cards
    if (db.cards && db.cards.length > 0) {
      await runSupabaseQuery(supabase.from('cards').delete().neq('id', ''), 'delete cards');
      await runSupabaseQuery(supabase.from('cards').insert(db.cards.map(item => ({
        id: item.id,
        member_code: item.memberCode,
        amount: item.amount,
        type: item.type,
        method: item.method,
        status: item.status,
        date: item.date,
        note: item.note,
        ref: item.ref,
        card_last4: item.cardLast4,
        card_holder: item.cardHolder,
        session_id: item.sessionId,
        order_id: item.orderId,
        paypal_email: item.paypalEmail
      })));
    }

    // Update pending payments
    if (db.pendingPayments && Object.keys(db.pendingPayments).length > 0) {
      await runSupabaseQuery(supabase.from('pending_payments').delete().neq('tx_ref', ''), 'delete pending_payments');
      const pendingData = Object.values(db.pendingPayments).map(payment => ({
        tx_ref: payment.txRef,
        provider: payment.provider,
        method: payment.method,
        member_code: payment.memberCode,
        member_name: payment.memberName,
        amount: payment.amount,
        amount_usd: payment.amountUsd,
        amount_htg: payment.amountHtg,
        currency: payment.currency,
        payment_type: payment.paymentType,
        type_label: payment.typeLabel,
        paypal_email: payment.paypalEmail,
        phone: payment.phone,
        created_at: payment.createdAt,
        status: payment.status
      }));
      if (pendingData.length > 0) {
        await supabase.from('pending_payments').insert(pendingData);
      }
    }

    // Update webhooks
    if (db.webhooks && db.webhooks.length > 0) {
      await runSupabaseQuery(supabase.from('webhooks').delete().neq('event_id', ''), 'delete webhooks');
      await runSupabaseQuery(supabase.from('webhooks').insert(db.webhooks.map(webhook => ({
        provider: webhook.provider,
        event_id: webhook.eventId,
        type: webhook.type,
        received_at: webhook.receivedAt
      }))), 'insert webhooks');
    }
  } catch (error) {
    console.error('Error writing to database:', error);
    throw error;
  }
}

// ========== FONCTIONS UTILITAIRES ==========

function buildAppUrl(pathname, params) {
  const baseUrl = APP_BASE_URL.endsWith('/') ? APP_BASE_URL.slice(0, -1) : APP_BASE_URL;
  const url = new URL(pathname, baseUrl + '/');
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function nowIso() { return new Date().toISOString(); }
function randomId(prefix) { return `${prefix}${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`.toUpperCase(); }
function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function round2(value) { return Math.round((Number(value) || 0) * 100) / 100; }
function htgFromUsd(usd) { return round2((Number(usd) || 0) * HTG_RATE); }
function usdFromHtg(htg) { return round2((Number(htg) || 0) / HTG_RATE); }
function looksConfigured(value) { return !!value && !String(value).startsWith('your_') && !String(value).startsWith('change-'); }
function isStripeConfigured() { return looksConfigured(STRIPE_SECRET_KEY); }
function isPayPalConfigured() { return looksConfigured(PAYPAL_CLIENT_ID) && looksConfigured(PAYPAL_CLIENT_SECRET); }
function isMonCashConfigured() { return looksConfigured(MONCASH_CLIENT_ID) && looksConfigured(MONCASH_CLIENT_SECRET); }
function paymentTypeLabelFromProvider(provider) { return provider === 'paypal' ? 'PayPal' : provider === 'moncash' ? 'MonCash' : 'Stripe'; }

function hashIfNeeded(value) {
  if (!value) return '';
  return value.startsWith('$2') ? value : bcrypt.hashSync(value, 10);
}

function sanitizeMembers(members) {
  return members.map((member) => {
    const clean = Object.assign({}, member);
    delete clean.passwordHash;
    delete clean.password_hash;
    delete clean.password;
    return clean;
  });
}

function signSession(session) {
  return jwt.sign(session, JWT_SECRET, { expiresIn: '7d' });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Session requise' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session invalide' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.type !== 'admin') return res.status(403).json({ error: 'Accès admin requis' });
  next();
}

function assertMemberExists(db, code) {
  return (db.members || []).find((m) => String(m.code).toLowerCase() === String(code || '').toLowerCase());
}

function allowedAmount(amount) {
  return Number.isFinite(amount) && amount > 0 && amount <= 1000000;
}

function verifyMemberAccess(req, memberCode) {
  if (req.user.type === 'admin') return true;
  return req.user.code === memberCode;
}

function pushGeneralPayment(db, payment) {
  db.payments.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    memberCode: payment.memberCode,
    amount: round2(payment.amount),
    date: new Date().toISOString().split('T')[0],
    type: payment.type,
    note: payment.note || ''
  });
}

async function createPendingPayment(db, cfg) {
  db.pendingPayments[cfg.txRef] = Object.assign({
    createdAt: nowIso(),
    status: 'pending'
  }, cfg);
  await writeDb(db);
  return db.pendingPayments[cfg.txRef];
}

async function recordSuccessfulCardPayment(txRef, details) {
  const db = await readDb();
  const pending = db.pendingPayments[txRef];
  if (!pending) return await buildSnapshot();
  
  const already = (db.cards || []).some((item) => item.ref === txRef || (details.sessionId && item.sessionId === details.sessionId) || (details.orderId && item.orderId === details.orderId));
  
  if (!already) {
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
    if (pending.method === 'paypal' && pending.paypalEmail) cardTx.paypalEmail = pending.paypalEmail;
    db.cards.push(cardTx);
    pushGeneralPayment(db, {
      memberCode: pending.memberCode,
      amount: pending.amountUsd || pending.amount,
      type: pending.method === 'paypal' ? 'PayPal' : 'Stripe',
      note: `${pending.typeLabel} ${String(pending.method || '').toUpperCase()}`
    });
  }
  delete db.pendingPayments[txRef];
  await writeDb(db);
  return await buildSnapshot();
}

async function recordSuccessfulMonCashPayment(txRef, details) {
  const db = await readDb();
  const pending = db.pendingPayments[txRef];
  if (!pending) return await buildSnapshot();
  
  const transactionId = String(details.transactionId || details.reference || txRef);
  const already = (db.moncash || []).some((item) => item.ref === transactionId || item.orderId === txRef);
  
  if (!already) {
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
  await writeDb(db);
  return await buildSnapshot();
}

async function sanitizeIncomingMembers(currentMembers, incomingMembers) {
  const currentMap = new Map(currentMembers.map((item) => [item.code, item]));
  return (incomingMembers || []).map((item) => {
    const previous = currentMap.get(item.code) || {};
    const clean = Object.assign({}, previous, item);
    if (!clean.passwordHash && item.password_hash) clean.passwordHash = item.password_hash;
    if (item.password) clean.passwordHash = hashIfNeeded(item.password);
    delete clean.password;
    delete clean.password_hash;
    return clean;
  });
}

async function safeJson(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  const text = await response.text();
  try { return JSON.parse(text); } catch (err) { return { raw: text }; }
}

async function getPayPalAccessToken() {
  if (!isPayPalConfigured()) throw new Error('PayPal non configuré');
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
  if (!response.ok) throw new Error(data.error_description || data.error || 'Token PayPal impossible');
  return data.access_token;
}

async function getPayPalOrder(orderId) {
  const token = await getPayPalAccessToken();
  const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await safeJson(response);
  if (!response.ok) throw new Error(data.message || 'Lecture commande PayPal impossible');
  return { token, order: data };
}

async function capturePayPalOrder(orderId) {
  const { token } = await getPayPalOrder(orderId);
  const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  const data = await safeJson(response);
  if (!response.ok) throw new Error(data.message || 'Capture PayPal impossible');
  return data;
}

async function verifyPayPalWebhook(headers, body) {
  if (!looksConfigured(PAYPAL_WEBHOOK_ID)) return false;
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

async function getMonCashAccessToken() {
  if (!isMonCashConfigured()) throw new Error('MonCash non configuré');
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
  if (!response.ok) throw new Error(data.message || data.error || 'Token MonCash impossible');
  return data.access_token;
}

async function createMonCashHostedPayment(orderId, amountHtg) {
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
  if (!response.ok) throw new Error(data.message || data.error || 'Création paiement MonCash impossible');
  const paymentToken = data.payment_token && data.payment_token.token;
  if (!paymentToken) throw new Error('Token MonCash introuvable');
  return {
    url: `${MONCASH_GATEWAY_BASE}/Payment/Redirect?token=${encodeURIComponent(paymentToken)}`,
    paymentToken,
    raw: data
  };
}

async function retrieveMonCashPayment({ orderId, transactionId }) {
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
  if (!response.ok) throw new Error(data.message || data.error || 'Vérification MonCash impossible');
  return data.payment || {};
}

async function buildSnapshot() {
  try {
    const [admins, members, payments, chats, requests, moncash, zelle, cards, pendingPayments, webhooks] = await Promise.all([
      getAdmins(),
      getMembers(),
      getPayments(),
      getChats(),
      getRequests(),
      getMoncash(),
      getZelle(),
      getCards(),
      getPendingPayments(),
      getWebhooks()
    ]);

    return {
      admins,
      members,
      payments,
      chats,
      requests,
      moncash,
      zelle,
      cards,
      pendingPayments,
      webhooks
    };
  } catch (error) {
    console.error('Error building snapshot:', error);
    return {
      admins: {},
      members: [],
      payments: [],
      chats: [],
      requests: [],
      moncash: [],
      zelle: [],
      cards: [],
      pendingPayments: {},
      webhooks: []
    };
  }
}

async function seedDb() {
  try {
    const { data: existingAdmins } = await supabase.from('admins').select('role').limit(1);
    if (existingAdmins && existingAdmins.length > 0) return;

    const adminsData = [
      { role: 'national', password_hash: hashIfNeeded('admin2026'), name: 'Admin National' },
      { role: 'artibonite', password_hash: hashIfNeeded('arti2026'), name: 'Admin Artibonite' },
      { role: 'centre', password_hash: hashIfNeeded('cent2026'), name: 'Admin Centre' },
      { role: 'grandanse', password_hash: hashIfNeeded('gran2026'), name: "Admin Grand'Anse" },
      { role: 'nippes', password_hash: hashIfNeeded('nipp2026'), name: 'Admin Nippes' },
      { role: 'nord', password_hash: hashIfNeeded('nord2026'), name: 'Admin Nord' },
      { role: 'nordest', password_hash: hashIfNeeded('nest2026'), name: 'Admin Nord-Est' },
      { role: 'nordouest', password_hash: hashIfNeeded('noue2026'), name: 'Admin Nord-Ouest' },
      { role: 'ouest', password_hash: hashIfNeeded('oues2026'), name: 'Admin Ouest' },
      { role: 'sud', password_hash: hashIfNeeded('sud_2026'), name: 'Admin Sud' },
      { role: 'sudest', password_hash: hashIfNeeded('sest2026'), name: 'Admin Sud-Est' }
    ];

    const membersData = [
      { code: 'MHAH2024-JEAN01-OUST', nom: 'Jean Pierre', dob: '1985-03-15', birth_place: 'Port-au-Prince', cin: '04-01-85-0001', email: 'jean@email.com', phone: '+50937001234', address: 'Pétion-Ville', dept: 'Ouest', commune: 'Pétion-Ville', status: 'Fondateur', password_hash: hashIfNeeded('password'), date_joined: '2024-01-15', profession: 'Ingénieur', sexe: 'Masculin', notes: '' },
      { code: 'MHAH2024-MARI02-NORD', nom: 'Marie Claire', dob: '1990-07-22', birth_place: 'Cap-Haïtien', cin: '03-02-90-0034', email: 'marie@email.com', phone: '+50938002345', address: 'Cap-Haïtien', dept: 'Nord', commune: 'Cap-Haïtien', status: "d'honneur", password_hash: hashIfNeeded('password'), date_joined: '2024-02-20', profession: 'Médecin', sexe: 'Féminin', notes: '' },
      { code: 'MHAH2024-PAUL03-ARTI', nom: 'Paul Antoine', dob: '1988-11-05', birth_place: 'Gonaïves', cin: '01-03-88-0078', email: 'paul@email.com', phone: '+50936003456', address: 'Gonaïves', dept: 'Artibonite', commune: 'Gonaïves', status: 'Adhérent', password_hash: hashIfNeeded('password'), date_joined: '2024-03-10', profession: 'Agriculteur', sexe: 'Masculin', notes: '' },
      { code: 'MHAH2024-ROSE04-SUD_', nom: 'Rose Angèle', dob: '1992-05-18', birth_place: 'Les Cayes', cin: '09-04-92-0012', email: 'rose@email.com', phone: '+50939004567', address: 'Les Cayes', dept: 'Sud', commune: 'Les Cayes', status: 'Fondateur', password_hash: hashIfNeeded('password'), date_joined: '2024-04-05', profession: 'Avocate', sexe: 'Féminin', notes: '' },
      { code: 'MHAH2024-ALEX05-CENT', nom: 'Alex Beaumont', dob: '1987-09-30', birth_place: 'Hinche', cin: '02-05-87-0056', email: 'alex@email.com', phone: '+50934005678', address: 'Hinche', dept: 'Centre', commune: 'Hinche', status: "d'honneur", password_hash: hashIfNeeded('password'), date_joined: '2024-05-12', profession: 'Comptable', sexe: 'Masculin', notes: '' },
      { code: 'MHAH2024-SOPH06-OUST', nom: 'Sophie Delatour', dob: '1995-01-20', birth_place: 'Delmas', cin: '04-06-95-0090', email: 'sophie@email.com', phone: '+50933006789', address: 'Delmas', dept: 'Ouest', commune: 'Delmas', status: 'Adhérent', password_hash: hashIfNeeded('password'), date_joined: '2024-06-01', profession: 'Enseignante', sexe: 'Féminin', notes: '' }
    ];

    const paymentsData = [
      { id: 1, member_code: 'MHAH2024-JEAN01-OUST', amount: 100, date: '2024-06-01', type: 'Cotisation', note: 'Annuel' },
      { id: 2, member_code: 'MHAH2024-MARI02-NORD', amount: 50, date: '2024-07-15', type: 'Don', note: 'Vol.' }
    ];

    const chatsData = [
      { id: 1, ch: 'general', scope: 'national', username: 'Admin National', role: 'admin', msg: 'Bienvenue à tous les membres MHAH! 🇭🇹', time: new Date('2024-09-01T10:00:00Z').toISOString() },
      { id: 2, ch: 'dept_Ouest', scope: 'Ouest', username: 'Admin Ouest', role: 'admin', msg: 'Message pour les membres de l\'Ouest uniquement', time: new Date('2024-09-02T11:00:00Z').toISOString() },
      { id: 3, ch: 'annonces', scope: 'national', username: 'Admin National', role: 'admin', msg: '📢 Prochaine réunion le 15 octobre', time: new Date('2024-09-03T09:00:00Z').toISOString() }
    ];

    const moncashData = [
      { id: 'MC1A', member_code: 'MHAH2024-JEAN01-OUST', phone: '+50937001234', amount: 500, type: 'Mensuelle', status: 'completed', date: '2024-08-01T14:30:00Z', note: '', ref: 'TXN1' }
    ];

    const zelleData = [
      { id: 'ZL1A', member_code: 'MHAH2024-JEAN01-OUST', amount: 25, type: 'Mensuelle', status: 'completed', date: '2024-08-10T11:00:00Z', note: '', ref: 'ZR1', sender_name: 'Jean Pierre', sender_bank: 'Chase' }
    ];

    const cardsData = [
      { id: 'CB1A', member_code: 'MHAH2024-MARI02-NORD', amount: 50, type: 'Don', method: 'visa', status: 'completed', date: '2024-09-01T10:00:00Z', note: '', card_last4: '4242', card_holder: 'Marie Claire', ref: 'CBREF1' },
      { id: 'CB2B', member_code: 'MHAH2024-JEAN01-OUST', amount: 25, type: 'Mensuelle', method: 'paypal', status: 'completed', date: '2024-09-15T14:00:00Z', note: '', card_last4: '', card_holder: '', ref: 'PP1', paypal_email: 'jean@email.com' }
    ];

    await Promise.all([
      supabase.from('admins').insert(adminsData),
      supabase.from('members').insert(membersData),
      supabase.from('payments').insert(paymentsData),
      supabase.from('chats').insert(chatsData),
      supabase.from('moncash').insert(moncashData),
      supabase.from('zelle').insert(zelleData),
      supabase.from('cards').insert(cardsData)
    ]);

    console.log('Database seeded successfully');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

async function normalizeDb() {
  try {
    const { data: admins, error: adminsError } = await supabase.from('admins').select('*');
    if (adminsError) throw adminsError;

    const { data: members, error: membersError } = await supabase.from('members').select('*');
    if (membersError) throw membersError;

    let changed = false;

    for (const admin of admins || []) {
      if (admin.password && !admin.password_hash) {
        await supabase.from('admins').update({
          password_hash: hashIfNeeded(admin.password)
        }).eq('role', admin.role);
        changed = true;
      }
      if (admin.password_hash && !admin.password_hash.startsWith('$2')) {
        await supabase.from('admins').update({
          password_hash: hashIfNeeded(admin.password_hash)
        }).eq('role', admin.role);
        changed = true;
      }
    }

    for (const member of members || []) {
      if (member.password && !member.password_hash) {
        await supabase.from('members').update({
          password_hash: hashIfNeeded(member.password)
        }).eq('code', member.code);
        changed = true;
      }
      if (member.password_hash && !member.password_hash.startsWith('$2')) {
        await supabase.from('members').update({
          password_hash: hashIfNeeded(member.password_hash)
        }).eq('code', member.code);
        changed = true;
      }
    }

    if (changed) {
      console.log('Database normalized successfully');
    }
  } catch (error) {
    console.error('Error normalizing database:', error);
  }
}

// ========== ROUTES ==========

// Middleware
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// Routes API
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
  try {
    const code = String(req.body.code || '').trim();
    const password = String(req.body.password || '');
    if (!code || !password) return res.status(400).json({ error: 'Code et mot de passe requis' });
    
    const { data: members, error } = await supabase.from('members').select('*').eq('code', code).limit(1);
    if (error) throw error;
    
    const member = members && members.length > 0 ? members[0] : null;
    if (!member) return res.status(404).json({ error: 'Code introuvable' });
    
    const ok = member.password_hash ? await bcrypt.compare(password, member.password_hash) : password === member.password;
    if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });
    
    const session = { type: 'member', role: 'member', code: member.code, name: member.nom };
    const snapshot = await buildSnapshot();
    res.json({ token: signSession(session), session, snapshot });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erreur de connexion' });
  }
});

app.post('/api/auth/admin/login', async (req, res) => {
  try {
    const role = String(req.body.role || '').trim();
    const password = String(req.body.password || '');
    
    const { data: admins, error } = await supabase.from('admins').select('*').eq('role', role).limit(1);
    if (error) throw error;
    
    const admin = admins && admins.length > 0 ? admins[0] : null;
    if (!admin) return res.status(404).json({ error: 'Rôle admin inconnu' });
    
    const ok = admin.password_hash ? await bcrypt.compare(password, admin.password_hash) : password === admin.password;
    if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });
    
    const session = { type: 'admin', role, name: admin.name || `Admin ${role}` };
    const snapshot = await buildSnapshot();
    res.json({ token: signSession(session), session, snapshot });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Erreur de connexion' });
  }
});

app.get('/api/session', authRequired, async (req, res) => {
  try {
    const snapshot = await buildSnapshot();
    res.json({ session: req.user, snapshot });
  } catch (error) {
    console.error('Session error:', error);
    res.status(500).json({ error: 'Erreur de session' });
  }
});

app.post('/api/member/change-password', authRequired, async (req, res) => {
  if (req.user.type !== 'member') return res.status(403).json({ error: 'Réservé aux membres' });
  
  const { oldPassword, newPassword, confirmPassword } = req.body || {};
  if (!oldPassword || !newPassword || !confirmPassword) return res.status(400).json({ error: 'Champs requis' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'Mot de passe trop court' });
  if (newPassword !== confirmPassword) return res.status(400).json({ error: 'Confirmation différente' });
  
  const db = await readDb();
  const member = assertMemberExists(db, req.user.code);
  if (!member) return res.status(404).json({ error: 'Membre introuvable' });
  
  const ok = await bcrypt.compare(oldPassword, member.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Ancien mot de passe invalide' });
  
  member.passwordHash = await bcrypt.hash(newPassword, 10);
  await writeDb(db);
  res.json({ ok: true });
});

app.post('/api/data/snapshot', authRequired, requireAdmin, async (req, res) => {
  const snapshot = req.body.snapshot || {};
  const db = await readDb();
  
  if (Array.isArray(snapshot.members)) db.members = await sanitizeIncomingMembers(db.members, snapshot.members);
  if (Array.isArray(snapshot.payments)) db.payments = snapshot.payments;
  if (Array.isArray(snapshot.chats)) db.chats = snapshot.chats;
  if (Array.isArray(snapshot.requests)) db.requests = snapshot.requests;
  if (Array.isArray(snapshot.moncash)) db.moncash = snapshot.moncash;
  if (Array.isArray(snapshot.zelle)) db.zelle = snapshot.zelle;
  if (Array.isArray(snapshot.cards)) db.cards = snapshot.cards;
  
  await writeDb(db);
  const newSnapshot = await buildSnapshot();
  res.json({ ok: true, snapshot: newSnapshot });
});

app.post('/api/payments/manual', authRequired, async (req, res) => {
  const body = req.body || {};
  const provider = String(body.provider || '');
  const status = String(body.status || 'pending');
  const memberCode = String(body.memberCode || '').trim();
  const amount = Number(body.amount);
  const type = String(body.type || 'Autre');
  
  if (!['moncash', 'zelle'].includes(provider)) return res.status(400).json({ error: 'Provider manuel invalide' });
  if (!['pending', 'completed'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  if (!memberCode || !allowedAmount(amount)) return res.status(400).json({ error: 'Montant ou code invalide' });
  if (!verifyMemberAccess(req, memberCode)) return res.status(403).json({ error: 'Accès membre refusé' });
  
  const db = await readDb();
  const member = assertMemberExists(db, memberCode);
  if (!member) return res.status(404).json({ error: 'Membre introuvable' });
  
  if (provider === 'moncash') {
    const tx = { id: randomId('MC'), memberCode, phone: String(body.phone || member.phone || ''), amount: round2(amount), type, status, date: nowIso(), note: '', ref: String(body.ref || randomId('TXN')) };
    db.moncash.push(tx);
    if (status === 'completed') pushGeneralPayment(db, { memberCode, amount: usdFromHtg(amount), type: 'MonCash', note: `${type} ${round2(amount).toLocaleString('fr-FR')} HTG` });
  } else {
    const tx = { id: randomId('ZL'), memberCode, amount: round2(amount), type, status, date: nowIso(), note: '', ref: String(body.ref || randomId('ZR')), senderName: String(body.senderName || member.nom), senderBank: String(body.senderBank || '') };
    db.zelle.push(tx);
    if (status === 'completed') pushGeneralPayment(db, { memberCode, amount, type: 'Zelle', note: `${type} $${round2(amount)}` });
  }
  
  await writeDb(db);
  const snapshot = await buildSnapshot();
  res.json({ ok: true, snapshot });
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

    if (!['stripe', 'paypal', 'moncash'].includes(provider)) return res.status(400).json({ error: 'Provider non pris en charge' });
    if (!memberCode || !allowedAmount(amountInput)) return res.status(400).json({ error: 'Montant ou membre invalide' });
    if (!verifyMemberAccess(req, memberCode)) return res.status(403).json({ error: 'Accès membre refusé' });

    const db = await readDb();
    const member = assertMemberExists(db, memberCode);
    if (!member) return res.status(404).json({ error: 'Membre introuvable' });

    const amountUsd = provider === 'moncash' && currency === 'HTG' ? usdFromHtg(amountInput) : round2(amountInput);
    const amountHtg = provider === 'moncash' ? (currency === 'HTG' ? round2(amountInput) : htgFromUsd(amountInput)) : null;
    const txRef = randomId(provider === 'paypal' ? 'PP' : provider === 'moncash' ? 'MC' : 'STR');

    await createPendingPayment(db, {
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

    if (provider === 'stripe') {
      if (!isStripeConfigured() || !stripe) return res.status(501).json({ error: 'Stripe non configuré' });
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

    if (provider === 'paypal') {
      if (!isPayPalConfigured()) return res.status(501).json({ error: 'PayPal non configuré' });
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
      if (!createResponse.ok) return res.status(502).json({ error: orderData.message || 'Création commande PayPal impossible' });
      const approve = (orderData.links || []).find((item) => item.rel === 'approve');
      if (!approve || !approve.href) return res.status(502).json({ error: 'URL PayPal introuvable' });
      return res.json({ provider, url: approve.href, order_id: orderData.id, tx_ref: txRef });
    }

    if (!isMonCashConfigured()) return res.status(501).json({ error: 'MonCash non configuré' });
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
  } catch (err) {
    console.error('payment create error', err);
    res.status(500).json({ error: err.message || 'Erreur création paiement' });
  }
});

app.post('/api/payments/verify-return', authRequired, async (req, res) => {
  try {
    const provider = String(req.body.provider || 'stripe').toLowerCase();
    const txRef = String(req.body.tx_ref || req.body.order_id || '');
    if (!txRef) return res.status(400).json({ error: 'tx_ref requis' });

    if (provider === 'stripe') {
      if (!isStripeConfigured() || !stripe) return res.status(501).json({ error: 'Stripe non configuré' });
      const sessionId = String(req.body.session_id || '');
      if (!sessionId) return res.status(400).json({ error: 'session_id requis' });
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== 'paid') return res.status(400).json({ error: 'Paiement Stripe non payé' });
      const snapshot = await recordSuccessfulCardPayment(txRef, { sessionId, note: 'Stripe Checkout confirmé' });
      return res.json({ ok: true, snapshot });
    }

    if (provider === 'paypal') {
      if (!isPayPalConfigured()) return res.status(501).json({ error: 'PayPal non configuré' });
      const orderId = String(req.body.order_id || req.body.token || '');
      if (!orderId) return res.status(400).json({ error: 'order_id requis' });
      const captureData = await capturePayPalOrder(orderId);
      const status = captureData.status || (((captureData.purchase_units || [])[0] || {}).payments || {}).captures?.[0]?.status;
      if (status !== 'COMPLETED') return res.status(400).json({ error: 'Paiement PayPal non complété' });
      const snapshot = await recordSuccessfulCardPayment(txRef, { orderId, note: 'PayPal capturé' });
      return res.json({ ok: true, snapshot });
    }

    if (provider === 'moncash') {
      if (!isMonCashConfigured()) return res.status(501).json({ error: 'MonCash non configuré' });
      const transactionId = String(req.body.transaction_id || req.body.transactionId || '');
      const orderId = String(req.body.order_id || req.body.orderId || txRef);
      const payment = await retrieveMonCashPayment({ orderId, transactionId });
      const success = String(payment.message || '').toLowerCase() === 'successful' || Number(payment.transaction_id || 0) > 0;
      if (!success) return res.status(400).json({ error: 'Paiement MonCash non confirmé' });
      const snapshot = await recordSuccessfulMonCashPayment(orderId, {
        transactionId: payment.transaction_id || transactionId,
        reference: payment.reference || orderId,
        amountHtg: Number(payment.cost || 0),
        payer: payment.payer || '',
        note: payment.message || 'MonCash validé'
      });
      return res.json({ ok: true, snapshot });
    }

    return res.status(400).json({ error: 'Provider de vérification invalide' });
  } catch (err) {
    console.error('payment verify error', err);
    res.status(500).json({ error: err.message || 'Erreur vérification paiement' });
  }
});

async function stripeWebhookHandler(req, res) {
  try {
    if (!isStripeConfigured() || !looksConfigured(STRIPE_WEBHOOK_SECRET) || !stripe) return res.status(400).send('Stripe webhook non configuré');
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    const db = await readDb();
    db.webhooks.push({ provider: 'stripe', eventId: event.id, type: event.type, receivedAt: nowIso() });
    await writeDb(db);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const txRef = session.metadata && session.metadata.tx_ref;
      if (txRef) await recordSuccessfulCardPayment(txRef, { sessionId: session.id, note: 'Stripe webhook' });
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error', err);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
}

app.post('/api/webhooks/paypal', async (req, res) => {
  try {
    if (!isPayPalConfigured() || !looksConfigured(PAYPAL_WEBHOOK_ID)) return res.status(400).json({ error: 'Webhook PayPal non configuré' });
    const event = req.body;
    const ok = await verifyPayPalWebhook(req.headers, event);
    if (!ok) return res.status(400).json({ error: 'Signature PayPal invalide' });
    const db = await readDb();
    db.webhooks.push({ provider: 'paypal', eventId: event.id, type: event.event_type, receivedAt: nowIso() });
    await writeDb(db);
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const txRef = event.resource && event.resource.custom_id;
      if (txRef) await recordSuccessfulCardPayment(txRef, { orderId: event.resource?.supplementary_data?.related_ids?.order_id || '', note: 'PayPal webhook' });
    }
    res.json({ received: true });
  } catch (err) {
    console.error('PayPal webhook error', err);
    res.status(500).json({ error: err.message || 'Erreur webhook PayPal' });
  }
});

// SPA fallback - doit être après toutes les routes API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Démarrage du serveur
(async () => {
  try {
    await seedDb();
    await normalizeDb();
    
    // Appliquer le middleware webhook après la définition de la fonction
    app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);
    
    app.listen(PORT, () => {
      console.log(`MHAH server running on ${APP_BASE_URL}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();