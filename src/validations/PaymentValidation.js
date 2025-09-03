import {z} from "zod";

export default class PaymentValidation{
    static APPLY_DISCOUNT = z.object({
        value: z.union([z.string(), z.number()], {
            required_error: "Nilai diskon harus diisi.",
            invalid_type_error: "Nilai diskon harus berupa angka atau teks.",
        })
        .transform((val) => {
            const stringVal = String(val);
            return parseFloat(stringVal.replace(',', '.'));
        })
        .pipe(
            z.number({
                invalid_type_error: "Nilai diskon tidak valid.",
            })
            .min(0.01, { message: "Diskon harus lebih besar dari 0" })
            .max(100, { message: "Diskon tidak boleh melebihi 100" })
            .refine(num => !isNaN(num), {
                message: "Input tidak dapat diubah menjadi angka yang valid.",
            })
        ),
    });

    static PAYMENT_REQUEST = z.object({
        amount: z.number({
            required_error: "Jumlah bayar harus diisi",
            invalid_type_error: "Jumlah bayar harus diisi",
        }).min(1, { message: "Jumlah bayar harus lebih dari 0" }).max(99999999999, { message: "Jumlah bayar tidak boleh melebihi 999.999.999.999" }),
        payment_type: z.enum(['CASH', 'INSURANCE'], {
            errorMap: () => ({ message: "Cara bayar harus dipilih" })
        }),
        payment_method: z.preprocess(
            (val) => (val === "" ? null : val),
            z.enum(['CASH', 'DEBIT', 'TRANSFER', 'CREDIT']).nullable()
        ),
        note: z.string().nullable(),
        information: z.string().nullable(),
    }).superRefine((data, ctx) => {
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

    static DEBT_PAYMENT = z.object({
        amount: z.number({
            required_error: "Jumlah bayar harus diisi",
            invalid_type_error: "Jumlah bayar harus berupa angka",
        }).min(1, { message: "Jumlah bayar minimal 1" }).max(99999999999, { message: "Jumlah bayar tidak boleh melebihi 999.999.999" }),
        payment_method: z.preprocess(
            (val) => (val === "" ? null : val),
            z.enum(['CASH', 'DEBIT', 'TRANSFER', 'CREDIT']).nullable()
        ),  
        payment_type: z.enum(['CASH', 'INSURANCE'], {
            errorMap: () => ({ message: "Cara bayar harus dipilih" })
        }),
        note: z.string().optional().nullable(),
        information: z.string().optional().nullable()
    }).superRefine((data, ctx) => {
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

    static GET_CLOSED_BILLS_FILTER = z.object({
        search: z.string().optional(),
        status: z.preprocess(
            (val) => { return val === '' ? undefined : (typeof val === 'string' ? val.toUpperCase() : val); },
            z.enum(['LUNAS', 'PIUTANG', 'SEMUA'], {
                errorMap: () => ({ message: "Nilai status tidak valid. Harap pilih LUNAS, PIUTANG, atau SEMUA." })
            })
        ).optional(),
        start_date: z.string()
            .regex(/^\d+$/, { message: "tanggal awal harus berupa timestamp unix" })
            .transform(Number)
            .optional(),
        end_date: z.string()
            .regex(/^\d+$/, { message: "tanggal akhir harus berupa timestamp unix" })
            .transform(Number)
            .optional(),
        service_type: z.union([
            z.string(),
            z.array(z.string())
        ]).optional(),
        payment_type: z.union([
            z.enum(['TUNAI', 'ASURANSI']),
            z.array(z.enum(['TUNAI', 'ASURANSI']))
        ], {
            errorMap: () => ({ message: "Nilai cara bayar tidak valid" })
        }).optional(),
    });
}