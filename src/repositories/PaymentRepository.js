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
import { query } from "express";

export default class PaymentRepository {
  static async FindBill(search) {
    try {
        const { faskesUuid } = Context.get(CTX_AUTHOR);
        
        const bills = await db('bills as b')
            .leftJoin('patients as p', 'b.patient_uuid', 'p.uuid')
            .select(
                'b.uuid',
                'b.name as patient_name',
                'b.invoice_code',
                'b.bill_code',
                'b.grand_total',
                'b.patient_uuid',
                'b.close_bill',
                db.raw(`(SELECT SUM(ph.amount) FROM payment_history ph WHERE ph.bill_uuid = b.uuid) as total_paid`)
            )
            .where('b.faskes_uuid', faskesUuid)
            .where('b.close_bill', false)
            .andWhere(function () {
                this.where('p.no_rm', 'ilike', `%${search}%`)
                    .orWhere('b.invoice_code', 'ilike', `%${search}%`)
                    .orWhere('b.bill_code', 'ilike', `%${search}%`)
                    .orWhere('b.name', 'ilike', `%${search}%`);
            });

        bills.forEach(bill => {
            const totalPaid = parseFloat(bill.total_paid) || 0;
            const grandTotal = parseFloat(bill.grand_total) || 0;
            bill.paid = totalPaid >= grandTotal;
        });

        return bills;

    } catch (error) {
        throw error;
    }
  }

  static async _getBillDetails(uuid) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);

    const checkIfFindIsMerge = await db("bills as b")
      .where("b.uuid", uuid)
      .select("b.merge_with")
      .where("b.faskes_uuid", faskesUuid)
      .first();
    
    if (!checkIfFindIsMerge) throw new NotfoundException("Bill not found");
    if (checkIfFindIsMerge.merge_with) throw new CantProcessDataException("Bill Was Merged with another bill");

    const bill = await db("bills as b")
      .leftJoin("patients as p", "b.patient_uuid", "p.uuid")
      .leftJoin("service_bill as sb", "sb.bill_uuid", "b.uuid")
      .leftJoin("bill_item as bi", "bi.service_bill_uuid", "sb.uuid")
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
        db.raw(`(SELECT SUM(ph.amount) FROM payment_history ph WHERE ph.bill_uuid = b.uuid) as total_paid`),
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
        acc.total_paid = (acc.total_paid || 0) + (parseFloat(b.total_paid) || 0);

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

      finalBill.grand_total = finalBill.sub_total + finalBill.ppn + finalBill.admin_fee;

      const totalPaid = parseFloat(finalBill.total_paid) || 0;
      const grandTotal = parseFloat(finalBill.grand_total) || 0;
      finalBill.paid = totalPaid >= grandTotal;

      finalBill._rawBillResult = bill;

      return finalBill;
  }

  static async GetDetailBill(uuid) {
    try {
      const finalBill = await this._getBillDetails(uuid);

      const service_bill = await db("service_bill as sb")
        .leftJoin("bills as b", "sb.bill_uuid", "b.uuid")
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
            finalBill._rawBillResult.map((b) => b.uuid)
          );
        })
        .whereNull("sb.deleted_at");

        delete finalBill._rawBillResult;

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
      const sbExists = !!(await db("service_bill as sb").where("sb.uuid", uuid).where("sb.faskes_uuid", faskesUuid).first());
      if (!sbExists) throw new NotfoundException("Service Bill not found");

      const items = await db("bill_item as bi")
        .where("bi.service_bill_uuid", uuid)
        .select(
          'bi.uuid',
          'bi.item_name',
          'bi.qty',
          'bi.price',
          'bi.price_item',
          'bi.service_fee',
          'bi.category_code',
          'bi.additional_field',
          'bi.date_used'
        );

      const groupedResult = {
        tindakan: { list: [], total: 0 },
        penunjang: { list: [], total: 0 },
        obat: { list: [], total: 0 },
        alkes: { list: [], total: 0 },
        ruangan: { list: [], total: 0 }
      };
      
      let totalKeseluruhan = 0;

      items.forEach(item => {
        const newItem = {
          uuid: item.uuid,
          dateUsed: item.date_used,
          itemName: item.item_name,
          qty: item.qty,
          price: item.price,
          serviceFee: item.service_fee,
          additionalField: item.additional_field
        };

        const itemTotal = (item.price * item.qty) + (item.service_fee || 0);
        totalKeseluruhan += itemTotal;

        switch (item.category_code) {
          case '1':
            groupedResult.tindakan.list.push(newItem);
            groupedResult.tindakan.total += itemTotal;
            break;
          case '2':
            groupedResult.obat.list.push(newItem);
            groupedResult.obat.total += itemTotal;
            break;
          case '3':
            groupedResult.alkes.list.push(newItem);
            groupedResult.alkes.total += itemTotal;
            break;
          case '4':
            groupedResult.ruangan.list.push(newItem);
            groupedResult.ruangan.total += itemTotal;
            break;
          case '5':
            groupedResult.penunjang.list.push(newItem);
            groupedResult.penunjang.total += itemTotal;
            break;
        }
      });

      return {
        item: groupedResult,
        total: totalKeseluruhan
      };
    } catch (error) {
      throw error;
    }
  }

  static async getAllDetailBillItem(uuid) {
    try {
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      const bill = await db("bills as b")
        .where("b.uuid", uuid)
        .where("b.faskes_uuid", faskesUuid)
        .select("b.uuid", "b.patient_uuid", "b.name as patient_name")
        .first();

      if (!bill) throw new NotfoundException("Bill not found");

      let patient = {
        external: true,
        patient_name: bill.patient_name,
      };

      if (bill.patient_uuid) {
        patient = await db("patients as p")
          .where("p.uuid", bill.patient_uuid)
          .leftJoin("birth_details as bd", "p.birth_detail_uuid", "bd.uuid")
          .leftJoin("addresses as a", "p.address_uuid", "a.uuid")
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
        sb.items = (await this.GetDetailBillItem(sb.uuid));
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
        .leftJoin("cashier_report as cr", "ph.kasir_uuid", "cr.uuid")
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
    try {
      const { faskesUuid } = Context.get(CTX_AUTHOR);

      const filterChip = {
        IGD: ["IGD"],
        RI: ["RI"],
        RJ: ["RJ"],
        APS: ["OTC", "LAB", "FISIO"],
      };

      const convertPayment = (paymentMethod) => {
        return paymentMethod === 'ASURANSI';
      };

      const query = db('bills as b')
        .leftJoin('patients as p', 'b.patient_uuid', 'p.uuid')
        .select(
          'b.uuid',
          'b.name as patient_name',
          'b.invoice_code',
          'b.bill_code',
          'b.grand_total',
          'b.patient_uuid',
          'b.status as is_paid',
          db.raw(`(SELECT STRING_AGG(DISTINCT sb.practitioner_name, ', ') FROM service_bill sb WHERE sb.bill_uuid = b.uuid) as practitioner_name`),
          db.raw(`(SELECT STRING_AGG(DISTINCT sb.type, ', ') FROM service_bill sb WHERE sb.bill_uuid = b.uuid) as service_type`)
        )
        .where('b.faskes_uuid', faskesUuid)
        .where('b.close_bill', true);

      if (params.search) {
        query.andWhere(function () {
          this.where('b.name', 'ilike', `%${params.search}%`)
            .orWhere('p.no_rm', 'ilike', `%${params.search}%`)
            .orWhere('b.invoice_code', 'ilike', `%${params.search}%`);
        });
      }

      if (params.status === 'LUNAS') {
        query.where('b.status', true);
      } else if (params.status === 'PIUTANG') {
        query.where('b.status', false);
      }

      if (params.start_date && params.end_date) {
        query.whereBetween('b.updated_at', [params.start_date, params.end_date]);
      }

      if (params.filter_type && filterChip[params.filter_type]) {
        query.whereExists(function() {
            this.select(1)
                .from('service_bill as sb')
                .whereRaw('sb.bill_uuid = b.uuid')
                .whereIn('sb.type', filterChip[params.filter_type]);
        });
      }

      if (params.filter_payment) {
        query.whereExists(function() {
            this.select(1)
                .from('service_bill as sb')
                .whereRaw('sb.bill_uuid = b.uuid')
                .where('sb.with_insurance', convertPayment(params.filter_payment));
        });
      }
      return await KnexPagination.init(query, params);
    } catch (error) {
      throw error;
    }
  }

  static async GetTotalBill(uuid) {
    try {
      const finalBill = await this._getBillDetails(uuid);
      delete finalBill._rawBillResult;
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
      const history = (await this.GetPaymentHistory(uuid)).payment_history;

      const totalPayment = history.reduce((acc, row) => {
        return acc + (parseFloat(row.amount) || 0);
      }, 0);

      const epsilon = 0.001; 
      if (totalPayment >= (bill.grand_total - epsilon) || bill.payment_status) {
          throw new BadRequestException("Bill already paid");
      }

      let updatedPaymentStatus = false;
      if ((totalPayment + data.amount) >= (bill.grand_total - epsilon)) {
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
