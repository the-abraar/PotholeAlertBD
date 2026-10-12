'use strict';

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(process.env.DB_PATH || path.join(DATA_DIR, 'potholealert.db'));

db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    photo_filename TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    division_key TEXT,
    division_name TEXT,
    road_type TEXT NOT NULL,
    place_note TEXT,
    severity TEXT NOT NULL,
    description TEXT,
    contact_name TEXT,
    contact_phone TEXT,
    authority_name TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS flags (
    report_id TEXT NOT NULL,
    ip TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (report_id, ip)
  );

  CREATE TABLE IF NOT EXISTS rate_hits (key TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS admins (
    name TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS authority_tokens (
    token_hash TEXT PRIMARY KEY, authority_name TEXT NOT NULL, email TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, report_id TEXT, detail TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_reports_division ON reports(division_key);
  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
  CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at);
`);

// Status to restore on unhide; set only when a flag moves a report out of new/queued_for_authority.
try { db.exec('ALTER TABLE reports ADD COLUMN pre_flag_status TEXT'); } catch { /* already exists */ }

try { db.exec('ALTER TABLE reports ADD COLUMN after_photo_filename TEXT'); } catch { /* already exists */ }
db.exec('CREATE INDEX IF NOT EXISTS idx_reports_authority ON reports(authority_name)');

module.exports = db;
