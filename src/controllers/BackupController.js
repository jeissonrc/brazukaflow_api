const BackupService = require('../services/BackupService');
const AuditLogService = require('../services/AuditLogService');

const pad = (value) => String(value).padStart(2, '0');

const getFileTimestamp = (date = new Date()) => [
  date.getFullYear(),
  pad(date.getMonth() + 1),
  pad(date.getDate())
].join('-') + '-' + [
  pad(date.getHours()),
  pad(date.getMinutes()),
  pad(date.getSeconds())
].join('-');

class BackupController {
  async generateSql(req, res, next) {
    try {
      await AuditLogService.ensureSuperAdmin(req.user?.id);

      const backup = await BackupService.generateSqlBackup();
      const fileName = `brazukaflow-backup-${getFileTimestamp(backup.generatedAt)}.sql`;

      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'BACKUP',
        module: 'BACKUP',
        description: `Backup SQL ${fileName} gerado.`,
        status: 'SUCESSO',
        after: {
          fileName,
          tableCount: backup.tableCount,
          sizeBytes: Buffer.byteLength(backup.sql, 'utf8')
        }
      });

      res.setHeader('Content-Type', 'application/sql; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.status(200).send(backup.sql);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'BACKUP',
        module: 'BACKUP',
        description: `Falha ao gerar backup SQL: ${err.message}`,
        status: 'ERRO'
      });

      next(err);
    }
  }
}

module.exports = new BackupController();
