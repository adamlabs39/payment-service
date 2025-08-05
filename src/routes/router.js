import express from "express";
import PaymentController from "../controllers/PaymentController.js";
import CashierController from "../controllers/CashierController.js";
import ReportController from "../controllers/ReportController.js";
import authorizationSdk from "@adameds/authorization-sdk";
const r = express.Router();


// Payment
r.get('/payment',authorizationSdk([]),PaymentController.findPayment);
r.get('/payment/:uuid',authorizationSdk([]),PaymentController.getDetailBill);
r.get('/payment/:uuid/items',authorizationSdk([]),PaymentController.getBillItems);
r.post('/payment/:uuid/voucher',authorizationSdk([]),PaymentController.applyVoucher);
r.post('/payment/:uuid/discount',authorizationSdk([]),PaymentController.applyDiscount);
r.post('/payment/:uuid/close',authorizationSdk([]),PaymentController.closeBill);
r.post('/payment/:uuid/payment',authorizationSdk([]),PaymentController.paymentBill);
r.get('/payment/:uuid/history',authorizationSdk([]),PaymentController.getPaymentHistory);
r.get('/payment/:uuid/detail',authorizationSdk([]),PaymentController.getDetailPayment);
// Cashier
r.post('/cashier/open',authorizationSdk([]),CashierController.OpenCashier);
r.get('/cashier/check',authorizationSdk([]),CashierController.CheckCashier);
r.post('/cashier/close',authorizationSdk([]),CashierController.CloseShiftCashier);
r.post('/cashier/close/day',authorizationSdk([]),CashierController.CloseDayCashier);

// Report
r.get('/report/cashier',authorizationSdk([]),ReportController.getReportCashier);
r.get('/report/payment',authorizationSdk([]),ReportController.getReportPayment);
r.get('/report/revenue', authorizationSdk([]), ReportController.getReportRevenue);

export default r;