const PaymentType = require('../models/PaymentType');
const AccountsPayable = require('../models/AccountsPayable');
const AccountsReceivable = require('../models/AccountsReceivable');
const { Op } = require('sequelize');

const getPaginationNumber = (value, fallback, { min = 1, max = 1000 } = {}) => {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, min), max);
};

const isActiveStatus = (status) => status === true || status === 1 || status === '1' || status === 'true';
const isInactiveStatus = (status) => status === false || status === 0 || status === '0' || status === 'false';

const getLinkedUsage = async (paymentTypeId) => {
  const [payableCount, receivableCount] = await Promise.all([
    AccountsPayable.count({ where: { paymentTypeId } }),
    AccountsReceivable.count({ where: { paymentTypeId } })
  ]);

  return { payableCount, receivableCount, total: payableCount + receivableCount };
};

const formatLinkedUsage = (usage) => {
  return [
    usage.payableCount > 0 ? `${usage.payableCount} conta(s) a pagar` : null,
    usage.receivableCount > 0 ? `${usage.receivableCount} conta(s) a receber` : null
  ].filter(Boolean).join(' e ');
};

class PaymentTypeService {
  async getAll() {
    return await PaymentType.findAll();
  }

  async getPaginated(filters = {}) {
    const page = getPaginationNumber(filters.page, 1);
    const limit = getPaginationNumber(filters.limit, 10, { min: 1, max: 100 });
    const offset = (page - 1) * limit;
    const where = {};

    if (filters.search && String(filters.search).trim()) {
      const search = String(filters.search).trim();
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }

    const orderMap = {
      id: 'id',
      nome: 'name',
      descricao: 'description',
      ativo: 'status'
    };
    const orderDirection = String(filters.sortDirection || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const order = [[orderMap[filters.sortBy] || 'id', orderDirection]];

    const count = await PaymentType.count({
      where
    });

    const rows = await PaymentType.findAll({
      where,
      order,
      limit,
      offset
    });

    const summaryRows = await PaymentType.findAll({
      where,
      attributes: ['status']
    });

    const summary = summaryRows.reduce(
      (acc, paymentType) => {
        acc.total += 1;
        if (isActiveStatus(paymentType.status)) {
          acc.ativos += 1;
        } else {
          acc.inativos += 1;
        }
        return acc;
      },
      { total: 0, ativos: 0, inativos: 0 }
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
    return await PaymentType.findByPk(id);
  }

  async getLinkedUsage(id) {
    return await getLinkedUsage(id);
  }

  formatLinkedUsage(usage) {
    return formatLinkedUsage(usage);
  }

  async create(data) {
    if (!data.name || !String(data.name).trim()) {
      const error = new Error('Informe o nome do tipo de pagamento.');
      error.status = 400;
      throw error;
    }

    return await PaymentType.create(data);
  }

  async update(id, data) {
    const payment = await PaymentType.findByPk(id);
    if (!payment) {
      const error = new Error('Tipo de pagamento não encontrado.');
      error.status = 404;
      throw error;
    }

    if (data.name !== undefined && !String(data.name).trim()) {
      const error = new Error('Informe o nome do tipo de pagamento.');
      error.status = 400;
      throw error;
    }

    if (data.status !== undefined && isInactiveStatus(data.status)) {
      const usage = await getLinkedUsage(id);

      if (usage.total > 0) {
        const details = formatLinkedUsage(usage);

        const error = new Error(`Este tipo de pagamento está vinculado a ${details} e não pode ser inativado.`);
        error.status = 400;
        throw error;
      }
    }

    await payment.update(data);
    return payment;
  }

  async delete(id) {
    const payment = await PaymentType.findByPk(id);
    if (!payment) {
      const error = new Error('Tipo de pagamento não encontrado.');
      error.status = 404;
      throw error;
    }

    const usage = await getLinkedUsage(id);
    if (usage.total > 0) {
      const details = formatLinkedUsage(usage);
      const error = new Error(`Este tipo de pagamento está vinculado a ${details} e não pode ser removido.`);
      error.status = 400;
      throw error;
    }

    await payment.destroy();
    return { message: 'Tipo de pagamento excluído com sucesso.' };
  }
}

module.exports = new PaymentTypeService();
