'use strict';

const db = require('./db');
const { ROAD_TYPE_LABELS } = require('./authorities');
const { sendReportEmail } = require('./mailer');

const OPEN = ['new', 'queued_for_authority', 'forwarded', 'in_progress'];

// One digest per authority token that has an email: its open reports, newest first, with the last 24h counted.
function buildDigests(base = process.env.PUBLIC_URL || '') {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const tokens = db.prepare('SELECT DISTINCT authority_name, email FROM authority_tokens WHERE email IS NOT NULL').all();
  return tokens.map(({ authority_name, email }) => {
    const rows = db.prepare(`SELECT * FROM reports WHERE authority_name = ? AND status IN (${OPEN.map(() => '?').join(',')})
      ORDER BY created_at DESC LIMIT 50`).all(authority_name, ...OPEN);
    const fresh = rows.filter((r) => r.created_at >= since).length;
    const lines = rows.map((r) => `- ${r.status} | ${ROAD_TYPE_LABELS[r.road_type] || r.road_type} | ${r.lat},${r.lng} | ${base}/uploads/${r.photo_filename}`);
    return { to: email, authority: authority_name, count: rows.length, text: `${authority_name}: ${rows.length} open reports (${fresh} new in 24h)\n\n${lines.join('\n')}` };
  }).filter((d) => d.count > 0);
}

async function sendDigests() {
  const out = [];
  for (const d of buildDigests()) {
    const r = await sendReportEmail({ to: d.to, subject: `PotholeAlertBD: ${d.count} open reports`, text: d.text });
    out.push({ authority: d.authority, sent: r.sent, reason: r.reason });
  }
  return out;
}

module.exports = { buildDigests, sendDigests };
