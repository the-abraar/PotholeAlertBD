'use strict';

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const db = require('../db');
const { requireAdmin, ipKey, audit, sha256, safeEqual, newToken, listTokens, rotateToken, revokeToken } = require('../security');
const { UPLOAD_DIR, upload, savePhoto, removePhotos } = require('../photos');
const { serializeReport, serializeAdminReport } = require('../serialize');
const { detectDivision, resolveAuthority, ROAD_TYPE_LABELS } = require('../authorities');
const { sendReportEmail } = require('../mailer');

const router = express.Router();

// Duplicate detection: same road type within this radius and window => merged into the existing report.
const DUP_RADIUS_M = Number(process.env.DUP_RADIUS_M) || 30;
const DUP_WINDOW_MS = (Number(process.env.DUP_WINDOW_HOURS) || 24) * 3600_000;
// Distinct IPs that must flag a report before it is auto-hidden.
const FLAG_HIDE_THRESHOLD = 3;
const PAGE_DEFAULT = 50, PAGE_MAX = 200;

function page(q) {
  const n = (v, d) => (Number.isInteger(Number(v)) && Number(v) >= 0 && v !== '' && v !== undefined ? Number(v) : d);
  return { limit: Math.max(1, Math.min(PAGE_MAX, n(q.limit, PAGE_DEFAULT))), offset: n(q.offset, 0) };
}

function findDuplicate(lat, lng, roadType) {
  const dLat = DUP_RADIUS_M / 111_320, dLng = dLat / Math.cos(lat * Math.PI / 180);
  const since = new Date(Date.now() - DUP_WINDOW_MS).toISOString();
  const rows = db.prepare(`SELECT * FROM reports WHERE road_type = ? AND status != 'hidden' AND created_at >= ?
    AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? ORDER BY created_at DESC`)
    .all(roadType, since, lat - dLat, lat + dLat, lng - dLng, lng + dLng);
  // Box prefilter is a square; check true distance.
  return rows.find((r) => {
    const x = (r.lng - lng) * 111_320 * Math.cos(lat * Math.PI / 180), y = (r.lat - lat) * 111_320;
    return Math.hypot(x, y) <= DUP_RADIUS_M;
  });
}

// Bangladesh bounding box (generous).
const BD = { minLat: 20.5, maxLat: 26.7, minLng: 88.0, maxLng: 92.7 };
const MAX_LEN = { description: 1000, placeNote: 300, contactName: 100, contactPhone: 20 };

const VALID_ROAD_TYPES = Object.keys(ROAD_TYPE_LABELS);
const VALID_SEVERITIES = ['low', 'medium', 'high'];

// POST /api/reports  (multipart/form-data)
router.post('/', (req, res, next) => upload.single('photo')(req, res, (err) => {
  if (err) return res.status(400).json({ error: 'invalid upload' });
  next();
}), async (req, res) => {
  try {
    const { lat, lng, roadType, severity, description, placeNote, contactName, contactPhone } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'ছবি আবশ্যক (photo is required)' });
    }
    const latNum = lat === undefined || lat === '' ? NaN : Number(lat);
    const lngNum = lng === undefined || lng === '' ? NaN : Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return res.status(400).json({ error: 'সঠিক অবস্থান (lat/lng) আবশ্যক' });
    }
    if (latNum < BD.minLat || latNum > BD.maxLat || lngNum < BD.minLng || lngNum > BD.maxLng) {
      return res.status(400).json({ error: 'অবস্থান বাংলাদেশের বাইরে (outside Bangladesh)' });
    }
    for (const [k, max] of Object.entries(MAX_LEN)) {
      const v = req.body[k];
      if (v !== undefined && (typeof v !== 'string' || v.length > max)) {
        return res.status(400).json({ error: `${k} too long (max ${max})` });
      }
    }
    if (!VALID_ROAD_TYPES.includes(roadType)) {
      return res.status(400).json({ error: 'সঠিক রাস্তার ধরন নির্বাচন করুন' });
    }
    const sev = VALID_SEVERITIES.includes(severity) ? severity : 'medium';

    const dup = findDuplicate(latNum, lngNum, roadType);
    if (dup) return res.status(200).json({ ...serializeReport(dup), duplicate: true });

    const division = detectDivision(latNum, lngNum);
    const authority = resolveAuthority(roadType, latNum, lngNum);

    const saved = await savePhoto(req.file.buffer);
    if (saved.error) return res.status(saved.status).json({ error: saved.error });
    const filename = saved.filename;
    const id = uuidv4();
    const deletionCode = newToken(); // shown once; only its hash is stored
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO reports (
        id, photo_filename, lat, lng, division_key, division_name,
        road_type, place_note, severity, description,
        contact_name, contact_phone, authority_name, status, created_at, updated_at, erase_hash
      ) VALUES (@id, @photo_filename, @lat, @lng, @division_key, @division_name,
        @road_type, @place_note, @severity, @description,
        @contact_name, @contact_phone, @authority_name, @status, @created_at, @updated_at, @erase_hash)
    `).run({
      id,
      photo_filename: filename,
      lat: latNum,
      lng: lngNum,
      division_key: division ? division.key : null,
      division_name: division ? division.name : null,
      road_type: roadType,
      place_note: placeNote || null,
      severity: sev,
      description: description || null,
      contact_name: contactName || null,
      contact_phone: contactPhone || null,
      authority_name: authority.name,
      status: 'new',
      created_at: now,
      updated_at: now,
      erase_hash: sha256(deletionCode),
    });

    // Attempt to forward. Never blocks the response on failure.
    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    forwardToAuthority(row).catch(() => {});

    return res.status(201).json({ ...serializeReport(row), deletionCode });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'সার্ভার ত্রুটি (server error)' });
  }
});

async function forwardToAuthority(row) {
  const authority = resolveAuthority(row.road_type, row.lat, row.lng);
  const to = authority.contact && authority.contact.email;

  const subject = `নতুন গর্ত/রাস্তার ক্ষতির অভিযোগ — ${row.division_name || 'অজানা এলাকা'}`;
  const text = [
    `একটি নতুন রাস্তার গর্তের রিপোর্ট জমা পড়েছে।`,
    ``,
    `অবস্থান: ${row.lat}, ${row.lng}`,
    `বিভাগ: ${row.division_name || 'অজানা'}`,
    `রাস্তার ধরন: ${ROAD_TYPE_LABELS[row.road_type] || row.road_type}`,
    row.place_note ? `স্থান নোট: ${row.place_note}` : null,
    `তীব্রতা: ${row.severity}`,
    row.description ? `বিবরণ: ${row.description}` : null,
    ``,
    `রিপোর্ট আইডি: ${row.id}`,
  ].filter(Boolean).join('\n');

  const photoPath = path.join(UPLOAD_DIR, row.photo_filename);
  const result = await sendReportEmail({ to, subject, text, attachmentPath: photoPath });

  const newStatus = result.sent ? 'forwarded' : 'queued_for_authority';
  db.prepare("UPDATE reports SET status = ?, updated_at = ? WHERE id = ? AND status NOT IN ('hidden','flagged')")
    .run(newStatus, new Date().toISOString(), row.id);
}

// GET /api/reports?division=&roadType=&status=&sort=recent|amount_na
router.get('/', (req, res) => {
  const { division, roadType, status } = req.query;
  const clauses = ["status != 'hidden'"];
  const params = {};

  if (division) { clauses.push('division_key = @division'); params.division = division; }
  if (roadType) { clauses.push('road_type = @roadType'); params.roadType = roadType; }
  if (status) { clauses.push('status = @status'); params.status = status; }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { limit, offset } = page(req.query);
  res.set('X-Total-Count', String(db.prepare(`SELECT COUNT(*) c FROM reports ${where}`).get(params).c));
  const rows = db.prepare(`SELECT * FROM reports ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`).all(params);
  res.json(rows.map(serializeReport));
});

// GET /api/reports/admin/all  (admin only; includes contact fields)
router.get('/admin/all', requireAdmin, (req, res) => {
  const { status } = req.query;
  const { limit, offset } = page(req.query);
  const where = status ? 'WHERE status = @status' : '';
  const params = status ? { status: String(status) } : {};
  res.set('X-Total-Count', String(db.prepare(`SELECT COUNT(*) c FROM reports ${where}`).get(params).c));
  const rows = db.prepare(`SELECT * FROM reports ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`).all(params);
  res.json(rows.map(serializeAdminReport));
});

// GET /api/reports/admin/audit  (admin only) newest first
router.get('/admin/audit', requireAdmin, (req, res) => {
  const { limit, offset } = page(req.query);
  res.json(db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset));
});

// GET /api/reports/admin/tokens  (admin only) admins and authority tokens, never hashes
router.get('/admin/tokens', requireAdmin, (req, res) => res.json(listTokens()));

// POST /api/reports/admin/tokens/:kind/:ref/(rotate|revoke)  (admin only) kind = admin|authority; ref = admin name | authority token id
function tokenAction(act) {
  return (req, res) => {
    const { kind, ref } = req.params;
    if (!['admin', 'authority'].includes(kind)) return res.status(400).json({ error: 'kind must be admin or authority' });
    const r = kind === 'authority' ? Number(ref) : ref;
    const out = act === 'rotate' ? rotateToken(kind, r, req.actor) : revokeToken(kind, r, req.actor);
    if (!out) return res.status(404).json({ error: 'no such active token' });
    res.json(act === 'rotate' ? { token: out } : { ok: true });
  };
}
router.post('/admin/tokens/:kind/:ref/rotate', requireAdmin, tokenAction('rotate'));
router.post('/admin/tokens/:kind/:ref/revoke', requireAdmin, tokenAction('revoke'));

// POST /api/reports/:id/erase-contact  {code}  (public, authorised by the per-report deletion code; per-IP limited in app.js)
router.post('/:id/erase-contact', (req, res) => {
  const code = req.body && req.body.code;
  const row = db.prepare('SELECT erase_hash FROM reports WHERE id = ?').get(req.params.id);
  if (!row || typeof code !== 'string' || !row.erase_hash || !safeEqual(sha256(code), row.erase_hash)) {
    return res.status(403).json({ error: 'invalid code' });
  }
  db.prepare('UPDATE reports SET contact_name = NULL, contact_phone = NULL WHERE id = ?').run(req.params.id);
  audit('reporter', 'erase_contact', req.params.id);
  res.json({ ok: true });
});

// GET /api/reports/:id
router.get('/:id', (req, res) => {
  const row = db.prepare("SELECT * FROM reports WHERE id = ? AND status != 'hidden'").get(req.params.id);
  if (!row) return res.status(404).json({ error: 'পাওয়া যায়নি' });
  res.json(serializeReport(row));
});

// PATCH /api/reports/:id/status  (admin only)
router.patch('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const valid = ['new', 'queued_for_authority', 'forwarded', 'in_progress', 'resolved', 'rejected', 'hidden', 'flagged'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'অবৈধ status' });

  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'পাওয়া যায়নি' });

  db.prepare('UPDATE reports SET status = ?, pre_flag_status = NULL, updated_at = ? WHERE id = ?')
    .run(status, new Date().toISOString(), req.params.id);
  audit(req.actor, 'set_status', row.id, { from: row.status, to: status });

  res.json(serializeAdminReport(db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id)));
});

// POST /api/reports/:id/flag  (public; per-IP limited in app.js; one flag per IP per report)
router.post('/:id/flag', (req, res) => {
  const id = req.params.id;
  const row = db.prepare("SELECT status FROM reports WHERE id = ? AND status != 'hidden'").get(id);
  if (!row) return res.status(404).json({ error: 'পাওয়া যায়নি' });
  const now = new Date().toISOString();
  db.prepare('INSERT OR IGNORE INTO flags (report_id, ip, created_at) VALUES (?, ?, ?)').run(id, ipKey(req.ip), now);
  const flags = db.prepare('SELECT COUNT(*) c FROM flags WHERE report_id = ?').get(id).c;
  // Flags only moderate pre-moderation reports; admin/authority-set statuses are never overridden.
  let hidden = false;
  if (['new', 'queued_for_authority', 'flagged'].includes(row.status)) {
    hidden = flags >= FLAG_HIDE_THRESHOLD;
    db.prepare('UPDATE reports SET status = ?, pre_flag_status = COALESCE(pre_flag_status, ?), updated_at = ? WHERE id = ?')
      .run(hidden ? 'hidden' : 'flagged', row.status === 'flagged' ? null : row.status, now, id);
  }
  res.json({ flags, hidden });
});

// POST /api/reports/:id/unhide  (admin) clears flags, restores the pre-flag status (default 'new')
router.post('/:id/unhide', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT id, pre_flag_status FROM reports WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'পাওয়া যায়নি' });
  db.prepare('DELETE FROM flags WHERE report_id = ?').run(row.id);
  db.prepare('UPDATE reports SET status = ?, pre_flag_status = NULL, updated_at = ? WHERE id = ?').run(row.pre_flag_status || 'new', new Date().toISOString(), row.id);
  audit(req.actor, 'unhide', row.id);
  res.json(serializeAdminReport(db.prepare('SELECT * FROM reports WHERE id = ?').get(row.id)));
});

// DELETE /api/reports/:id  (admin) removes row, flags and photo
router.delete('/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'পাওয়া যায়নি' });
  db.prepare('DELETE FROM flags WHERE report_id = ?').run(row.id);
  db.prepare('DELETE FROM reports WHERE id = ?').run(row.id);
  removePhotos(row.photo_filename, row.after_photo_filename);
  audit(req.actor, 'delete', row.id);
  res.status(204).end();
});

module.exports = router;
