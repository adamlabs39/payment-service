import dotenv from 'dotenv';
import moment from "moment";
import {Context} from "../middlewares/context.js";
import {CTX_AUTHOR} from "../constants/context-constant.js";
import PatientModel from "../models/patient-models.js";
import RawatJalanModel from "../models/rawat-jalan-models.js";
import AntrianPoliModel from "../models/antrian-poli-models.js";
import {Op} from "sequelize";
import JadwalDokterModel from "../models/jadwal-dokter-models.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import InstalasiGawatDaruratModel from "../models/instalasi-gawat-darurat-models.js";
import RawatInapModel from "../models/rawat-inap-models.js";

dotenv.config();

const paginationHelper = (page, limit, total) => {
    const total_page = Math.ceil(total / limit);
    const next = page < total_page ? page + 1 : null;
    const prev = page > 1 ? page - 1 : null;
    return {
        page: parseInt(page),
        page_size: parseInt(limit),
        total_page,
        total_data: total,
        next_page: next,
        prev_page: prev
    };
}

const generateNoRM = async () => {
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    let countPatient = await PatientModel.count({ where: { faskesUuid } });
    countPatient += 1;
    const paddedNumber = countPatient.toString().padStart(6, '0');
    return `${paddedNumber.slice(0, 2)}-${paddedNumber.slice(2, 4)}-${paddedNumber.slice(4, 6)}`;
};


const generateAntrianAdmisi = async () => {
    const today = moment().startOf('day').unix();
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const countPatient = await PatientModel.count({
        where: {
            faskesUuid,
            tanggalDaftar: { [Op.between]: [today, today + 86400] }
        }
    });
    return countPatient.toString().padStart(3, '0');
};

const generateAntrianPoli = async (jadwalUuid) => {
    const today = moment().startOf('day').unix();
    const { faskesUuid } = Context.get(CTX_AUTHOR);

    let [jadwalDokter, countRJ] = await Promise.all([
        (await JadwalDokterModel.findOne({
            where: {
                faskesUuid,
                uuid: jadwalUuid
            },
            attributes: ['start_time', 'code_antrian_poli', 'code_antrian_dokter', 'durasi_pelayanan'],
            plain: true
        })).dataValues,
        RawatJalanModel.count({
            where: {
                faskesUuid,
                tanggalPeriksa: { [Op.between]: [today, today + 86400] },
                jadwalDokterUuid: jadwalUuid
            }
        })
    ]);

    if (!jadwalDokter) throw new BadRequestException('Jadwal Dokter tidak ditemukan');
    const estimateTime = moment(jadwalDokter.start_time, 'HH:mm:ss').unix() + (jadwalDokter.durasi_pelayanan * countRJ++);
    return {
        code_antrian_poli: `${jadwalDokter.code_antrian_poli}-${jadwalDokter.code_antrian_dokter}-${String(countRJ).padStart(3, '0')}`,
        estimate_time: estimateTime
    };
};

const generateNoReg = async () => {
    const today = moment().format('YYMMDD');
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const listModel = [InstalasiGawatDaruratModel, RawatInapModel, RawatJalanModel];

    const count = (
        await Promise.all(listModel.map(model =>
            model.count({
                where: {
                    faskesUuid,
                    createdAt: { [Op.between]: [today, today + 86400] }
                }
            })
        ))
    ).reduce((total, count) => total + count, 0) + 1;

    return `REG${today}${count.toString().padStart(4, '0')}`;
};

const generateNoPelayanan = async (service) => {
    const today = moment().format('YYMMDD');
    const { faskesUuid } = Context.get(CTX_AUTHOR);
    const { model, prefix } = {
        'IGD': { model: InstalasiGawatDaruratModel, prefix: 'IGD' },
        'RI': { model: RawatInapModel, prefix: 'RI' },
        'RJ': { model: RawatJalanModel, prefix: 'RJ' }
    }[service] || {};

    if (!model) throw new Error('Service not found');

    const count = await model.count({
        where: { faskesUuid, createdAt: { [Op.between]: [today, today + 86400] } }
    });

    return `${prefix}${today}${(count + 1).toString().padStart(4, '0')}`;
};



const generateBookingCode = (length = 6) => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '1234567890';
    const randomText = letters + numbers;
    if (length < 2) throw new Error("Length must be at least 2 to ensure a mix of letters and numbers.");
    let result = '';
    result += letters.charAt(Math.floor(Math.random() * letters.length));
    result += numbers.charAt(Math.floor(Math.random() * numbers.length));
    for (let i = 2; i < length; i++) result += randomText.charAt(Math.floor(Math.random() * randomText.length));
    result = result.split('').sort(() => 0.5 - Math.random()).join('');
    return result;
};


const getInfoAge = (birthDate) => {
    const today = moment();
    const birth = moment(birthDate);
    const ageYear = today.diff(birth, 'years');
    birth.add(ageYear, 'years');
    const ageMonth = today.diff(birth, 'months');
    birth.add(ageMonth, 'months');
    const ageDay = today.diff(birth, 'days');

    return {
        ageYear,
        ageMonth,
        ageDay
    };
}

const convertSnakeToCamel = (obj, deep = false) => {
    const newObj = {};
    for (const key in obj) {
        const newKey = key.replace(/(\_\w)/g, (m) => m[1].toUpperCase());
        const value = obj[key];
        newObj[newKey] = (deep && typeof value === 'object' && value !== null)
            ? convertSnakeToCamel(value, true)
            : value;
    }
    return newObj;
}

const convertCamelToSnake = (obj, deep = false) => {
    const newObj = {};
    for (const key in obj) {
        const newKey = key.replace(/([A-Z])/g, (m) => '_' + m.toLowerCase());
        const value = obj[key];
        newObj[newKey] = (deep && typeof value === 'object' && value !== null)
            ? convertCamelToSnake(value, true)
            : value;
    }
    return newObj;
}

const selectAttributes = (record, attributesWithAliases, withConvertToSnake = false) => {
    const convertToSnakeCase = (str) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

    const setNestedValue = (obj, path, value) => {
        const keys = path.split('.');
        keys.reduce((acc, key, index) => {
            if (index === keys.length - 1) {
                acc[key] = value;
            } else {
                if (!acc[key]) acc[key] = {};
                return acc[key];
            }
        }, obj);
    };

    return attributesWithAliases.reduce((acc, attr) => {
        const [key, alias] = attr.includes(' as ') ? attr.split(' as ') : [attr, attr];
        const value = key.split('.').reduce((o, i) => (o ? o[i] : undefined), record);

        const finalAlias = withConvertToSnake ? convertToSnakeCase(alias) : alias;
        setNestedValue(acc, finalAlias, value);
        return acc;
    }, {});
};

const bannerChannel = (channel, data) => {
    console.log('Event Received');
    console.log(`Channel : ${channel}`);
    console.log('Data : ', data);
    console.log('========================================');
}

const checkExistData = async (model, value, column = 'uuid') => {
    const user = Context.get(CTX_AUTHOR);
    const result = await model.findOne({
        where: {
            [column]: value,
            faskesUuid: user.faskesUuid
        },
        attributes: [column]
    });

    return !!result;
};





export {
    paginationHelper,
    generateNoRM,
    getInfoAge,
    convertSnakeToCamel,
    generateNoReg,
    convertCamelToSnake,
    selectAttributes,
    generateBookingCode,
    bannerChannel,
    checkExistData,
    generateAntrianPoli,
    generateAntrianAdmisi,
    generateNoPelayanan
};
