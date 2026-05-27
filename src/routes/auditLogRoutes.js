const authMiddleware = require('../middlewares/authMiddleware');
const AuditLogController = require('../controllers/AuditLogController');
const router = require('express').Router();

router.use(authMiddleware);

router.get('/filter-options', AuditLogController.filterOptions);
router.get('/', AuditLogController.index);

module.exports = router;
