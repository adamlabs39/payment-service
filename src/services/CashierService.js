import ZodValidator from "../validations/zod-validator.js";
import CashierValidation from "../validations/CashierValidation.js";
import CashierRepository from "../repositories/CashierRepository.js";

export default class CashierService{
    static async OpenCashier(data){
        try{
            const valid = ZodValidator.validate(CashierValidation.OPEN_SHIFT, data);
            await CashierRepository.OpenShiftCashier(valid);
            return true;
        }catch (error) {
            throw error;
        }
    }

    static async CheckCashier(){
        try{
            const result = await CashierRepository.CheckCashierShift();
            return {
                is_open: !!result,
                ...result,
            }
        }catch (error) {
            throw error;
        }
    }

    static async CloseShiftCashier(data){
        try{
            const valid = ZodValidator.validate(CashierValidation.CLOSE_SHIFT, data);
            return CashierRepository.CloseShiftCashier(valid);
        }catch (error) {
            throw error;
        }
    }

    static async getCloseDayConfirmation() {
        try {
            return await CashierRepository.GetCloseDayConfirmationData();
        } catch (error) {
            throw error;
        }
    }

    static async CloseDayCashier(){
        try{
            return CashierRepository.CloseDayCashier();
        }catch (error) {
            throw error;
        }
    }
}