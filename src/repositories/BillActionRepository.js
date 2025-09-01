import db from "../configs/knex-config.js";
import { Context } from "../middlewares/context.js";
import { CTX_AUTHOR } from "../constants/context-constant.js";
import NotfoundException from "../exceptions/notfound-exception.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import VoucherRepository from "./VoucherRepository.js";
import BillQueryRepository from "./BillQueryRepository.js"; 
import moment from "moment";

export default class BillActionRepository {
    static async ApplyVoucher(uuid, data) {
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      const { code } = data;
      
      const bill = await BillQueryRepository.GetTotalBill(uuid);
      if (!bill) throw new NotfoundException("Bill tidak ditemukan");
      if (bill.voucher_code) throw new BadRequestException("Tagihan sudah memiliki voucher");

      const currentBillTotal = bill.sub_total + bill.ppn + bill.admin_fee;
      const v = await VoucherRepository.validateAndGetVoucher(code, currentBillTotal);
      
      const tempBillData = { ...bill, voucher_code: v.code, voucher_value: v.value, voucher_type: v.type };
      const newGrandTotal = BillQueryRepository._calculateBillTotals(tempBillData);

      await db("bills").where({ uuid, faskes_uuid: faskesUuid }).update({
        voucher_code: v.code,
        voucher_value: v.value,
        voucher_type: v.type,
        grand_total: newGrandTotal,
        updated_at: moment().unix()
      });
      return true;
  }
  
  static async ApplyDiscount(uuid, data) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const { value } = data;

    const bill = await BillQueryRepository.GetTotalBill(uuid);
    if (!bill) throw new NotfoundException("Bill tidak ditemukan");
    if (bill.discount) throw new BadRequestException("Tagihan sudah memiliki diskon");

    const tempBillData = { ...bill, discount: value };
    const newGrandTotal = BillQueryRepository._calculateBillTotals(tempBillData);

    await db("bills").where({ uuid, faskes_uuid: faskesUuid }).update({
      discount: value,
      grand_total: newGrandTotal,
      updated_at: moment().unix()
    });
    return true;
  }
  
  static async CloseBill(uuid) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const bill = await db("bills as b").where({ "b.uuid": uuid, "b.faskes_uuid": faskesUuid }).first();
    if (!bill) throw new NotfoundException("Bill tidak ditemukan");
    if (bill.close_bill) throw new BadRequestException("Tagihan sudah ditutup");
    await db("bills").where({ uuid, faskes_uuid: faskesUuid }).update({
      close_bill: true,
      updated_at: moment().unix()
    });
    return true;
  }
}