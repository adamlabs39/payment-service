import ZodValidator from '../validations/zod-validator.js';
import CashierValidation from '../validations/CashierValidation.js';
import CashierRepository from '../repositories/CashierRepository.js';

export default class CashierService {
  static async OpenCashier(data) {
    const valid = ZodValidator.validate(CashierValidation.OPEN_SHIFT, data);
    await CashierRepository.OpenShiftCashier(valid);
    return true;
  }

  static async CheckCashier() {
    const result = await CashierRepository.CheckCashierShift();
    return { is_open: !!result, ...result };
  }

  static async CloseShiftCashier(data) {
    const valid = ZodValidator.validate(CashierValidation.CLOSE_SHIFT, data);
    return CashierRepository.CloseShiftCashier(valid);
  }

  static async getCloseDayConfirmation() {
    return await CashierRepository.GetCloseDayConfirmationData();
  }

  static async CloseDayCashier() {
    return CashierRepository.CloseDayCashier();
  }
}
