// controllers/courseController.js — lecturer's courses and class rosters
const db = require('../db');
const { MAX_ROSTER_IMPORT } = require('../config');
const { HttpError } = require('../middleware/errors');
const { nowIso } = require('../utils/time');
const { clean, requireText, positiveInt } = require('../utils/validate');

function ownCourse(req) {
  const id = positiveInt(req.params.id);
  const course = id && db.prepare('SELECT * FROM courses WHERE id = ? AND lecturer_id = ?').get(id, req.user.id);
  if (!course) throw new HttpError(404, 'Course not found.');
  return course;
}

// The UI expects a bare array here.
function list(req, res) {
  const rows = db
    .prepare(
      `SELECT c.id, c.course_code, c.course_name,
              (SELECT COUNT(*) FROM students st WHERE st.course_id = c.id) AS student_count
       FROM courses c WHERE c.lecturer_id = ? ORDER BY c.course_code COLLATE NOCASE`
    )
    .all(req.user.id);
  res.json(rows);
}

function create(req, res) {
  const course_code = requireText(req.body.course_code, 'Course code', 20).toUpperCase();
  const course_name = requireText(req.body.course_name, 'Course name', 100);
  try {
    const r = db
      .prepare('INSERT INTO courses (lecturer_id, course_code, course_name, created_at) VALUES (?, ?, ?, ?)')
      .run(req.user.id, course_code, course_name, nowIso());
    res.status(201).json({ id: r.lastInsertRowid, course_code, course_name, student_count: 0 });
  } catch (err) {
    if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
      throw new HttpError(409, `You already have a course with the code ${course_code}.`);
    }
    throw err;
  }
}

// Deleting a course also removes its students, sessions and check-ins (ON DELETE CASCADE).
function remove(req, res) {
  const course = ownCourse(req);
  db.prepare('DELETE FROM courses WHERE id = ?').run(course.id);
  res.json({ message: 'Course deleted.' });
}

function listStudents(req, res) {
  const course = ownCourse(req);
  const students = db
    .prepare('SELECT student_id, full_name FROM students WHERE course_id = ? ORDER BY full_name COLLATE NOCASE')
    .all(course.id);
  res.json({ students });
}

// Body: { students: [{ student_id, full_name }, ...] }. Merges into the roster:
// new IDs are added, existing IDs get their name updated, nobody is removed.
function importStudents(req, res) {
  const course = ownCourse(req);
  const list = req.body && req.body.students;
  if (!Array.isArray(list) || !list.length) throw new HttpError(400, 'No students to import.');
  if (list.length > MAX_ROSTER_IMPORT) throw new HttpError(400, `You can import at most ${MAX_ROSTER_IMPORT} students at a time.`);

  const upsert = db.prepare(
    `INSERT INTO students (course_id, student_id, full_name, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (course_id, student_id) DO UPDATE SET full_name = excluded.full_name`
  );
  const now = nowIso();
  let imported = 0;
  let skipped = 0;
  db.transaction(() => {
    for (const row of list) {
      const student_id = clean(row && String(row.student_id == null ? '' : row.student_id));
      const full_name = clean(row && String(row.full_name == null ? '' : row.full_name));
      if (!student_id || !full_name || student_id.length > 40 || full_name.length > 120) { skipped++; continue; }
      upsert.run(course.id, student_id, full_name, now);
      imported++;
    }
  })();

  if (!imported) throw new HttpError(400, 'None of those rows could be read. Use: student_id, full_name');
  const total = db.prepare('SELECT COUNT(*) AS n FROM students WHERE course_id = ?').get(course.id).n;
  res.json({ imported, skipped, total_students: total });
}

module.exports = { list, create, remove, listStudents, importStudents };
