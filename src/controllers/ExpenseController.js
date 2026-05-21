const ExpenseService = require('../services/ExpenseService');

class ExpenseController {
  async index(req, res, next) {
    try {
      const hasPagination = req.query.page || req.query.limit;
      const data = hasPagination
        ? await ExpenseService.getPaginated(req.query)
        : await ExpenseService.getAll();
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async getOne(req, res, next) {
    try {
      const data = await ExpenseService.getOne(req.params.id);
      if (!data) throw Object.assign(new Error("Expense not found"), { status: 404 });
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async store(req, res, next) {
    try {
      const data = await ExpenseService.create(req.body);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const data = await ExpenseService.update(req.params.id, req.body);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async remove(req, res, next) {
    try {
      const data = await ExpenseService.remove(req.params.id);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ExpenseController();
