import db from '../configs/knex-config.js';

export async function generateReceiptNumber(trx = db) {
  const lastPayment = await trx('payment_history').max('receipt_number as last_receipt').first();

  let nextNumber = 1;

  if (lastPayment && lastPayment.last_receipt) {
    const numberPart = lastPayment.last_receipt.split('/')[1];
    const lastNumber = parseInt(numberPart, 10);

    if (!isNaN(lastNumber)) {
      nextNumber = lastNumber + 1;
    }
  }

  const paddedNumber = String(nextNumber).padStart(4, '0');
  return `KUI/${paddedNumber}`;
}
