// services/invites.js — invite codes (lecturer codes made by admins, admin codes made by the institution owner)
const crypto = require('crypto');
const db = require('../db');
const { HttpError } = require('../middleware/errors');
const { nowIso } = require('../utils/time');
const { clean } = require('../utils/validate');

const ROLE_TAG = { lecturer: 'LEC', admin: 'ADM' };
// No 0/O/1/I/L so codes are easy to read out loud.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const randomSuffix = (n = 4) =>
  Array.from({ length: n }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

const PUBLIC_COLS = 'code, label, uses, max_uses, expires_at, revoked_at, created_at';

function create({ role, institutionId, createdBy, label, maxUses, expiresInDays }) {
  const inst = db.prepare('SELECT short_code FROM institutions WHERE id = ?').get(institutionId);
  if (!inst) throw new HttpError(404, 'Institution not found.');

  label = clean(label);
  if (label.length > 80) throw new HttpError(400, 'Label is too long (max 80 characters).');

  // 0 / "Anyone" => unlimited. Missing => safest default (1 use).
  const uses = maxUses === undefined ? 1 : Number(maxUses);
  if (!Number.isInteger(uses) || uses < 0 || uses > 100000) throw new HttpError(400, 'Choose how many people can use the code.');
  const days = expiresInDays === undefined ? 7 : Number(expiresInDays);
  if (!Number.isInteger(days) || days < 0 || days > 365) throw new HttpError(400, 'Choose when the code expires.');

  const createdAt = nowIso();
  const expiresAt = days === 0 ? null : new Date(Date.now() + days * 86400000).toISOString();
  const insert = db.prepare(
    `INSERT INTO invite_codes (code, role, institution_id, created_by, label, max_uses, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = `${inst.short_code.toUpperCase()}-${ROLE_TAG[role]}-${randomSuffix()}`;
    try {
      insert.run(code, role, institutionId, createdBy, label, uses === 0 ? null : uses, expiresAt, createdAt);
      return db.prepare(`SELECT ${PUBLIC_COLS} FROM invite_codes WHERE code = ?`).get(code);
    } catch (err) {
      if (!String(err.code).startsWith('SQLITE_CONSTRAINT')) throw err; // random collision: try again
    }
  }
  throw new HttpError(500, 'Could not generate a unique code. Try again.');
}

function list(institutionId, role) {
  return db
    .prepare(`SELECT ${PUBLIC_COLS} FROM invite_codes WHERE institution_id = ? AND role = ? ORDER BY id DESC`)
    .all(institutionId, role);
}

function revoke(institutionId, role, code) {
  const r = db
    .prepare(
      `UPDATE invite_codes SET revoked_at = ?
       WHERE code = ? AND institution_id = ? AND role = ? AND revoked_at IS NULL`
    )
    .run(nowIso(), clean(code).toUpperCase(), institutionId, role);
  if (!r.changes) throw new HttpError(404, 'Code not found or already revoked.');
}

// Use one seat of a code. MUST be called inside a db.transaction so that a later
// failure (e.g. duplicate email) rolls the use back. Returns the invite row.
function consume(rawCode, role) {
  const code = clean(rawCode).toUpperCase();
  if (!code) throw new HttpError(400, 'Enter your invite code.');
  const inv = db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(code);
  if (!inv) throw new HttpError(400, 'That code is not valid. Check it and try again.');
  if (inv.role !== role) {
    throw new HttpError(
      400,
      role === 'admin'
        ? 'That is a lecturer code. Use the lecturer sign-up page.'
        : 'That is an administrator code. Use the administrator sign-up page.'
    );
  }
  if (inv.revoked_at) throw new HttpError(400, 'That code has been revoked. Ask for a new one.');
  if (inv.expires_at && inv.expires_at <= nowIso()) throw new HttpError(400, 'That code has expired. Ask for a new one.');

  // Atomic seat check: two people racing for the last seat cannot both win.
  const r = db
    .prepare('UPDATE invite_codes SET uses = uses + 1 WHERE id = ? AND (max_uses IS NULL OR uses < max_uses)')
    .run(inv.id);
  if (!r.changes) throw new HttpError(400, 'That code has already been used up. Ask for a new one.');
  return inv;
}

module.exports = { create, list, revoke, consume };
