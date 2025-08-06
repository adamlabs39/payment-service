import sequelizeInstance from "../configs/sequelize-instance.js";
import moment from 'moment';
import { uuidv7 } from "uuidv7";
import { Op } from "sequelize";

const DBSeeder = async () => {
    const queryInterface = sequelizeInstance.getQueryInterface();
    const transaction = await sequelizeInstance.transaction();

    try {
        console.log("Menghapus data seeder lama...");
        
        // Dapatkan UUID dari semua tagihan seeder berdasarkan pola nama
        const billsToDelete = await sequelizeInstance.query(
            `SELECT uuid FROM bills WHERE name LIKE 'Pasien Seed %' OR name LIKE 'Pasien Seeder %'`,
            { type: 'SELECT', transaction }
        );
        const billUuidsToDelete = billsToDelete.map(b => b.uuid);

        // Hapus semua data "anak" yang terhubung dengan tagihan tersebut
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
        
        // Hapus data "induk" (bills dan patients) berdasarkan pola
        await queryInterface.bulkDelete('bills', { 
            name: { 
                [Op.or]: [
                    { [Op.like]: 'Pasien Seed %' },
                    { [Op.like]: 'Pasien Seeder %' }
                ]
            } 
        }, { transaction });
        await queryInterface.bulkDelete('patients', { no_rm: { [Op.like]: 'SEEDER-%' } }, { transaction });
        
        // Hapus data master yang dibuat oleh seeder
        await queryInterface.bulkDelete('voucher', { code: { [Op.like]: 'SEEDER-%' } }, { transaction });
        await queryInterface.bulkDelete('faskes_profiles', { code: { [Op.in]: ['AMBA', 'KSHA'] } }, { transaction });

        console.log("Memasukkan data baru...");

        // Definisikan Data Master Faskes
        const faskesList = [
            { uuid: "01981726-d5cf-7bc4-97ca-9804168283f7", code: "AMBA", name: "Klinik Adameds" },
            { uuid: "01985e53-92d6-762c-ba36-9bc18ab4be3b", code: "KSHA", name: "Klinik Sehat" }
        ];

        // Masukkan data kedua faskes
        const faskesData = faskesList.map(faskes => ({
            uuid: uuidv7(), 
            faskes_uuid: faskes.uuid, 
            code: faskes.code, 
            name: faskes.name, 
            address_uuid: uuidv7(), phone: "021-1234567", email: `klinik@${faskes.code}.com`,
            website: `https://klinik-${faskes.code}.com`, url_gmaps: "https://goo.gl/maps/1234567",
            logo: "logo.png", bg_warna: "#FFFFFF", value_ppn: 11, status_ppn: true, 
            status_biaya_lain: true, value_biaya_lain: 5000, 
            created_at: moment().unix(), updated_at: moment().unix(),
        }));
        await queryInterface.bulkInsert('faskes_profiles', faskesData, { transaction });
        
        // Buat 10 Pasien & Tagihan untuk SETIAP Faskes
        for (const faskes of faskesList) {
            for (let i = 1; i <= 10; i++) {
                const patientUuid = uuidv7();
                const billUuid = uuidv7();
                
                // Buat data pasien
                await queryInterface.bulkInsert('patients', [{
                    uuid: patientUuid, faskes_uuid: faskes.uuid, no_rm: `SEEDER-${faskes.code}-00${i}`,
                    name: `Pasien Seed ${i} ${faskes.code}`, gender: 'Laki-laki', phone: '08123456789',
                    address_uuid: uuidv7(), status: true, identity: 'KTP', no_identity: `35260000000000${i}`,
                    created_at: moment().unix(), updated_at: moment().unix(),
                }], { transaction });
                
                // Definisikan item-item tagihan
                const serviceBillUuid = uuidv7();
                const billItems = [
                    { uuid: uuidv7(), service_bill_uuid: serviceBillUuid, faskes_uuid: faskes.uuid, item_name: `SEEDER-Konsultasi Dokter`, qty: 1, price: 150000, price_item: 150000, category_code: '1', service_fee: 0, date_used: moment().unix(), created_at: moment().unix(), updated_at: moment().unix() },
                    { uuid: uuidv7(), service_bill_uuid: serviceBillUuid, faskes_uuid: faskes.uuid, item_name: `SEEDER-Biaya Administrasi`, qty: 1, price: 75000, price_item: 75000, category_code: '5', service_fee: 0, date_used: moment().unix(), created_at: moment().unix(), updated_at: moment().unix() }
                ];

                // Hitung total secara dinamis
                const subTotal = billItems.reduce((acc, item) => acc + item.price_item + (item.service_fee || 0), 0);
                const adminFee = 5000;
                const ppn = subTotal * 0.11;
                const grandTotal = subTotal + ppn + adminFee;

                // Masukkan data ke tabel dalam urutan yang benar
                await queryInterface.bulkInsert('bills', [{
                    uuid: billUuid, faskes_uuid: faskes.uuid, patient_uuid: patientUuid, name: `Pasien Seed ${i} ${faskes.code}`,
                    invoice_code: `INV-${faskes.code}-00${i}`, bill_code: `BILL-${faskes.code}-00${i}`, status: false,
                    sub_total: subTotal, ppn: ppn, admin_fee: adminFee, grand_total: grandTotal,
                    close_bill: false, created_at: moment().unix(), updated_at: moment().unix(),
                }], { transaction });

                await queryInterface.bulkInsert('service_bill', [{
                    uuid: serviceBillUuid, bill_uuid: billUuid, faskes_uuid: faskes.uuid, type: 'RJ',
                    practitioner_name: `Dr. Seeder ${faskes.code}`, service_name: `SEEDER-Konsultasi & Resep`,
                    date: moment().unix(), created_at: moment().unix(), updated_at: moment().unix(),
                }], { transaction });

                await queryInterface.bulkInsert('bill_item', billItems, { transaction });
            }
        }

        await transaction.commit();
        console.log('Seeding data untuk 2 faskes berhasil!');
    } catch (error) {
        await transaction.rollback();
        console.error('Terjadi error saat seeding:', error);
        throw error;
    }
}

export default DBSeeder;
