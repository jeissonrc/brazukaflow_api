const AccountsReceivableService = require('../services/AccountsReceivableService');
const AuditLogService = require('../services/AuditLogService');

const toPlainReceivable = (receivable) => {
  if (!receivable) return null;
  return typeof receivable.toJSON === 'function' ? receivable.toJSON() : { ...receivable };
};

const getReceivableLabel = (receivable, fallback) => {
  if (!receivable) return fallback;
  return receivable.description || `Código ${receivable.id || fallback}`;
};

const toPlainGeneratedIncome = (receivable) => {
  if (!receivable) return null;
  const generatedIncome = typeof receivable.get === 'function'
    ? receivable.get('generatedIncome')
    : receivable.generatedIncome;

  if (!generatedIncome) return null;
  return typeof generatedIncome.toJSON === 'function' ? generatedIncome.toJSON() : { ...generatedIncome };
};

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
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'CONTAS_RECEBER',
        description: `Conta a receber ${getReceivableLabel(data, 'nova')} cadastrada.`,
        status: 'SUCESSO',
        after: toPlainReceivable(data)
      });

      res.status(201).json(data);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'CONTAS_RECEBER',
        description: `Falha ao cadastrar conta a receber: ${err.message}`,
        status: 'ERRO',
        after: req.body
      });

      next(err);
    }
  }

  async storeMultiple(req, res, next) {
    try {
      const { originId, ...baseData } = req.body;
      const data = await AccountsReceivableService.createMultipleFromOrigin(originId, baseData);
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'CONTAS_RECEBER',
        description: `${data.length} conta(s) a receber gerada(s) em massa pela origem ${originId}.`,
        status: 'SUCESSO',
        after: data.map(toPlainReceivable)
      });

      res.status(201).json(data);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'CONTAS_RECEBER',
        description: `Falha ao gerar contas a receber em massa: ${err.message}`,
        status: 'ERRO',
        after: req.body
      });

      next(err);
    }
  }

  async update(req, res, next) {
    let before = null;

    try {
      before = toPlainReceivable(await AccountsReceivableService.getOne(req.params.id));
      const data = await AccountsReceivableService.update(req.params.id, req.body);
      const after = toPlainReceivable(data);

      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'UPDATE',
        module: 'CONTAS_RECEBER',
        description: `Conta a receber ${getReceivableLabel(after, req.params.id)} atualizada.`,
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
        module: 'CONTAS_RECEBER',
        description: `Falha ao atualizar conta a receber ${getReceivableLabel(before, req.params.id)}: ${err.message}`,
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
      before = toPlainReceivable(await AccountsReceivableService.getOne(req.params.id));
      const data = await AccountsReceivableService.remove(req.params.id);
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'DELETE',
        module: 'CONTAS_RECEBER',
        description: `Conta a receber ${getReceivableLabel(before, req.params.id)} removida.`,
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
        module: 'CONTAS_RECEBER',
        description: `Falha ao remover conta a receber ${getReceivableLabel(before, req.params.id)}: ${err.message}`,
        status: 'ERRO',
        before,
        after: null
      });

      next(err);
    }
  }

  async receive(req, res, next) {
    let before = null;

    try {
      before = toPlainReceivable(await AccountsReceivableService.getOne(req.params.id));
      const data = await AccountsReceivableService.markAsReceived(req.params.id, req.body);
      const after = toPlainReceivable(data);
      const generatedIncome = toPlainGeneratedIncome(data);
      const auditAction = req.body?.auditAsUpdate ? 'UPDATE' : 'RECEBIMENTO';

      if (!req.body?.skipAudit) {
        await AuditLogService.safeRegister({
          req,
          user: req.user,
          action: auditAction,
          module: 'CONTAS_RECEBER',
          description: `Conta a receber ${getReceivableLabel(after, req.params.id)} marcada como recebida.`,
          status: 'SUCESSO',
          before,
          after
        });
      }

      if (generatedIncome) {
        await AuditLogService.safeRegister({
          req,
          user: req.user,
          action: 'CREATE',
          module: 'RECEITAS',
          description: `Receita ${generatedIncome.description || `Código ${generatedIncome.id}`} gerada a partir da conta a receber ${getReceivableLabel(after, req.params.id)}.`,
          status: 'SUCESSO',
          before: null,
          after: generatedIncome
        });
      }

      res.status(200).json(data);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: req.body?.auditAsUpdate ? 'UPDATE' : 'RECEBIMENTO',
        module: 'CONTAS_RECEBER',
        description: `Falha ao marcar conta a receber ${getReceivableLabel(before, req.params.id)} como recebida: ${err.message}`,
        status: 'ERRO',
        before,
        after: req.body
      });

      next(err);
    }
  }

  async unreceive(req, res, next) {
    let before = null;

    try {
      before = toPlainReceivable(await AccountsReceivableService.getOne(req.params.id));
      const data = await AccountsReceivableService.unreceive(req.params.id);
      const after = toPlainReceivable(data);
      const auditAction = req.body?.auditAsUpdate ? 'UPDATE' : 'DESRECEBIMENTO';

      if (!req.body?.skipAudit) {
        await AuditLogService.safeRegister({
          req,
          user: req.user,
          action: auditAction,
          module: 'CONTAS_RECEBER',
          description: `Conta a receber ${getReceivableLabel(after, req.params.id)} desmarcada como recebida.`,
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
        action: req.body?.auditAsUpdate ? 'UPDATE' : 'DESRECEBIMENTO',
        module: 'CONTAS_RECEBER',
        description: `Falha ao desmarcar conta a receber ${getReceivableLabel(before, req.params.id)} como recebida: ${err.message}`,
        status: 'ERRO',
        before,
        after: null
      });

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
