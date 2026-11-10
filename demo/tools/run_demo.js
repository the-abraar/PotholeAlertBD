'use strict';
// Driven by make_demo_data.sh: node run_demo.js <workdir> <demo dir>. Env: PORT, ADMIN_TOKEN, AUTH_TOKEN, DB_PATH.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const [WORK, DEMO] = process.argv.slice(2);
const sharp = require(path.join(WORK, 'backend/node_modules/sharp'));
const { shoot } = require('./cdp');

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const ADMIN = { 'x-admin-token': process.env.ADMIN_TOKEN };
const AUTH = { 'x-authority-token': process.env.AUTH_TOKEN };
const DNCC = 'ঢাকা উত্তর সিটি কর্পোরেশন (DNCC)';

let seed = 20261110; // fixed seed: the same points and photos every run
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const inBox = ([lng0, lat0, lng1, lat1]) => ({ lat: +(lat0 + rnd() * (lat1 - lat0)).toFixed(5), lng: +(lng0 + rnd() * (lng1 - lng0)).toFixed(5) });

// Synthetic road surface: noise asphalt, a lane marking, a pothole (or a patch for the "after" photo). No people, vehicles or plates.
function roadSvg(fixed) {
  const cx = 200 + rnd() * 240, cy = 180 + rnd() * 160, rx = 50 + rnd() * 60, ry = 30 + rnd() * 40, rot = Math.round(rnd() * 60 - 30);
  const hole = fixed
    ? `<rect x="${cx - rx - 20}" y="${cy - ry - 15}" width="${2 * rx + 40}" height="${2 * ry + 30}" fill="#3b3b3d" transform="rotate(${rot} ${cx} ${cy})"/>`
    : `<ellipse cx="${cx}" cy="${cy}" rx="${rx + 8}" ry="${ry + 6}" fill="#6d6b66" transform="rotate(${rot} ${cx} ${cy})"/>
       <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#262422" transform="rotate(${rot} ${cx} ${cy})"/>
       <ellipse cx="${cx + 6}" cy="${cy + 4}" rx="${rx * 0.6}" ry="${ry * 0.45}" fill="#4a5560" opacity=".7" transform="rotate(${rot} ${cx} ${cy})"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
    <filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${Math.floor(rnd() * 999)}"/><feColorMatrix values="0 0 0 0 .35 0 0 0 0 .35 0 0 0 0 .36 0 0 0 .55 0"/></filter>
    <rect width="640" height="480" fill="#56565a"/><rect width="640" height="480" filter="url(#n)"/>
    <path d="M320 0 V480" stroke="#e8e2c8" stroke-width="10" stroke-dasharray="60 50" opacity=".8"/>${hole}</svg>`);
}
const jpeg = (fixed) => sharp(roadSvg(fixed)).jpeg({ quality: 80 }).toBuffer();

async function api(method, url, headers = {}, body) {
  const r = await fetch(BASE + url, { method, headers, body });
  return { status: r.status, json: await r.json().catch(() => null) };
}

(async () => {
  const boxes = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(WORK, 'backend/src/data/jurisdictions.json'))).features
    .map((f) => { const c = f.geometry.coordinates[0]; return [f.properties.key, [c[0][0], c[0][1], c[2][0], c[2][1]]]; }));
  const plan = [];
  for (let i = 0; i < 13; i++) plan.push({ ...inBox(boxes.dncc), roadType: i % 4 === 3 ? 'residential' : 'city_road' });
  for (let i = 0; i < 6; i++) plan.push({ ...inBox(boxes.dscc), roadType: 'city_road' });
  for (let i = 0; i < 3; i++) plan.push({ ...inBox(boxes.ccc), roadType: 'city_road' });
  plan.push({ lat: 23.6201, lng: 90.5502, roadType: 'national_highway' }, { lat: 24.0417, lng: 90.3963, roadType: 'national_highway' });
  for (let i = plan.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [plan[i], plan[j]] = [plan[j], plan[i]]; } // mix areas so the rate limit hits all of them
  plan.splice(2, 0, { lat: +(plan[0].lat + 0.0001).toFixed(5), lng: plan[0].lng, roadType: plan[0].roadType, dupOf: 1 }); // ~11 m from #1
  plan[4].contactName = 'Synthetic Reporter'; plan[4].contactPhone = '01700000000';

  const submissions = [];
  for (const [i, p] of plan.entries()) {
    const fd = new FormData();
    fd.append('photo', new Blob([await jpeg(false)], { type: 'image/jpeg' }), 'road.jpg');
    for (const k of ['lat', 'lng', 'roadType', 'contactName', 'contactPhone']) if (p[k] !== undefined) fd.append(k, String(p[k]));
    fd.append('severity', ['low', 'medium', 'high'][i % 3]);
    fd.append('description', `Synthetic demo report #${i + 1}`);
    const r = await api('POST', '/api/reports', {}, fd);
    submissions.push({ n: i + 1, lat: p.lat, lng: p.lng, roadType: p.roadType, http: r.status, id: r.json && r.json.id, status: r.json && r.json.status, duplicate: !!(r.json && r.json.duplicate), dupOf: p.dupOf, error: r.status >= 400 ? r.json && r.json.error : undefined });
  }
  const saved = submissions.filter((s) => s.http === 201);
  const publicAfterSubmit = (await api('GET', '/api/reports?limit=200')).json.length;

  // Admin review: approve all but the last two held reports, reject one, leave one in the queue.
  const held = (await api('GET', '/api/reports/admin/all?limit=200', ADMIN)).json.filter((r) => r.status === 'hidden');
  const contactInAdmin = held.some((r) => r.contactName === 'Synthetic Reporter');
  const order = saved.map((s) => s.id);
  const [toReject, toKeep] = order.slice(-2);
  for (const id of order.slice(0, -2)) await api('POST', `/api/reports/${id}/unhide`, ADMIN);
  await api('PATCH', `/api/reports/${toReject}/status`, { ...ADMIN, 'content-type': 'application/json' }, JSON.stringify({ status: 'rejected' }));

  // The scripted authority (DNCC placeholder box): 3 to in_progress, then 2 of them resolved with an after photo.
  const inbox = (await api('GET', '/api/authority/reports', AUTH)).json;
  const authorityActs = [];
  const patch = async (id, status, photo) => {
    const fd = new FormData(); fd.append('status', status);
    if (photo) fd.append('photo', new Blob([await jpeg(true)], { type: 'image/jpeg' }), 'after.jpg');
    const r = await api('PATCH', `/api/authority/reports/${id}`, AUTH, fd);
    authorityActs.push({ id, to: status, http: r.status, error: r.status >= 400 ? r.json && r.json.error : undefined });
  };
  const picks = inbox.slice(-3).map((r) => r.id);
  await patch(picks[0], 'resolved'); // refused: no after photo
  for (const id of picks) await patch(id, 'in_progress');
  for (const id of picks.slice(0, 2)) await patch(id, 'resolved', true);

  const digests = JSON.parse(execFileSync('node', ['scripts/manage.js', 'digest', '--dry-run'], { cwd: path.join(WORK, 'backend'), env: process.env }));
  const reports = (await api('GET', '/api/reports?limit=200')).json;
  const stats = (await api('GET', '/api/stats')).json;
  const audit = (await api('GET', '/api/reports/admin/audit?limit=200', ADMIN)).json;
  const publicKeys = [...new Set(reports.flatMap(Object.keys))];

  const lifecycle = {
    generatedAt: new Date().toISOString(),
    synthetic: true,
    env: { PHOTO_REVIEW: '1', REPORT_LIMIT_PER_HOUR: 'unset (default 20)', SMTP: 'unset', digest: '--dry-run' },
    submissions,
    counts: {
      posted: submissions.length,
      created: saved.length,
      duplicates: submissions.filter((s) => s.duplicate).length,
      rateLimited: submissions.filter((s) => s.http === 429).length,
      publicAfterSubmit,
      heldForReview: held.length,
      approved: order.length - 2,
      rejected: 1,
      stillHeld: 1,
      authorityInbox: inbox.length,
      publicFinal: reports.length,
      emailsSent: 0,
    },
    privacy: { contactInAdminView: contactInAdmin, contactKeysInPublicJson: publicKeys.filter((k) => /contact/i.test(k)) },
    authorityActs,
    held: { rejectedId: toReject, stillHeldId: toKeep },
  };

  const data = path.join(DEMO, 'data'), img = path.join(DEMO, 'img');
  fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(img, { recursive: true });
  const write = (f, v) => fs.writeFileSync(path.join(data, f), typeof v === 'string' ? v : JSON.stringify(v, null, 2) + '\n');
  write('reports.json', reports); write('stats.json', stats); write('lifecycle.json', lifecycle);
  write('audit.json', audit.map(({ at, actor, action, report_id, detail }) => ({ at, actor, action, reportId: report_id, detail })));
  write('digest.txt', digests.map((d) => `To: ${d.to}\nSubject: PotholeAlertBD: ${d.count} open reports\n\n${d.text}\n`).join('\n---\n'));

  // Thumbnails inline so index.html stays one file.
  const thumbs = {};
  for (const r of reports) for (const u of [r.photoUrl, r.afterPhotoUrl].filter(Boolean)) {
    const buf = Buffer.from(await (await fetch(BASE + u)).arrayBuffer());
    thumbs[u] = 'data:image/jpeg;base64,' + (await sharp(buf).resize(240).jpeg({ quality: 60 }).toBuffer()).toString('base64');
  }
  const block = JSON.stringify({ reports, stats, lifecycle, digest: fs.readFileSync(path.join(data, 'digest.txt'), 'utf8'), boxes, thumbs }).replace(/</g, '\\u003c');
  const page = path.join(DEMO, 'index.html');
  const html = fs.readFileSync(page, 'utf8');
  const re = /(<script id="demo-data" type="application\/json">)[\s\S]*?(<\/script>)/;
  if (!re.test(html)) throw new Error('demo-data block not found in index.html');
  fs.writeFileSync(page, html.replace(re, (_, a, b) => a + block + b));

  await shoot(`${BASE}/admin.html`, { adminToken: process.env.ADMIN_TOKEN }, path.join(img, 'admin.jpg'));
  await shoot(`${BASE}/authority.html`, { authToken: process.env.AUTH_TOKEN }, path.join(img, 'authority.jpg'));
  console.log(JSON.stringify(lifecycle.counts));
})().catch((e) => { console.error(e); process.exit(1); });
