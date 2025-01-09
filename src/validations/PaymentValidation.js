import {z} from "zod";

export default class PaymentValidation{
    static APPLY_DISCOUNT = z.object({
        value: z.number().min(1).max(100),
    });

    static PAYMENT_REQUEST = z.object({
        amount: z.number().min(1),
        payment_type: z.enum(['CASH', 'INSURANCE']),
        payment_method: z.enum(['CASH', 'DEBIT', 'TRANSFER', 'CREDIT']).nullable(),
        note: z.string().nullable(),
        information: z.string().nullable(),
    }).superRefine((data, ctx) => {
        // Conditional validation
        if (data.paymentType === 'CASH' && !data.paymentMethod) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Payment method is required when payment type is CASH.',
                path: ['paymentMethod']
            });
        }

        if (data.paymentType === 'INSURANCE' && data.paymentMethod) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Payment method should be null when payment type is INSURANCE.',
                path: ['paymentMethod']
            });
        }
    });
}