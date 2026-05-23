const User = require('../models/User');
const Profile = require('../models/Profile');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const JWT_SECRET = "sua_chave_secreta_aqui"; // trocar por variável de ambiente
const SALT_ROUNDS = 10;
const includeUserRelations = [{ model: Profile, as: 'profile' }];

const getPaginationNumber = (value, fallback, { min = 1, max = 1000 } = {}) => {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, min), max);
};

const getUserRole = (user) => {
  const profileName = user.profile?.name || '';
  return profileName.toLowerCase().includes('admin') ? 'admin' : 'comum';
};

const isAdminUser = (user) => getUserRole(user) === 'admin';

const getUserWithProfile = async (id) => {
  return await User.findByPk(id, {
    include: includeUserRelations,
    attributes: { exclude: ['password'] }
  });
};

const ensureAdminRequester = async (requesterId) => {
  const requester = await getUserWithProfile(requesterId);

  if (!requester || !isAdminUser(requester)) {
    const error = new Error("Apenas usuários administradores podem remover usuários.");
    error.status = 403;
    throw error;
  }

  return requester;
};

const countActiveAdmins = async () => {
  const users = await User.findAll({
    where: { active: 1 },
    include: includeUserRelations,
    attributes: ['id', 'active']
  });

  return users.filter(isAdminUser).length;
};

const getProfileRoleById = async (profileId) => {
  if (!profileId) return 'comum';

  const profile = await Profile.findByPk(profileId);
  if (!profile) return 'comum';

  return profile.name.toLowerCase().includes('admin') ? 'admin' : 'comum';
};

class UserService {

  async getAll() {
    const users = await User.findAll({
      include: includeUserRelations,
      attributes: { exclude: ['password'] }
    });
    return users;
  }

  async getPaginated(filters = {}) {
    const page = getPaginationNumber(filters.page, 1);
    const limit = getPaginationNumber(filters.limit, 10, { min: 1, max: 100 });
    const offset = (page - 1) * limit;
    const where = {};
    const include = includeUserRelations;

    if (filters.search && String(filters.search).trim()) {
      const search = String(filters.search).trim();
      const profileMatches = await Profile.findAll({
        attributes: ['id'],
        where: {
          name: { [Op.like]: `%${search}%` }
        }
      });
      const profileIds = profileMatches.map((profile) => profile.id);
      const searchConditions = [
        { name: { [Op.like]: `%${search}%` } },
        { username: { [Op.like]: `%${search}%` } }
      ];

      if (profileIds.length > 0) {
        searchConditions.push({ profileId: { [Op.in]: profileIds } });
      }

      where[Op.or] = [
        ...searchConditions
      ];
    }

    const orderDirection = String(filters.sortDirection || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    let order;

    if (filters.sortBy === 'perfil') {
      order = [[{ model: Profile, as: 'profile' }, 'name', orderDirection]];
    } else {
      const orderMap = {
        id: 'id',
        nome: 'name',
        login: 'username',
        status: 'active'
      };
      order = [[orderMap[filters.sortBy] || 'name', orderDirection]];
    }

    const count = await User.count({
      where
    });

    const rows = await User.findAll({
      where,
      include,
      attributes: { exclude: ['password'] },
      order,
      limit,
      offset
    });

    const summaryRows = await User.findAll({
      where,
      include,
      attributes: ['active']
    });

    const summary = summaryRows.reduce(
      (acc, user) => {
        acc.total += 1;
        if (Number(user.active) === 1) {
          acc.ativos += 1;
        }
        if (getUserRole(user) === 'admin') {
          acc.admins += 1;
        } else {
          acc.comuns += 1;
        }
        return acc;
      },
      { total: 0, ativos: 0, admins: 0, comuns: 0 }
    );

    return {
      items: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.max(1, Math.ceil(count / limit))
      },
      summary
    };
  }

  async getOne(id) {
    const user = await User.findByPk(id, {
      include: includeUserRelations,
      attributes: { exclude: ['password'] }
    });
    return user;
  }

  async create(data) {
    if (!data.name || !data.username || !data.password) {
      const error = new Error("Missing required fields");
      error.status = 400;
      throw error;
    }

    // verifica se username já existe
    const existing = await User.findOne({ where: { username: data.username } });
    if (existing) {
      const error = new Error("Username already exists");
      error.status = 400;
      throw error;
    }

    // hash da senha
    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

    const user = await User.create({
      username: data.username,
      name: data.name,
      password: hashedPassword,
      active: data.active ?? 1,
      profileId: data.profileId || null
    });

    const result = user.toJSON();
    delete result.password;

    return result;
  }

  async update(id, data, requester = null) {
    const user = await getUserWithProfile(id);

    if (!user) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }

    const currentRole = getUserRole(user);
    const nextRole = data.profileId !== undefined ? await getProfileRoleById(data.profileId) : currentRole;
    const nextActive = data.active !== undefined ? Number(data.active) : Number(user.active);

    if (requester && Number(requester.id) === Number(user.id) && currentRole === 'admin' && nextActive !== 1) {
      const error = new Error("Usuário administrador não pode inativar a si mesmo.");
      error.status = 400;
      throw error;
    }

    if (currentRole === 'admin' && Number(user.active) === 1 && (nextRole !== 'admin' || nextActive !== 1)) {
      const activeAdmins = await countActiveAdmins();

      if (activeAdmins <= 1) {
        const error = new Error("Não é possível remover, inativar ou alterar para comum o único usuário administrador ativo.");
        error.status = 400;
        throw error;
      }
    }

    if (data.password) {
      data.password = await bcrypt.hash(data.password, SALT_ROUNDS);
    }

    await user.update({
      username: data.username ?? user.username,
      name: data.name ?? user.name,
      password: data.password ?? user.password,
      active: data.active ?? user.active,
      profileId: data.profileId ?? user.profileId
    });

    const result = user.toJSON();
    delete result.password;

    return result;
  }

  async delete(id, requester = null) {
    const requesterId = requester?.id;
    await ensureAdminRequester(requesterId);

    const user = await getUserWithProfile(id);

    if (!user) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }

    if (Number(user.id) === Number(requesterId) && isAdminUser(user)) {
      const error = new Error("Usuário administrador não pode remover a si mesmo.");
      error.status = 400;
      throw error;
    }

    if (isAdminUser(user) && Number(user.active) === 1) {
      const activeAdmins = await countActiveAdmins();

      if (activeAdmins <= 1) {
        const error = new Error("Não é possível remover o único usuário administrador ativo.");
        error.status = 400;
        throw error;
      }
    }

    await user.destroy();
    return { message: "User deleted successfully" };
  }

  async login(username, password) {
    const user = await User.findOne({
      where: { username },
      include: [{ model: Profile, as: 'profile' }]
    });

    if (!user) {
      const error = new Error("Usuário ou senha inválidos.");
      error.status = 401;
      throw error;
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      const error = new Error("Usuário ou senha inválidos.");
      error.status = 401;
      throw error;
    }

    if (Number(user.active) !== 1) {
      const error = new Error("Usuário inativo. Entre em contato com o administrador.");
      error.status = 403;
      throw error;
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    const result = user.toJSON();
    delete result.password;

    return { user: result, token };
  }
}

module.exports = new UserService();
