import {
    DataTypes,
    Model,
} from "sequelize";
import sequelizeInstance from "../configs/sequelize-instance.js";
import fieldTime from "./common/fieldTime-model.js";
import {hookModel} from "./common/hook-model.js";
import tableIdentifier from "./common/identifier-model.js";
export default class BillItemModel extends Model {}
BillItemModel.init(
    {
        ...tableIdentifier,
        serviceBillUuid: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        tarifUuid: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        qty: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        price: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        serviceFee: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        categoryCode: {
            type: DataTypes.ENUM,
            values: ["1", "2", "3", "4", "5"],
            allowNull: false,
        },
        priceItem: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        itemName: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        addtionalField: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        dateUsed: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        ...fieldTime
    },
    {
        sequelize: sequelizeInstance,
        tableName: "bill_item",
        underscored: true,
        timestamps: false,
        hooks: hookModel,
    }
)