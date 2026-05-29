const AccountsReceivable = require('../models/AccountsReceivable');
const OriginAccount = require('../models/OriginAccount');
const AccountType = require('../models/AccountType');
const PaymentType = require('../models/PaymentType');
const CategoryType = require('../models/CategoryType');
const sequelize = require('../config/database');
const { Op } = require('sequelize');

const normalizeDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const validateRequiredReceivableFields = (data) => {
  const value = Number(data.value);

  if (
    !data.description ||
    !String(data.description).trim() ||
    !data.accountTypeId ||
    !data.paymentTypeId ||
    !data.nominalDate ||
    !data.dueDate ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    const err = new Error('Description, accountTypeId, paymentTypeId, nominalDate, dueDate and value are required');
    err.status = 400;
    throw err;
  }

  const nominalDate = normalizeDateOnly(data.nominalDate);
  const dueDate = normalizeDateOnly(data.dueDate);

  if (nominalDate > dueDate) {
    const err = new Error('Nominal date cannot be greater than due date');
    err.status = 400;
    throw err;
  }
};

const includeReceivableRelations = [
  { model: AccountType, as: 'accountType', include: [{ model: CategoryType, as: 'category' }] },
  { model: PaymentType, as: 'paymentType' }
];

const getReceivableStatus = (account) => {
  if (account.paid) return 'recebido';

  const dueDate = normalizeDateOnly(account.dueDate);
  const today = normalizeDateOnly(new Date());

  if (dueDate && dueDate < today) return 'vencido';
  return 'pendente';
};

const getPaginationNumber = (value, fallback, { min = 1, max = 1000 } = {}) => {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, min), max);
};

const normalizeBoolean = (value) => value === true || value === 1 || value === '1' || value === 'true';

class AccountsReceivableService {

  async getAll() {
    return await AccountsReceivable.findAll({
      include: includeReceivableRelations
    });
  }

  async getPaginated(filters = {}) {
    const page = getPaginationNumber(filters.page, 1);
    const limit = getPaginationNumber(filters.limit, 10, { min: 1, max: 100 });
    const offset = (page - 1) * limit;
    const where = {};
    const include = includeReceivableRelations;
    const today = normalizeDateOnly(new Date());

    if (filters.status === 'recebido') {
      where.paid = true;
    }

    if (filters.status === 'pendente') {
      where.paid = false;
      where[Op.or] = [
        { dueDate: { [Op.gte]: today } },
        { dueDate: null }
      ];
    }

    if (filters.status === 'vencido') {
      where.paid = false;
      where.dueDate = { [Op.lt]: today };
    }

    if (filters.paymentTypeId && filters.paymentTypeId !== 'todos') {
      where.paymentTypeId = filters.paymentTypeId;
    }

    if (filters.accountTypeId && filters.accountTypeId !== 'todos') {
      where.accountTypeId = filters.accountTypeId;
    }

    if (filters.originId && filters.originId !== 'todas') {
      where.originId = filters.originId;
    }

    if (filters.dateFrom || filters.dateTo) {
      const dateConditions = [];
      const dateFrom = normalizeDateOnly(filters.dateFrom);
      const dateTo = normalizeDateOnly(filters.dateTo);

      if (dateFrom) {
        dateConditions.push(
          sequelize.where(sequelize.fn('DATE', sequelize.col('Data_Vencimento')), { [Op.gte]: dateFrom })
        );
      }

      if (dateTo) {
        dateConditions.push(
          sequelize.where(sequelize.fn('DATE', sequelize.col('Data_Vencimento')), { [Op.lte]: dateTo })
        );
      }

      where[Op.and] = [...(where[Op.and] || []), ...dateConditions];
    }

    if (filters.search && String(filters.search).trim()) {
      const search = String(filters.search).trim();
      const [originMatches, accountTypeMatches, paymentTypeMatches] = await Promise.all([
        OriginAccount.findAll({
          attributes: ['id'],
          where: {
            description: { [Op.like]: `%${search}%` }
          }
        }),
        AccountType.findAll({
          attributes: ['id'],
          where: {
            description: { [Op.like]: `%${search}%` }
          }
        }),
        PaymentType.findAll({
          attributes: ['id'],
          where: {
            name: { [Op.like]: `%${search}%` }
          }
        })
      ]);
      const originIds = originMatches.map((origin) => origin.id);
      const accountTypeIds = accountTypeMatches.map((accountType) => accountType.id);
      const paymentTypeIds = paymentTypeMatches.map((paymentType) => paymentType.id);

      const searchConditions = [
        { description: { [Op.like]: `%${search}%` } },
        { documentNumber: { [Op.like]: `%${search}%` } }
      ];

      if (originIds.length > 0) {
        searchConditions.push({ originId: { [Op.in]: originIds } });
      }

      if (accountTypeIds.length > 0) {
        searchConditions.push({ accountTypeId: { [Op.in]: accountTypeIds } });
      }

      if (paymentTypeIds.length > 0) {
        searchConditions.push({ paymentTypeId: { [Op.in]: paymentTypeIds } });
      }

      where[Op.and] = [
        ...(where[Op.and] || []),
        { [Op.or]: searchConditions }
      ];
    }

    const orderMap = {
      id: ['id'],
      descricao: ['description'],
      dataVencimento: ['dueDate'],
      valor: ['value'],
      status: ['paid']
    };
    const orderColumn = orderMap[filters.sortBy] || ['dueDate'];
    const orderDirection = String(filters.sortDirection || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const order = filters.sortBy === 'status'
      ? [['paid', orderDirection], ['dueDate', orderDirection]]
      : [[...orderColumn, orderDirection]];

    const count = await AccountsReceivable.count({
      where
    });

    const rows = await AccountsReceivable.findAll({
      where,
      include,
      order,
      limit,
      offset
    });

    const summaryRows = await AccountsReceivable.findAll({
      where,
      attributes: ['paid', 'dueDate', 'value']
    });

    const summary = summaryRows.reduce(
      (acc, account) => {
        const value = Number(account.value || 0);
        const status = getReceivableStatus(account);

        acc.total += value;
        acc[status].valor += value;
        acc[status].quantidade += 1;
        return acc;
      },
      {
        total: 0,
        pendente: { valor: 0, quantidade: 0 },
        recebido: { valor: 0, quantidade: 0 },
        vencido: { valor: 0, quantidade: 0 }
      }
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
    return await AccountsReceivable.findByPk(id, {
      include: includeReceivableRelations
    });
  }

  // -------------------------------------------------------
  // SEARCH (igual ao contas a pagar)
  // -------------------------------------------------------
  async search(filters) {
    const where = {};

    // pago ou pendente
    if (filters.status === 'paid') where.paid = true;
    if (filters.status === 'pending') where.paid = false;

    // Tipo pagamento
    if (filters.paymentTypeId) where.paymentTypeId = filters.paymentTypeId;

    // Origem
    if (filters.originId) where.originId = filters.originId;

    // Data dinâmica
    if (filters.dateField && (filters.dateFrom || filters.dateTo)) {
      where[filters.dateField] = {};

      if (filters.dateFrom)
        where[filters.dateField][Op.gte] = new Date(filters.dateFrom);

      if (filters.dateTo)
        where[filters.dateField][Op.lte] = new Date(filters.dateTo);
    }

    // Ordenação
    const order = [];

    if (filters.orderBy) {
      order.push([
        filters.orderBy,
        filters.orderDirection?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'
      ]);
    } else {
      order.push(['dueDate', 'ASC']);
    }

    return await AccountsReceivable.findAll({ where, order });
  }

  // --------------------------------------------------------
  // CREATE NORMAL
  // --------------------------------------------------------
  async create(data) {
    validateRequiredReceivableFields(data);
    const isPaid = normalizeBoolean(data.paid);

    const at = await AccountType.findByPk(data.accountTypeId);
    if (!at) {
      const err = new Error('Account type not found');
      err.status = 404;
      throw err;
    }

    const pt = await PaymentType.findByPk(data.paymentTypeId);
    if (!pt) {
      const err = new Error('Payment type not found');
      err.status = 404;
      throw err;
    }

    return await AccountsReceivable.create({
      accountTypeId: data.accountTypeId,
      nominalDate: data.nominalDate,
      dueDate: data.dueDate,
      paymentDate: isPaid ? new Date() : null,
      paymentTypeId: data.paymentTypeId,
      documentNumber: data.documentNumber || null,
      description: data.description.trim(),
      value: data.value,
      paid: isPaid,
      originId: data.originId || null
    });
  }

  // --------------------------------------------------------
  // CREATE MULTIPLE
  // --------------------------------------------------------
  async createMultipleFromOrigin(originId, baseData) {
    const origin = await OriginAccount.findByPk(originId);
    if (!origin) {
      const err = new Error('Origin not found');
      err.status = 404;
      throw err;
    }

    const { installments, nominalDate, dueDate, value, accountTypeId, paymentTypeId, description, documentNumber } = baseData;

    if (!installments || installments < 1) {
      const err = new Error('installments must be >= 1');
      err.status = 400;
      throw err;
    }

    validateRequiredReceivableFields({
      description,
      accountTypeId,
      paymentTypeId,
      nominalDate,
      dueDate,
      value
    });

    const at = await AccountType.findByPk(accountTypeId);
    if (!at) {
      const err = new Error('Account type not found');
      err.status = 404;
      throw err;
    }

    const pt = await PaymentType.findByPk(paymentTypeId);
    if (!pt) {
      const err = new Error('Payment type not found');
      err.status = 404;
      throw err;
    }

    const raw = parseFloat(value);
    const per = Math.floor((raw / installments) * 100) / 100;
    const remainder = Math.round((raw - per * installments) * 100) / 100;

    const created = [];

    await sequelize.transaction(async (t) => {
      for (let i = 0; i < installments; i++) {
        const nominal = nominalDate ? new Date(nominalDate) : new Date();
        nominal.setMonth(nominal.getMonth() + i);

        const due = dueDate ? new Date(dueDate) : new Date();
        due.setMonth(due.getMonth() + i);

        const installmentValue = i === installments - 1 ? per + remainder : per;

        const baseDesc = description || origin.Descricao || origin.description || '';
        const finalDesc = `${baseDesc} - ${i + 1}/${installments} (Origem: ${originId})`;

        const doc = documentNumber
          ? `${documentNumber} - ${i + 1}/${installments}`
          : null;

        const acc = await AccountsReceivable.create(
          {
            accountTypeId,
            nominalDate: nominal,
            dueDate: due,
            paymentDate: null,
            paymentTypeId: paymentTypeId || null,
            documentNumber: doc,
            description: finalDesc.trim(),
            value: installmentValue,
            paid: false,
            originId: originId
          },
          { transaction: t }
        );

        created.push(acc);
      }
    });

    return created;
  }

  // --------------------------------------------------------
  // UPDATE NORMAL
  // --------------------------------------------------------
  async update(id, data) {
    const acc = await AccountsReceivable.findByPk(id);
    if (!acc) {
      const err = new Error('AccountsReceivable not found');
      err.status = 404;
      throw err;
    }

    const hasPaid = Object.prototype.hasOwnProperty.call(data, 'paid');
    const nextPaid = hasPaid ? normalizeBoolean(data.paid) : Boolean(acc.paid);
    const nextPaymentDate = data.paymentDate !== undefined
      ? data.paymentDate
      : hasPaid
        ? (nextPaid ? (acc.paymentDate || new Date()) : null)
        : acc.paymentDate;

    const nextData = {
      accountTypeId: data.accountTypeId ?? acc.accountTypeId,
      nominalDate: data.nominalDate ?? acc.nominalDate,
      dueDate: data.dueDate ?? acc.dueDate,
      paymentDate: nextPaymentDate,
      paymentTypeId: data.paymentTypeId ?? acc.paymentTypeId,
      documentNumber: data.documentNumber ?? acc.documentNumber,
      description: data.description ?? acc.description,
      value: data.value ?? acc.value,
      paid: nextPaid,
      originId: data.originId ?? acc.originId
    };

    validateRequiredReceivableFields(nextData);

    const at = await AccountType.findByPk(nextData.accountTypeId);
    if (!at) {
      const err = new Error('Account type not found');
      err.status = 404;
      throw err;
    }

    const pt = await PaymentType.findByPk(nextData.paymentTypeId);
    if (!pt) {
      const err = new Error('Payment type not found');
      err.status = 404;
      throw err;
    }

    await acc.update({
      accountTypeId: nextData.accountTypeId,
      nominalDate: nextData.nominalDate,
      dueDate: nextData.dueDate,
      paymentDate: nextData.paymentDate,
      paymentTypeId: nextData.paymentTypeId,
      documentNumber: nextData.documentNumber,
      description: String(nextData.description).trim(),
      value: nextData.value,
      paid: nextData.paid,
      originId: nextData.originId
    });

    return acc;
  }

  async remove(id) {
    const acc = await AccountsReceivable.findByPk(id);
    if (!acc) {
      const err = new Error('AccountsReceivable not found');
      err.status = 404;
      throw err;
    }

    if (acc.paid) {
      const err = new Error('Conta recebida não pode ser removida. Desmarque a conta como recebida antes de excluir.');
      err.status = 400;
      throw err;
    }

    await acc.destroy();
    return { message: 'Account receivable deleted successfully' };
  }

  async markAsReceived(id, { paymentTypeId }) {
    const acc = await AccountsReceivable.findByPk(id);
    if (!acc) {
      const err = new Error('AccountsReceivable not found');
      err.status = 404;
      throw err;
    }

    if (acc.paid) {
      const err = new Error('This receivable is already received');
      err.status = 400;
      throw err;
    }

    if (paymentTypeId) {
      const pt = await PaymentType.findByPk(paymentTypeId);
      if (!pt) {
        const err = new Error('PaymentType not found');
        err.status = 404;
        throw err;
      }
      acc.paymentTypeId = paymentTypeId;
    }

    acc.paid = true;
    acc.paymentDate = new Date();

    await acc.save();
    return acc;
  }

  async unreceive(id) {
    const acc = await AccountsReceivable.findByPk(id);
    if (!acc) {
      const err = new Error('AccountsReceivable not found');
      err.status = 404;
      throw err;
    }

    if (!acc.paid) {
      const err = new Error('This receivable is not marked as received');
      err.status = 400;
      throw err;
    }

    acc.paid = false;
    acc.paymentDate = null;

    await acc.save();
    return acc;
  }
}

module.exports = new AccountsReceivableService();
