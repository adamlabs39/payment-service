import ExcelJS from "exceljs";
import moment from "moment";
import { epochToDate } from "./utility.js";

export default class ExcelHelper {
    static async createPaymentReport(data, res) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Laporan Pembayaran Kunjungan');

        worksheet.columns = [
            { header: 'No.', key: 'no', width: 5 },
            { header: 'No. RM', key: 'no_rm', width: 15 },
            { header: 'Nama Pasien', key: 'patient_name', width: 30 },
            { header: 'Waktu Bayar', key: 'payment_date', width: 25 },
            { header: 'Cara Bayar', key: 'payment_type', width: 15 },
            { header: 'Total Bayar', key: 'amount', width: 20, style: { numFmt: '#,##0' } },
            { header: 'Kasir', key: 'cashier_name', width: 25 },
            { header: 'Invoice', key: 'invoice_code', width: 20 },
            { header: 'Keterangan', key: 'note', width: 35 },
        ];

        data.forEach((row, index) => {
            worksheet.addRow({
                no: index + 1,
                no_rm: row.no_rm,
                patient_name: row.patient_name,
                payment_date: moment.unix(row.payment_date).format('DD-MM-YYYY HH:mm:ss'),
                payment_type: row.payment_type,
                amount: row.amount,
                cashier_name: row.cashier_name,
                invoice_code: row.invoice_code,
                note: row.note
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="laporan-pembayaran-${moment().format('YYYY-MM-DD')}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();
    }

    static async createRevenueReport(data, res) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Laporan Pendapatan');

        worksheet.columns = [
            { header: 'No.', key: 'no', width: 5 },
            { header: 'Total Pendapatan', key: 'total_pendapatan', width: 25 },
            { header: 'Total Tunai', key: 'total_tunai', width: 25 },
            { header: 'Total Debit', key: 'total_debit', width: 25 },
            { header: 'Total Kredit (Asuransi/Piutang)', key: 'total_kredit', width: 35 }
        ];

        worksheet.addRow({
            no: 1,
            total_pendapatan: data.total_pendapatan,
            total_tunai: data.total_tunai,
            total_debit: data.total_debit,
            total_kredit: data.total_kredit
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="laporan-pendapatan-${moment().format('YYYY-MM-DD')}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();
    };

    static async createClosingCashierReport(data, res) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Laporan Closing Kasir');

        worksheet.columns = [
            { header: 'No.', key: 'no', width: 5 },
            { header: 'Jenis Kasir', key: 'type', width: 15 },
            { header: 'Tgl. Buka Kasir', key: 'shiftTimeOpen', width: 25 },
            { header: 'Tgl. Tutup Kasir', key: 'shiftTimeClosed', width: 25 },
            { header: 'Shift', key: 'shift', width: 20 },
            { header: 'Tgl. Closing Harian', key: 'daysTimeClosed', width: 25 },
            { header: 'Petugas', key: 'petugas', width: 30 },
        ];

        const formatShift = (shiftType) => {
            if (shiftType === '1') return 'Pagi';
            if (shiftType === '2') return 'Siang';
            if (shiftType === '3') return 'Malam';
            return '';
        };

        

        data.forEach((row, index) => {
            worksheet.addRow({
                no: index + 1,
                type: row.type,
                shiftTimeOpen: row.shift_time_open ? epochToDate(row.shift_time_open, "datetime") : '-',
                shiftTimeClosed: row.shift_time_closed ? epochToDate(row.shift_time_closed, "datetime") : '-',
                shift: row.type === 'DAYS' ? row.shift_list : formatShift(row.shift_type),
                daysTimeClosed: row.days_time_closed ? epochToDate(row.days_time_closed, "datetime") : '-',
                petugas: row.type === 'DAYS' ? row.petugas_list : row.cashier_name,
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="laporan-closing-kasir-${moment().format('YYYY-MM-DD')}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();
    }
};