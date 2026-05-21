const PaymentTypeService = require('../services/PaymentTypeService');

class PaymentTypeController {
  async index(req, res, next) {
    try {
      const hasPagination = req.query.page || req.query.limit;
      const payments = hasPagination
        ? await PaymentTypeService.getPaginated(req.query)
        : await PaymentTypeService.getAll();
      res.status(200);
      return res.json(payments);
    } catch (err) {
      next(err);
    }
  }

  async getOne(req, res, next) {
    try {
      const payment = await PaymentTypeService.getOne(req.params.id);
      if (!payment) {
        const error = new Error("Payment type not found");
        error.status = 404;
        throw error;
      }
      res.status(200);
      return res.json(payment);
    } catch (err) {
      next(err);
    }
  }

  async store(req, res, next) {
    try {
      const payment = await PaymentTypeService.create(req.body);
      res.status(201);
      return res.json(payment);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const payment = await PaymentTypeService.update(req.params.id, req.body);
      res.status(200);
      return res.json(payment);
    } catch (err) {
      next(err);
    }
  }

  async delete(req, res, next) {
    try {
      const result = await PaymentTypeService.delete(req.params.id);
      res.status(200);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new PaymentTypeController();
