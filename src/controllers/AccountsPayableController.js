const AccountsPayableService = require('../services/AccountsPayableService');

class AccountsPayableController {

  async index(req, res, next) {
    try {
      const hasPagination = req.query.page || req.query.limit;
      const data = hasPagination
        ? await AccountsPayableService.getPaginated(req.query)
        : await AccountsPayableService.getAll();
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async getOne(req, res, next) {
    try {
      const data = await AccountsPayableService.getOne(req.params.id);
      if (!data) {
        const error = new Error('AccountsPayable not found');
        error.status = 404;
        throw error;
      }
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async store(req, res, next) {
    try {
      const data = await AccountsPayableService.create(req.body);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  }

  async storeMultiple(req, res, next) {
    try {
      const { originId, ...baseData } = req.body;
      const data = await AccountsPayableService.createMultipleFromOrigin(originId, baseData);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const data = await AccountsPayableService.update(req.params.id, req.body);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async remove(req, res, next) {
    try {
      const data = await AccountsPayableService.remove(req.params.id);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async pay(req, res, next) {
    try {
      const data = await AccountsPayableService.markAsPaid(req.params.id, req.body);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async unpay(req, res, next) {
    try {
      const data = await AccountsPayableService.unpay(req.params.id);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  // ------------------------------------------------
  // SEARCH (NOVO) - segue seu padrão de controller
  // ------------------------------------------------
  async search(req, res, next) {
    try {
      const data = await AccountsPayableService.search(req.body);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AccountsPayableController();
