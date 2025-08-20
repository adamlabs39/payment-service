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
  // Helper internal untuk menghitung total tagihan
  static _calculateBillTotals(billData) {
    const subTotal = parseFloat(billData.sub_total) || 0;
    const ppn = parseFloat(billData.ppn) || 0;
    const adminFee = parseFloat(billData.admin_fee) || 0;
    const discount = parseFloat(billData.discount) || 0;
    const { voucher_value, voucher_type } = billData;
    
    let total = subTotal + ppn + adminFee;
    
    if (voucher_type && voucher_value) {
      total = calculateVoucher({ amount: total, type: voucher_type, value: voucher_value });
    }
    
    if (discount > 0) {
      total = calculateDiscount({ amount: total, discount: discount });
    }

    return total;
  }

  // Helper internal untuk membangun query list tagihan
  static _buildBillListQuery() {
    return db('bills as b')
        .leftJoin('patients as p', 'b.patient_uuid', 'p.uuid')
        .leftJoin('addresses as a', 'p.address_uuid', 'a.uuid')
        .leftJoin('birth_details as bd', 'p.birth_detail_uuid', 'bd.uuid')
        .select(
          'b.uuid', 'b.name as patient_name', 'b.invoice_code', 'b.bill_code',
          'b.grand_total', 'b.patient_uuid',
          'a.full_address', 'p.phone as no_handphone', 'p.gender as jenis_kelamin',
          'p.no_rm', 'bd.age_year', 'bd.age_month', 'bd.age_day',
          'b.status as payment_status',
          db.raw(`EXISTS (SELECT 1 FROM payment_history ph WHERE ph.bill_uuid = b.uuid) as is_paid`),
          db.raw(`(SELECT STRING_AGG(DISTINCT sb.practitioner_name, ', ') FROM service_bill sb WHERE sb.bill_uuid = b.uuid) as practitioner_name`),
          db.raw(`(SELECT l.name FROM service_bill sb JOIN rawat_jalans rj ON sb.layanan_uuid = rj.uuid AND sb.type = 'RJ' JOIN lokasi l ON rj.lokasi_uuid = l.uuid WHERE sb.bill_uuid = b.uuid LIMIT 1) as polyclinic_name`),
          db.raw(`(SELECT CONCAT(TO_CHAR(TO_TIMESTAMP(rj.tanggal_periksa), 'HH24:MI'), ' - ', TO_CHAR(TO_TIMESTAMP(rj.tanggal_periksa) + INTERVAL '15 minute', 'HH24:MI')) FROM service_bill sb JOIN rawat_jalans rj ON sb.layanan_uuid = rj.uuid AND sb.type = 'RJ' WHERE sb.bill_uuid = b.uuid LIMIT 1) as schedule_time`),
          db.raw(`(SELECT l.name FROM service_bill sb JOIN rawat_inaps ri ON sb.layanan_uuid = ri.uuid AND sb.type = 'RI' JOIN lokasi l ON ri.lokasi_uuid = l.uuid WHERE sb.bill_uuid = b.uuid LIMIT 1) as room_name`),
          db.raw(`(SELECT l.no_room FROM service_bill sb JOIN rawat_inaps ri ON sb.layanan_uuid = ri.uuid AND sb.type = 'RI' JOIN lokasi l ON ri.lokasi_uuid = l.uuid WHERE sb.bill_uuid = b.uuid LIMIT 1) as bed_number`),
          db.raw(`(CASE WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = b.uuid AND sb.type = 'IGD') THEN 'Data Tidak Lengkap' ELSE 'Data Lengkap' END) as completeness_status`),
          db.raw(`(CASE WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = b.uuid AND sb.with_insurance = true) AND NOT EXISTS (SELECT 1 FROM payment_history ph WHERE ph.bill_uuid = b.uuid AND ph.payment_type = 'CASH') THEN 'ASURANSI' ELSE 'TUNAI' END) as payment_type`),
          db.raw(`(
            CASE
              WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = b.uuid AND sb.type IN ('RJ', 'OTC', 'LAB', 'FISIO')) THEN 'RJ'
              WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = b.uuid AND sb.type = 'RI') THEN 'RI'
              WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = b.uuid AND sb.type = 'IGD') THEN 'IGD'
              ELSE NULL
            END
          ) as main_service_category`),
          db.raw(`(SELECT STRING_AGG(DISTINCT sb.type::TEXT, ', ') FROM service_bill sb WHERE sb.bill_uuid = b.uuid) as service_type_list`)
        );
      }
      
  // Helper internal untuk menerapkan filter list tagihan
  static _applyBillListFilters(query, params) {
    const serviceTypeMap = { IGD: ["IGD"], RI: ["RI"], RJ: ["RJ"], APS: ["OTC", "LAB", "FISIO"], OTC: ['OTC'] };

    // Filter Status (Lunas/Piutang/Semua)
    if (params.status && params.status.toUpperCase() !== 'SEMUA') {
      const status = params.status.toUpperCase() === 'LUNAS';
      query.where('b.status', status);
    }

    // Filter Pencarian
    if (params.search) {
      const searchTerm = params.search.trim();
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(searchTerm);
      if (isUUID) {
        query.andWhere(q => q.where('b.uuid', searchTerm).orWhere('p.uuid', searchTerm));
      } else {
        const searchTerms = searchTerm.split(/\s+/);
        for (const term of searchTerms) {
          query.andWhere(q => q.orWhere('b.name', 'ilike', `%${term}%`)
            .orWhere('p.no_rm', 'ilike', `%${term}%`)
            .orWhere('b.invoice_code', 'ilike', `%${term}%`)
            .orWhere('b.bill_code', 'ilike', `%${term}%`)
            .orWhere('a.full_address', 'ilike', `%${term}%`));
        }
      }
    }

    // Filter Tanggal
    if (params.start_date && params.end_date) {
      query.where('b.updated_at', '>=', params.start_date)
        .where('b.updated_at', '<=', params.end_date);
    }

    // Filter Jenis Layanan
    if (params.service_type) {
      const selectedFilters = [].concat(params.service_type);
      const dbServiceTypes = selectedFilters.map(type => serviceTypeMap[type.toUpperCase()]).filter(Boolean).flat();
      if (dbServiceTypes.length > 0) {
        query.whereExists(q => q.select(1).from('service_bill as sb').whereRaw('sb.bill_uuid = b.uuid').whereIn('sb.type', dbServiceTypes));
      }
    }

    // Filter Jenis Pembayaran
    if (params.payment_type) {
      const paymentType = params.payment_type.toUpperCase();
      if (paymentType === 'ASURANSI') {
        query.whereExists(q => q.select(1).from('service_bill as sb').whereRaw('sb.bill_uuid = b.uuid').where('sb.with_insurance', true))
          .whereNotExists(q => q.select(1).from('payment_history as ph').whereRaw('ph.bill_uuid = b.uuid').where('ph.payment_type', 'CASH'));
      } else if (paymentType === 'TUNAI') {
        query.whereNot(q => q.whereExists(q2 => q2.select(1).from('service_bill as sb').whereRaw('sb.bill_uuid = b.uuid').where('sb.with_insurance', true)).whereNotExists(q2 => q2.select(1).from('payment_history as ph').whereRaw('ph.bill_uuid = b.uuid').where('ph.payment_type', 'CASH')));
      }
    }
  }

  // Helper internal untuk mendapatkan detail tagihan
  static async _getBillDetails(uuid) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);

    const checkIfFindIsMerge = await db("bills as b").where({ "b.uuid": uuid, "b.faskes_uuid": faskesUuid }).select("b.merge_with").first();
    if (!checkIfFindIsMerge) throw new NotfoundException("Bill tidak ditemukan");
    if (checkIfFindIsMerge.merge_with) throw new CantProcessDataException("Bill tidak dapat di proses");

    const billQuery = db("bills as b")
      .leftJoin("patients as p", "b.patient_uuid", "p.uuid")
      .leftJoin("service_bill as sb", "sb.bill_uuid", "b.uuid")
      .leftJoin("bill_item as bi", "bi.service_bill_uuid", "sb.uuid")
      .leftJoin("birth_details as bd", "p.birth_detail_uuid", "bd.uuid")
      .select(
        "b.uuid", "b.name as patient_name", "b.invoice_code", "b.bill_code",
            "b.patient_uuid", "p.gender", "b.merge_with",
            "b.grand_total", "b.sub_total", "b.ppn", "b.admin_fee", 
            "b.voucher_code", "b.voucher_value", "b.voucher_type", 
            "b.close_bill", "b.discount", "b.status as payment_status", "p.no_rm",
            "bd.age_year", "bd.age_month", "bd.age_day",
            db.raw(`EXISTS (SELECT 1 FROM payment_history ph WHERE ph.bill_uuid = b.uuid) as is_paid`),
            db.raw(`(SELECT SUM(ph.amount) FROM payment_history ph WHERE ph.bill_uuid = b.uuid) as total_paid`),
            db.raw(`SUM(CASE WHEN bi.category_code = '1' THEN bi.price * bi.qty ELSE 0 END) AS total_tindakan`),
            db.raw(`SUM(CASE WHEN bi.category_code IN ('2', '3') THEN bi.price * bi.qty + COALESCE(bi.service_fee, 0) ELSE 0 END) AS total_obat_alkes`),
            db.raw(`SUM(CASE WHEN bi.category_code = '4' THEN bi.price * bi.qty ELSE 0 END) AS total_ruangan`),
            db.raw(`SUM(CASE WHEN bi.category_code = '5' THEN bi.price * bi.qty ELSE 0 END) AS total_penunjang`)
        )
      .where(q => q.where("b.uuid", uuid).orWhere("b.merge_with", uuid))
      .andWhere("b.faskes_uuid", faskesUuid)
      .whereNull("b.deleted_at").whereNull("sb.deleted_at").whereNull("bi.deleted_at")
      .groupBy(
        "b.uuid", "p.gender", "b.name", "b.invoice_code", "b.bill_code", "b.patient_uuid",
        "b.grand_total", "b.sub_total", "b.ppn", "b.admin_fee", "b.voucher_code",
            "b.voucher_value", "b.voucher_type", "b.close_bill", "b.status", "p.no_rm",
            "bd.age_year", "bd.age_month", "bd.age_day"
        );
    
    const bill = await billQuery;
    if (!bill.length) throw new NotfoundException("Bill tidak ditemukan");

    const finalBill = bill.reduce((acc, b) => {
        if (!acc.uuid) {
            Object.assign(acc, {
                ...b,
                grand_total: 0, sub_total: 0, total_tindakan: 0,
                total_obat_alkes: 0, total_ruangan: 0, total_penunjang: 0, total_paid: 0
            });
        }
        acc.grand_total += parseFloat(b.grand_total) || 0;
        acc.sub_total += parseFloat(b.sub_total) || 0;
        acc.total_tindakan += parseFloat(b.total_tindakan) || 0;
        acc.total_obat_alkes += parseFloat(b.total_obat_alkes) || 0;
        acc.total_ruangan += parseFloat(b.total_ruangan) || 0;
        acc.total_penunjang += parseFloat(b.total_penunjang) || 0;
        acc.total_paid += parseFloat(b.total_paid) || 0;
        return acc;
    }, {});

    const remainingDebt = finalBill.grand_total - finalBill.total_paid;
    finalBill.remaining_debt = remainingDebt > 0 ? remainingDebt : 0;
    finalBill._rawBillResult = bill;
    return finalBill;
  }

  // Method public untuk mencari tagihan
  static async FindBill(search) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const query = db('bills as b')
      .leftJoin('patients as p', 'b.patient_uuid', 'p.uuid')
      .select(
        'b.uuid', 'b.name as patient_name', 'b.invoice_code', 'b.bill_code',
        'b.patient_uuid', 'b.grand_total', 'p.no_rm',
        db.raw(`(CASE WHEN b.status = true THEN 'LUNAS' ELSE 'PIUTANG' END) as payment_status`),
      )
      .where({ 'b.faskes_uuid': faskesUuid, 'b.close_bill': false })
      .andWhere(q => q.where('p.no_rm', 'ilike', `%${search}%`)
        .orWhere('b.invoice_code', 'ilike', `%${search}%`)
        .orWhere('b.bill_code', 'ilike', `%${search}%`)
        .orWhere('b.name', 'ilike', `%${search}%`));
    return await query;
  }

  // Method public untuk mendapatkan detail tagihan
  static async GetDetailBill(uuid) {
    const finalBill = await this._getBillDetails(uuid);
    const service_bill = await db("service_bill as sb")
      .leftJoin("bills as b", "sb.bill_uuid", "b.uuid")
      .select(
        "sb.uuid", "sb.practitioner_name", "sb.service_name", "sb.service_code",
        "sb.layanan_uuid", "sb.already_claim", "sb.with_insurance",
        "sb.type", "sb.date", "b.merge_type",
        db.raw(`CASE WHEN sb.bill_uuid = ? THEN FALSE ELSE TRUE END as is_merged`, [uuid])
      )
      .where(q => q.where("sb.bill_uuid", finalBill.uuid)
      .orWhereIn("sb.bill_uuid", finalBill._rawBillResult.map((b) => b.uuid)))
      .whereNull("sb.deleted_at");

    delete finalBill._rawBillResult;
    return { ...finalBill, service_bill };
  }

  // Method public untuk mendapatkan detail tagihan item
  static async GetDetailBillItem(uuid) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const sbExists = await db("service_bill").where({ uuid, faskes_uuid: faskesUuid }).first();
    if (!sbExists) throw new NotfoundException("Service Bill tidak ditemukan");

    const items = await db("bill_item as bi")
      .where("bi.service_bill_uuid", uuid)
      .select(
        'bi.uuid', 'bi.item_name', 'bi.qty', 'bi.price', 'bi.price_item',
        'bi.service_fee', 'bi.category_code', 'bi.additional_field', 'bi.date_used'
      );

    const groupedResult = { tindakan: { list: [], total: 0 }, penunjang: { list: [], total: 0 }, obat: { list: [], total: 0 }, alkes: { list: [], total: 0 }, ruangan: { list: [], total: 0 } };
    let totalKeseluruhan = 0;

    items.forEach(item => {
      const newItem = { uuid: item.uuid, dateUsed: item.date_used, itemName: item.item_name, qty: item.qty, price: item.price, serviceFee: item.service_fee, additionalField: item.additional_field };
      const itemTotal = (item.price * item.qty) + (item.service_fee || 0);
      totalKeseluruhan += itemTotal;
      const categoryMap = { '1': 'tindakan', '2': 'obat', '3': 'alkes', '4': 'ruangan', '5': 'penunjang' };
      const category = categoryMap[item.category_code];
      if (category) {
        groupedResult[category].list.push(newItem);
        groupedResult[category].total += itemTotal;
      }
    });

    return { item: groupedResult, total: totalKeseluruhan };
  }

  // Method public untuk mendapatkan detail tagihan pasien
  static async getDetailPasienBill(uuid) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const bill = await db("bills as b").where({ "b.uuid": uuid, "b.faskes_uuid": faskesUuid }).select("b.uuid", "b.patient_uuid", "b.name as patient_name").first();
    if (!bill) throw new NotfoundException("Bill tidak ditemukan");

    let patient = { external: true, patient_name: bill.patient_name };
    if (bill.patient_uuid) {
      const patientData = await db("patients as p")
        .where("p.uuid", bill.patient_uuid)
        .leftJoin("birth_details as bd", "p.birth_detail_uuid", "bd.uuid")
        .leftJoin("addresses as a", "p.address_uuid", "a.uuid")
        .leftJoin("bills as b", "b.patient_uuid", "p.uuid") 
        .select(
          "p.name as patient_name", "p.no_rm", "p.gender", "p.no_identity",
          "p.identity as identity_type", "p.phone as no_handphone", "p.religion as agama",
          "bd.birth_date as tgl_lahir", "bd.age_year", "bd.age_month", "bd.age_day",
          "a.full_address as alamat", "a.village as kelurahan_desa", "a.district as kecamatan",
          "a.city as kabupaten_kota", "a.prov as provinsi", "a.rt", "a.rw", "a.postal_code as kodepos",
          db.raw(`(CASE WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = ? AND sb.with_insurance = true) THEN 'ASURANSI' ELSE 'TUNAI' END) as payment_type`, [uuid])
            )
            .first();
        if (patientData) patient = { ...patientData, external: false };
    }

    const billDetail = await this.GetDetailBill(uuid);
    const serviceBillItems = await Promise.all(
        billDetail.service_bill.map(sb => this.GetDetailBillItem(sb.uuid))
    );
    billDetail.service_bill.forEach((sb, index) => {
        sb.items = serviceBillItems[index];
    });

    return { patient, bill: billDetail };
  }

  // Method public untuk menerapkan voucher
  static async ApplyVoucher(uuid, data) {
      const { faskesUuid } = Context.get(CTX_AUTHOR);
      const { code } = data;
      
      const bill = await db("bills as b").where("b.faskes_uuid", faskesUuid).where("b.uuid", uuid).first();
      if (!bill) throw new NotfoundException("Bill tidak ditemukan");
      if (bill.voucher_code) throw new BadRequestException("Tagihan sudah memiliki voucher");

      const currentBillTotal = (bill.sub_total || 0) + (bill.ppn || 0) + (bill.admin_fee || 0);
      const v = await VoucherRepository.validateAndGetVoucher(code, currentBillTotal);
      
      const tempBillData = { ...bill, voucher_code: v.code, voucher_value: v.value, voucher_type: v.type };
      const newGrandTotal = this._calculateBillTotals(tempBillData);

      await db("bills").where({ uuid, faskes_uuid: faskesUuid }).update({
        voucher_code: v.code,
        voucher_value: v.value,
        voucher_type: v.type,
        grand_total: newGrandTotal,
        updated_at: moment().unix()
      });
      return true;
  }

  // Method public untuk menerapkan diskon
  static async ApplyDiscount(uuid, data) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const { value } = data;

    const bill = await db("bills as b").where("b.faskes_uuid", faskesUuid).where("b.uuid", uuid).first();
    if (!bill) throw new NotfoundException("Bill tidak ditemukan");
    if (bill.discount) throw new BadRequestException("Tagihan sudah memiliki diskon");

    const tempBillData = { ...bill, discount: value };
    const newGrandTotal = this._calculateBillTotals(tempBillData);

    await db("bills").where({ uuid, faskes_uuid: faskesUuid }).update({
      discount: value,
      grand_total: newGrandTotal,
      updated_at: moment().unix()
    });
    return true;
  }

  // Method public untuk menghitung tagihan yang menggunakan kode voucher
  static async CountBillUsedVoucherCode(voucherCode) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const count = await db("bills as b").where("b.faskes_uuid", faskesUuid).where("b.voucher_code", voucherCode).count("* as total").first();
    return count.total;
  }

  // Method public untuk menutup tagihan
  static async CloseBill(uuid) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const bill = await db("bills as b").where("b.faskes_uuid", faskesUuid).where("b.uuid", uuid).first();
    if (!bill) throw new NotfoundException("Bill tidak ditemukan");
    if (bill.close_bill) throw new BadRequestException("Tagihan sudah ditutup");

    await db("bills").where({ uuid, faskes_uuid: faskesUuid }).update({
      close_bill: true,
      updated_at: moment().unix()
    });
    return true;
  }

  // Method public untuk mendapatkan riwayat pembayaran
  static async GetPaymentHistory(bill_uuid) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
        
    const billDetails = await this.GetTotalBill(bill_uuid);
    if (!billDetails) throw new NotfoundException("Tagihan tidak ditemukan");
    const totalBill = parseFloat(billDetails.grand_total) || 0;

    const history = await db("payment_history as ph")
      .leftJoin("cashier_report as cr", "ph.kasir_uuid", "cr.uuid")
      .select("ph.payment_type", "ph.payment_method", "ph.information", "ph.note", "ph.amount", "ph.created_at", "cr.nama_kasir", "cr.shift_type")
      .where("ph.bill_uuid", bill_uuid)
      .where("ph.faskes_uuid", faskesUuid)
      .orderBy('ph.created_at', 'asc'); 

    let cumulativePaid = 0;
    const enrichedHistory = history.map(payment => {
      const amountPaid = parseFloat(payment.amount) || 0;
      const debt_before = totalBill - cumulativePaid;
      cumulativePaid += amountPaid;
      const debt_after = totalBill - cumulativePaid;
      return { ...payment, debt_before, debt_after };
    });

    const totalPaid = cumulativePaid;
    const finalDebt = totalBill - totalPaid;

    return {
      bill_details: billDetails,
      total_paid: totalPaid,
      total_bill: totalBill,
      is_paid: totalPaid >= totalBill,
      debt: finalDebt > 0 ? finalDebt : 0,
      payment_history: enrichedHistory, 
    };
  }

  // Method public untuk mendapatkan tagihan yang ditutup
  static async getClosedBill(params) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const query = this._buildBillListQuery()
      .where({ 'b.faskes_uuid': faskesUuid, 'b.close_bill': true });
  
    this._applyBillListFilters(query, params);
    query.orderBy('b.updated_at', 'desc');
    return await KnexPagination.init(query, params);
  }

  // Method public untuk mendapatkan tagihan APS/OTC
  static async getApsOtc(params) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const query = this._buildBillListQuery()
        .where({ 'b.faskes_uuid': faskesUuid, 'b.close_bill': false, 'b.status': false });

    const apsOtcTypes = ['OTC', 'LAB', 'FISIO'];
    query.whereExists(function() {
      this.select(1)
        .from('service_bill as sb')
        .whereRaw('sb.bill_uuid = b.uuid')
        .whereIn('sb.type', apsOtcTypes);
    });
    
    this._applyBillListFilters(query, params);
    query.orderBy('b.created_at', 'desc');
    return await KnexPagination.init(query, params);
  }

  // Method public untuk mendapatkan tagihan pelayanan
  static async getPelayanan(params) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const query = this._buildBillListQuery()
        .where({ 'b.faskes_uuid': faskesUuid, 'b.close_bill': false, 'b.status': false });

    const apsOtcTypes = ['OTC', 'LAB', 'FISIO'];
    query.whereNotExists(function() {
      this.select(1)
        .from('service_bill as sb')
        .whereRaw('sb.bill_uuid = b.uuid')
        .whereIn('sb.type', apsOtcTypes);
    });
    
    this._applyBillListFilters(query, params);
    query.orderBy('b.created_at', 'desc');
    return await KnexPagination.init(query, params);
  }

  // Method public untuk mendapatkan total tagihan
  static async GetTotalBill(uuid) {
    const finalBill = await this._getBillDetails(uuid);
    delete finalBill._rawBillResult;
    return finalBill;
  }

  // Method public untuk melakukan pembayaran tagihan
  static async PaymentBill(uuid, data) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const getCashier = await CashierRepository._getActiveShift(faskesUuid);
    if (!getCashier) throw new BadRequestException("Shift kasir belum dibuka");

    const bill = await this.GetTotalBill(uuid);
    if (bill.payment_status) throw new BadRequestException("Tagihan sudah lunas");

    const history = await db("payment_history").where("bill_uuid", uuid);
    const totalPayment = history.reduce((acc, row) => acc + (parseFloat(row.amount) || 0), 0);
    
    const remainingDebt = bill.grand_total - totalPayment;
    let amountToRecord = parseFloat(data.amount) || 0;
    let changeAmount = 0;
    let updatedPaymentStatus = false;

    if (amountToRecord >= remainingDebt) {
      updatedPaymentStatus = true;
      changeAmount = amountToRecord - remainingDebt;
      amountToRecord = remainingDebt;
    }

    await db.transaction(async (trx) => {
      await trx("payment_history").insert({
        uuid: uuidv7(), faskes_uuid: faskesUuid, bill_uuid: uuid,
        kasir_uuid: getCashier.uuid, amount: amountToRecord,
        payment_type: data.payment_type, payment_method: data.payment_method,
        information: data.information, note: data.note,
        created_at: moment().unix(), updated_at: moment().unix(),
      });

      if (updatedPaymentStatus) {
        await trx("bills").where(q => q.where("uuid", uuid).orWhere("merge_with", uuid)).update({ status: true });
      }
    });
    return { success: true, change: changeAmount > 0 ? changeAmount : 0 };
  }

  // Method public untuk melakukan pembayaran tagihan
  static async PayDebt(uuid, data) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const getCashier = await CashierRepository._getActiveShift(faskesUuid);
    if (!getCashier) throw new BadRequestException("Shift kasir belum dibuka");
    const { amount, payment_method, note, information } = data;

    return db.transaction(async (trx) => {
      const whereClause = { uuid };
      if (faskesUuid) whereClause.faskes_uuid = faskesUuid;
      
      const bill = await trx("bills").where(whereClause).forUpdate().first();
      if (!bill) throw new NotfoundException("Tagihan tidak ditemukan");
      if (!bill.close_bill) throw new BadRequestException("Tagihan ini belum ditutup");
      if (bill.status) throw new BadRequestException("Tagihan ini sudah lunas");

      const paymentSum = await trx("payment_history").where("bill_uuid", uuid).sum('amount as totalPaid').first();
      const totalPaid = parseFloat(paymentSum.totalPaid) || 0;
      const remainingDebt = bill.grand_total - totalPaid;
      if (remainingDebt <= 0) throw new BadRequestException("Tagihan ini sudah tidak memiliki hutang");

      let amountToRecord = parseFloat(amount) || 0;
      let changeAmount = 0;
      if (amountToRecord > remainingDebt) {
        changeAmount = amountToRecord - remainingDebt;
        amountToRecord = remainingDebt;
      }
        
      await trx("payment_history").insert({
        uuid: uuidv7(), faskes_uuid: bill.faskes_uuid, bill_uuid: uuid,
        kasir_uuid: getCashier.uuid,
        amount: amountToRecord, payment_type: 'CASH', payment_method: payment_method,
        information: information, note: note,
        created_at: moment().unix(), updated_at: moment().unix(),
      });
      
      const newTotalPaid = totalPaid + amountToRecord;
      if (newTotalPaid >= bill.grand_total) {
        await trx("bills").where({ uuid }).update({ status: true, updated_at: moment().unix() });
      }
      return { success: true, change: changeAmount, message: "Pembayaran hutang berhasil dicatat." };
    });
  }
}
