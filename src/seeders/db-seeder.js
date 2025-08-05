import sequelizeInstance from "../configs/sequelize-instance.js";
import moment from 'moment';
import { uuidv7 } from "uuidv7";
import { Op } from "sequelize";

const DBSeeder = async () => {
    const queryInterface = sequelizeInstance.getQueryInterface();
    const transaction = await sequelizeInstance.transaction();

    try {
        console.log("Menghapus data seeder lama...");
        
        const LOOP_COUNT = 11;
        const seederBillNames = [];
        const seederPatientRms = [];
        for (let i = 1; i <= LOOP_COUNT; i++) {
            seederBillNames.push(`Pasien Seeder ${i}`);
            seederPatientRms.push(`SEEDER-00${i}`);
        }

        // Dapatkan UUID dari data seeder yang akan dihapus
        const billsToDeleteQuery = await sequelizeInstance.query(
            `SELECT uuid FROM bills WHERE name IN (:names)`,
            { replacements: { names: seederBillNames }, type: 'SELECT', transaction }
        );
        const billUuidsToDelete = billsToDeleteQuery.map(b => b.uuid);

        if (billUuidsToDelete.length > 0) {
            const serviceBillsToDeleteQuery = await sequelizeInstance.query(
                `SELECT uuid FROM service_bill WHERE bill_uuid IN (:billUuids)`,
                { replacements: { billUuids: billUuidsToDelete }, type: 'SELECT', transaction }
            );
            const serviceBillUuidsToDelete = serviceBillsToDeleteQuery.map(sb => sb.uuid);

            if (serviceBillUuidsToDelete.length > 0) {
                await queryInterface.bulkDelete('bill_item', { service_bill_uuid: { [Op.in]: serviceBillUuidsToDelete } }, { transaction });
            }
            
            await queryInterface.bulkDelete('service_bill', { bill_uuid: { [Op.in]: billUuidsToDelete } }, { transaction });
            await queryInterface.bulkDelete('payment_history', { bill_uuid: { [Op.in]: billUuidsToDelete } }, { transaction });
        }
        
        await queryInterface.bulkDelete('bills', { name: { [Op.in]: seederBillNames } }, { transaction });
        await queryInterface.bulkDelete('patients', { no_rm: { [Op.in]: seederPatientRms } }, { transaction });
        
        // --- PERBAIKAN: HAPUS DATA MASTER SECARA SELEKTIF ---
        await queryInterface.bulkDelete('voucher', { code: 'MERDEKA17' }, { transaction });
        await queryInterface.bulkDelete('faskes_profiles', { code: 'RS001' }, { transaction });

        console.log("Memasukkan data baru...");

        // --- 1. Data Faskes & Voucher ---
        const faskesUuid = "01981726-d5cf-7bc4-97ca-9804168283f7";
        const faskesData = [{
            uuid: uuidv7(), faskes_uuid: faskesUuid, code: "RS001", name: "RS Adameds", address_uuid: uuidv7(),
            phone: "021-1234567", email: "rs@adameds.com", website: "https://adameds.com", url_gmaps: "https://goo.gl/maps/1234567",
            logo: "logo.png", bg_warna: "#FFFFFF", value_ppn: 11, status_ppn: true, status_biaya_lain: true,
            value_biaya_lain: 5000, created_at: moment().unix(), updated_at: moment().unix(),
        }];
        await queryInterface.bulkInsert('faskes_profiles', faskesData, { transaction });
        
        const voucherData = [{
            uuid: uuidv7(), faskes_uuid: faskesUuid, qty: 100, name: "Diskon Kemerdekaan", code: "MERDEKA17",
            start_date: moment().unix(), end_date: moment().add(30, 'days').unix(), type: "persentase",
            value: 17, using: 0, status: true, created_at: moment().unix(), updated_at: moment().unix(),
        }];
        await queryInterface.bulkInsert('voucher', voucherData, { transaction });

        // --- 2. Buat 3 Data Pasien & Tagihan Lengkap ---
        for (let i = 1; i <= LOOP_COUNT; i++) {
            const patientUuid = uuidv7();
            const billUuid = uuidv7();
            
            await queryInterface.bulkInsert('patients', [{
                uuid: patientUuid, faskes_uuid: faskesUuid, no_rm: `SEEDER-00${i}`, name: `Pasien Seeder ${i}`,
                gender: 'Laki-laki', phone: '08123456789', address_uuid: uuidv7(), status: true,
                identity: 'KTP', no_identity: `352600000000000${i}`, created_at: moment().unix(), updated_at: moment().unix(),
            }], { transaction });
            
            const serviceBillUuid = uuidv7();
            const billItems = [
                { uuid: uuidv7(), service_bill_uuid: serviceBillUuid, faskes_uuid: faskesUuid, item_name: 'Biaya Konsultasi Dokter', qty: 1, price: 150000, price_item: 150000, category_code: '1', service_fee: 0, date_used: moment().unix(), created_at: moment().unix(), updated_at: moment().unix() },
                { uuid: uuidv7(), service_bill_uuid: serviceBillUuid, faskes_uuid: faskesUuid, item_name: 'Biaya Administrasi', qty: 1, price: 75000, price_item: 75000, category_code: '5', service_fee: 0, date_used: moment().unix(), created_at: moment().unix(), updated_at: moment().unix() },
                { uuid: uuidv7(), service_bill_uuid: serviceBillUuid, faskes_uuid: faskesUuid, item_name: 'Paracetamol 500mg', qty: 10, price: 2000, price_item: 20000, service_fee: 500, category_code: '2', date_used: moment().unix(), created_at: moment().unix(), updated_at: moment().unix() },
                { uuid: uuidv7(), service_bill_uuid: serviceBillUuid, faskes_uuid: faskesUuid, item_name: 'Jarum Suntik 3ml', qty: 2, price: 5000, price_item: 10000, category_code: '3', service_fee: 0, date_used: moment().unix(), created_at: moment().unix(), updated_at: moment().unix() }
            ];

            const subTotal = billItems.reduce((acc, item) => acc + item.price_item + (item.service_fee || 0), 0);
            const adminFee = 5000;
            const ppn = subTotal * 0.11;
            const grandTotal = subTotal + ppn + adminFee;

            await queryInterface.bulkInsert('bills', [{
                uuid: billUuid, faskes_uuid: faskesUuid, patient_uuid: patientUuid, name: `Pasien Seeder ${i}`,
                invoice_code: `INV/2025/08/00${i}`, bill_code: `BILL/2025/08/00${i}`, status: false,
                sub_total: subTotal, ppn: ppn, admin_fee: adminFee, grand_total: grandTotal,
                close_bill: false, created_at: moment().unix(), updated_at: moment().unix(),
            }], { transaction });

            await queryInterface.bulkInsert('service_bill', [{
                uuid: serviceBillUuid, bill_uuid: billUuid, faskes_uuid: faskesUuid, type: 'RJ',
                practitioner_name: `Dr. Seeder ${i}`, service_name: 'Konsultasi & Resep',
                date: moment().unix(), created_at: moment().unix(), updated_at: moment().unix(),
            }], { transaction });

            await queryInterface.bulkInsert('bill_item', billItems, { transaction });
        }

        await transaction.commit();
        console.log('Seeding data tagihan lengkap berhasil!');
    } catch (error) {
        await transaction.rollback();
        console.error('Terjadi error saat seeding:', error);
        throw error;
    }
}

export default DBSeeder;
