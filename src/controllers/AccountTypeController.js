const AccountTypeService = require('../services/AccountTypeService');
const AuditLogService = require('../services/AuditLogService');

const toPlainAccountType = (accountType) => {
  if (!accountType) return null;
  return typeof accountType.toJSON === 'function' ? accountType.toJSON() : { ...accountType };
};

const isActiveStatus = (status) => status === true || status === 1 || status === '1' || status === 'true';

const getUpdateAction = (before, after) => {
  const statusChanged = isActiveStatus(before?.status) !== isActiveStatus(after?.status);
  const changedFields = [
    before?.description !== after?.description,
    before?.type !== after?.type,
    (before?.specie || '') !== (after?.specie || ''),
    Number(before?.categoryId) !== Number(after?.categoryId)
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
    return getUpdateAction(before, { ...before, ...data });
  }

  return 'ALTERACAO';
};

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
        const error = new Error('Tipo de conta não encontrado.');
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
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'PLANO_CONTAS_TIPOS',
        description: `Tipo de conta ${account.description} cadastrado.`,
        status: 'SUCESSO',
        after: toPlainAccountType(account)
      });

      res.status(201);
      return res.json(account);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'PLANO_CONTAS_TIPOS',
        description: `Falha ao cadastrar tipo de conta: ${err.message}`,
        status: 'ERRO',
        after: req.body
      });

      next(err);
    }
  }

  async update(req, res, next) {
    let before = null;

    try {
      before = toPlainAccountType(await AccountTypeService.getOne(req.params.id));
      const account = await AccountTypeService.update(req.params.id, req.body);
      const after = toPlainAccountType(account);

      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: getUpdateAction(before, after),
        module: 'PLANO_CONTAS_TIPOS',
        description: `Tipo de conta ${after?.description || req.params.id} atualizado.`,
        status: 'SUCESSO',
        before,
        after
      });

      res.status(200);
      return res.json(account);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: getAttemptedUpdateAction(before, req.body),
        module: 'PLANO_CONTAS_TIPOS',
        description: `Falha ao atualizar tipo de conta ${before?.description || req.params.id}: ${err.message}`,
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
      before = toPlainAccountType(await AccountTypeService.getOne(req.params.id));
      const usage = await AccountTypeService.getLinkedUsage(req.params.id);

      if (usage.total > 0) {
        const details = AccountTypeService.formatLinkedUsage(usage);
        const error = new Error(`Este tipo de conta está vinculado a ${details} e não pode ser removido.`);
        error.status = 400;
        throw error;
      }

      const result = await AccountTypeService.delete(req.params.id);
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'DELETE',
        module: 'PLANO_CONTAS_TIPOS',
        description: `Tipo de conta ${before?.description || req.params.id} removido.`,
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
        module: 'PLANO_CONTAS_TIPOS',
        description: `Falha ao remover tipo de conta ${before?.description || req.params.id}: ${err.message}`,
        status: 'ERRO',
        before,
        after: null
      });

      next(err);
    }
  }
}

module.exports = new AccountTypeController();
