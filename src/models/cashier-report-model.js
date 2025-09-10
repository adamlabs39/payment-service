import { DataTypes, Model } from 'sequelize';
import tableIdentifier from './common/identifier-model.js';
import fieldTime from './common/fieldTime-model.js';
import sequelizeInstance from '../configs/sequelize-instance.js';
import { hookModel } from './common/hook-model.js';

export default class CashierReportModel extends Model {}
CashierReportModel.init(
  {
    ...tableIdentifier,
    nama_kasir: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM('DAYS', 'SHIFT'),
      allowNull: true,
    },
    cashier_report_uuid: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    shift_type: {
      type: DataTypes.ENUM('1', '2', '3'), // 1 = Pagi, 2 = Siang, 3 = Malam
      allowNull: true,
    },
    beginning_balance: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    shift_time_open: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    shift_time_closed: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    days_time_closed: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    ballance: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    ppn: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    cash: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    debit: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    insurance: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    status: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    transaction_total: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    ...fieldTime,
  },
  {
    sequelize: sequelizeInstance,
    tableName: 'cashier_report',
    underscored: true,
    timestamps: false,
    hooks: hookModel,
  }
);
