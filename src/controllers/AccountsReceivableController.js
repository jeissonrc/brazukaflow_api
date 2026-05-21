const AccountsReceivableService = require('../services/AccountsReceivableService');

class AccountsReceivableController {

  async index(req, res, next) {
    try {
      const hasPagination = req.query.page || req.query.limit;
      const data = hasPagination
        ? await AccountsReceivableService.getPaginated(req.query)
        : await AccountsReceivableService.getAll();
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async getOne(req, res, next) {
    try {
      const data = await AccountsReceivableService.getOne(req.params.id);

      if (!data) {
        const error = new Error('AccountsReceivable not found');
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
      const data = await AccountsReceivableService.create(req.body);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  }

  async storeMultiple(req, res, next) {
    try {
      const { originId, ...baseData } = req.body;
      const data = await AccountsReceivableService.createMultipleFromOrigin(originId, baseData);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const data = await AccountsReceivableService.update(req.params.id, req.body);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async remove(req, res, next) {
    try {
      const data = await AccountsReceivableService.remove(req.params.id);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async receive(req, res, next) {
    try {
      const data = await AccountsReceivableService.markAsReceived(req.params.id, req.body);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async unreceive(req, res, next) {
    try {
      const data = await AccountsReceivableService.unreceive(req.params.id);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  // --------------------------
  // SEARCH (NOVO)
  // --------------------------
  async search(req, res, next) {
    try {
      const data = await AccountsReceivableService.search(req.body);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AccountsReceivableController();
