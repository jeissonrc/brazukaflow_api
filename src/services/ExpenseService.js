const Expense = require('../models/Expense');
const CashAccount = require('../models/CashAccount');
const AccountType = require('../models/AccountType');

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

class ExpenseService {
  async getAll() {
    return await Expense.findAll({
      include: [
        { model: CashAccount, as: 'cashAccount' },
        { model: AccountType, as: 'accountType' }
      ]
    });
  }

  async getOne(id) {
    return await Expense.findByPk(id, {
      include: [
        { model: CashAccount, as: 'cashAccount' },
        { model: AccountType, as: 'accountType' }
      ]
    });
  }

  async create(data) {
    if (!data.cashAccountId || !data.value) {
      const err = new Error("cashAccountId and value are required");
      err.status = 400;
      throw err;
    }

    const cashAccount = await CashAccount.findByPk(data.cashAccountId);
    if (!cashAccount) {
      const err = new Error("CashAccount not found");
      err.status = 404;
      throw err;
    }

    if (data.accountTypeId) {
      const accType = await AccountType.findByPk(data.accountTypeId);
      if (!accType) {
        const err = new Error("AccountType not found");
        err.status = 404;
        throw err;
      }
    }

    return await Expense.create({
      cashAccountId: data.cashAccountId,
      accountTypeId: data.accountTypeId || null,
      description: data.description || null,
      value: data.value,
      expenseDate: normalizeDateOnly(data.expenseDate) || getTodayDateOnly()
    });
  }

  async update(id, data) {
    const expense = await Expense.findByPk(id);
    if (!expense) {
      const err = new Error("Expense not found");
      err.status = 404;
      throw err;
    }

    if (data.cashAccountId) {
      const ca = await CashAccount.findByPk(data.cashAccountId);
      if (!ca) {
        const err = new Error("CashAccount not found");
        err.status = 404;
        throw err;
      }
    }

    if (data.accountTypeId) {
      const at = await AccountType.findByPk(data.accountTypeId);
      if (!at) {
        const err = new Error("AccountType not found");
        err.status = 404;
        throw err;
      }
    }

    await expense.update({
      cashAccountId: data.cashAccountId ?? expense.cashAccountId,
      accountTypeId: data.accountTypeId ?? expense.accountTypeId,
      description: data.description ?? expense.description,
      value: data.value ?? expense.value,
      expenseDate: data.expenseDate !== undefined ? normalizeDateOnly(data.expenseDate) : expense.expenseDate
    });

    return expense;
  }

  async remove(id) {
    const expense = await Expense.findByPk(id);
    if (!expense) {
      const err = new Error("Expense not found");
      err.status = 404;
      throw err;
    }

    await expense.destroy();
    return { message: "Expense deleted successfully" };
  }
}

module.exports = new ExpenseService();
