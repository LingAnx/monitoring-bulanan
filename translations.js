// ══════════════════════════════════════════
// TRANSLATIONS / TERJEMAHAN
// Bahasa Indonesia untuk aplikasi Monitoring Bulanan
// ══════════════════════════════════════════

const T = {
  // ── Role Names ──────────────────────────────────
  role: {
    admin: 'Admin Sistem',
    admin_seksi: 'Admin Seksi',
    kepala_kantor: 'Kepala Kantor',
    pegawai: 'Pegawai'
  },

  // ── Status Labels ───────────────────────────────
  status: {
    draft: 'Draft',
    diajukan: 'Diajukan',
    diverifikasi: 'Diverifikasi',
    diteruskan: 'Diteruskan',
    disetujui: 'Disetujui',
    revisi_admin: 'Revisi Admin',
    revisi_kantor: 'Revisi Kantor',
    ditolak: 'Ditolak',
    menunggu_verifikasi: 'Verifikasi'
  },

  // ── Months (full) ───────────────────────────────
  months: [
    '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ],

  // ── Months (short) ──────────────────────────────
  monthsShort: [
    '', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
  ],

  // ── Days ────────────────────────────────────────
  days: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],

  // ── Navigation Items ────────────────────────────
  nav: {
    dashboard: 'Dashboard',
    buat_laporan: 'Buat Laporan',
    laporan_saya: 'Laporan Saya',
    notifikasi: 'Notifikasi',
    profil_saya: 'Profil Saya',
    verifikasi: 'Verifikasi',
    data_pegawai: 'Data Pegawai',
    laporan_masuk: 'Laporan Masuk',
    persetujuan: 'Persetujuan',
    rekap: 'Rekap',
    manajemen_user: 'Manajemen User',
    laporan: 'Laporan',
    monitoring: 'Monitoring',
    audit_trail: 'Audit Trail',
    backup: 'Backup',
    settings: 'Pengaturan'
  },

  // ── Dashboard Stats ─────────────────────────────
  stats: {
    total_laporan: 'Total Laporan',
    total_pegawai: 'Total Pegawai',
    total_pengguna: 'Total Pengguna',
    jumlah_seksi: 'Jumlah Seksi',
    draft: 'Draft',
    diajukan: 'Diajukan',
    disetujui: 'Disetujui',
    diverifikasi: 'Diverifikasi',
    menunggu_verifikasi: 'Menunggu Verifikasi',
    menunggu_persetujuan: 'Menunggu Persetujuan',
    perlu_revisi: 'Perlu Revisi',
    revisi_admin: 'Revisi Admin',
    revisi_kantor: 'Revisi Kantor',
    ditolak: 'Ditolak',
    diteruskan: 'Diteruskan',
    sudah_lapor: 'Sudah Lapor',
    belum_lapor: 'Belum Lapor',
    sudah_mengirim: 'Sudah Mengirim',
    belum_mengirim: 'Belum Mengirim'
  },

  // ── Table Headers ───────────────────────────────
  headers: {
    no: 'No',
    pegawai: 'Pegawai',
    nama: 'Nama',
    nip: 'NIP',
    username: 'Username',
    role: 'Role',
    seksi: 'Seksi',
    status: 'Status',
    aksi: 'Aksi',
    judul: 'Judul',
    bulan: 'Bulan',
    tahun: 'Tahun',
    periode: 'Periode',
    tanggal: 'Tanggal',
    tanggal_pengajuan: 'Tanggal Pengajuan',
    tanggal_verifikasi: 'Tanggal Verifikasi',
    tanggal_persetujuan: 'Tanggal Persetujuan',
    capaian: 'Capaian',
    kendala: 'Kendala',
    tindak_lanjut: 'Tindak Lanjut',
    rencana_bulan_depan: 'Rencana Bulan Depan',
    catatan_admin: 'Catatan Admin',
    catatan_kantor: 'Catatan Kepala',
    kegiatan: 'Kegiatan',
    tanggal_kegiatan: 'Tanggal',
    detail: 'Detail',
    label: 'Label',
    value: 'Value',
    total: 'Total',
    id: 'ID',
    edit: 'Edit',
    hapus: 'Hapus',
    simpan: 'Simpan',
    batal: 'Batal',
    lihat: 'Lihat',
    periksa: 'Periksa',
    tambahkan: 'Tambahkan',
    kirim: 'Kirim',
    filter: 'Filter',
    export_csv: 'Export CSV',
    export_data: 'Export Data',
    unduh: 'Unduh',
    cetak: 'Cetak',
    reset: 'Reset',
    ajukan: 'Ajukan',
    perbaiki: 'Perbaiki',
    ok: 'OK',
    ya: 'Ya',
    tidak: 'Tidak',
    aktif: 'Aktif',
    nonaktif: 'Nonaktif',
    semua_role: 'Semua Role',
    semua_status: 'Semua Status',
    semua_seksi: 'Semua Seksi',
    semua_bulan: 'Semua Bulan',
    semua_tahun: 'Semua Tahun',
    semua_aksi: 'Semua Aksi',
    cari: 'Cari',
    pencarian: 'Cari nama/username...'
  },

  // ── Messages ────────────────────────────────────
  messages: {
    // Success
    berhasil_disimpan: 'Berhasil disimpan!',
    berhasil_disubmit: 'Berhasil disubmit!',
    berhasil_diajukan: 'Berhasil diajukan!',
    berhasil_diverifikasi: 'Berhasil diverifikasi!',
    berhasil_disetujui: 'Berhasil disetujui!',
    berhasil_dihapus: 'Berhasil dihapus!',
    berhasil_diperbarui: 'Berhasil diperbarui!',
    berhasil_ditambahkan: 'Berhasil ditambahkan!',
    berhasil_direset: 'Berhasil direset!',
    berhasil_dibuatkan: 'Berhasil dibuat!',
    berhasil_disimpan_draft: 'Draft berhasil disimpan!',
    profil_berhasil_diperbarui: 'Profil berhasil diperbarui!',
    pengaturan_berhasil_disimpan: 'Pengaturan berhasil disimpan',
    notifikasi_berhasil_dikirim: 'Notifikasi terkirim',
    semua_notifikasi_dibaca: 'Semua notifikasi dibaca',

    // Error
    gagal_memuat: 'Gagal memuat',
    gagal_disimpan: 'Gagal menyimpan',
    gagal_disubmit: 'Gagal disubmit',
    gagal_diajukan: 'Gagal diajukan',
    gagal_diverifikasi: 'Gagal memverifikasi',
    gagal_disetujui: 'Gagal memproses persetujuan',
    gagal_dihapus: 'Gagal menghapus',
    gagal_diperbarui: 'Gagal memperbarui',
    gagal_ditambahkan: 'Gagal menambahkan',
    gagal_direset: 'Gagal mereset',
    gagal_membuat: 'Gagal membuat',
    gagal_export: 'Gagal mengekspor',
    gagal_memuat_laporan: 'Gagal memuat laporan',
    gagal_memuat_data: 'Gagal memuat data',
    gagal_memuat_riwayat: 'Gagal memuat riwayat',
    gagal_memuat_arsip: 'Gagal memuat arsip',
    gagal_memuat_monitoring: 'Gagal memuat data monitoring',
    gagal_memuat_periode: 'Gagal memuat periode',
    gagal_memuat_pengaturan: 'Gagal memuat pengaturan',
    gagal_memuat_notifikasi: 'Gagal memuat notifikasi',
    gagal_simpan_draft: 'Gagal menyimpan draft',
    gagal_pengajuan: 'Gagal mengajukan laporan',
    gagal_upload: 'Gagal mengunggah file',
    gagal_simpan_profile: 'Gagal menyimpan profil',
    gagal_simpan_pengaturan: 'Gagal menyimpan pengaturan',
    gagal_simpan_notifikasi: 'Gagal mengirim notifikasi',

    // Info
    belumAdaLaporan: 'Belum ada laporan',
    belumAdaData: 'Belum ada data',
    belumAdaRiwayat: 'Belum ada riwayat',
    belumAdaArsip: 'Belum ada arsip',
    belumAdaBackup: 'Belum ada backup',
    belumAdaNotifikasi: 'Belum ada notifikasi',
    tidakAdaData: 'Tidak ada data',
    tidakAdaLaporan: 'Tidak ada laporan',
    tidakAdaLaporanDitemukan: 'Tidak ada laporan ditemukan',
    tidakAdaLaporanPeriode: 'Tidak ada laporan pada periode tersebut',
    tidakAdaRiwayat: 'Tidak ada riwayat',
    tidakAdaArsipLaporan: 'Tidak ada arsip laporan',
    tidakAdaMonitor: 'Tidak ada data monitoring',

    // Dashboard Pegawai
    selesaiLapor: 'Selesai Lapor',
    belumLapor: 'Belum Lapor',
    masihDraft: 'Masih Draft',
    perluPerbaiki: 'Perlu Perbaikan',
    dalamProses: 'Dalam Proses',
    tuntas: 'Tuntas',
    kepatuhan: 'Tingkat Kepatuhan',
    totalLaporanPribadi: 'Total Laporan Pribadi',
    laporanDisetujui: 'Laporan Disetujui',
    laporanDalamProses: 'Laporan Dalam Proses',
    laporanDirevisi: 'Laporan Direvisi',
    filterTahun: 'Filter Tahun',
    semuaTahun: 'Semua Tahun',
    aktivitasAnda: 'Aktivitas Anda',
    noActivity: 'Belum ada aktivitas',
    lengkapiLaporan: 'Lengkapi Laporan',
    lihatCatatanRevisi: 'Lihat Catatan Revisi',
    laporanDibuat: 'Anda membuat laporan',
    laporanDiajukan: 'Anda mengirim laporan',
    laporanDiverifikasi: 'Laporan diverifikasi',
    laporanDisetujui: 'Laporan disetujui',
    laporanDimintaRevisi: 'Laporan diminta revisi',
    lampiranDiunggah: 'Anda mengunggah lampiran',
    tidakAdaPeriode: 'Tidak ada periode aktif',
    tidakAdaNotifikasiBaru: 'Tidak ada notifikasi baru',
    aksesDitolak: 'Akses ditolak',
    loginUlangDiperlukan: 'Login ulang mungkin diperlukan',
    sistemDalamPerawatan: 'Sistem sedang dalam perawatan',

    // Questions
    yakinLogout: 'Apakah Anda yakin ingin logout?',
    yakinHapus: 'Hapus pengguna ini? Laporan terkait mungkin akan terpengaruh.',
    yakinHapusPengguna: 'Hapus pengguna',
    yakinHapusSeksi: 'Hapus seksi ini? Pengguna di seksi ini akan kehilangan referensi seksi.',
    yakinHapusPeriode: 'Hapus periode ini?',
    yakinTutupPeriode: 'Tutup periode ini? Pegawai tidak bisa submit laporan lagi.',
    ajukanLaporan: 'Ajukan laporan ini untuk diverifikasi?',

    // Validation
    namaWajib: 'Nama wajib diisi',
    passwordWajib: 'Password wajib diisi untuk user baru',
    passwordMinimal: 'Password minimal 6 karakter',
    passwordTidakCocok: 'Password tidak cocok',
    periodeWajib: 'Periode bulan/tahun wajib diisi',
    capaianWajib: 'Capaian pekerjaan wajib diisi',
    pilihSeksi: 'Pilih seksi terlebih dahulu!',
    pilihJenis: 'Pilih jenis dokumen!',
    isiDeskripsi: 'Isi deskripsi!',
    simpanDraftDulu: 'Silakan simpan draft terlebih dahulu',
    catatanOpsional: 'Catatan (opsional):',
    catatanVerifikasi: 'Catatan verifikasi:',
    catatanPersetujuan: 'Catatan persetujuan (opsional):',

    // Loading
    memuatData: 'Memuat data...',
    memuat: 'Memuat...',
    memeriksaAutentikasi: 'Memeriksa autentikasi...',
    memuatDashboard: 'Memuat dashboard...',
    menampilkanDashboard: 'Menampilkan dashboard...',

    // Welcome
    selamatDatang: 'Selamat Datang',
    superAdmin: 'Super Admin',

    // Chart
    jumlahKegiatan: 'Jumlah Kegiatan',
    jumlahLaporan: 'Jumlah Laporan',
    trenLaporan: 'Tren Laporan (12 Bulan Terakhir)',
    distribusiStatus: 'Distribusi Status',
    kepatuhanPerSeksi: 'Kepatuhan Per Seksi',
    monitoringLaporanPerSeksi: 'Monitoring Laporan Per Seksi',

    // Activity Timeline
    aktivitasTerbaru: 'Aktivitas Terbaru',
    tidakAdaAktivitas: 'Belum ada aktivitas',

    // Quick Actions
    aksiCepat: 'Aksi Cepat',
    tambahPengguna: 'Tambah Pengguna',
    tambahSeksi: 'Tambah Seksi',
    buatPeriode: 'Buat Periode',
    kirimNotifikasi: 'Kirim Notifikasi',

    // Period
    periodeAktif: 'Periode Aktif',
    periodeAKTIF: '🟢 AKTIF',
    sisaWaktu: 'Sisa Waktu',
    hari: 'hari',
    hariIni: 'hari ini',
    kelolaPeriode: 'Kelola Periode',
    periodWillDatang: 'Akan Datang',
    periodDitutup: 'Ditutup',

    // Audit
    action_login: 'Login',
    action_submit: 'Submit',
    action_verify: 'Verifikasi',
    action_approve: 'Persetujuan',
    action_create: 'Buat',
    action_update: 'Update',
    action_delete: 'Hapus',
    system: 'Sistem',

    // Settings
    namaInstansi: 'Nama Instansi',
    alamatInstansi: 'Alamat Instansi',
    telepon: 'Telepon',
    emailInstansi: 'Email Instansi',
    teksFooter: 'Teks Footer',
    maksUkuranFile: 'Maks Ukuran File (MB)',
    tipeFileDiizinkan: 'Tipe File Diizinkan',
    timezone: 'Timezone',
    perpanjanganDeadline: 'Perpanjangan Deadline (hari)',
    maintenanceMode: 'Maintenance Mode',
    simpanPengaturan: 'Simpan Pengaturan',

    // Print
    cetakLaporan: 'Cetak / Download PDF',
    laporanKinerja: 'Laporan Kinerja Bulanan',
    dicetakPada: 'Dicetak pada',

    // Backup
    buatBackupBaru: 'Buat Backup Baru',
    backupAkanMengekspor: 'Backup akan mengekspor semua data pengguna, laporan, audit trail, dan notifikasi.',
    buatBackupSekarang: '💾 Buat Backup Sekarang',
    membuatBackup: '⏳ Membuat backup...',
    backupBerhasilDibuat: 'Backup berhasil dibuat',

    // Users
    tambahPenggunaBaru: 'Tambah Pengguna',
    editPengguna: 'Edit Pengguna',
    resetPassword: 'Reset Password',
    resetPasswordUntuk: 'Reset Password - ',
    nonaktifkanPengguna: 'Nonaktifkan pengguna ini?',
    aktifkanPengguna: 'Aktifkan pengguna ini?',
    penggunaBerhasilDikonfirmasi: 'Pengguna diaktifkan',
    penggunaBerhasilDinonaktifkan: 'Pengguna dinonaktifkan',

    // Seksi
    tambahSeksiBaru: 'Tambah Seksi',
    editSeksi: 'Edit Seksi',
    sekseiBerhasilDitambahkan: 'Seksi berhasil ditambahkan',
    sekseiBerhasilDiperbarui: 'Seksi berhasil diperbarui',
    sekseiBerhasilDihapus: 'Seksi berhasil dihapus',

    // Monitoring
    totalSudahLapor: 'sudah lapor',
    sudahLaporPegawai: 'Sudah Lapor',
    belumLaporPegawai: 'Belum Lapor',
    monitoringPegawai: 'Pegawai Belum Mengirim',
    laporanPerluRevisi: 'Laporan Perlu Revisi',

    // Notifications
    kirimNotifikasiTitle: 'Kirim Notifikasi',
    tujuan: 'Tujuan',
    judulNotifikasi: 'Judul',
    pesanNotifikasi: 'Pesan',
    tipeNotifikasi: 'Tipe',
    info: 'Info',
    peringatan: 'Peringatan',
    urgent: 'Urgent',
    berhasilStatus: 'Berhasil',
    semuaPengguna: 'Semua Pengguna',

    // Login / Auth
    gagal_login: 'Login gagal',
    error_koneksi: 'Terjadi kesalahan koneksi',

    // Generic errors
    gagal: 'Gagal',

    // Chart label for dataPendukung page
    totalLaporanChart: 'Total Laporan',
    disetujuiChart: 'Disetujui',

    // dataPendukung page
    dataPendukung: 'Data Pendukung',
    belumAdaDataPendukung: 'Belum ada data pendukung',
    hapusDataPendukung: 'Hapus data pendukung ini?',

    // Profile page
    profilSaya: 'Profil Saya',
    gagalMuatProfil: 'Gagal memuat profil',
    namaWajibIsi: 'Nama wajib diisi',
    passwordMinimalKarakter: 'Password minimal 6 karakter',
    profilBerhasilDiperbarui: 'Profil berhasil diperbarui!',
    gagalSimpanProfil: 'Gagal menyimpan profil',
    gagalUpdateProfil: 'Gagal memperbarui profil'
  }
};

// Helper function for status labels — mendelegasikan ke _coreStatusLabel
// global (js/security/encoding.js) jika tersedia, agar konsisten dengan
// allowlist status di seluruh aplikasi.
function statusLabel(status) {
  if (typeof window._coreStatusLabel === 'function') {
    return window._coreStatusLabel(status);
  }
  return T.status[status] || status;
}

// Helper function for role names
function roleName(role) {
  return T.role[role] || role;
}

// Helper function for month names
function monthName(idx) {
  return T.months[idx] || '';
}

// Helper function for short month names
function monthShortName(idx) {
  return T.monthsShort[idx] || '';
}
