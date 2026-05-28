const sequelize = require('../config/database');

const quoteIdentifier = (value) => `\`${String(value).replace(/`/g, '``')}\``;

const formatDateTime = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (number) => String(number).padStart(2, '0');

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + ' ' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join(':');
};

const escapeString = (value) => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/\0/g, '\\0')
  .replace(/\n/g, '\\n')
  .replace(/\r/g, '\\r')
  .replace(/\x1a/g, '\\Z')
  .replace(/'/g, "''");

const formatSqlValue = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`;
  if (value instanceof Date) return `'${formatDateTime(value)}'`;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';

  return `'${escapeString(value)}'`;
};

const normalizeTableName = (table) => {
  if (typeof table === 'string') return table;
  return table.tableName || table.name || Object.values(table)[0];
};

class BackupService {
  async generateSqlBackup() {
    const databaseName = sequelize.config.database;
    const rawTables = await sequelize.getQueryInterface().showAllTables();
    const tables = rawTables.map(normalizeTableName).filter(Boolean).sort();
    const generatedAt = new Date();
    const lines = [
      '-- Brazuka Flow SQL Backup',
      `-- Banco: ${databaseName}`,
      `-- Gerado em: ${formatDateTime(generatedAt)}`,
      '',
      'SET FOREIGN_KEY_CHECKS=0;',
      ''
    ];

    for (const table of tables) {
      const quotedTable = quoteIdentifier(table);
      const [createRows] = await sequelize.query(`SHOW CREATE TABLE ${quotedTable}`);
      const createTableSql = createRows?.[0]?.['Create Table'];

      lines.push(`DROP TABLE IF EXISTS ${quotedTable};`);
      if (createTableSql) {
        lines.push(`${createTableSql};`);
      }
      lines.push('');
    }

    for (const table of tables) {
      const quotedTable = quoteIdentifier(table);
      const [rows] = await sequelize.query(`SELECT * FROM ${quotedTable}`);

      lines.push(`-- Dados da tabela ${quotedTable}`);

      if (!rows.length) {
        lines.push(`-- Nenhum registro em ${quotedTable}`);
        lines.push('');
        continue;
      }

      for (const row of rows) {
        const columns = Object.keys(row);
        const columnList = columns.map(quoteIdentifier).join(', ');
        const valueList = columns.map((column) => formatSqlValue(row[column])).join(', ');
        lines.push(`INSERT INTO ${quotedTable} (${columnList}) VALUES (${valueList});`);
      }

      lines.push('');
    }

    lines.push('SET FOREIGN_KEY_CHECKS=1;');
    lines.push('');

    return {
      sql: lines.join('\n'),
      generatedAt,
      tableCount: tables.length
    };
  }
}

module.exports = new BackupService();
