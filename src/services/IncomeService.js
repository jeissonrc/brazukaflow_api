const Income = require('../models/Income');
const CashAccount = require('../models/CashAccount');
const AccountType = require('../models/AccountType');
const CategoryType = require('../models/CategoryType');
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

const includeIncomeRelations = [
  { model: CashAccount, as: 'cashAccount' },
  { model: AccountType, as: 'accountType', include: [{ model: CategoryType, as: 'category' }] }
];

const getPaginationNumber = (value, fallback, { min = 1, max = 1000 } = {}) => {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, min), max);
};

class IncomeService {
  async getAll() {
    return await Income.findAll({
      include: includeIncomeRelations
    });
  }

  async getPaginated(filters = {}) {
    const page = getPaginationNumber(filters.page, 1);
    const limit = getPaginationNumber(filters.limit, 10, { min: 1, max: 100 });
    const offset = (page - 1) * limit;
    const where = {};
    const include = includeIncomeRelations;

    if (filters.accountTypeId && filters.accountTypeId !== 'todos') {
      where.accountTypeId = filters.accountTypeId;
    }

    if (filters.cashAccountId && filters.cashAccountId !== 'todas') {
      where.cashAccountId = filters.cashAccountId;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.incomeDate = {
        ...(filters.dateFrom ? { [Op.gte]: filters.dateFrom } : {}),
        ...(filters.dateTo ? { [Op.lte]: filters.dateTo } : {})
      };
    }

    if (filters.search && String(filters.search).trim()) {
      const search = String(filters.search).trim();
      where[Op.and] = [
        ...(where[Op.and] || []),
        {
          [Op.or]: [
            { description: { [Op.like]: `%${search}%` } },
            { '$accountType.description$': { [Op.like]: `%${search}%` } },
            { '$accountType.category.description$': { [Op.like]: `%${search}%` } },
            { '$cashAccount.name$': { [Op.like]: `%${search}%` } }
          ]
        }
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
        dataReceita: 'incomeDate'
      };
      order = [[orderMap[filters.sortBy] || 'incomeDate', orderDirection]];
    }

    const { rows, count } = await Income.findAndCountAll({
      where,
      include,
      order,
      limit,
      offset,
      distinct: true,
      subQuery: false
    });

    const summaryRows = await Income.findAll({
      where,
      include,
      attributes: ['incomeDate', 'value'],
      subQuery: false
    });

    const currentMonth = new Date().getMonth() + 1;
    const summary = summaryRows.reduce(
      (acc, income) => {
        const value = Number(income.value || 0);
        const [, month] = normalizeDateOnly(income.incomeDate)?.split('-') || [];

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
    return await Income.findByPk(id, {
      include: includeIncomeRelations
    });
  }

  async create(data) {
    if (!data.cashAccountId || !data.value) {
      const err = new Error('cashAccountId and value are required');
      err.status = 400;
      throw err;
    }

    const cashAcc = await CashAccount.findByPk(data.cashAccountId);
    if (!cashAcc) {
      const err = new Error('CashAccount not found');
      err.status = 404;
      throw err;
    }

    if (data.accountTypeId) {
      const at = await AccountType.findByPk(data.accountTypeId);
      if (!at) {
        const err = new Error('AccountType not found');
        err.status = 404;
        throw err;
      }
    }

    return await Income.create({
      cashAccountId: data.cashAccountId,
      accountTypeId: data.accountTypeId || null,
      description: data.description || null,
      value: data.value,
      incomeDate: normalizeDateOnly(data.incomeDate) || getTodayDateOnly()
    });
  }

  async update(id, data) {
    const inc = await Income.findByPk(id);
    if (!inc) {
      const err = new Error('Income not found');
      err.status = 404;
      throw err;
    }

    if (data.cashAccountId) {
      const cashAcc = await CashAccount.findByPk(data.cashAccountId);
      if (!cashAcc) {
        const err = new Error('CashAccount not found');
        err.status = 404;
        throw err;
      }
    }

    if (data.accountTypeId) {
      const at = await AccountType.findByPk(data.accountTypeId);
      if (!at) {
        const err = new Error('AccountType not found');
        err.status = 404;
        throw err;
      }
    }

    await inc.update({
      cashAccountId: data.cashAccountId !== undefined ? data.cashAccountId : inc.cashAccountId,
      accountTypeId: data.accountTypeId !== undefined ? data.accountTypeId : inc.accountTypeId,
      description: data.description !== undefined ? data.description : inc.description,
      value: data.value !== undefined ? data.value : inc.value,
      incomeDate: data.incomeDate !== undefined ? normalizeDateOnly(data.incomeDate) : inc.incomeDate
    });

    return inc;
  }

  async remove(id) {
    const inc = await Income.findByPk(id);
    if (!inc) {
      const err = new Error('Income not found');
      err.status = 404;
      throw err;
    }
    await inc.destroy();
    return { message: 'Income Deleted successfully' };
  }
}

module.exports = new IncomeService();
