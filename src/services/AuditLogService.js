const AuditLog = require('../models/AuditLog');

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

class AuditLogService {
  async register({ req = null, user = null, username = null, action, module, description = null, status = null, before = null, after = null }) {
    return await AuditLog.create({
      userId: user?.id ?? null,
      username: user?.username ?? username ?? null,
      userName: user?.name ?? null,
      profile: user?.profile?.name ?? null,
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
