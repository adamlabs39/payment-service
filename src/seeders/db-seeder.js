import sequelizeInstance from "../configs/sequelize-instance.js";
import moment from 'moment';
import { uuidv7 } from "uuidv7";

const DBSeeder = async () => {
    const transaction = await sequelizeInstance.transaction();
    const queryInterface = sequelizeInstance.getQueryInterface();

    try {
        console.log("Menghapus Data Lama");

        await queryInterface.bulkDelete('bill_item', null, { transaction });
        await queryInterface.bulkDelete('service_bill', null, { transaction });
        await queryInterface.bulkDelete('payment_history', null, { transaction });
        await queryInterface.bulkDelete('bills', null, { transaction });
        await queryInterface.bulkDelete('voucher', null, { transaction });
        await queryInterface.bulkDelete('faskes_profiles', null, { transaction });

        console.log("Memasukan Data Baru");

        const faskesUuid = "01981726-d5cf-7bc4-97ca-9804168283f7";
        const faskesData = [{
            uuid: uuidv7(), 
            faskes_uuid: faskesUuid, 
            code: "RS001", 
            name: "RS Adameds", 
            address_uuid: uuidv7(),
            phone: "021-1234567", 
            email: "rs@adameds.com", 
            website: "https://adameds.com", 
            url_gmaps: "https://goo.gl/maps/1234567",
            logo: "logo.png", 
            bg_warna: "#FFFFFF", 
            value_ppn: 11, 
            status_ppn: true, 
            status_biaya_lain: true,
            value_biaya_lain: 5000, 
            created_at: moment().unix(), 
            updated_at: moment().unix(),
        }];

        await queryInterface.bulkInsert('faskes_profiles', faskesData, { transaction });

        const voucherData = [{
            uuid: uuidv7(), 
            faskes_uuid: faskesUuid, 
            qty: 100, 
            name: "Diskon Kemerdekaan", 
            code: "MERDEKA17",
            start_date: moment().unix(), 
            end_date: moment().add(30, 'days').unix(), 
            type: "persentase",
            value: 17, 
            using: 0, 
            status: true, 
            created_at: moment().unix(), 
            updated_at: moment().unix(),
        }];

        await queryInterface.bulkInsert('voucher', voucherData, { transaction });

        for (let i = 1; i <= 3; i++) {
            const billUuid = uuidv7();
            const patientUuid = uuidv7();

            await queryInterface.bulkInsert('bills', [{
                uuid: billUuid, 
                faskes_uuid: faskesUuid, 
                patient_uuid: patientUuid, 
                name: `Pasien Seeder ${i}`,
                invoice_code: `INV/2025/07/00${i}`, 
                bill_code: `BILL/2025/07/00${i}`, 
                status: false,
                sub_total: 225000, 
                ppn: 24750, 
                admin_fee: 5000, 
                grand_total: 254750,
                close_bill: false, 
                created_at: moment().unix(), 
                updated_at: moment().unix(),
            }], { transaction });

            const serviceBillUuid = uuidv7();

            await queryInterface.bulkInsert('service_bill', [{
                uuid: serviceBillUuid, 
                bill_uuid: billUuid, 
                faskes_uuid: faskesUuid, 
                type: 'RJ',
                practitioner_name: 'Dr. Budi Seeder',
                service_name: 'Konsultasi Umum', 
                created_at: moment().unix(), 
                updated_at: moment().unix(),
            }], { transaction });

            await queryInterface.bulkInsert('bill_item', [
                { uuid: uuidv7(), 
                    service_bill_uuid: serviceBillUuid, 
                    faskes_uuid: faskesUuid, 
                    item_name: 'Biaya Konsultasi Dokter', 
                    qty: 1, 
                    price: 150000, 
                    price_item: 150000,
                    category_code: '1', 
                    date_used: moment().unix(),
                    created_at: moment().unix(),
                    updated_at: moment().unix(),
                 },
                { uuid: uuidv7(), 
                    service_bill_uuid: serviceBillUuid, 
                    faskes_uuid: faskesUuid, 
                    item_name: 'Biaya Administrasi', 
                    qty: 1, 
                    price: 75000, 
                    price_item: 75000,
                    category_code: '5', 
                    date_used: moment().unix(),
                    created_at: moment().unix(),
                    updated_at: moment().unix(),
                 }
            ], { transaction });
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
