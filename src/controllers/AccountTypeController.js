const AccountTypeService = require('../services/AccountTypeService');

class AccountTypeController {
  async index(req, res, next) {
    try {
      const hasPagination = req.query.page || req.query.limit;
      const accounts = hasPagination
        ? await AccountTypeService.getPaginated(req.query)
        : await AccountTypeService.getAll();
      res.status(200);
      return res.json(accounts);
    } catch (err) {
      next(err);
    }
  }

  async getOne(req, res, next) {
    try {
      const account = await AccountTypeService.getOne(req.params.id);
      if (!account) {
        const error = new Error("Account type not found");
        error.status = 404;
        throw error;
      }
      res.status(200);
      return res.json(account);
    } catch (err) {
      next(err);
    }
  }

  async store(req, res, next) {
    try {
      const account = await AccountTypeService.create(req.body);
      res.status(201);
      return res.json(account);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const account = await AccountTypeService.update(req.params.id, req.body);
      res.status(200);
      return res.json(account);
    } catch (err) {
      next(err);
    }
  }

  async delete(req, res, next) {
    try {
      const result = await AccountTypeService.delete(req.params.id);
      res.status(200);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AccountTypeController();
