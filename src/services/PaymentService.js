import BadRequestException from '../exceptions/bad-request-exception.js';
import ZodValidator from '../validations/zod-validator.js';
import VoucherValidation from '../validations/VoucherValidation.js';
import PaymentValidation from '../validations/PaymentValidation.js';
import BillingRepository from '../repositories/BillingRepository.js';
import PaymentRepository from '../repositories/PaymentRepository.js';
export default class PaymentService {
  static async findPayment(search) {
    if (!search) throw new BadRequestException('Pencarian tagihan tidak boleh kosong');
    return await BillingRepository.FindBill(search);
  }

  static async getDetailBill(uuid) {
    if (!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
    return await BillingRepository.GetDetailBill(uuid);
  }

  static async getBillItems(uuid) {
    if (!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
    return await BillingRepository.GetDetailBillItem(uuid);
  }

  static async getDetailPasienBill(uuid) {
    if (!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
    return await BillingRepository.getDetailPasienBill(uuid);
  }

  static async getDetailPayment(uuid) {
    if (!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
    return await BillingRepository.GetDetailBill(uuid);
  }

  static async getClosedBillList(queryParams) {
    const validQueryParams = ZodValidator.validate(PaymentValidation.GET_CLOSED_BILLS_FILTER, queryParams);
    return await BillingRepository.getClosedBill(validQueryParams);
  }

  static async getApsOtcList(queryParams) {
    const validQueryParams = ZodValidator.validate(PaymentValidation.GET_CLOSED_BILLS_FILTER, queryParams);
    return await BillingRepository.getApsOtc(validQueryParams);
  }

  static async getPelayananList(queryParams) {
    const validQueryParams = ZodValidator.validate(PaymentValidation.GET_CLOSED_BILLS_FILTER, queryParams);
    return await BillingRepository.getPelayanan(validQueryParams);
  }
  static async applyVoucher(uuid, data) {
    if (!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
    const validData = ZodValidator.validate(VoucherValidation.VoucherSchema, data);
    return await BillingRepository.ApplyVoucher(uuid, validData);
  }

  static async applyDiscount(uuid, data) {
    if (!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
    const validData = ZodValidator.validate(PaymentValidation.APPLY_DISCOUNT, data);
    return await BillingRepository.ApplyDiscount(uuid, validData);
  }

  static async closeBill(uuid) {
    if (!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
    return await BillingRepository.CloseBill(uuid);
  }

  static async paymentBill(uuid, data) {
    if (!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
    const validData = ZodValidator.validate(PaymentValidation.PAYMENT_REQUEST, data);
    return await PaymentRepository.PaymentBill(uuid, validData);
  }

  static async getPaymentHistory(uuid) {
    if (!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
    return await PaymentRepository.GetPaymentHistory(uuid);
  }

  static async payDebtOnClosedBill(uuid, data) {
    if (!uuid) throw new BadRequestException('UUID tagihan tidak boleh kosong');
    const validData = ZodValidator.validate(PaymentValidation.DEBT_PAYMENT, data);
    return await PaymentRepository.PayDebt(uuid, validData);
  }

  static async getMyBills(patientUuid) {
    if (!patientUuid) {
      throw new BadRequestException('Patient tidak ditemukan');
    }
    return await BillingRepository.getBillsForPatient(patientUuid);
  }
}
