import db from '../configs/knex-config.js';
import { Context } from '../middlewares/context.js';
import { CTX_AUTHOR } from '../constants/context-constant.js';
import { KnexPagination } from '../helpers/pagination.js';
import NotfoundException from '../exceptions/notfound-exception.js';
import CantProcessDataException from '../exceptions/CantProcessDataException.js';

// --- KUMPULAN HELPER SUBQUERY ---

/**
 * @summary Membuat subquery untuk mengambil daftar nomor kuitansi yang unik.
 * @returns {object} Objek db.raw Knex.
 */
export function getReceiptNumberSubquery() {
  return db.raw(`(
      SELECT ph.receipt_number
      FROM payment_history ph
      WHERE ph.bill_uuid = b.uuid
      ORDER BY ph.created_at DESC
      LIMIT 1
    ) as receipt_number`);
}

/**
 * @summary Membuat subquery untuk mengambil nomor registrasi pertama (RJ/RI).
 * @returns {object} Objek db.raw Knex.
 */
export function getNoRegSubquery() {
  return db.raw(`(
        SELECT COALESCE(rj.no_reg, ri.no_reg) 
        FROM service_bill sb
        LEFT JOIN rawat_jalans rj ON sb.layanan_uuid = rj.uuid AND sb.type = 'RJ'
        LEFT JOIN rawat_inaps ri ON sb.layanan_uuid = ri.uuid AND sb.type = 'RI'
        WHERE sb.bill_uuid = b.uuid 
        ORDER BY sb.created_at ASC
        LIMIT 1
    ) as no_reg`);
}

/**
 * @summary Membuat subquery untuk mengambil tanggal kunjungan pertama.
 * @returns {object} Objek db.raw Knex.
 */
export function getVisitDateSubquery() {
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
 * @returns {object} Objek db.raw Knex.
 */
export function getCashierNameSubquery() {
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
 */
export function getPaymentTypeSubquery() {
  return db.raw(`(
      CASE
        WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = b.uuid AND sb.with_insurance = true)
        THEN 'ASURANSI'
        ELSE 'TUNAI'
      END
      ) as payment_type`);
}

export function getPaymentMethodSubquery() {
  return db.raw(`(
    SELECT ph.payment_method
    FROM payment_history ph
    WHERE ph.bill_uuid = b.uuid
    ORDER BY ph.created_at DESC
    LIMIT 1
    ) as payment_method`);
}

// --- KUMPULAN HELPER PROSES & LOGIKA ---

/**
 * Menghitung grand total final sebuah tagihan setelah memperhitungkan PPN,
 * biaya admin, voucher, dan diskon.
 * PENTING: Voucher diaplikasikan terlebih dahulu sebelum diskon persentase.
 * @param {object} billData - Objek yang berisi data tagihan lengkap.
 * @returns {number} Nilai grand total yang sudah dihitung.
 */
export function calculateBillTotals(billData) {
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

  if (discountPercent > 0) {
    const discountDeduction = total * (discountPercent / 100);
    total -= discountDeduction;
  }

  return total < 0 ? 0 : total;
}

/**
 * @summary Membangun query dasar untuk semua endpoint daftar tagihan.
 * @returns {object} Objek query Knex yang siap difilter.
 */
export function buildBillListQuery() {
  const rjScheduleCTE = db('service_bill as sb')
    .join('rawat_jalans as rj', 'sb.layanan_uuid', 'rj.uuid')
    .join('jadwal_dokter as jd', 'rj.jadwal_dokter_uuid', 'jd.uuid')
    .where('sb.type', 'RJ')
    .select(
      'sb.bill_uuid',
      db.raw(
        `CAST(FLOOR(EXTRACT(EPOCH FROM (TO_TIMESTAMP(rj.tanggal_periksa)::date + jd.start_time::time))) AS INTEGER) as schedule_start_time`
      ),
      db.raw(
        `CAST(FLOOR(EXTRACT(EPOCH FROM (TO_TIMESTAMP(rj.tanggal_periksa)::date + jd.end_time::time))) AS INTEGER) as schedule_end_time`
      )
    )
    .distinctOn('sb.bill_uuid');

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
      'b.uuid',
      'b.name as patient_name',
      'b.invoice_code',
      'b.bill_code',
      'b.grand_total',
      'b.patient_uuid',
      'a.full_address',
      'p.phone as no_handphone',
      'p.gender as jenis_kelamin',
      'p.no_rm',
      'bd.age_year',
      'bd.age_month',
      'bd.age_day',
      'b.status as payment_status',

      // Mengambil data jadwal dan lokasi dari CTE yang sudah dibuat
      'rj_schedule.schedule_start_time',
      'rj_schedule.schedule_end_time',
      'ri_location.room_name',
      'ri_location.bed_number',

      // Flag boolean untuk menandakan apakah tagihan sudah pernah dibayar
      db.raw(`EXISTS (SELECT 1 FROM payment_history ph WHERE ph.bill_uuid = b.uuid) as is_paid`),

      // Mengambil nomor registrasi pertama yang ditemukan
      getNoRegSubquery(),

      // Menggabungkan semua nama praktisi unik yang menangani pasien
      db.raw(`(
              SELECT STRING_AGG(DISTINCT sb.practitioner_name, ', ') 
              FROM service_bill sb WHERE sb.bill_uuid = b.uuid) as practitioner_name`),

      // Status kelengkapan data berdasarkan aturan
      db.raw(
        `(CASE WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = b.uuid AND sb.type = 'IGD') THEN 'Data Tidak Lengkap' ELSE 'Data Lengkap' END) as completeness_status`
      ),

      // Menentukan tipe penjamin (ASURANSI/TUNAI)
      db.raw(
        `(CASE WHEN EXISTS (SELECT 1 FROM service_bill sb WHERE sb.bill_uuid = b.uuid AND sb.with_insurance = true) AND NOT EXISTS (SELECT 1 FROM payment_history ph WHERE ph.bill_uuid = b.uuid AND ph.payment_type = 'CASH') THEN 'ASURANSI' ELSE 'TUNAI' END) as payment_type`
      ),

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
      db.raw(
        `(SELECT STRING_AGG(DISTINCT sb.type::TEXT, ', ') FROM service_bill sb WHERE sb.bill_uuid = b.uuid) as service_type_list`
      )
    )
    .from('bills as b')
    .leftJoin('patients as p', 'b.patient_uuid', 'p.uuid')
    .leftJoin('addresses as a', 'p.address_uuid', 'a.uuid')
    .leftJoin('birth_details as bd', 'p.birth_detail_uuid', 'bd.uuid')
    .leftJoin('rj_schedule', 'b.uuid', 'rj_schedule.bill_uuid')
    .leftJoin('ri_location', 'b.uuid', 'ri_location.bill_uuid');
}

/**
 * @summary Menerapkan filter dinamis ke query daftar tagihan.
 * @param {object} query - Objek query Knex.
 * @param {object} params - Parameter filter dari request.
 */
export function applyBillListFilters(query, params) {
  const serviceTypeMap = { IGD: ['IGD'], RI: ['RI'], RJ: ['RJ'], APS: ['LAB', 'FISIO'], OTC: ['OTC'] };

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
      query.andWhere((q) => q.where('b.uuid', searchTerm).orWhere('p.uuid', searchTerm));
    } else {
      const searchTerms = searchTerm.split(/\s+/);
      for (const term of searchTerms) {
        query.andWhere((q) =>
          q
            .orWhere('b.name', 'ilike', `%${term}%`)
            .orWhere('p.no_rm', 'ilike', `%${term}%`)
            .orWhere('b.invoice_code', 'ilike', `%${term}%`)
            .orWhere('b.bill_code', 'ilike', `%${term}%`)
            .orWhere('a.full_address', 'ilike', `%${term}%`)
        );
      }
    }
  }

  // Filter Tanggal
  if (params.start_date && params.end_date) {
    query.where('b.updated_at', '>=', params.start_date).where('b.updated_at', '<=', params.end_date);
  }

  // Filter Jenis Layanan
  if (params.service_type) {
    const selectedFilters = [].concat(params.service_type);
    const dbServiceTypes = selectedFilters
      .map((type) => serviceTypeMap[type.toUpperCase()])
      .filter(Boolean)
      .flat();
    if (dbServiceTypes.length > 0) {
      query.whereExists((q) =>
        q.select(1).from('service_bill as sb').whereRaw('sb.bill_uuid = b.uuid').whereIn('sb.type', dbServiceTypes)
      );
    }
  }

  // Filter Jenis Pembayaran
  if (params.payment_type && params.payment_type.length > 0) {
    const selectedTypes = [].concat(params.payment_type).map((type) => type.toUpperCase());

    const asuransiCondition = (q) => {
      q.whereExists(function () {
        this.select(1).from('service_bill as sb').whereRaw('sb.bill_uuid = b.uuid').where('sb.with_insurance', true);
      }).whereNotExists(function () {
        this.select(1).from('payment_history as ph').whereRaw('ph.bill_uuid = b.uuid').where('ph.payment_type', 'CASH');
      });
    };

    if (selectedTypes.length === 1) {
      if (selectedTypes[0] === 'ASURANSI') {
        query.where(asuransiCondition);
      } else if (selectedTypes[0] === 'TUNAI') {
        query.where(function () {
          this.whereNotExists(function () {
            this.select(1)
              .from('service_bill as sb')
              .whereRaw('sb.bill_uuid = b.uuid')
              .where('sb.with_insurance', true);
          }).orWhereExists(function () {
            this.select(1)
              .from('payment_history as ph')
              .whereRaw('ph.bill_uuid = b.uuid')
              .where('ph.payment_type', 'CASH');
          });
        });
      }
    }
  }
}

/**
 * @summary Helper generik untuk mengambil daftar tagihan dengan paginasi.
 * @param {object} params - Parameter dari query request.
 * @param {Function} [specificFilter] - Callback untuk filter spesifik.
 * @returns {Promise<object>} Hasil paginasi.
 */
export async function getBillList(params, specificFilter) {
  const { faskesUuid } = Context.get(CTX_AUTHOR);

  const query = buildBillListQuery().where({ 'b.faskes_uuid': faskesUuid });

  if (specificFilter) {
    specificFilter(query);
  }

  applyBillListFilters(query, params);

  query.orderBy('b.created_at', 'desc');
  return await KnexPagination.init(query, params);
}

/**
 * @summary Helper untuk mendapatkan detail tagihan secara menyeluruh dari database.
 * @param {string} uuid - UUID dari tagihan utama.
 * @returns {Promise<object>} Objek detail tagihan yang sudah diagregasi.
 */
export async function getBillDetails(uuid) {
  const { faskesUuid } = Context.get(CTX_AUTHOR);

  const checkIfFindIsMerge = await db('bills as b')
    .where({ 'b.uuid': uuid, 'b.faskes_uuid': faskesUuid })
    .select('b.merge_with')
    .first();
  if (!checkIfFindIsMerge) throw new NotfoundException('Bill tidak ditemukan');
  if (checkIfFindIsMerge.merge_with) throw new CantProcessDataException('Bill tidak dapat di proses');

  const billQuery = db('bills as b')
    .leftJoin('patients as p', 'b.patient_uuid', 'p.uuid')
    .leftJoin('service_bill as sb', 'sb.bill_uuid', 'b.uuid')
    .leftJoin('bill_item as bi', 'bi.service_bill_uuid', 'sb.uuid')
    .leftJoin('birth_details as bd', 'p.birth_detail_uuid', 'bd.uuid')
    .leftJoin('addresses as a', 'p.address_uuid', 'a.uuid')
    .leftJoin('payment_history as ph', 'ph.bill_uuid', 'b.uuid')
    .select(
      'b.uuid',
      'b.name as patient_name',
      'b.invoice_code',
      'b.bill_code',
      'b.patient_uuid',
      'p.gender',
      'b.merge_with',
      'b.grand_total',
      'b.sub_total',
      'b.ppn',
      'b.admin_fee',
      'b.voucher_code',
      'b.voucher_value',
      'b.voucher_type',
      'b.close_bill',
      'b.discount',
      'b.status as payment_status',
      'p.no_rm',

      'p.gender',
      'p.no_identity',
      'p.identity as identity_type',
      'p.phone as no_handphone',
      'p.religion as agama',
      'bd.birth_date as tgl_lahir',
      'bd.age_year',
      'bd.age_month',
      'bd.age_day',
      'a.full_address as alamat',
      'a.village as kelurahan_desa',
      'a.district as kecamatan',
      'a.city as kabupaten_kota',
      'a.prov as provinsi',
      'a.rt',
      'a.rw',
      'a.postal_code as kodepos',

      // Subquery untuk data turunan
      getNoRegSubquery(),
      getPaymentTypeSubquery(),
      getPaymentMethodSubquery(),
      getCashierNameSubquery(),
      getVisitDateSubquery(),
      getReceiptNumberSubquery(),

      // Flag boolean untuk mengecek apakah sudah ada riwayat pembayaran
      db.raw(`EXISTS (SELECT 1 FROM payment_history ph WHERE ph.bill_uuid = b.uuid) as is_paid`),

      // Menjumlahkan total yang sudah dibayar dari tabel payment_history
      db.raw(`(SELECT SUM(ph.amount) FROM payment_history ph WHERE ph.bill_uuid = b.uuid) as total_paid`),

      // Mengagregasi total biaya berdasarkan kategori item (tindakan, obat/alkes, ruangan, penunjang)
      db.raw(`SUM(CASE WHEN bi.category_code = '1' THEN bi.price * bi.qty ELSE 0 END) AS total_tindakan`),
      db.raw(
        `SUM(CASE WHEN bi.category_code IN ('2', '3') THEN bi.price * bi.qty + COALESCE(bi.service_fee, 0) ELSE 0 END) AS total_obat_alkes`
      ),
      db.raw(`SUM(CASE WHEN bi.category_code = '4' THEN bi.price * bi.qty ELSE 0 END) AS total_ruangan`),
      db.raw(`SUM(CASE WHEN bi.category_code = '5' THEN bi.price * bi.qty ELSE 0 END) AS total_penunjang`)
    )
    .where((q) => q.where('b.uuid', uuid).orWhere('b.merge_with', uuid))
    .andWhere('b.faskes_uuid', faskesUuid)
    .whereNull('b.deleted_at')
    .whereNull('sb.deleted_at')
    .whereNull('bi.deleted_at')
    .groupBy(
      'b.uuid',
      'p.gender',
      'b.name',
      'b.invoice_code',
      'b.bill_code',
      'b.patient_uuid',
      'b.grand_total',
      'b.sub_total',
      'b.ppn',
      'b.admin_fee',
      'b.voucher_code',
      'b.voucher_value',
      'b.voucher_type',
      'b.close_bill',
      'b.status',
      'p.no_rm',
      'p.gender',
      'p.identity',
      'p.no_identity',
      'p.phone',
      'p.religion',
      'bd.birth_date',
      'bd.age_year',
      'bd.age_month',
      'bd.age_day',
      'a.full_address',
      'a.village',
      'a.district',
      'a.city',
      'a.prov',
      'a.rt',
      'a.rw',
      'a.postal_code'
    );

  const bill = await billQuery;
  if (!bill.length) throw new NotfoundException('Bill tidak ditemukan');

  const finalBill = bill.reduce((acc, b) => {
    if (!acc.uuid) {
      // Inisialisasi accumulator dengan data dari baris pertama
      Object.assign(acc, {
        ...b,
        grand_total: 0,
        sub_total: 0,
        total_tindakan: 0,
        total_obat_alkes: 0,
        total_ruangan: 0,
        total_penunjang: 0,
        total_paid: 0,
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

// Method public untuk mendapatkan total tagihan
export async function GetTotalBill(uuid) {
  const finalBill = await getBillDetails(uuid);
  delete finalBill._rawBillResult;
  return finalBill;
}
