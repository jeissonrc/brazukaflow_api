const PROFILE_IDS = {
  SUPER_ADMIN: 1,
  ADMIN: 2,
  OPERATIONAL: 3
};

const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  OPERATIONAL: 'operational'
};

const getRoleByProfileId = (profileId) => {
  const normalizedProfileId = Number(profileId);

  if (normalizedProfileId === PROFILE_IDS.SUPER_ADMIN) return USER_ROLES.SUPER_ADMIN;
  if (normalizedProfileId === PROFILE_IDS.ADMIN) return USER_ROLES.ADMIN;

  return USER_ROLES.OPERATIONAL;
};

module.exports = {
  PROFILE_IDS,
  USER_ROLES,
  getRoleByProfileId
};
