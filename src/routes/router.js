import express from "express";
import PaymentController from "../controllers/PaymentController.js";
import authorizationMiddleware from "../middlewares/authorization-middleware.js";
const r = express.Router();


// r.get('/test/sdk',TestSdkController.testSdk);
r.get('/payment',authorizationMiddleware,PaymentController.findPayment);
r.get('/payment/:uuid',authorizationMiddleware,PaymentController.getDetailBill);
export default r;