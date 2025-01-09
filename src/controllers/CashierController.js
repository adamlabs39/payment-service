import CashierService from "../services/CashierService.js";
import successResponse from "../responses/success-response.js";

export default class CashierController{
    static async OpenCashier(req, res, next){
        try{
            const data = req.body;
            const result = await CashierService.OpenCashier(data);
            return res.json(successResponse("Success"));
        }catch (error){
            next(error);
        }
    }

    static async CheckCashier(req, res, next){
        try{
            const result = await CashierService.CheckCashier();
            return res.json(successResponse("Success", result));
        }catch (error) {
            next(error);
        }
    }

    static async CloseShiftCashier(req, res, next){
        try{
            const data = req.body;
            const result = await CashierService.CloseShiftCashier(data);
            return res.json(successResponse("Success", result));
        }catch (error) {
            next(error);
        }
    }

    static async CloseDayCashier(req, res, next){
        try{
            const result = await CashierService.CloseDayCashier();
            return res.json(successResponse("Success", result));
        }catch (error) {
            next(error);
        }
    }
}