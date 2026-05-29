const { Op } = require('sequelize');
const AccountsPayable = require('../models/AccountsPayable');
const AccountsReceivable = require('../models/AccountsReceivable');
const Income = require('../models/Income');
const Expense = require('../models/Expense');
const AccountType = require('../models/AccountType');

const normalizeDateOnly = (value) => {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const toMonthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const getMonthRange = (monthKey) => ({
  start: `${monthKey}-01`,
  end: `${monthKey}-31`
});

const getLastMonths = (quantity = 6) => {
  const today = new Date();

  return Array.from({ length: quantity }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (quantity - 1 - index), 1);

    return {
      mes: date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      key: toMonthKey(date),
      receitas: 0,
      despesas: 0
    };
  });
};

const mapAccount = (account) => ({
  id: account.id,
  description: account.description,
  dueDate: normalizeDateOnly(account.dueDate),
  value: Number(account.value || 0),
  paid: Boolean(account.paid),
  accountType: account.accountType
    ? {
        id: account.accountType.id,
        description: account.accountType.description
      }
    : null
});

const mapCashEntry = (entry, dateField) => ({
  id: entry.id,
  description: entry.description,
  value: Number(entry.value || 0),
  [dateField]: normalizeDateOnly(entry[dateField]),
  accountType: entry.accountType
    ? {
        id: entry.accountType.id,
        description: entry.accountType.description
      }
    : null
});

class HomeDashboardService {
  async getHomeData() {
    const months = getLastMonths(6);
    const firstMonth = months[0].key;
    const lastMonth = months[months.length - 1].key;
    const firstRange = getMonthRange(firstMonth);
    const lastRange = getMonthRange(lastMonth);

    const [incomes, expenses, pendingPayables, pendingReceivables] = await Promise.all([
      Income.findAll({
        where: {
          incomeDate: {
            [Op.between]: [firstRange.start, lastRange.end]
          }
        },
        include: [{ model: AccountType, as: 'accountType' }]
      }),
      Expense.findAll({
        where: {
          expenseDate: {
            [Op.between]: [firstRange.start, lastRange.end]
          }
        },
        include: [{ model: AccountType, as: 'accountType' }]
      }),
      AccountsPayable.findAll({
        where: { paid: false },
        include: [{ model: AccountType, as: 'accountType' }],
        order: [
          ['dueDate', 'ASC'],
          ['id', 'ASC']
        ]
      }),
      AccountsReceivable.findAll({
        where: { paid: false },
        include: [{ model: AccountType, as: 'accountType' }],
        order: [
          ['dueDate', 'ASC'],
          ['id', 'ASC']
        ]
      })
    ]);

    const monthlyData = months.map((month) => ({ ...month }));
    const monthMap = new Map(monthlyData.map((month) => [month.key, month]));

    incomes.forEach((income) => {
      const month = monthMap.get(normalizeDateOnly(income.incomeDate).slice(0, 7));
      if (month) month.receitas += Number(income.value || 0);
    });

    expenses.forEach((expense) => {
      const month = monthMap.get(normalizeDateOnly(expense.expenseDate).slice(0, 7));
      if (month) month.despesas += Number(expense.value || 0);
    });

    return {
      monthlyData,
      incomes: incomes.map((income) => mapCashEntry(income, 'incomeDate')),
      expenses: expenses.map((expense) => mapCashEntry(expense, 'expenseDate')),
      payables: pendingPayables.map(mapAccount),
      receivables: pendingReceivables.map(mapAccount)
    };
  }
}

module.exports = new HomeDashboardService();
