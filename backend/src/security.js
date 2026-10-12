'use strict';

const crypto = require('crypto');

// shortcut: in-memory per-process limiter; use a shared store (redis) if you run >1 instance.
// IPv4 as-is; IPv6 (and v4-mapped) collapsed to its /64 so rotating within a prefix can't evade limits.
function ipKey(ip) {
  ip = String(ip || '').split('%')[0].toLowerCase();
  const m = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return m[1];
  if (!ip.includes(':')) return ip;
  const [head, tail] = ip.split('::');
  const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return groups.slice(0, 4).map((g) => parseInt(g || '0', 16).toString(16)).join(':') + '::/64';
}

// TRUST_PROXY: hop count 0-10 or loopback|linklocal|uniquelocal. Returns the value for app.set, or undefined if unset.
function parseTrustProxy(v = process.env.TRUST_PROXY) {
  if (v === undefined || v === '') return undefined;
  if (/^\d{1,2}$/.test(v) && Number(v) <= 10) return Number(v);
  if (['loopback', 'linklocal', 'uniquelocal'].includes(v)) return v;
  throw new Error('TRUST_PROXY must be an integer 0-10 or one of loopback|linklocal|uniquelocal');
}

function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const n = (hits.get(ipKey(req.ip)) || 0) + 1;
    hits.set(ipKey(req.ip), n);
    if (n > max) return res.status(429).json({ error: 'too many requests' });
    next();
  };
}

function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'cross-origin', // app/web clients load /uploads
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
  });
  next();
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Applied to every x-admin-token route: 30 req/min per IP, plus 10 failed auths / 15 min per IP.
const adminRate = rateLimit({ windowMs: 60_000, max: 30 });
const FAIL_MAX = 10, FAIL_WINDOW = 15 * 60_000;
const fails = new Map(); // key -> { n, reset }
setInterval(() => { const now = Date.now(); for (const [k, v] of fails) if (v.reset <= now) fails.delete(k); }, 60_000).unref();

function requireAdmin(req, res, next) {
  adminRate(req, res, () => {
    const key = ipKey(req.ip), now = Date.now();
    let f = fails.get(key);
    if (!f || f.reset <= now) { f = { n: 0, reset: now + FAIL_WINDOW }; fails.delete(key); }
    if (f.n >= FAIL_MAX) return res.status(429).json({ error: 'too many failed attempts' });
    const expected = process.env.ADMIN_TOKEN;
    const token = req.header('x-admin-token');
    if (!expected || !token || !safeEqual(token, expected)) {
      f.n++; fails.set(key, f);
      return res.status(401).json({ error: 'unauthorized' });
    }
    next();
  });
}

const BAD_TOKENS = ['', 'changeme', 'admin', 'password', 'secret', 'test'];
function assertProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  const t = process.env.ADMIN_TOKEN;
  if (!t || t.length < 16 || BAD_TOKENS.includes(t.toLowerCase()) || /^change-?me/i.test(t)) {
    throw new Error('ADMIN_TOKEN must be set to a random value (>=16 chars) in production');
  }
}

module.exports = { ipKey, parseTrustProxy, rateLimit, securityHeaders, requireAdmin, safeEqual, assertProductionConfig };
