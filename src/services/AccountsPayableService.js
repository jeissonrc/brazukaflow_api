const AccountsPayable = require('../models/AccountsPayable');
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

const validateRequiredPayableFields = (data) => {
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

class AccountsPayableService {
  
  async getAll() {
    return await AccountsPayable.findAll({
      include: [
        { model: AccountType, as: 'accountType', include: [{ model: CategoryType, as: 'category' }] },
        { model: PaymentType, as: 'paymentType' }
      ]
    });
  }

  async getOne(id) {
    return await AccountsPayable.findByPk(id, {
      include: [
        { model: AccountType, as: 'accountType', include: [{ model: CategoryType, as: 'category' }] },
        { model: PaymentType, as: 'paymentType' }
      ]
    });
  }

  // Método Search (Busca Avançada - Para Relatórios Dinâmicos)
  async search(filters) {
    const where = {};


    // Status (pago ou pendente)
    if (filters.status === 'paid') where.paid = true;
    if (filters.status === 'pending') where.paid = false;


    // Tipo de pagamento
    if (filters.paymentTypeId) where.paymentTypeId = filters.paymentTypeId;


    // Origem
    if (filters.originId) where.originId = filters.originId;


    // Filtro por datas genérico (recebe o campo via front)
    if (filters.dateField && (filters.dateFrom || filters.dateTo)) {
    where[filters.dateField] = {};


    if (filters.dateFrom) {
    where[filters.dateField][Op.gte] = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
    where[filters.dateField][Op.lte] = new Date(filters.dateTo);
    }
    }


    // Ordenação
    const order = [];


    if (filters.orderBy) {
    order.push([
    filters.orderBy,
    filters.orderDirection && filters.orderDirection.toUpperCase() === 'DESC'
    ? 'DESC'
    : 'ASC'
    ]);
    } else {
    // ordem padrão recomendada
    order.push(['dueDate', 'ASC']);
    }


    return await AccountsPayable.findAll({ where, order });
  }

  // --------------------------------------------------------
  // CREATE NORMAL → NÃO coloca origem na descrição
  // --------------------------------------------------------
  async create(data) {
    validateRequiredPayableFields(data);

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

    return await AccountsPayable.create({
      accountTypeId: data.accountTypeId,
      nominalDate: data.nominalDate,
      dueDate: data.dueDate,
      paymentDate: null,
      paymentTypeId: data.paymentTypeId,
      documentNumber: data.documentNumber || null,
      description: data.description.trim(), // ← sem origem aqui
      value: data.value,
      paid: data.paid ? true : false,
      originId: data.originId || null
    });
  }

  // --------------------------------------------------------
  // CREATE MULTIPLE → AQUI SIM adiciona origem na descrição
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

    validateRequiredPayableFields({
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

        // Aqui monta a descrição com ID da origem
        const baseDesc = description || origin.Descricao || origin.description || '';
        const descFinal = `${baseDesc} - ${i + 1}/${installments} (Origem: ${originId})`;

        const doc = documentNumber
          ? `${documentNumber} - ${i + 1}/${installments}`
          : null;

        const acc = await AccountsPayable.create({
          accountTypeId,
          nominalDate: nominal,
          dueDate: due,
          paymentDate: null,
          paymentTypeId: paymentTypeId || null,
          documentNumber: doc,
          description: descFinal.trim(), // ← apenas aqui coloca origem
          value: installmentValue,
          paid: false,
          originId: originId
        }, { transaction: t });

        created.push(acc);
      }
    });

    return created;
  }

  // --------------------------------------------------------
  // UPDATE NORMAL → NÃO mexe na origem dentro da descrição
  // --------------------------------------------------------
  async update(id, data) {
    const acc = await AccountsPayable.findByPk(id);
    if (!acc) {
      const err = new Error('AccountsPayable not found');
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

    validateRequiredPayableFields(nextData);

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
      description: String(nextData.description).trim(), // ← sem origem aqui
      value: nextData.value,
      originId: nextData.originId
    });

    return acc;
  }

  async remove(id) {
    const acc = await AccountsPayable.findByPk(id);
    if (!acc) {
      const err = new Error('AccountsPayable not found');
      err.status = 404;
      throw err;
    }

    if (acc.paid) {
      const err = new Error('Conta paga não pode ser removida. Desmarque a conta como paga antes de excluir.');
      err.status = 400;
      throw err;
    }

    await acc.destroy();
    return { message: 'Account payable deleted successfully' };
  }

  async markAsPaid(id, { paymentTypeId }) {
    const acc = await AccountsPayable.findByPk(id);
    if (!acc) {
      const err = new Error('AccountsPayable not found');
      err.status = 404;
      throw err;
    }

    if (acc.paid) {
      const err = new Error('This payable is already paid');
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

  async unpay(id) {
    const acc = await AccountsPayable.findByPk(id);
    if (!acc) {
      const err = new Error('AccountsPayable not found');
      err.status = 404;
      throw err;
    }

    if (!acc.paid) {
      const err = new Error('This payable is not marked as paid');
      err.status = 400;
      throw err;
    }

    acc.paid = false;
    acc.paymentDate = null;

    await acc.save();
    return acc;
  }
}

module.exports = new AccountsPayableService();
