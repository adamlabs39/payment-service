import BadRequestException from "../exceptions/bad-request-exception.js";
import ReportRepository from "../repositories/ReportRepository.js";
import ZodValidator from "../validations/zod-validator.js";
import ReportValidation from "../validations/ReportValidation.js";

export default class ReportService{
    static async getReportCashier(params){
        if(!params.start_date || !params.end_date) throw new BadRequestException('Start date and end date is required');
        const valid = ZodValidator.validate(ReportValidation.GET_CLOSING_REPORT, params);
        return await ReportRepository.GetReportClosing(valid);
    }

    static async getReportPayment(params){
        if(!params.start_date || !params.end_date) throw new BadRequestException('Start date and end date is required');
        const valid = ZodValidator.validate(ReportValidation.GET_PAYMENT_REPORT, params);
        return await ReportRepository.GetReportPayment(valid);
    }
}