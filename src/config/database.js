const { Sequelize } = require('sequelize');

const shouldUseSsl = process.env.DB_SSL === 'true' || (
  process.env.DB_SSL !== 'false' && process.env.NODE_ENV === 'production'
);

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
    dialectOptions: shouldUseSsl ? {
      ssl: {
        rejectUnauthorized: false // necessário para Aiven/Railway
      }
    } : {}
  }
);

module.exports = sequelize;


