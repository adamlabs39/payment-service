import { z } from "zod";

export default class ReportValidation {
    static #BASE_PARAMS = z.object({
        start_date: z.string().regex(/^\d+$/, "start_date must be a Unix timestamp string").transform(Number).optional(),
        end_date: z.string().regex(/^\d+$/, "end_date must be a Unix timestamp string").transform(Number).optional(),
        page: z.string().optional().default('1').transform(Number),
        limit: z.string().optional().default('10').transform(Number),
    });

    static GET_PAYMENT_REPORT = this.#BASE_PARAMS.extend({
        search: z.preprocess(
            (val) => (val === "" ? undefined : val),
            z.string().optional()
        ),
        shift_type: z.preprocess(
            (val) => (val === "" || val === null ? undefined : val),
            z.enum(['1', '2', '3']).optional()
        ),
    });

    static GET_CLOSING_REPORT = this.#BASE_PARAMS.extend({
        type: z.enum(['SHIFT', 'DAYS', 'ALL']).optional(),
    });

    static GET_REVENUE_REPORT = z.object({
        start_date: z.string().regex(/^\d+$/, "start_date must be a Unix timestamp string").transform(Number),
        end_date: z.string().regex(/^\d+$/, "end_date must be a Unix timestamp string").transform(Number),
    });
}