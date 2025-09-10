// file: D:\adameds-payment\run-seeder.js

import 'dotenv/config';
import DBSeeder from './db-seeder.js';
import sequelizeInstance from '../configs/sequelize-instance.js';

console.log('Memulai proses seeding...');

DBSeeder()
  .then(() => {
    console.log('Seeding berhasil diselesaikan.');
  })
  .catch((error) => {
    console.error('Terjadi error saat seeding:', error);
  })
  .finally(() => {
    sequelizeInstance.close();
    process.exit();
  });
