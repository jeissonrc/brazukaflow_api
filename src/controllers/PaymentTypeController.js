const PaymentTypeService = require('../services/PaymentTypeService');
const AuditLogService = require('../services/AuditLogService');

const toPlainPaymentType = (paymentType) => {
  if (!paymentType) return null;
  return typeof paymentType.toJSON === 'function' ? paymentType.toJSON() : { ...paymentType };
};

const isActiveStatus = (status) => status === true || status === 1 || status === '1' || status === 'true';

const getUpdateAction = (before, after) => {
  const statusChanged = isActiveStatus(before?.status) !== isActiveStatus(after?.status);
  const changedFields = [
    before?.name !== after?.name,
    (before?.description || '') !== (after?.description || '')
  ].filter(Boolean);
  const onlyStatusChanged = statusChanged && changedFields.length === 0;

  if (onlyStatusChanged && !isActiveStatus(before?.status) && isActiveStatus(after?.status)) {
    return 'ATIVACAO';
  }

  if (onlyStatusChanged && isActiveStatus(before?.status) && !isActiveStatus(after?.status)) {
    return 'INATIVACAO';
  }

  return 'ALTERACAO';
};

const getAttemptedUpdateAction = (before, data = {}) => {
  if (before && data.status !== undefined) {
    const next = { ...before, ...data };
    return getUpdateAction(before, next);
  }

  return 'ALTERACAO';
};

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
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'TIPOS_PAGAMENTO',
        description: `Tipo de pagamento ${payment.name} cadastrado.`,
        status: 'SUCESSO',
        after: toPlainPaymentType(payment)
      });

      res.status(201);
      return res.json(payment);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'TIPOS_PAGAMENTO',
        description: `Falha ao cadastrar tipo de pagamento: ${err.message}`,
        status: 'ERRO',
        after: req.body
      });

      next(err);
    }
  }

  async update(req, res, next) {
    let before = null;

    try {
      before = toPlainPaymentType(await PaymentTypeService.getOne(req.params.id));
      const payment = await PaymentTypeService.update(req.params.id, req.body);
      const after = toPlainPaymentType(payment);

      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: getUpdateAction(before, after),
        module: 'TIPOS_PAGAMENTO',
        description: `Tipo de pagamento ${after?.name || req.params.id} atualizado.`,
        status: 'SUCESSO',
        before,
        after
      });

      res.status(200);
      return res.json(payment);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: getAttemptedUpdateAction(before, req.body),
        module: 'TIPOS_PAGAMENTO',
        description: `Falha ao atualizar tipo de pagamento ${before?.name || req.params.id}: ${err.message}`,
        status: 'ERRO',
        before,
        after: req.body
      });

      next(err);
    }
  }

  async delete(req, res, next) {
    let before = null;

    try {
      before = toPlainPaymentType(await PaymentTypeService.getOne(req.params.id));
      const result = await PaymentTypeService.delete(req.params.id);
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'DELETE',
        module: 'TIPOS_PAGAMENTO',
        description: `Tipo de pagamento ${before?.name || req.params.id} removido.`,
        status: 'SUCESSO',
        before,
        after: null
      });

      res.status(200);
      return res.json(result);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'DELETE',
        module: 'TIPOS_PAGAMENTO',
        description: `Falha ao remover tipo de pagamento ${before?.name || req.params.id}: ${err.message}`,
        status: 'ERRO',
        before,
        after: null
      });

      next(err);
    }
  }
}

module.exports = new PaymentTypeController();
