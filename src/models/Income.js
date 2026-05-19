const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const CashAccount = require('./CashAccount');
const AccountType = require('./AccountType'); // tipos_contas

const Income = sequelize.define(
  'Income', 
  {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
    field: 'ID_Receita'
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
    allowNull: true,
    field: 'Valor'
  },
  incomeDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'Data_Receita'
  },
  cashAccountId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'ID_ContaCaixa',
    references: {
      model: CashAccount,
      key: 'ID_Conta'
    }
  }
}, {
  tableName: 'receitas',
  timestamps: false
});

// Associações
Income.belongsTo(AccountType, { foreignKey: 'accountTypeId', as: 'accountType' });
Income.belongsTo(CashAccount, { foreignKey: 'cashAccountId', as: 'cashAccount' });

module.exports = Income;
