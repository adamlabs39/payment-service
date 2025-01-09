import express from "express";
import PaymentController from "../controllers/PaymentController.js";
import authorizationMiddleware from "../middlewares/authorization-middleware.js";
import CashierController from "../controllers/CashierController.js";
import ReportController from "../controllers/ReportController.js";
const r = express.Router();


// Payment
r.get('/payment',authorizationMiddleware,PaymentController.findPayment);
r.get('/payment/:uuid',authorizationMiddleware,PaymentController.getDetailBill);
r.get('/payment/:uuid/items',authorizationMiddleware,PaymentController.getBillItems);
r.post('/payment/:uuid/voucher',authorizationMiddleware,PaymentController.applyVoucher);
r.post('/payment/:uuid/discount',authorizationMiddleware,PaymentController.applyDiscount);
r.post('/payment/:uuid/close',authorizationMiddleware,PaymentController.closeBill);
r.post('/payment/:uuid/discount',authorizationMiddleware,PaymentController.applyDiscount);
r.post('/payment/:uuid/payment',authorizationMiddleware,PaymentController.paymentBill);
r.get('/payment/:uuid/history',authorizationMiddleware,PaymentController.getPaymentHistory);
r.get('/payment/:uuid/detail',authorizationMiddleware,PaymentController.getDetailPayment);
// Cashier
r.post('/cashier/open',authorizationMiddleware,CashierController.OpenCashier);
r.get('/cashier/check',authorizationMiddleware,CashierController.CheckCashier);
r.post('/cashier/close',authorizationMiddleware,CashierController.CloseShiftCashier);
r.post('/cashier/close/day',authorizationMiddleware,CashierController.CloseDayCashier);

// Report
r.get('/report/cashier',authorizationMiddleware,ReportController.getReportCashier);
r.get('/report/payment',authorizationMiddleware,ReportController.getReportPayment);

export default r;