import {KnexPagination} from "../helpers/pagination.js";
import db from "../configs/knex-config.js";
import {CTX_AUTHOR} from "../constants/context-constant.js";
import {Context} from "../middlewares/context.js";
import BadRequestException from "../exceptions/bad-request-exception.js";

export default class ReportRepository {
    static async GetReportClosing(params) {
        try {
            const { faskesUuid } = Context.get(CTX_AUTHOR);
            const availType = ['SHIFT', 'DAYS'];
    
            const query = db('cashier_report as cr')
                .leftJoin('cashier_report as cr_child', 'cr_child.cashier_report_uuid', 'cr.uuid')
                .select(
                    'cr.uuid',
                    'cr.type',
                    'cr.shift_type',
                    'cr.shift_time_open',
                    'cr.shift_time_closed',
                    'cr.days_time_closed',
                    'cr.nama_kasir as cashier_name',
                    db.raw(`STRING_AGG(
                        CASE
                            WHEN cr_child.shift_type = '1' THEN 'Pagi'
                            WHEN cr_child.shift_type = '2' THEN 'Siang'
                            WHEN cr_child.shift_type = '3' THEN 'Malam'
                            ELSE NULL
                        END, ', ' ORDER BY cr_child.shift_type) as shift_list`),
                    db.raw(`STRING_AGG(DISTINCT cr_child.nama_kasir, ', ') as petugas_list`)
                )
                .where('cr.faskes_uuid', faskesUuid)
                .whereBetween('cr.created_at', [params.start_date, params.end_date])
                .groupBy(
                    'cr.id',
                    'cr.uuid',
                    'cr.type',
                    'cr.shift_type',
                    'cr.shift_time_open',
                    'cr.shift_time_closed',
                    'cr.days_time_closed',
                    'cr.nama_kasir'
                )
                .orderBy('cr.id', 'desc');
                
            if (params.start_date && params.end_date) {
                query.whereBetween('cr.created_at', [params.start_date, params.end_date]);
            }

            if (params.type && params.type !== 'ALL') {
                if (!availType.includes(params.type)) throw new BadRequestException('Tipe tidak valid');
                query.where('cr.type', params.type);
            }
    
            return await KnexPagination.init(query, params);
        } catch (error) {
            throw error;
        }
    }
    

    static async GetReportPayment(params) {
        try {
            const { faskesUuid } = Context.get(CTX_AUTHOR);
            const availShiftType = ['1', '2', '3'];
    
            let query = db('payment_history as ph')
            .leftJoin('bills as b', 'ph.bill_uuid', 'b.uuid')
            .leftJoin('patients as p', 'b.patient_uuid', 'p.uuid')
            .leftJoin('cashier_report as cr', 'ph.kasir_uuid', 'cr.uuid')
            .select(
                'ph.uuid', 'p.no_rm', 'b.invoice_code', 'b.bill_code', 'p.name as patient_name',
                'ph.created_at as payment_date', 'ph.payment_type', 'ph.amount',
                'cr.nama_kasir as cashier_name', 'ph.information', 'ph.note'
            )
            .where('ph.faskes_uuid', faskesUuid)

            if (params.start_date && params.end_date) {
                query.where('ph.created_at', '>=', params.start_date)
                     .where('ph.created_at', '<=', params.end_date);
            }
    
            if (params.shift_type && params.shift_type !== 'ALL') {
                if (!availShiftType.includes(params.shift_type)) throw new BadRequestException('Shift type tidak valid');
                query.where('cr.shift_type', params.shift_type);
            }
    
            if (params.search && params.search.trim() !== '') {
                const searchTerm = params.search.trim();
                
                const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(searchTerm);
    
                if (isUUID) {
                    query.andWhere(function() {
                        this.where('ph.uuid', searchTerm)
                            .orWhere('b.uuid', searchTerm)
                            .orWhere('p.uuid', searchTerm);
                    });
                } else {
                    const likeTerm = `%${searchTerm}%`;
                    query.andWhere(function() {
                        this.where('p.no_rm', 'ilike', likeTerm)
                            .orWhere('b.invoice_code', 'ilike', likeTerm)
                            .orWhere('b.bill_code', 'ilike', likeTerm)
                            .orWhere('p.name', 'ilike', likeTerm);
                    });
                }
            }
            return await KnexPagination.init(query, params);
        } catch (error) {
            throw error;
        }
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