import db from "../configs/knex-config.js";
import {Context} from "../middlewares/context.js";
import {CTX_AUTHOR} from "../constants/context-constant.js";
import NotfoundException from "../exceptions/notfound-exception.js";
import CantProcessDataException from "../exceptions/CantProcessDataException.js";

export default class PaymentRepository {
    static async FindBill(search) {
        try {
            const {faskesUuid} = Context.get(CTX_AUTHOR);
            return await db('bills as b')
                .leftJoin('patients as p', db.raw('b.patient_uuid::uuid'), 'p.uuid')
                .select(
                    'b.uuid',
                    'b.name as patient_name',
                    'b.invoice_code',
                    'b.bill_code',
                    'b.grand_total',
                    'b.patient_uuid',
                    db.raw(`
                        CASE
                            WHEN b.merge_type = 1 THEN 'family_bill'
                            WHEN b.merge_type = 2 THEN 'previous_bill'
                            ELSE null
                        END as merged_bill
                    `),
                )
                .where('b.faskes_uuid', faskesUuid)
                .where('b.status', 0)
                .andWhere(function () {
                    this.where('p.no_rm', 'like', `%${search}%`)
                        .orWhere('b.invoice_code', 'like', `%${search}%`)
                        .orWhere('b.bill_code', 'like', `%${search}%`);
                });

        } catch (error) {
            throw error;
        }
    }


    static async GetDetailBill(uuid) {
        try {
            const { faskesUuid } = Context.get(CTX_AUTHOR);
            const checkIfFindIsMerge = await db('bills as b')
                .where('b.uuid', uuid)
                .select('b.merge_with')
                .where('b.faskes_uuid', faskesUuid)
                .first()
            if (checkIfFindIsMerge.merge_with) throw new CantProcessDataException('Bill Was Merged with another bill');
            const bill = await db('bills as b')
                .leftJoin('patients as p', db.raw('b.patient_uuid::uuid'), 'p.uuid')
                .leftJoin('service_bill as sb', db.raw('sb.bill_uuid::uuid'), 'b.uuid')
                .leftJoin('bill_item as bi', db.raw('bi.service_bill_uuid::uuid'), 'sb.uuid')
                .select(
                    'b.uuid',
                    'b.name as patient_name',
                    'b.invoice_code',
                    'b.bill_code',
                    'b.patient_uuid',
                    'p.gender',
                    'b.merge_with',
                    'b.grand_total',
                    'b.sub_total',
                    'b.ppn',
                    'b.admin_fee',
                    'b.voucher_code',
                    'b.voucher_value',
                    'b.voucher_type',
                    'b.close_bill',
                    db.raw(`SUM(CASE WHEN bi.category_code = '1' THEN bi.price * bi.qty ELSE 0 END) AS total_tindakan`),
                    db.raw(`SUM(CASE WHEN bi.category_code = '2' THEN bi.price * bi.qty ELSE 0 END) AS total_obat`),
                    db.raw(`SUM(CASE WHEN bi.category_code = '3' THEN bi.price * bi.qty ELSE 0 END) AS total_alkes`),
                    db.raw(`SUM(CASE WHEN bi.category_code = '4' THEN bi.price * bi.qty ELSE 0 END) AS total_ruangan`),
                    db.raw(`SUM(CASE WHEN bi.category_code = '5' THEN bi.price * bi.qty ELSE 0 END) AS total_penunjang`)
                )
                .where(function() {
                    this.where('b.uuid', uuid)
                        .orWhere('b.merge_with', uuid);
                })
                .andWhere('b.faskes_uuid', faskesUuid)
                .whereNull('b.deleted_at')
                .whereNull('sb.deleted_at')
                .whereNull('bi.deleted_at')
                .groupBy(
                    'b.uuid',
                    'p.gender',
                    'b.name',
                    'b.invoice_code',
                    'b.bill_code',
                    'b.patient_uuid',
                    'b.grand_total',
                    'b.sub_total',
                    'b.ppn',
                    'b.admin_fee',
                    'b.voucher_code',
                    'b.voucher_value',
                    'b.voucher_type',
                    'b.close_bill'
                )
            if (!bill.length) throw new NotfoundException('Bill not found');

            const dataMerge = bill.map(b => b.merge_with).filter(b => b !== null);
            const finalBill = bill.reduce((acc, b) => {
                acc.uuid = acc.uuid || b.uuid;
                acc.patient_name = acc.patient_name || b.patient_name;
                acc.invoice_code = acc.invoice_code || b.invoice_code;
                acc.bill_code = acc.bill_code || b.bill_code;
                acc.patient_uuid = acc.patient_uuid || b.patient_uuid;
                acc.gender = acc.gender || b.gender;
                acc.ppn = acc.ppn || b.ppn;
                acc.admin_fee = acc.admin_fee || b.admin_fee;
                acc.voucher_code = acc.voucher_code || b.voucher_code;
                acc.voucher_value = acc.voucher_value || b.voucher_value;
                acc.voucher_type = acc.voucher_type || b.voucher_type;
                acc.close_bill = acc.close_bill || b.close_bill;

                acc.grand_total = (acc.grand_total || 0) + b.grand_total;
                acc.sub_total = (acc.sub_total || 0) + b.sub_total;
                acc.total_tindakan = (acc.total_tindakan || 0) + (b.total_tindakan || 0);
                acc.total_obat = (acc.total_obat || 0) + (b.total_obat || 0);
                acc.total_alkes = (acc.total_alkes || 0) + (b.total_alkes || 0);
                acc.total_ruangan = (acc.total_ruangan || 0) + (b.total_ruangan || 0);
                acc.total_penunjang = (acc.total_penunjang || 0) + (b.total_penunjang || 0);

                return acc;
            }, {});

            const service_bill = await db('service_bill as sb')
                .leftJoin('bills as b', db.raw('sb.bill_uuid::uuid'), 'b.uuid')
                .select(
                    'sb.uuid',
                    'sb.practitioner_name',
                    'sb.service_name',
                    'sb.service_code',
                    'sb.layanan_uuid',
                    'sb.already_claim',
                    'sb.with_insurance',
                    'sb.type',
                    'sb.date',
                    db.raw(`CASE WHEN sb.bill_uuid = ? THEN FALSE ELSE TRUE END as is_merged`, [uuid]),
                    'b.merge_type',
                )
                .where(function() {
                    this.where('sb.bill_uuid', finalBill.uuid)
                        .orWhereIn('sb.bill_uuid', bill.map(b => b.uuid))
                })
                .whereNull('sb.deleted_at')

            return {
                ...finalBill,
                service_bill
            }
        } catch (error) {
            throw error;
        }
    }


}