import sequelizeInstance from "../configurations/sequelize-instance.js";
import PatientRepository from "./patient-repository.js";
import MonitoringRoomRepository from "./monitoring-room-repository.js";
import {Context} from "../middlewares/context.js";
import {CTX_AUTHOR} from "../constant/context-constant.js";
import {convertSnakeToCamel, generateNoPelayanan, generateNoReg, selectAttributes} from "../helper/utility.js";
import moment from "moment";
import {eventEmitter} from "../helper/event.js";
import {
    HISTORY_BED_CHANNEL,
    LOG_CANCLE_PELAYANAN_CHANNEL,
    LOG_PELAYANAN_CHANNEL,
} from "../constant/event-constant.js";
import NotfoundException from "../exception/notfound-exception.js";
import PractitionerRepository from "./practitioner-repository.js";
import InsuranceAdmissionRepository from "./insurance-admission-repository.js";
import DuplicateException from "../exception/duplicate-exception.js";
import {Op} from "sequelize";
import {
    PatientModel,
    BirthDetailModel,
    NewBornModel,
    InsuranceAccountModel,
    RoomMonitoringModel,
} from "@adameds/model-sdk/admisi";
import {
    RawatInapModel,
    InsuranceAdmissionModel
} from "@adameds/model-sdk/pelayanan";
import {
    AddressModel
} from "@adameds/model-sdk/setting";
import {
    PractitionerModel,
    PegawaiModel,
    RuanganModel,
    LokasiModel,
    KategoriRuanganModel
} from "@adameds/model-sdk/datamaster";
import Pagination from "../helper/pagination.js";
import newBornRepository from "./newborn-repository.js";
import rawatInapFilter from "./filters/rawat-inap-filter.js";
import { rawatInapInclude } from "./include/rawat-inap-include.js";
import { keperawatanInapFilter } from "./filters/report-filter.js";
import { keperawatanInapInclude } from "./include/report-include.js";

export default class RawatInapRepository {
    static async getAll(args) {
        const {faskesUuid} = Context.get(CTX_AUTHOR);

        const filter = rawatInapFilter({
            faskesUuid, 
            args, 
            options: {} 
        });

        const options = {
            include: rawatInapInclude,
            attributes: ["uuid", "no_reg", "no_rm", "tanggal_daftar", "tanggal_daftar", "tanggal_dirawat", "payment_method", "status_ri", "rekam_medis_uuid", "no_pelayanan"],
        };

        const transform = {
            practitioner: (row) => ({
                uuid: undefined, // delete practitioner uuid
                ...row.practitioner.pegawai.get(),
            }),
        };

        return await Pagination.init(
            RawatInapModel,
            args,
            filter,
            options,
            transform
        )
    }

    static async registBaby(data) {
        const RI =  await sequelizeInstance.transaction(async (transaction) => {
            const user = Context.get(CTX_AUTHOR);
            data = convertSnakeToCamel(data);

            const mom = await PatientRepository.getOnePatientBy('no_identity', data.patientData.no_identity);
            if (!mom) throw new NotfoundException("Identitas Ibu tidak ditemukan! Pastikan Ibu sudah terdaftar sebagai pasien");

            const practitioner = await PractitionerRepository.getPractitionerBy('uuid', data.practitionerUuid);
            if (!practitioner) throw new NotfoundException("Dokter tidak ditemukan");

            const patient = await PatientRepository.registPatient({ ...data.patientData, isNewBorn: true }, transaction);
            if (!patient) throw new Error("Gagal mendaftarkan pasien baru");

            const bedData = await MonitoringRoomRepository.getDetailBed(data.monitoringRoomUuid);

            //* Validasi untuk jam lahir bayi tidak boleh lebih dari saat ini
            if (moment(data.patientData.birth_detail.birth_date).format("YYYY-MM-DD") === moment().format("YYYY-MM-DD") && 
            data.patientData.birth_time > moment().format("HH:mm:ss")) {
                throw new Error("jam lahir bayi tidak boleh lebih dari saat ini");
            }

            const monitoring = await MonitoringRoomRepository.registPatientToBed(bedData.dataValues.uuid, patient.uuid, transaction);

            const registRI = await RawatInapModel.create({
                faskesUuid: user.faskesUuid,
                patientUuid: patient.uuid,
                noReg: await generateNoReg(),
                noPelayanan: await generateNoPelayanan('RI'),
                noRm: patient.noRm,
                name: patient.name,
                birthDetailUuid: patient.birthDetailUuid,
                gender: patient.gender,
                tanggalDaftar: moment().unix(),
                tanggalMasuk: moment().unix(),
                joinBill: true,
                familyBill: data.familyBill,
                boxBaby: true,
                note: data.note,
                complaint: data.complaint,
                multipleBirth: data.multipleBirth,
                paymentMethod: data.paymentMethod === 'TUNAI' ? 1 : 2,
                monitoringRoomUuid: bedData.dataValues.uuid,
                statusRi: 3,
                encounter: "RI",
                practitionerUuid: practitioner.uuid,
                tanggalDirawat: moment().unix()
            }, {
                transaction: transaction,
                returning: true
            });

            if (data.paymentMethod === 'ASURANSI') {
                await InsuranceAdmissionRepository.AsuransiPelayanan({
                    patientUuid: patient.uuid,
                    penjaminUuid: data.insurance.penjamin_uuid,
                    accountNumber: data.insurance.account_number,
                    classEntitle: data.insurance.class_entitle,
                    noReg: registRI.noReg,
                    admissionType: 3,
                }, transaction);
            }

            await newBornRepository.upsertNewBorn({
                identifier_mom: patient.identity,
                name_mom: patient.motherName,
                name_baby: patient.name,
                no_rm_baby: patient.noRm,
                birth_detail_uuid: patient.birthDetailUuid,
                birth_time_baby: data.patientData.birth_time,
                gender_baby: patient.gender,
                multiple_birth: data.multipleBirth,
                address_uuid: patient.address.uuid,
                tanggal_daftar: moment().format("YYYY-MM-DD"),
                status: true,
            }, transaction);

            eventEmitter.emit(HISTORY_BED_CHANNEL, {
                faskesUuid: user.faskesUuid,
                admissionUuid: registRI.uuid,
                monitoringRuanganUuid: monitoring.uuid,
            });

            eventEmitter.emit(LOG_PELAYANAN_CHANNEL, {
                tgl_registrasi: registRI.tanggalDaftar,
                noreg: registRI.noReg,
                practitioner_uuid: practitioner.uuid,
                no_pelayanan: registRI.noPelayanan,
                jenis_kunjungan: "RI",
                patient_uuid: patient.uuid,
                payment_method: data.paymentMethod === 'TUNAI' ? 1 : 2,
            });

            return registRI;
        });

        return this.getDetail(RI.uuid);
    }


    static async updateRawatInap(uuid, data) {
        const transaction = await sequelizeInstance.transaction();
        try {
            const {faskesUuid} = Context.get(CTX_AUTHOR);
            data = convertSnakeToCamel(data);
            console.log("Update Rawat Inap Data:", data);

            const rawatInap = await RawatInapModel.findOne({
                where: {
                    uuid: uuid,
                    faskesUuid: faskesUuid,
                    deletedAt: null
                },
                transaction
            });
            if (!rawatInap) throw new NotfoundException("Rawat Inap tidak ditemukan");

            const patient = await PatientRepository.getOnePatientBy('uuid', rawatInap.patientUuid);
            if (!patient) throw new NotfoundException("Patient tidak ditemukan");

            const practitioner = await PractitionerRepository.getPractitionerBy('uuid', data.practitionerUuid);
            if (!practitioner) throw new NotfoundException("Dokter tidak ditemukan");

            data.patientData.patient_uuid = rawatInap.dataValues.patientUuid;
            data.patientData.is_new_born = patient.isNewBorn || false;
            const updatedPatient = await PatientRepository.registPatient(data.patientData, transaction);
            if (!updatedPatient) throw new Error("Gagal memperbarui pasien");

            if (data.monitoringRoomUuid && rawatInap.statusRi === 1) {
                const bedData = await MonitoringRoomRepository.getDetailBed(data.monitoringRoomUuid);
                await MonitoringRoomRepository.registPatientToBed(bedData.dataValues.uuid, updatedPatient.uuid, transaction);
                eventEmitter.emit(HISTORY_BED_CHANNEL, {
                    faskesUuid: faskesUuid,
                    admissionUuid: rawatInap.uuid,
                    monitoringRuanganUuid: rawatInap.monitoringRoomUuid,
                });
            } else if (data.monitoringRoomUuid !== rawatInap.monitoringRoomUuid && rawatInap.statusRi !== 2) {
                throw new DuplicateException("Tidak dapat memperbarui tempat tidur, status Rawat Inap sedang diproses");
            }

            const updatedRawatInap = await rawatInap.update({
                noRm: updatedPatient.noRm,
                name: updatedPatient.name,
                birthDetailUuid: updatedPatient.birthDetailUuid,
                gender: updatedPatient.gender,
                familyBill: data.familyBill,
                maternity: data.maternity,
                upgradeClass: data.upgradeClass,
                entrustedPatient: data.entrustedPatient,
                previousBill: data.previousBill,
                spareBed: data.spareBed,
                boxBaby: data.boxBaby,
                note: data.note,
                complaint: data.complaint,
                multipleBirth: data.multipleBirth,
                paymentMethod: data.paymentMethod === 'TUNAI' ? 1 : 2,
                monitoringRoomUuid: data.monitoringRoomUuid || rawatInap.monitoringRoomUuid,
                practitionerUuid: practitioner.uuid,
            }, {
                where: {uuid: rawatInap.uuid},
                transaction
            });

            if (data.paymentMethod === 'ASURANSI') {
                await InsuranceAdmissionRepository.AsuransiPelayanan({
                    patientUuid: updatedPatient.uuid,
                    penjaminUuid: data.insurance.penjamin_uuid,
                    accountNumber: data.insurance.account_number,
                    classEntitle: data.insurance.class_entitle,
                    noReg: updatedRawatInap.noReg,
                    admissionType: 3,
                }, transaction)
            }

            await newBornRepository.upsertNewBorn(
              {
                identifier_mom: patient.identity,
                name_mom: patient.motherName,
                name_baby: patient.name,
                no_rm_baby: patient.noRm,
                birth_detail_uuid: patient.birthDetailUuid,
                birth_time_baby: data.patientData.birth_time,
                gender_baby: patient.gender,
                multiple_birth: data.multipleBirth,
                address_uuid: updatedPatient.address.uuid,
                status: true,
              },
              transaction
            );

            eventEmitter.emit(LOG_PELAYANAN_CHANNEL, {
                tgl_registrasi: rawatInap.tanggalDaftar,
                noreg: rawatInap.noReg,
                no_pelayanan: rawatInap.noPelayanan,
                practitioner_uuid: practitioner.uuid,
                jenis_kunjungan: "RI",
                patient_uuid: updatedPatient.uuid,
                payment_method: data.paymentMethod === 'TUNAI' ? 1 : 2,
            });
            await transaction.commit();

            return await this.getDetail(updatedRawatInap.uuid);

        } catch (error) {
            console.error("Error updating Rawat Inap:", error);
            await transaction.rollback();
            throw error;
        }
    }

    static async getDetail(uuid) {
        const {faskesUuid} = Context.get(CTX_AUTHOR);
        try {
            const rawatInap = await RawatInapModel.findOne({
            where: {
            uuid: uuid,
            faskesUuid,
            deletedAt: null,
            },
            include: [
            {
                model: PatientModel,
                as: "patient",
                required: true,
                where: { deletedAt: { [Op.is]: null } },
                include: [
                {
                    model: AddressModel,
                    as: "address",
                    required: true,
                    where: { deletedAt: { [Op.is]: null } },
                    attributes: ["uuid", "full_address", "prov", "city", "district", "rt", "rw", "village", "country", "postal_code"],
                },
                {
                    model: BirthDetailModel,
                    as: "birth_detail",
                    required: true,
                    where: { deletedAt: { [Op.is]: null } },
                    attributes: ["birth_place", "birth_date", "age_year", "age_month", "age_day"],
                },
                ],
                attributes: ["uuid", "no_rm", "title", "name", "identity", "no_identity", "gender", "phone", "religion", "language", "mother_name", "maritial_status", "status", "is_new_born"],
            },
            {
                model: RoomMonitoringModel,
                as: "monitoring_room",
                required: true,
                where: { deletedAt: { [Op.is]: null } },
                attributes: ["uuid", "room_uuid", "no_bed"],
                include: [
                {
                    model: LokasiModel,
                    as: "bed_lokasi",
                    required: true,
                    where: { deletedAt: { [Op.is]: null } },
                    attributes: ["uuid", "code", "name", "class_code", "class_name"],
                },
                {
                    model: LokasiModel,
                    as: "room",
                    required: true,
                    where: { deletedAt: { [Op.is]: null } },
                    attributes: ["uuid", "code", "name", "class_code", "class_name"],
                    include: [
                    {
                        model: KategoriRuanganModel,
                        as: "kategori_ruangan",
                        required: true,
                        where: { deletedAt: { [Op.is]: null } },
                        attributes: ["uuid", "code", "name"],
                    },
                    ],
                },
                ],
                },
                {
                model: PractitionerModel,
                as: "practitioner",
                required: true,
                where: {deletedAt: {[Op.is]: null}},
                attributes: ["uuid"],
                include: [
                    {
                        model: PegawaiModel,
                        as: "pegawai",
                        required: true,
                        where: {deletedAt: {[Op.is]: null}},
                        attributes: ["first_title", "last_title", ["name", "nama"], "nik"]
                    }
                ]
                }
            ],
            attributes: [
            "uuid",
            "no_reg",
            "tanggal_daftar",
            "payment_method",
            "maternity",
            "note",
            "complaint",
            "practitioner_uuid",
            "status_ri",
            "multiple_birth",
            "entrusted_patient",
            "upgrade_class",
            "join_bill",
            "previous_bill",
            "family_bill",
            "spare_bed",
            "box_baby",
            "monitoring_room_uuid",
            "no_spri",
            "no_pelayanan",
            "tanggal_dirawat"
            ],
            });

            if (!rawatInap) throw new NotfoundException("Rawat Inap tidak ditemukan");

            if (rawatInap.patient.dataValues.is_new_born) {
                const newBorn = await NewBornModel.findOne({
                    where: {faskesUuid, no_rm_baby: rawatInap.patient.dataValues.no_rm},
                    attributes: [
                        "identifier_mom", "name_mom", "name_baby", "no_rm_baby",
                        "birth_detail_uuid", "birth_time_baby", "gender_baby",
                        "multiple_birth", "address_uuid", "tanggal_daftar"
                    ]
                });
                if (newBorn) rawatInap.patient.dataValues.new_born = newBorn.dataValues;
            }


            if (rawatInap.monitoring_room) {
                const detailRuangan = await RuanganModel.findOne({
                    where: { uuid: rawatInap.monitoring_room.dataValues.room_uuid },
                    attributes: ["kategori_ruangan_uuid"]
                });

                if (detailRuangan) {
                    rawatInap.monitoring_room.dataValues.kategori_ruangan_uuid = detailRuangan.kategori_ruangan_uuid;
                }

            }

            if (rawatInap.dataValues.payment_method === 2) {
                const insuranceData = await InsuranceAdmissionModel.findOne({
                    where: { noReg: rawatInap.dataValues.no_reg },
                    include: [
                        {
                            model: InsuranceAccountModel,
                            as: "insurance",
                            required: true,
                            where: {
                                deletedAt: { [Op.is]: null }
                            },
                            attributes: [
                                "account_number",
                                "code",
                                "name",
                                "class_entitle"
                            ]
                        }
                    ],
                    attributes: ["insurance_account_uuid"]
                });

                if (insuranceData) {
                    rawatInap.dataValues.insurance = insuranceData.dataValues.insurance;
                }

                return {
                    ...rawatInap.get(),
                    patient: rawatInap.patient.get()
                };
            }

            return rawatInap;
        } catch (error) {
            console.error("Error get detail Rawat Inap:", error);
            throw error;
        }
    }


    static async cancelVisit(data) {
        const {faskesUuid} = Context.get(CTX_AUTHOR);
        data = convertSnakeToCamel(data);
        try {
            return sequelizeInstance.transaction(async (t) => {
                const rawatInap = await RawatInapModel.findAll({
                    where: {
                        uuid: data.listUuid,
                        faskesUuid,
                        statusRi: {[Op.not]: 0}
                    },
                    transaction: t
                })

                const isProcessed = rawatInap.filter((ri) => ri.statusRi >= 2);
                if (isProcessed.length > 0) throw new Error("Tidak dapat membatalkan Rawat Inap yang sedang diproses");

                if (rawatInap.length === 0) throw new NotfoundException("Rawat Inap tidak ditemukan");

                await RawatInapModel.update({
                    statusRi: 0
                }, {
                    where: {
                        uuid: data.listUuid,
                        faskesUuid
                    },
                    transaction: t
                });

                //* MENGHAPUS PASIEN DARI ROOM MONITORING
                for (const riModel of rawatInap) {
                    if (riModel.monitoringRoomUuid) {
                        await RoomMonitoringModel.update(
                        {
                            patientUuid: null,
                            status_operasional: "Tersedia"
                        },
                        {
                            where: {
                            uuid: riModel.monitoringRoomUuid,
                            faskesUuid
                            },
                            transaction: t
                        }
                        );
                    }
                }
                
                eventEmitter.emit(LOG_CANCLE_PELAYANAN_CHANNEL, {
                    list_no_pelayanan: rawatInap.map((ri) => ri.noPelayanan),
                    cancel_reason: data.cancelReason
                });

                return rawatInap;
            })
        } catch (error) {
            console.error("Error cancel visit Rawat Inap:", error);
            throw error;
        }
    }


    static async getReport(args) {
        const { faskesUuid } = Context.get(CTX_AUTHOR);
        try {
            const filter = keperawatanInapFilter({ faskesUuid, args, options: {} });

            const options = {
                include: keperawatanInapInclude,
                attributes: ["no_rm", "tanggal_daftar", "tanggal_dirawat", "discharge_date"],
            };

            return await Pagination.init(
                RawatInapModel,
                args,
                filter,
                options
            );

        } catch (error) {
            console.error("Error get report Rawat Inap:", error);
            throw error;
        }
    }

}