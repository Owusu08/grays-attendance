// controllers/attendanceController.js — student check-in (public) and lecturer records
const db = require('../db');
const { CODE_TTL_MS, PREV_CODE_GRACE_MS, MAX_RECORDS } = require('../config');
const { HttpError } = require('../middleware/errors');
const { createLimiter } = require('../middleware/rateLimit');
const { localParts, cutoffMinutes } = require('../utils/time');
const { clean, positiveInt, safeEqual } = require('../utils/validate');

// ---- Student check-in -------------------------------------------------------------------

// Failed-attempt limits. Per-IP is generous because a whole campus can share one IP.
const failsByIp = createLimiter({ windowMs: 5 * 60 * 1000, max: 60 });
const failsByStudent = createLimiter({ windowMs: 5 * 60 * 1000, max: 10 });

function codeIsValid(session, input) {
  const age = Date.now() - Date.parse(session.code_issued_at);
  if (age <= CODE_TTL_MS && safeEqual(input, session.code)) return true;
  // The previous code stays valid for a few seconds after a rotation.
  return !!session.prev_code && age <= PREV_CODE_GRACE_MS && safeEqual(input, session.prev_code);
}

const liveSession = (id) =>
  id && db
    .prepare(
      `SELECT s.*, c.course_code, c.course_name FROM sessions s
       JOIN courses c ON c.id = s.course_id WHERE s.id = ? AND s.is_active = 1`
    )
    .get(id);

// Public: the check-in page asks which class this QR belongs to.
function info(req, res) {
  const s = liveSession(positiveInt(req.params.sessionId));
  if (!s) throw new HttpError(404, 'This session has ended or does not exist.');
  res.json({ course_code: s.course_code, course_name: s.course_name });
}

// Public: { session_id, student_id, code }
function checkin(req, res) {
  const sessionId = positiveInt(req.body.session_id);
  const studentId = clean(req.body.student_id);
  const code = clean(req.body.code);
  if (!sessionId || !studentId || !code) throw new HttpError(400, 'Enter your student ID and the code on the screen.');

  const ipKey = `ip:${req.ip}`;
  const stuKey = `stu:${sessionId}:${studentId.toLowerCase()}`;
  if (failsByIp.isBlocked(ipKey) || failsByStudent.isBlocked(stuKey)) {
    throw new HttpError(429, 'Too many wrong attempts. Wait a few minutes and try again.');
  }
  const fail = (status, message) => {
    failsByIp.hit(ipKey);
    failsByStudent.hit(stuKey);
    throw new HttpError(status, message);
  };

  const s = liveSession(sessionId);
  if (!s) throw new HttpError(404, 'This session has ended or does not exist.');
  if (!codeIsValid(s, code)) fail(400, 'That code is wrong or has expired. Check the screen for the new code.');

  const student = db
    .prepare('SELECT student_id, full_name FROM students WHERE course_id = ? AND student_id = ?')
    .get(s.course_id, studentId);
  if (!student) fail(404, 'That student ID is not on this class list. Check it, or ask your lecturer.');

  const existing = db.prepare('SELECT status FROM checkins WHERE session_id = ? AND student_id = ?').get(s.id, studentId);
  if (existing) {
    throw new HttpError(409, `You are already checked in (${existing.status === 'late' ? 'late' : 'present'}).`);
  }

  const now = new Date();
  const status = localParts(now).minutes > cutoffMinutes(s.late_cutoff) ? 'late' : 'present';
  db.prepare('INSERT INTO checkins (session_id, student_id, full_name, status, checked_at) VALUES (?, ?, ?, ?, ?)')
    .run(s.id, student.student_id, student.full_name, status, now.toISOString());

  const io = req.app.get('io');
  if (io) io.to(`session:${s.id}`).emit('checkin-added', { student_id: student.student_id, status });

  res.status(201).json({ status, full_name: student.full_name, course_code: s.course_code, course_name: s.course_name });
}

// ---- Lecturer records -------------------------------------------------------------------

// One row per student per session. "Absent" = on the roster before the session started and
// never checked in; only computed for sessions that have ended.
function records(req, res) {
  const rows = db
    .prepare(
      `SELECT ci.full_name AS name, ci.student_id, c.course_code, s.started_at, ci.checked_at, ci.status
         FROM checkins ci
         JOIN sessions s ON s.id = ci.session_id
         JOIN courses c ON c.id = s.course_id
        WHERE c.lecturer_id = @uid
       UNION ALL
       SELECT st.full_name, st.student_id, c.course_code, s.started_at, NULL, 'absent'
         FROM sessions s
         JOIN courses c ON c.id = s.course_id
         JOIN students st ON st.course_id = c.id
        WHERE c.lecturer_id = @uid AND s.is_active = 0 AND st.created_at <= s.started_at
          AND NOT EXISTS (SELECT 1 FROM checkins x WHERE x.session_id = s.id AND x.student_id = st.student_id)
       ORDER BY 4 DESC, 1 COLLATE NOCASE
       LIMIT ${MAX_RECORDS}`
    )
    .all({ uid: req.user.id });

  const course = clean(req.query.course);
  const status = clean(req.query.status).toLowerCase();
  const from = clean(req.query.from);
  const search = clean(req.query.search).toLowerCase();

  const out = [];
  for (const r of rows) {
    if (course && course !== 'all' && r.course_code.toLowerCase() !== course.toLowerCase()) continue;
    if (status && status !== 'all' && r.status !== status) continue;
    const day = localParts(r.started_at).date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(from) && day < from) continue;
    if (search && !r.name.toLowerCase().includes(search) && !r.student_id.toLowerCase().includes(search)) continue;
    out.push({
      name: r.name,
      student_id: r.student_id,
      course_code: r.course_code,
      date: day,
      time: r.checked_at ? localParts(r.checked_at).time : '—',
      status: r.status
    });
  }
  res.json(out);
}

module.exports = { info, checkin, records };
