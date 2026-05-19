const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const CategoryType = require('./CategoryType');

const AccountType = sequelize.define(
  'AccountType',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      field: 'ID_Tipo'
    },
    description: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: 'Descricao'
    },
    type: {
      type: DataTypes.STRING(15),
      allowNull: true,
      field: 'Tipo'
    },
    specie: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: 'Especie'
    },
    status: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'Status_Tipo'
    },
    categoryId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'ID_Categoria',
      references: {
        model: CategoryType,
        key: 'ID_Categoria'
      }
    }
  },
  {
    tableName: 'tipos_contas',
    timestamps: false
  }
);

AccountType.belongsTo(CategoryType, { foreignKey: 'categoryId', as: 'category' });
CategoryType.hasMany(AccountType, { foreignKey: 'categoryId', as: 'accounts' });

module.exports = AccountType;
