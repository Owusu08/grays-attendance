// routes/adminRoutes.js  (mounted at /api/admin)
const express = require('express');
const c = require('../controllers/adminController');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('admin'));

router.get('/lecturers', c.lecturers);
router.get('/lecturer-invites', c.listInvites);
router.post('/lecturer-invites', c.createInvite);
router.delete('/lecturer-invites/:code', c.revokeInvite);

module.exports = router;
