const HomeDashboardService = require('../services/HomeDashboardService');

class HomeDashboardController {
  async index(req, res, next) {
    try {
      const data = await HomeDashboardService.getHomeData();
      return res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new HomeDashboardController();
