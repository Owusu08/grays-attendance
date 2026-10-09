// controllers/institutionController.js — institution owner portal
const bcrypt = require('bcrypt');
const db = require('../db');
const { BCRYPT_ROUNDS } = require('../config');
const { HttpError } = require('../middleware/errors');
const invites = require('../services/invites');
const { loginWithRole, startSession } = require('./authController');
const { nowIso } = require('../utils/time');
const { clean, requireText, requireEmail, requirePassword } = require('../utils/validate');

// Short code is used as the prefix of invite codes (ATU-LEC-7B2Q): letters/digits, 2-8 chars.
function normaliseShortCode(raw, fallbackName) {
  let s = clean(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 2) s = fallbackName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  s = s.slice(0, 8);
  if (s.length < 2) throw new HttpError(400, 'Enter a valid institution name.');
  return s;
}

// If "ATU" is taken by another institution, use ATU2, ATU3 ... instead of failing the sign-up.
function uniqueShortCode(base) {
  const taken = db.prepare('SELECT 1 FROM institutions WHERE short_code = ?');
  if (!taken.get(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const suffix = String(i);
    const candidate = base.slice(0, 8 - suffix.length) + suffix;
    if (!taken.get(candidate)) return candidate;
  }
  throw new HttpError(500, 'Could not generate an institution code.');
}

async function register(req, res) {
  const name = requireText(req.body.institution_name, 'Institution name', 150);
  const ownerName = requireText(req.body.owner_name, 'Your name');
  const email = requireEmail(req.body.email);
  const password = requirePassword(req.body.password);
  const domain = clean(req.body.email_domain).toLowerCase().slice(0, 100);
  const base = normaliseShortCode(req.body.short_code, name);
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const create = db.transaction(() => {
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      throw new HttpError(409, 'That email is already registered. Try signing in instead.');
    }
    const now = nowIso();
    const instId = db
      .prepare('INSERT INTO institutions (name, short_code, email_domain, created_at) VALUES (?, ?, ?, ?)')
      .run(name, uniqueShortCode(base), domain, now).lastInsertRowid;
    return db
      .prepare("INSERT INTO users (full_name, email, password_hash, role, institution_id, created_at) VALUES (?, ?, ?, 'institution', ?, ?)")
      .run(ownerName, email, hash, instId, now).lastInsertRowid;
  });

  await startSession(req, create());
  res.status(201).json({ message: 'Institution created.', role: 'institution' });
}

const login = (req, res) => loginWithRole(req, res, 'institution', 'an institution account');

function overview(req, res) {
  const id = req.user.institution_id;
  const inst = db.prepare('SELECT id, name, short_code, email_domain, created_at FROM institutions WHERE id = ?').get(id);
  const one = (sql) => db.prepare(sql).get(id).n;
  res.json({
    ...inst,
    admin_count: one("SELECT COUNT(*) AS n FROM users WHERE institution_id = ? AND role = 'admin'"),
    lecturer_count: one("SELECT COUNT(*) AS n FROM users WHERE institution_id = ? AND role = 'lecturer'"),
    course_count: one(
      `SELECT COUNT(*) AS n FROM courses c JOIN users u ON u.id = c.lecturer_id WHERE u.institution_id = ?`
    ),
    session_count: one(
      `SELECT COUNT(*) AS n FROM sessions s JOIN courses c ON c.id = s.course_id
       JOIN users u ON u.id = c.lecturer_id WHERE u.institution_id = ?`
    )
  });
}

function admins(req, res) {
  const rows = db
    .prepare("SELECT id, full_name, email, created_at FROM users WHERE institution_id = ? AND role = 'admin' ORDER BY id DESC")
    .all(req.user.institution_id);
  res.json({ admins: rows });
}

// The owner can only mint ADMIN codes, whatever the client sends as "role".
function listInvites(req, res) {
  res.json({ codes: invites.list(req.user.institution_id, 'admin') });
}

function createInvite(req, res) {
  const { label, max_uses, expires_in_days } = req.body || {};
  const code = invites.create({
    role: 'admin',
    institutionId: req.user.institution_id,
    createdBy: req.user.id,
    label,
    maxUses: max_uses,
    expiresInDays: expires_in_days
  });
  res.status(201).json(code);
}

function revokeInvite(req, res) {
  invites.revoke(req.user.institution_id, 'admin', req.params.code);
  res.json({ message: 'Code revoked.' });
}

module.exports = { register, login, overview, admins, listInvites, createInvite, revokeInvite };
