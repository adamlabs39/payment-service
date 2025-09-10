import { DataTypes, Model } from 'sequelize';
import sequelizeInstance from '../configs/sequelize-instance.js';
import fieldTime from './common/fieldTime-model.js';
import { hookModel } from './common/hook-model.js';
import tableIdentifier from './common/identifier-model.js';
export default class FaskesProfilesModel extends Model {}
FaskesProfilesModel.init(
  {
    ...tableIdentifier,
    code: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    addressUuid: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(15),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    urlGmaps: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    logo: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    bgWarna: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    valuePpn: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },
    statusPpn: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    statusBiayaLain: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    valueBiayaLain: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    ...fieldTime,
  },
  {
    sequelize: sequelizeInstance,
    tableName: 'faskes_profiles',
    underscored: true,
    timestamps: false,
    hooks: hookModel,
  }
);
