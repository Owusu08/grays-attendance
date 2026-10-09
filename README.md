# Gray's Attendance

Express + SQLite backend with the polished UI in `public/`.

    npm install
    npm start        # http://localhost:3000  (opens the lecturer sign-in)

Copy `.env.example` for settings. In production set `NODE_ENV=production` and `SESSION_SECRET`.

## Who does what
| Role | Gets in by | Can do |
|---|---|---|
| **Institution** (owner) | `institution-register.html` | Creates **admin** codes, sees admins + totals |
| **Admin** | admin code (`ATU-ADM-XK4Q`) | Creates **lecturer** codes, sees lecturer activity |
| **Lecturer** | lecturer code (`ATU-LEC-7B2Q`) | Courses, rosters, QR sessions, records |
| **Student** | scans the QR (no account) | Checks in with student ID + one-time code |

Codes carry a label, max uses (or unlimited), and expiry; they can be revoked. A failed sign-up never uses up a code.

## Layout
    server.js            app, sessions, Socket.IO, route mounting
    db.js  config.js     schema / tunables
    routes/              URL -> controller (+ auth guard)
    controllers/         auth, institution, admin, course, session, attendance
    services/invites.js  create / list / revoke / consume codes
    middleware/          auth (requireRole), errors, rateLimit
    public/              the UI (+ checkin.html, the student page the QR opens)

## API
`401` = not signed in, `403` = wrong role. Errors are `{ "error": "message" }`.

**/api/auth** `GET /me` · `POST /login` · `POST /admin-login` · `POST /register` · `POST /admin-register` · `POST /logout` · `PUT /profile` · `PUT /password`
**/api/institutions** `POST /register` · `POST /login` · `GET /me` · `GET /admins` · `GET|POST /invites` · `DELETE /invites/:code`
**/api/admin** `GET /lecturers` · `GET|POST /lecturer-invites` · `DELETE /lecturer-invites/:code`
**/api/courses** `GET /` · `POST /` · `DELETE /:id` · `GET|POST /:id/students`
**/api/sessions** `POST /` · `GET /:id/qr` · `POST /:id/rotate` · `POST /:id/end` · `GET /:id/roster` · `DELETE /:id/checkin/:studentId`
**/api** `GET /checkin/:sessionId` · `POST /checkin` (public) · `GET /records?course=&status=&from=&search=`

## How check-in stays honest
- The 6-digit code rotates every 60 s from the lecturer's dashboard. The previous code works for 15 s; a code not rotated within 2 min stops working, so a closed/forgotten dashboard cannot be used remotely.
- Wrong-code/unknown-ID attempts are rate limited (per student ID and per IP). Login and sign-up are rate limited too.
- "Late" means after the cut-off minute, in `APP_TIMEZONE`.
- "Absent" = on the roster before the session started, never checked in, session ended.
- Starting a session closes any other live session for the same course.
- Socket.IO rooms (`checkin-added`, `checkin-removed`, `session-ended`) only accept the lecturer who owns the session.

## Notes
- If an older `database.sqlite` from the first version is found, its tables are renamed `legacy_*` and a fresh schema is created.
- Sessions use express-session's in-memory store: restarting the server signs everyone out. The SQLite file must live on a persistent disk when hosted (free tiers with ephemeral disks lose data on redeploy).
- Rate limits and sessions are per-process; run a single instance.
