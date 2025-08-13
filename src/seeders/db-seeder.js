import sequelizeInstance from "../configs/sequelize-instance.js";
import moment from 'moment';
import { uuidv7 } from "uuidv7";
import { Op } from "sequelize";

const DBSeeder = async () => {
    const queryInterface = sequelizeInstance.getQueryInterface();
    const transaction = await sequelizeInstance.transaction();

    try {
        console.log("Menghapus data seeder lama...");
        // --- Bagian PENGHAPUSAN DATA ---
        const billsToDelete = await sequelizeInstance.query(
            `SELECT uuid FROM bills WHERE name LIKE 'Pasien Seed %' OR name LIKE 'Pasien Seeder %'`,
            { type: 'SELECT', transaction }
        );
        const billUuidsToDelete = billsToDelete.map(b => b.uuid);
        if (billUuidsToDelete.length > 0) {
            const serviceBillsToDelete = await sequelizeInstance.query(
                `SELECT uuid FROM service_bill WHERE bill_uuid IN (:billUuids)`,
                { replacements: { billUuids: billUuidsToDelete }, type: 'SELECT', transaction }
            );
            const serviceBillUuidsToDelete = serviceBillsToDelete.map(sb => sb.uuid);
            if (serviceBillUuidsToDelete.length > 0) {
                await queryInterface.bulkDelete('bill_item', { service_bill_uuid: { [Op.in]: serviceBillUuidsToDelete } }, { transaction });
            }
            await queryInterface.bulkDelete('service_bill', { bill_uuid: { [Op.in]: billUuidsToDelete } }, { transaction });
            await queryInterface.bulkDelete('payment_history', { bill_uuid: { [Op.in]: billUuidsToDelete } }, { transaction });
        }
        await queryInterface.bulkDelete('bills', { name: { [Op.or]: [{ [Op.like]: 'Pasien Seed %' }, { [Op.like]: 'Pasien Seeder %' }] } }, { transaction });
        await queryInterface.bulkDelete('patients', { no_rm: { [Op.like]: 'SEEDER-%' } }, { transaction });
        await queryInterface.bulkDelete('voucher', { code: { [Op.like]: 'SEEDER-%' } }, { transaction });
        await queryInterface.bulkDelete('faskes_profiles', { code: { [Op.in]: ['AMBA', 'KSHA'] } }, { transaction });

        console.log("Memasukkan data baru...");

        const faskesList = [
            { uuid: "01981726-d5cf-7bc4-97ca-9804168283f7", code: "AMBA", name: "Klinik Adameds" },
            { uuid: "01985e53-92d6-762c-ba36-9bc18ab4be3b", code: "KSHA", name: "Klinik Sehat" }
        ];
        
        const faskesData = faskesList.map(faskes => ({
            uuid: uuidv7(), faskes_uuid: faskes.uuid, code: faskes.code, name: faskes.name,
            address_uuid: uuidv7(), phone: "021-1234567", email: `klinik@${faskes.code}.com`, website: `https://klinik-${faskes.code}.com`,
            url_gmaps: "https://goo.gl/maps/1234567", logo: "logo.png", bg_warna: "#FFFFFF", value_ppn: 11, status_ppn: true,
            status_biaya_lain: true, value_biaya_lain: 5000, created_at: moment().unix(), updated_at: moment().unix(),
        }));
        await queryInterface.bulkInsert('faskes_profiles', faskesData, { transaction });
        console.log("Memasukkan data voucher...");
        const vouchersToSeed = [];
        for (const faskes of faskesList) {
            vouchersToSeed.push(
                {
                    uuid: uuidv7(), faskes_uuid: faskes.uuid, code: `SEEDER-OK-${faskes.code}`,
                    name: 'Voucher Diskon 10 Persen', type: 'persentase', value: 10, qty: 100,
                    status: true, start_date: moment().subtract(1, 'day').unix(), end_date: moment().add(1, 'month').unix(),
                    created_at: moment().unix(), updated_at: moment().unix(),
                },
                {
                    uuid: uuidv7(), faskes_uuid: faskes.uuid, code: `SEEDER-BESAR-${faskes.code}`,
                    name: 'Voucher Potongan 300rb', type: 'potongan', value: 300000, qty: 5,
                    status: true, start_date: moment().subtract(1, 'day').unix(), end_date: moment().add(1, 'month').unix(),
                    created_at: moment().unix(), updated_at: moment().unix(),
                },
                {
                    uuid: uuidv7(), faskes_uuid: faskes.uuid, code: `SEEDER-LAMA-${faskes.code}`,
                    name: 'Voucher Sudah Lewat', type: 'persentase', value: 20, qty: 100,
                    status: true, start_date: moment().subtract(1, 'month').unix(), end_date: moment().subtract(1, 'day').unix(),
                    created_at: moment().unix(), updated_at: moment().unix(),
                },
                {
                    uuid: uuidv7(), faskes_uuid: faskes.uuid, code: `SEEDER-BARU-${faskes.code}`,
                    name: 'Voucher Akan Datang', type: 'persentase', value: 15, qty: 100,
                    status: true, start_date: moment().add(1, 'day').unix(), end_date: moment().add(1, 'month').unix(),
                    created_at: moment().unix(), updated_at: moment().unix(),
                },
                {
                    uuid: uuidv7(), faskes_uuid: faskes.uuid, code: `SEEDER-NONAKTIF-${faskes.code}`,
                    name: 'Voucher Tidak Aktif', type: 'potongan', value: 25000, qty: 100,
                    status: false, start_date: moment().subtract(1, 'day').unix(), end_date: moment().add(1, 'month').unix(),
                    created_at: moment().unix(), updated_at: moment().unix(),
                },
                {
                    uuid: uuidv7(), faskes_uuid: faskes.uuid, code: `SEEDER-HABIS-${faskes.code}`,
                    name: 'Voucher Stok Terbatas', type: 'potongan', value: 10000, qty: 0,
                    status: true, start_date: moment().subtract(1, 'day').unix(), end_date: moment().add(1, 'month').unix(),
                    created_at: moment().unix(), updated_at: moment().unix(),
                }
            );
        }
        await queryInterface.bulkInsert('voucher', vouchersToSeed, { transaction });

        // <<< PERUBAHAN 1: DEFINISIKAN TEMPLATE LAYANAN DI SINI >>>
        const serviceTemplates = [
            {
                type: 'RJ', practitioner: 'Dr. Budi (Poli Umum)', serviceName: 'Konsultasi Rawat Jalan', with_insurance: false,
                items: [
                    { item_name: 'Jasa Konsultasi RJ', price: 150000, category_code: '1' },
                    { item_name: 'Obat Paracetamol', price: 25000, category_code: '2' }
                ]
            },
            {
                type: 'RI', practitioner: 'Dr. Siti (Spesialis Anak)', serviceName: 'Perawatan Rawat Inap Anak', with_insurance: true,
                items: [
                    { item_name: 'Sewa Kamar Kelas 1 (per hari)', price: 750000, category_code: '4' },
                    { item_name: 'Infus Set', price: 120000, category_code: '3' },
                    { item_name: 'Jasa Visite Dokter', price: 250000, category_code: '1' }
                ]
            },
            {
                type: 'IGD', practitioner: 'Dr. Eka (Dokter Jaga)', serviceName: 'Tindakan Gawat Darurat', with_insurance: false,
                items: [
                    { item_name: 'Tindakan Hecting', price: 300000, category_code: '1' },
                    { item_name: 'Obat Anti-Tetanus', price: 175000, category_code: '2' }
                ]
            },
            {
                type: 'OTC', practitioner: 'Apoteker Ana', serviceName: 'Pembelian Obat Bebas', with_insurance: true,
                items: [
                    { item_name: 'Vitamin C 500mg', price: 55000, category_code: '2' },
                    { item_name: 'Plester Luka', price: 15000, category_code: '3' }
                ]
            }
        ];

        const agamaList = ['Islam', 'Kristen Protestan', 'Kristen Katolik', 'Hindu', 'Buddha', 'Lain-lain'];
        const birthPlaces = ['Pasuruan', 'Sidoarjo', 'Bangkalan', 'Kediri', 'Merbabu', 'Rinjani'];
        
        // Buat 10 Pasien & Tagihan untuk SETIAP Faskes
        for (const faskes of faskesList) {
            for (let i = 1; i <= 10; i++) {
                const patientUuid = uuidv7();
                const billUuid = uuidv7();
                const addressUuid = uuidv7();
                const birthDetailUuid = uuidv7();

                const birthDate = moment().subtract(20 + i, 'years').add(i, 'months').add(i, 'days');
                const ageDuration = moment.duration(moment().diff(birthDate));

                await queryInterface.bulkInsert('birth_details', [{
                    uuid: birthDetailUuid,
                    faskes_uuid: faskes.uuid,
                    birth_place: birthPlaces[i % birthPlaces.length],
                    birth_date: birthDate.format('YYYY-MM-DD'),
                    age_year: ageDuration.years(),
                    age_month: ageDuration.months(),
                    age_day: ageDuration.days(),
                    created_at: moment().unix(),
                    updated_at: moment().unix(),
                }], { transaction });
                
                // Buat data pasien (tidak berubah)
                await queryInterface.bulkInsert('patients', [{
                    uuid: patientUuid, faskes_uuid: faskes.uuid, no_rm: `SEEDER-${faskes.code}-00${i}`,
                    name: `Pasien Seed ${i} ${faskes.code}`,
                    gender: i % 2 === 0 ? 'Perempuan' : 'Laki-laki',
                    phone: '08123456789',
                    address_uuid: addressUuid,
                    birth_detail_uuid: birthDetailUuid,
                    religion: agamaList[i % agamaList.length], 
                    status: true, identity: 'KTP', no_identity: `35260000000000${i}`,
                    created_at: moment().unix(), updated_at: moment().unix(),
                }], { transaction });

                await queryInterface.bulkInsert('addresses', [{
                    uuid: addressUuid, faskes_uuid: faskes.uuid,
                    full_address: `Jl. Seeder No. ${i}`,
                    village: `Kel. Cihampelas`, district: `Kec. Coblong`,
                    city: `Kota Bandung`, prov: `Jawa Barat`,
                    rt: `00${i}`, rw: `00${i % 3 + 1}`,
                    postal_code: `40131`, country: 'Indonesia',
                    created_at: moment().unix(), updated_at: moment().unix(),
                }], { transaction });
                
                const templateIndex = i % serviceTemplates.length;
                const selectedService = serviceTemplates[templateIndex];
                
                const serviceBillUuid = uuidv7();
                
                // Buat item tagihan berdasarkan template yang dipilih
                const billItems = selectedService.items.map(item => ({
                    uuid: uuidv7(), service_bill_uuid: serviceBillUuid, faskes_uuid: faskes.uuid,
                    item_name: item.item_name, qty: 1, price: item.price, price_item: item.price,
                    category_code: item.category_code, service_fee: item.service_fee || 0,
                    date_used: moment().unix(), created_at: moment().unix(), updated_at: moment().unix()
                }));

                // Hitung total (tidak berubah, karena sudah dinamis)
                const subTotal = billItems.reduce((acc, item) => acc + item.price, 0);
                const adminFee = 5000;
                const ppn = subTotal * 0.11;
                const grandTotal = subTotal + ppn + adminFee;

                // Masukkan data bills (tidak berubah)
                await queryInterface.bulkInsert('bills', [{
                    uuid: billUuid, faskes_uuid: faskes.uuid, patient_uuid: patientUuid, name: `Pasien Seed ${i} ${faskes.code}`,
                    invoice_code: `INV-${faskes.code}-00${i}`, bill_code: `BILL-${faskes.code}-00${i}`, status: false,
                    sub_total: subTotal, ppn: ppn, admin_fee: adminFee, grand_total: grandTotal,
                    close_bill: false, 
                    created_at: moment().unix(), updated_at: moment().unix(),
                }], { transaction });

                // Masukkan data service_bill berdasarkan template
                await queryInterface.bulkInsert('service_bill', [{
                    uuid: serviceBillUuid, bill_uuid: billUuid, faskes_uuid: faskes.uuid,
                    type: selectedService.type, 
                    practitioner_name: selectedService.practitioner, 
                    service_name: selectedService.serviceName, 
                    with_insurance: selectedService.with_insurance, 
                    date: moment().unix(), created_at: moment().unix(), updated_at: moment().unix(),
                }], { transaction });

                // Masukkan data bill_item yang sudah dinamis
                await queryInterface.bulkInsert('bill_item', billItems, { transaction });
            }
        }

        await transaction.commit();
        console.log('Seeding data bervariasi untuk 2 faskes berhasil!');
    } catch (error) {
        await transaction.rollback();
        console.error('Terjadi error saat seeding:', error);
        throw error;
    }
}

export default DBSeeder;