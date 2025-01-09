import dotenv from 'dotenv';
import moment from "moment";
import {Context} from "../middlewares/context.js";
import {CTX_AUTHOR} from "../constants/context-constant.js";
import BadRequestException from "../exceptions/bad-request-exception.js";

dotenv.config();

const paginationHelper = (page, limit, total) => {
    const total_page = Math.ceil(total / limit);
    const next = page < total_page ? page + 1 : null;
    const prev = page > 1 ? page - 1 : null;
    return {
        page: parseInt(page),
        page_size: parseInt(limit),
        total_page,
        total_data: total,
        next_page: next,
        prev_page: prev
    };
}


const calculateVoucher = ({
                              amount,
                              type,
                              value
                          }) => {
    type = type.toLowerCase();
    const AVAIL_TYPE = ['persentase', 'potongan'];
    if (!AVAIL_TYPE.includes(type)) throw new BadRequestException('Type is not valid');

    if (type === 'persentase') {
        return Math.max(0, amount - (amount * value / 100));
    } else {
        return Math.max(0, amount - value);
    }
}

const calculateDiscount = ({
                               amount,
                               discount = 0
                           }) => {
    if (typeof amount !== 'number' || amount < 0) {
        throw new Error('Amount harus berupa angka positif.');
    }
    if (typeof discount !== 'number' || discount < 0 || discount > 100) {
        throw new Error('Discount harus berupa angka antara 0 hingga 100.');
    }

    const discountAmount = (amount * discount) / 100;
    return Math.max(0, amount - discountAmount);
};

export {
    paginationHelper,
    calculateVoucher,
    calculateDiscount
}