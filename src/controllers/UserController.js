const UserService = require('../services/UserService');

class UserController {

  async index(req, res, next) {
    try {
      const hasPagination = req.query.page || req.query.limit;
      const users = hasPagination
        ? await UserService.getPaginated(req.query)
        : await UserService.getAll();
      return res.status(200).json(users);
    } catch (err) {
      next(err);
    }
  }

  async getOne(req, res, next) {
    try {
      const user = await UserService.getOne(req.params.id);

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
      const user = await UserService.create(req.body);
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
    try {
      const { username, password } = req.body;
      const result = await UserService.login(username, password);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new UserController();
