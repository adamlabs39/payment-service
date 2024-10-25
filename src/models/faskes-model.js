import {
    DataTypes,
    Model,
} from "sequelize";
import sequelizeInstance from "../configs/sequelize-instance.js";
import fieldTime from "./common/fieldTime-model.js";
import {uuidv7} from "uuidv7";
import {hookModel} from "./common/hook-model.js";

export default class FaskesModel extends Model {}
FaskesModel.init(
    {
        id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            autoIncrement: true,
            unique: true,
        },
        uuid: {
            type: DataTypes.STRING(255),
            primaryKey: true,
            allowNull: false,
            defaultValue: uuidv7(),
            unique: true,
        },
        code: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        status: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
        },
        ...fieldTime,
    },
    {
        sequelize: sequelizeInstance,
        tableName: "faskes",
        underscored: true,
        timestamps: false,
        hooks: hookModel,
    }
)