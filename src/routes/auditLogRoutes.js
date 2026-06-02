const authMiddleware = require('../middlewares/authMiddleware');
const AuditLogController = require('../controllers/AuditLogController');
const router = require('express').Router();

router.use(authMiddleware);

router.get('/filter-options', AuditLogController.filterOptions);
router.get('/last-manual-cleanup', AuditLogController.lastManualCleanup);
router.post('/cleanup-backup', AuditLogController.backupCleanupLogs);
router.delete('/cleanup', AuditLogController.cleanup);
router.get('/', AuditLogController.index);

module.exports = router;
