const Income = require('../models/Income');
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

class IncomeService {
  async getAll() {
    return await Income.findAll({
      include: [
        { model: CashAccount, as: 'cashAccount' },
        { model: AccountType, as: 'accountType' }
      ]
    });
  }

  async getOne(id) {
    return await Income.findByPk(id, {
      include: [
        { model: CashAccount, as: 'cashAccount' },
        { model: AccountType, as: 'accountType' }
      ]
    });
  }

  async create(data) {
    if (!data.cashAccountId || !data.value) {
      const err = new Error('cashAccountId and value are required');
      err.status = 400;
      throw err;
    }

    const cashAcc = await CashAccount.findByPk(data.cashAccountId);
    if (!cashAcc) {
      const err = new Error('CashAccount not found');
      err.status = 404;
      throw err;
    }

    if (data.accountTypeId) {
      const at = await AccountType.findByPk(data.accountTypeId);
      if (!at) {
        const err = new Error('AccountType not found');
        err.status = 404;
        throw err;
      }
    }

    return await Income.create({
      cashAccountId: data.cashAccountId,
      accountTypeId: data.accountTypeId || null,
      description: data.description || null,
      value: data.value,
      incomeDate: normalizeDateOnly(data.incomeDate) || getTodayDateOnly()
    });
  }

  async update(id, data) {
    const inc = await Income.findByPk(id);
    if (!inc) {
      const err = new Error('Income not found');
      err.status = 404;
      throw err;
    }

    if (data.cashAccountId) {
      const cashAcc = await CashAccount.findByPk(data.cashAccountId);
      if (!cashAcc) {
        const err = new Error('CashAccount not found');
        err.status = 404;
        throw err;
      }
    }

    if (data.accountTypeId) {
      const at = await AccountType.findByPk(data.accountTypeId);
      if (!at) {
        const err = new Error('AccountType not found');
        err.status = 404;
        throw err;
      }
    }

    await inc.update({
      cashAccountId: data.cashAccountId !== undefined ? data.cashAccountId : inc.cashAccountId,
      accountTypeId: data.accountTypeId !== undefined ? data.accountTypeId : inc.accountTypeId,
      description: data.description !== undefined ? data.description : inc.description,
      value: data.value !== undefined ? data.value : inc.value,
      incomeDate: data.incomeDate !== undefined ? normalizeDateOnly(data.incomeDate) : inc.incomeDate
    });

    return inc;
  }

  async remove(id) {
    const inc = await Income.findByPk(id);
    if (!inc) {
      const err = new Error('Income not found');
      err.status = 404;
      throw err;
    }
    await inc.destroy();
    return { message: 'Income Deleted successfully' };
  }
}

module.exports = new IncomeService();
