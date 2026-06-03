const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OriginAccount = sequelize.define(
  'OriginAccount',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      field: 'ID_Origem'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'Descricao'
    },
    obs: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'Obs'
    },
    category: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: 'Categoria',
      comment: '1:Despesa - 2:Receita'
    },
    person: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: 'Pessoa',
      comment: '0: False - 1:True'
    },
    status: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'Status_Origem'
    }
  },
  {
    tableName: 'origens_contas',
    timestamps: false
  }
);

module.exports = OriginAccount;
