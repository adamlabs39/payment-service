import PaymentRepository from "../repositories/PaymentRepository.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import ZodValidator from "../validations/zod-validator.js";
import VoucherValidation from "../validations/VoucherValidation.js";
import PaymentValidation from "../validations/PaymentValidation.js";
export default class PaymentService {
    static async findPayment(search){
        try {
            if(!search) throw new BadRequestException('Search is required');
            return await PaymentRepository.FindBill(search);
        } catch (error) {
            throw error;
        }
    }

    static async getDetailBill(uuid) {
        try{
            if(!uuid) throw new BadRequestException('uuid is required');
            return await PaymentRepository.GetDetailBill(uuid);
        }catch (error) {
            throw error;
        }
    }

    static async getBillItems(uuid) {
        try {
            if(!uuid) throw new BadRequestException('uuid is required');
            return await PaymentRepository.GetDetailBillItem(uuid);
        } catch (error) {
            throw error;
        }
    }

    static async getDetailPasienBill(uuid) {
        try {
            if(!uuid) throw new BadRequestException('uuid is required');
            return await PaymentRepository.getDetailPasienBill(uuid);
        } catch (error) {
            throw error;
        }
    }

    static async applyVoucher(uuid,data){
        try{
            if(!uuid) throw new BadRequestException('uuid is required');
            const validData = ZodValidator.validate(VoucherValidation.VoucherSchema, data);
            return await PaymentRepository.ApplyVoucher(uuid, validData);
        }catch (error) {
            throw error;
        }
    }

    static async applyDiscount(uuid,data){
        try{
            if(!uuid) throw new BadRequestException('uuid is required');
            const validData = ZodValidator.validate(PaymentValidation.APPLY_DISCOUNT, data);
            return await PaymentRepository.ApplyDiscount(uuid, validData);
        }catch (error) {
            throw error;
        }
    }

    static async closeBill(uuid){
        try{
            if(!uuid) throw new BadRequestException('uuid is required');
            return await PaymentRepository.CloseBill(uuid);
        }catch (error) {
            throw error;
        }
    }

    static async paymentBill(uuid, data){
        try{
            if(!uuid) throw new BadRequestException('uuid is required');
            const validData = ZodValidator.validate(PaymentValidation.PAYMENT_REQUEST, data);
            return await PaymentRepository.PaymentBill(uuid, validData);
        }catch (error) {
            throw error;
        }
    }

    static async getPaymentHistory(uuid){
        try{
            if(!uuid) throw new BadRequestException('uuid is required');
            return await PaymentRepository.GetPaymentHistory(uuid);
        }catch (error) {
            throw error;
        }
    }


    static async getDetailPayment(uuid){
        try{
            if(!uuid) throw new BadRequestException('uuid is required');
            return await PaymentRepository.getAllDetailBillItem(uuid);
        }catch (error) {
            throw error;
        }
    }

    static async getClosedBillList(queryParams) {
        try {
            const validQueryParams = ZodValidator.validate(PaymentValidation.GET_CLOSED_BILLS_FILTER, queryParams);
            return await PaymentRepository.getClosedBill(validQueryParams);
        } catch (error) {
            throw error;
        }
    }

    static async payDebtOnClosedBill(uuid, data) {
        try {
            if (!uuid) throw new BadRequestException('UUID is required');
            const validData = ZodValidator.validate(PaymentValidation.DEBT_PAYMENT, data);
            return await PaymentRepository.PayDebt(uuid, validData);
        } catch (error) {
            throw error;
        }
    }
}