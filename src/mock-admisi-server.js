// import express from 'express';
// import cors from 'cors';

// const app = express();
// const PORT = 3001;

// app.use(cors());
// app.use(express.json());

// app.get('/test', (req, res) => {
//   res.send('Server mock admisi merespons!');
// });

// const mockPatientDatabase = {};

// for (let i = 1; i <= 20; i++) {
//   mockPatientDatabase[`patient-uuid-${i}`] = {
//     patient_name: `Pasien Mock ${i}`,
//     no_rm: `${Math.floor(Math.random() * 90 + 10)}-${Math.floor(Math.random() * 90 + 10)}-${Math.floor(Math.random() * 90 + 10)}`,
//     gender: i % 2 === 0 ? 'Male' : 'Female',
//     no_identity: `35260000000000${1000 + i}`,
//     identity_type: 'KTP',
//     no_handphone: `0812${Math.floor(100000000 + Math.random() * 900000000)}`,
//     agama: ['Islam', 'Kristen', 'Hindu', 'Budha', 'Khonghucu'][i % 5],
//     tgl_lahir: new Date(1980 + (i % 30), i % 12, (i % 28) + 1).toISOString(),
//     age_year: 20 + (i % 40),
//     age_month: i % 12,
//     age_day: i % 30,
//     alamat: `Jl. Mock No.${i}`,
//     kelurahan_desa: `Kel. Mock ${i}`,
//     kecamatan: `Kec. Mock ${i}`,
//     kabupaten_kota: `Kota Mock ${i}`,
//     provinsi: 'Jawa Barat',
//     rt: `${String(i).padStart(3, '0')}`,
//     rw: `${String((i % 10) + 1).padStart(3, '0')}`,
//     kodepos: `40${100 + i}`,
//   };
// }

// app.get('/api/admisi/v1/patients/:patient_uuid', (req, res) => {
//   const { patient_uuid } = req.params;
//   console.log(`[Mock Admisi] Menerima request untuk pasien UUID: ${patient_uuid}`);

//   const patientData = mockPatientDatabase[patient_uuid];

//   if (patientData) {
//     console.log(`[Mock Admisi] Pasien ditemukan: ${patientData.patient_name}`);
//     res.status(200).json({
//       success: true,
//       payload: patientData,
//     });
//   } else {
//     console.log(`[Mock Admisi] Pasien dengan UUID ${patient_uuid} tidak ditemukan.`);
//     res.status(404).json({
//       success: false,
//       message: `Pasien dengan UUID ${patient_uuid} tidak ditemukan.`,
//     });
//   }
// });

// app.listen(PORT, () => {
//   console.log(`[Mock Admisi Server] Berjalan di http://localhost:${PORT}`);
//   console.log('Endpoint aktif: GET /api/admisi/v1/patients/:patient_uuid');
// });
