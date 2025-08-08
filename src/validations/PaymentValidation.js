import {z} from "zod";

export default class PaymentValidation{
    static APPLY_DISCOUNT = z.object({
        value: z.number().min(1).max(100),
    });

    static PAYMENT_REQUEST = z.object({
        amount: z.number({
            required_error: "Jumlah bayar harus diisi",
            invalid_type_error: "Jumlah bayar harus diisi",
        }).min(1, { message: "Jumlah bayar minimal 1" }),
        payment_type: z.enum(['CASH', 'INSURANCE'], {
            required_error: "Cara bayar harus dipilih",
            invalid_type_error: "Cara bayar harus dipilih"
        }),

        payment_method: z.preprocess(
            (val) => (val === "" ? null : val),
            z.enum(['CASH', 'DEBIT', 'TRANSFER', 'CREDIT']).nullable()
        ),
        note: z.string().nullable(),
        information: z.string().nullable(),
    }).superRefine((data, ctx) => {
        // Conditional validation
        if (data.payment_type === 'CASH' && !data.payment_method) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Metode pembayaran harus dipilih",
                path: ['payment_method']
            });
        }

        if (data.payment_type === 'INSURANCE' && data.payment_method) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Metode pembayaran harus kosong untuk asuransi",
                path: ['payment_method']
            });
        }
    });
}