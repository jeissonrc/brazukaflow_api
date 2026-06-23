const User = require('../models/User');
const Profile = require('../models/Profile');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op, literal } = require('sequelize');
const { PROFILE_IDS, USER_ROLES, getRoleByProfileId } = require('../constants/profileIds');

//const JWT_SECRET = "sua_chave_secreta_aqui"; // trocar por variável de ambiente
const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;
const includeUserRelations = [{ model: Profile, as: 'profile' }];

const getPaginationNumber = (value, fallback, { min = 1, max = 1000 } = {}) => {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, min), max);
};

const getUserRole = (user) => getRoleByProfileId(user?.profileId ?? user?.profile?.id);

const isSuperAdminUser = (user) => getUserRole(user) === USER_ROLES.SUPER_ADMIN;
const isRegularAdminUser = (user) => getUserRole(user) === USER_ROLES.ADMIN;
const isAdminUser = (user) => [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN].includes(getUserRole(user));

const getUserWithProfile = async (id) => {
  return await User.findByPk(id, {
    include: includeUserRelations,
    attributes: { exclude: ['password'] }
  });
};

const createError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const ensureAdminRequester = async (requesterId) => {
  const requester = await getUserWithProfile(requesterId);

  if (!requester || !isAdminUser(requester)) {
    throw createError("Apenas usuários administradores podem gerenciar usuários.", 403);
  }

  return requester;
};

const countActiveAdmins = async () => {
  return await User.count({
    where: {
      active: 1,
      profileId: PROFILE_IDS.ADMIN
    }
  });
};

const countActiveUsers = async () => {
  return await User.count({ where: { active: 1 } });
};

const getProfileRoleById = async (profileId) => {
  return getRoleByProfileId(profileId);
};

class UserService {

  async getAll(requester = null) {
    const requesterUser = requester?.id ? await getUserWithProfile(requester.id) : null;
    const requesterIsSuperAdmin = requesterUser && isSuperAdminUser(requesterUser);
    const where = requester?.id && !(requesterUser && isAdminUser(requesterUser))
      ? { id: requester.id }
      : requesterIsSuperAdmin
        ? {}
        : { profileId: { [Op.ne]: PROFILE_IDS.SUPER_ADMIN } };

    const users = await User.findAll({
      where,
      include: includeUserRelations,
      attributes: { exclude: ['password'] },
      order: requesterIsSuperAdmin
        ? [[literal(`CASE WHEN User.ID_Perfil = ${PROFILE_IDS.SUPER_ADMIN} THEN 0 ELSE 1 END`), 'ASC'], ['name', 'ASC']]
        : [['name', 'ASC']]
    });
    return users;
  }

  async getPaginated(filters = {}, requester = null) {
    const page = getPaginationNumber(filters.page, 1);
    const limit = getPaginationNumber(filters.limit, 10, { min: 1, max: 100 });
    const offset = (page - 1) * limit;
    const where = {};
    const include = includeUserRelations;
    const requesterUser = requester?.id ? await getUserWithProfile(requester.id) : null;
    const requesterIsAdmin = requesterUser && isAdminUser(requesterUser);
    const requesterIsSuperAdmin = requesterUser && isSuperAdminUser(requesterUser);

    if (requester?.id && !requesterIsAdmin) {
      where.id = requester.id;
    } else if (!requesterIsSuperAdmin) {
      where.profileId = { [Op.ne]: PROFILE_IDS.SUPER_ADMIN };
    }

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

    if (requesterIsSuperAdmin) {
      order = [[literal(`CASE WHEN User.ID_Perfil = ${PROFILE_IDS.SUPER_ADMIN} THEN 0 ELSE 1 END`), 'ASC'], ...order];
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
      where: requester?.id && !requesterIsAdmin
        ? { id: requester.id }
        : requesterIsSuperAdmin
          ? {}
          : { profileId: { [Op.ne]: PROFILE_IDS.SUPER_ADMIN } },
      include,
      attributes: ['active']
    });

    const summary = summaryRows.reduce(
      (acc, user) => {
        acc.total += 1;
        if (Number(user.active) === 1) {
          acc.ativos += 1;
          acc.activeUsers += 1;
        }
        if (getUserRole(user) === USER_ROLES.ADMIN) {
          acc.admins += 1;
          if (Number(user.active) === 1) {
            acc.activeAdmins += 1;
          }
        } else {
          acc.comuns += 1;
        }
        return acc;
      },
      { total: 0, ativos: 0, admins: 0, comuns: 0, activeAdmins: 0, activeUsers: 0 }
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

  async getOne(id, requester = null) {
    const requesterUser = requester?.id ? await getUserWithProfile(requester.id) : null;

    if (requester?.id && (!requesterUser || (!isAdminUser(requesterUser) && Number(requesterUser.id) !== Number(id)))) {
      throw createError("Usuário operacional pode visualizar apenas a própria conta.", 403);
    }

    const user = await User.findByPk(id, {
      include: includeUserRelations,
      attributes: { exclude: ['password'] }
    });

    if (
      requester?.id &&
      user &&
      isSuperAdminUser(user) &&
      Number(requester.id) !== Number(user.id)
    ) {
      throw createError("Usuário Super Admin não pode ser visualizado por outros usuários.", 403);
    }

    return user;
  }

  async create(data, requester = null) {
    const requesterUser = await ensureAdminRequester(requester?.id);

    if (!data.name || !data.username || !data.password) {
      throw createError("Preencha os campos obrigatórios.");
    }

    const username = String(data.username).trim();
    const name = String(data.name).trim();
    const password = String(data.password).trim();

    if (!name || !username || !password) {
      throw createError("Preencha os campos obrigatórios.");
    }

    const existing = await User.findOne({ where: { username } });
    if (existing) {
      throw createError("Já existe um usuário com este login.");
    }

    if (Number(data.profileId) === PROFILE_IDS.SUPER_ADMIN && !isSuperAdminUser(requesterUser)) {
      throw createError("Perfil Super Admin é reservado.", 403);
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      username,
      name,
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
      throw createError("Usuário não encontrado.", 404);
    }

    const requesterId = requester?.id;
    const isSelf = Number(requesterId) === Number(user.id);
    const requesterUser = await getUserWithProfile(requesterId);
    const requesterIsAdmin = requesterUser && isAdminUser(requesterUser);
    const requesterIsSuperAdmin = requesterUser && isSuperAdminUser(requesterUser);
    const currentRole = getUserRole(user);

    if (!requesterIsAdmin) {
      if (!isSelf) {
        throw createError("Apenas usuários administradores podem gerenciar usuários.", 403);
      }

      const tryingToChangeLogin = data.username !== undefined && String(data.username).trim() !== user.username;
      const tryingToChangeStatus = data.active !== undefined && Number(data.active) !== Number(user.active);
      const tryingToChangeProfile = data.profileId !== undefined && Number(data.profileId) !== Number(user.profileId);

      if (tryingToChangeLogin || tryingToChangeStatus || tryingToChangeProfile) {
        throw createError("Usuário operacional pode alterar apenas nome e senha da própria conta.", 403);
      }

      const nextName = data.name !== undefined ? String(data.name).trim() : user.name;

      if (!nextName) {
        throw createError("Preencha os campos obrigatórios.");
      }

      const updateData = { name: nextName };

      if (data.password) {
        updateData.password = await bcrypt.hash(String(data.password).trim(), SALT_ROUNDS);
      }

      await user.update(updateData);

      const result = user.toJSON();
      delete result.password;

      return result;
    }

    const nextRole = data.profileId !== undefined ? await getProfileRoleById(data.profileId) : currentRole;
    const nextActive = data.active !== undefined ? Number(data.active) : Number(user.active);

    if (currentRole === USER_ROLES.SUPER_ADMIN) {
      const tryingToChangeLogin = data.username !== undefined && String(data.username).trim() !== user.username;
      const tryingToChangeStatus = data.active !== undefined && Number(data.active) !== Number(user.active);
      const tryingToChangeProfile = data.profileId !== undefined && Number(data.profileId) !== Number(user.profileId);

      if (!requesterIsSuperAdmin || !isSelf || tryingToChangeLogin || tryingToChangeStatus || tryingToChangeProfile) {
        throw createError("Usuário Super Admin não pode ser alterado pela tela.", 403);
      }

      const nextName = data.name !== undefined ? String(data.name).trim() : user.name;
      if (!nextName) {
        throw createError("Preencha os campos obrigatórios.");
      }

      const updateData = { name: nextName };
      if (data.password) {
        updateData.password = await bcrypt.hash(String(data.password).trim(), SALT_ROUNDS);
      }

      await user.update(updateData);

      const result = user.toJSON();
      delete result.password;

      return result;
    }

    if (nextRole === USER_ROLES.SUPER_ADMIN && !requesterIsSuperAdmin) {
      throw createError("Perfil Super Admin é reservado.", 403);
    }

    if (isSelf && nextActive !== 1) {
      throw createError("Usuário não pode inativar a si mesmo.");
    }

    if (!requesterIsSuperAdmin && currentRole === USER_ROLES.ADMIN && Number(user.active) === 1 && (nextRole !== USER_ROLES.ADMIN || nextActive !== 1)) {
      const activeAdmins = await countActiveAdmins();

      if (activeAdmins <= 1) {
        throw createError("Não é possível remover, inativar ou alterar para operacional o único usuário administrador ativo.");
      }
    }

    if (Number(user.active) === 1 && nextActive !== 1) {
      const activeUsers = await countActiveUsers();

      if (activeUsers <= 1) {
        throw createError("Não é possível inativar o único usuário ativo do sistema.");
      }
    }

    const nextUsername = data.username !== undefined ? String(data.username).trim() : user.username;
    const nextName = data.name !== undefined ? String(data.name).trim() : user.name;

    if (!nextName || !nextUsername) {
      throw createError("Preencha os campos obrigatórios.");
    }

    if (nextUsername !== user.username) {
      const existing = await User.findOne({
        where: {
          username: nextUsername,
          id: { [Op.ne]: user.id }
        }
      });

      if (existing) {
        throw createError("Já existe um usuário com este login.");
      }
    }

    if (data.password) {
      data.password = await bcrypt.hash(String(data.password).trim(), SALT_ROUNDS);
    }

    const updateData = {
      username: nextUsername,
      name: nextName,
      active: data.active ?? user.active,
      profileId: data.profileId ?? user.profileId
    };

    if (data.password) {
      updateData.password = data.password;
    }

    await user.update(updateData);

    const result = user.toJSON();
    delete result.password;

    return result;
  }

  async delete(id, requester = null) {
    const requesterId = requester?.id;
    const requesterUser = await ensureAdminRequester(requesterId);

    const user = await getUserWithProfile(id);

    if (!user) {
      throw createError("Usuário não encontrado.", 404);
    }

    if (isSuperAdminUser(user)) {
      throw createError("Usuário Super Admin não pode ser removido.", 403);
    }

    if (Number(user.id) === Number(requesterId)) {
      throw createError("Usuário não pode remover a si mesmo.");
    }

    if (!isSuperAdminUser(requesterUser) && isRegularAdminUser(user) && Number(user.active) === 1) {
      const activeAdmins = await countActiveAdmins();

      if (activeAdmins <= 1) {
        throw createError("Não é possível remover o único usuário administrador ativo.");
      }
    }

    if (Number(user.active) === 1) {
      const activeUsers = await countActiveUsers();

      if (activeUsers <= 1) {
        throw createError("Não é possível remover o único usuário ativo do sistema.");
      }
    }

    await user.destroy();
    return { message: "Usuário excluído com sucesso." };
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
