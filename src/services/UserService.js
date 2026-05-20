const User = require('../models/User');
const Profile = require('../models/Profile');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = "sua_chave_secreta_aqui"; // trocar por variável de ambiente
const SALT_ROUNDS = 10;

class UserService {

  async getAll() {
    const users = await User.findAll({
      include: [{ model: Profile, as: 'profile' }],
      attributes: { exclude: ['password'] }
    });
    return users;
  }

  async getOne(id) {
    const user = await User.findByPk(id, {
      include: [{ model: Profile, as: 'profile' }],
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

  async update(id, data) {
    const user = await User.findByPk(id);

    if (!user) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
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

  async delete(id) {
    const user = await User.findByPk(id);

    if (!user) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
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
