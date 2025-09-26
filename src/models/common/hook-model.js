import moment from 'moment';

export const hookModel = {
  beforeCreate: (instance) => {
    const unixTimestamp = moment().unix();
    instance.createdAt = unixTimestamp;
    instance.updatedAt = unixTimestamp;
  },
  beforeUpdate: (instance) => {
    instance.updatedAt = moment().unix();
  },
  beforeDefine(attributes) {
    console.log('totoot');
    Object.keys(attributes).forEach((key) => {
      const snakeCase = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (snakeCase !== key) {
        attributes[snakeCase] = attributes[key];
        delete attributes[key];
      }
    });
  },
};
