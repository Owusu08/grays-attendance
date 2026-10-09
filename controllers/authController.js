// controllers/authController.js — lecturer + admin sign-in/sign-up, profile, password
const bcrypt = require('bcrypt');
const db = require('../db');
const { BCRYPT_ROUNDS } = require('../config');
const { HttpError } = require('../middleware/errors');
const { currentUser } = require('../middleware/auth');
const invites = require('../services/invites');
const { nowIso } = require('../utils/time');
const { clean, requireText, requireEmail, requirePassword } = require('../utils/validate');

// Compared against when the email is unknown so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

const publicUser = (u) => ({
  id: u.id,
  full_name: u.full_name,
  email: u.email,
  role: u.role,
  institution_id: u.institution_id,
  created_at: u.created_at
});

// New session id on every login (prevents session fixation).
function startSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.uid = userId;
      req.session.save((e) => (e ? reject(e) : resolve()));
    });
  });
}

// Shared by lecturer / admin / institution login. portalName is used in the wrong-portal message.
async function loginWithRole(req, res, role, portalName) {
  const email = clean(req.body && req.body.email).toLowerCase();
  const password = req.body && req.body.password;
  if (!email || typeof password !== 'string' || !password) {
    throw new HttpError(400, 'Enter your email and password.');
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Invalid email or password.');
  if (user.role !== role) {
    throw new HttpError(403, `This account is not ${portalName}. Use the sign-in page for your role.`);
  }
  await startSession(req, user.id);
  res.json({ message: 'Signed in.', role: user.role });
}

const login = (req, res) => loginWithRole(req, res, 'lecturer', 'a lecturer account');
const adminLogin = (req, res) => loginWithRole(req, res, 'admin', 'an administrator account');

// Sign-up with an invite code. Code use + user insert are one transaction.
async function registerWithInvite(req, res, role) {
  const name = requireText(req.body.name, 'Your name');
  const email = requireEmail(req.body.email);
  const password = requirePassword(req.body.password);
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const create = db.transaction(() => {
    const inv = invites.consume(req.body.invite_code, role);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      throw new HttpError(409, 'That email is already registered. Try signing in instead.');
    }
    const r = db
      .prepare('INSERT INTO users (full_name, email, password_hash, role, institution_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, email, hash, role, inv.institution_id, nowIso());
    return r.lastInsertRowid;
  });

  const userId = create();
  await startSession(req, userId); // the UI redirects straight to the dashboard
  res.status(201).json({ message: 'Welcome aboard.', role });
}

const register = (req, res) => registerWithInvite(req, res, 'lecturer');
const adminRegister = (req, res) => registerWithInvite(req, res, 'admin');

function me(req, res) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Please sign in.' });
  res.json(publicUser(user));
}

function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ message: 'Signed out.' });
  });
}

function updateProfile(req, res) {
  const user = req.user;
  const full_name = requireText(req.body.full_name, 'Name');
  const email = requireEmail(req.body.email);
  const clash = db.prepare('SELECT id FROM users WHERE email = ? AND id <> ?').get(email, user.id);
  if (clash) throw new HttpError(409, 'That email is already used by another account.');
  db.prepare('UPDATE users SET full_name = ?, email = ? WHERE id = ?').run(full_name, email, user.id);
  res.json({ full_name, email });
}

async function changePassword(req, res) {
  const { current_password, new_password } = req.body || {};
  if (typeof current_password !== 'string' || !current_password) throw new HttpError(400, 'Enter your current password.');
  requirePassword(new_password, 'New password');
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!(await bcrypt.compare(current_password, row.password_hash))) {
    throw new HttpError(400, 'Your current password is incorrect.');
  }
  if (new_password === current_password) throw new HttpError(400, 'Your new password must be different from the current one.');
  const hash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ message: 'Password updated.' });
}

module.exports = {
  login, adminLogin, register, adminRegister, me, logout, updateProfile, changePassword,
  // reused by institutionController
  loginWithRole, startSession
};
