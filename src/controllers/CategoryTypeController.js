const CategoryTypeService = require('../services/CategoryTypeService');

class CategoryTypeController {
  async index(req, res, next) {
    try {
      const hasPagination = req.query.page || req.query.limit;
      const categories = hasPagination
        ? await CategoryTypeService.getPaginated(req.query)
        : await CategoryTypeService.getAll();
      res.status(200);
      return res.json(categories);
    } catch (err) {
      next(err);
    }
  }

  async getOne(req, res, next) {
    try {
      const category = await CategoryTypeService.getOne(req.params.id);

      if (!category) {
        const error = new Error("Category not found");
        error.status = 404;
        throw error;
      }

      res.status(200);
      return res.json(category);
    } catch (err) {
      next(err);
    }
  }

  async store(req, res, next) {
    try {
      const category = await CategoryTypeService.create(req.body);
      res.status(201);
      return res.json(category);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const category = await CategoryTypeService.update(req.params.id, req.body);
      res.status(200);
      return res.json(category);
    } catch (err) {
      next(err);
    }
  }

  async delete(req, res, next) {
    try {
      const result = await CategoryTypeService.delete(req.params.id);
      res.status(200);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CategoryTypeController();
