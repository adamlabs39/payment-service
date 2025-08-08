import ReportService from "../services/ReportService.js";
import successResponse from "../responses/success-response.js";

export default class ReportController{
    static async getReportCashier(req, res, next){
        try{
            const params = req.query;
            const result = await ReportService.getReportCashier(params);
            return res.json(successResponse("Data berhasil ditampilkan", result.data, result.pagination));
        }catch (error){
            next(error);
        }
    }

    static async getReportPayment(req, res, next){
        try{
            const params = req.query;
            const result = await ReportService.getReportPayment(params);
            return res.json(successResponse("Data berhasil ditampilkan", result.data, result.pagination));
        }catch (error){
            next(error);
        }
    }

    static async getReportRevenue(req, res, next) {
        try {
            const params = req.query;
            const result = await ReportService.getReportRevenue(params);
            return res.json(successResponse("Data berhasil ditampilkan", result));
        } catch (error) {
            next(error);
        }
    }
}