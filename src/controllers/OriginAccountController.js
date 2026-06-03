const OriginAccountService = require('../services/OriginAccountService');
const AuditLogService = require('../services/AuditLogService');
const User = require('../models/User');
const { PROFILE_IDS } = require('../constants/profileIds');

const toPlainOrigin = (origin) => {
  if (!origin) return null;
  return typeof origin.toJSON === 'function' ? origin.toJSON() : { ...origin };
};

const isActiveStatus = (status) => status === true || status === 1 || status === '1' || status === 'true';

const ensureCanManageOrigins = async (requester) => {
  const user = await User.findByPk(requester?.id);

  if (!user || ![PROFILE_IDS.SUPER_ADMIN, PROFILE_IDS.ADMIN].includes(Number(user.profileId))) {
    const error = new Error('Apenas Administrador ou Super Admin pode gerenciar origens.');
    error.status = 403;
    throw error;
  }

  return user;
};

const getUpdateAction = (before, after) => {
  const statusChanged = isActiveStatus(before?.status) !== isActiveStatus(after?.status);
  const changedFields = [
    before?.description !== after?.description,
    (before?.obs || '') !== (after?.obs || ''),
    Number(before?.category) !== Number(after?.category),
    isActiveStatus(before?.person) !== isActiveStatus(after?.person)
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

class OriginAccountController {
  async index(req, res, next) {
    try {
      const hasPagination = req.query.page || req.query.limit;
      const data = hasPagination
        ? await OriginAccountService.getPaginated(req.query)
        : await OriginAccountService.getAll();
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async getOne(req, res, next) {
    try {
      const data = await OriginAccountService.getOne(req.params.id);
      if (!data) {
        const err = new Error('Origem não encontrada.');
        err.status = 404;
        throw err;
      }
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async store(req, res, next) {
    try {
      const data = await OriginAccountService.create(req.body);

      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'ORIGENS',
        description: `Origem ${data.description} cadastrada.`,
        status: 'SUCESSO',
        after: toPlainOrigin(data)
      });

      res.status(201).json(data);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'ORIGENS',
        description: `Falha ao cadastrar origem: ${err.message}`,
        status: 'ERRO',
        after: req.body
      });

      next(err);
    }
  }

  async update(req, res, next) {
    let before = null;

    try {
      await ensureCanManageOrigins(req.user);
      before = toPlainOrigin(await OriginAccountService.getOne(req.params.id));
      const data = await OriginAccountService.update(req.params.id, req.body);
      const after = toPlainOrigin(data);

      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: getUpdateAction(before, after),
        module: 'ORIGENS',
        description: `Origem ${after?.description || req.params.id} atualizada.`,
        status: 'SUCESSO',
        before,
        after
      });

      res.status(200).json(data);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: getAttemptedUpdateAction(before, req.body),
        module: 'ORIGENS',
        description: `Falha ao atualizar origem ${before?.description || req.params.id}: ${err.message}`,
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
      await ensureCanManageOrigins(req.user);
      before = toPlainOrigin(await OriginAccountService.getOne(req.params.id));
      const result = await OriginAccountService.remove(req.params.id);

      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'DELETE',
        module: 'ORIGENS',
        description: `Origem ${before?.description || req.params.id} removida.`,
        status: 'SUCESSO',
        before,
        after: null
      });

      res.status(200).json(result);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'DELETE',
        module: 'ORIGENS',
        description: `Falha ao remover origem ${before?.description || req.params.id}: ${err.message}`,
        status: 'ERRO',
        before,
        after: null
      });

      next(err);
    }
  }
}

module.exports = new OriginAccountController();
