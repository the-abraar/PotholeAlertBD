'use strict';

const express = require('express');

const db = require('../db');
const { requireAuthority, audit } = require('../security');
const photos = require('../photos'); // savePhoto via the module so a test can stub it
const { upload, removePhotos } = photos;
const { serializeReport } = require('../serialize');

const router = express.Router();
router.use(requireAuthority);

// An authority sees only its own reports, never contact fields, never hidden ones.
router.get('/reports', (req, res) => {
  const rows = db.prepare("SELECT * FROM reports WHERE authority_name = ? AND status != 'hidden' ORDER BY created_at DESC LIMIT 200")
    .all(req.authority.name);
  res.json(rows.map(serializeReport));
});

// PATCH /api/authority/reports/:id  multipart: status=in_progress|resolved, photo=after photo (required to resolve)
router.patch('/reports/:id', (req, res, next) => upload.single('photo')(req, res, (err) => {
  if (err) return res.status(400).json({ error: 'invalid upload' });
  next();
}), async (req, res) => {
  const { status } = req.body;
  if (!['in_progress', 'resolved'].includes(status)) return res.status(400).json({ error: 'status must be in_progress or resolved' });
  const row = db.prepare("SELECT * FROM reports WHERE id = ? AND authority_name = ? AND status NOT IN ('hidden','flagged')")
    .get(req.params.id, req.authority.name);
  if (!row) return res.status(404).json({ error: 'পাওয়া যায়নি' });
  if (status === 'resolved' && !req.file && !row.after_photo_filename) return res.status(400).json({ error: 'after photo is required to resolve' });

  let after = row.after_photo_filename;
  if (req.file) {
    const saved = await photos.savePhoto(req.file.buffer, { requireBlur: true }); // after photos are public at once: no unblurred fallback
    if (saved.error) return res.status(saved.status).json({ error: saved.error });
    after = saved.filename;
  }
  // Compare-and-set: savePhoto awaits, so an admin may hide/flag the report (or another call change it) meanwhile.
  const { changes } = db.prepare('UPDATE reports SET status = ?, after_photo_filename = ?, updated_at = ? WHERE id = ? AND status = ? AND after_photo_filename IS ?')
    .run(status, after, new Date().toISOString(), row.id, row.status, row.after_photo_filename);
  if (!changes) {
    if (after !== row.after_photo_filename) removePhotos(after);
    return res.status(409).json({ error: 'report changed, reload and retry' });
  }
  if (after !== row.after_photo_filename) removePhotos(row.after_photo_filename);
  audit(`authority:${req.authority.name}`, 'set_status', row.id, { from: row.status, to: status });
  res.json(serializeReport(db.prepare('SELECT * FROM reports WHERE id = ?').get(row.id)));
});

module.exports = router;
