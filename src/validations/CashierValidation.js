import { z } from "zod";
export default class CashierValidation{
    static OPEN_SHIFT = z.object({
        beginning_balance: z.number().min(1),
        shift_type: z.enum(['1', '2', '3']),
    });

    static CLOSE_SHIFT = z.object({
        cash: z.number().min(0),
        debit: z.number().min(0),
        insurance: z.number().min(0),
    });
}