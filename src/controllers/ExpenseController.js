const ExpenseService = require('../services/ExpenseService');
const AuditLogService = require('../services/AuditLogService');

const toPlainExpense = (expense) => {
  if (!expense) return null;
  return typeof expense.toJSON === 'function' ? expense.toJSON() : { ...expense };
};

const getExpenseLabel = (expense, fallback) => {
  if (!expense) return fallback;
  return expense.description || `Código ${expense.id || fallback}`;
};

class ExpenseController {
  async index(req, res, next) {
    try {
      const hasPagination = req.query.page || req.query.limit;
      const data = hasPagination
        ? await ExpenseService.getPaginated(req.query)
        : await ExpenseService.getAll();
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async getOne(req, res, next) {
    try {
      const data = await ExpenseService.getOne(req.params.id);
      if (!data) throw Object.assign(new Error("Expense not found"), { status: 404 });
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async store(req, res, next) {
    try {
      const data = await ExpenseService.create(req.body);
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'DESPESAS',
        description: `Despesa ${getExpenseLabel(data, 'nova')} cadastrada.`,
        status: 'SUCESSO',
        after: toPlainExpense(data)
      });

      res.status(201).json(data);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'CREATE',
        module: 'DESPESAS',
        description: `Falha ao cadastrar despesa: ${err.message}`,
        status: 'ERRO',
        after: req.body
      });

      next(err);
    }
  }

  async update(req, res, next) {
    let before = null;

    try {
      before = toPlainExpense(await ExpenseService.getOne(req.params.id));
      const data = await ExpenseService.update(req.params.id, req.body);
      const after = toPlainExpense(data);

      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'UPDATE',
        module: 'DESPESAS',
        description: `Despesa ${getExpenseLabel(after, req.params.id)} atualizada.`,
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
        module: 'DESPESAS',
        description: `Falha ao atualizar despesa ${getExpenseLabel(before, req.params.id)}: ${err.message}`,
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
      before = toPlainExpense(await ExpenseService.getOne(req.params.id));
      const data = await ExpenseService.remove(req.params.id);
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'DELETE',
        module: 'DESPESAS',
        description: `Despesa ${getExpenseLabel(before, req.params.id)} removida.`,
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
        module: 'DESPESAS',
        description: `Falha ao remover despesa ${getExpenseLabel(before, req.params.id)}: ${err.message}`,
        status: 'ERRO',
        before,
        after: null
      });

      next(err);
    }
  }
}

module.exports = new ExpenseController();
