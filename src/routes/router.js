import express from "express";
import PaymentController from "../controllers/PaymentController.js";
import authorizationMiddleware from "../middlewares/authorization-middleware.js";
const r = express.Router();

r.get('/payment',authorizationMiddleware,PaymentController.findPayment);
r.get('/payment/:uuid',authorizationMiddleware,PaymentController.getDetailBill);
r.get('/payment/:uuid/items',authorizationMiddleware,PaymentController.getBillItems);
r.post('/payment/:uuid/voucher',authorizationMiddleware,PaymentController.applyVoucher);
r.post('/payment/:uuid/close',authorizationMiddleware,PaymentController.closeBill);
export default r;