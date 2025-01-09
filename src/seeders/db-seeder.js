import sequelizeInstance from "../configs/sequelize-instance.js";
import FaskesProfilesModel from "../models/faskes-profiles-model.js";
import VoucherModel from "../models/voucher-model.js";

const DBSeeder = async () => {
    const transaction = await sequelizeInstance.transaction();
    try {
        await FaskesProfilesModel.create({
            faskesUuid: "019328c1-1931-793e-83d0-488bbe962dd4",
            code: "RS001",
            name: "RS Pusat Pertamina",
            addressUuid: "019328c1-1931-793e-83d0-488bbe962dd4",
            phone: "021-1234567",
            email: "dekengane@pusat.com",
            website: "https://pusat.pertamina.com",
            urlGmaps: "https://goo.gl/maps/1234567",
            logo: "https://pusat.pertamina.com/logo.png",
            bgWarna: "#FFFFFF",
            valuePpn: 10,
            statusPpn: true,
            statusBiayaLain: true,
            valueBiayaLain: 100000,
            status: true,
        }, {transaction});

        await VoucherModel.create({
            faskesUuid: "019328c1-1931-793e-83d0-488bbe962dd4",
            qty: 10,
            name: "Voucher 1",
            code: "VCR001",
            start_date: 1731567760,
            end_date: 1931567760,
            type: "persentase",
            value: 10,
            using: 0,
            status: true,
        }, {transaction});
        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

export default DBSeeder;