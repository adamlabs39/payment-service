import db from "../configs/knex-config.js";
import { Context } from "../middlewares/context.js";
import { CTX_AUTHOR } from "../constants/context-constant.js";
import { KnexPagination } from "../helpers/pagination.js";
import NotfoundException from "../exceptions/notfound-exception.js";
import CantProcessDataException from "../exceptions/CantProcessDataException.js";
import moment from "moment";

export default class BillQueryRepository {
    /**
  * Menghitung grand total final sebuah tagihan setelah memperhitungkan PPN,
  * biaya admin, voucher, dan diskon.
  * PENTING: Voucher diaplikasikan terlebih dahulu sebelum diskon persentase.
  * @param {object} billData - Objek yang berisi data tagihan lengkap.
  * @returns {number} Nilai grand total yang sudah dihitung.
  */
  static _calculateBillTotals(billData) {
    const subTotal = parseFloat(billData.sub_total) || 0;
    const ppn = parseFloat(billData.ppn) || 0;
    const adminFee = parseFloat(billData.admin_fee) || 0;
    const discountPercent = parseFloat(billData.discount) || 0;
    const { voucher_value, voucher_type } = billData;
    
    let total = subTotal + ppn + adminFee;
    let voucherDeduction = 0;

    if (voucher_type && voucher_value) {
      if (voucher_type === 'persentase') {
        voucherDeduction = total * (parseFloat(voucher_value) / 100);
      } else if (voucher_type === 'potongan') {
        voucherDeduction = parseFloat(voucher_value);
      }
    }
    
    total -= voucherDeduction;
    
    if (discountPercent  > 0) {
      const discountDeduction = total * (discountPercent  / 100);
      total -= discountDeduction;
    }

    return total < 0 ? 0 : total;
  }

  /**
  * Membangun query dasar (base query) untuk semua endpoint yang menampilkan daftar tagihan.
  * Query ini sudah mencakup semua JOIN dan kolom dasar yang diperlukan untuk tampilan.
  * Filter spesifik akan diterapkan oleh method lain yang memanggilnya.
  * @returns {object} Objek query Knex yang siap untuk ditambahkan filter.
  */
  static _buildBillListQuery() {
    // CTE untuk mengambil data jadwal rawat jalan
    const rjScheduleCTE = db('service_bill as sb')
      .join('rawat_jalans as rj', 'sb.layanan_uuid', 'rj.uuid')
      .join('jadwal_dokter as jd', 'rj.jadwal_dokter_uuid', 'jd.uuid')
      .where('sb.type', 'RJ')
      .select(
        'sb.bill_uuid',
        db.raw(`CAST(FLOOR(EXTRACT(EPOCH FROM (TO_TIMESTAMP(rj.tanggal_periksa)::date + jd.start_time::time))) AS INTEGER) as schedule_start_time`),
        db.raw(`CAST(FLOOR(EXTRACT(EPOCH FROM (TO_TIMESTAMP(rj.tanggal_periksa)::date + jd.end_time::time))) AS INTEGER) as schedule_end_time`)
      )
      .distinctOn('sb.bill_uuid');

    // CTE untuk mengambil data lokasi/kamar rawat inap
    const riLocationCte = db('service_bill as sb')
      .join('rawat_inaps as ri', 'sb.layanan_uuid', 'ri.uuid')
      .join('lokasi as l', 'ri.lokasi_uuid', 'l.uuid')
      .where('sb.type', 'RI')
      .select('sb.bill_uuid', 'l.name as room_name', 'l.no_room as bed_number')
      .distinctOn('sb.bill_uuid');

    return db
      .with('rj_schedule', rjScheduleCTE)
      .with('ri_location', riLocationCte)
      .select(
        // Kolom-kolom dasar dari tagihan dan data pasien
        'b.uuid', 'b.name as patient_name', 'b.invoice_code', 'b.bill_code',
        'b.grand_total', 'b.patient_uuid',
        'a.full_address', 'p.phone as no_handphone', 'p.gender as jenis_kelamin',
        'p.no_rm', 'bd.age_year', 'bd.age_month', 'bd.age_day',
        'b.status as payment_status',

        // Mengambil data jadwal dan lokasi dari CTE yang sudah dibuat
        'rj_schedule.schedule_start_time',
        'rj_schedule.schedule_end_time',
        'ri_location.room_name',
        'ri_location.bed_number',

        // Flag boolean untuk menandakan apakah tagihan sudah pernah dibayar
        db.raw(`EXISTS (SELECT 1 FROM payment_history ph WHERE ph.bill_uuid = b.uuid) as is_paid`),

        // Mengambil nomor registrasi pertama yang ditemukan
        db.raw(`(
          SELECT COALESCE(rj.no_reg, ri.no_reg) 
          FROM service_bill sb
          LEFT JOIN rawat_jalans rj ON sb.layanan_uuid = rj.uuid AND sb.type = 'RJ'
          LEFT JOIN rawat_inaps ri ON sb.layanan_uuid = ri.uuid AND sb.type = 'RI'
          WHERE sb.bill_uuid = b.uuid 
          LIMIT 1
        ) as no_reg`),

        // Menggabungkan semua nama praktisi unik yang menangani pasien
        db.raw(`(
          SELECT STRING_AGG(DISTINCT sb.practitioner_name, ', ') 
          FROM service_bill sb WHERE sb.bill_uuid = b.uuid) as practitioner_name`),

        // Status kelengkapan data berdasarkan aturan 
        db.raw(`(CASE WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = b.uuid AND sb.type = 'IGD') THEN 'Data Tidak Lengkap' ELSE 'Data Lengkap' END) as completeness_status`),

        // Menentukan tipe penjamin (ASURANSI/TUNAI)
        db.raw(`(CASE WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = b.uuid AND sb.with_insurance = true) AND NOT EXISTS (SELECT 1 FROM payment_history ph WHERE ph.bill_uuid = b.uuid AND ph.payment_type = 'CASH') THEN 'ASURANSI' ELSE 'TUNAI' END) as payment_type`),

        // Menentukan kategori layanan utama dari tagihan
        db.raw(`(
          CASE
            WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = b.uuid AND sb.type IN ('RJ', 'OTC', 'LAB', 'FISIO')) THEN 'RJ'
            WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = b.uuid AND sb.type = 'RI') THEN 'RI'
            WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = b.uuid AND sb.type = 'IGD') THEN 'IGD'
            ELSE NULL
          END
        ) as main_service_category`),

        // Membuat daftar semua jenis layanan yang ada di dalam tagihan
        db.raw(`(SELECT STRING_AGG(DISTINCT sb.type::TEXT, ', ') FROM service_bill sb WHERE sb.bill_uuid = b.uuid) as service_type_list`)
      )
      .from('bills as b')
      .leftJoin('patients as p', 'b.patient_uuid', 'p.uuid')
      .leftJoin('addresses as a', 'p.address_uuid', 'a.uuid')
      .leftJoin('birth_details as bd', 'p.birth_detail_uuid', 'bd.uuid')
      .leftJoin('rj_schedule', 'b.uuid', 'rj_schedule.bill_uuid')
      .leftJoin('ri_location', 'b.uuid', 'ri_location.bill_uuid')
  }
      
  /**
  * Menerapkan berbagai filter secara dinamis ke query daftar tagihan.
  * Mendukung filter berdasarkan status, pencarian teks, rentang tanggal,
  * jenis layanan (service_type), dan jenis pembayaran (payment_type).
  * @param {object} query - Objek query Knex yang akan dimodifikasi.
  * @param {object} params - Objek berisi parameter filter dari request.
  */
  static _applyBillListFilters(query, params) {
    const serviceTypeMap = { IGD: ["IGD"], RI: ["RI"], RJ: ["RJ"], APS: ["LAB", "FISIO"], OTC: ['OTC'] };

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

  /**
  * Helper internal untuk mendapatkan detail tagihan secara menyeluruh.
  * Method ini dirancang untuk menangani tagihan tunggal maupun yang digabung (merged bill),
  * dengan mengagregasi semua data relevan dalam satu panggilan database yang efisien.
  * @param {string} uuid - UUID dari tagihan utama (parent bill).
  * @returns {Promise<object>} Objek detail tagihan yang sudah diagregasi.
  */
  static async _getBillDetails(uuid) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);

    // Pengecekan awal untuk mematikan tagihan ada dan bukan merupakan tagihan anak dari hasil merge
    const checkIfFindIsMerge = await db("bills as b").where({ "b.uuid": uuid, "b.faskes_uuid": faskesUuid }).select("b.merge_with").first();
    if (!checkIfFindIsMerge) throw new NotfoundException("Bill tidak ditemukan");
    if (checkIfFindIsMerge.merge_with) throw new CantProcessDataException("Bill tidak dapat di proses");

    const billQuery = db("bills as b")
      .leftJoin("patients as p", "b.patient_uuid", "p.uuid")
      .leftJoin("service_bill as sb", "sb.bill_uuid", "b.uuid")
      .leftJoin("bill_item as bi", "bi.service_bill_uuid", "sb.uuid")
      .leftJoin("birth_details as bd", "p.birth_detail_uuid", "bd.uuid")
      .leftJoin("addresses as a", "p.address_uuid", "a.uuid")
      .select(
        // Kolom-kolom dasar dari tabel bills, patients, dan birth_details
        "b.uuid", "b.name as patient_name", "b.invoice_code", "b.bill_code",
        "b.patient_uuid", "p.gender", "b.merge_with",
        "b.grand_total", "b.sub_total", "b.ppn", "b.admin_fee", 
        "b.voucher_code", "b.voucher_value", "b.voucher_type", 
        "b.close_bill", "b.discount", "b.status as payment_status", "p.no_rm",
        // Kolom Pasien Lengkap
        "p.no_rm", "p.gender", "p.no_identity", "p.identity as identity_type", 
        "p.phone as no_handphone", "p.religion as agama",
        "bd.birth_date as tgl_lahir", "bd.age_year", "bd.age_month", "bd.age_day",
        "a.full_address as alamat", "a.village as kelurahan_desa", "a.district as kecamatan",
        "a.city as kabupaten_kota", "a.prov as provinsi", "a.rt", "a.rw", "a.postal_code as kodepos",

        // Subquery untuk data turunan

        // Menentukan tipe pembayaran utama (ASURANSI/TUNAI) berdasarkan keberadaan service_bill yang menggunakan asuransi
        this._getPaymentTypeSubquery(),

        // Mengambil semua nama kasir unik yang terlibat dalam pembayaran tagihan ini
        this._getCashierNameSubquery(),

        // Mengambil tanggal kunjungan pertama dari berbagai jenis layanan
        this._getVisitDateSubquery(),

        // Flag boolean untuk mengecek apakah sudah ada riwayat pembayaran
        db.raw(`EXISTS (SELECT 1 FROM payment_history ph WHERE ph.bill_uuid = b.uuid) as is_paid`),

        // Menjumlahkan total yang sudah dibayar dari tabel payment_history
        db.raw(`(SELECT SUM(ph.amount) FROM payment_history ph WHERE ph.bill_uuid = b.uuid) as total_paid`),

        // Mengagregasi total biaya berdasarkan kategori item (tindakan, obat/alkes, ruangan, penunjang)
        db.raw(`SUM(CASE WHEN bi.category_code = '1' THEN bi.price * bi.qty ELSE 0 END) AS total_tindakan`),
        db.raw(`SUM(CASE WHEN bi.category_code IN ('2', '3') THEN bi.price * bi.qty + COALESCE(bi.service_fee, 0) ELSE 0 END) AS total_obat_alkes`),
        db.raw(`SUM(CASE WHEN bi.category_code = '4' THEN bi.price * bi.qty ELSE 0 END) AS total_ruangan`),
        db.raw(`SUM(CASE WHEN bi.category_code = '5' THEN bi.price * bi.qty ELSE 0 END) AS total_penunjang`),
        )
      // Logika inti untuk menangani merged bill
      .where(q => q.where("b.uuid", uuid).orWhere("b.merge_with", uuid))
      .andWhere("b.faskes_uuid", faskesUuid)
      .whereNull("b.deleted_at").whereNull("sb.deleted_at").whereNull("bi.deleted_at")
      // GroupBy yang diperlukan untuk menggunakan fungsi agregasi SUM()
      .groupBy(
        "b.uuid", "p.gender", "b.name", "b.invoice_code", "b.bill_code", "b.patient_uuid",
        "b.grand_total", "b.sub_total", "b.ppn", "b.admin_fee", "b.voucher_code",
        "b.voucher_value", "b.voucher_type", "b.close_bill", "b.status", 
        "p.no_rm", "p.gender", "p.identity", "p.no_identity", "p.phone", "p.religion",
        "bd.birth_date", "bd.age_year", "bd.age_month", "bd.age_day",
        "a.full_address", "a.village", "a.district", "a.city", "a.prov", "a.rt", "a.rw", "a.postal_code",
        );
    
    const bill = await billQuery;
    if (!bill.length) throw new NotfoundException("Bill tidak ditemukan");

    // Proses agregasi hasil query
    // Jika ada tagihan yang di merge, query di atas akan menghasilkan beberapa baris (satu per tagihan)
    // Kode reduce berfungsi untuk menggabungkan semua baris tersebut menjadi satu objek final
    const finalBill = bill.reduce((acc, b) => {
        if (!acc.uuid) {
          // Inisialisasi accumulator dengan data dari baris pertama
            Object.assign(acc, {
                ...b,
                grand_total: 0, sub_total: 0, total_tindakan: 0,
                total_obat_alkes: 0, total_ruangan: 0, total_penunjang: 0, total_paid: 0
            });
        }
        // Akumulasi nilai dari setiap baris
        acc.grand_total += parseFloat(b.grand_total) || 0;
        acc.sub_total += parseFloat(b.sub_total) || 0;
        acc.total_tindakan += parseFloat(b.total_tindakan) || 0;
        acc.total_obat_alkes += parseFloat(b.total_obat_alkes) || 0;
        acc.total_ruangan += parseFloat(b.total_ruangan) || 0;
        acc.total_penunjang += parseFloat(b.total_penunjang) || 0;
        acc.total_paid += parseFloat(b.total_paid) || 0;
        acc.schedule_start_time = b.schedule_start_time;
        acc.schedule_end_time = b.schedule_end_time;
        return acc;
    }, {});

    // Menghitung sisa hutang setelah semua total diagregasi
    const remainingDebt = finalBill.grand_total - finalBill.total_paid;
    finalBill.remaining_debt = remainingDebt > 0 ? remainingDebt : 0;

    // Menyimpan hasil query mentah unutk digunakan di method lain
    finalBill._rawBillResult = bill;
    return finalBill;
  }

  /**
  * @summary Helper internal generik untuk mengambil daftar tagihan dengan paginasi.
  * @description Method ini berfungsi sebagai pusat logika untuk semua endpoint yang
  * menampilkan daftar tagihan. Tujuannya adalah untuk menghindari duplikasi kode
  * dengan menyatukan proses:
  * 1. Membangun query dasar (dari _buildBillListQuery).
  * 2. Menerapkan filter spesifik (misal: hanya tagihan yang sudah ditutup).
  * 3. Menerapkan filter umum (misal: pencarian, rentang tanggal).
  * 4. Mengurutkan hasil dan melakukan paginasi.
  * @private
  * @param {object} params - Objek parameter dari query request, berisi filter umum dan data paginasi.
  * @param {Function} [specificFilter] - (Opsional) Sebuah callback function yang menerima objek query Knex
  * untuk menerapkan kondisi WHERE yang unik bagi setiap jenis daftar tagihan.
  * @returns {Promise<object>} Objek hasil paginasi dari KnexPagination.
  */
  static async _getBillList(params, spesicificFilter) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);

    // Membangun query dasar yang berisi semua join dan data utama
    const query = this._buildBillListQuery()
      .where({ 'b.faskes_uuid': faskesUuid });

    // Menerapkan filter khusus yang membedakan satu daftar dengan lainnya
    if (spesicificFilter) {
      spesicificFilter(query);
    }

    // Menerapkan semua filter umum seperti pencarian, status dan tanggal
    this._applyBillListFilters(query, params);

    // Menguraikan hasil dan mengembalikan data yang sudah terpaginasi
    query.orderBy('b.created_at', 'desc');
    return await KnexPagination.init(query, params);
  }

  /**
  * @summary Membuat subquery untuk mengambil tanggal kunjungan pertama.
  * @description Menggunakan COALESCE untuk mencari tanggal dari berbagai jenis layanan (RJ, RI, IGD)
  * secara berurutan dan mengembalikan yang pertama kali ditemukan.
  * @returns {object} Objek db.raw Knex untuk digunakan di dalam .select()
  * @private
  */
  static _getVisitDateSubquery() {
    return db.raw(`(
      SELECT COALESCE(rj.tanggal_periksa, ri.tanggal_dirawat, igd.tanggal_dirawat)
      FROM service_bill sb
      LEFT JOIN rawat_jalans rj ON sb.layanan_uuid = rj.uuid AND sb.type = 'RJ'
      LEFT JOIN rawat_inaps ri ON sb.layanan_uuid = ri.uuid AND sb.type = 'RI'
      LEFT JOIN instalasi_gawat_darurats igd ON sb.layanan_uuid = igd.uuid AND sb.type = 'IGD'
      WHERE sb.bill_uuid = b.uuid
      ORDER BY sb.created_at ASC
      LIMIT 1
    ) as visit_date`);
  }

  /**
  * @summary Membuat subquery untuk mengambil daftar nama kasir yang unik.
  * @description Menggunakan STRING_AGG untuk menggabungkan semua nama kasir yang terlibat
  * dalam pembayaran sebuah tagihan menjadi satu string.
  * @returns {object} Objek db.raw Knex.
  * @private
  */
 static _getCashierNameSubquery() {
    return db.raw(`(
      SELECT STRING_AGG(DISTINCT cr.nama_kasir, ', ') 
      FROM payment_history ph 
      JOIN cashier_report cr ON ph.kasir_uuid = cr.uuid 
      WHERE ph.bill_uuid = b.uuid
    ) as cashier_name`);
  }

  /**
  * @summary Membuat subquery untuk menentukan tipe pembayaran utama (ASURANSI/TUNAI).
  * @returns {object} Objek db.raw Knex.
  * @private
  */
  static _getPaymentTypeSubquery() {
    return db.raw(`(
      CASE
        WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = b.uuid AND sb.with_insurance = true)
        THEN 'ASURANSI'
        ELSE 'TUNAI'
      END
      ) as payment_type`);
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

    const cashierNames = finalBill.cashier_name ? finalBill.cashier_name.split(', ') : [];

    return { ...finalBill, cashier_name: cashierNames, service_bill };
  }

  // Method public untuk mendapatkan detail tagihan item
  static async GetDetailBillItem(uuid) {
    const { faskesUuid } = Context.get(CTX_AUTHOR);

    const serviceBill = await db("service_bill as sb")
      .where("sb.uuid", uuid)
      .where("sb.faskes_uuid", faskesUuid)
      .select('with_insurance', 'type', 'layanan_uuid')
      .first();

    if (!serviceBill) throw new NotfoundException("Service Bill tidak ditemukan");

    const items = await db("bill_item as bi")
      .where("bi.service_bill_uuid", uuid)
      .select(
        'bi.uuid', 'bi.item_name', 'bi.qty', 'bi.price', 'bi.price_item',
        'bi.service_fee', 'bi.category_code', 'bi.additional_field', 'bi.date_used'
      );

    const paymentType = serviceBill.with_insurance ? 'ASURANSI' : 'TUNAI';

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
    }

    const bill = billDetail;

    return { patient, bill };
  }

  // Method public untuk mendapatkan tagihan yang ditutup
  static async getClosedBill(params) {
    return this._getBillList(params, (query) => {
      query.where('b.close_bill', true);
    });
  }

  // Method public untuk mendapatkan tagihan APS/OTC
  static async getApsOtc(params) {
    const apsOtcTypes = ['OTC', 'LAB', 'FISIO'];
    return this._getBillList(params, (query) => {
      query.whereExists(function() {
        this.select(1).from('service_bill as sb')
          .whereRaw('sb.bill_uuid = b.uuid').whereIn('sb.type', apsOtcTypes);
      });
    })
  }

  // Method public untuk mendapatkan tagihan pelayanan
  static async getPelayanan(params) {
    const apsOtcTypes = ['OTC', 'LAB', 'FISIO'];
    return this._getBillList(params, (query) => {
      query.whereNotExists(function() {
        this.select(1).from('service_bill as sb')
          .whereRaw('sb.bill_uuid = b.uuid').whereIn('sb.type', apsOtcTypes);
      });
    })
  }

  // Method public untuk mendapatkan total tagihan
  static async GetTotalBill(uuid) {
    const finalBill = await this._getBillDetails(uuid);
    delete finalBill._rawBillResult;
    return finalBill;
  }
}