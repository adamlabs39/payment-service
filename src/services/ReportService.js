import BadRequestException from "../exceptions/bad-request-exception.js";
import ReportRepository from "../repositories/ReportRepository.js";

export default class ReportService{
    static async getReportCashier(params){
        if(!params.start_date || !params.end_date) throw new BadRequestException('Start date and end date is required');
        return await ReportRepository.GetReportClosing(params);
    }

    static async getReportPayment(params){
        if(!params.start_date || !params.end_date) throw new BadRequestException('Start date and end date is required');
        return await ReportRepository.GetReportPayment(params);
    }
}