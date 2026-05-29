const authMiddleware = require('../middlewares/authMiddleware');
const HomeDashboardController = require('../controllers/HomeDashboardController');
const router = require('express').Router();

router.use(authMiddleware);

router.get('/home', HomeDashboardController.index);

module.exports = router;
