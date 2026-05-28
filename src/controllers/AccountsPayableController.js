const AccountsPayableService = require('../services/AccountsPayableService');
const AuditLogService = require('../services/AuditLogService');

const toPlainPayable = (payable) => {
  if (!payable) return null;
  return typeof payable.toJSON === 'function' ? payable.toJSON() : { ...payable };
};

const getPayableLabel = (payable, fallback) => {
  if (!payable) return fallback;
  return payable.description || `Código ${payable.id || fallback}`;
};

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
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'CONTAS_PAGAR',
        description: `Conta a pagar ${getPayableLabel(data, 'nova')} cadastrada.`,
        status: 'SUCESSO',
        after: toPlainPayable(data)
      });

      res.status(201).json(data);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'CONTAS_PAGAR',
        description: `Falha ao cadastrar conta a pagar: ${err.message}`,
        status: 'ERRO',
        after: req.body
      });

      next(err);
    }
  }

  async storeMultiple(req, res, next) {
    try {
      const { originId, ...baseData } = req.body;
      const data = await AccountsPayableService.createMultipleFromOrigin(originId, baseData);
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'CONTAS_PAGAR',
        description: `${data.length} conta(s) a pagar gerada(s) em massa pela origem ${originId}.`,
        status: 'SUCESSO',
        after: data.map(toPlainPayable)
      });

      res.status(201).json(data);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'CONTAS_PAGAR',
        description: `Falha ao gerar contas a pagar em massa: ${err.message}`,
        status: 'ERRO',
        after: req.body
      });

      next(err);
    }
  }

  async update(req, res, next) {
    let before = null;

    try {
      before = toPlainPayable(await AccountsPayableService.getOne(req.params.id));
      const data = await AccountsPayableService.update(req.params.id, req.body);
      const after = toPlainPayable(data);

      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'UPDATE',
        module: 'CONTAS_PAGAR',
        description: `Conta a pagar ${getPayableLabel(after, req.params.id)} atualizada.`,
        status: 'SUCESSO',
        before,
        after
      });

      res.status(200).json(data);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'UPDATE',
        module: 'CONTAS_PAGAR',
        description: `Falha ao atualizar conta a pagar ${getPayableLabel(before, req.params.id)}: ${err.message}`,
        status: 'ERRO',
        before,
        after: req.body
      });

      next(err);
    }
  }

  async remove(req, res, next) {
    let before = null;

    try {
      before = toPlainPayable(await AccountsPayableService.getOne(req.params.id));
      const data = await AccountsPayableService.remove(req.params.id);
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'DELETE',
        module: 'CONTAS_PAGAR',
        description: `Conta a pagar ${getPayableLabel(before, req.params.id)} removida.`,
        status: 'SUCESSO',
        before,
        after: null
      });

      res.status(200).json(data);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'DELETE',
        module: 'CONTAS_PAGAR',
        description: `Falha ao remover conta a pagar ${getPayableLabel(before, req.params.id)}: ${err.message}`,
        status: 'ERRO',
        before,
        after: null
      });

      next(err);
    }
  }

  async pay(req, res, next) {
    let before = null;

    try {
      before = toPlainPayable(await AccountsPayableService.getOne(req.params.id));
      const data = await AccountsPayableService.markAsPaid(req.params.id, req.body);
      const after = toPlainPayable(data);
      const auditAction = req.body?.auditAsUpdate ? 'UPDATE' : 'PAGAMENTO';

      if (!req.body?.skipAudit) {
        await AuditLogService.safeRegister({
          req,
          user: req.user,
          action: auditAction,
          module: 'CONTAS_PAGAR',
          description: `Conta a pagar ${getPayableLabel(after, req.params.id)} marcada como paga.`,
          status: 'SUCESSO',
          before,
          after
        });
      }

      res.status(200).json(data);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: req.body?.auditAsUpdate ? 'UPDATE' : 'PAGAMENTO',
        module: 'CONTAS_PAGAR',
        description: `Falha ao marcar conta a pagar ${getPayableLabel(before, req.params.id)} como paga: ${err.message}`,
        status: 'ERRO',
        before,
        after: req.body
      });

      next(err);
    }
  }

  async unpay(req, res, next) {
    let before = null;

    try {
      before = toPlainPayable(await AccountsPayableService.getOne(req.params.id));
      const data = await AccountsPayableService.unpay(req.params.id);
      const after = toPlainPayable(data);
      const auditAction = req.body?.auditAsUpdate ? 'UPDATE' : 'DESPAGAMENTO';

      if (!req.body?.skipAudit) {
        await AuditLogService.safeRegister({
          req,
          user: req.user,
          action: auditAction,
          module: 'CONTAS_PAGAR',
          description: `Conta a pagar ${getPayableLabel(after, req.params.id)} desmarcada como paga.`,
          status: 'SUCESSO',
          before,
          after
        });
      }

      res.status(200).json(data);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: req.body?.auditAsUpdate ? 'UPDATE' : 'DESPAGAMENTO',
        module: 'CONTAS_PAGAR',
        description: `Falha ao desmarcar conta a pagar ${getPayableLabel(before, req.params.id)} como paga: ${err.message}`,
        status: 'ERRO',
        before,
        after: null
      });

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
