import { Context as Ctx } from "../middlewares/context.js";
import { CTX_AUTHOR } from "../constants/context-constant.js";
import db from "../configs/knex-config.js";
import CantProcessDataException from "../exceptions/CantProcessDataException.js";
import moment from "moment";
import { uuidv7 } from "uuidv7";

export default class CashierRepository {
    // Helper internal untuk mendapatkan shift kasir yang aktif
    static async _getActiveShift(faskesUuid, trx = db) {
        return await trx('cashier_report')
            .where('faskes_uuid', faskesUuid)
            .whereNull('shift_time_closed')
            .where('type', 'SHIFT')
            .where('status', true)
            .orderBy('id', 'desc')
            .select(
                'uuid',
                'nama_kasir',
                'shift_type',
                'beginning_balance',
                'shift_time_open'
            )
            .first();
    }

    // Method public untuk membuka shift kasir
    static async OpenShiftCashier(data) {
        try {
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
        } catch (error) {
            throw error;
        }
    }

    // Method public untuk menutup shift kasir
    static async CloseShiftCashier(data) {
        try {
            const { faskesUuid } = Ctx.get(CTX_AUTHOR);

            const activeShift = await this._getActiveShift(faskesUuid);
            if (!activeShift) {
                throw new CantProcessDataException('Shift kasir belum dibuka');
            }

            const paymentHistory = await db('payment_history').where('kasir_uuid', activeShift.uuid);
            const totalPayment = paymentHistory.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
            
            const cash = parseFloat(data.cash) || 0;
            const debit = parseFloat(data.debit) || 0;
            const insurance = parseFloat(data.insurance) || 0;
            const totalActual = cash + debit + insurance;
            
            if (totalPayment !== totalActual) {
                const selisih = totalActual - totalPayment;
                throw new CantProcessDataException(`Gagal closing shift, Total pendapatan shift ${totalPayment} selisih: ${Math.abs(selisih)}`);
            }

            const faskesProfile = await db('faskes_profiles').where('faskes_uuid', faskesUuid).select('value_ppn', 'status_ppn').first();
            if(!faskesProfile){
                throw new CantProcessDataException(`Faskes profile dengan uuid ${faskesUuid} tidak ditemukan`);
            }

            const ppnValue = totalPayment * (faskesProfile.status_ppn ? faskesProfile.value_ppn / 100 : 0);
            const timeClose = moment().unix();

            await db('cashier_report')
                .where('id', activeShift.id)
                .update({
                    shift_time_closed: timeClose,
                    ballance: totalPayment,
                    cash,
                    debit,
                    insurance,
                    ppn: ppnValue,
                    status: false,
                    transaction_total: paymentHistory.length,
                    updated_at: timeClose
                });
            
            return {
                cashier_name: activeShift.nama_kasir,
                shift_type: activeShift.shift_type,
                shift_time_open: activeShift.shift_time_open,
                shift_time_closed: timeClose,
                trx_count: paymentHistory.length,
                system: {
                    total: totalPayment,
                    ppn: faskesProfile.status_ppn ? faskesProfile.value_ppn / 100 : 0,
                    ppn_value: ppnValue,
                    grand_total: totalPayment + ppnValue,
                },
                actual: {
                    cash, debit, insurance,
                    total_payment: totalActual,
                }
            };
        } catch (error) {
            throw error;
        }
    }

    // Method public untuk memeriksa status shift kasir
    static async CheckCashierShift() {
        try {
            const author = Ctx.get(CTX_AUTHOR);
            if (!author) return null;
            const { faskesUuid, iat } = author;

            const activeShift = await this._getActiveShift(faskesUuid);
            if (!activeShift) return { is_open: false };
            
            const shiftMap = { '1': 'Pagi', '2': 'Siang', '3': 'Malam' };

            return {
                is_open: true,
                nama_akun: activeShift.nama_kasir,
                terakhir_login: iat,
                shift: shiftMap[activeShift.shift_type] || 'N/A',
                saldo_awal: activeShift.beginning_balance,
                tanggal_jam_buka: activeShift.shift_time_open
            };
        } catch (error) {
            throw error;
        }
    }
    
    static async GetCloseDayConfirmationData() {
        try {
            const author = Ctx.get(CTX_AUTHOR);
            if (!author) return null;
            const { username, iat } = author;
    
            return {
                nama_akun: username,
                terakhir_login: iat,
                tanggal_jam_closing: moment().unix()
            };
        } catch (error) {
            throw error;
        }
    }

    // Method public untuk menutup hari kasir
    static async CloseDayCashier() {
        try {
            const { faskesUuid } = Ctx.get(CTX_AUTHOR);

            const openShift = await this._getActiveShift(faskesUuid);
            if (openShift) {
                throw new CantProcessDataException('Harus menutup shift kasir terlebih dahulu');
            }

            return db.transaction(async trx => {
                const timeClose = moment().unix();
                
                const shiftsToCloseQuery = trx('cashier_report')
                    .where('faskes_uuid', faskesUuid)
                    .whereNull('cashier_report_uuid')
                    .where('type', 'SHIFT');
                
                const dailyReportData = await shiftsToCloseQuery.clone()
                    .sum({
                        total_balance: 'ballance',
                        total_ppn: 'ppn',
                        total_cash: 'cash',
                        total_debit: 'debit',
                        total_insurance: 'insurance'
                    })
                    .first();

                const shiftsToUpdate = await shiftsToCloseQuery.clone().select('uuid');

                if (shiftsToUpdate.length === 0) {
                    await trx('cashier_report').insert({
                        uuid: uuidv7(), faskes_uuid: faskesUuid, type: 'DAYS',
                        days_time_closed: timeClose, status: true,
                        created_at: timeClose, updated_at: timeClose,
                    });
                    return { message: "Tidak ada shift untuk ditutup, laporan harian kosong telah dibuat." };
                }

                const [dayReport] = await trx('cashier_report')
                    .insert({
                        uuid: uuidv7(), faskes_uuid: faskesUuid, type: 'DAYS',
                        days_time_closed: timeClose,
                        ballance: dailyReportData.total_balance || 0,
                        ppn: dailyReportData.total_ppn || 0,
                        cash: dailyReportData.total_cash || 0,
                        debit: dailyReportData.total_debit || 0,
                        insurance: dailyReportData.total_insurance || 0,
                        status: true, created_at: timeClose, updated_at: timeClose,
                    }).returning('uuid');

                const shiftUuidsToUpdate = shiftsToUpdate.map(s => s.uuid);
                await trx('cashier_report').whereIn('uuid', shiftUuidsToUpdate).update({ cashier_report_uuid: dayReport.uuid });

                const closedShiftsDetails = await trx('cashier_report').whereIn('uuid', shiftUuidsToUpdate)
                    .select('shift_type', 'ballance', 'ppn', 'cash', 'debit', 'insurance', 'transaction_total');

                return {
                    total: dailyReportData.total_balance || 0,
                    ppn: dailyReportData.total_ppn || 0,
                    cash: dailyReportData.total_cash || 0,
                    debit: dailyReportData.total_debit || 0,
                    insurance: dailyReportData.total_insurance || 0,
                    time_closed: timeClose,
                    shift: closedShiftsDetails,
                };
            });
        } catch (error) {
            throw error;
        }
    }
}
