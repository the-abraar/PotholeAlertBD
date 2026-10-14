'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');

const { rateLimit, securityHeaders, parseTrustProxy } = require('./security');
const reportsRouter = require('./routes/reports');
const statsRouter = require('./routes/stats');
const authorityRouter = require('./routes/authority');

const app = express();
app.disable('x-powered-by');
const trustProxy = parseTrustProxy(); // validated at startup; needed behind a reverse proxy so req.ip is the client
if (trustProxy !== undefined) app.set('trust proxy', trustProxy);
app.use(securityHeaders);
// CORS_ORIGINS: comma-separated allow-list; unset => no CORS headers (same-origin only).
const origins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : false, exposedHeaders: ['X-Total-Count'] }));
app.use(express.json({ limit: '10kb' }));
app.use('/uploads', express.static(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'), { setHeaders: (r) => r.set('Content-Disposition', 'inline') }));
app.use(express.static(path.join(__dirname, '..', 'public'))); // admin panel
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'privacy.html')));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/', rateLimit({ name: 'api', windowMs: 60_000, max: 300 }));
// Per-IP submission cap, separate from the global /api limit above.
app.post('/api/reports', rateLimit({ name: 'submit', windowMs: 60 * 60_000, max: Number(process.env.REPORT_LIMIT_PER_HOUR) || 20 }));
app.post('/api/reports/:id/flag', rateLimit({ name: 'flag', windowMs: 60 * 60_000, max: 10 }));
app.post('/api/reports/:id/erase-contact', rateLimit({ name: 'erase', windowMs: 60 * 60_000, max: 10 }));
// admin limits (30/min + failed-auth cap) live in requireAdmin, so they cover every admin route.
app.use('/api/reports', reportsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/authority', authorityRouter);

// JSON error handler (bad JSON, oversize body)
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: 'request error' }));

module.exports = app;
