const Profile = require('../models/Profile');
const { PROFILE_IDS } = require('../constants/profileIds');

class ProfileService {

  async getAll() {
    return await Profile.findAll({
      where: {
        id: [PROFILE_IDS.ADMIN, PROFILE_IDS.OPERATIONAL]
      },
      order: [['id', 'ASC']]
    });
  }

  async getOne(id) {
    return await Profile.findByPk(id);
  }

  async create(data) {
    if (!data.name) {
      const error = new Error("name is required");
      error.status = 400;
      throw error;
    }

    return await Profile.create({
      name: data.name,
      description: data.description ?? null,
      statusProfile: data.statusProfile !== undefined ? data.statusProfile : 1
    });
  }

  async update(id, data) {
    const profile = await Profile.findByPk(id);

    if (!profile) {
      const error = new Error("Profile not found");
      error.status = 404;
      throw error;
    }

    await profile.update({
      name: data.name ?? profile.name,
      description: data.description ?? profile.description,
      statusProfile: data.statusProfile !== undefined ? data.statusProfile : profile.statusProfile
    });

    return profile;
  }

  async delete(id) {
    const profile = await Profile.findByPk(id);

    if (!profile) {
      const error = new Error("Profile not found");
      error.status = 404;
      throw error;
    }

    await profile.destroy();
    return { message: "Profile deleted successfully" };
  }
}

module.exports = new ProfileService();
