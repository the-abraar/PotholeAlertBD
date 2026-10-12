'use strict';

// Usage: node scripts/manage.js add-admin <name> | disable-admin <name> | add-authority <authority name> [email] | digest | purge
// Tokens are printed once; only their SHA-256 is stored.
require('dotenv').config();
const crypto = require('crypto');
const db = require('../src/db');
const { sha256, audit } = require('../src/security');

const [cmd, name, email] = process.argv.slice(2);
const token = () => crypto.randomBytes(24).toString('hex');
const now = () => new Date().toISOString();

(async () => {
  if (cmd === 'add-admin' && name) {
    const t = token();
    db.prepare('INSERT INTO admins (name, token_hash, created_at) VALUES (?, ?, ?)').run(name, sha256(t), now());
    audit('cli', 'add_admin', null, { name });
    console.log(`admin ${name} token: ${t}`);
  } else if (cmd === 'disable-admin' && name) {
    const { changes } = db.prepare('UPDATE admins SET disabled = 1 WHERE name = ?').run(name);
    if (changes) audit('cli', 'disable_admin', null, { name });
    console.log(changes ? 'disabled' : 'no such admin');
  } else if (cmd === 'add-authority' && name) {
    const t = token();
    db.prepare('INSERT INTO authority_tokens (token_hash, authority_name, email, created_at) VALUES (?, ?, ?, ?)').run(sha256(t), name, email || null, now());
    audit('cli', 'add_authority_token', null, { authority: name });
    console.log(`authority "${name}" token: ${t}`);
  } else if (cmd === 'digest') {
    console.log(await require('../src/digest').sendDigests());
  } else if (cmd === 'purge') {
    console.log(`erased contacts on ${require('../src/retention').purgeContacts()} reports`);
  } else {
    console.error('usage: manage.js add-admin <name> | disable-admin <name> | add-authority <authority name> [email] | digest | purge');
    process.exit(1);
  }
})();
