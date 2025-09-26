import PaymentService from '../services/PaymentService.js';
import successResponse from '../responses/success-response.js';
import UnauthorizedException from '../exceptions/unauthorized-exception.js';
import { Context } from '../middlewares/context.js';
import { CTX_AUTHOR } from '../constants/context-constant.js';

export default class PatientBillController {
  static async getMyBills(req, res, next) {
    try {
      const author = Context.get(CTX_AUTHOR);

      if (!author || !author.patient_uuid) {
        throw new UnauthorizedException('Akses ditolak, Token patient tidak valid');
      }

      const patientUuid = author.patient_uuid;

      const result = await PaymentService.getMyBills(patientUuid);

      return res.json(successResponse('Data tagihan berhasil ditampilkan', result));
    } catch (error) {
      next(error);
    }
  }
}
