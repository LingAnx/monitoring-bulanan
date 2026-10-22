// ─────────────────────────────────────────────────────────────
// SECURITY: Script seed untuk environment development.
// Password di bawah HANYA untuk development dan tidak boleh dipakai di production.
// Di production, jalankan dengan flag --prod dan set semua env vars SEED_*_PASSWORD.
// ─────────────────────────────────────────────────────────────
const IS_PROD = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';

function seedPw(envVar, fallback) {
  const val = process.env[envVar];
  if (IS_PROD) {
    if (!val) {
      console.error(`FATAL: ${envVar} belum diset di mode production.`);
      process.exit(1);
    }
    if (val.length < 12) {
      console.error(`FATAL: ${envVar} terlalu pendek (< 12 char) di production.`);
      process.exit(1);
    }
    return val;
  }
  if (!val) {
    console.log(`⚠️  DEV ONLY: ${envVar} kosong → memakai "${fallback}". Ganti sebelum production.`);
    return fallback;
  }
  return val;
}

const ADMIN_PW    = seedPw('SEED_ADMIN_PASSWORD',    'admin123');
const KEPALA_PW   = seedPw('SEED_KEPALA_PASSWORD',   'kepala123');
const ADMITU_PW   = seedPw('SEED_ADMIN_TU_PASSWORD', 'adminTU123');
const ADMINLL_PW  = seedPw('SEED_ADMIN_LL_PASSWORD', 'adminLL123');
const PEGAWAI_PW  = seedPw('SEED_PEGAWAI_PASSWORD',  'pegawai123');

async function setupSeed() {
  try {
    // Insert default seksi
    const seksiList = [
      'Tata Usaha',
      'Status Hukum dan Sertifikasi Kapal',
      'Keselamatan Berlayar, Penjagaan, dan Patroli',
      'Lalu Lintas dan Angkutan Laut'
    ];

    for (const nama of seksiList) {
      const res = await pool.query(
        'INSERT INTO seksi (nama_seksi) VALUES ($1) ON CONFLICT (nama_seksi) DO NOTHING RETURNING id',
        [nama]
      );
      if (res.rows.length > 0) {
        console.log('Seksi seeded:', nama);
      }
    }

    const seksiRows = await pool.query('SELECT id, nama_seksi FROM seksi ORDER BY id');
    console.log('\nDaftar seksi:');
    seksiRows.rows.forEach(r => console.log(`   ${r.id}. ${r.nama_seksi}`));

    const saltRounds = 10;

    // Helper to upsert user
    async function upsertUser(username, password, nama, nip, idSeksi, role, isActive) {
      const hash = await bcrypt.hash(password, saltRounds);
      const res = await pool.query(
        `INSERT INTO users (username, password, nama, nip, id_seksi, role, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (username) DO UPDATE SET password=$2, nama=$3, nip=$4, id_seksi=$5, is_active=$7
         RETURNING id, username, nama, role`,
        [username, hash, nama, nip, idSeksi, role, isActive]
      );
      console.log(`User: ${res.rows[0].nama} (${res.rows[0].username}) [${res.rows[0].role}]`);
      return res.rows[0];
    }

    // Admin (SUPERADMIN)
    const admin = await upsertUser('SUPERADMIN', ADMIN_PW, 'Administrator', '1980010100000001', null, 'SUPERADMIN', true);

    // Kepala Kantor
    const kepala = await upsertUser('KEPALA_KANTOR', KEPALA_PW, 'Kepala Kantor KSOP', '197501011999031002', null, 'KEPALA_KANTOR', true);

    // Admin Seksi Tata Usaha
    const tuSeksi = seksiRows.rows.find(r => r.nama_seksi === 'Tata Usaha');
    const adminTU = await upsertUser('ADMIN_SEKSI', ADMITU_PW, 'Admin Tata Usaha', '198501010000012001', tuSeksi.id, 'ADMIN_SEKSI', true);

    // Admin Seksi Lalu Lintas
    const llSeksi = seksiRows.rows.find(r => r.nama_seksi === 'Lalu Lintas dan Angkutan Laut');
    const adminLL = await upsertUser('ADMIN_SEKSI', ADMINLL_PW, 'Admin Lalu Lintas', '198501010000022002', llSeksi.id, 'ADMIN_SEKSI', true);

    // Pegawai (regular user)
    const pegawai = await upsertUser('PEGAWAI', PEGAWAI_PW, 'Pegawai Tes', '199001012000011001', tuSeksi.id, 'PEGAWAI', true);

    // Sample laporan
    const sampleReports = [
      {
        userId: pegawai.id,
        judul: 'Pelaksanaan Pengawasan Bongkar Muat General Cargo',
        bulan: 7, tahun: 2026,
        isi_kegiatan: JSON.stringify([
          { tanggal: '2026-07-05', kegiatan: 'Pengawasan bongkar muat PT. X', keterangan: 'Berhasil' },
          { tanggal: '2026-07-12', kegiatan: 'Pengawasan bongkar muat PT. Y', keterangan: 'Berhasil' }
        ]),
        capaian: 'Terlaksana 2 kali pengawasan dengan hasil baik',
        kendala: 'Belum ada kendala signifikan',
        tindak_lanjut: 'Melanjutkan pengawasan rutin bulan Agustus',
        rencana_bulan_depan: 'Pengawasan bongkar muat curah cair dan kering',
        status: 'disetujui',
        catatan_admin: 'Sudah diverifikasi lengkap',
        catatan_kantor: 'Disetujui'
      },
      {
        userId: pegawai.id,
        judul: 'Penyusunan Laporan PNBP Bulanan',
        bulan: 8, tahun: 2026,
        isi_kegiatan: JSON.stringify([
          { tanggal: '2026-08-10', kegiatan: 'Pengumpulan data PNBP', keterangan: 'Selesai' },
          { tanggal: '2026-08-15', kegiatan: 'Rekonsiliasi data', keterangan: 'Proses' }
        ]),
        capaian: 'Data PNBP bulan Juli telah terkumpul',
        kendala: 'Beberapa pelabuhan belum melengkapi data',
        tindak_lanjut: 'Mengirim reminder ke pelabuhan yang terlambat',
        rencana_bulan_depan: 'Penyusunan laporan PNBP Agustus',
        status: 'diajukan'
      },
      {
        userId: pegawai.id,
        judul: 'Pengawasan Alat Fungsional Pelabuhan',
        bulan: 8, tahun: 2026,
        isi_kegiatan: JSON.stringify([
          { tanggal: '2026-08-05', kegiatan: 'Inspeksi crane Pelabuhan Tanjung Perak', keterangan: 'Baik' }
        ]),
        capaian: 'Inspeksi berjalan lancar',
        tindak_lanjut: 'Follow-up perbaikan crane no. 3',
        rencana_bulan_depan: 'Inspeksi alat fungsional lainnya',
        status: 'draft'
      }
    ];

    // Wipe existing sample laporan
    await pool.query('DELETE FROM laporan WHERE id_user = $1', [pegawai.id]);

    for (const r of sampleReports) {
      await pool.query(
        `INSERT INTO laporan
         (id_user, judul, bulan, tahun, isi_kegiatan, capaian, kendala, tindak_lanjut, rencana_bulan_depan, status, catatan_admin, catatan_kantor, tanggal_pengajuan, tanggal_verifikasi, tanggal_persetujuan)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          r.userId, r.judul, r.bulan, r.tahun, r.isi_kegiatan,
          r.capaian || null, r.kendala || null, r.tindak_lanjut || null, r.rencana_bulan_depan || null,
          r.status, r.catatan_admin || null, r.catatan_kantor || null,
          r.status === 'draft' ? null : new Date(),
          r.status === 'disetujui' ? new Date('2026-08-02') : null,
          r.status === 'disetujui' ? new Date('2026-08-03') : null
        ]
      );
      console.log(`Laporan: "${r.judul}" [${r.status}]`);
    }

    // Seed sample notifications
    await pool.query(
      `INSERT INTO notifications (id_user, title, message, type) VALUES
       ($1, 'Laporan Diteruskan', '"Pelaksanaan Pengawasan Bongkar Muat" telah diverifikasi Admin Seksi.', 'success'),
       ($1, 'Laporan Disetujui', '"Pelaksanaan Pengawasan Bongkar Muat" telah disetujui Kepala Kantor.', 'success'),
       ($2, 'Laporan Baru Diajukan', 'Pegawai Tes telah mengajukan laporan "Penyusunan Laporan PNBP Bulanan".', 'info')
       ON CONFLICT DO NOTHING`,
      [pegawai.id, kepala.id]
    );

    console.log('\nSeed data setup complete!');
    if (IS_PROD) {
      console.log('\n⚠️  PRODUCTION: password di-set via environment variables.');
      console.log('   Pastikan SEED_ADMIN_PASSWORD, SEED_KEPALA_PASSWORD, dst. sudah benar.');
      console.log('   Jangan tampilkan password di log.');
    } else {
      console.log('\n[DEV ONLY] Login credentials (default dev — ganti di production):');
      console.log('   Superadmin:       SUPERADMIN       (password via SEED_ADMIN_PASSWORD atau default)');
      console.log('   Kepala Kantor:    KEPALA_KANTOR    (password via SEED_KEPALA_PASSWORD atau default)');
      console.log('   Admin Seksi TU:   ADMIN_SEKSI      (password via SEED_ADMIN_TU_PASSWORD atau default)');
      console.log('   Admin Seksi LL:   ADMIN_SEKSI      (password via SEED_ADMIN_LL_PASSWORD atau default)');
      console.log('   Pegawai:          PEGAWAI          (password via SEED_PEGAWAI_PASSWORD atau default)');
      console.log('   ⚠️  Semua default password HANYA untuk development. Ganti di production.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error setting up seed data:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

setupSeed();
