import {z} from 'zod';
export default class VoucherValidation {
    static VoucherSchema = z.object({
        code: z.string().min(1).max(255),
    });
}