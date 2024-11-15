import {
    DataTypes,
    Model,
} from "sequelize";
import sequelizeInstance from "../configs/sequelize-instance.js";
import fieldTime from "./common/fieldTime-model.js";
import {hookModel} from "./common/hook-model.js";
import tableIdentifier from "./common/identifier-model.js";

export default class VoucherModel extends Model {}
VoucherModel.init(
    {
        ...tableIdentifier,
        qty: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        code: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        start_date: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        end_date: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        type: {
            type: DataTypes.ENUM,
            values: ["persentase", "potongan"],
            allowNull: false,
        },
        value: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        using: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        status: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        ...fieldTime,
    },
    {
        sequelize: sequelizeInstance,
        tableName: "voucher",
        underscored: true,
        hooks: hookModel,
        timestamps: false,
    }
);
