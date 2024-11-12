import PaymentRepository from "../repositories/PaymentRepository.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
export default class PaymentService {
    static async findPayment(search){
        try {
            if(!search) throw new BadRequestException('Search is required');
            return await PaymentRepository.FindBill(search);
        } catch (error) {
            throw error;
        }
    }

    static async getDetailBill(uuid) {
        try{
            if(!uuid) throw new BadRequestException('uuid is required');
            return await PaymentRepository.GetDetailBill(uuid);
        }catch (error) {
            throw error;
        }
    }
}