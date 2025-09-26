import knex from 'knex';
import 'dotenv/config';

const DB_NAME = process.env.DB_NAME;
const DB_USERNAME = process.env.DB_USERNAME;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT;
const knexConfig = {
  client: 'pg',
  connection: {
    host: DB_HOST,
    user: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_NAME,
    port: DB_PORT,
  },
  debug: true,
};

const knexInstance = knex(knexConfig);

export default knexInstance;
