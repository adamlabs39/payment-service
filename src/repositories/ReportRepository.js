import {KnexPagination} from "../helpers/pagination.js";
import db from "../configs/knex-config.js";
import {CTX_AUTHOR} from "../constants/context-constant.js";
import {Context} from "../middlewares/context.js";
import BadRequestException from "../exceptions/bad-request-exception.js";

export default class ReportRepository {
    static async GetReportClosing(params) {
        try {
            const availType = ['SHIFT', 'DAYS'];
            const query = db('cashier_report as cr')
                .select(
                    'cr.uuid',
                    'cr.type',
                    'cr.shift_type',
                    'cr.shift_time_open',
                    'cr.shift_time_closed',
                    'cr.days_time_closed',
                    'cr.nama_kasir as cashier_name',
                    db.raw(
                        `CASE 
                        WHEN cr.type = 'DAYS' THEN 
                            (SELECT STRING_AGG(
                                CASE
                                    WHEN cr2.shift_type = '1' THEN 'Pagi'
                                    WHEN cr2.shift_type = '2' THEN 'Siang'
                                    WHEN cr2.shift_type = '3' THEN 'Malam'
                                    ELSE 'N/A'
                                END, ', ')
                             FROM cashier_report AS cr2 
                             WHERE cr2.cashier_report_uuid = cr.uuid)
                        ELSE NULL 
                    END as shift_list`
                    )
                ).where('cr.faskes_uuid', Context.get(CTX_AUTHOR).faskesUuid)
                .where('cr.created_at', '>=', params.start_date)
                .where('cr.created_at', '<=', params.end_date)

            if (params.type) {
                if (!availType.includes(params.type)) throw new BadRequestException('Invalid type');
                query.where('cr.type', params.type)
            }


            return await KnexPagination.init(query, params);
        } catch (error) {
            throw error;
        }
    }

    static async GetReportPayment(params) {
        const availShiftType = ['1', '2', '3']; // 1 = Pagi, 2 = Siang, 3 = Malam
        const query = db('payment_history as ph')
            .leftJoin('bills as b', db.raw('ph.bill_uuid'), 'b.uuid')
            .leftJoin('patients as p', db.raw('b.patient_uuid'), 'p.uuid')
            .leftJoin('cashier_report as cr', db.raw('ph.kasir_uuid'), 'cr.uuid')
            .select(
                'ph.uuid',
                'p.no_rm',
                'b.invoice_code',
                'b.bill_code',
                'p.name as patient_name',
                'ph.created_at as payment_date',
                'ph.payment_type',
                'ph.amount',
                'cr.nama_kasir as cashier_name',
                'ph.information',
                'ph.note',
            )
            .where('ph.created_at', '>=', params.start_date)
            .where('ph.created_at', '<=', params.end_date)
            .where('ph.faskes_uuid', Context.get(CTX_AUTHOR).faskesUuid)

        if (params.shift_type) {
            if (!availShiftType.includes(params.shift_type)) throw new BadRequestException('Invalid shift type');
            query.where('cr.shift_type', params.shift_type)
        }

        if (params.name && params.name.trim() !== '') {
            const searchTerm = `%${params.name}%`;
            query.where(function() {
                this.where('p.no_rm', 'ilike', searchTerm)
                    .orWhere('b.invoice_code', 'ilike', searchTerm)
                    .orWhere('b.bill_code', 'ilike', searchTerm)
                    .orWhere('p.name', 'ilike', searchTerm);
            });
        }

        return await KnexPagination.init(query, params);
    }


    static async GetTotalRevenue(params){
        try{
            const { faskesUuid } = Context.get(CTX_AUTHOR);
            const { start_date, end_date } = params;

            const result = await db('payment_history as ph')
                .where('ph.faskes_uuid', faskesUuid)
                .whereBetween('ph.created_at', [start_date, end_date])
                .select(
                    db.raw('SUM(ph.amount) as total_pendapatan'),
                    db.raw(`SUM(CASE WHEN ph.payment_method = 'CASH' THEN ph.amount ELSE 0 END) as total_tunai`),
                    db.raw(`SUM(CASE WHEN ph.payment_method IN ('DEBIT', 'TRANSFER', 'CREDIT') THEN ph.amount ELSE 0 END) as total_debit`),
                    db.raw(`SUM(CASE WHEN ph.payment_type = 'INSURANCE' THEN ph.amount ELSE 0 END) as total_kredit`)
                )
                .first();

            return {
                total_pendapatan: parseFloat(result.total_pendapatan) || 0,
                total_tunai: parseFloat(result.total_tunai) || 0,
                total_debit: parseFloat(result.total_debit) || 0,
                total_kredit: parseFloat(result.total_kredit) || 0,
            };
        }catch (error) {
            throw error;
        }
    }
}