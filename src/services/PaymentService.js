import BadRequestException from "../exceptions/bad-request-exception.js";
import ZodValidator from "../validations/zod-validator.js";
import VoucherValidation from "../validations/VoucherValidation.js";
import PaymentValidation from "../validations/PaymentValidation.js";
import BillQueryRepository from "../repositories/BillQueryRepository.js";
import BillActionRepository from "../repositories/BillActionRepository.js";
import PaymentTransactionRepository from "../repositories/PaymentTransactionRepository.js";
export default class PaymentService {
    static async findPayment(search){
        try {
            if(!search) throw new BadRequestException('Pencarian tagihan tidak boleh kosong');
            return await BillQueryRepository.FindBill(search);
        } catch (error) {
            throw error;
        }
    }
    
    static async getDetailBill(uuid) {
        try{
            if(!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
            return await BillQueryRepository.GetDetailBill(uuid);
        }catch (error) {
            throw error;
        }
    }
    
    static async getBillItems(uuid) {
        try {
            if(!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
            return await BillQueryRepository.GetDetailBillItem(uuid);
        } catch (error) {
            throw error;
        }
    }
    
    static async getDetailPasienBill(uuid) {
        try {
            if(!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
            return await BillQueryRepository.getDetailPasienBill(uuid);
        } catch (error) {
            throw error;
        }
    }
    
    static async getDetailPayment(uuid){
        try{
            if(!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
            return await BillQueryRepository.GetDetailBill(uuid);
        }catch (error) {
            throw error;
        }
    }

    static async getClosedBillList(queryParams) {
        try {
            const validQueryParams = ZodValidator.validate(PaymentValidation.GET_CLOSED_BILLS_FILTER, queryParams);
            return await BillQueryRepository.getClosedBill(validQueryParams);
        } catch (error) {
            throw error;
        }
    }

    static async getApsOtcList(queryParams) {
        try {
            const validQueryParams = ZodValidator.validate(PaymentValidation.GET_CLOSED_BILLS_FILTER, queryParams);
            return await BillQueryRepository.getApsOtc(validQueryParams);
        } catch (error) {
            throw error;
        }
    }

    static async getPelayananList(queryParams) {
        try {
            const validQueryParams = ZodValidator.validate(PaymentValidation.GET_CLOSED_BILLS_FILTER, queryParams);
            return await BillQueryRepository.getPelayanan(validQueryParams);
        } catch (error) {
            throw error;
        }
    }
    static async applyVoucher(uuid,data){
        try{
            if(!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
            const validData = ZodValidator.validate(VoucherValidation.VoucherSchema, data);
            return await BillActionRepository.ApplyVoucher(uuid, validData);
        }catch (error) {
            throw error;
        }
    }

    static async applyDiscount(uuid,data){
        try{
            if(!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
            const validData = ZodValidator.validate(PaymentValidation.APPLY_DISCOUNT, data);
            return await BillActionRepository.ApplyDiscount(uuid, validData);
        }catch (error) {
            throw error;
        }
    }

    static async closeBill(uuid){
        try{
            if(!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
            return await BillActionRepository.CloseBill(uuid);
        }catch (error) {
            throw error;
        }
    }

    static async paymentBill(uuid, data){
        try{
            if(!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
            const validData = ZodValidator.validate(PaymentValidation.PAYMENT_REQUEST, data);
            return await PaymentTransactionRepository.PaymentBill(uuid, validData);
        }catch (error) {
            throw error;
        }
    }

    static async getPaymentHistory(uuid){
        try{
            if(!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
            return await PaymentTransactionRepository.GetPaymentHistory(uuid);
        }catch (error) {
            throw error;
        }
    }



    static async payDebtOnClosedBill(uuid, data) {
        try {
            if (!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
            const validData = ZodValidator.validate(PaymentValidation.DEBT_PAYMENT, data);
            return await PaymentTransactionRepository.PayDebt(uuid, validData);
        } catch (error) {
            throw error;
        }
    }
}