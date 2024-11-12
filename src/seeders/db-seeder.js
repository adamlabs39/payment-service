import sequelizeInstance from "../configs/sequelize-instance.js";
import FaskesProfilesModel from "../models/faskes-profiles-model.js";

const DBSeeder = async () => {
    const transaction = await sequelizeInstance.transaction();
    try {
        await FaskesProfilesModel.create({
            faskesUuid: "9d403ufjh43ufh3uf8430ihf",
            code: "RS001",
            name: "RS Pusat Pertamina",
            addressUuid: "9d403ufjh43ufh3uf8430ihf",
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
        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

export default DBSeeder;