// routes/attendanceRoutes.js  (mounted at /api)
const express = require('express');
const c = require('../controllers/attendanceController');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Students are not logged in: these two are public (protected by the rotating code + rate limits).
router.get('/checkin/:sessionId', c.info);
router.post('/checkin', c.checkin);

// Lecturer's history / CSV source.
router.get('/records', requireRole('lecturer'), c.records);

module.exports = router;
