import { Context as Ctx } from '../middlewares/context.js';
import { CTX_AUTHOR } from '../constants/context-constant.js';
import db from '../configs/knex-config.js';
import CantProcessDataException from '../exceptions/CantProcessDataException.js';
import moment from 'moment';
import { uuidv7 } from 'uuidv7';

export default class CashierRepository {
  static async _getActiveShift(faskesUuid, trx = db) {
    return await trx('cashier_report')
      .where('faskes_uuid', faskesUuid)
      .whereNull('shift_time_closed')
      .where('type', 'SHIFT')
      .where('status', true)
      .orderBy('id', 'desc')
      .select('id', 'uuid', 'nama_kasir', 'shift_type', 'beginning_balance', 'shift_time_open')
      .first();
  }

  static _calculateShiftTotals(paymentHistory) {
    return paymentHistory.reduce(
      (totals, payment) => {
        const amount = parseFloat(payment.amount) || 0;
        const method = payment.payment_method;
        const type = payment.payment_type;

        totals.total += amount;

        if (method === 'CASH' || method === 'TUNAI') {
          totals.tunai += amount;
        } else if (method === 'TRANSFER') {
          totals.transfer += amount;
        } else if (['DEBIT', 'CREDIT'].includes(method) || type === 'INSURANCE') {
          totals.debit_kredit += amount;
        }
        return totals;
      },
      { tunai: 0, transfer: 0, debit_kredit: 0, total: 0 }
    );
  }

  static _getShiftName(shiftType) {
    switch (shiftType) {
      case '1':
        return 'Pagi';
      case '2':
        return 'Siang';
      case '3':
        return 'Malam';
      default:
        return 'N/A';
    }
  }

  static _getShiftsToCloseQuery(faskesUuid, trx) {
    return trx('cashier_report').where({ faskesUuid: faskesUuid, type: 'SHIFT' }).whereNull('cashier_report_uuid');
  }

  static async _aggregateDailyReportData(shiftsQuery) {
    return shiftsQuery
      .clone()
      .sum({
        total_balance: 'ballance',
        total_ppn: 'ppn',
        total_cash: 'cash',
        total_debit: 'debit',
        total_insurance: 'insurance',
        total_transaction: 'transaction_total',
      })
      .first();
  }

  // Method public untuk membuka shift kasir
  static async OpenShiftCashier(data) {
    const { faskesUuid, username } = Ctx.get(CTX_AUTHOR);
    const activeShift = await this._getActiveShift(faskesUuid);
    if (activeShift) {
      throw new CantProcessDataException('Shift kasir masih terbuka');
    }

    return db('cashier_report').insert({
      uuid: uuidv7(),
      faskes_uuid: faskesUuid,
      type: 'SHIFT',
      shift_type: data.shift_type,
      beginning_balance: data.beginning_balance,
      shift_time_open: moment().unix(),
      nama_kasir: username.toString(),
      status: true,
      created_at: moment().unix(),
      updated_at: moment().unix(),
    });
  }

  static async CloseShiftCashier(data) {
    const { faskesUuid } = Ctx.get(CTX_AUTHOR);
    const activeShift = await this._getActiveShift(faskesUuid);
    if (!activeShift) {
      throw new CantProcessDataException('Shift kasir belum dibuka');
    }
    const paymentHistory = await db('payment_history').where('kasir_uuid', activeShift.uuid);

    const systemTotals = this._calculateShiftTotals(paymentHistory);

    const actualTotals = {
      cash: parseFloat(data.cash) || 0,
      transfer: parseFloat(data.debit) || 0,
      debit_credit: parseFloat(data.debit_credit) || 0,
    };

    if (systemTotals.tunai !== actualTotals.cash) {
      throw new CantProcessDataException(
        `Total TUNAI tidak cocok. Sistem: ${systemTotals.tunai}, Aktual: ${actualTotals.cash}`
      );
    }
    // if (systemTotals.transfer !== actualTotals.transfer) {
    //   throw new CantProcessDataException(
    //     `Total TRANSFER tidak cocok. Sistem: ${systemTotals.transfer}, Aktual: ${actualTotals.transfer}`
    //   );
    // }
    // if (systemTotals.debit_kredit !== actualTotals.debit_credit) {
    //   throw new CantProcessDataException(
    //     `Total DEBIT/KREDIT tidak cocok. Sistem: ${systemTotals.debit_kredit}, Aktual: ${actualTotals.debit_credit}`
    //   );
    // }

    const faskesProfile = await db('faskes_profiles')
      .where('faskes_uuid', faskesUuid)
      .select('value_ppn', 'status_ppn')
      .first();
    if (!faskesProfile) {
      throw new CantProcessDataException(`Faskes profile dengan uuid ${faskesUuid} tidak ditemukan`);
    }
    const ppnValue = systemTotals.total * (faskesProfile.status_ppn ? faskesProfile.value_ppn / 100 : 0);
    const timeClose = moment().unix();

    await db('cashier_report').where('id', activeShift.id).update({
      shift_time_closed: timeClose,
      ballance: systemTotals.total,
      cash: systemTotals.cash,
      debit: systemTotals.debit_kredit,
      insurance: systemTotals.transfer,
      ppn: ppnValue,
      status: false,
      transaction_total: paymentHistory.length,
      updated_at: timeClose,
    });

    return {
      cashier_name: activeShift.nama_kasir,
      shift_type: activeShift.shift_type,
      shift_time_open: activeShift.shift_time_open,
      shift_time_closed: timeClose,
      trx_count: paymentHistory.length,
      final_report: {
        cash: systemTotals.cash,
        transfer: systemTotals.transfer,
        debit_kredit: systemTotals.debit_kredit,
        total: systemTotals.total,
      },
    };
  }

  // Method public untuk memeriksa status shift kasir
  static async CheckCashierShift() {
    const author = Ctx.get(CTX_AUTHOR);
    if (!author) return null;
    const { faskesUuid, iat } = author;
    const activeShift = await this._getActiveShift(faskesUuid);
    if (!activeShift) return { is_open: false };

    const paymentHistory = await db('payment_history').where('kasir_uuid', activeShift.uuid);

    const systemTotals = this._calculateShiftTotals(paymentHistory);

    return {
      is_open: true,
      nama_akun: activeShift.nama_kasir,
      terakhir_login: iat,
      shift: this._getShiftName(activeShift.shift_type),
      saldo_awal: activeShift.beginning_balance,
      tanggal_jam_buka: activeShift.shift_time_open,
      tanggal_jam_closing: moment().unix(),
      pendapatan_system: systemTotals,
    };
  }

  static async GetCloseDayConfirmationData() {
    const author = Ctx.get(CTX_AUTHOR);
    if (!author) return null;
    const { username, iat } = author;
    return {
      nama_akun: username,
      terakhir_login: iat,
      tanggal_jam_closing: moment().unix(),
    };
  }

  // Method public untuk menutup hari kasir
  static async CloseDayCashier() {
    const { faskesUuid, username } = Ctx.get(CTX_AUTHOR);
    const cashierName = username || 'Unknown';
    const openShift = await this._getActiveShift(faskesUuid);
    if (openShift) {
      throw new CantProcessDataException('Harus menutup shift kasir terlebih dahulu');
    }
    return db.transaction(async (trx) => {
      const timeClose = moment().unix();
      const shiftsToCloseQuery = trx('cashier_report')
        .where('faskes_uuid', faskesUuid)
        .whereNull('cashier_report_uuid')
        .where('type', 'SHIFT');
      const dailyReportData = await shiftsToCloseQuery
        .clone()
        .sum({
          total_balance: 'ballance',
          total_ppn: 'ppn',
          total_cash: 'cash',
          total_debit: 'debit',
          total_insurance: 'insurance',
          total_transaction: 'transaction_total',
        })
        .first();
      const shiftsToUpdate = await shiftsToCloseQuery.clone().select('uuid');
      if (shiftsToUpdate.length === 0) {
        await trx('cashier_report').insert({
          uuid: uuidv7(),
          faskes_uuid: faskesUuid,
          type: 'DAYS',
          days_time_closed: timeClose,
          status: true,
          created_at: timeClose,
          updated_at: timeClose,
        });
        return { message: 'Tidak ada shift untuk ditutup, laporan harian kosong telah dibuat.' };
      }
      const [dayReport] = await trx('cashier_report')
        .insert({
          uuid: uuidv7(),
          faskes_uuid: faskesUuid,
          nama_kasir: cashierName,
          type: 'DAYS',
          days_time_closed: timeClose,
          ballance: dailyReportData.total_balance || 0,
          ppn: dailyReportData.total_ppn || 0,
          cash: dailyReportData.total_cash || 0,
          debit: dailyReportData.total_debit || 0,
          insurance: dailyReportData.total_insurance || 0,
          transaction_total: dailyReportData.total_transaction || 0,
          status: true,
          created_at: timeClose,
          updated_at: timeClose,
        })
        .returning('uuid');
      const shiftUuidsToUpdate = shiftsToUpdate.map((s) => s.uuid);
      await trx('cashier_report').whereIn('uuid', shiftUuidsToUpdate).update({ cashier_report_uuid: dayReport.uuid });
      const closedShiftsDetails = await trx('cashier_report')
        .whereIn('uuid', shiftUuidsToUpdate)
        .select('shift_type', 'ballance', 'ppn', 'cash', 'debit', 'insurance', 'transaction_total');
      return {
        total: dailyReportData.total_balance || 0,
        transaction_total: parseInt(dailyReportData.total_transaction) || 0,
        cashier_name: cashierName,
        ppn: dailyReportData.total_ppn || 0,
        cash: dailyReportData.total_cash || 0,
        debit: dailyReportData.total_debit || 0,
        insurance: dailyReportData.total_insurance || 0,
        time_closed: timeClose,
        shift: closedShiftsDetails,
      };
    });
  }
}
