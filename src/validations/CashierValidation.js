import { z } from "zod";
export default class CashierValidation{
    static OPEN_SHIFT = z.object({
        beginning_balance: z.number({
            required_error: "Saldo awal harus diisi", 
            invalid_type_error: "Saldo awal harus diisi", 
        }).int({ message: "Saldo harus lebih dari 0" })
        .positive({ message: "Saldo harus lebih dari 0" }),
        shift_type: z.enum(['1', '2', '3'], {
            required_error: "Shift harus dipilih",
            invalid_type_error: "Shift harus dipilih",
        }),
    });

    static CLOSE_SHIFT = z.object({
        cash: z.number({
            required_error: "Pendapatan shift kasir (cash) harus diisi",
            invalid_type_error: "Input cash harus diisi",
        }).min(0),
        debit: z.number({
            required_error: "Pendapatan shift kasir (debit) harus diisi",
            invalid_type_error: "Input debit harus diisi",
        }).min(0),
        insurance: z.number({
            required_error: "Pendapatan shift kasir (asuransi) harus diisi",
            invalid_type_error: "Input asuransi harus diisi",
        }).min(0),
    });
}