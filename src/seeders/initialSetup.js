const bcrypt = require('bcrypt');
const { DataTypes, Op } = require('sequelize');
const sequelize = require('../config/database');
const User = require('../models/User');
const Profile = require('../models/Profile');
const PaymentType = require('../models/PaymentType');
const CashAccount = require('../models/CashAccount');
require('../models/AuditLog');
const { PROFILE_IDS } = require('../constants/profileIds');

const SALT_ROUNDS = 10;
const SYSTEM_PROFILES = [
  {
    id: PROFILE_IDS.SUPER_ADMIN,
    name: 'Super Admin',
    description: 'Perfil técnico com acesso total ao sistema'
  },
  {
    id: PROFILE_IDS.ADMIN,
    name: 'Administrador',
    description: 'Perfil administrador do sistema'
  },
  {
    id: PROFILE_IDS.OPERATIONAL,
    name: 'Operacional',
    description: 'Perfil operacional do sistema'
  }
];

async function ensureAccountPlanSchema() {
  const queryInterface = sequelize.getQueryInterface();

  const categoryColumns = await queryInterface.describeTable('categorias_tipos_contas');
  if (categoryColumns.Especie?.type !== 'VARCHAR(30)') {
    await queryInterface.changeColumn('categorias_tipos_contas', 'Especie', {
      type: DataTypes.STRING(30),
      allowNull: true
    });
  }

  if (!categoryColumns.Status_Categoria) {
    await queryInterface.addColumn('categorias_tipos_contas', 'Status_Categoria', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    });
  }

  const accountTypeColumns = await queryInterface.describeTable('tipos_contas');
  if (accountTypeColumns.Especie?.type !== 'VARCHAR(30)') {
    await queryInterface.changeColumn('tipos_contas', 'Especie', {
      type: DataTypes.STRING(30),
      allowNull: true
    });
  }

  if (!accountTypeColumns.Status_Tipo) {
    await queryInterface.addColumn('tipos_contas', 'Status_Tipo', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    });
  }

  const incomeColumns = await queryInterface.describeTable('receitas');
  if (incomeColumns.Data_Receita?.type !== 'DATE') {
    await queryInterface.changeColumn('receitas', 'Data_Receita', {
      type: DataTypes.DATEONLY,
      allowNull: true
    });
  }

  if (!incomeColumns.ID_Conta_Receber) {
    await queryInterface.addColumn('receitas', 'ID_Conta_Receber', {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    });

    await queryInterface.addConstraint('receitas', {
      fields: ['ID_Conta_Receber'],
      type: 'foreign key',
      name: 'receitas_ibfk_conta_receber',
      references: {
        table: 'contas_receber',
        field: 'ID_Conta'
      },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });
  }

  const expenseColumns = await queryInterface.describeTable('despesas');
  if (expenseColumns.Data_Despesa?.type !== 'DATE') {
    await queryInterface.changeColumn('despesas', 'Data_Despesa', {
      type: DataTypes.DATEONLY,
      allowNull: true
    });
  }

  if (!expenseColumns.ID_Conta_Pagar) {
    await queryInterface.addColumn('despesas', 'ID_Conta_Pagar', {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    });

    await queryInterface.addConstraint('despesas', {
      fields: ['ID_Conta_Pagar'],
      type: 'foreign key',
      name: 'despesas_ibfk_conta_pagar',
      references: {
        table: 'contas_pagar',
        field: 'ID_Conta'
      },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });
  }
}

async function ensureOriginAccountsSchema() {
  const queryInterface = sequelize.getQueryInterface();
  const originColumns = await queryInterface.describeTable('origens_contas');

  if (!originColumns.Status_Origem) {
    await queryInterface.addColumn('origens_contas', 'Status_Origem', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    });
  }
}

async function ensureAuditLogSchema() {
  const queryInterface = sequelize.getQueryInterface();
  const tables = await queryInterface.showAllTables();
  const hasAuditLogTable = tables.some((table) => {
    const tableName = typeof table === 'string' ? table : table.tableName;
    return tableName === 'logs_sistema';
  });

  if (!hasAuditLogTable) {
    await queryInterface.createTable('logs_sistema', {
      ID_Log: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      Data_Hora: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      ID_Usuario: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true
      },
      Login: {
        type: DataTypes.STRING(30),
        allowNull: true
      },
      Nome_Usuario: {
        type: DataTypes.STRING(80),
        allowNull: true
      },
      Perfil: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      Acao: {
        type: DataTypes.STRING(40),
        allowNull: false
      },
      Modulo: {
        type: DataTypes.STRING(60),
        allowNull: false
      },
      Descricao: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      Status: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      IP: {
        type: DataTypes.STRING(60),
        allowNull: true
      },
      Metodo: {
        type: DataTypes.STRING(10),
        allowNull: true
      },
      Rota: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      Dados_Antes: {
        type: DataTypes.TEXT('long'),
        allowNull: true
      },
      Dados_Depois: {
        type: DataTypes.TEXT('long'),
        allowNull: true
      }
    });

    return;
  }

  const columns = await queryInterface.describeTable('logs_sistema');
  const requiredColumns = {
    Data_Hora: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    ID_Usuario: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    Login: { type: DataTypes.STRING(30), allowNull: true },
    Nome_Usuario: { type: DataTypes.STRING(80), allowNull: true },
    Perfil: { type: DataTypes.STRING(50), allowNull: true },
    Acao: { type: DataTypes.STRING(40), allowNull: false },
    Modulo: { type: DataTypes.STRING(60), allowNull: false },
    Descricao: { type: DataTypes.STRING(255), allowNull: true },
    Status: { type: DataTypes.STRING(20), allowNull: true },
    IP: { type: DataTypes.STRING(60), allowNull: true },
    Metodo: { type: DataTypes.STRING(10), allowNull: true },
    Rota: { type: DataTypes.STRING(255), allowNull: true },
    Dados_Antes: { type: DataTypes.TEXT('long'), allowNull: true },
    Dados_Depois: { type: DataTypes.TEXT('long'), allowNull: true }
  };

  for (const [columnName, definition] of Object.entries(requiredColumns)) {
    if (!columns[columnName]) {
      await queryInterface.addColumn('logs_sistema', columnName, definition);
    }
  }
}

async function ensureSystemProfiles() {
  const profiles = await Profile.findAll();
  const superProfile = profiles.find((profile) => {
    const name = String(profile.name || '').toLowerCase();
    return name.includes('super');
  });
  const adminProfile = profiles.find((profile) => {
    const name = String(profile.name || '').toLowerCase();
    return (name.includes('admin') || name.includes('administrador') || name.includes('master')) && !name.includes('super');
  });
  const operationalProfile = profiles.find((profile) => {
    const name = String(profile.name || '').toLowerCase();
    return name.includes('operacional') || name.includes('comum');
  });

  const profileIdMap = [
    [superProfile?.id, PROFILE_IDS.SUPER_ADMIN],
    [adminProfile?.id, PROFILE_IDS.ADMIN],
    [operationalProfile?.id, PROFILE_IDS.OPERATIONAL]
  ].filter(([fromId, toId]) => fromId && Number(fromId) !== Number(toId));

  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

  if (profileIdMap.length > 0) {
    const caseStatements = profileIdMap
      .map(([fromId, toId]) => `WHEN ${Number(fromId)} THEN ${Number(toId)}`)
      .join(' ');
    const sourceIds = profileIdMap.map(([fromId]) => Number(fromId)).join(', ');

    await sequelize.query(`
      UPDATE usuarios
      SET ID_Perfil = CASE ID_Perfil ${caseStatements} ELSE ID_Perfil END
      WHERE ID_Perfil IN (${sourceIds})
    `);
  }

  await Profile.destroy({
    where: {
      [Op.or]: [
        { id: { [Op.in]: SYSTEM_PROFILES.map((profile) => profile.id) } },
        { name: { [Op.in]: ['Super Admin', 'Administrador', 'Administrador Master', 'Usuário Operacional', 'Usuário Comum', 'Operacional'] } }
      ]
    }
  });

  for (const profile of SYSTEM_PROFILES) {
    await Profile.create({
      id: profile.id,
      name: profile.name,
      description: profile.description,
      statusProfile: 1
    });
  }

  await sequelize.query('ALTER TABLE perfis AUTO_INCREMENT = 4');
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

  return {
    superAdminProfile: await Profile.findByPk(PROFILE_IDS.SUPER_ADMIN),
    adminProfile: await Profile.findByPk(PROFILE_IDS.ADMIN),
    operationalProfile: await Profile.findByPk(PROFILE_IDS.OPERATIONAL)
  };
}

async function init() {
  try {
    await ensureAccountPlanSchema();
    await ensureOriginAccountsSchema();
    await ensureAuditLogSchema();

    // ---------- 1. Perfis do sistema ----------
    const { superAdminProfile } = await ensureSystemProfiles();
    console.log('Perfis padrão sincronizados!');

    // ---------- 2. Super administrador padrão ----------
    const defaultUsers = [
      {
        username: 'superadmin',
        name: 'Super Admin',
        password: '123456',
        active: 1,
        profileId: superAdminProfile.id
      }
    ];

    for (const defaultUser of defaultUsers) {
      const existingUser = await User.findOne({ where: { username: defaultUser.username } });
      if (existingUser) {
        continue;
      }

      const hashedPassword = await bcrypt.hash(defaultUser.password, SALT_ROUNDS);
      await User.create({
        username: defaultUser.username,
        name: defaultUser.name,
        password: hashedPassword,
        active: defaultUser.active,
        profileId: defaultUser.profileId
      });

      console.log(`Usuário padrão '${defaultUser.username}' criado!`);
    }

    // ---------- 3. Tipos de pagamento ----------
    const defaultPaymentTypes = [
      {
        name: 'Pix',
        description: 'Pagamento via Pix',
        status: 1
      },
      {
        name: 'Cartão de Crédito',
        description: 'Pagamento com cartão de crédito',
        status: 1
      },
      {
        name: 'Título',
        description: 'Pagamento via título bancário',
        status: 1
      },
      {
        name: 'Dinheiro',
        description: 'Pagamento em dinheiro',
        status: 1
      },
      {
        name: 'Depósito',
        description: 'Depósito bancário',
        status: 1
      },
      {
        name: 'Cheque',
        description: 'Pagamento em cheque',
        status: 1
      }
    ];

    for (const paymentType of defaultPaymentTypes) {
      const existingPaymentType = await PaymentType.findOne({ where: { name: paymentType.name } });
      if (existingPaymentType) {
        continue;
      }

      await PaymentType.create(paymentType);
      console.log(`Tipo de pagamento padrão '${paymentType.name}' criado!`);
    }

    // ---------- 4. Conta caixa padrão ----------
    let defaultCashAccount = await CashAccount.findOne({ where: { name: 'Caixa Principal' } });
    const oldDefaultCashAccount = await CashAccount.findOne({ where: { name: 'Conta Caixa Principal' } });
    if (!defaultCashAccount && oldDefaultCashAccount) {
      await oldDefaultCashAccount.update({
        name: 'Caixa Principal',
        description: 'Conta caixa principal do sistema'
      });
      defaultCashAccount = oldDefaultCashAccount;
    }

    if (!defaultCashAccount) {
      defaultCashAccount = await CashAccount.findOne({ order: [['id', 'ASC']] });
    }

    if (!defaultCashAccount) {
      await CashAccount.create({
        name: 'Caixa Principal',
        description: 'Conta caixa principal do sistema',
        status: 1
      });
      console.log("Conta caixa padrão 'Caixa Principal' criada!");
    }

    console.log('Seed inicial concluída!');
  } catch (err) {
    console.error('Erro ao executar seed inicial:', err);
  }
}

module.exports = init;
