const AuditLogService = require('../services/AuditLogService');
const BackupService = require('../services/BackupService');
const sequelize = require('../config/database');

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

class AuditLogController {
  async index(req, res, next) {
    try {
      const logs = await AuditLogService.getPaginated(req.query, req.user);
      return res.status(200).json(logs);
    } catch (err) {
      next(err);
    }
  }

  async filterOptions(req, res, next) {
    try {
      const options = await AuditLogService.getFilterOptions(req.user);
      return res.status(200).json(options);
    } catch (err) {
      next(err);
    }
  }

  async lastManualCleanup(req, res, next) {
    try {
      const cleanup = await AuditLogService.getLastManualCleanup(req.user);

      return res.status(200).json({
        occurredAt: cleanup?.occurredAt || null,
        username: cleanup?.username || null,
        userName: cleanup?.userName || null,
        description: cleanup?.description || null
      });
    } catch (err) {
      next(err);
    }
  }

  async cleanup(req, res, next) {
    try {
      const months = req.body?.months;
      const result = await AuditLogService.deleteOlderThanMonths(months, req.user);

      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'DELETE',
        module: 'MANUTENCAO',
        description: result.deletedCount > 0
          ? `Limpeza manual removeu ${result.deletedCount} log(s) com mais de ${result.months} meses.`
          : `Limpeza manual executada sem logs com mais de ${result.months} meses para remover.`,
        status: result.deletedCount > 0 ? 'SUCESSO' : 'INFO',
        after: {
          months: result.months,
          cutoffDate: result.cutoffDate,
          deletedCount: result.deletedCount
        }
      });

      const message = result.deletedCount > 0
        ? `${result.deletedCount} log(s) antigo(s) removido(s) com sucesso.`
        : `Não há logs com mais de ${result.months} meses para remover.`;

      return res.status(200).json({
        message,
        deletedCount: result.deletedCount,
        cutoffDate: result.cutoffDate,
        months: result.months
      });
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'DELETE',
        module: 'MANUTENCAO',
        description: `Falha na limpeza manual de logs: ${err.message}`,
        status: 'ERRO',
        after: req.body
      });

      next(err);
    }
  }

  async backupCleanupLogs(req, res, next) {
    try {
      await AuditLogService.ensureSuperAdmin(req.user?.id);

      const { cutoffDate, months } = AuditLogService.getCleanupCutoffDate(req.body?.months);
      const [rows] = await sequelize.query(
        'SELECT * FROM logs_sistema WHERE Data_Hora < :cutoffDate ORDER BY Data_Hora ASC, ID_Log ASC',
        { replacements: { cutoffDate } }
      );
      const backup = BackupService.generateRowsBackup({
        title: 'Brazuka Flow - Backup de Logs Antes da Limpeza',
        tableName: 'logs_sistema',
        rows,
        metadata: [
          `Período: logs com mais de ${months} meses`,
          `Data limite: ${cutoffDate.toISOString()}`
        ]
      });
      const fileName = `brazukaflow-logs-limpeza-${months}-meses-${getFileTimestamp(backup.generatedAt)}.sql`;

      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'BACKUP',
        module: 'MANUTENCAO',
        description: `Backup de ${backup.rowCount} log(s) gerado antes da limpeza manual.`,
        status: backup.rowCount > 0 ? 'SUCESSO' : 'INFO',
        after: {
          months,
          cutoffDate,
          fileName,
          rowCount: backup.rowCount
        }
      });

      res.setHeader('Content-Type', 'application/sql; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('X-Backup-Row-Count', String(backup.rowCount));
      return res.status(200).send(backup.sql);
    } catch (err) {
      await AuditLogService.safeRegister({
        req,
        user: req.user,
        action: 'BACKUP',
        module: 'MANUTENCAO',
        description: `Falha ao gerar backup dos logs antes da limpeza: ${err.message}`,
        status: 'ERRO',
        after: req.body
      });

      next(err);
    }
  }
}

module.exports = new AuditLogController();
