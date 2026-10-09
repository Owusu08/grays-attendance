// routes/authRoutes.js  (mounted at /api/auth)
const express = require('express');
const c = require('../controllers/authController');
const { asyncHandler } = require('../middleware/errors');
const { requireRole } = require('../middleware/auth');
const { limitRequests } = require('../middleware/rateLimit');

const router = express.Router();

// Brute-force guard: 10 attempts / 15 min per IP + email.
const loginLimit = limitRequests({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `${req.ip}:${String((req.body && req.body.email) || '').toLowerCase()}`
});
// Sign-ups: 30 / hour per IP (generous: a campus may share one IP).
const signupLimit = limitRequests({ windowMs: 60 * 60 * 1000, max: 30, keyFn: (req) => req.ip });

router.get('/me', c.me);
router.post('/logout', c.logout);

router.post('/login', loginLimit, asyncHandler(c.login));
router.post('/admin-login', loginLimit, asyncHandler(c.adminLogin));
router.post('/register', signupLimit, asyncHandler(c.register));
router.post('/admin-register', signupLimit, asyncHandler(c.adminRegister));

// Profile + password are the lecturer's page (profile.html).
router.put('/profile', requireRole('lecturer'), c.updateProfile);
router.put('/password', requireRole('lecturer'), asyncHandler(c.changePassword));

module.exports = router;
