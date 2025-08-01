import {z} from "zod";

export default class PaymentValidation{
    static APPLY_DISCOUNT = z.object({
        value: z.number().min(1).max(100),
    });

    static PAYMENT_REQUEST = z.object({
        amount: z.number().min(1),
        payment_type: z.enum(['CASH', 'INSURANCE']),
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
                message: 'Payment method is required when payment type is CASH.',
                path: ['payment_method']
            });
        }

        if (data.payment_type === 'INSURANCE' && data.payment_method) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Payment method should be null when payment type is INSURANCE.',
                path: ['payment_method']
            });
        }
    });
}