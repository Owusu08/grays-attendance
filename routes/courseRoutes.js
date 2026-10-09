// routes/courseRoutes.js  (mounted at /api/courses)
const express = require('express');
const c = require('../controllers/courseController');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('lecturer'));

router.get('/', c.list);
router.post('/', c.create);
router.delete('/:id', c.remove);
router.get('/:id/students', c.listStudents);
router.post('/:id/students', c.importStudents);

module.exports = router;
