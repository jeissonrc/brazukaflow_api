const authMiddleware = require('../middlewares/authMiddleware');
const BackupController = require('../controllers/BackupController');
const router = require('express').Router();

router.use(authMiddleware);

router.get('/sql', BackupController.generateSql);

module.exports = router;
