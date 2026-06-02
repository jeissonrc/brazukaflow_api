const Expense = require('../models/Expense');
const CashAccount = require('../models/CashAccount');
const AccountType = require('../models/AccountType');
const CategoryType = require('../models/CategoryType');
const AccountsPayable = require('../models/AccountsPayable');
const { Op } = require('sequelize');

const getTodayDateOnly = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeDateOnly = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const includeExpenseRelations = [
  { model: CashAccount, as: 'cashAccount' },
  { model: AccountType, as: 'accountType', include: [{ model: CategoryType, as: 'category' }] },
  { model: AccountsPayable, as: 'accountPayable' }
];

const getPaginationNumber = (value, fallback, { min = 1, max = 1000 } = {}) => {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, min), max);
};

class ExpenseService {
  async getAll() {
    return await Expense.findAll({
      include: includeExpenseRelations
    });
  }

  async getPaginated(filters = {}) {
    const page = getPaginationNumber(filters.page, 1);
    const limit = getPaginationNumber(filters.limit, 10, { min: 1, max: 100 });
    const offset = (page - 1) * limit;
    const where = {};
    const include = includeExpenseRelations;

    if (filters.accountTypeId && filters.accountTypeId !== 'todos') {
      where.accountTypeId = filters.accountTypeId;
    }

    if (filters.cashAccountId && filters.cashAccountId !== 'todas') {
      where.cashAccountId = filters.cashAccountId;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.expenseDate = {
        ...(filters.dateFrom ? { [Op.gte]: filters.dateFrom } : {}),
        ...(filters.dateTo ? { [Op.lte]: filters.dateTo } : {})
      };
    }

    if (filters.search && String(filters.search).trim()) {
      const search = String(filters.search).trim();
      const categoryMatches = await CategoryType.findAll({
        attributes: ['id'],
        where: {
          description: { [Op.like]: `%${search}%` }
        }
      });
      const categoryIds = categoryMatches.map((category) => category.id);
      const [accountTypeMatches, cashAccountMatches] = await Promise.all([
        AccountType.findAll({
          attributes: ['id'],
          where: {
            [Op.or]: [
              { description: { [Op.like]: `%${search}%` } },
              ...(categoryIds.length > 0 ? [{ categoryId: { [Op.in]: categoryIds } }] : [])
            ]
          }
        }),
        CashAccount.findAll({
          attributes: ['id'],
          where: {
            name: { [Op.like]: `%${search}%` }
          }
        })
      ]);
      const accountTypeIds = accountTypeMatches.map((accountType) => accountType.id);
      const cashAccountIds = cashAccountMatches.map((cashAccount) => cashAccount.id);
      const searchConditions = [
        { description: { [Op.like]: `%${search}%` } }
      ];

      if (accountTypeIds.length > 0) {
        searchConditions.push({ accountTypeId: { [Op.in]: accountTypeIds } });
      }

      if (cashAccountIds.length > 0) {
        searchConditions.push({ cashAccountId: { [Op.in]: cashAccountIds } });
      }

      where[Op.and] = [
        ...(where[Op.and] || []),
        { [Op.or]: searchConditions }
      ];
    }

    const orderDirection = String(filters.sortDirection || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    let order;

    if (filters.sortBy === 'tipoConta') {
      order = [[{ model: AccountType, as: 'accountType' }, 'description', orderDirection]];
    } else if (filters.sortBy === 'contaCaixa') {
      order = [[{ model: CashAccount, as: 'cashAccount' }, 'name', orderDirection]];
    } else {
      const orderMap = {
        id: 'id',
        descricao: 'description',
        valor: 'value',
        dataDespesa: 'expenseDate'
      };
      order = [[orderMap[filters.sortBy] || 'expenseDate', orderDirection]];
    }

    const count = await Expense.count({
      where
    });

    const rows = await Expense.findAll({
      where,
      include,
      order,
      limit,
      offset
    });

    const summaryRows = await Expense.findAll({
      where,
      attributes: ['expenseDate', 'value']
    });

    const currentMonth = new Date().getMonth() + 1;
    const summary = summaryRows.reduce(
      (acc, expense) => {
        const value = Number(expense.value || 0);
        const [, month] = normalizeDateOnly(expense.expenseDate)?.split('-') || [];

        acc.total += value;
        acc.quantidade += 1;
        if (Number(month) === currentMonth) {
          acc.mesAtual += value;
        }
        return acc;
      },
      { total: 0, quantidade: 0, ticketMedio: 0, mesAtual: 0 }
    );

    summary.ticketMedio = summary.quantidade ? summary.total / summary.quantidade : 0;

    return {
      items: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.max(1, Math.ceil(count / limit))
      },
      summary
    };
  }

  async getOne(id) {
    return await Expense.findByPk(id, {
      include: includeExpenseRelations
    });
  }

  async create(data) {
    const value = Number(data.value);

    if (!data.cashAccountId || !Number.isFinite(value) || value <= 0) {
      const err = new Error('Informe a conta caixa e um valor maior que zero.');
      err.status = 400;
      throw err;
    }

    const cashAccount = await CashAccount.findByPk(data.cashAccountId);
    if (!cashAccount) {
      const err = new Error('Conta caixa não encontrada.');
      err.status = 404;
      throw err;
    }

    if (data.accountTypeId) {
      const accType = await AccountType.findByPk(data.accountTypeId);
      if (!accType) {
        const err = new Error('Tipo de conta não encontrado.');
        err.status = 404;
        throw err;
      }
    }

    if (data.accountPayableId) {
      const accountPayable = await AccountsPayable.findByPk(data.accountPayableId);
      if (!accountPayable) {
        const err = new Error('Conta a pagar vinculada não encontrada.');
        err.status = 404;
        throw err;
      }

      const existingExpense = await Expense.findOne({ where: { accountPayableId: data.accountPayableId } });
      if (existingExpense) {
        const err = new Error(`Já existe uma despesa vinculada a esta conta a pagar. Código da despesa: ${existingExpense.id}.`);
        err.status = 400;
        throw err;
      }
    }

    return await Expense.create({
      cashAccountId: data.cashAccountId,
      accountTypeId: data.accountTypeId || null,
      accountPayableId: data.accountPayableId || null,
      description: data.description || null,
      value,
      expenseDate: normalizeDateOnly(data.expenseDate) || getTodayDateOnly()
    });
  }

  async update(id, data) {
    const expense = await Expense.findByPk(id);
    if (!expense) {
      const err = new Error('Despesa não encontrada.');
      err.status = 404;
      throw err;
    }

    if (data.cashAccountId) {
      const ca = await CashAccount.findByPk(data.cashAccountId);
      if (!ca) {
        const err = new Error('Conta caixa não encontrada.');
        err.status = 404;
        throw err;
      }
    }

    if (data.accountTypeId) {
      const at = await AccountType.findByPk(data.accountTypeId);
      if (!at) {
        const err = new Error('Tipo de conta não encontrado.');
        err.status = 404;
        throw err;
      }
    }

    if (data.value !== undefined) {
      const value = Number(data.value);
      if (!Number.isFinite(value) || value <= 0) {
        const err = new Error('O valor da despesa deve ser maior que zero.');
        err.status = 400;
        throw err;
      }
    }

    await expense.update({
      cashAccountId: data.cashAccountId ?? expense.cashAccountId,
      accountTypeId: data.accountTypeId ?? expense.accountTypeId,
      description: data.description ?? expense.description,
      value: data.value ?? expense.value,
      expenseDate: data.expenseDate !== undefined ? normalizeDateOnly(data.expenseDate) : expense.expenseDate
    });

    return expense;
  }

  async remove(id) {
    const expense = await Expense.findByPk(id);
    if (!expense) {
      const err = new Error('Despesa não encontrada.');
      err.status = 404;
      throw err;
    }

    await expense.destroy();
    return { message: 'Despesa excluída com sucesso.' };
  }
}

module.exports = new ExpenseService();
