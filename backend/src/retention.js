'use strict';

const db = require('./db');
const { audit } = require('./security');

// Erases reporter name and phone from reports older than `days`; the report itself stays public data.
// CONTACT_RETENTION_DAYS must be a positive number; empty, junk, zero or negative falls back to 90 (a negative value would erase everything).
function retentionDays(v = process.env.CONTACT_RETENTION_DAYS) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 90;
}

function purgeContacts(days = retentionDays()) {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const { changes } = db.prepare(`UPDATE reports SET contact_name = NULL, contact_phone = NULL
    WHERE created_at < ? AND (contact_name IS NOT NULL OR contact_phone IS NOT NULL)`).run(cutoff);
  if (changes) audit('system', 'purge_contacts', null, { days, reports: Number(changes) });
  return Number(changes);
}

module.exports = { purgeContacts, retentionDays };
