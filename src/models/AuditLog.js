const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const AuditLog = sequelize.define(
  'AuditLog',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      field: 'ID_Log'
    },
    occurredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'Data_Hora'
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: 'ID_Usuario'
    },
    username: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: 'Login'
    },
    userName: {
      type: DataTypes.STRING(80),
      allowNull: true,
      field: 'Nome_Usuario'
    },
    profile: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'Perfil'
    },
    action: {
      type: DataTypes.STRING(40),
      allowNull: false,
      field: 'Acao'
    },
    module: {
      type: DataTypes.STRING(60),
      allowNull: false,
      field: 'Modulo'
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'Descricao'
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'Status'
    },
    ip: {
      type: DataTypes.STRING(60),
      allowNull: true,
      field: 'IP'
    },
    method: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: 'Metodo'
    },
    route: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'Rota'
    },
    dataBefore: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'Dados_Antes'
    },
    dataAfter: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'Dados_Depois'
    }
  },
  {
    tableName: 'logs_sistema',
    timestamps: false
  }
);

AuditLog.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

module.exports = AuditLog;
