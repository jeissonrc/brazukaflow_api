const AccountType = require('../models/AccountType');
const CategoryType = require('../models/CategoryType');
const { Op } = require('sequelize');

const includeAccountTypeRelations = [{ model: CategoryType, as: 'category' }];

const getPaginationNumber = (value, fallback, { min = 1, max = 1000 } = {}) => {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, min), max);
};

const isActiveStatus = (status) => status === true || status === 1 || status === '1' || status === 'true';

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

  async create(data) {
    if (!data.description || !data.categoryId) {
      const error = new Error("Description and CategoryId are required");
      error.status = 400;
      throw error;
    }

    return await AccountType.create({
      description: data.description,
      type: data.type || null,
      specie: data.specie ?? null,
      status: data.status !== undefined ? data.status : true,
      categoryId: data.categoryId
    });
  }

  async update(id, data) {
    const account = await AccountType.findByPk(id);
    if (!account) {
      const error = new Error("Account type not found");
      error.status = 404;
      throw error;
    }

    await account.update({
      description: data.description ?? account.description,
      type: data.type ?? account.type,
      specie: data.specie ?? account.specie,
      status: data.status !== undefined ? data.status : account.status,
      categoryId: data.categoryId ?? account.categoryId
    });
    return account;
  }

  async delete(id) {
    const account = await AccountType.findByPk(id);
    if (!account) {
      const error = new Error("Account type not found");
      error.status = 404;
      throw error;
    }

    await account.destroy();
    return { message: "Account type deleted successfully" };
  }
}

module.exports = new AccountTypeService();
