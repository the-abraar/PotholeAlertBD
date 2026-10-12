'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

const db = require('../db');
const { requireAdmin, ipKey } = require('../security');
const { detectDivision, resolveAuthority, ROAD_TYPE_LABELS } = require('../authorities');
const { sendReportEmail } = require('../mailer');

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 10, fieldSize: 4096 },
});

// Extension comes from magic bytes, never from the client filename or mimetype.
function sniffImageExt(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return null;
}

// Duplicate detection: same road type within this radius and window => merged into the existing report.
const DUP_RADIUS_M = Number(process.env.DUP_RADIUS_M) || 30;
const DUP_WINDOW_MS = (Number(process.env.DUP_WINDOW_HOURS) || 24) * 3600_000;
// Distinct IPs that must flag a report before it is auto-hidden.
const FLAG_HIDE_THRESHOLD = 3;
const MAX_INPUT_PIXELS = 40e6; // sharp default is ~268MP; decompression-bomb guard
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

function serializeReport(row) {
  return {
    id: row.id,
    photoUrl: `/uploads/${row.photo_filename}`,
    lat: row.lat,
    lng: row.lng,
    divisionKey: row.division_key,
    divisionName: row.division_name,
    roadType: row.road_type,
    roadTypeLabel: ROAD_TYPE_LABELS[row.road_type] || row.road_type,
    placeNote: row.place_note,
    severity: row.severity,
    description: row.description,
    authorityName: row.authority_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeAdminReport(row) {
  return { ...serializeReport(row), contactName: row.contact_name, contactPhone: row.contact_phone };
}

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
    const ext = sniffImageExt(req.file.buffer);
    if (!ext) return res.status(400).json({ error: 'শুধুমাত্র JPEG/PNG/WebP ছবি' });
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

    let photo;
    try { photo = await sharp(req.file.buffer, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().toBuffer(); } // rotate() bakes in EXIF orientation; output carries no metadata (EXIF/GPS)
    catch (e) {
      if (/pixel limit/i.test(e.message)) return res.status(413).json({ error: 'ছবির রেজোলিউশন খুব বেশি (image too large)' });
      return res.status(400).json({ error: 'ছবি পড়া যায়নি (invalid image)' });
    }

    const division = detectDivision(latNum, lngNum);
    const authority = resolveAuthority(roadType, latNum, lngNum);

    const id = uuidv4();
    const filename = `${uuidv4()}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), photo);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO reports (
        id, photo_filename, lat, lng, division_key, division_name,
        road_type, place_note, severity, description,
        contact_name, contact_phone, authority_name, status, created_at, updated_at
      ) VALUES (@id, @photo_filename, @lat, @lng, @division_key, @division_name,
        @road_type, @place_note, @severity, @description,
        @contact_name, @contact_phone, @authority_name, @status, @created_at, @updated_at)
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
    });

    // Attempt to forward. Never blocks the response on failure.
    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    forwardToAuthority(row).catch(() => {});

    return res.status(201).json(serializeReport(row));
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
  res.json(serializeAdminReport(db.prepare('SELECT * FROM reports WHERE id = ?').get(row.id)));
});

// DELETE /api/reports/:id  (admin) removes row, flags and photo
router.delete('/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'পাওয়া যায়নি' });
  db.prepare('DELETE FROM flags WHERE report_id = ?').run(row.id);
  db.prepare('DELETE FROM reports WHERE id = ?').run(row.id);
  fs.rmSync(path.join(UPLOAD_DIR, path.basename(row.photo_filename)), { force: true });
  res.status(204).end();
});

module.exports = router;
