const AccountType = require('../models/AccountType');
const CategoryType = require('../models/CategoryType');
const AccountsPayable = require('../models/AccountsPayable');
const AccountsReceivable = require('../models/AccountsReceivable');
const Income = require('../models/Income');
const Expense = require('../models/Expense');
const { Op } = require('sequelize');

const includeAccountTypeRelations = [{ model: CategoryType, as: 'category' }];

const getPaginationNumber = (value, fallback, { min = 1, max = 1000 } = {}) => {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, min), max);
};

const isActiveStatus = (status) => status === true || status === 1 || status === '1' || status === 'true';
const isInactiveStatus = (status) => status === false || status === 0 || status === '0' || status === 'false';
const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

const validateRequiredFields = (data = {}) => {
  if (isBlank(data.description) || isBlank(data.type) || isBlank(data.categoryId)) {
    const error = new Error('Preencha os campos obrigatórios do tipo de conta.');
    error.status = 400;
    throw error;
  }
};

const getLinkedUsage = async (accountTypeId) => {
  const [payableCount, receivableCount, incomeCount, expenseCount] = await Promise.all([
    AccountsPayable.count({ where: { accountTypeId } }),
    AccountsReceivable.count({ where: { accountTypeId } }),
    Income.count({ where: { accountTypeId } }),
    Expense.count({ where: { accountTypeId } })
  ]);

  return {
    payableCount,
    receivableCount,
    incomeCount,
    expenseCount,
    total: payableCount + receivableCount + incomeCount + expenseCount
  };
};

const formatLinkedUsage = (usage) => {
  return [
    usage.payableCount > 0 ? `${usage.payableCount} conta(s) a pagar` : null,
    usage.receivableCount > 0 ? `${usage.receivableCount} conta(s) a receber` : null,
    usage.incomeCount > 0 ? `${usage.incomeCount} receita(s)` : null,
    usage.expenseCount > 0 ? `${usage.expenseCount} despesa(s)` : null
  ].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' e $1');
};

class AccountTypeService {
  async getAll() {
    return await AccountType.findAll({
      include: includeAccountTypeRelations
    });
  }

  async getPaginated(filters = {}) {
    const page = getPaginationNumber(filters.page, 1);
    const limit = getPaginationNumber(filters.limit, 10, { min: 1, max: 100 });
    const offset = (page - 1) * limit;
    const where = {};
    const include = includeAccountTypeRelations;

    if (filters.type && filters.type !== 'Todos') {
      where.type = filters.type;
    }

    if (filters.status === 'Ativo') {
      where.status = true;
    }

    if (filters.status === 'Inativo') {
      where.status = false;
    }

    if (filters.categoryId && filters.categoryId !== 'Todas') {
      where.categoryId = filters.categoryId;
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
      const searchConditions = [
        { description: { [Op.like]: `%${search}%` } },
        { specie: { [Op.like]: `%${search}%` } }
      ];

      if (categoryIds.length > 0) {
        searchConditions.push({ categoryId: { [Op.in]: categoryIds } });
      }

      where[Op.and] = [
        ...(where[Op.and] || []),
        { [Op.or]: searchConditions }
      ];

      const idMatch = String(search).match(/^TC-(\d+)$/i);
      const numericSearch = idMatch ? Number(idMatch[1]) : Number(search);

      if (Number.isInteger(numericSearch) && numericSearch > 0) {
        searchConditions.push({ id: numericSearch });
      }
    }

    const orderDirection = String(filters.sortDirection || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    let order;

    if (filters.sortBy === 'categoria') {
      order = [[{ model: CategoryType, as: 'category' }, 'description', orderDirection]];
    } else {
      const orderMap = {
        idTipo: 'id',
        descricao: 'description',
        tipo: 'type',
        especie: 'specie',
        status: 'status'
      };
      order = [[orderMap[filters.sortBy] || 'id', orderDirection]];
    }

    const count = await AccountType.count({
      where
    });

    const rows = await AccountType.findAll({
      where,
      include,
      order,
      limit,
      offset
    });

    const summaryRows = await AccountType.findAll({
      where,
      attributes: ['status', 'type']
    });

    const summary = summaryRows.reduce(
      (acc, accountType) => {
        acc.total += 1;
        if (isActiveStatus(accountType.status)) {
          acc.ativos += 1;
        }
        if (accountType.type === 'Receita') {
          acc.receitas += 1;
        }
        if (accountType.type === 'Despesa') {
          acc.despesas += 1;
        }
        return acc;
      },
      { total: 0, ativos: 0, receitas: 0, despesas: 0 }
    );

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
    return await AccountType.findByPk(id, {
      include: includeAccountTypeRelations
    });
  }

  async getLinkedUsage(id) {
    return await getLinkedUsage(id);
  }

  formatLinkedUsage(usage) {
    return formatLinkedUsage(usage);
  }

  async create(data) {
    validateRequiredFields(data);

    return await AccountType.create({
      description: String(data.description).trim(),
      type: String(data.type).trim(),
      specie: data.specie ?? null,
      status: data.status !== undefined ? data.status : true,
      categoryId: data.categoryId
    });
  }

  async update(id, data) {
    const account = await AccountType.findByPk(id);
    if (!account) {
      const error = new Error('Tipo de conta não encontrado.');
      error.status = 404;
      throw error;
    }

    validateRequiredFields({
      description: data.description ?? account.description,
      type: data.type ?? account.type,
      categoryId: data.categoryId ?? account.categoryId
    });

    if (data.status !== undefined && isInactiveStatus(data.status)) {
      const usage = await getLinkedUsage(id);

      if (usage.total > 0) {
        const details = formatLinkedUsage(usage);
        const error = new Error(`Este tipo de conta está vinculado a ${details} e não pode ser inativado.`);
        error.status = 400;
        throw error;
      }
    }

    await account.update({
      description: data.description !== undefined ? String(data.description).trim() : account.description,
      type: data.type !== undefined ? String(data.type).trim() : account.type,
      specie: data.specie ?? account.specie,
      status: data.status !== undefined ? data.status : account.status,
      categoryId: data.categoryId ?? account.categoryId
    });
    return account;
  }

  async delete(id) {
    const account = await AccountType.findByPk(id);
    if (!account) {
      const error = new Error('Tipo de conta não encontrado.');
      error.status = 404;
      throw error;
    }

    const usage = await getLinkedUsage(id);
    if (usage.total > 0) {
      const details = formatLinkedUsage(usage);
      const error = new Error(`Este tipo de conta está vinculado a ${details} e não pode ser removido.`);
      error.status = 400;
      throw error;
    }

    await account.destroy();
    return { message: 'Tipo de conta excluído com sucesso.' };
  }
}

module.exports = new AccountTypeService();
