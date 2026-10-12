'use strict';

const express = require('express');

const db = require('../db');
const { requireAuthority, audit } = require('../security');
const { upload, savePhoto, removePhotos } = require('../photos');
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
    const saved = await savePhoto(req.file.buffer);
    if (saved.error) return res.status(saved.status).json({ error: saved.error });
    removePhotos(after);
    after = saved.filename;
  }
  db.prepare('UPDATE reports SET status = ?, after_photo_filename = ?, updated_at = ? WHERE id = ?')
    .run(status, after, new Date().toISOString(), row.id);
  audit(`authority:${req.authority.name}`, 'set_status', row.id, { from: row.status, to: status });
  res.json(serializeReport(db.prepare('SELECT * FROM reports WHERE id = ?').get(row.id)));
});

module.exports = router;
