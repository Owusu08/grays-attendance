// middleware/auth.js
const db = require('../db');
const { HttpError } = require('./errors');

const findUser = db.prepare(
  'SELECT id, full_name, email, role, institution_id, created_at FROM users WHERE id = ?'
);

// Session cookie -> fresh user row (so deleted users / changed roles take effect at once).
function currentUser(req) {
  const uid = req.session && req.session.uid;
  return uid ? findUser.get(uid) || null : null;
}

// requireRole('lecturer') etc. Sets req.user.
function requireRole(role) {
  return (req, res, next) => {
    const user = currentUser(req);
    if (!user) {
      if (req.session && req.session.uid) req.session.destroy(() => {});
      return next(new HttpError(401, 'Please sign in.'));
    }
    if (user.role !== role) return next(new HttpError(403, 'Your account cannot do that.'));
    req.user = user;
    next();
  };
}

module.exports = { currentUser, requireRole };
