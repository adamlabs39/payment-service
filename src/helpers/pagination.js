import { paginationHelper } from "./utility.js";
import db from "../configs/knex-config.js";

export class KnexPagination {
    static async init(query, args) {
        const page = parseInt(args.page) || 1;
        const limit = parseInt(args.limit) || 10;
        const offset = (page - 1) * limit;

        const sqlQuery = query.toSQL();

        const countQuery = db.raw(
            `SELECT count(*) as "total" FROM (${sqlQuery.sql}) as count_subquery`, 
            sqlQuery.bindings
        ).then(result => result.rows[0]);

        const [data, countResult] = await Promise.all([
            query.limit(limit).offset(offset),
            countQuery
        ]);

        const total = parseInt(countResult.total, 10) || 0;

        return {
            data,
            pagination: paginationHelper(page, limit, total)
        };
    }
}
