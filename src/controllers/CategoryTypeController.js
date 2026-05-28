const CategoryTypeService = require('../services/CategoryTypeService');
const AuditLogService = require('../services/AuditLogService');

const toPlainCategory = (category) => {
  if (!category) return null;
  return typeof category.toJSON === 'function' ? category.toJSON() : { ...category };
};

const isActiveStatus = (status) => status === true || status === 1 || status === '1' || status === 'true';

const getUpdateAction = (before, after) => {
  const statusChanged = isActiveStatus(before?.status) !== isActiveStatus(after?.status);
  const changedFields = [
    before?.description !== after?.description,
    before?.type !== after?.type,
    (before?.specie || '') !== (after?.specie || '')
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
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'PLANO_CONTAS_CATEGORIAS',
        description: `Categoria ${category.description} cadastrada.`,
        status: 'SUCESSO',
        after: toPlainCategory(category)
      });

      res.status(201);
      return res.json(category);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'PLANO_CONTAS_CATEGORIAS',
        description: `Falha ao cadastrar categoria: ${err.message}`,
        status: 'ERRO',
        after: req.body
      });

      next(err);
    }
  }

  async update(req, res, next) {
    let before = null;

    try {
      before = toPlainCategory(await CategoryTypeService.getOne(req.params.id));
      const category = await CategoryTypeService.update(req.params.id, req.body);
      const after = toPlainCategory(category);

      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: getUpdateAction(before, after),
        module: 'PLANO_CONTAS_CATEGORIAS',
        description: `Categoria ${after?.description || req.params.id} atualizada.`,
        status: 'SUCESSO',
        before,
        after
      });

      res.status(200);
      return res.json(category);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: getAttemptedUpdateAction(before, req.body),
        module: 'PLANO_CONTAS_CATEGORIAS',
        description: `Falha ao atualizar categoria ${before?.description || req.params.id}: ${err.message}`,
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
      before = toPlainCategory(await CategoryTypeService.getOne(req.params.id));
      const result = await CategoryTypeService.delete(req.params.id);
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'DELETE',
        module: 'PLANO_CONTAS_CATEGORIAS',
        description: `Categoria ${before?.description || req.params.id} removida.`,
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
        module: 'PLANO_CONTAS_CATEGORIAS',
        description: `Falha ao remover categoria ${before?.description || req.params.id}: ${err.message}`,
        status: 'ERRO',
        before,
        after: null
      });

      next(err);
    }
  }
}

module.exports = new CategoryTypeController();
