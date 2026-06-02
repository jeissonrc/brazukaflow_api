const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const CashAccount = require('./CashAccount');
const AccountType = require('./AccountType');
const AccountsPayable = require('./AccountsPayable');

const Expense = sequelize.define(
  'Expense',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      field: 'ID_Despesa'
    },

    cashAccountId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'ID_ContaCaixa',
      references: {
        model: CashAccount,
        key: 'ID_Conta'
      }
    },

    accountTypeId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: 'ID_Tipo',
      references: {
        model: AccountType,
        key: 'ID_Tipo'
      }
    },

    description: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'Descricao'
    },

    value: {
      type: DataTypes.DECIMAL(18,2),
      allowNull: false,
      field: 'Valor'
    },

    expenseDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'Data_Despesa'
    },

    accountPayableId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: 'ID_Conta_Pagar',
      references: {
        model: AccountsPayable,
        key: 'ID_Conta'
      }
    }
  },
  {
    tableName: 'despesas',
    timestamps: false
  }
);

// Associações
Expense.belongsTo(CashAccount, { foreignKey: 'cashAccountId', as: 'cashAccount' });
Expense.belongsTo(AccountType, { foreignKey: 'accountTypeId', as: 'accountType' });
Expense.belongsTo(AccountsPayable, { foreignKey: 'accountPayableId', as: 'accountPayable' });
AccountsPayable.hasMany(Expense, { foreignKey: 'accountPayableId', as: 'linkedExpenses' });

module.exports = Expense;
