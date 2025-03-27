import db from "../configs/knex-config.js";
import { Context } from "../middlewares/context.js";
import { CTX_AUTHOR } from "../constants/context-constant.js";
import NotfoundException from "../exceptions/notfound-exception.js";
import CantProcessDataException from "../exceptions/CantProcessDataException.js";
import VoucherRepository from "./VoucherRepository.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { calculateDiscount, calculateVoucher } from "../helpers/utility.js";
import CashierRepository from "./CashierRepository.js";
import { uuidv7 } from "uuidv7";
import moment from "moment";
export default class PaymentRepository {
  static async FindBill(search) {
    try {
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      return await db('bills as b')
          .leftJoin('patients as p', db.raw('b.patient_uuid'), 'p.uuid')
          .select(
              'b.uuid',
              'b.name as patient_name',
              'b.invoice_code',
              'b.bill_code',
              'b.grand_total',
              'b.patient_uuid',
              db.raw(`
                  CASE
                      WHEN b.merge_type = 1 THEN 'family_bill'
                      WHEN b.merge_type = 2 THEN 'previous_bill'
                      ELSE null
                  END as merged_bill
              `),
          )
          .where('b.faskes_uuid', faskesUuid)
          .where('b.status', 0)
          .andWhere(function () {
              this.where('p.no_rm', 'like', `%${search}%`)
                  .orWhere('b.invoice_code', 'like', `%${search}%`)
                  .orWhere('b.bill_code', 'like', `%${search}%`);
          });
    } catch (error) {
      throw error;
    }
  }

  static async GetDetailBill(uuid) {
    try {
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      const checkIfFindIsMerge = await db("bills as b").where("b.uuid", uuid).select("b.merge_with").where("b.faskes_uuid", faskesUuid).first();
      if (!checkIfFindIsMerge) throw new NotfoundException("Bill not found");
      if (checkIfFindIsMerge.merge_with) throw new CantProcessDataException("Bill Was Merged with another bill");

      const bill = await db("bills as b")
        .leftJoin("patients as p", db.raw("b.patient_uuid::uuid"), "p.uuid")
        .leftJoin("service_bill as sb", db.raw("sb.bill_uuid::uuid"), "b.uuid")
        .leftJoin("bill_item as bi", db.raw("bi.service_bill_uuid::uuid"), "sb.uuid")
        .select(
          "b.uuid",
          "b.name as patient_name",
          "b.invoice_code",
          "b.bill_code",
          "b.patient_uuid",
          "p.gender",
          "b.merge_with",
          "b.grand_total",
          "b.sub_total",
          "b.ppn",
          "b.admin_fee",
          "b.voucher_code",
          "b.voucher_value",
          "b.voucher_type",
          "b.close_bill",
          "b.discount",
          db.raw(`SUM(CASE WHEN bi.category_code = '1' THEN bi.price * bi.qty ELSE 0 END) AS total_tindakan`),
          db.raw(`SUM(CASE WHEN bi.category_code = '2' THEN bi.price * bi.qty + bi.service_fee ELSE 0 END) AS total_obat`),
          db.raw(`SUM(CASE WHEN bi.category_code = '3' THEN bi.price * bi.qty ELSE 0 END) AS total_alkes`),
          db.raw(`SUM(CASE WHEN bi.category_code = '4' THEN bi.price * bi.qty ELSE 0 END) AS total_ruangan`),
          db.raw(`SUM(CASE WHEN bi.category_code = '5' THEN bi.price * bi.qty ELSE 0 END) AS total_penunjang`)
        )
        .where(function () {
          this.where("b.uuid", uuid).orWhere("b.merge_with", uuid);
        })
        .andWhere("b.faskes_uuid", faskesUuid)
        .whereNull("b.deleted_at")
        .whereNull("sb.deleted_at")
        .whereNull("bi.deleted_at")
        .groupBy(
          "b.uuid",
          "p.gender",
          "b.name",
          "b.invoice_code",
          "b.bill_code",
          "b.patient_uuid",
          "b.grand_total",
          "b.sub_total",
          "b.ppn",
          "b.admin_fee",
          "b.voucher_code",
          "b.voucher_value",
          "b.voucher_type",
          "b.close_bill"
        );

      if (!bill.length) throw new NotfoundException("Bill not found");

      const finalBill = bill.reduce((acc, b, index) => {
        acc.uuid = acc.uuid || b.uuid;
        acc.patient_name = acc.patient_name || b.patient_name;
        acc.invoice_code = acc.invoice_code || b.invoice_code;
        acc.bill_code = acc.bill_code || b.bill_code;
        acc.patient_uuid = acc.patient_uuid || b.patient_uuid;
        acc.gender = acc.gender || b.gender;
        acc.ppn = acc.ppn || b.ppn;
        acc.voucher_code = acc.voucher_code || b.voucher_code;
        acc.voucher_value = acc.voucher_value || b.voucher_value;
        acc.voucher_type = acc.voucher_type || b.voucher_type;
        acc.discount = acc.discount || b.discount;
        acc.close_bill = acc.close_bill || b.close_bill;

        if (index === 0) {
          acc.admin_fee = b.admin_fee;
        }

        acc.sub_total = (acc.sub_total || 0) + b.sub_total;
        acc.total_tindakan = (acc.total_tindakan || 0) + (b.total_tindakan || 0);
        acc.total_obat = (acc.total_obat || 0) + (b.total_obat || 0);
        acc.total_alkes = (acc.total_alkes || 0) + (b.total_alkes || 0);
        acc.total_ruangan = (acc.total_ruangan || 0) + (b.total_ruangan || 0);
        acc.total_penunjang = (acc.total_penunjang || 0) + (b.total_penunjang || 0);

        return acc;
      }, {});

      if (finalBill.voucher_code && finalBill.voucher_value && finalBill.voucher_type) {
        finalBill.sub_total = calculateVoucher({
          amount: finalBill.sub_total,
          type: finalBill.voucher_type,
          value: finalBill.voucher_value,
        });
      }
      if (finalBill.discount && finalBill.discount > 0) {
        finalBill.sub_total = calculateDiscount({
          amount: finalBill.sub_total,
          discount: finalBill.discount,
        });
      }

      finalBill.grand_total = finalBill.sub_total + finalBill.sub_total * (finalBill.ppn / 100) + finalBill.admin_fee;

      const service_bill = await db("service_bill as sb")
        .leftJoin("bills as b", db.raw("sb.bill_uuid::uuid"), "b.uuid")
        .select(
          "sb.uuid",
          "sb.practitioner_name",
          "sb.service_name",
          "sb.service_code",
          "sb.layanan_uuid",
          "sb.already_claim",
          "sb.with_insurance",
          "sb.type",
          "sb.date",
          db.raw(`CASE WHEN sb.bill_uuid = ? THEN FALSE ELSE TRUE END as is_merged`, [uuid]),
          "b.merge_type"
        )
        .where(function () {
          this.where("sb.bill_uuid", finalBill.uuid).orWhereIn(
            "sb.bill_uuid",
            bill.map((b) => b.uuid)
          );
        })
        .whereNull("sb.deleted_at");

      return {
        ...finalBill,
        service_bill,
      };
    } catch (error) {
      throw error;
    }
  }

  static async GetDetailBillItem(uuid) {
    try {
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      const sb = !!(await db("service_bill as sb").where("sb.uuid", uuid).where("sb.faskes_uuid", faskesUuid).first());

      if (!sb) throw new NotfoundException("Bill not found");

      const groupedItems = await db("bill_item as bi")
        .where("bi.service_bill_uuid", uuid)
        .select(
          db.raw(`
                    CASE
                        WHEN bi.category_code = '1' THEN 'tindakan'
                        WHEN bi.category_code = '2' THEN 'obat'
                        WHEN bi.category_code = '3' THEN 'alkes'
                        WHEN bi.category_code = '4' THEN 'ruangan'
                        WHEN bi.category_code = '5' THEN 'penunjang'
                        ELSE 'unknown'
                    END AS category
                `)
        )
        .select(
          db.raw(`
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'date_used', bi.date_used,
                            'item_name', bi.item_name,
                            'qty', bi.qty,
                            'price', bi.price,
                            'service_fee', bi.service_fee,
                            'addtional_field', bi.addtional_field
                        )
                    ) AS items
                `)
        )
        .groupBy("category");
      let result = {};
      result.item = groupedItems.reduce((acc, row) => {
        acc[row.category] = row.items;
        return acc;
      }, {});
      result.total = 0;
      groupedItems.forEach((row) => {
        const total = row.items.reduce((acc, item) => {
          acc += item.price * item.qty + item.service_fee;
          return acc;
        }, 0);
        result.total += total;
      });

      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getAllDetailBillItem(uuid) {
    try {
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      const bill = await db("bills as b").where("b.uuid", uuid).where("b.faskes_uuid", faskesUuid).select("b.uuid", "b.patient_uuid", "b.name as patient_name").first();
      if (!bill) throw new NotfoundException("Bill not found");
      let patient = {
        external: true,
        patient_name: bill.patient_name,
      };
      if (bill.patient_uuid) {
        patient = await db("patients as p")
          .where("p.uuid", bill.patient_uuid)
          .leftJoin("birth_details as bd", db.raw("p.birth_detail_uuid::uuid"), "bd.uuid")
          .leftJoin("addresses as a", db.raw("p.address_uuid"), "a.uuid")
          .select(
            "p.name as patient_name",
            "p.no_rm",
            "p.no_identity",
            "bd.birth_date",
            "bd.age_year",
            "bd.age_month",
            "bd.age_day",
            "a.prov",
            "a.city",
            "a.district",
            "a.rt",
            "a.rw",
            "a.village",
            "a.postal_code",
            "a.country"
          )
          .first();

        patient.external = false;
      }

      const billDetail = await this.GetDetailBill(uuid);
      const serviceBill = billDetail.service_bill.map(async (sb) => {
        sb.items = (await this.GetDetailBillItem(sb.uuid)).item;
        return sb;
      });

      billDetail.service_bill = await Promise.all(serviceBill);

      return {
        patient,
        bill: billDetail,
      };
    } catch (error) {
      throw error;
    }
  }

  static async ApplyVoucher(uuid, data) {
    try {
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      const { code } = data;
      const bill = await db("bills as b").where("b.faskes_uuid", faskesUuid).where("b.uuid", uuid).first();
      if (!bill) throw new NotfoundException("Bill not found");
      if (bill.voucher_code) throw new BadRequestException("This bill already has a voucher");

      const v = await VoucherRepository.CheckValidVoucher(code);
      const billUsedVoucher = await this.CountBillUsedVoucherCode(code);
      if (billUsedVoucher >= v.qty) throw new BadRequestException("Voucher has been used up");

      await db.transaction(async (trx) => {
        await trx("bills as b").where("b.faskes_uuid", faskesUuid).where("b.uuid", uuid).update({
          voucher_code: v.code,
          voucher_value: v.value,
          voucher_type: v.type,
        });
      });
      return true;
    } catch (error) {
      throw error;
    }
  }

  static async ApplyDiscount(uuid, data) {
    try {
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      const { value } = data;

      const bill = await db("bills as b").where("b.faskes_uuid", faskesUuid).where("b.uuid", uuid).first();

      if (!bill) throw new NotfoundException("Bill not found");
      if (bill.discount) throw new BadRequestException("This bill already has a discount");

      await db.transaction(async (trx) => {
        await trx("bills as b").where("b.faskes_uuid", faskesUuid).where("b.uuid", uuid).update({
          discount: value,
        });
      });
      return true;
    } catch (error) {
      throw error;
    }
  }

  static async CountBillUsedVoucherCode(voucherCode) {
    try {
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      const count = await db("bills as b").where("b.faskes_uuid", faskesUuid).where("b.voucher_code", voucherCode).count("* as total").first();
      return count.total;
    } catch (error) {
      throw error;
    }
  }

  static async CloseBill(uuid) {
    try {
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      const bill = await db("bills as b").where("b.faskes_uuid", faskesUuid).where("b.uuid", uuid).first();
      if (!bill) throw new NotfoundException("Bill not found");
      if (bill.close_bill) throw new BadRequestException("Bill already closed");

      await db.transaction(async (trx) => {
        await trx("bills as b").where("b.faskes_uuid", faskesUuid).where("b.uuid", uuid).update({
          close_bill: true,
        });
      });
      return true;
    } catch (error) {
      throw error;
    }
  }

  static async GetPaymentHistory(bill_uuid) {
    try {
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      const bill = await this.GetTotalBill(bill_uuid);
      const history = await db("payment_history as ph")
        .leftJoin("cashier_report as cr", db.raw("ph.kasir_uuid::uuid"), "cr.uuid")
        .select("ph.payment_type", "ph.payment_method", "ph.information", "ph.note", "ph.amount", "ph.created_at", "cr.nama_kasir", "cr.shift_type")
        .where("ph.bill_uuid", bill_uuid)
        .where("ph.faskes_uuid", faskesUuid);
      const totalPaid = history.reduce((acc, row) => {
        acc += row.amount;
        return acc;
      }, 0);
      const totalBill = bill.grand_total;
      return {
        total_paid: totalPaid,
        total_bill: totalBill,
        is_paid: totalPaid >= totalBill,
        debt: totalBill - totalPaid,
        payment_history: [...history],
      };
    } catch (error) {
      throw error;
    }
  }

  static async getClosedBill(params) {
    const filterChip = {
      IGD: ["IGD"],
      RI: ["RI"],
      RJ: ["RJ"],
      APS: ["OTC", "LAB", "FISIO"],
    };

    const convertPayment = (code) => {
      return code === 2 ? "insurance" : "cash";
    };

    const { faskesUuid } = Context.get(CTX_AUTHOR);

    const serviceBill = await db("service_bill as sb")
      .leftJoin("bills as b", db.raw("sb.bill_uuid::uuid"), "b.uuid")
      .select(
        "sb.uuid",
        "sb.practitioner_name",
        "sb.service_name",
        "sb.service_code as transaction_code",
        "sb.type as service_type",
        "b.invoice_code",
        "b.bill_code as service_bill_code",
        "b.date as service_date",
        "b.patient_uuid",
        "b.name as patient_name",
        "b.status as payment_status",
        db.raw(`CASE WHEN sb.with_insurance = TRUE THEN 2 ELSE 1 END as payment_method`)
      )
      .where("b.faskes_uuid", faskesUuid)
      .whereNull("sb.deleted_at");

    if (params.search) {
      serviceBill.where(function () {
        this.where("b.name", "like", `%${params.search}%`).orWhere("b.invoice_code", "like", `%${params.search}%`);
      });
    }

    if (params.filter_type) {
      serviceBill.whereIn("sb.type", filterChip[params.filter_type]);
    }

    if (params.filter_payment) {
      serviceBill.where("sb.with_insurance", convertPayment(params.filter_payment));
    }
  }

  static async GetTotalBill(uuid) {
    try {
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      const checkIfFindIsMerge = await db("bills as b").where("b.uuid", uuid).select("b.merge_with").where("b.faskes_uuid", faskesUuid).first();
      if (!checkIfFindIsMerge) throw new NotfoundException("Bill not found");
      if (checkIfFindIsMerge.merge_with) throw new CantProcessDataException("Bill Was Merged with another bill");

      const bill = await db("bills as b")
        .leftJoin("patients as p", db.raw("b.patient_uuid::uuid"), "p.uuid")
        .leftJoin("service_bill as sb", db.raw("sb.bill_uuid::uuid"), "b.uuid")
        .leftJoin("bill_item as bi", db.raw("bi.service_bill_uuid::uuid"), "sb.uuid")
        .select(
          "b.uuid",
          "b.name as patient_name",
          "b.invoice_code",
          "b.bill_code",
          "b.patient_uuid",
          "p.gender",
          "b.merge_with",
          "b.grand_total",
          "b.sub_total",
          "b.ppn",
          "b.admin_fee",
          "b.voucher_code",
          "b.voucher_value",
          "b.voucher_type",
          "b.close_bill",
          "b.discount",
          "b.status as payment_status",
          db.raw(`SUM(CASE WHEN bi.category_code = '1' THEN bi.price * bi.qty ELSE 0 END) AS total_tindakan`),
          db.raw(`SUM(CASE WHEN bi.category_code = '2' THEN bi.price * bi.qty + bi.service_fee ELSE 0 END) AS total_obat`),
          db.raw(`SUM(CASE WHEN bi.category_code = '3' THEN bi.price * bi.qty ELSE 0 END) AS total_alkes`),
          db.raw(`SUM(CASE WHEN bi.category_code = '4' THEN bi.price * bi.qty ELSE 0 END) AS total_ruangan`),
          db.raw(`SUM(CASE WHEN bi.category_code = '5' THEN bi.price * bi.qty ELSE 0 END) AS total_penunjang`)
        )
        .where(function () {
          this.where("b.uuid", uuid).orWhere("b.merge_with", uuid);
        })
        .andWhere("b.faskes_uuid", faskesUuid)
        .whereNull("b.deleted_at")
        .whereNull("sb.deleted_at")
        .whereNull("bi.deleted_at")
        .groupBy(
          "b.uuid",
          "p.gender",
          "b.name",
          "b.invoice_code",
          "b.bill_code",
          "b.patient_uuid",
          "b.grand_total",
          "b.sub_total",
          "b.ppn",
          "b.admin_fee",
          "b.voucher_code",
          "b.voucher_value",
          "b.voucher_type",
          "b.close_bill"
        );

      if (!bill.length) throw new NotfoundException("Bill not found");

      const finalBill = bill.reduce((acc, b, index) => {
        acc.uuid = acc.uuid || b.uuid;
        acc.patient_name = acc.patient_name || b.patient_name;
        acc.invoice_code = acc.invoice_code || b.invoice_code;
        acc.bill_code = acc.bill_code || b.bill_code;
        acc.patient_uuid = acc.patient_uuid || b.patient_uuid;
        acc.gender = acc.gender || b.gender;
        acc.ppn = acc.ppn || b.ppn;
        acc.voucher_code = acc.voucher_code || b.voucher_code;
        acc.voucher_value = acc.voucher_value || b.voucher_value;
        acc.voucher_type = acc.voucher_type || b.voucher_type;
        acc.discount = acc.discount || b.discount;
        acc.close_bill = acc.close_bill || b.close_bill;

        if (index === 0) {
          acc.admin_fee = b.admin_fee;
        }

        acc.sub_total = (acc.sub_total || 0) + b.sub_total;
        acc.total_tindakan = (acc.total_tindakan || 0) + (b.total_tindakan || 0);
        acc.total_obat = (acc.total_obat || 0) + (b.total_obat || 0);
        acc.total_alkes = (acc.total_alkes || 0) + (b.total_alkes || 0);
        acc.total_ruangan = (acc.total_ruangan || 0) + (b.total_ruangan || 0);
        acc.total_penunjang = (acc.total_penunjang || 0) + (b.total_penunjang || 0);
        acc.payment_status = b.payment_status;
        return acc;
      }, {});

      if (finalBill.voucher_code && finalBill.voucher_value && finalBill.voucher_type) {
        finalBill.sub_total = calculateVoucher({
          amount: finalBill.sub_total,
          type: finalBill.voucher_type,
          value: finalBill.voucher_value,
        });
      }
      if (finalBill.discount && finalBill.discount > 0) {
        finalBill.sub_total = calculateDiscount({
          amount: finalBill.sub_total,
          discount: finalBill.discount,
        });
      }

      finalBill.grand_total = finalBill.sub_total + finalBill.sub_total * (finalBill.ppn / 100) + finalBill.admin_fee;

      return finalBill;
    } catch (error) {
      throw error;
    }
  }

  static async PaymentBill(uuid, data) {
    try {
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      const getCashier = await CashierRepository.CheckCashierShift();
      if (!getCashier) throw new BadRequestException("Cashier is not opened");
      const bill = await this.GetTotalBill(uuid);
      let totalPayment = (await this.GetPaymentHistory(uuid)).payment_history;

      totalPayment = totalPayment.reduce((acc, row) => {
        acc += row.amount;
        return acc;
      }, 0);

      if (totalPayment >= bill.grand_total || bill.payment_status) throw new BadRequestException("Bill already paid");
      let updatedPaymentStatus = false;
      if (totalPayment + data.amount >= bill.grand_total) {
        updatedPaymentStatus = true;
      }
      await db.transaction(async (trx) => {
        await trx("payment_history").insert({
          uuid: uuidv7(),
          faskes_uuid: faskesUuid,
          bill_uuid: uuid,
          kasir_uuid: getCashier.uuid,
          amount: data.amount,
          payment_type: data.payment_type,
          payment_method: data.payment_method,
          information: data.information,
          note: data.note,
          created_at: moment().unix(),
          updated_at: moment().unix(),
        });

        if (updatedPaymentStatus) {
          await trx("bills")
            .where(function () {
              this.where("uuid", uuid).orWhere("merge_with", uuid);
            })
            .update({
              status: true,
            });
        }
      });
      return true;
    } catch (error) {
      throw error;
    }
  }
}
