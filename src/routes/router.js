import express from "express";
import PaymentController from "../controllers/PaymentController.js";
import CashierController from "../controllers/CashierController.js";
import ReportController from "../controllers/ReportController.js";
import authorizationSdk from "@adameds/authorization-sdk";
const r = express.Router();

// Payment
r.get('/closed-bills', authorizationSdk([]), PaymentController.getClosedBillList);
r.get('/closed-bills/:uuid/history', authorizationSdk([]), PaymentController.getPaymentHistory);
r.get('/aps-otc', authorizationSdk([]), PaymentController.getApsOtcList);
r.get('/pelayanan', authorizationSdk([]), PaymentController.getPelayananList);
r.get('/payment',authorizationSdk([]),PaymentController.findPayment);
r.get('/payment/:uuid',authorizationSdk([]),PaymentController.getDetailBill);
r.get('/payment/:uuid/items',authorizationSdk([]),PaymentController.getBillItems);
r.get('/payment/:uuid/detail',authorizationSdk([]),PaymentController.getDetailPayment);
r.get('/payment/:uuid/pasien',authorizationSdk([]),PaymentController.getDetailPasienBill);
r.post('/payment/:uuid/voucher',authorizationSdk([]),PaymentController.applyVoucher);
r.post('/payment/:uuid/discount',authorizationSdk([]),PaymentController.applyDiscount);
r.post('/payment/:uuid/close',authorizationSdk([]),PaymentController.closeBill);
r.post('/payment/:uuid/payment',authorizationSdk([]),PaymentController.paymentBill);
r.post('/closed-bills/:uuid/pay', authorizationSdk([]), PaymentController.payDebtOnClosedBill);

// Cashier
r.get('/cashier/check',authorizationSdk([]),CashierController.CheckCashier);
r.get('/cashier/close-day/check', authorizationSdk([]), CashierController.getCloseDayConfirmation);
r.post('/cashier/open',authorizationSdk([]),CashierController.OpenCashier);
r.post('/cashier/close',authorizationSdk([]),CashierController.CloseShiftCashier);
r.post('/cashier/close/day',authorizationSdk([]),CashierController.CloseDayCashier);

// Report
r.get('/report/cashier',authorizationSdk([]),ReportController.getReportCashier);
r.get('/report/payment',authorizationSdk([]),ReportController.getReportPayment);
r.get('/report/revenue', authorizationSdk([]), ReportController.getReportRevenue);

export default r;