// db.js — SQLite connection + schema
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DB_PATH || path.join(__dirname, 'database.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const hasTable = (name) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
const columnsOf = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

// The first version of this project used a different, much smaller schema.
// If we find it, park those tables as legacy_* instead of crashing or mixing data.
const legacyUsers = hasTable('users') && !columnsOf('users').includes('institution_id');
const legacyInst = hasTable('institutions') && !columnsOf('institutions').includes('short_code');
if (legacyUsers || legacyInst) {
  db.pragma('foreign_keys = OFF');
  for (const t of ['attendance', 'sessions', 'courses', 'admin_invites', 'institutions', 'users']) {
    if (hasTable(t)) db.exec(`ALTER TABLE ${t} RENAME TO legacy_${t}`);
  }
  db.pragma('foreign_keys = ON');
  console.warn('Old database schema found: tables were renamed to legacy_* and a fresh schema was created.');
}

// All timestamps are ISO-8601 UTC strings written from JS (so they sort and compare as text).
db.exec(`
  CREATE TABLE IF NOT EXISTS institutions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    short_code TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email_domain TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('lecturer', 'admin', 'institution')),
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invite_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('lecturer', 'admin')),
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    label TEXT NOT NULL DEFAULT '',
    max_uses INTEGER,            -- NULL = unlimited
    uses INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,             -- NULL = never
    revoked_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lecturer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_code TEXT NOT NULL COLLATE NOCASE,
    course_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (lecturer_id, course_code)
  );

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL COLLATE NOCASE,
    full_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (course_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    late_cutoff TEXT NOT NULL,   -- "HH:MM" in APP_TIMEZONE
    code TEXT NOT NULL,
    prev_code TEXT,
    code_issued_at TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    started_at TEXT NOT NULL,
    ended_at TEXT
  );

  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL COLLATE NOCASE,
    full_name TEXT NOT NULL,     -- copied from the roster at check-in time
    status TEXT NOT NULL CHECK (status IN ('present', 'late')),
    checked_at TEXT NOT NULL,
    UNIQUE (session_id, student_id)
  );

  CREATE INDEX IF NOT EXISTS idx_users_inst ON users(institution_id, role);
  CREATE INDEX IF NOT EXISTS idx_invites_inst ON invite_codes(institution_id, role);
  CREATE INDEX IF NOT EXISTS idx_courses_lecturer ON courses(lecturer_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_course ON sessions(course_id, is_active);
`);

module.exports = db;
