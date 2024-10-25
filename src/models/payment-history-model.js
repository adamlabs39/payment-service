import {
    DataTypes,
    Model,
} from "sequelize";
import sequelizeInstance from "../configs/sequelize-instance.js";
import fieldTime from "./common/fieldTime-model.js";
import {hookModel} from "./common/hook-model.js";
import tableIdentifier from "./common/identifier-model.js";

export default class PaymentHistoryModel extends Model {}
PaymentHistoryModel.init(
    {
        ...tableIdentifier,
        billUuid: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        amount: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        accountMember: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        paymentMethod: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        file: {
            type: DataTypes.BLOB,
            allowNull: true,
        },
        petugas: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        kasirUuid: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        claimTo: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        ...fieldTime,
    },
    {
        sequelize: sequelizeInstance,
        tableName: "payment_history",
        underscored: true,
        timestamps: false,
        hooks: hookModel,
    }
)