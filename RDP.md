# Sistem Digitalisasi Laporan Kinerja Bulanan

> **Dokumen acuan utama untuk developer dan AI coding agent**  
> KSOP Kelas II Cirebon · RDP v1.0 · Bahasa antarmuka: Indonesia · Zona waktu: `Asia/Jakarta`

## 1. Ringkasan Proyek

Sistem Digitalisasi Laporan Kinerja Bulanan adalah aplikasi web internal untuk menyusun, memeriksa, merevisi, menyetujui, merekap, dan memantau laporan kinerja bulanan pada setiap seksi di KSOP Kelas II Cirebon.

| Komponen | Teknologi/Keterangan |
| --- | --- |
| Frontend | HTML, CSS, Vanilla JavaScript |
| Backend | Node.js + Express.js |
| Database | PostgreSQL |
| Autentikasi | JWT |
| Pengguna | Pegawai, Admin Seksi, Kepala Kantor, Superadmin |
| Deployment awal | Web server internal/server instansi |

Tujuan utama sistem:

- mendigitalisasi pelaporan kinerja bulanan;
- menjaga workflow verifikasi dan persetujuan;
- menyediakan revisi yang terlacak;
- memudahkan monitoring, rekapitulasi, dan ekspor;
- menjaga integritas data melalui audit trail;
- memberikan administrasi sistem yang aman tanpa mencampurkan kewenangan tiap role.

## 2. Instruksi Wajib untuk AI Agent

Sebelum mengubah kode:

1. Baca README ini sampai selesai.
2. Periksa struktur repository, implementasi yang sudah ada, konfigurasi, dan status Git.
3. Identifikasi file yang benar-benar berkaitan dengan permintaan.
4. Pertahankan arsitektur, route, folder, desain, dan fitur yang sudah berjalan.
5. Kerjakan hanya ruang lingkup yang diminta; jangan melakukan refactor besar tanpa kebutuhan.
6. Jangan mengarang nama file, endpoint, tabel, environment variable, atau perintah setup yang belum ditemukan di repository.
7. Jangan menghapus atau menimpa perubahan pengguna yang tidak berkaitan.
8. Terapkan otorisasi dan business rule di backend; pemeriksaan frontend hanya untuk UX.
9. Setelah perubahan, jalankan pengujian yang relevan dan regression test pada alur terkait.
10. Laporkan file yang diubah, alasan perubahan, hasil pengujian, serta risiko atau pekerjaan tersisa.

Prinsip utama:

```text
FIX FEATURES, NOT STRUCTURE.
```

Jika ada bug:

```text
Cari sumber bug → perbaiki fitur terkait → test → regression test → lanjut
```

Hindari pola berikut:

```text
Satu bug → refactor seluruh project → ubah folder/API → merusak workflow
```

### Larangan keras

- Jangan memberi Superadmin hak verifikasi atau persetujuan laporan.
- Jangan menentukan role hanya berdasarkan URL atau tampilan frontend.
- Jangan mengandalkan filter frontend untuk isolasi data.
- Jangan mengizinkan Pegawai mengubah laporan berstatus `diteruskan` atau `disetujui`.
- Jangan melakukan automatic retry untuk request mutasi.
- Jangan hard-delete user yang memiliki histori.
- Jangan menyimpan backup di direktori publik seperti `/uploads`.
- Jangan menampilkan password, token, JWT secret, database password, atau secret lain.
- Jangan menerapkan constraint unik sebelum data duplikat lama diperiksa dan dibersihkan.

## 3. Sumber Kebenaran dan Prioritas Keputusan

Jika dokumentasi dan kode berbeda, jangan langsung menulis ulang sistem. Lakukan urutan berikut:

1. Amati perilaku dan struktur implementasi saat ini.
2. Bandingkan dengan aturan bisnis dalam README ini.
3. Pertahankan implementasi yang stabil selama tidak melanggar aturan bisnis atau keamanan.
4. Bila ditemukan konflik yang mengubah keputusan produk, dokumentasikan dan minta konfirmasi.

Urutan prioritas:

1. keamanan dan integritas data;
2. workflow laporan;
3. isolasi role dan seksi;
4. kompatibilitas dengan implementasi yang sudah berjalan;
5. konsistensi UI/UX;
6. peningkatan fitur.

## 4. Role dan Kewenangan

### 4.1 Pegawai

Pegawai membuat dan mengelola laporan miliknya sendiri.

**Boleh:**

- membuat dan menyimpan draft;
- mengedit draft;
- mengajukan laporan;
- memperbaiki laporan berstatus `revisi_admin` atau `revisi_kantor`;
- mengajukan ulang laporan;
- melihat laporan, riwayat, notifikasi, dan profil sendiri.

**Tidak boleh:**

- melihat laporan pegawai lain;
- memverifikasi atau menyetujui laporan;
- mengedit laporan berstatus `diteruskan` atau `disetujui`.

### 4.2 Admin Seksi

Admin Seksi adalah pemeriksa pertama untuk laporan pegawai pada seksinya.

**Boleh:**

- melihat dashboard dan laporan seksi sendiri;
- melihat detail laporan;
- meminta revisi;
- memverifikasi dan meneruskan laporan ke Kepala Kantor;
- melihat daftar pegawai, rekap, dan kepatuhan seksi sendiri.

**Tidak boleh:**

- melihat laporan seksi lain;
- mengedit isi laporan pegawai;
- memberi persetujuan final.

Isolasi data wajib diterapkan di backend:

```text
ADMIN_SEKSI.id_seksi = PEGAWAI.id_seksi
```

### 4.3 Kepala Kantor

Kepala Kantor memberi keputusan akhir atas laporan yang telah diteruskan Admin Seksi.

**Boleh:**

- memantau seluruh seksi dan laporan;
- melihat laporan yang menunggu persetujuan;
- meminta revisi;
- memberikan persetujuan final;
- melihat statistik, rekap, tren, dan kepatuhan.

**Tidak boleh:**

- mengedit isi laporan;
- mengubah master user atau konfigurasi sistem.

### 4.4 Superadmin

Superadmin adalah administrator sistem dan global monitoring, **bukan approver**.

```text
SUPERADMIN = SYSTEM ADMINISTRATOR + GLOBAL MONITORING
SUPERADMIN != ADMIN SEKSI
SUPERADMIN != FINAL APPROVER
```

**Boleh:**

- mengelola pengguna, seksi, periode, notifikasi broadcast, audit, backup, ekspor, dan pengaturan;
- memantau semua laporan secara read-only;
- melihat detail, histori, dan audit laporan;
- mengaktifkan/nonaktifkan user dan mereset password.

**Tidak boleh:**

- mengedit isi laporan pegawai;
- meminta revisi laporan;
- memverifikasi sebagai Admin Seksi;
- menyetujui sebagai Kepala Kantor.

## 5. Workflow Laporan

Alur normal:

```text
Pegawai membuat draft
        ↓
      draft
        ↓ ajukan
    diajukan
        ↓
Admin Seksi memeriksa
   ├─ minta revisi → revisi_admin → Pegawai memperbaiki → diajukan
   └─ verifikasi   → diteruskan
                              ↓
                    Kepala Kantor memeriksa
                       ├─ minta revisi → revisi_kantor
                       │                 ↓
                       │          Pegawai memperbaiki
                       │                 ↓
                       │             diajukan
                       │                 ↓
                       │          Admin memverifikasi ulang
                       │                 ↓
                       │             diteruskan
                       └─ setujui → disetujui
```

### 5.1 Definisi status

| Status | Arti |
| --- | --- |
| `draft` | Masih dikerjakan Pegawai |
| `diajukan` | Menunggu pemeriksaan Admin Seksi |
| `revisi_admin` | Admin Seksi meminta perbaikan |
| `diteruskan` | Sudah diverifikasi Admin dan menunggu Kepala Kantor |
| `revisi_kantor` | Kepala Kantor meminta perbaikan |
| `disetujui` | Sudah mendapat persetujuan final |

### 5.2 Transisi yang sah

| Aktor | Dari | Aksi | Menjadi |
| --- | --- | --- | --- |
| Pegawai | `draft` | Ajukan | `diajukan` |
| Pegawai | `revisi_admin` | Ajukan ulang | `diajukan` |
| Pegawai | `revisi_kantor` | Ajukan ulang | `diajukan` |
| Admin Seksi | `diajukan` | Minta revisi | `revisi_admin` |
| Admin Seksi | `diajukan` | Verifikasi/teruskan | `diteruskan` |
| Kepala Kantor | `diteruskan` | Minta revisi | `revisi_kantor` |
| Kepala Kantor | `diteruskan` | Setujui | `disetujui` |

Setiap transisi harus divalidasi di backend. Transisi yang tidak sah mengembalikan `409 Conflict`.

## 6. Kebijakan Periode

Status periode:

```text
DRAFT → OPEN → CLOSED
```

Superadmin dapat membuat periode, membuka/menutup periode, dan mengubah deadline.

Aturan backend:

- laporan baru hanya dapat diajukan pada periode `OPEN`;
- submission baru pada periode `CLOSED` ditolak dengan `409`;
- laporan yang secara resmi berstatus `revisi_admin` atau `revisi_kantor` tetap dapat diperbaiki dan diajukan ulang meskipun periode reguler telah ditutup;
- backend merupakan otoritas final, bukan status tombol pada frontend.

Contoh respons:

```json
{
  "success": false,
  "message": "Periode laporan sudah ditutup"
}
```

## 7. Modul dan Menu

### Pegawai

```text
Dashboard · Buat Laporan · Laporan Saya · Riwayat · Notifikasi · Profil · Logout
```

Dashboard: periode aktif, deadline, total laporan, draft, diproses, perlu revisi, disetujui, dan notifikasi terbaru.

Form laporan:

| Field | Jenis |
| --- | --- |
| Judul | Text |
| Bulan | Select |
| Tahun | Select |
| Isi Kegiatan | Textarea |
| Capaian | Textarea |
| Kendala | Textarea |
| Tindak Lanjut | Textarea |
| Rencana Bulan Depan | Textarea |
| Lampiran | File |

Fungsi: simpan draft, ajukan laporan, autosave, upload bukti, dan validasi input.

### Admin Seksi

```text
Dashboard · Laporan · Rekap · Pegawai · Monitoring · Notifikasi · Profil · Logout
```

Dashboard: total pegawai, total laporan, menunggu verifikasi, diteruskan, perlu revisi, disetujui, serta matriks kepatuhan pegawai.

### Kepala Kantor

```text
Dashboard · Persetujuan · Semua Laporan · Monitoring · Rekap · Notifikasi · Profil · Logout
```

Dashboard: total pegawai/seksi/laporan, belum melapor, menunggu Admin, menunggu Kepala, revisi, disetujui, perbandingan seksi, tren, kepatuhan, keterlambatan, dan aktivitas terbaru.

### Superadmin

```text
Dashboard
Manajemen Pengguna
Manajemen Seksi
Semua Laporan
Monitoring
Manajemen Periode
Notifikasi
Audit Trail
Data & Backup
Pengaturan Sistem
Profil
Logout
```

Halaman **Semua Laporan** milik Superadmin bersifat read-only. Filter minimal: periode, tahun, seksi, pegawai, status, dan pencarian.

## 8. Fokus Pengembangan Saat Ini

Status roadmap:

| Fase | Isi | Status |
| --- | --- | --- |
| 1 — Core | Authentication, role guard, report CRUD, workflow | Sudah terbentuk |
| 2 — Workflow Stability | Revisi Admin/Kepala, resubmit, approval, timestamp, retry protection | Sudah teruji |
| 3 — Superadmin | Dashboard, user, seksi, laporan, monitoring, periode, audit, notifikasi, backup, settings | **Fokus saat ini** |
| 4 — Performance Monitoring | Indikator, target, realisasi, kepatuhan, analitik | Berikutnya |
| 5 — Documentation | PDF, Excel, laporan resmi | Berikutnya |
| 6 — Automation | Reminder deadline, notifikasi terjadwal, rekap otomatis | Berikutnya |
| 7 — Production | Hardening, migration, backup policy, deployment, monitoring | Terakhir |

Prioritas Fase 3:

1. Manajemen Pengguna
2. Manajemen Seksi
3. Dashboard Superadmin
4. Semua Laporan
5. Monitoring
6. Manajemen Periode
7. Audit Trail
8. Notifikasi
9. Data & Backup
10. Pengaturan Sistem

AI agent tidak boleh menganggap label “sudah terbentuk/teruji” sebagai pengganti pemeriksaan kode dan pengujian aktual.

## 9. Arsitektur API

Kelompok endpoint konseptual:

```text
/api/auth
/api/laporan
/api/users
/api/seksi
/api/pegawai
/api/notifications
/api/rekap
/api/kepala
/api/admin-section
/api/superadmin
/api/periode
/api/audit
/api/profile
```

Nama endpoint aktual mengikuti implementasi repository. Jangan membuat endpoint duplikat jika fungsi yang sama sudah tersedia.

Urutan pemrosesan wajib:

```text
authenticateToken
        ↓
requireRole(...)
        ↓
validasi input + business rule + ownership/section scope
        ↓
database
```

### Kebijakan retry

| Method | Automatic retry |
| --- | --- |
| `GET`, `HEAD` | Boleh jika aman |
| `POST`, `PUT`, `PATCH`, `DELETE` | Tidak boleh |

Tujuannya mencegah mutasi ganda ketika respons jaringan gagal setelah server sebenarnya sudah memproses request.

### Standar error

| Status | Penggunaan |
| --- | --- |
| `400` | Input tidak valid |
| `401` | Belum login/token tidak valid |
| `403` | Tidak memiliki kewenangan |
| `404` | Data tidak ditemukan |
| `409` | Konflik status/periode/business rule |
| `500` | Kesalahan internal server |

Format dasar:

```json
{
  "success": false,
  "message": "Laporan tidak dapat diproses pada status saat ini"
}
```

## 10. Model Data Konseptual

### `users`

```text
id, nama, username, nip, password_hash, role, id_seksi, is_active
```

### `seksi`

```text
id, nama_seksi, kode, is_active
```

### `laporan`

```text
id, id_user, judul, bulan, tahun,
isi_kegiatan, capaian, kendala, tindak_lanjut, rencana_bulan_depan,
lampiran, status, catatan_admin, catatan_kantor,
tanggal_pengajuan, tanggal_verifikasi, tanggal_persetujuan,
created_at, updated_at
```

### Tabel pendukung

```text
verifikasi(id, id_laporan, id_admin_seksi, status, catatan, created_at)
persetujuan(id, id_laporan, id_kepala, status, catatan, created_at)
notifications
audit_trail
periode_laporan
settings
```

Nama tabel/kolom di atas adalah model konseptual. Saat mengembangkan, gunakan schema dan migration aktual di repository.

### Integritas data

Satu pegawai hanya boleh memiliki maksimal satu laporan aktif untuk satu bulan dan tahun:

```sql
UNIQUE (id_user, bulan, tahun)
```

Constraint tersebut hanya diterapkan setelah audit dan pembersihan legacy duplicate. Jangan menghapus duplikat secara otomatis tanpa keputusan data yang jelas.

## 11. Transaksi, Histori, dan Audit

Gunakan transaksi database untuk operasi yang mengubah beberapa data sekaligus:

```text
BEGIN
  update/insert data utama
  insert history
  insert audit
  insert notification
COMMIT
```

Jika satu langkah gagal:

```text
ROLLBACK
```

Audit minimal menyimpan:

```text
timestamp, user, role, action, target, detail, IP
```

Action penting:

```text
USER_CREATE, USER_UPDATE, USER_ACTIVATE, USER_DEACTIVATE,
PASSWORD_RESET, SECTION_CREATE, SECTION_UPDATE,
PERIOD_OPEN, PERIOD_CLOSE, NOTIFICATION_BROADCAST,
BACKUP_CREATE, SETTING_UPDATE
```

Riwayat revisi dan catatan lama tidak boleh ditimpa. Seluruh perubahan workflow harus dapat ditelusuri.

## 12. Notifikasi

| Event | Penerima |
| --- | --- |
| Pegawai mengajukan | Admin Seksi terkait |
| Admin meminta revisi | Pegawai terkait |
| Admin meneruskan | Pegawai + Kepala Kantor |
| Kepala meminta revisi | Pegawai terkait |
| Kepala menyetujui | Pegawai terkait |
| Revisi dikirim ulang | Admin Seksi terkait |
| Deadline mendekat | Pegawai |
| Laporan terlambat | Pegawai + Admin terkait |

Superadmin memiliki inbox dan broadcast dengan target: semua user, Pegawai, Admin Seksi, Kepala Kantor, atau seksi tertentu.

## 13. User dan Seksi

### Manajemen user

Superadmin dapat menambah, mengedit, mengaktifkan/nonaktifkan, mereset password, mengatur role/seksi, mencari, dan memfilter user.

Lifecycle normal menggunakan:

```text
is_active = false
```

Hard delete harus ditolak jika user mempunyai laporan, histori, audit, atau relasi penting lain.

### Manajemen seksi

Data minimal: ID, nama seksi, kode seksi, jumlah pegawai, dan status. Superadmin dapat menambah, mengedit, mengaktifkan, serta menonaktifkan seksi.

## 14. Lampiran dan Backup

### Lampiran

- harus terikat pada laporan dan memiliki metadata;
- validasi ekstensi/MIME type dan ukuran dilakukan di backend;
- cegah path traversal dan nama file berbahaya;
- tipe yang direncanakan: PDF, JPG/JPEG, PNG, XLSX, DOCX;
- batas ukuran mengikuti konfigurasi backend.

### Backup

```text
Superadmin → protected API → PostgreSQL backup → private storage
```

- hanya Superadmin yang boleh membuat dan mengunduh backup;
- backup tidak boleh berada di public `/uploads`;
- setiap download melewati JWT dan role guard;
- pembuatan backup dicatat dalam audit trail.

## 15. Security Baseline

| Area | Ketentuan |
| --- | --- |
| Authentication | JWT tervalidasi di backend |
| Authorization | Backend role guard + ownership/section scope |
| Password | Hash yang aman, tidak pernah disimpan plaintext |
| SQL injection | Parameterized query |
| Input | Validasi dan sanitasi backend |
| Workflow | Status transition guard |
| User lifecycle | Activate/deactivate, histori dipertahankan |
| Audit | Tindakan penting tercatat |
| Backup | Superadmin only dan private |
| Secret | Tidak tampil di UI, log, response, atau repository |

Log production tidak boleh merekam request body sensitif, password, token, JWT secret, atau database password.

## 16. Rekap dan Ekspor

Format target:

```text
PDF · Excel · CSV
```

Laporan resmi minimal memuat kop KSOP Kelas II Cirebon, judul, seksi, periode, identitas pegawai, kegiatan, capaian, kendala, tindak lanjut, status, verifikasi Admin Seksi, dan persetujuan Kepala Kantor.

## 17. Monitoring dan Statistik

Monitoring minimal mencakup:

- kepatuhan pegawai dan seksi;
- pegawai yang belum melapor;
- distribusi status workflow;
- laporan terlambat;
- frekuensi revisi;
- perbandingan antar-seksi;
- tren laporan bulanan.

Tren wajib dihitung menggunakan periode bisnis:

```text
laporan.bulan + laporan.tahun
```

Bukan hanya `created_at`.

## 18. Pengaturan Sistem

Kelompok pengaturan:

- identitas aplikasi: nama, instansi, singkatan, alamat, logo;
- pelaporan: tahun aktif, deadline default, draft, keterlambatan, revisi;
- workflow: tampilkan alur Pegawai → Admin Seksi → Kepala Kantor sebagai informasi, bukan workflow builder bebas;
- dokumen: judul, kop, logo, format filename, penandatangan, NIP, jabatan;
- sistem: timezone, format tanggal, pagination, bahasa, maintenance mode;
- informasi sistem: versi aplikasi, status backend/database, environment, Node version, last check.

Informasi sistem tidak boleh mengekspos secret.

## 19. Standar UI/UX

Warna:

| Fungsi | Warna |
| --- | --- |
| Institusional/primary | Navy |
| Card | Putih |
| Background | Abu-abu muda |
| Disetujui | Hijau |
| Pending | Oranye |
| Revisi/masalah | Merah |
| Informasi/pengajuan | Biru |

Card tetap putih; warna status digunakan pada ikon, badge, atau accent.

Breakpoint minimum:

| Perangkat | Lebar |
| --- | --- |
| Desktop | `>= 1200px` |
| Tablet | `768–1199px` |
| Mobile | `< 768px` |

Tidak boleh ada horizontal overflow, tabel keluar viewport, sidebar menutup konten, atau modal keluar layar.

## 20. Target Kinerja dan Keandalan

- initial load dashboard sekitar `< 3 detik`;
- respons API normal sekitar `< 1 detik` pada LAN/server internal;
- gunakan pagination untuk tabel besar;
- hindari request API berulang tanpa kebutuhan;
- gunakan lazy loading bila memang membantu;
- operasi penting harus atomik melalui transaksi database.

## 21. Acceptance Criteria

Sistem dinyatakan memenuhi alur utama jika semua skenario berikut lulus:

- [ ] Login dan redirect role berjalan benar.
- [ ] Pegawai dapat membuat, menyimpan, dan mengajukan laporan.
- [ ] Admin Seksi dapat meminta revisi dan memverifikasi laporan seksinya.
- [ ] Pegawai dapat memperbaiki dan mengajukan ulang revisi Admin.
- [ ] Kepala Kantor dapat meminta revisi dan memberi persetujuan final.
- [ ] Pegawai dapat memperbaiki revisi Kepala, lalu laporan kembali melewati Admin.
- [ ] Notifikasi dibuat untuk setiap event workflow yang relevan.
- [ ] Audit trail mencatat tindakan penting.
- [ ] Role isolation dan section isolation berlaku di backend.
- [ ] Superadmin dapat menjalankan fungsi administrasi tetapi tidak dapat verify/approve.
- [ ] Rekap dan ekspor menghasilkan data yang benar.
- [ ] Backup terlindungi dan hanya dapat diakses Superadmin.
- [ ] Kontrol periode diterapkan di backend.

## 22. Test Matrix Minimum

| Skenario | Hasil yang diharapkan |
| --- | --- |
| Pegawai membuka laporan orang lain | `403` |
| Admin mengakses laporan seksi lain | Ditolak/`403` |
| Superadmin mencoba verify | `403` |
| Superadmin mencoba approve | `403` |
| Pegawai mengedit `diteruskan` | `409` |
| Pegawai mengedit `disetujui` | `409` |
| Submit draft | Menjadi `diajukan` |
| Admin meminta revisi | Menjadi `revisi_admin` |
| Resubmit revisi | Menjadi `diajukan` |
| Admin memverifikasi | Menjadi `diteruskan` |
| Kepala meminta revisi | Menjadi `revisi_kantor`; `tanggal_persetujuan = NULL` |
| Kepala menyetujui | Menjadi `disetujui`; timestamp persetujuan terisi |
| Mutation request mengalami network error | Tidak di-retry otomatis |
| User dinonaktifkan | Histori tetap tersedia |
| Backup tanpa autentikasi/role | Ditolak |
| Submission baru pada periode tertutup | `409` |
| Resubmit revisi resmi saat periode tertutup | Diizinkan sesuai workflow |

Tambahkan test positif, negatif, authorization, validation, dan regression test untuk setiap fitur yang diubah.

## 23. Definition of Done untuk AI Agent

Sebuah tugas dianggap selesai hanya jika:

- [ ] perubahan sesuai ruang lingkup permintaan;
- [ ] tidak melanggar matriks role dan workflow;
- [ ] validasi keamanan diterapkan di backend;
- [ ] query membatasi ownership/seksi bila diperlukan;
- [ ] histori, audit, dan notifikasi tetap konsisten;
- [ ] mutasi terkait menggunakan transaksi bila perlu;
- [ ] UI responsif pada desktop, tablet, dan mobile yang relevan;
- [ ] tidak ada secret atau debug sensitif yang ditambahkan;
- [ ] test relevan lulus;
- [ ] alur terkait telah diuji ulang untuk regresi;
- [ ] perubahan dan hasil test dirangkum dengan jelas.

## 24. Format Laporan Akhir AI Agent

Gunakan format ringkas berikut setelah menyelesaikan pekerjaan:

```markdown
## Hasil
- Ringkasan perubahan

## File yang Diubah
- `path/file`: alasan perubahan

## Pengujian
- Perintah/skenario: hasil

## Catatan
- Risiko, asumsi, atau pekerjaan tersisa
```

Jika tidak dapat menjalankan test, jelaskan alasannya secara spesifik. Jangan mengklaim “berhasil” tanpa bukti pemeriksaan atau pengujian yang relevan.

---

Dokumen ini merupakan turunan operasional dari **Rancangan Detail Pengembangan Sistem Digitalisasi Laporan Kinerja Bulanan KSOP Kelas II Cirebon v1.0**. Dokumen lanjutan seperti ERD, use case, activity diagram, sequence diagram, spesifikasi API, skenario pengujian terperinci, dan migration plan dapat dibuat tanpa mengubah pembagian tanggung jawab utama pada README ini.
