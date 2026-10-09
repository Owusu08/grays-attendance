// controllers/adminController.js — administrator portal (lecturer oversight + lecturer codes)
const db = require('../db');
const invites = require('../services/invites');

// Every lecturer in the admin's institution with activity numbers.
function lecturers(req, res) {
  const rows = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.created_at,
         (SELECT COUNT(*) FROM courses c WHERE c.lecturer_id = u.id) AS course_count,
         (SELECT COUNT(*) FROM sessions s JOIN courses c ON c.id = s.course_id WHERE c.lecturer_id = u.id) AS session_count,
         (SELECT MAX(s.started_at) FROM sessions s JOIN courses c ON c.id = s.course_id WHERE c.lecturer_id = u.id) AS last_session_date
       FROM users u
       WHERE u.institution_id = ? AND u.role = 'lecturer'
       ORDER BY u.full_name COLLATE NOCASE`
    )
    .all(req.user.institution_id);
  res.json({ lecturers: rows });
}

function listInvites(req, res) {
  res.json({ codes: invites.list(req.user.institution_id, 'lecturer') });
}

function createInvite(req, res) {
  const { label, max_uses, expires_in_days } = req.body || {};
  const code = invites.create({
    role: 'lecturer',
    institutionId: req.user.institution_id,
    createdBy: req.user.id,
    label,
    maxUses: max_uses,
    expiresInDays: expires_in_days
  });
  res.status(201).json(code);
}

function revokeInvite(req, res) {
  invites.revoke(req.user.institution_id, 'lecturer', req.params.code);
  res.json({ message: 'Code revoked.' });
}

module.exports = { lecturers, listInvites, createInvite, revokeInvite };
