import {Context as Ctx} from "../middlewares/context.js";
import {CTX_AUTHOR} from "../constants/context-constant.js";
import db from "../configs/knex-config.js";
import CantProcessDataException from "../exceptions/CantProcessDataException.js";
import moment from "moment";
import {uuidv7} from "uuidv7";

export default class CashierRepository {
    static async OpenShiftCashier(data) {
        try {
            const {faskesUuid, username} = Ctx.get(CTX_AUTHOR);
            const check = await db('cashier_report')
                .where('faskes_uuid', faskesUuid)
                .whereNull('shift_time_closed')
                .whereNull('days_time_closed')
                .where('status', true)
                .where('type', 'SHIFT')
                .orderBy('id', 'desc')
                .first();

            if (check) {
                throw new CantProcessDataException('Shift cashier is still open');
            }

            return db('cashier_report')
                .insert({
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

    static async CloseShiftCashier(data) {
        try {
            const {faskesUuid} = Ctx.get(CTX_AUTHOR);
            const check = await db('cashier_report')
                .where('faskes_uuid', faskesUuid)
                .whereNull('shift_time_closed')
                .whereNull('days_time_closed')
                .where('type', 'SHIFT')
                .orderBy('id', 'desc')
                .first();

                if (!check) {
                    throw new CantProcessDataException('Shift cashier is already closed');
                }

            const timeClose = moment().unix();
            const paymentHistory = await db('payment_history')
                .where('kasir_uuid', check.uuid)
                .orderBy('id', 'desc')

            const totalPayment = paymentHistory.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
            
            const cash = parseFloat(data.cash) || 0;
            const debit = parseFloat(data.debit) || 0;
            const insurance = parseFloat(data.insurance) || 0;
            // Ini adalah total menurut fisik
            const totalActual = cash + debit + insurance;
            
            // Logika rekonsiliasi
            if (totalPayment !== totalActual) {
                const selisih = totalPayment - totalActual;
                throw new CantProcessDataException(`Total payment is ${totalPayment} but total actual is ${totalActual}. Selisih: ${selisih}`);
            }

            const faskesProfile = await db('faskes_profiles')
                .where('faskes_uuid', faskesUuid)
                .select(
                    'value_ppn',
                    'status_ppn',
                )
                .first();
            if(!faskesProfile){
                throw new CantProcessDataException(`Faskes profile with uuid ${faskesUuid} not found`);
            }

            await db('cashier_report')
                .where('id', check.id)
                .update({
                    shift_time_closed: timeClose,
                    ballance: totalPayment,
                    cash,
                    debit,
                    insurance,
                    // Memperbaiki perhitungan PPN
                    ppn: totalPayment * (faskesProfile.status_ppn ? faskesProfile.value_ppn / 100 : 0),
                    status: false,
                    transaction_total: paymentHistory.length,
                });
            return {
                cashier_name: check.nama_kasir,
                shift_type: check.shift_type,
                shift_time_open: check.shift_time_open,
                shift_time_closed: timeClose,
                trx_count: paymentHistory.length,
                system: {
                    total: totalPayment,
                    // Mengubah perhitungan PPN menjadi persen
                    ppn: faskesProfile.status_ppn ? faskesProfile.value_ppn / 100 : 0,
                    ppn_value: totalPayment * (faskesProfile.status_ppn ? faskesProfile.value_ppn / 100 : 0),
                    grand_total: totalPayment + (totalPayment * (faskesProfile.status_ppn ? faskesProfile.value_ppn / 100 : 0)),
                },
                actual: {
                    cash: cash,
                    debit: debit,
                    insurance: insurance,
                    total_payment: totalActual,
                }
            }
        } catch (error) {
            throw error;
        }
    }

    static async _getActiveShift(faskesUuid) {
        return await db('cashier_report as cr')
            .where('faskes_uuid', faskesUuid)
            .whereNull('shift_time_closed')
            .where('type', 'SHIFT')
            .orderBy('id', 'desc')
            .select(
                'cr.uuid',
                'cr.nama_kasir',
                'cr.shift_type'
            )
            .first();
    }

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
                tanggal_jam_closing: moment().unix()
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

    static async CloseDayCashier() {
        try {
            const {faskesUuid} = Ctx.get(CTX_AUTHOR);

            const trx = await db.transaction();
            const timeClose = moment().unix();
            const createCashierDay = await trx('cashier_report')
                .insert({
                    uuid: uuidv7(),
                    faskes_uuid: faskesUuid,
                    type: 'DAYS',
                    days_time_closed: moment().unix(),
                    status: true,
                    created_at: timeClose,
                    updated_at: timeClose,
                }).returning('uuid');
            const getDaysShift = await trx('cashier_report')
                .where('faskes_uuid', faskesUuid)
                .whereNull('cashier_report_uuid')
                .whereNull('days_time_closed')
                .where('type', 'SHIFT')
                .orderBy('id', 'desc')
                .select(
                    'shift_type',
                    'ballance',
                    'ppn',
                    'cash',
                    'debit',
                    'insurance',
                    'status',
                    'transaction_total',
                )

            const result = {};
            if(getDaysShift.length > 0){
                // update cashier_report_uuid
                await trx('cashier_report')
                    .where('faskes_uuid', faskesUuid)
                    .whereNull('cashier_report_uuid')
                    .whereNull('days_time_closed')
                    .where('type', 'SHIFT')
                    .update({
                        cashier_report_uuid: createCashierDay[0].uuid,
                    });
                
                // sum total
                result.total = getDaysShift.reduce((acc, curr) => acc + (curr.ballance || 0), 0);
                // sum ppn
                result.ppn = getDaysShift.reduce((acc, curr) => acc + (curr.ppn || 0), 0);
                // sum cash
                result.cash = getDaysShift.reduce((acc, curr) => acc + (curr.cash || 0), 0);
                // sum debit
                result.debit = getDaysShift.reduce((acc, curr) => acc + (curr.debit || 0), 0);
                // sum insurance
                result.insurance = getDaysShift.reduce((acc, curr) => acc + (curr.insurance || 0), 0);
                await trx.commit();

                return {
                    ...result,
                    time_closed: timeClose,
                    shift: getDaysShift,
                }
            }

            await trx.rollback();
            throw new CantProcessDataException('No shift cashier found');
        } catch (error) {
            throw error;
        }
    }
}