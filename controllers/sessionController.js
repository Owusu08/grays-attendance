// controllers/sessionController.js — lecturer starts/ends class sessions, shows QR + rotating code
const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('../db');
const { PUBLIC_URL } = require('../config');
const { HttpError } = require('../middleware/errors');
const { nowIso, isCutoff } = require('../utils/time');
const { positiveInt } = require('../utils/validate');

const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

function emit(req, sessionId, event, payload) {
  const io = req.app.get('io');
  if (io) io.to(`session:${sessionId}`).emit(event, payload || {});
}

// The session must belong to one of the lecturer's courses.
function ownSession(req) {
  const id = positiveInt(req.params.id);
  const s = id && db
    .prepare(
      `SELECT s.*, c.course_code, c.course_name FROM sessions s
       JOIN courses c ON c.id = s.course_id WHERE s.id = ? AND c.lecturer_id = ?`
    )
    .get(id, req.user.id);
  if (!s) throw new HttpError(404, 'Session not found.');
  return s;
}

function activeSession(req) {
  const s = ownSession(req);
  if (!s.is_active) throw new HttpError(404, 'This session is no longer active.');
  return s;
}

function start(req, res) {
  const courseId = positiveInt(req.body.course_id);
  const course = courseId && db.prepare('SELECT * FROM courses WHERE id = ? AND lecturer_id = ?').get(courseId, req.user.id);
  if (!course) throw new HttpError(404, 'Course not found.');
  if (!isCutoff(req.body.late_cutoff_time)) throw new HttpError(400, 'Choose the time after which students count as late.');

  const now = nowIso();
  const code = newCode();
  // One live session per course: starting a new one closes any earlier one.
  const id = db.transaction(() => {
    db.prepare('UPDATE sessions SET is_active = 0, ended_at = ? WHERE course_id = ? AND is_active = 1').run(now, course.id);
    return db
      .prepare('INSERT INTO sessions (course_id, late_cutoff, code, code_issued_at, started_at) VALUES (?, ?, ?, ?, ?)')
      .run(course.id, req.body.late_cutoff_time, code, now, now).lastInsertRowid;
  })();

  res.status(201).json({ id, session_code: code, course_code: course.course_code, course_name: course.course_name });
}

// QR image (data URL) + the link students land on.
async function qr(req, res) {
  const s = activeSession(req);
  const base = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const url = `${base}/checkin.html?s=${s.id}`;
  const data_url = await QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: 'M' });
  res.json({ data_url, url });
}

// Issue a fresh code. The old one keeps working for a few seconds (PREV_CODE_GRACE_MS).
function rotate(req, res) {
  const s = activeSession(req);
  let code = newCode();
  while (code === s.code) code = newCode();
  db.prepare('UPDATE sessions SET prev_code = code, code = ?, code_issued_at = ? WHERE id = ?').run(code, nowIso(), s.id);
  res.json({ session_code: code });
}

function end(req, res) {
  const s = ownSession(req);
  if (s.is_active) {
    db.prepare('UPDATE sessions SET is_active = 0, ended_at = ? WHERE id = ?').run(nowIso(), s.id);
    emit(req, s.id, 'session-ended');
  }
  res.json({ message: 'Session ended.' });
}

// Live roster polled every 3s by the dashboard.
function roster(req, res) {
  const s = activeSession(req);
  const checked_in = db
    .prepare(
      `SELECT student_id, full_name, status, checked_at AS time_marked
       FROM checkins WHERE session_id = ? ORDER BY checked_at DESC, id DESC`
    )
    .all(s.id);
  const total = db.prepare('SELECT COUNT(*) AS n FROM students WHERE course_id = ?').get(s.course_id).n;
  res.json({
    checked_in,
    present_count: checked_in.filter((r) => r.status === 'present').length,
    late_count: checked_in.filter((r) => r.status === 'late').length,
    total_students: total
  });
}

// Lecturer removes a check-in (e.g. a friend checked in for someone). The student can check in again.
function removeCheckin(req, res) {
  const s = activeSession(req);
  const r = db
    .prepare('DELETE FROM checkins WHERE session_id = ? AND student_id = ?')
    .run(s.id, String(req.params.studentId).trim());
  if (!r.changes) throw new HttpError(404, 'That check-in was not found.');
  emit(req, s.id, 'checkin-removed', { student_id: req.params.studentId });
  res.json({ message: 'Check-in removed.' });
}

module.exports = { start, qr, rotate, end, roster, removeCheckin };
