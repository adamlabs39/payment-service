import { DataTypes } from 'sequelize';
import { uuidv7 } from 'uuidv7';

const tableIdentifier = {
  id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    autoIncrement: true,
    unique: true,
    primaryKey: true,
  },
  uuid: {
    type: DataTypes.STRING(255),
    defaultValue: function () {
      return uuidv7();
    },
    allowNull: false,
    unique: true,
  },
  faskesUuid: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: false,
  },
};

export default tableIdentifier;
