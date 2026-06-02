const AccountsPayable = require('../models/AccountsPayable');
const OriginAccount = require('../models/OriginAccount');
const AccountType = require('../models/AccountType');
const PaymentType = require('../models/PaymentType');
const CategoryType = require('../models/CategoryType');
const CashAccount = require('../models/CashAccount');
const Expense = require('../models/Expense');
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

const includePayableRelations = [
  { model: AccountType, as: 'accountType', include: [{ model: CategoryType, as: 'category' }] },
  { model: PaymentType, as: 'paymentType' }
];

const getPayableStatus = (account) => {
  if (account.paid) return 'pago';

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

const attachLinkedExpenses = async (accounts) => {
  const items = Array.isArray(accounts) ? accounts : [accounts].filter(Boolean);
  const accountIds = items.map((account) => account.id).filter(Boolean);

  if (accountIds.length === 0) {
    return accounts;
  }

  const expenses = await Expense.findAll({
    attributes: ['id', 'description', 'accountPayableId'],
    where: {
      accountPayableId: { [Op.in]: accountIds }
    }
  });

  const expensesByAccountId = expenses.reduce((acc, expense) => {
    const accountId = Number(expense.accountPayableId);
    if (!acc.has(accountId)) {
      acc.set(accountId, []);
    }
    acc.get(accountId).push(expense);
    return acc;
  }, new Map());

  items.forEach((account) => {
    account.setDataValue('linkedExpenses', expensesByAccountId.get(Number(account.id)) || []);
  });

  return accounts;
};

class AccountsPayableService {
  
  async getAll() {
    const rows = await AccountsPayable.findAll({
      include: includePayableRelations
    });

    return await attachLinkedExpenses(rows);
  }

  async getPaginated(filters = {}) {
    const page = getPaginationNumber(filters.page, 1);
    const limit = getPaginationNumber(filters.limit, 10, { min: 1, max: 100 });
    const offset = (page - 1) * limit;
    const where = {};
    const include = includePayableRelations;
    const today = normalizeDateOnly(new Date());

    if (filters.status === 'pago') {
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

    const count = await AccountsPayable.count({
      where
    });

    const rows = await AccountsPayable.findAll({
      where,
      include,
      order,
      limit,
      offset
    });
    await attachLinkedExpenses(rows);

    const summaryRows = await AccountsPayable.findAll({
      where,
      attributes: ['paid', 'dueDate', 'value']
    });

    const summary = summaryRows.reduce(
      (acc, account) => {
        const value = Number(account.value || 0);
        const status = getPayableStatus(account);

        acc.total += value;
        acc[status].valor += value;
        acc[status].quantidade += 1;
        return acc;
      },
      {
        total: 0,
        pendente: { valor: 0, quantidade: 0 },
        pago: { valor: 0, quantidade: 0 },
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
    const account = await AccountsPayable.findByPk(id, {
      include: includePayableRelations
    });

    return await attachLinkedExpenses(account);
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

    return await AccountsPayable.create({
      accountTypeId: data.accountTypeId,
      nominalDate: data.nominalDate,
      dueDate: data.dueDate,
      paymentDate: isPaid ? new Date() : null,
      paymentTypeId: data.paymentTypeId,
      documentNumber: data.documentNumber || null,
      description: data.description.trim(), // ← sem origem aqui
      value: data.value,
      paid: isPaid,
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

    const hasPaid = Object.prototype.hasOwnProperty.call(data, 'paid');
    const nextPaid = hasPaid ? normalizeBoolean(data.paid) : Boolean(acc.paid);

    if (hasPaid && acc.paid && !nextPaid) {
      const linkedExpense = await Expense.findOne({ where: { accountPayableId: id } });
      if (linkedExpense) {
        const err = new Error(`Esta conta possui a despesa vinculada Código ${linkedExpense.id}. Remova essa despesa antes de marcar como não paga.`);
        err.status = 400;
        throw err;
      }
    }

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
      paid: nextData.paid,
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

    const linkedExpense = await Expense.findOne({ where: { accountPayableId: id } });
    if (linkedExpense) {
      const err = new Error(`Esta conta possui a despesa vinculada Código ${linkedExpense.id}. Remova essa despesa antes de excluir a conta.`);
      err.status = 400;
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

  async markAsPaid(id, { paymentTypeId, generateExpense, cashAccountId }) {
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

    let generatedExpense = null;

    if (generateExpense) {
      if (!cashAccountId) {
        const err = new Error('Selecione a conta caixa para gerar a despesa.');
        err.status = 400;
        throw err;
      }

      const cashAccount = await CashAccount.findByPk(cashAccountId);
      if (!cashAccount) {
        const err = new Error('Conta caixa não encontrada.');
        err.status = 404;
        throw err;
      }

      const existingExpense = await Expense.findOne({ where: { accountPayableId: id } });
      if (existingExpense) {
        const err = new Error('Já existe uma despesa vinculada a esta conta a pagar.');
        err.status = 400;
        throw err;
      }
    }

    await sequelize.transaction(async (transaction) => {
      acc.paid = true;
      acc.paymentDate = new Date();

      await acc.save({ transaction });

      if (generateExpense) {
        generatedExpense = await Expense.create(
          {
            cashAccountId,
            accountTypeId: acc.accountTypeId,
            accountPayableId: acc.id,
            description: acc.description,
            value: acc.value,
            expenseDate: normalizeDateOnly(acc.paymentDate)
          },
          { transaction }
        );
      }
    });

    if (generatedExpense) {
      acc.setDataValue('generatedExpense', generatedExpense);
    }

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

    const linkedExpense = await Expense.findOne({ where: { accountPayableId: id } });
    if (linkedExpense) {
      const err = new Error(`Esta conta possui a despesa vinculada Código ${linkedExpense.id}. Remova essa despesa antes de marcar como não paga.`);
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
