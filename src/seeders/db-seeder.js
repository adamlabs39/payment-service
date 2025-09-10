import sequelizeInstance from "../configs/sequelize-instance.js";
import moment from 'moment';
import { uuidv7 } from "uuidv7";
import { Op } from "sequelize";

const DBSeeder = async () => {
    const queryInterface = sequelizeInstance.getQueryInterface();
    const transaction = await sequelizeInstance.transaction();

    try {
        console.log("Menghapus data seeder lama...");

        // --- BAGIAN PEMBERSIHAN (AMAN) ---
        const patientsToDelete = await sequelizeInstance.query(
            `SELECT uuid, address_uuid, birth_detail_uuid FROM patients WHERE name LIKE 'Pasien Seed %'`,
            { type: 'SELECT', transaction }
        );
        const patientUuidsToDelete = patientsToDelete.map(p => p.uuid);

        if (patientUuidsToDelete.length > 0) {
            const billsToDelete = await sequelizeInstance.query(
                `SELECT uuid FROM bills WHERE patient_uuid IN (:patientUuids)`,
                { replacements: { patientUuids: patientUuidsToDelete }, type: 'SELECT', transaction }
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
            
            await queryInterface.bulkDelete('bills', { uuid: { [Op.in]: billUuidsToDelete } }, { transaction });

            const addressUuidsToDelete = patientsToDelete.map(p => p.address_uuid).filter(Boolean);
            if (addressUuidsToDelete.length > 0) {
                await queryInterface.bulkDelete('addresses', { uuid: { [Op.in]: addressUuidsToDelete } }, { transaction });
            }
            const birthDetailUuidsToDelete = patientsToDelete.map(p => p.birth_detail_uuid).filter(Boolean);
            if (birthDetailUuidsToDelete.length > 0) {
                await queryInterface.bulkDelete('birth_details', { uuid: { [Op.in]: birthDetailUuidsToDelete } }, { transaction });
            }
        }
        
        await queryInterface.bulkDelete('patients', { uuid: { [Op.in]: patientUuidsToDelete } }, { transaction });
        await queryInterface.bulkDelete('voucher', { code: { [Op.like]: 'SEEDER-%' } }, { transaction });
        await queryInterface.bulkDelete('faskes_profiles', { code: { [Op.in]: ['AMBA', 'KSHA'] } }, { transaction });
        await queryInterface.bulkDelete('lokasi', { name: { [Op.like]: 'SEEDER-%' } }, { transaction });
        await queryInterface.bulkDelete('rawat_jalans', { no_reg: { [Op.like]: 'REG-RJ-%' } }, { transaction });
        await queryInterface.bulkDelete('rawat_inaps', { no_reg: { [Op.like]: 'REG-RI-%' } }, { transaction });
        // JADWAL DOKTER, PRACTITIONER, PEGAWAI TIDAK DIHAPUS

        // --- AKHIR BAGIAN PEMBERSIHAN ---

        console.log("Memasukkan data baru...");

        const faskesList = [
            { uuid: "01981726-d5cf-7bc4-97ca-9804168283f7", code: "AMBA", name: "Klinik Adameds" },
            { uuid: "01985e53-92d6-762c-ba36-9bc18ab4be3b", code: "KSHA", name: "Klinik Sehat" }
        ];
        
        await queryInterface.bulkInsert('faskes_profiles', faskesList.map(faskes => ({
            uuid: uuidv7(), faskes_uuid: faskes.uuid, code: faskes.code, name: faskes.name,
            address_uuid: uuidv7(), phone: "021-1234567", email: `klinik@${faskes.code}.com`, website: `https://klinik-${faskes.code}.com`,
            url_gmaps: "https://goo.gl/maps/1234567", logo: "logo.png", bg_warna: "#FFFFFF", value_ppn: 11, status_ppn: true,
            status_biaya_lain: true, value_biaya_lain: 5000, created_at: moment().unix(), updated_at: moment().unix(),
        })), { transaction });

        console.log("Memasukkan data voucher...");
        const vouchersToSeed = [];
        for (const faskes of faskesList) {
            vouchersToSeed.push(
                { uuid: uuidv7(), faskes_uuid: faskes.uuid, code: `SEEDER-OK-${faskes.code}`, name: 'Voucher Diskon 10 Persen', type: 'persentase', value: 10, qty: 100, status: true, start_date: moment().subtract(1, 'day').unix(), end_date: moment().add(1, 'month').unix(), created_at: moment().unix(), updated_at: moment().unix() },
                { uuid: uuidv7(), faskes_uuid: faskes.uuid, code: `SEEDER-BESAR-${faskes.code}`, name: 'Voucher Potongan 300rb', type: 'potongan', value: 300000, qty: 5, status: true, start_date: moment().subtract(1, 'day').unix(), end_date: moment().add(1, 'month').unix(), created_at: moment().unix(), updated_at: moment().unix() }
            );
        }
        await queryInterface.bulkInsert('voucher', vouchersToSeed, { transaction });

        const serviceTemplates = [
            { type: 'RJ', serviceName: 'Konsultasi Rawat Jalan', with_insurance: false, items: [{ item_name: 'Jasa Konsultasi RJ', price: 150000, category_code: '1' }, { item_name: 'Obat Paracetamol', price: 25000, category_code: '2' }] },
            { type: 'RI', serviceName: 'Perawatan Rawat Inap Anak', with_insurance: true, items: [{ item_name: 'Sewa Kamar Kelas 1 (per hari)', price: 750000, category_code: '4' }, { item_name: 'Infus Set', price: 120000, category_code: '3' }, { item_name: 'Jasa Visite Dokter', price: 250000, category_code: '1' }] },
            { type: 'IGD', serviceName: 'Tindakan Gawat Darurat', with_insurance: false, items: [{ item_name: 'Tindakan Hecting', price: 300000, category_code: '1' }, { item_name: 'Obat Anti-Tetanus', price: 175000, category_code: '2' }] },
            { type: 'OTC', serviceName: 'Pembelian Obat Bebas', with_insurance: true, items: [{ item_name: 'Vitamin C 500mg', price: 55000, category_code: '2' }, { item_name: 'Plester Luka', price: 15000, category_code: '3' }] }
        ];

        const agamaList = ['Islam', 'Kristen Protestan', 'Kristen Katolik', 'Hindu', 'Buddha', 'Khonghucu'];
        const birthPlaces = ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Makassar', 'Semarang'];
        
        for (const faskes of faskesList) {
            const poliUmumUuid = uuidv7();
            const ruangMawarUuid = uuidv7();
            
            await queryInterface.bulkInsert('lokasi', [
                { uuid: poliUmumUuid, faskes_uuid: faskes.uuid, code: 'POLI-UMUM', name: 'SEEDER-Poli Umum', description: 'Poli Umum untuk seeder', phone: '100-001', email: 'poli.umum@seeder.com', url: 'url-poli-umum', location_type: 'UNIT_PELAYANAN', is_poli: true, status: true, pelayanan: 'RJ', no_room: 0, kategori_ruangan_uuid: uuidv7(), created_at: moment().unix(), updated_at: moment().unix() },
                { uuid: ruangMawarUuid, faskes_uuid: faskes.uuid, code: 'R-MAWAR', name: 'SEEDER-Ruang Mawar', no_room: 102, description: 'Ruang Mawar untuk seeder', phone: '100-002', email: 'ruang.mawar@seeder.com', url: 'url-ruang-mawar', location_type: 'RUANG_PERAWATAN', is_poli: false, status: true, pelayanan: 'RI', kategori_ruangan_uuid: uuidv7(), created_at: moment().unix(), updated_at: moment().unix() }
            ], { transaction });

            const dayMap = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
            const todayName = dayMap[moment().day()];
            const [existingSchedule] = await sequelizeInstance.query(
                `SELECT jd.uuid, jd.practitioner_uuid, pg.name as practitioner_name, jd.day, jd.start_time 
                 FROM jadwal_dokter jd 
                 JOIN practitioner p ON jd.practitioner_uuid = p.uuid 
                 JOIN pegawai pg ON p.pegawai_uuid = pg.uuid
                 WHERE p.faskes_uuid = :faskesUuid AND jd.status = true AND jd.day = :todayName 
                 ORDER BY jd.start_time LIMIT 1`,
                { replacements: { faskesUuid: faskes.uuid, todayName: todayName }, type: 'SELECT', transaction }
            );

            const [practitionerRI] = await sequelizeInstance.query(
                `SELECT p.uuid, pg.name as practitioner_name 
                 FROM practitioner p
                 JOIN pegawai pg ON p.pegawai_uuid = pg.uuid
                 WHERE p.faskes_uuid = :faskesUuid AND p.is_doctor = true LIMIT 1`,
                { replacements: { faskesUuid: faskes.uuid }, type: 'SELECT', transaction }
            );

            if (!existingSchedule || !practitionerRI) {
                console.warn(`Tidak ditemukan jadwal/practitioner untuk faskes ${faskes.code}. Melewatkan pembuatan pasien.`);
                continue;
            }

            for (let i = 1; i <= 50; i++) {
                const patientUuid = uuidv7();
                const billUuid = uuidv7();
                const addressUuid = uuidv7();
                const birthDetailUuid = uuidv7();
                const serviceBillUuid = uuidv7();

                const dynamicPhone = `0812${Math.floor(10000000 + Math.random() * 90000000)}`;
                const randomNumberRm = Math.floor(100000 + Math.random() * 900000);
                const rmString = randomNumberRm.toString();
                const formattedRm = `${rmString.substring(0, 2)}-${rmString.substring(2, 4)}-${rmString.substring(4, 6)}`;
                
                const birthDate = moment().subtract(20 + i, 'years').add(i, 'months').add(i, 'days');
                const ageDuration = moment.duration(moment().diff(birthDate));

                await queryInterface.bulkInsert('birth_details', [{
                    uuid: birthDetailUuid, faskes_uuid: faskes.uuid,
                    birth_place: birthPlaces[i % birthPlaces.length],
                    birth_date: birthDate.format('YYYY-MM-DD'),
                    age_year: ageDuration.years(), age_month: ageDuration.months(), age_day: ageDuration.days(),
                    created_at: moment().unix(), updated_at: moment().unix(),
                }], { transaction });
                
                await queryInterface.bulkInsert('patients', [{
                    uuid: patientUuid, faskes_uuid: faskes.uuid, no_rm: formattedRm,
                    name: `Pasien Seed ${i} ${faskes.code}`,
                    gender: i % 2 === 0 ? 'Female' : 'Male',
                    phone: dynamicPhone,
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
                
                let admissionUuid = null;
                if (selectedService.type === 'RJ') {
                    admissionUuid = uuidv7();
                    const scheduleBaseDate = moment().startOf('day');
                    const [startHour, startMinute] = existingSchedule.start_time.split(':');
                    const tanggalPeriksa = scheduleBaseDate.hour(startHour).minute(startMinute).add(i * 15, 'minutes').unix();

                    await queryInterface.bulkInsert('rawat_jalans', [{
                        uuid: admissionUuid, faskes_uuid: faskes.uuid, payment_method: 1,
                        no_reg: `REG-RJ-${faskes.code}-${i}`, patient_uuid: patientUuid,
                        name: `Pasien Seed ${i} ${faskes.code}`, no_rm: formattedRm,
                        gender: i % 2 === 0 ? 'Female' : 'Male',
                        tanggal_daftar: moment().unix(),
                        tanggal_periksa: tanggalPeriksa,
                        practitioner_uuid: existingSchedule.practitioner_uuid,
                        lokasi_uuid: poliUmumUuid,
                        jadwal_dokter_uuid: existingSchedule.uuid,
                        status_rj: 1, status: true,
                        created_at: moment().unix(), updated_at: moment().unix(),
                    }], { transaction });
                } else if (selectedService.type === 'RI') {
                    admissionUuid = uuidv7();
                    await queryInterface.bulkInsert('rawat_inaps', [{
                        uuid: admissionUuid, faskes_uuid: faskes.uuid, payment_method: 1,
                        no_reg: `REG-RI-${faskes.code}-${i}`, patient_uuid: patientUuid,
                        name: `Pasien Seed ${i} ${faskes.code}`, no_rm: formattedRm,
                        gender: i % 2 === 0 ? 'Female' : 'Male',
                        practitioner_uuid: practitionerRI.uuid,
                        tanggal_daftar: moment().unix(),
                        tanggal_dirawat: moment().unix(),
                        maternity: false, multiple_birth: false, entrusted_patient: false,
                        upgrade_class: false, join_bill: false, previous_bill: false,
                        family_bill: false, spare_bed: false, box_baby: false,
                        status_ri: 1, encounter: 'RI', is_internal: true, status: true,
                        lokasi_uuid: ruangMawarUuid,
                        created_at: moment().unix(), updated_at: moment().unix(),
                    }], { transaction });
                }

                let practitionerNameToInsert = 'Petugas Medis'; // Default value

                if (selectedService.type === 'RJ' && existingSchedule) {
                    practitionerNameToInsert = existingSchedule.practitioner_name;
                } else if (selectedService.type === 'RI' && practitionerRI) {
                    practitionerNameToInsert = practitionerRI.practitioner_name;
                } else if (selectedService.type === 'IGD') {
                    practitionerNameToInsert = 'Dokter Jaga IGD'; // Contoh untuk IGD
                } else if (selectedService.type === 'OTC') {
                    practitionerNameToInsert = 'Petugas Farmasi'; // Contoh untuk OTC
                }
                
                if(admissionUuid || ['IGD', 'OTC'].includes(selectedService.type)) {
                    await queryInterface.bulkInsert('service_bill', [{
                        uuid: serviceBillUuid, 
                        bill_uuid: billUuid, 
                        faskes_uuid: faskes.uuid,
                        type: selectedService.type, 
                        service_name: selectedService.serviceName, 
                        with_insurance: selectedService.with_insurance, 
                        layanan_uuid: admissionUuid,
                        practitioner_name: practitionerNameToInsert,
                        date: moment().unix(), 
                        created_at: moment().unix(), 
                        updated_at: moment().unix(),
                    }], { transaction });

                    const billItems = selectedService.items.map(item => ({
                        uuid: uuidv7(), 
                        service_bill_uuid: serviceBillUuid, 
                        faskes_uuid: faskes.uuid,
                        item_name: item.item_name, 
                        qty: 1, 
                        price: item.price, 
                        price_item: item.price,
                        category_code: item.category_code, 
                        service_fee: item.service_fee || 0,
                        date_used: moment().unix(), 
                        created_at: moment().unix(), 
                        updated_at: moment().unix()
                    }));

                    const subTotal = billItems.reduce((acc, item) => acc + item.price, 0);
                    const adminFee = 5000;
                    const ppn = subTotal * 0.11;
                    const grandTotal = subTotal + ppn + adminFee;

                    await queryInterface.bulkInsert('bills', [{
                        uuid: billUuid, faskes_uuid: faskes.uuid, patient_uuid: patientUuid, name: `Pasien Seed ${i} ${faskes.code}`,
                        invoice_code: `INV-${faskes.code}-00${i}`, bill_code: `BILL-${faskes.code}-00${i}`, status: false,
                        sub_total: subTotal, ppn: ppn, admin_fee: adminFee, grand_total: grandTotal,
                        close_bill: false, 
                        created_at: moment().unix(), updated_at: moment().unix(),
                    }], { transaction });

                    await queryInterface.bulkInsert('bill_item', billItems, { transaction });
                }
            }
        }

        await transaction.commit();
        console.log('Seeding data lengkap dengan practitioner berhasil!');
    } catch (error) {
        await transaction.rollback();
        console.error('Terjadi error saat seeding:', error);
        throw error;
    }
}

export default DBSeeder;
