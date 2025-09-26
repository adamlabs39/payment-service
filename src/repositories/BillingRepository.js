import db from '../configs/knex-config.js';
import { Context } from '../middlewares/context.js';
import { CTX_AUTHOR } from '../constants/context-constant.js';
import { ITEM_CATEGORIES } from '../constants/app-constants.js';
import NotfoundException from '../exceptions/notfound-exception.js';
import BadRequestException from '../exceptions/bad-request-exception.js';
import VoucherRepository from './VoucherRepository.js';
import * as BillHelpers from './BillHelpers.js';
import moment from 'moment';

export default class BillRepository {
  // Method public untuk mendapatkan tagihan yang ditutup
  static async getClosedBill(params) {
    return BillHelpers.getBillList(
      params,
      (query) => {
        query.where('b.close_bill', true);
      },
      { isClosedBillView: true }
    );
  }

  // Method public untuk mendapatkan tagihan APS/OTC
  static async getApsOtc(params) {
    const apsOtcTypes = ['OTC', 'LAB', 'FISIO'];
    return BillHelpers.getBillList(params, (query) => {
      query.whereExists(function () {
        this.select(1).from('service_bill as sb').whereRaw('sb.bill_uuid = b.uuid').whereIn('sb.type', apsOtcTypes);
      });
    });
  }

  // Method public untuk mendapatkan tagihan pelayanan
  static async getPelayanan(params) {
    const apsOtcTypes = ['OTC', 'LAB', 'FISIO'];
    return BillHelpers.getBillList(params, (query) => {
      query.whereNotExists(function () {
        this.select(1).from('service_bill as sb').whereRaw('sb.bill_uuid = b.uuid').whereIn('sb.type', apsOtcTypes);
      });
    });
  }

  // Method public untuk mencari tagihan
  static async FindBill(search) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const query = db('bills as b')
      .leftJoin('patients as p', 'b.patient_uuid', 'p.uuid')
      .select(
        'b.uuid',
        'b.name as patient_name',
        'b.invoice_code',
        'b.bill_code',
        'b.patient_uuid',
        'b.grand_total',
        'p.no_rm',
        db.raw(`(CASE WHEN b.status = true THEN 'LUNAS' ELSE 'PIUTANG' END) as payment_status`)
      )
      .where({ 'b.faskes_uuid': faskesUuid, 'b.close_bill': false })
      .andWhere((q) =>
        q
          .where('p.no_rm', 'ilike', `%${search}%`)
          .orWhere('b.invoice_code', 'ilike', `%${search}%`)
          .orWhere('b.bill_code', 'ilike', `%${search}%`)
          .orWhere('b.name', 'ilike', `%${search}%`)
      );

    return await query;
  }

  // Method public untuk mendapatkan detail tagihan
  static async GetDetailBill(uuid) {
    const finalBill = await BillHelpers.getBillDetails(uuid);

    const service_bill = await db('service_bill as sb')
      .leftJoin('bills as b', 'sb.bill_uuid', 'b.uuid')
      .select(
        'sb.uuid',
        'sb.practitioner_name',
        'sb.service_name',
        'sb.service_code',
        'sb.layanan_uuid',
        'sb.already_claim',
        'sb.with_insurance',
        'sb.type',
        'sb.date',
        'b.merge_type',
        db.raw(`CASE WHEN sb.bill_uuid = ? THEN FALSE ELSE TRUE END as is_merged`, [uuid])
      )
      .where((q) =>
        q.where('sb.bill_uuid', finalBill.uuid).orWhereIn(
          'sb.bill_uuid',
          finalBill._rawBillResult.map((b) => b.uuid)
        )
      )
      .whereNull('sb.deleted_at');

    delete finalBill._rawBillResult;

    const cashierNames = finalBill.cashier_name ? finalBill.cashier_name.split(', ') : [];

    return { ...finalBill, cashier_name: cashierNames, service_bill };
  }

  // Method public untuk mendapatkan detail tagihan item
  static async GetDetailBillItem(uuid) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);

    const serviceBill = await db('service_bill as sb')
      .where('sb.uuid', uuid)
      .where('sb.faskes_uuid', faskesUuid)
      .select('with_insurance', 'type', 'layanan_uuid')
      .first();

    if (!serviceBill) throw new NotfoundException('Service Bill tidak ditemukan');

    const items = await db('bill_item as bi')
      .where('bi.service_bill_uuid', uuid)
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

    const paymentType = serviceBill.with_insurance ? 'ASURANSI' : 'TUNAI';

    const groupedResult = {
      tindakan: { list: [], total: 0 },
      penunjang: { list: [], total: 0 },
      obat: { list: [], total: 0 },
      alkes: { list: [], total: 0 },
      ruangan: { list: [], total: 0 },
    };
    let totalKeseluruhan = 0;

    items.forEach((item) => {
      const newItem = {
        uuid: item.uuid,
        dateUsed: item.date_used,
        itemName: item.item_name,
        qty: item.qty,
        price: item.price,
        serviceFee: item.service_fee,
        additionalField: item.additional_field,
      };
      const itemTotal = item.price * item.qty + (item.service_fee || 0);
      totalKeseluruhan += itemTotal;
      const categoryMap = {
        [ITEM_CATEGORIES.TINDAKAN]: 'tindakan',
        [ITEM_CATEGORIES.OBAT]: 'obat',
        [ITEM_CATEGORIES.ALKES]: 'alkes',
        [ITEM_CATEGORIES.RUANGAN]: 'ruangan',
        [ITEM_CATEGORIES.PENUNJANG]: 'penunjang',
      };
      const category = categoryMap[item.category_code];
      if (category) {
        groupedResult[category].list.push(newItem);
        groupedResult[category].total += itemTotal;
      }
    });

    let schedule_time = null;

    if (serviceBill.type === 'RJ' && serviceBill.layanan_uuid) {
      const rawatJalan = await db('rawat_jalans')
        .where('uuid', serviceBill.layanan_uuid)
        .select('tanggal_periksa')
        .first();

      if (rawatJalan && rawatJalan.tanggal_periksa) {
        const startTime = moment.unix(rawatJalan.tanggal_periksa);
        const endTime = startTime.clone().add(15, 'minutes');
        schedule_time = `${startTime.format('HH:mm')} - ${endTime.format('HH:mm')}`;
      }
    }

    return { item: groupedResult, total: totalKeseluruhan, payment_type: paymentType, schedule_time };
  }

  // Method public untuk mendapatkan detail tagihan pasien
  static async getDetailPasienBill(uuid) {
    const billDetail = await this.GetDetailBill(uuid);

    const serviceBillUuids = billDetail.service_bill.map((sb) => sb.uuid);

    const allItems = await db('bill_item as bi')
      .whereIn('bi.service_bill_uuid', serviceBillUuids)
      .select(
        'bi.service_bill_uuid',
        'bi.uuid',
        'bi.item_name',
        'bi.qty',
        'bi.price',
        'bi.service_fee',
        'bi.category_code',
        'bi.additional_field',
        'bi.date_used'
      );

    const itemsByServiceBill = allItems.reduce((acc, item) => {
      const key = item.service_bill_uuid;
      if (!acc[key]) {
        acc[key] = {
          tindakan: { list: [], total: 0 },
          penunjang: { list: [], total: 0 },
          obat: { list: [], total: 0 },
          alkes: { list: [], total: 0 },
          ruangan: { list: [], total: 0 },
          totalKeseluruhan: 0,
        };
      }

      const newItem = {
        uuid: item.uuid,
        dateUsed: item.date_used,
        itemName: item.item_name,
        qty: item.qty,
        price: item.price,
        serviceFee: item.service_fee,
        additionalField: item.additional_field,
      };

      const itemTotal = item.price * item.qty + (item.service_fee || 0);
      acc[key].totalKeseluruhan += itemTotal;
      const categoryMap = { 1: 'tindakan', 2: 'obat', 3: 'alkes', 4: 'ruangan', 5: 'penunjang' };
      const category = categoryMap[item.category_code];

      if (category) {
        acc[key][category].list.push(newItem);
        acc[key][category].total += itemTotal;
      }

      return acc;
    }, {});

    billDetail.service_bill.forEach((sb) => {
      sb.items = {
        item: itemsByServiceBill[sb.uuid] || { totalKeseluruhan: 0 },
      };
    });

    const patient = {
      patient_name: billDetail.patient_name,
      no_rm: billDetail.no_rm,
      gender: billDetail.gender,
      no_identity: billDetail.no_identity,
      identity_type: billDetail.identity_type,
      no_handphone: billDetail.no_handphone,
      agama: billDetail.agama,
      tgl_lahir: billDetail.tgl_lahir,
      age_year: billDetail.age_year,
      age_month: billDetail.age_month,
      age_day: billDetail.age_day,
      alamat: billDetail.alamat,
      kelurahan_desa: billDetail.kelurahan_desa,
      kecamatan: billDetail.kecamatan,
      kabupaten_kota: billDetail.kabupaten_kota,
      provinsi: billDetail.provinsi,
      rt: billDetail.rt,
      rw: billDetail.rw,
      kodepos: billDetail.kodepos,
    };

    return { patient, bill: billDetail };
  }

  // Method public untuk mendapatkan total tagihan
  static async GetTotalBill(uuid) {
    const finalBill = await BillHelpers.getBillDetails(uuid);
    delete finalBill._rawBillResult;
    return finalBill;
  }

  // Method public untuk apply voucher
  static async ApplyVoucher(uuid, data) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const { code } = data;

    return db.transaction(async (trx) => {
      const bill = await trx('bills').where({ uuid, faskes_uuid: faskesUuid }).forUpdate().first();
      if (!bill) throw new NotfoundException('Bill tidak ditemukan');
      if (bill.voucher_code) throw new BadRequestException('Tagihan sudah memiliki voucher');

      const currentBillTotal = bill.sub_total + bill.ppn + bill.admin_fee;
      const v = await VoucherRepository.validateAndGetVoucher(code, currentBillTotal);

      const tempBillData = { ...bill, voucher_code: v.code, voucher_value: v.value, voucher_type: v.type };
      const newGrandTotal = BillHelpers.calculateBillTotals(tempBillData);

      await trx('bills').where({ uuid }).update({
        voucher_code: v.code,
        voucher_value: v.value,
        voucher_type: v.type,
        grand_total: newGrandTotal,
        updated_at: moment().unix(),
      });

      return true;
    });
  }

  static async ApplyDiscount(uuid, data) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const { value } = data;

    return db.transaction(async (trx) => {
      const bill = await trx('bills').where({ uuid, faskes_uuid: faskesUuid }).forUpdate().first();
      if (!bill) throw new NotfoundException('Bill tidak ditemukan');
      if (bill.discount) throw new BadRequestException('Tagihan sudah memiliki diskon');

      const tempBillData = { ...bill, discount: value };
      const newGrandTotal = BillHelpers.calculateBillTotals(tempBillData);

      await trx('bills').where({ uuid }).update({
        discount: value,
        grand_total: newGrandTotal,
        updated_at: moment().unix(),
      });

      return true;
    });
  }

  static async CloseBill(uuid) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);

    return db.transaction(async (trx) => {
      const bill = await db('bills as b').where({ 'b.uuid': uuid, 'b.faskes_uuid': faskesUuid }).first();
      if (!bill) throw new NotfoundException('Bill tidak ditemukan');
      if (bill.close_bill) throw new BadRequestException('Tagihan sudah ditutup');
      await trx('bills').where({ uuid, faskes_uuid: faskesUuid }).update({
        close_bill: true,
        updated_at: moment().unix(),
      });
      return true;
    });
  }

  static async getBillsForPatient(patientUuid) {
    const query = db('bills as b')
      .select(
        'b.uuid',
        'b.invoice_code',
        'b.grand_total',
        'b.status as payment_status',
        'b.created_at',
        db.raw(`(SELECT name FROM faskes_profiles fp WHERE fp.faskes_uuid = b.faskes_uuid) as faskes_name`)
      )
      .where('b.patient_uuid', patientUuid);
    return await query;
  }
}
