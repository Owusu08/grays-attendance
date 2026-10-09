// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');

const config = require('./config');
const db = require('./db');
const { notFoundApi, errorHandler } = require('./middleware/errors');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Import Routes
const authRoutes = require('./routes/authRoutes');
const institutionRoutes = require('./routes/institutionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const courseRoutes = require('./routes/courseRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');

app.disable('x-powered-by');

// Trust proxy for production (Render / HTTPS)
if (config.IS_PROD) {
  app.set('trust proxy', 1);
  if (!process.env.SESSION_SECRET) {
    console.error('SESSION_SECRET must be set when NODE_ENV=production.');
    process.exit(1);
  }
}

// Middleware
app.use(express.json({ limit: '3mb' })); // rosters are up to 5000 rows
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
  name: 'connect.sid',
  secret: process.env.SESSION_SECRET || 'dev_secret_key_123',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.IS_PROD,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000
  }
});
app.use(sessionMiddleware);

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.redirect('/login.html'));
app.get('/healthz', (req, res) => res.json({ ok: true }));

// Socket.IO: reuse the login session; a lecturer may only join rooms for their own sessions.
app.set('io', io);
io.engine.use(sessionMiddleware);
io.on('connection', (socket) => {
  socket.on('join-session', (sessionId) => {
    const uid = socket.request.session && socket.request.session.uid;
    const id = Number(sessionId);
    if (!uid || !Number.isInteger(id)) return;
    const owns = db
      .prepare('SELECT 1 FROM sessions s JOIN courses c ON c.id = s.course_id WHERE s.id = ? AND c.lecturer_id = ?')
      .get(id, uid);
    if (owns) socket.join(`session:${id}`);
  });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api', attendanceRoutes);
app.use('/api', notFoundApi);

app.use(errorHandler);

server.listen(config.PORT, () => {
  console.log(`Server running on http://localhost:${config.PORT}  (timezone: ${config.TIMEZONE})`);
});
