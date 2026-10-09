// routes/institutionRoutes.js  (mounted at /api/institutions)
const express = require('express');
const c = require('../controllers/institutionController');
const { asyncHandler } = require('../middleware/errors');
const { requireRole } = require('../middleware/auth');
const { limitRequests } = require('../middleware/rateLimit');

const router = express.Router();
const owner = requireRole('institution');

const loginLimit = limitRequests({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `${req.ip}:${String((req.body && req.body.email) || '').toLowerCase()}`
});
const signupLimit = limitRequests({ windowMs: 60 * 60 * 1000, max: 30, keyFn: (req) => req.ip });

router.post('/register', signupLimit, asyncHandler(c.register));
router.post('/login', loginLimit, asyncHandler(c.login));

router.get('/me', owner, c.overview);
router.get('/admins', owner, c.admins);
router.get('/invites', owner, c.listInvites);
router.post('/invites', owner, c.createInvite);
router.delete('/invites/:code', owner, c.revokeInvite);

module.exports = router;
