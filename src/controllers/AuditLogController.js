const AuditLogService = require('../services/AuditLogService');

class AuditLogController {
  async index(req, res, next) {
    try {
      const logs = await AuditLogService.getPaginated(req.query, req.user);
      return res.status(200).json(logs);
    } catch (err) {
      next(err);
    }
  }

  async filterOptions(req, res, next) {
    try {
      const options = await AuditLogService.getFilterOptions(req.user);
      return res.status(200).json(options);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AuditLogController();
