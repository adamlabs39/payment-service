import PaymentService from "../services/PaymentService.js";
import successResponse from "../responses/success-response.js";

export default class PaymentController {
    static async findPayment(req, res, next) {
        try {
            const search = req.query.search;
            const result = await PaymentService.findPayment(search);
            return res.json(successResponse("Data berhasil ditampilkan", result));
        } catch (error) {
            next(error);
        }
    }


    static async getDetailBill(req, res, next) {
        try {
            const uuid = req.params.uuid;
            const result = await PaymentService.getDetailBill(uuid);
            return res.json(successResponse("Data berhasil ditampilkan", result));
        } catch (error) {
            next(error);
        }
    }

    static async getBillItems(req, res, next) {
        try {
            const uuid = req.params.uuid;
            const result = await PaymentService.getBillItems(uuid);
            return res.json(successResponse("Data berhasil ditampilkan", result));
        } catch (error) {
            next(error);
        }
    }

    static async getDetailPasienBill(req, res, next) {
        try {
            const uuid = req.params.uuid;
            const result = await PaymentService.getDetailPasienBill(uuid);
            return res.json(successResponse("Data berhasil ditampilkan", result));
        } catch (error) {
            next(error);
        }
    }

    static async applyVoucher(req, res, next) {
        try {
            const uuid = req.params.uuid;
            const data = req.body;
            const result = await PaymentService.applyVoucher(uuid, data);
            return res.json(successResponse("Voucher berhasil digunakan", result));
        } catch (error) {
            next(error);
        }
    }

    static async applyDiscount(req, res, next) {
        try {
            const uuid = req.params.uuid;
            const data = req.body;
            const result = await PaymentService.applyDiscount(uuid, data);
            return res.json(successResponse("Discount berhasil digunakan", result));
        } catch (error) {
            next(error);
        }
    }

    static async closeBill(req, res, next) {
        try {
            const uuid = req.params.uuid;
            const result = await PaymentService.closeBill(uuid);
            return res.json(successResponse("Bill berhasil ditutup", result));
        } catch (error) {
            next(error);
        }
    }

    static async paymentBill(req, res, next) {
        try {
            const uuid = req.params.uuid;
            const data = req.body;
            const result = await PaymentService.paymentBill(uuid, data);
            return res.json(successResponse("Pembayaran berhasil", result));
        } catch (error) {
            next(error);
        }
    }

    static async getPaymentHistory(req, res, next) {
        try {
            const uuid = req.params.uuid;
            const result = await PaymentService.getPaymentHistory(uuid);
            return res.json(successResponse("Data berhasil ditampilkan", result));
        } catch (error) {
            next(error);
        }
    }

    static async getDetailPayment(req, res, next) {
        try {
            const uuid = req.params.uuid;
            const result = await PaymentService.getDetailPayment(uuid);
            return res.json(successResponse("Data berhasil ditampilkan", result));
        } catch (error) {
            next(error);
        }
    }

    static async getClosedBillList(req, res, next) {
        try {
            const result = await PaymentService.getClosedBillList(req.query);
            return res.json(successResponse("Data berhasil ditampilkan", result.data, result.pagination));
        } catch (error) {
            next(error);
        }
    }

    static async payDebtOnClosedBill(req, res, next) {
        try {
            const { uuid } = req.params;
            const data = req.body;
            const result = await PaymentService.payDebtOnClosedBill(uuid, data);
            return res.json(successResponse("Pembayaran hutang berhasil", result));
        } catch (error) {
            next(error);
        }
    }
}