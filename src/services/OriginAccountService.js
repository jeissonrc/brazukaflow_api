const OriginAccount = require('../models/OriginAccount');
const AccountsPayable = require('../models/AccountsPayable');
const AccountsReceivable = require('../models/AccountsReceivable');
const { Op } = require('sequelize');

const normalizeOriginName = (value) => {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
};

const getPaginationNumber = (value, fallback, { min = 1, max = 1000 } = {}) => {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, min), max);
};

const isActiveStatus = (status) => status === true || status === 1 || status === '1' || status === 'true';
const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

const validateRequiredFields = (data = {}) => {
  if (isBlank(data.description) || isBlank(data.category) || data.person === undefined || data.person === null) {
    const error = new Error('Preencha os campos obrigatórios da origem.');
    error.status = 400;
    throw error;
  }
};

const getLinkedUsage = async (originId) => {
  const [payableCount, receivableCount] = await Promise.all([
    AccountsPayable.count({ where: { originId } }),
    AccountsReceivable.count({ where: { originId } })
  ]);

  return {
    payableCount,
    receivableCount,
    total: payableCount + receivableCount
  };
};

const formatLinkedUsage = (usage) => {
  return [
    usage.payableCount > 0 ? `${usage.payableCount} conta(s) a pagar` : null,
    usage.receivableCount > 0 ? `${usage.receivableCount} conta(s) a receber` : null
  ].filter(Boolean).join(' e ');
};

class OriginAccountService {
  async getAll() {
    return await OriginAccount.findAll({
      order: [['description', 'ASC']]
    });
  }

  async getPaginated(filters = {}) {
    const page = getPaginationNumber(filters.page, 1);
    const limit = getPaginationNumber(filters.limit, 10, { min: 1, max: 100 });
    const offset = (page - 1) * limit;
    const where = {};

    if (filters.category && filters.category !== 'Todas') {
      where.category = Number(filters.category);
    }

    if (filters.person && filters.person !== 'Todos') {
      where.person = filters.person === 'Pessoa';
    }

    if (filters.status === 'Ativo') {
      where.status = true;
    }

    if (filters.status === 'Inativo') {
      where.status = false;
    }

    if (filters.search && String(filters.search).trim()) {
      const search = String(filters.search).trim();
      const searchConditions = [
        { description: { [Op.like]: `%${search}%` } },
        { obs: { [Op.like]: `%${search}%` } }
      ];
      const numericSearch = Number(search);

      if (Number.isInteger(numericSearch) && numericSearch > 0) {
        searchConditions.push({ id: numericSearch });
      }

      where[Op.and] = [
        ...(where[Op.and] || []),
        { [Op.or]: searchConditions }
      ];
    }

    const orderDirection = String(filters.sortDirection || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const orderMap = {
      codigo: 'id',
      nome: 'description',
      natureza: 'category',
      tipo: 'person',
      status: 'status'
    };
    const order = [[orderMap[filters.sortBy] || 'id', orderDirection]];

    const count = await OriginAccount.count({ where });
    const rows = await OriginAccount.findAll({
      where,
      order,
      limit,
      offset
    });
    const summaryRows = await OriginAccount.findAll({
      where,
      attributes: ['status', 'category', 'person']
    });
    const summary = summaryRows.reduce(
      (acc, origin) => {
        acc.total += 1;
        if (isActiveStatus(origin.status)) acc.ativos += 1;
        if (Number(origin.category) === 1) acc.despesas += 1;
        if (Number(origin.category) === 2) acc.receitas += 1;
        if (isActiveStatus(origin.person)) acc.pessoas += 1;
        if (!isActiveStatus(origin.person)) acc.operacoes += 1;
        return acc;
      },
      { total: 0, ativos: 0, receitas: 0, despesas: 0, pessoas: 0, operacoes: 0 }
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
    return await OriginAccount.findByPk(id);
  }

  async create(data) {
    validateRequiredFields(data);

    const description = String(data.description).trim();
    const category = Number(data.category);
    const normalizedDescription = normalizeOriginName(description);
    const existingOrigins = await OriginAccount.findAll({ where: { category } });
    const duplicatedOrigin = existingOrigins.find((origin) => normalizeOriginName(origin.description) === normalizedDescription);

    if (duplicatedOrigin) {
      const err = new Error('Já existe uma origem cadastrada com este nome para esta natureza.');
      err.status = 409;
      throw err;
    }

    return await OriginAccount.create({
      description,
      obs: data.obs || null,
      category,
      person: data.person,
      status: data.status !== undefined ? data.status : true
    });
  }

  async update(id, data) {
    const origin = await OriginAccount.findByPk(id);
    if (!origin) {
      const err = new Error('Origem não encontrada.');
      err.status = 404;
      throw err;
    }

    validateRequiredFields({
      description: data.description ?? origin.description,
      category: data.category ?? origin.category,
      person: data.person ?? origin.person
    });

    const nextDescription = data.description !== undefined ? String(data.description).trim() : origin.description;
    const nextCategory = data.category !== undefined ? Number(data.category) : origin.category;
    const normalizedDescription = normalizeOriginName(nextDescription);
    const existingOrigins = await OriginAccount.findAll({
      where: {
        category: nextCategory,
        id: { [Op.ne]: id }
      }
    });
    const duplicatedOrigin = existingOrigins.find((item) => normalizeOriginName(item.description) === normalizedDescription);

    if (duplicatedOrigin) {
      const err = new Error('Já existe uma origem cadastrada com este nome para esta natureza.');
      err.status = 409;
      throw err;
    }

    if (data.status !== undefined && !isActiveStatus(data.status)) {
      const usage = await getLinkedUsage(id);

      if (usage.total > 0) {
        const details = formatLinkedUsage(usage);
        const error = new Error(`Esta origem está vinculada a ${details} e não pode ser inativada.`);
        error.status = 400;
        throw error;
      }
    }

    await origin.update({
      description: nextDescription,
      obs: data.obs !== undefined ? data.obs : origin.obs,
      category: nextCategory,
      person: data.person !== undefined ? data.person : origin.person,
      status: data.status !== undefined ? data.status : origin.status
    });

    return origin;
  }

  async remove(id) {
    const origin = await OriginAccount.findByPk(id);
    if (!origin) {
      const err = new Error('Origem não encontrada.');
      err.status = 404;
      throw err;
    }

    const usage = await getLinkedUsage(id);
    if (usage.total > 0) {
      const details = formatLinkedUsage(usage);
      const error = new Error(`Esta origem está vinculada a ${details} e não pode ser removida.`);
      error.status = 400;
      throw error;
    }

    await origin.destroy();
    return { message: 'Origem excluída com sucesso.' };
  }

  async getLinkedUsage(id) {
    return await getLinkedUsage(id);
  }

  formatLinkedUsage(usage) {
    return formatLinkedUsage(usage);
  }
}

module.exports = new OriginAccountService();
