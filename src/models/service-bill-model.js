import { DataTypes, Model } from 'sequelize';
import sequelizeInstance from '../configs/sequelize-instance.js';
import fieldTime from './common/fieldTime-model.js';
import { hookModel } from './common/hook-model.js';
import tableIdentifier from './common/identifier-model.js';
export default class ServiceBillModel extends Model {}
ServiceBillModel.init(
  {
    ...tableIdentifier,
    billUuid: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM,
      values: ['IGD', 'RI', 'RJ', 'OTC', 'LAB', 'FISIO'],
      allowNull: false,
    },
    practitionerName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    serviceName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    serviceCode: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    layananUuid: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    alreadyClaim: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    grandTotal: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    withInsurance: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    date: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    ...fieldTime,
  },
  {
    sequelize: sequelizeInstance,
    tableName: 'service_bill',
    underscored: true,
    timestamps: false,
    hooks: hookModel,
  }
);
