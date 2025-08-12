import VoucherModel from "../models/voucher-model.js";
import db from "../configs/knex-config.js"; 
import {Context} from "../middlewares/context.js";
import {CTX_AUTHOR} from "../constants/context-constant.js";
import NotfoundException from "../exceptions/notfound-exception.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import moment from "moment";

export default class VoucherRepository {
    static async validateAndGetVoucher(code, billTotal) {
        try {
            const { faskesUuid } = Context.get(CTX_AUTHOR);

            const voucher = await VoucherModel.findOne({
                where: {
                    code: code,
                    faskes_uuid: faskesUuid
                },
                attributes: [
                    'uuid', 'qty', 'name', 'code', 
                    'start_date', 'end_date', 
                    'type', 'value', 
                    'status'
                ]
            });
            if (!voucher) {
                throw new NotfoundException("Voucher tidak ditemukan");
            }

            if (!voucher.status) {
                throw new BadRequestException("Voucher tidak aktif");
            }

            const now = moment().unix();
            if (voucher.start_date && now < voucher.start_date) {
                throw new BadRequestException("Masa berlaku voucher belum dimulai");
            }
            if (voucher.end_date && now > voucher.end_date) {
                throw new BadRequestException("Masa berlaku voucher telah berakhir");
            }

            const usageResult = await db("bills")
            .where({ voucher_code: code, faskes_uuid: faskesUuid })
            .count('uuid as total')
            .first();
            const usageCount = usageResult.total;
            
            if (usageCount >= voucher.qty) {
                throw new BadRequestException("Voucher telah habis digunakan");
            }

            if (voucher.type === 'persentase' || voucher.type === 'potongan' && voucher.value > billTotal) {
                throw new BadRequestException("Nilai voucher harus kurang dari total tagihan");
            }
            
            return voucher;

        } catch (error) {
            throw error;
        }
    }
}