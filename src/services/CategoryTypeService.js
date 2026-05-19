const CategoryType = require('../models/CategoryType');

class CategoryTypeService {
  
  async getAll() {
    return await CategoryType.findAll();
  }

  async getOne(id) {
    return await CategoryType.findByPk(id);
  }

  async create(data) {
    // Validação
    if (!data.description || data.description.trim() === "") {
      const error = new Error("Description is required");
      error.status = 400;
      throw error;
    }

    // Criação no banco
    const category = await CategoryType.create({
      description: data.description,
      type: data.type || null,
      specie: data.specie ?? null,
      status: data.status !== undefined ? data.status : true
    });

    return category;
  }

  async update(id, data) {
    const category = await CategoryType.findByPk(id);

    if (!category) {
      const error = new Error("Category not found");
      error.status = 404;
      throw error;
    }

    // Atualiza apenas dados enviados
    await category.update({
      description: data.description ?? category.description,
      type: data.type ?? category.type,
      specie: data.specie ?? category.specie,
      status: data.status !== undefined ? data.status : category.status
    });

    return category;
  }

  async delete(id) {
    const category = await CategoryType.findByPk(id);

    if (!category) {
      const error = new Error("Category not found");
      error.status = 404;
      throw error;
    }

    await category.destroy();

    return { message: "Category deleted successfully" };
  }
}

module.exports = new CategoryTypeService();
