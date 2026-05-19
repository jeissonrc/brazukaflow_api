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

class AccountsReceivableService {

  async getAll() {
    return await AccountsReceivable.findAll({
      include: [
        { model: AccountType, as: 'accountType', include: [{ model: CategoryType, as: 'category' }] },
        { model: PaymentType, as: 'paymentType' }
      ]
    });
  }

  async getOne(id) {
    return await AccountsReceivable.findByPk(id, {
      include: [
        { model: AccountType, as: 'accountType', include: [{ model: CategoryType, as: 'category' }] },
        { model: PaymentType, as: 'paymentType' }
      ]
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
      paymentDate: null,
      paymentTypeId: data.paymentTypeId,
      documentNumber: data.documentNumber || null,
      description: data.description.trim(),
      value: data.value,
      paid: data.paid ? true : false,
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

    const nextData = {
      accountTypeId: data.accountTypeId ?? acc.accountTypeId,
      nominalDate: data.nominalDate ?? acc.nominalDate,
      dueDate: data.dueDate ?? acc.dueDate,
      paymentDate: data.paymentDate ?? acc.paymentDate,
      paymentTypeId: data.paymentTypeId ?? acc.paymentTypeId,
      documentNumber: data.documentNumber ?? acc.documentNumber,
      description: data.description ?? acc.description,
      value: data.value ?? acc.value,
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
