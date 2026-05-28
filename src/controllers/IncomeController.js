const IncomeService = require('../services/IncomeService');
const AuditLogService = require('../services/AuditLogService');

const toPlainIncome = (income) => {
  if (!income) return null;
  return typeof income.toJSON === 'function' ? income.toJSON() : { ...income };
};

const getIncomeLabel = (income, fallback) => {
  if (!income) return fallback;
  return income.description || `Código ${income.id || fallback}`;
};

class IncomeController {
  async index(req, res, next) {
    try {
      const hasPagination = req.query.page || req.query.limit;
      const data = hasPagination
        ? await IncomeService.getPaginated(req.query)
        : await IncomeService.getAll();
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async getOne(req, res, next) {
    try {
      const data = await IncomeService.getOne(req.params.id);
      if (!data) throw Object.assign(new Error('Income not found'), { status: 404 });
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async store(req, res, next) {
    try {
      const data = await IncomeService.create(req.body);
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'RECEITAS',
        description: `Receita ${getIncomeLabel(data, 'nova')} cadastrada.`,
        status: 'SUCESSO',
        after: toPlainIncome(data)
      });

      res.status(201).json(data);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'RECEITAS',
        description: `Falha ao cadastrar receita: ${err.message}`,
        status: 'ERRO',
        after: req.body
      });

      next(err);
    }
  }

  async update(req, res, next) {
    let before = null;

    try {
      before = toPlainIncome(await IncomeService.getOne(req.params.id));
      const data = await IncomeService.update(req.params.id, req.body);
      const after = toPlainIncome(data);

      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'UPDATE',
        module: 'RECEITAS',
        description: `Receita ${getIncomeLabel(after, req.params.id)} atualizada.`,
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
        module: 'RECEITAS',
        description: `Falha ao atualizar receita ${getIncomeLabel(before, req.params.id)}: ${err.message}`,
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
      before = toPlainIncome(await IncomeService.getOne(req.params.id));
      const data = await IncomeService.remove(req.params.id);
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'DELETE',
        module: 'RECEITAS',
        description: `Receita ${getIncomeLabel(before, req.params.id)} removida.`,
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
        module: 'RECEITAS',
        description: `Falha ao remover receita ${getIncomeLabel(before, req.params.id)}: ${err.message}`,
        status: 'ERRO',
        before,
        after: null
      });

      next(err);
    }
  }
}

module.exports = new IncomeController();
