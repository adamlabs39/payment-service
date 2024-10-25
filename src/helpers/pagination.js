import { paginationHelper } from "./utility.js";

export default class Pagination {
    static async init(model, args, filter = {}, options = {}, transformMap = {}, distinct = false) {
        const page = args.page || 1;
        const limit = args.limit || 10;
        const offset = (page - 1) * limit;

        const query = await model.findAndCountAll({
            limit,
            offset,
            where: filter,
            distinct,
            ...options
        });

        const data = await Pagination.transform(query.rows, transformMap);

        return {
            data,
            pagination: paginationHelper(page, limit, query.count)
        };
    }

    static async transform(data, transformMap) {
        return data.map(row => {
            let transformedRow = { ...row.get() };

            for (const [key, transformFn] of Object.entries(transformMap)) {
                if (typeof transformFn === 'function') {
                    if (key === 'remove') {
                        transformFn.forEach(k => delete transformedRow[k]);
                    } else {
                        transformedRow[key] = transformFn(transformedRow);
                    }
                }
            }

            return transformedRow;
        });
    }
}
