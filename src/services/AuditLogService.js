const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const Profile = require('../models/Profile');
const { Op, col } = require('sequelize');
const { PROFILE_IDS } = require('../constants/profileIds');

const stringifyData = (value) => {
  if (value === undefined || value === null) return null;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const getRequestIp = (req) => {
  const forwardedFor = req?.headers?.['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req?.ip || req?.socket?.remoteAddress || null;
};

const ACTION_FILTERS = {
  LOGIN: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGIN'],
  CADASTRO: ['CREATE', 'CADASTRO'],
  ALTERACAO: ['UPDATE', 'ALTERACAO', 'ALTERAÇÃO'],
  EXCLUSAO: ['DELETE', 'REMOVE', 'EXCLUSAO', 'EXCLUSÃO'],
  ATIVACAO: ['ATIVACAO', 'ATIVAÇÃO', 'REATIVACAO', 'REATIVAÇÃO'],
  INATIVACAO: ['INACTIVE', 'INATIVACAO', 'INATIVAÇÃO', 'DESATIVACAO', 'DESATIVAÇÃO'],
  ATIVACAO_INATIVACAO: ['ATIVACAO', 'ATIVAÇÃO', 'REATIVACAO', 'REATIVAÇÃO', 'INACTIVE', 'INATIVACAO', 'INATIVAÇÃO', 'DESATIVACAO', 'DESATIVAÇÃO'],
  STATUS_FINANCEIRO: ['PAGAMENTO', 'DESPAGAMENTO', 'RECEBIMENTO', 'DESRECEBIMENTO'],
  STATUS_PAGAMENTO: ['PAGAMENTO', 'DESPAGAMENTO'],
  STATUS_RECEBIMENTO: ['RECEBIMENTO', 'DESRECEBIMENTO'],
  BACKUP: ['BACKUP'],
  PAGAMENTO: ['PAGAMENTO'],
  DESPAGAMENTO: ['DESPAGAMENTO'],
  RECEBIMENTO: ['RECEBIMENTO'],
  DESRECEBIMENTO: ['DESRECEBIMENTO']
};

const ACTION_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'LOGIN', label: 'Login' },
  { value: 'CADASTRO', label: 'Cadastro' },
  { value: 'ALTERACAO', label: 'Alteração' },
  { value: 'EXCLUSAO', label: 'Exclusão' },
  { value: 'ATIVACAO_INATIVACAO', label: 'Ativação/Inativação' },
  { value: 'STATUS_FINANCEIRO', label: 'Status Financeiro' },
  { value: 'STATUS_PAGAMENTO', label: 'Status Pago/Não Pago' },
  { value: 'STATUS_RECEBIMENTO', label: 'Status Recebido/Não Recebido' },
  { value: 'BACKUP', label: 'Backup' }
];

const EXACT_ACTION_FILTERS = ['PAGAMENTO', 'DESPAGAMENTO', 'RECEBIMENTO', 'DESRECEBIMENTO'];

const MODULE_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'LOGIN', label: 'Login' },
  { value: 'USUARIOS', label: 'Usuários' },
  { value: 'PLANO_CONTAS', label: 'Plano de Contas' },
  { value: 'TIPOS_PAGAMENTO', label: 'Tipos de Pagamento' },
  { value: 'CONTAS_PAGAR', label: 'Contas a Pagar' },
  { value: 'CONTAS_RECEBER', label: 'Contas a Receber' },
  { value: 'RECEITAS', label: 'Receitas' },
  { value: 'DESPESAS', label: 'Despesas' },
  { value: 'BACKUP', label: 'Manutenção/Backups' },
  { value: 'MANUTENCAO', label: 'Manutenção/Logs' }
];

const MODULE_FILTERS = {
  LOGIN: ['AUTENTICACAO', 'LOGIN'],
  PLANO_CONTAS: ['PLANO_CONTAS', 'PLANO_CONTAS_TIPOS', 'PLANO_CONTAS_CATEGORIAS', 'TIPOS_CONTAS', 'CATEGORIAS_TIPOS_CONTAS']
};

class AuditLogService {
  async ensureSuperAdmin(requesterId) {
    const requester = await User.findByPk(requesterId, {
      include: [{ model: Profile, as: 'profile' }],
      attributes: { exclude: ['password'] }
    });

    if (!requester || Number(requester.profileId) !== PROFILE_IDS.SUPER_ADMIN) {
      const error = new Error('Apenas Super Admin pode acessar auditoria.');
      error.status = 403;
      throw error;
    }

    return requester;
  }

  async getPaginated(filters = {}, requester = null) {
    await this.ensureSuperAdmin(requester?.id);

    const page = Number.isInteger(Number(filters.page)) ? Math.max(1, Number(filters.page)) : 1;
    const limit = Number.isInteger(Number(filters.limit)) ? Math.min(Math.max(1, Number(filters.limit)), 100) : 10;
    const offset = (page - 1) * limit;
    const where = {};
    const orderDirection = String(filters.sortDirection || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const orderMap = {
      dataHora: 'Data_Hora',
      login: 'Login',
      perfil: 'Perfil',
      acao: 'Acao',
      modulo: 'Modulo',
      status: 'Status',
      ip: 'IP'
    };
    const sortColumn = orderMap[filters.sortBy] || 'Data_Hora';

    if (filters.login && String(filters.login).trim() && String(filters.login) !== 'todos') {
      where.username = String(filters.login).trim();
    }

    if (filters.action && String(filters.action).trim() && String(filters.action) !== 'todos') {
      const action = String(filters.action).trim();
      const groupedActions = ACTION_FILTERS[action];

      if (EXACT_ACTION_FILTERS.includes(action)) {
        where.action = action;
      } else if (groupedActions) {
        where.action = { [Op.or]: groupedActions.map((item) => ({ [Op.like]: `%${item}%` })) };
      } else {
        where.action = { [Op.like]: `%${action}%` };
      }
    }

    if (filters.module && String(filters.module).trim() && String(filters.module) !== 'todos') {
      const module = String(filters.module).trim();
      const groupedModules = MODULE_FILTERS[module];

      if (groupedModules) {
        where.module = { [Op.or]: groupedModules.map((item) => ({ [Op.like]: `%${item}%` })) };
      } else {
        where.module = { [Op.like]: `%${module}%` };
      }
    }

    if (filters.status && String(filters.status).trim() && String(filters.status) !== 'todos') {
      where.status = String(filters.status).trim();
    }

    if (filters.startDate || filters.endDate) {
      where.occurredAt = {};

      if (filters.startDate) {
        where.occurredAt[Op.gte] = new Date(`${filters.startDate}T00:00:00`);
      }

      if (filters.endDate) {
        where.occurredAt[Op.lte] = new Date(`${filters.endDate}T23:59:59`);
      }
    }

    const total = await AuditLog.count({ where });
    const items = await AuditLog.findAll({
      where,
      order: [[col(`AuditLog.${sortColumn}`), orderDirection], ['id', 'DESC']],
      limit,
      offset
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  async deleteOlderThanMonths(months, requester = null) {
    await this.ensureSuperAdmin(requester?.id);
    const { cutoffDate, months: monthsNumber } = this.getCleanupCutoffDate(months);

    const deletedCount = await AuditLog.destroy({
      where: {
        occurredAt: {
          [Op.lt]: cutoffDate
        }
      }
    });

    return {
      deletedCount,
      cutoffDate,
      months: monthsNumber
    };
  }

  getCleanupCutoffDate(months) {
    const allowedMonths = [6, 12, 24];
    const monthsNumber = Number(months);

    if (!allowedMonths.includes(monthsNumber)) {
      const error = new Error('Período inválido para limpeza de logs.');
      error.status = 400;
      throw error;
    }

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsNumber);
    cutoffDate.setHours(0, 0, 0, 0);

    return {
      cutoffDate,
      months: monthsNumber
    };
  }

  async getLastManualCleanup(requester = null) {
    await this.ensureSuperAdmin(requester?.id);

    return await AuditLog.findOne({
      where: {
        action: 'DELETE',
        module: 'MANUTENCAO',
        status: 'SUCESSO',
        description: {
          [Op.like]: 'Limpeza manual removeu%'
        }
      },
      order: [['occurredAt', 'DESC']]
    });
  }

  async getFilterOptions(requester = null) {
    await this.ensureSuperAdmin(requester?.id);

    const users = await User.findAll({
      attributes: ['username'],
      order: [['username', 'ASC']]
    });

    const userOptions = users.map((user) => ({
      value: user.username,
      label: user.username
    }));

    return {
      actions: ACTION_OPTIONS,
      users: userOptions,
      modules: MODULE_OPTIONS
    };
  }

  async register({ req = null, user = null, username = null, action, module, description = null, status = null, before = null, after = null }) {
    let auditUser = user;

    if (auditUser?.id && (!auditUser.name || !auditUser.profile)) {
      auditUser = await User.findByPk(auditUser.id, {
        include: [{ model: Profile, as: 'profile' }],
        attributes: { exclude: ['password'] }
      });
    }

    return await AuditLog.create({
      userId: auditUser?.id ?? null,
      username: auditUser?.username ?? username ?? null,
      userName: auditUser?.name ?? null,
      profile: auditUser?.profile?.name ?? null,
      action,
      module,
      description,
      status,
      ip: getRequestIp(req),
      method: req?.method ?? null,
      route: req?.originalUrl ?? req?.url ?? null,
      dataBefore: stringifyData(before),
      dataAfter: stringifyData(after)
    });
  }

  async safeRegister(data) {
    try {
      return await this.register(data);
    } catch (error) {
      console.error('AUDIT LOG ERROR:', error);
      return null;
    }
  }
}

module.exports = new AuditLogService();
