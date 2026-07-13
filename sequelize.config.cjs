require('dotenv/config');

const useSsl = process.env.DB_SSL === 'true';
const url = process.env.DATABASE_URL;

module.exports = {
  development: {
    url,
    dialect: 'postgres',
    dialectOptions: useSsl ? { ssl: { require: true, rejectUnauthorized: false } } : undefined,
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
  },
  test: {
    url,
    dialect: 'postgres',
    dialectOptions: useSsl ? { ssl: { require: true, rejectUnauthorized: false } } : undefined,
    logging: false,
  },
  production: {
    url,
    dialect: 'postgres',
    dialectOptions: useSsl ? { ssl: { require: true, rejectUnauthorized: false } } : undefined,
    logging: false,
  },
};
