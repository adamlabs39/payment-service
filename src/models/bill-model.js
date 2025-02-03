import { DataTypes, Model } from "sequelize";
import sequelizeInstance from "../configs/sequelize-instance.js";
import fieldTime from "./common/fieldTime-model.js";
import { hookModel } from "./common/hook-model.js";
import tableIdentifier from "./common/identifier-model.js";

export default class BillModel extends Model {}
BillModel.init(
  {
    ...tableIdentifier,
    faskesUuid: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    patientUuid: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    invoiceCode: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    billCode: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    mergeWith: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    mergeType: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    subTotal: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    ppn: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    adminFee: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    voucherCode: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    voucherValue: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    voucherType: {
      type: DataTypes.ENUM,
      values: ["persentase", "potongan"],
      allowNull: true,
    },
    discount: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    grandTotal: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    closeBill: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    ...fieldTime,
  },
  {
    sequelize: sequelizeInstance,
    tableName: "bills",
    underscored: true,
    timestamps: false,
    hooks: hookModel,
  }
);
