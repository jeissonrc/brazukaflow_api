const IncomeService = require('../services/IncomeService');

class IncomeController {
  async index(req, res, next) {
    try {
      const hasPagination = req.query.page || req.query.limit;
      const data = hasPagination
        ? await IncomeService.getPaginated(req.query)
        : await IncomeService.getAll();
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async getOne(req, res, next) {
    try {
      const data = await IncomeService.getOne(req.params.id);
      if (!data) throw Object.assign(new Error('Income not found'), { status: 404 });
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async store(req, res, next) {
    try {
      const data = await IncomeService.create(req.body);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const data = await IncomeService.update(req.params.id, req.body);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async remove(req, res, next) {
    try {
      const data = await IncomeService.remove(req.params.id);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new IncomeController();
