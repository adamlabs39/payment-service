import VoucherModel from "../models/voucher-model.js";
import {Context} from "../middlewares/context.js";
import {CTX_AUTHOR} from "../constants/context-constant.js";
import NotfoundException from "../exceptions/notfound-exception.js";

export default class VoucherRepository {
    static async CheckValidVoucher(code){
        try{
            const { faskesUuid } = Context.get(CTX_AUTHOR);
            const data = await VoucherModel.findOne({
                where:{
                     code,
                    faskes_uuid: faskesUuid
                },
                attributes: ['uuid', 'qty', 'name', 'code', 'start_date', 'end_date', 'type', 'value']
            })
            if(!data) throw new NotfoundException('Voucher not found');
            return data;
        }catch (error) {
            throw error;
        }
    }
}