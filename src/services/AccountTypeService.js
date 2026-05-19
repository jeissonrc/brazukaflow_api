const AccountType = require('../models/AccountType');

class AccountTypeService {
  async getAll() {
    return await AccountType.findAll({
      include: ['category']
    });
  }

  async getOne(id) {
    return await AccountType.findByPk(id, {
      include: ['category']
    });
  }

  async create(data) {
    if (!data.description || !data.categoryId) {
      const error = new Error("Description and CategoryId are required");
      error.status = 400;
      throw error;
    }

    return await AccountType.create({
      description: data.description,
      type: data.type || null,
      specie: data.specie ?? null,
      status: data.status !== undefined ? data.status : true,
      categoryId: data.categoryId
    });
  }

  async update(id, data) {
    const account = await AccountType.findByPk(id);
    if (!account) {
      const error = new Error("Account type not found");
      error.status = 404;
      throw error;
    }

    await account.update({
      description: data.description ?? account.description,
      type: data.type ?? account.type,
      specie: data.specie ?? account.specie,
      status: data.status !== undefined ? data.status : account.status,
      categoryId: data.categoryId ?? account.categoryId
    });
    return account;
  }

  async delete(id) {
    const account = await AccountType.findByPk(id);
    if (!account) {
      const error = new Error("Account type not found");
      error.status = 404;
      throw error;
    }

    await account.destroy();
    return { message: "Account type deleted successfully" };
  }
}

module.exports = new AccountTypeService();
