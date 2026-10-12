'use strict';

const express = require('express');
const db = require('../db');
const { DIVISIONS } = require('../authorities');

const router = express.Router();

// GET /api/stats — overview + per-division counts, mirroring ghush.site's
// division map + ledger stats.
router.get('/', (req, res) => {
  const total = db.prepare("SELECT COUNT(*) AS c FROM reports WHERE status != 'hidden'").get().c;
  const resolved = db.prepare("SELECT COUNT(*) AS c FROM reports WHERE status = 'resolved'").get().c;
  const forwarded = db.prepare("SELECT COUNT(*) AS c FROM reports WHERE status IN ('forwarded','queued_for_authority')").get().c;

  const byDivisionRows = db.prepare(`
    SELECT division_key AS key, division_name AS name, COUNT(*) AS count
    FROM reports
    WHERE division_key IS NOT NULL AND status != 'hidden'
    GROUP BY division_key
  `).all();

  const byDivision = DIVISIONS.map((d) => {
    const found = byDivisionRows.find((r) => r.key === d.key);
    return { key: d.key, name: d.name, count: found ? found.count : 0 };
  });

  const byRoadType = db.prepare(`
    SELECT road_type AS roadType, COUNT(*) AS count
    FROM reports WHERE status != 'hidden' GROUP BY road_type
  `).all();

  const bySeverity = db.prepare(`
    SELECT severity, COUNT(*) AS count FROM reports WHERE status != 'hidden' GROUP BY severity
  `).all();

  res.json({
    total,
    resolved,
    forwarded,
    resolvedRate: total ? Math.round((resolved / total) * 1000) / 10 : 0,
    byDivision,
    byRoadType,
    bySeverity,
  });
});

module.exports = router;
