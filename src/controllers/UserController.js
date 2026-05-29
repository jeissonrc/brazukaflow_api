const UserService = require('../services/UserService');
const AuditLogService = require('../services/AuditLogService');

const toPlainUser = (user) => {
  if (!user) return null;

  const plain = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
  delete plain.password;
  return plain;
};

const sanitizeUserPayload = (payload = {}) => {
  const sanitized = { ...payload };

  if (sanitized.password !== undefined) {
    sanitized.password = sanitized.password ? '[senha informada]' : '[senha vazia]';
  }

  return sanitized;
};

const getUpdateAction = (before, after, requestBody = {}) => {
  const statusChanged = Number(before?.active) !== Number(after?.active);
  const changedFields = [
    before?.username !== after?.username,
    before?.name !== after?.name,
    Number(before?.profileId) !== Number(after?.profileId),
    Boolean(requestBody.password)
  ].filter(Boolean);
  const onlyStatusChanged = statusChanged && changedFields.length === 0;

  if (onlyStatusChanged && Number(before?.active) !== 1 && Number(after?.active) === 1) {
    return 'ATIVACAO';
  }

  if (onlyStatusChanged && Number(before?.active) === 1 && Number(after?.active) !== 1) {
    return 'INATIVACAO';
  }

  if (statusChanged || changedFields.length > 0) {
    return 'ALTERACAO';
  }

  return 'UPDATE';
};

class UserController {

  async index(req, res, next) {
    try {
      const hasPagination = req.query.page || req.query.limit;
      const users = hasPagination
        ? await UserService.getPaginated(req.query, req.user)
        : await UserService.getAll(req.user);
      return res.status(200).json(users);
    } catch (err) {
      next(err);
    }
  }

  async getOne(req, res, next) {
    try {
      const user = await UserService.getOne(req.params.id, req.user);

      if (!user) {
        const error = new Error("Usuário não encontrado.");
        error.status = 404;
        throw error;
      }

      return res.status(200).json(user);
    } catch (err) {
      next(err);
    }
  }

  async store(req, res, next) {
    try {
      const user = await UserService.create(req.body, req.user);
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'USUARIOS',
        description: `Usuário ${user.username} cadastrado.`,
        status: 'SUCESSO',
        after: {
          ...toPlainUser(user),
          passwordChanged: Boolean(req.body?.password)
        }
      });

      return res.status(201).json(user);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'USUARIOS',
        description: `Falha ao cadastrar usuário: ${err.message}`,
        status: 'ERRO',
        after: sanitizeUserPayload(req.body)
      });

      next(err);
    }
  }

  async update(req, res, next) {
    let before = null;

    try {
      before = toPlainUser(await UserService.getOne(req.params.id, req.user));
      const user = await UserService.update(req.params.id, req.body, req.user);
      const after = toPlainUser(user);

      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: getUpdateAction(before, after, req.body),
        module: 'USUARIOS',
        description: `Usuário ${after?.username || req.params.id} atualizado.`,
        status: 'SUCESSO',
        before,
        after: {
          ...after,
          passwordChanged: Boolean(req.body?.password)
        }
      });

      return res.status(200).json(user);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'UPDATE',
        module: 'USUARIOS',
        description: `Falha ao atualizar usuário ${req.params.id}: ${err.message}`,
        status: 'ERRO',
        before,
        after: sanitizeUserPayload(req.body)
      });

      next(err);
    }
  }

  async delete(req, res, next) {
    let before = null;

    try {
      try {
        before = toPlainUser(await UserService.getOne(req.params.id, req.user));
      } catch {
        before = { id: Number(req.params.id) || req.params.id };
      }

      const result = await UserService.delete(req.params.id, req.user);
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'DELETE',
        module: 'USUARIOS',
        description: `Usuário ${before?.username || req.params.id} removido.`,
        status: 'SUCESSO',
        before,
        after: null
      });

      return res.status(200).json(result);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'DELETE',
        module: 'USUARIOS',
        description: `Falha ao remover usuário ${before?.username || req.params.id}: ${err.message}`,
        status: 'ERRO',
        before,
        after: null
      });

      next(err);
    }
  }

  async login(req, res, next) {
    const { username, password } = req.body;

    try {
      const result = await UserService.login(username, password);
      await AuditLogService.safeRegister({
        req,
        user: result.user,
        action: 'LOGIN_SUCCESS',
        module: 'AUTENTICACAO',
        description: `Login realizado com sucesso para ${result.user.username}.`,
        status: 'SUCESSO',
        after: {
          username: result.user.username,
          profileId: result.user.profileId,
          profile: result.user.profile?.name ?? null
        }
      });

      return res.status(200).json(result);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        username,
        action: 'LOGIN_FAILED',
        module: 'AUTENTICACAO',
        description: `Tentativa de login sem sucesso para ${username || 'usuário não informado'}.`,
        status: 'ERRO',
        after: {
          username: username || null,
          reason: err.message
        }
      });

      next(err);
    }
  }
}

module.exports = new UserController();
