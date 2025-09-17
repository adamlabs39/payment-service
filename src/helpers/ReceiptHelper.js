import { randomBytes } from 'crypto';
/**
 * Menghasilkan nomor kuitansi unik secara acak untuk menghindari race condition.
 * @param { import("knex").Knex.Transaction } trx - Objek transaksi Knex (tidak digunakan di sini, tapi dipertahankan untuk konsistensi API).
 * @returns {Promise<string>} Nomor kuitansi acak yang diformat. Contoh: 'KUI/A1B2C3D4'
 */
export async function generateReceiptNumber() {
  const randomPart = randomBytes(4).toString('hex').toUpperCase().slice(0, 4);
  return `KUI/${randomPart}`;
}
