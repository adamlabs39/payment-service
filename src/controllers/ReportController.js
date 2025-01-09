import ReportService from "../services/ReportService.js";
import successResponse from "../responses/success-response.js";

export default class ReportController{
    static async getReportCashier(req, res, next){
        try{
            const params = req.query;
            const result = await ReportService.getReportCashier(params);
            return res.json(successResponse("Success", result.data, result.pagination));
        }catch (error){
            next(error);
        }
    }

    static async getReportPayment(req, res, next){
        try{
            const params = req.query;
            const result = await ReportService.getReportPayment(params);
            return res.json(successResponse("Success", result.data, result.pagination));
        }catch (error){
            next(error);
        }
    }
}