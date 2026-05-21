const CategoryType = require('../models/CategoryType');
const { Op } = require('sequelize');

const getPaginationNumber = (value, fallback, { min = 1, max = 1000 } = {}) => {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, min), max);
};

const isActiveStatus = (status) => status === true || status === 1 || status === '1' || status === 'true';

class CategoryTypeService {
  
  async getAll() {
    return await CategoryType.findAll();
  }

  async getPaginated(filters = {}) {
    const page = getPaginationNumber(filters.page, 1);
    const limit = getPaginationNumber(filters.limit, 10, { min: 1, max: 100 });
    const offset = (page - 1) * limit;
    const where = {};

    if (filters.type && filters.type !== 'Todos') {
      where.type = filters.type;
    }

    if (filters.status === 'Ativo') {
      where.status = true;
    }

    if (filters.status === 'Inativo') {
      where.status = false;
    }

    if (filters.specie && filters.specie !== 'Todas') {
      where.specie = filters.specie;
    }

    if (filters.search && String(filters.search).trim()) {
      const search = String(filters.search).trim();
      const searchConditions = [
        { description: { [Op.like]: `%${search}%` } },
        { specie: { [Op.like]: `%${search}%` } }
      ];

      const idMatch = String(search).match(/^CAT-(\d+)$/i);
      const numericSearch = idMatch ? Number(idMatch[1]) : Number(search);

      if (Number.isInteger(numericSearch) && numericSearch > 0) {
        searchConditions.push({ id: numericSearch });
      }

      where[Op.and] = [
        ...(where[Op.and] || []),
        { [Op.or]: searchConditions }
      ];
    }

    const orderMap = {
      idCategoria: 'id',
      descricao: 'description',
      tipo: 'type',
      especie: 'specie',
      status: 'status'
    };
    const orderDirection = String(filters.sortDirection || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const order = [[orderMap[filters.sortBy] || 'id', orderDirection]];

    const { rows, count } = await CategoryType.findAndCountAll({
      where,
      order,
      limit,
      offset
    });

    const summaryRows = await CategoryType.findAll({
      where,
      attributes: ['status', 'type']
    });

    const summary = summaryRows.reduce(
      (acc, category) => {
        acc.total += 1;
        if (isActiveStatus(category.status)) {
          acc.ativas += 1;
        }
        if (category.type === 'Receita') {
          acc.receitas += 1;
        }
        if (category.type === 'Despesa') {
          acc.despesas += 1;
        }
        return acc;
      },
      { total: 0, ativas: 0, receitas: 0, despesas: 0 }
    );

    const speciesRows = await CategoryType.findAll({
      attributes: ['specie'],
      order: [['specie', 'ASC']]
    });

    const species = Array.from(
      new Set(speciesRows.map((category) => category.specie).filter(Boolean))
    );

    return {
      items: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.max(1, Math.ceil(count / limit))
      },
      summary,
      species
    };
  }

  async getOne(id) {
    return await CategoryType.findByPk(id);
  }

  async create(data) {
    // Validação
    if (!data.description || data.description.trim() === "") {
      const error = new Error("Description is required");
      error.status = 400;
      throw error;
    }

    // Criação no banco
    const category = await CategoryType.create({
      description: data.description,
      type: data.type || null,
      specie: data.specie ?? null,
      status: data.status !== undefined ? data.status : true
    });

    return category;
  }

  async update(id, data) {
    const category = await CategoryType.findByPk(id);

    if (!category) {
      const error = new Error("Category not found");
      error.status = 404;
      throw error;
    }

    // Atualiza apenas dados enviados
    await category.update({
      description: data.description ?? category.description,
      type: data.type ?? category.type,
      specie: data.specie ?? category.specie,
      status: data.status !== undefined ? data.status : category.status
    });

    return category;
  }

  async delete(id) {
    const category = await CategoryType.findByPk(id);

    if (!category) {
      const error = new Error("Category not found");
      error.status = 404;
      throw error;
    }

    await category.destroy();

    return { message: "Category deleted successfully" };
  }
}

module.exports = new CategoryTypeService();
