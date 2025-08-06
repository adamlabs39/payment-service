import ExcelJS from "exceljs";
import moment from "moment";

export default class ExcelHelper {
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
};