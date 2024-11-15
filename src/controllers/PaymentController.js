import PaymentService from "../services/PaymentService.js";
import successResponse from "../responses/success-response.js";

export default class PaymentController {
    static async findPayment(req, res, next) {
        try {
            const search = req.query.search;
            const result = await PaymentService.findPayment(search);
            return res.json(successResponse("Success", result));
        } catch (error) {
            next(error);
        }
    }


    static async getDetailBill(req, res, next) {
        try {
            const uuid = req.params.uuid;
            const result = await PaymentService.getDetailBill(uuid);
            return res.json(successResponse("Success", result));
        } catch (error) {
            next(error);
        }
    }

    static async getBillItems(req, res, next) {
        try {
            const uuid = req.params.uuid;
            const result = await PaymentService.getBillItems(uuid);
            return res.json(successResponse("Success", result));
        } catch (error) {
            next(error);
        }
    }

    static async applyVoucher(req, res, next) {
        try {
            const uuid = req.params.uuid;
            const data = req.body;
            const result = await PaymentService.applyVoucher(uuid, data);
            return res.json(successResponse("Success", result));
        } catch (error) {
            next(error);
        }
    }

    static async closeBill(req, res, next) {
        try {
            const uuid = req.params.uuid;
            const result = await PaymentService.closeBill(uuid);
            return res.json(successResponse("Success", result));
        } catch (error) {
            next(error);
        }
    }
}