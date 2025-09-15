import db from '../configs/knex-config.js';
import { Context } from '../middlewares/context.js';
import { CTX_AUTHOR } from '../constants/context-constant.js';
import NotfoundException from '../exceptions/notfound-exception.js';
import BadRequestException from '../exceptions/bad-request-exception.js';
import CashierRepository from './CashierRepository.js';
import BillingRepository from './BillingRepository.js';
import { uuidv7 } from 'uuidv7';
import moment from 'moment';

export default class PaymentTransactionRepository {
  static async _calculateRemainingDebt(billUuid, grandTotal, trx = db) {
    const paymentSum = await trx('payment_history').where('bill_uuid', billUuid).sum('amount as totalPaid').first();
    const totalPaid = parseFloat(paymentSum.totalPaid) || 0;
    const remainingDebt = grandTotal - totalPaid;
    return { totalPaid, remainingDebt };
  }

  static async GetPaymentHistory(bill_uuid) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);

    const billDetails = await BillingRepository.GetTotalBill(bill_uuid);
    if (!billDetails) throw new NotfoundException('Tagihan tidak ditemukan');
    const totalBill = parseFloat(billDetails.grand_total) || 0;

    const history = await db('payment_history as ph')
      .leftJoin('cashier_report as cr', 'ph.kasir_uuid', 'cr.uuid')
      .select(
        'ph.payment_type',
        'ph.payment_method',
        'ph.information',
        'ph.note',
        'ph.amount',
        'ph.created_at',
        'cr.nama_kasir',
        'cr.shift_type'
      )
      .where('ph.bill_uuid', bill_uuid)
      .where('ph.faskes_uuid', faskesUuid)
      .orderBy('ph.created_at', 'asc');

    let cumulativePaid = 0;
    const enrichedHistory = history.map((payment) => {
      const amountPaid = parseFloat(payment.amount) || 0;
      const debt_before = totalBill - cumulativePaid;
      cumulativePaid += amountPaid;
      const debt_after = totalBill - cumulativePaid;
      return { ...payment, debt_before, debt_after };
    });

    const totalPaid = cumulativePaid;
    const finalDebt = totalBill - totalPaid;

    return {
      // bill_details: billDetails,
      total_paid: totalPaid,
      total_bill: totalBill,
      is_paid: totalPaid >= totalBill,
      debt: finalDebt > 0 ? finalDebt : 0,
      payment_history: enrichedHistory,
    };
  }

  static async PaymentBill(uuid, data) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const getCashier = await CashierRepository._getActiveShift(faskesUuid);
    if (!getCashier) throw new BadRequestException('Shift kasir belum dibuka');

    const bill = await BillingRepository.GetDetailBill(uuid);
    if (!bill) throw new NotfoundException('Tagihan tidak ditemukan');
    if (bill.payment_status) throw new BadRequestException('Tagihan sudah lunas');

    const { remainingDebt } = await this._calculateRemainingDebt(uuid, bill.grand_total);

    if (data.payment_type === 'INSURANCE' && (parseFloat(data.amount) || 0) > remainingDebt) {
      throw new BadRequestException('Pembayaran asuransi tidak boleh melebihi sisa tagihan');
    }
    const amountPaid = parseFloat(data.amount) || 0;
    let changeAmount = 0;
    let shortageAmount = 0;
    let updatedPaymentStatus = false;

    if (amountPaid >= remainingDebt) {
      updatedPaymentStatus = true;
      changeAmount = amountPaid - remainingDebt;
    } else {
      shortageAmount = remainingDebt - amountPaid;
    }

    await db.transaction(async (trx) => {
      await trx('payment_history').insert({
        uuid: uuidv7(),
        faskes_uuid: faskesUuid,
        bill_uuid: uuid,
        kasir_uuid: getCashier.uuid,
        amount: amountPaid,
        payment_type: data.payment_type,
        payment_method: data.payment_method,
        information: data.information,
        note: data.note,
        created_at: moment().unix(),
        updated_at: moment().unix(),
      });

      if (updatedPaymentStatus) {
        await trx('bills')
          .where((q) => q.where('uuid', uuid).orWhere('merge_with', uuid))
          .update({ status: true });
      }
    });

    return {
      success: true,
      change: changeAmount > 0 ? changeAmount : 0,
      shortage: shortageAmount > 0 ? shortageAmount : 0,
      cashier_name: getCashier.nama_kasir,
      is_paid_off: updatedPaymentStatus,
    };
  }

  static async PayDebt(uuid, data) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const { amount, payment_type, payment_method, note, information } = data;

    return db.transaction(async (trx) => {
      const whereClause = { uuid };
      if (faskesUuid) whereClause.faskes_uuid = faskesUuid;

      const bill = await trx('bills').where(whereClause).forUpdate().first();
      if (!bill) throw new NotfoundException('Tagihan tidak ditemukan');
      if (!bill.close_bill) throw new BadRequestException('Tagihan ini belum ditutup');
      if (bill.status) throw new BadRequestException('Tagihan ini sudah lunas');

      const getCashier = await CashierRepository._getActiveShift(bill.faskes_uuid, trx);
      if (!getCashier) throw new BadRequestException('Shift kasir belum dibuka');

      const { totalPaid, remainingDebt } = await this._calculateRemainingDebt(uuid, bill.grand_total, trx);
      if (remainingDebt <= 0) throw new BadRequestException('Tagihan ini sudah tidak memiliki hutang');

      let amountToRecord = parseFloat(amount) || 0;
      let changeAmount = 0;
      if (amountToRecord > remainingDebt) {
        if (payment_type === 'CASH') {
          changeAmount = amountToRecord - remainingDebt;
        }
        amountToRecord = remainingDebt;
      }

      await trx('payment_history').insert({
        uuid: uuidv7(),
        faskes_uuid: bill.faskes_uuid,
        bill_uuid: uuid,
        kasir_uuid: getCashier?.uuid,
        amount: amountToRecord,
        payment_type: payment_type,
        payment_method: payment_method,
        information: information,
        note: note,
        created_at: moment().unix(),
        updated_at: moment().unix(),
      });

      const newTotalPaid = totalPaid + amountToRecord;
      if (newTotalPaid >= bill.grand_total) {
        await trx('bills').where({ uuid }).update({ status: true, updated_at: moment().unix() });
      }
      return {
        success: true,
        change: changeAmount,
        cashier_name: getCashier?.nama_kasir,
        message: 'Pembayaran hutang berhasil dicatat.',
      };
    });
  }
}
