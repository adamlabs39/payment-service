import { paginationHelper } from "./utility.js";

export class KnexPagination {
    static async init(query, args) {
        const page = parseInt(args.page) || 1;
        const limit = parseInt(args.limit) || 10;
        const offset = (page - 1) * limit;

        const countQuery = query.clone().clearSelect().count('* as count').first();
        const total = (await countQuery).count;

        const data = await query
            .limit(limit)
            .offset(offset);

        return {
            data,
            pagination: paginationHelper(page, limit, total)
        };
    }
}
