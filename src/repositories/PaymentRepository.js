import db from "../configs/knex-config.js";
import { Context } from "../middlewares/context.js";
import { CTX_AUTHOR } from "../constants/context-constant.js";
import {KnexPagination} from "../helpers/pagination.js";
import NotfoundException from "../exceptions/notfound-exception.js";
import CantProcessDataException from "../exceptions/CantProcessDataException.js";
import VoucherRepository from "./VoucherRepository.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { calculateDiscount, calculateVoucher } from "../helpers/utility.js";
import CashierRepository from "./CashierRepository.js";
import { uuidv7 } from "uuidv7";
import moment from "moment";

export default class PaymentRepository {
  static _calculateBillTotals(billData) {
    const subTotal = parseFloat(billData.sub_total) || 0;
    const ppn = parseFloat(billData.ppn) || 0;
    const adminFee = parseFloat(billData.admin_fee) || 0;
    const discount = parseFloat(billData.discount) || 0;
    const voucherValue = billData.voucher_value;
    const voucherType = billData.voucher_type;
    
    let total = subTotal + ppn + adminFee;
    
    if (voucherType && voucherValue) {
      total = calculateVoucher({
        amount: total,
        type: voucherType,
        value: voucherValue
      });
    }
    
    if (discount > 0) {
      total = calculateDiscount({
        amount: total,
        discount: discount
      });
    }
    return total;
  }
  
  static async _getBillDetails(uuid) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);

    // Check tagihan apakah sudah digabung dengan tagihan lain
    const checkIfFindIsMerge = await db("bills as b")
      .where("b.uuid", uuid)
      .select("b.merge_with")
      .where("b.faskes_uuid", faskesUuid)
      .first();
    
    if (!checkIfFindIsMerge) throw new NotfoundException("Bill not found");
    if (checkIfFindIsMerge.merge_with) throw new CantProcessDataException("Bill Was Merged with another bill");

    // Query untuk mengambil semua data tagihan termasuk yang digabung
    const bill = await db("bills as b")
      .leftJoin("patients as p", "b.patient_uuid", "p.uuid")
      .leftJoin("service_bill as sb", "sb.bill_uuid", "b.uuid")
      .leftJoin("bill_item as bi", "bi.service_bill_uuid", "sb.uuid")
      .select(
        "b.uuid", "b.name as patient_name", "b.invoice_code", "b.bill_code",
        "b.patient_uuid", "p.gender", "b.merge_with",
        "b.grand_total", "b.sub_total", "b.ppn", "b.admin_fee", 
        "b.voucher_code", "b.voucher_value", "b.voucher_type", 
        "b.close_bill", "b.discount",
        "b.status as payment_status",
        db.raw(`EXISTS (SELECT 1 FROM payment_history ph WHERE ph.bill_uuid = b.uuid) as is_paid`),
        db.raw(`(SELECT SUM(ph.amount) FROM payment_history ph WHERE ph.bill_uuid = b.uuid) as total_paid`),
        db.raw(`SUM(CASE WHEN bi.category_code = '1' THEN bi.price * bi.qty ELSE 0 END) AS total_tindakan`),
        db.raw(`SUM(CASE WHEN bi.category_code = '2' THEN bi.price * bi.qty + bi.service_fee ELSE 0 END) AS total_obat`),
        db.raw(`SUM(CASE WHEN bi.category_code = '3' THEN bi.price * bi.qty ELSE 0 END) AS total_alkes`),
        db.raw(`SUM(CASE WHEN bi.category_code = '4' THEN bi.price * bi.qty ELSE 0 END) AS total_ruangan`),
        db.raw(`SUM(CASE WHEN bi.category_code = '5' THEN bi.price * bi.qty ELSE 0 END) AS total_penunjang`)
      )
      .where(function() {
        this.where("b.uuid", uuid).orWhere("b.merge_with", uuid);
      })
      .andWhere("b.faskes_uuid", faskesUuid)
      .whereNull("b.deleted_at").whereNull("sb.deleted_at").whereNull("bi.deleted_at")
      .groupBy(
        "b.uuid", "p.gender", "b.name", "b.invoice_code", "b.bill_code", "b.patient_uuid",
        "b.grand_total", "b.sub_total", "b.ppn", "b.admin_fee", "b.voucher_code",
        "b.voucher_value", "b.voucher_type", "b.close_bill", "b.status"
    );
    
    if (!bill.length) throw new NotfoundException("Bill not found");

    const finalBill = bill.reduce((acc, b) => {
      // Inisialisasi properti pada iterasi pertama
      if (!acc.uuid) {
        acc.uuid = b.uuid;
        acc.patient_name = b.patient_name;
        acc.invoice_code = b.invoice_code;
        acc.bill_code = b.bill_code;
        acc.patient_uuid = b.patient_uuid;
        acc.gender = b.gender;
        acc.ppn = b.ppn;
        acc.voucher_code = b.voucher_code;
        acc.voucher_value = b.voucher_value;
        acc.voucher_type = b.voucher_type;
        acc.discount = b.discount;
        acc.close_bill = b.close_bill;
        acc.admin_fee = b.admin_fee;
        
        // Inisialisasi nilai numerik
        acc.grand_total = 0;
        acc.sub_total = 0;
        acc.total_tindakan = 0;
        acc.total_obat = 0;
        acc.total_alkes = 0;
        acc.total_ruangan = 0;
        acc.total_penunjang = 0;
        acc.total_paid = 0;
        acc.is_paid = b.is_paid;
        acc.payment_status = b.payment_status;
      }

      // Akumulasi nilai numerik dari setiap baris hasil query
      acc.grand_total += parseFloat(b.grand_total) || 0;
      acc.sub_total += parseFloat(b.sub_total) || 0;
      acc.total_tindakan += parseFloat(b.total_tindakan) || 0;
      acc.total_obat += parseFloat(b.total_obat) || 0;
      acc.total_alkes += parseFloat(b.total_alkes) || 0;
      acc.total_ruangan += parseFloat(b.total_ruangan) || 0;
      acc.total_penunjang += parseFloat(b.total_penunjang) || 0;
      acc.total_paid += parseFloat(b.total_paid) || 0;

      return acc;
    }, {});

    // Simpan hasil query mentah jika dibutuhkan di tempat lain
    finalBill._rawBillResult = bill;
    return finalBill;
  }

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
          'b.patient_uuid',
          'b.grand_total', 
          'b.status as is_paid',
          'p.no_rm',
          db.raw(`(CASE WHEN b.status = true THEN 'LUNAS' ELSE 'PIUTANG' END) as payment_status`),
        )
        .where('b.faskes_uuid', faskesUuid)
        .where('b.close_bill', false)
        .andWhere(function () {
          this.where('p.no_rm', 'ilike', `%${search}%`)
            .orWhere('b.invoice_code', 'ilike', `%${search}%`)
            .orWhere('b.bill_code', 'ilike', `%${search}%`)
            .orWhere('b.name', 'ilike', `%${search}%`);
        });

      return bills;

    } catch (error) {
        throw error;
    }
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

  static async getDetailPasienBill(uuid) {
    try {
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      const bill = await db("bills as b")
        .where("b.uuid", uuid)
        .where("b.faskes_uuid", faskesUuid)
        .select("b.uuid", "b.patient_uuid", "b.name as patient_name")
        .first();

      if (!bill) throw new NotfoundException("Bill not found");

      let patient = bill.patient_name;
      

      if (bill.patient_uuid) {
        patient = await db("patients as p")
          .where("p.uuid", bill.patient_uuid)
          .leftJoin("birth_details as bd", "p.birth_detail_uuid", "bd.uuid")
          .leftJoin("addresses as a", "p.address_uuid", "a.uuid")
          .leftJoin("bills as b", "b.patient_uuid", "p.uuid")
          .select(
            "p.name as patient_name",
            "p.no_rm",
            "p.gender",
            "p.no_identity",
            "p.identity as identity_type",
            "p.phone as no_handphone",
            "p.religion as agama",
            "bd.birth_date as tgl_lahir",
            "bd.age_year",
            "bd.age_month",
            "bd.age_day",
            "a.full_address as alamat", 
            "a.village as kelurahan_desa",
            "a.district as kecamatan",
            "a.city as kabupaten_kota",
            "a.prov as provinsi",
            "a.rt", "a.rw",
            "a.postal_code as kodepos",
            "b.status as is_paid",
            db.raw(`(
              CASE
                  WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = ? AND sb.with_insurance = true)
                  THEN 'ASURANSI'
                  ELSE 'TUNAI'
              END
            ) as payment_type`, [uuid])
          )
          .first();
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
      
      // Ambil data tagihan saat ini
      const bill = await db("bills as b").where("b.faskes_uuid", faskesUuid).where("b.uuid", uuid).first();
      if (!bill) throw new NotfoundException("Bill not found");
      if (bill.voucher_code) throw new BadRequestException("Tagihan sudah memiliki voucher");

      // Validasi voucher
      if (bill.voucher_code) {
        throw new BadRequestException("Hanya satu voucher yang dapat digunakan dalam satu transaksi");
      }

      const currentBillTotal = (bill.sub_total || 0) + (bill.ppn || 0) + (bill.admin_fee || 0);

      const v = await VoucherRepository.validateAndGetVoucher(code, currentBillTotal);
      
      const tempBillData = { 
        ...bill, 
        voucher_code: v.code, 
        voucher_value: v.value, 
        voucher_type: v.type 
      };

      const newGrandTotal = this._calculateBillTotals(tempBillData);

      // Update tagihan dengan voucher
      await db.transaction(async (trx) => {
        await trx("bills as b").where("b.faskes_uuid", faskesUuid).where("b.uuid", uuid).update({
          voucher_code: v.code,
          voucher_value: v.value,
          voucher_type: v.type,
          grand_total: newGrandTotal,
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

      // Ambil data tagihan saat ini
      const bill = await db("bills as b").where("b.faskes_uuid", faskesUuid).where("b.uuid", uuid).first();

      if (!bill) throw new NotfoundException("Bill not found");
      if (bill.discount) throw new BadRequestException("Tagihan sudah memiliki diskon");

      const tempBillData = { ...bill, discount: value };
      const newGrandTotal = this._calculateBillTotals(tempBillData);

      await db.transaction(async (trx) => {
        await trx("bills as b").where("b.faskes_uuid", faskesUuid).where("b.uuid", uuid).update({
          discount: value,
          grand_total: newGrandTotal,
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
      if (bill.close_bill) throw new BadRequestException("Tagihan sudah ditutup");

      await db.transaction(async (trx) => {
        await trx("bills as b").where("b.faskes_uuid", faskesUuid).where("b.uuid", uuid).update({
          close_bill: true,
          updated_at: moment().unix()
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

      const serviceTypeMap = {
        IGD: ["IGD"],
        RI: ["RI"],
        RJ: ["RJ"],
        APS: ["OTC", "LAB", "FISIO"],
      };

      const query = db('bills as b')
        .leftJoin('patients as p', 'b.patient_uuid', 'p.uuid')
        .leftJoin('addresses as a', 'p.address_uuid', 'a.uuid')
        .leftJoin('birth_details as bd', 'p.birth_detail_uuid', 'bd.uuid')
        .select(
          'b.uuid',
          'b.name as patient_name',
          'b.invoice_code',
          'b.bill_code',
          'b.grand_total',
          'b.patient_uuid',
          'b.status as is_paid',
          'a.full_address',
          'p.phone as no_handphone',
          'p.gender as jenis_kelamin',
          'p.no_rm',
          'bd.age_year',
          'bd.age_month',
          'bd.age_day',
          db.raw(`(
            CASE 
              WHEN 
                EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = b.uuid AND sb.with_insurance = true)
                AND
                NOT EXISTS (SELECT 1 FROM payment_history ph WHERE ph.bill_uuid = b.uuid AND ph.payment_type = 'CASH')
              THEN 'ASURANSI'
              ELSE 'TUNAI'
            END
        )as payment_type`),
          db.raw(`(SELECT STRING_AGG(DISTINCT sb.practitioner_name, ', ') FROM service_bill sb WHERE sb.bill_uuid = b.uuid) as practitioner_name`),
          db.raw(`(SELECT STRING_AGG(DISTINCT sb.type::TEXT, ', ') FROM service_bill sb WHERE sb.bill_uuid = b.uuid) as service_type`)
        )
        .where('b.faskes_uuid', faskesUuid)
        .where('b.close_bill', true);
        
      if (params.status && params.status.toUpperCase() !== 'SEMUA') {
        if (params.status.toUpperCase() === 'LUNAS') {
          query.where('b.status', true);
        } else if (params.status.toUpperCase() === 'PIUTANG') {
          query.where('b.status', false);
        }
      }

      if (params.search) {
        const searchTerm = params.search.trim();

        const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(searchTerm);
        if (isUUID) {
          query.andWhere(function() {
              this.where('b.uuid', searchTerm)
                  .orWhere('p.uuid', searchTerm);
          });
        } else {
          const searchTerms = searchTerm.split(/\s+/);
          for (const term of searchTerms) {
              query.andWhere(function() {
                  this.orWhere('b.name', 'ilike', `%${term}%`)
                      .orWhere('p.no_rm', 'ilike', `%${term}%`)
                      .orWhere('b.invoice_code', 'ilike', `%${term}%`)
                      .orWhere('b.bill_code', 'ilike', `%${term}%`)
                      .orWhere('a.full_address', 'ilike', `%${term}%`);
              });
          }
        }
      }

      if (params.start_date && params.end_date) {
        query.whereBetween('b.updated_at', [
            moment.unix(params.start_date).startOf('day').unix(),
            moment.unix(params.end_date).endOf('day').unix()
        ]);
      }

      if (params.service_type) {
        const selectedFilters = [].concat(params.service_type);
        const dbServiceTypes = selectedFilters
          .map(type => serviceTypeMap[type.toUpperCase()])
          .filter(Boolean)
          .flat();

          if (dbServiceTypes.length > 0) {
            query.whereExists(function() {
              this.select(1)
                .from('service_bill as sb')
                .whereRaw('sb.bill_uuid = b.uuid')
                .whereIn('sb.type', dbServiceTypes); 
            });
          }
      }

      if (params.payment_type) {
        const paymentType = params.payment_type.toUpperCase();

        if (paymentType === 'ASURANSI') {
          query.whereExists(function() {
              this.select(1).from('service_bill as sb').whereRaw('sb.bill_uuid = b.uuid').where('sb.with_insurance', true);
          });
          query.whereNotExists(function() {
              this.select(1).from('payment_history as ph').whereRaw('ph.bill_uuid = b.uuid').where('ph.payment_type', 'CASH');
          });
        } else if (paymentType === 'TUNAI') {
          query.whereNot(function() {
              this.whereExists(function() {
                  this.select(1).from('service_bill as sb').whereRaw('sb.bill_uuid = b.uuid').where('sb.with_insurance', true);
              }).whereNotExists(function() {
                  this.select(1).from('payment_history as ph').whereRaw('ph.bill_uuid = b.uuid').where('ph.payment_type', 'CASH');
              });
          });
        }
      }

      query.orderBy('b.updated_at', 'desc');
      return await KnexPagination.init(query, params);
    } catch (error) {
      throw error;
    }
  }

  static async getApsOtc (params) {
    try {
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      
      const serviceTypeMap = {
        APS: ['OTC', 'LAB', 'FISIO'],
        OTC: ['OTC'],
      }

      const query = db('bills as b')
      .leftJoin('patients as p', 'b.patient_uuid', 'p.uuid')
      .leftJoin('addresses as a', 'p.address_uuid', 'a.uuid')
      .select(
        'b.uuid', 'b.name as patient_name', 'b.invoice_code',
        'b.bill_code', 'b.grand_total', 'b.patient_uuid',
        'b.status as is_paid', 'a.full_address',
        db.raw(`(CASE WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = b.uuid AND sb.with_insurance = true) THEN 'ASURANSI' ELSE 'TUNAI' END) as payment_type`),
        db.raw(`(SELECT STRING_AGG(DISTINCT sb.practitioner_name, ', ') FROM service_bill sb WHERE sb.bill_uuid = b.uuid) as practitioner_name`),
        db.raw(`(SELECT STRING_AGG(DISTINCT sb.type::TEXT, ', ') FROM service_bill sb WHERE sb.bill_uuid = b.uuid) as service_type_list`)
      )
      .where('b.faskes_uuid', faskesUuid)
      .where('b.close_bill', false)
      .where('b.status', false);

      if (params.search) {
        const searchTerms = params.search.trim().split(/\s+/);
        for (const term of searchTerms) {
            query.andWhere(function() {
                this.orWhere('b.name', 'ilike', `%${term}%`)
                    .orWhere('p.no_rm', 'ilike', `%${term}%`)
                    .orWhere('a.full_address', 'ilike', `%${term}%`);
            });
        }
      }

      if (params.start_date && params.end_date) {
        query.whereBetween('b.created_at', [
            moment.unix(params.start_date).startOf('day').unix(),
            moment.unix(params.end_date).endOf('day').unix()
        ]);
      }

      if (params.filter_pelayanan && serviceTypeMap[params.filter_pelayanan.toUpperCase()]) {
        query.whereExists(function() {
            this.select(1)
                .from('service_bill as sb')
                .whereRaw('sb.bill_uuid = b.uuid')
                .whereIn('sb.type', serviceTypeMap[params.filter_pelayanan.toUpperCase()]);
        });
      }

      if (params.filter_pembayaran) {
        query.whereExists(function() {
            this.select(1)
                .from('service_bill as sb')
                .whereRaw('sb.bill_uuid = b.uuid')
                .where('sb.with_insurance', params.filter_pembayaran.toUpperCase() === 'ASURANSI');
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
      const getCashier = await CashierRepository._getActiveShift(faskesUuid);
      if (!getCashier) throw new BadRequestException("Shift kasir belum dibuka");

      const bill = await this.GetTotalBill(uuid);
      const history = (await this.GetPaymentHistory(uuid)).payment_history;

      const totalPayment = history.reduce((acc, row) => {
        return acc + (parseFloat(row.amount) || 0);
      }, 0);

      const finalGrandTotal = bill.grand_total;

      const epsilon = 0.001; 
      if (totalPayment >= (bill.grand_total - epsilon) || bill.payment_status) {
          throw new BadRequestException("Tagihan sudah lunas");
      }

      let amountToRecord = parseFloat(data.amount) || 0;
      let changeAmount = 0;
      let updatedPaymentStatus = false;

      const remainingDebt = finalGrandTotal - totalPayment;

      if (amountToRecord >= (remainingDebt - epsilon)) {
        updatedPaymentStatus = true;
        changeAmount = amountToRecord - remainingDebt;
        amountToRecord = remainingDebt;
      }

      await db.transaction(async (trx) => {
        await trx("payment_history").insert({
          uuid: uuidv7(),
          faskes_uuid: faskesUuid,
          bill_uuid: uuid,
          kasir_uuid: getCashier.uuid,
          amount: amountToRecord,
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
      return {
        success: true,
        change: changeAmount > 0 ? changeAmount : 0 
    };
    } catch (error) {
      throw error;
    }
  }

  static async PayDebt(uuid, data){
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      const { amount, payment_method, note, information } = data;

      return db.transaction(async (trx) => {
        // Ambil data tagihan dan kunci barisnya untuk update
        const bill = await trx("bills")
          .where({ uuid: uuid, faskes_uuid: faskesUuid })
          .forUpdate()
          .first();

        // Lakukan validasi
        if (!bill) throw new NotfoundException("Tagihan tidak ditemukan");
        if (!bill.close_bill) throw new BadRequestException("Tagihan ini belum ditutup");
        if (bill.status) throw new BadRequestException("Tagihan ini sudah lunas");

        // Hitung sisa hutang saat ini
        const paymentSum = await trx("payment_history")
          .where("bill_uuid", uuid)
          .sum('amount as totalPaid')
          .first();
        const totalPaid = parseFloat(paymentSum.totalPaid) || 0;
        const remainingDebt = bill.grand_total - totalPaid;

        if (remainingDebt <= 0) {
          throw new BadRequestException("Tagihan ini sudah tidak memiliki hutang");
        }

        // Proses nominal pembayaran
        let amountToRecord = parseFloat(amount) || 0;
        let changeAmount = 0;

        if (amountToRecord > remainingDebt) {
          changeAmount = amountToRecord - remainingDebt;
          amountToRecord = remainingDebt; 
        }
        
        // Masukkan ke riwayat pembayaran
        await trx("payment_history").insert({
          uuid: uuidv7(),
          faskes_uuid: faskesUuid,
          bill_uuid: uuid,
          kasir_uuid: (await CashierRepository._getActiveShift(faskesUuid, trx))?.uuid, 
          amount: amountToRecord,
          payment_type: 'CASH', 
          payment_method: payment_method,
          information: information,
          note: note,
          created_at: moment().unix(),
          updated_at: moment().unix(),
        });
        
        const newTotalPaid = totalPaid + amountToRecord;
        const epsilon = 0.001; 
        if (newTotalPaid >= (bill.grand_total - epsilon)) {
            await trx("bills")
                .where({ uuid: uuid })
                .update({ status: true, updated_at: moment().unix() });
        }
        return { 
          success: true, 
          change: changeAmount,
          message: "Pembayaran hutang berhasil dicatat."
        };
      });
  }
}
