// routes/sessionRoutes.js  (mounted at /api/sessions)
const express = require('express');
const c = require('../controllers/sessionController');
const { asyncHandler } = require('../middleware/errors');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('lecturer'));

router.post('/', c.start);
router.get('/:id/qr', asyncHandler(c.qr));
router.post('/:id/rotate', c.rotate);
router.post('/:id/end', c.end);
router.get('/:id/roster', c.roster);
router.delete('/:id/checkin/:studentId', c.removeCheckin);

module.exports = router;
