const UserService = require('../services/UserService');
const AuditLogService = require('../services/AuditLogService');

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
        const error = new Error("User not found");
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
      return res.status(201).json(user);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const user = await UserService.update(req.params.id, req.body, req.user);
      return res.status(200).json(user);
    } catch (err) {
      next(err);
    }
  }

  async delete(req, res, next) {
    try {
      const result = await UserService.delete(req.params.id, req.user);
      return res.status(200).json(result);
    } catch (err) {
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
