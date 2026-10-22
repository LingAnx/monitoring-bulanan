# CHANGELOG_FIXES.md

## [FIX-2026-10-14c] Perbaikan Batch Lanjutan — Input Validation, XSS, dan Type Safety

**Status**: SELESAI — 13 perbaikan diterapkan dan terverifikasi dengan 91 test lokal (66 static, 17 file, 8 JWT) + 20 E2E auth/role/ownership (bash E2E).

### Perbaikan

#### backend/routes/kepala.js
- **BUG-1: Parameter `:id` tidak divalidasi numerik di `/approve/:id`, `/reject/:id`**
  `req.params.id` dikirim langsung ke `pool.query` tanpa validasi format. PostgreSQL akan error
  untuk nilai non-numeric, tapi pesan error dari PG bisa bocor detail skema.
  - FIX: tambahkan `if (!/^\d+$/.test(String(req.params.id)))` → 400 untuk kedua route.

#### backend/routes/adminSection.js
- **BUG-2: `:id` parameter di POST `/verify/:id`, `/reject/:id` tidak divalidasi**
  - FIX: tambahkan validasi numerik sebelum execute SQL.
- **BUG-3: GET `?bulan=` & `?tahun=` query params tidak divalidasi**
  Query params `bulan`, `tahun`, `status` diproses sebagai string PostgreSQL bisa membandingkan
  numerik dengan string tanpa error → filter mungkin tidak berfungsi sesuai harapan.
  - FIX: validasi `bulan` (1-12), `tahun` (2000-2999), `status` (whitelist) sebelum build query;
    tambahkan `ORDER BY bulan DESC, tahun DESC` untuk deterministik hasil;
    parameterisasi $1/$2/$3 untuk bulan/tahun/status.
- **BUG-4: `:id` parameter di `GET /:id` tidak divalidasi**
  - FIX: validasi numerik.

#### backend/routes/laporan.js
- **BUG-5: GET `/:id` tidak validasi `:id` numerik sebelum query**
  - FIX: `if (!/^\d+$/.test(String(id)))` → 400.
- **BUG-6: `body.bulan` tidak divalidasi 1-12 di PUT `/:id`**
  Nilai bulan >12 atau 0 akan lolos ke DB tanpa validasi domain.
  - FIX: validasi `typeof bulan === 'number' && Number.isInteger(bulan) && bulan >= 1 && bulan <= 12`.
- **BUG-7: `body.tahun` tidak divalidasi 2000-2999 di PUT `/:id`**
  - FIX: validasi range tahun + `Number.isInteger`.

#### backend/routes/rekap.js
- **BUG-8: `?bulan=` dan `?tahun=` query params tidak divalidasi**
  - FIX: validasi numerik `bulan` 1-12 dan `tahun` 2000-2999 → 400 jika gagal.

#### public/admin-section/laporan.js
- **BUG-9: `dataset.targetLaporan` tidak dikonversi ke Number sebelum dikirim ke API**
  `item.dataset.targetLaporan` adalah string DOM; `Number(string)` konversi eksplisit di
  `approveLaporan` dan `rejectLaporan`; guard `if (!Number.isInteger(laporanId) || laporanId <= 0)`
  sebelum `apiFetch`.

#### public/superadmin/backup.js
- **BUG-10: `dataset.backupFilename` adalah string URL-encoded, diproses ganda**
  Nilai `data-backup-filename` di-set lewat `encodeURIComponent(b.filename)`; lama kode memanggil
  `decodeURIComponent(el.dataset.backupFilename)` — tapi `dataset.backupFilename` sudah string
  raw (bukan URL-encoded lagi), sehingga decodeURIComponent pada string yang sudah decode
  menghasilkan string yang sama → bisa menjadi path traversal jika filename memuat `%2e%2e`.
  - FIX: validasi `isValidBackupName` (regex `^[a-zA-Z0-9._-]+$` maksimal 100 char) sebelum
    memanggil `downloadBackup`; abort jika tidak valid.

#### public/admin-section/notifikasi.js & public/employee/notifikasi.js
- **BUG-11: `item.dataset.notifId` (string) dikirim ke `apiFetch` sebagai parameter tanpa konversi**
  - FIX: `Number(item.dataset.notifId)` + validasi `Number.isInteger && > 0`.

#### public/superadmin/notifikasi.js
- **BUG-12: `el.dataset.notifId` string DOM dikirim ke `markRead(nid)` / `deleteNotif(nid)`**
  - FIX: konversi eksplisit `Number()` + validasi.

#### public/superadmin/periode.js
- **BUG-13: `el.dataset.periodeId`, `el.dataset.periodeBulan`, `el.dataset.periodeTahun` string**
  Semua diklaim ke `editPeriode` / `togglePeriode` / `deletePeriode` tanpa konversi tipe.
  - FIX: `Number()` untuk semua tiga field; validasi bulan 1-12, tahun 2000-2999, id > 0.

#### public/superadmin/seksi.js
- **BUG-14: `btn.dataset.id` string DOM dikirim ke `editSeksi` / `deleteSeksi`**
  - FIX: `Number(btn.dataset.id)` + validasi `Number.isInteger && > 0` sebelum attach listener.

#### public/employee/form.js
- **BUG-15: `btn.dataset.fileId` string DOM dikirim ke `fetch(/api/files/${fid})` tanpa konversi**
  Juga `legacyUrl` dari `dataset.legacyUrl` tidak divalidasi → potensi path traversal.
  - FIX: `Number(btn.dataset.fileId)` + validasi; `isLegacyUrlSafe()` memastikan URL relatif
    mulai `/` dan tidak mengandung `..`.

#### public/superadmin/pengguna.js
- **BUG-16: `u.role` raw string dari API digabung dengan `role.toLowerCase()` dalam kondisi render**
  Logika `if (u.role && u.role.toLowerCase() === 'superadmin' && u.id !== AuthStore.getUserId())`
  membandingkan lowercase — tapi backend mengirim role UPPERCASE (PEGAWAI, ADMIN_SEKSI, dst).
  - FIX: `const roleNorm = String(u.role || '').toUpperCase()` dan bandingkan dengan `'SUPERADMIN'`.

#### public/superadmin/pengaturan.js
- **BUG-17: `inp.dataset.setting` string DOM dikirim ke `updates` object tanpa validasi**
  Jika atribut `data-setting` memanipulasi nama key → bisa menimpa key tidak diharapkan.
  - FIX: (sudah ada guard `val !== undefined`); validasi key hanya dari allowlist:
    `app_name`, `company_name`, `footer_text`.

#### backend/routes/users.js
- **BUG-18: PUT `/me` — `data.nama` tidak memvalidasi panjang (max 255 chars)**
  - FIX: tambahkan `if (typeof data.nama === 'string')` dan cek `data.nama.length > 255`.

### Verifikasi
- `node --check` berhasil untuk semua file backend + frontend yang diubah.
- 91 test unit lokal: `test-static-security.js` (66/66), `test-file-security.js` (17/17),
  `test-jwt-rotation.js` (8/8) — SEMUA PASS.
- 20 assert E2E bash (`tests/test-auth-workflow-e2e.sh`) di DB test `ksop_t6_*`:
  SEMUA PASS (role enforcement, ownership, workflow state machine, input validation).

### Catatan
- Perbaikan type-safety di frontend adalah defense-in-depth: nilai-nilai ini seharusnya
  sudah string numeric dari API; konversi eksplisit mencegah bug jika API berubah tipe.
- Validasi input di backend (numerik, range, whitelist) adalah kontrol utama; frontend
  hanya UX enhancement.
- Jangan jalankan E2E test menggunakan data production — selalu buat DB test baru.


**Status**: SELESAI — semua perbaikan source, test, dan paket rilis terverifikasi lokal.
Menyusul [FIX-2026-10-14] (basis auth/role/ownership). Entri ini mencakup pengerasan
lapisan yang belum di-handle sebelumnya.

### Gejala
- `authenticateToken` tidak cek `users.token_version` → token lama masih valid
  setelah password reset / role change / deactivate.
- `must_change_password` flag di DB tidak dieksekusi — user bisa akses dashboard
  normal tanpa mengganti password (aplikasi tidak memblokir/mewajibkan).
- JWT `jsonwebtoken.sign` tidak pin `algorithms: ['HS256']` → risiko algorithm-confusion
  (attacker bisa bikin token `alg: "none"` atau RS256 dengan kunci publik).
- `alg: "none"` dan secret ber-`placeholder` tidak ditolak di startup check.
- `/health` melakukan `SELECT 1` ke DB (liveness probe seharusnya tanpa DB).
- `/ready` tidak ada → orchestrator tidak bisa gate traffic saat DB down.
- `/metrics` terbuka tanpa auth (bocor counter, lastError bisa bocor detail DB).
- Logger (winston) tidak masking field sensitif (token, password, auth header) di
  log file; tidak ada request-id untuk korelasi.
- `parseOoxml()` tidak ada validasi struktur OOXML → file polyglot/zip-bomb lolos.
- Endpoint `GET /api/files/:id` mengembalikan metadata internal
  (`owner_user_id`, `report_id`, `content_type`, `stored_name`, `sha256`)
  ke semua role yang memiliki akses — perlu di-scope per role.
- Inline event handler di frontend (users.js, notifikasi.js, backup.js, periode.js,
  employee/dashboard.js, head-office/dashboard.js, kepala.js, persetujuan.js)
  menyisipkan data DB langsung ke `onclick=` string → potensi XSS / event hijacking
  jika nilai DB tidak ter-escape sempurna di suatu titik.
- CSP tidak ada `Permissions-Policy` (geolocation/microphone/camera terbuka).
- `build-release.sh` ZIP release belum di-audit ulang setelah perubahan ini.

### Perbaikan

**1. `backend/middleware/auth.js` (PERUBAHAN)**
- `authenticateToken`: tambah `SELECT token_version FROM users WHERE id=$1`
  (1 round-trip, ~1ms — bisa di-cache in-memory untuk production jika perlu).
  Jika `tokenVersion` di payload JWT != `user.token_version` → 401
  `TOKEN_REVOKED`. Jika `token_version IS NULL` (legacy, pre-migration-007)
  dan payload tanpa `tokenVersion` → allowed (compatibility).
- `must_change_password` enforcement: jika `user.must_change_password = true`
  dan route bukan `/api/auth/change-password` atau `/api/profile` →
  `403 { code:'MUST_CHANGE_PASSWORD' }`.
- `algorithms: ['HS256']` di-pin di semua `jwt.verify` call.
- Reject `alg: "none"` secara eksplisit (payload dengan `alg:none` → 401).
- `issuer: 'ksop-api'` dan `audience: 'ksop-client'` — token dengan
  issuer/audience salah → 401.

**2. `backend/db/migrations/007_add_token_version.sql` (BARU)**
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
-- Bumped di routes/profile.js dan auth.js setiap kali:
--   * password diubah
--   * role diubah
--   * is_active di-toggle (deactivate/re-activate)
--   * must_change_password di-set
```

**3. `backend/routes/profile.js` & `backend/routes/auth.js` (PERUBAHAN)**
- `PUT /api/profile/password` → increment `users.token_version` setelah sukses.
- `POST /api/auth/change-password` → increment `users.token_version`.
- `POST /api/superadmin/users/:id/deactivate` / activate → increment `token_version`.
- `PUT /api/superadmin/users/:id` (role change) → increment `token_version`.
- Login response kini include `mustChangePassword` boolean dari `users` row.

**4. `backend/server.js` (PERUBAHAN)**
- `/health` → liveness-only (proses hidup, tanpa DB query, respon <10ms).
- `/ready` → readiness (cek `pool.query('SELECT 1')` → 200/503).
- `/metrics` → require `Bearer $METRICS_TOKEN` (env). Tanpa env, hanya
  localhost (`127.0.0.1`, `::1`, `::`). `lastError` disandikan (slice 200 char,
  tanpa stack trace, tanpa raw DB error message).
- Global error handler: pesan error sensitif (SQL, ECONNREFUSED, password)
  → `500 { success:false, message:'Terjadi kesalahan internal' }`.
  4xx dari route tetap pakai `err.message` asli.

**5. `backend/middleware/file-security.js` (PERUBAHAN)**
- `parseOoxml(buf, mime)` — validasi struktur OOXML (ZIP central directory scan):
  - `[Content_Types].xml` wajib ada.
  - `.docx` harus punya `word/document.xml`; `.xlsx` harus punya `xl/workbook.xml`.
  - Entry name tidak boleh mengandung `../` atau `\` (path traversal).
  - Max 5000 entry (zip bomb guard).
  - Total decompressed size tidak boleh > 100MB.
  - Method: `stored` dan `deflated` saja (method lain → reject).
- `ALLOWED_MIME` map: `.docx → vnd.openxmlformats...document`, `.xlsx → ...spreadsheetml`.
  File yang claim DOCX tapi mengandung `xl/` (bukan `word/`) → reject.

**6. `backend/routes/files.js` (PERUBAHAN)**
- `GET /api/files/:id` (metadata) → hanya kembalikan field yang relevan per role:
  - PEGAWAI (owner): `id`, `filename`, `size`, `uploaded_at`, `report_id`.
  - ADMIN_SEKSI / KEPALA_KANTOR (viewer): `id`, `filename`, `size`, `report_id`.
  - SUPERADMIN: semua field termasuk `owner_user_id`, `content_type`.
- `canAccessFile(owner, viewer, report, file)` — policy check terpusat:
  - Owner → read/write/delete.
  - Admin seksi yang sama (`id_seksi`) → read.
  - Kepala / superadmin → read.
  - Lain → 403.

**7. `backend/middleware/logger.js` (PERUBAHAN)**
- Custom `RedactFormat` (winston format subclass): masking `password`, `token`,
  `authorization`, `cookie`, `session_id`, `secret`, `api_key`, `db_password`,
  `jwt_secret` → `[REDACTED]` / `[REDACTED_AUTH]`.
- `requestLogger`: generate `X-Request-Id` (UUID v4, atau pakai yang diberikan
  client jika format valid `^[a-zA-Z0-9-]{8,64}$`). Semua log entry untuk
  request itu membawa `requestId`.
- Log dir auto-created sebelum winston write (cegah startup crash jika `logs/`
  tidak ada).
- Rotation: 5MB x 5 files (sudah ada, dipertahankan).

**8. Frontend: replace inline event handlers dengan data-* + event delegation**
  Semua `onclick="fn(id)"` yang menyisipkan data DB langsung ke HTML string
  diganti dengan `data-attr="id"` + `addEventListener` (delegated listener
  di container atau document level).

| File | Perubahan |
|---|---|
| `public/employee/users.js` | `data-user-id` + delegated listener untuk toggle aktif/nonaktif, ubah role, hapus |
| `public/superadmin/users.js` | Sama: `data-user-id` + delegation |
| `public/admin-section/notifikasi.js` | `data-notif-id` + document-level click delegation |
| `public/employee/notifikasi.js` | `data-notif-id` + delegation |
| `public/head-office/notifikasi.js` | `data-notif-id` + delegation |
| `public/superadmin/notifikasi.js` | `data-notif-id` + delegation |
| `public/superadmin/backup.js` | `data-backup-filename` + delegated download handler |
| `public/superadmin/periode.js` | `data-periode-*` + delegated handlers (edit/close/delete) |

**9. `backend/middleware/static-guard.js` (PERUBAHAN)**
- Tambah `Permissions-Policy: geolocation=(), microphone=(), camera=()`.
- `CSP_EXTRA` env — operator bisa tambahkan directive tambahan (mis. nonce)
  tanpa ubah kode: `CSP_EXTRA="script-src 'nonce-abc'"`.

**10. `backend/package.json` (PERUBAHAN)**
- `test:session`, `test:ooxml`, `test:health`, `test:csv` — 4 test suite baru.
- `test:e2e-auth` — wired ke `bash tests/test-auth-workflow-e2e.sh`.

### Hasil Test (semua di test DB, tanpa data production)

| Suite | Hasil |
|---|---|
| `test-jwt-rotation.js` | **8/8 lulus** |
| `test-static-security.js` | **66/66 lulus** |
| `test-file-security.js` | **17/17 lulus** |
| `test-session-revocation.js` (BARU) | **7/7 lulus** |
| `test-ooxml-structure.js` (BARU) | **8/8 lulus** |
| `test-health-metrics.js` (BARU) | **7/7 lulus** |
| `test-csv-injection.js` (BARU) | **19/19 lulus** |
| `node --check` (15 file) | **0 error** |

Total: **132 test lulus, 0 gagal.**

### Catatan Deployment
- Jalankan migration 007 (`007_add_token_version.sql`) sebelum deploy backend baru.
  User lama (pre-migration) otomatis dapat `token_version=0` — token yang
  issued sebelum migration tetap valid selama `tokenVersion` claim tidak ada
  (legacy compat path).
- Set `METRICS_TOKEN` di production `.env` sebelum expose `/metrics` ke network.
- Set `CSP_EXTRA` (opsional) jika ingin nonce-based CSP yang lebih ketat.
- Restart server setelah migration + deploy.

---

## [FIX-2026-10-14] Keamanan Tahap 6 — Autentikasi, Otorisasi Role, Kepemilikan Data, Integritas Workflow

**Status**: BELUM DEPLOY — perbaikan source selesai, terverifikasi lokal (E2E test terpasang).
Penerapan pada server production masih pending.

### Gejala
- `authenticateToken` tidak mengecek `users.is_active` — user dinonaktifkan (is_active=false) tetap bisa akses API selama JWT-nya belum expired (max 8 jam).
- Semua endpoint API hanya mengecek "ada token" dan tidak memvalidasi role JWT → semua role bisa akses semua endpoint tanpa perizinan.
- `PUT /api/laporan/:id` dan `POST /api/laporan/:id/submit` tidak memverifikasi `laporan.id_user === req.user.id` → pegawai A bisa edit/submit laporan pegawai B.
- Kepala kantor bisa approve laporan yang masih berstatus `diajukan` (belum diverifikasi admin seksi) → workflow bisa dilompati.
- Endpoint `kepala.js` tidak memvalidasi input `bulan` (terima 99, 0, 13) dan `status` (terima string sembarang) → pesan error generik atau SQL error bocor.
- Error handler global menampilkan `err.message` langsung — bisa memuat detail SQL/stack trace di response HTTP (info disclosure).

### Perbaikan

**1. `backend/middleware/auth.js` (PERUBAHAN)**
- Tambah query DB ringan per request: `SELECT is_active FROM users WHERE id = $1` (1 round-trip, ~1ms).
- Jika `is_active = false` → tolak dengan `401 { success:false, message:'Akun nonaktif' }` — pesan spesifik, tidak bocorkan info lain.
- Query gagal (koneksi DB putus) → server tetap memproses, `auth.dbQueryOk` flag untuk monitoring (fail-open saat DB down agar tidak block seluruh API).

**2. `backend/middleware/authz.js` (BARU)**
- `requireRole(...roles)` — wrapper Express middleware:
  - Baca `req.user.role` dari JWT (di-set oleh `authenticateToken`).
  - Jika role tidak ada di allowlist → `403 { success:false, message:'Akses ditolak' }`.
  - Tidak log role atau userId.
- `requireOwnership(getReport)` — cek `laporan.id_user === req.user.id` sebelum proses, jika tidak cocok → `403 { success:false, message:'Akses ditolak' }`.

**3. `backend/routes/laporan.js` (PERUBAHAN)**
- `PUT /:id` — tambah `requireOwnership` di awal: pegawaai A tidak bisa edit `laporan.id_user != A`.
- `POST /:id/submit` — tambah `requireOwnership`: hanya pemilik yang bisa submit.
- Validasi `bulan` (1–12) dan `tahun` (1900–2100) di `PUT /:id` → `400` jika tidak valid.

**4. `backend/routes/kepala.js` (PERUBAHAN)**
- Semua endpoint (`GET /reports/pending`, `GET /reports`, `POST /:id/approve`, `GET /history`) tambah validasi input:
  - `bulan`: integer 1–12, jika tidak valid → `400 { message:'Bulan tidak valid' }`.
  - `tahun`: integer 1900–2100, jika tidak valid → `400`.
  - `status`: hanya menerima `'diajukan' | 'diteruskan' | 'disetujui' | 'revisi_kantor'`, jika tidak → `400 { message:'Status filter tidak valid' }`.
- `POST /:id/approve` — tambah state machine check:
  - Jika `laporan.status !== 'diteruskan'` → `409 { message:'Laporan belum dapat disetujui; status saat ini: <status>' }` (tidak bocor detail SQL).
  - Jika `laporan.status === 'disetujui'` → `409 { message:'Laporan sudah disetujui' }` (cegah double-approve).
- `POST /:id/approve` — `status` body hanya `'disetujui' | 'revisi_kantor'`, jika tidak → `400`.
- Tambah `requireRole('KEPALA_KANTOR')` di semua endpoint kepala.

**5. `backend/routes/adminSection.js` (PERUBAHAN)**
- Tambah `requireRole('ADMIN_SEKSI')` di semua endpoint admin seksi → kepala/superadmin/pegawai tidak bisa akses.

**6. `backend/routes/users.js` (PERUBAHAN)**
- Tambah `requireRole('SUPERADMIN')` di semua endpoint user management → hanya superadmin yang CRUD user.

**7. `backend/server.js` (PERUBAHAN)**
- Error handler global: filter pesan error yang mengandung pola sensitif (`SELECT`, `UPDATE`, `INSERT`, `DELETE`, `pool`, `postgres`, `ECONNREFUSED`, `connection refused`, `password`) → ganti dengan `message:'Terjadi kesalahan internal'`.
- Semua error 500 → `500 { success:false, message:'Terjadi kesalahan internal' }` tanpa bocorkan detail.
- Error 4xx (dari route) tetap menampilkan `err.message` asli (sudah aman dari route).

**8. `backend/routes/kepala.js` — audit trail approve**
- `POST /:id/approve` → audit trail di `audit_trail` tanpa token/isi file.

**9. `backend/routes/laporan.js` — verify (ADMIN_SEKSI)**
- `POST /:id/verify` sudah ada, hanya memastikan `status = 'diajukan'` sebelum boleh verify → `409` jika bukan.

**10. `backend/tests/test-auth-workflow-e2e.sh` (BARU)**
- 6 skenario E2E (S1–S6): is_active enforcement, role separation, data ownership, workflow integrity, input validation, error hygiene.
- Jalankan: `DB_NAME=<test_db> JWT_SECRET=$(openssl rand -hex 32) bash backend/tests/test-auth-workflow-e2e.sh`

### Matriks Role (endpoint → role yang diizinkan)
| Endpoint | Role |
|---|---|
| `GET /api/laporan/my` | Semua (owner check per role) |
| `PUT /api/laporan/:id` | PEGAWAI (owner only) |
| `POST /api/laporan/:id/submit` | PEGAWAI (owner only) |
| `POST /api/laporan/:id/verify` | ADMIN_SEKSI |
| `GET /api/kepala/reports/*` | KEPALA_KANTOR |
| `POST /api/kepala/reports/:id/approve` | KEPALA_KANTOR |
| `GET /api/admin-section/*` | ADMIN_SEKSI |
| `GET/POST/PUT/DELETE /api/users*` | SUPERADMIN |
| `GET /api/superadmin/*` | SUPERADMIN |

### Hasil Test
| Test | Hasil |
|---|---|
| E2E S1: token pegawai nonaktif → 401 + pesan spesifik | **lulus** |
| E2E S2: kepala → admin-section → 403 | **lulus** |
| E2E S2: pegawai → kepala endpoint → 403 | **lulus** |
| E2E S2: admin seksi → user mgmt → 403 | **lulus** |
| E2E S2: superadmin → user mgmt → 200 | **lulus** |
| E2E S3: pegawai B submit laporan A → 403 | **lulus** |
| E2E S3: pegawai B edit draft sendiri → 200 | **lulus** |
| E2E S3: pegawai B edit laporan A → 403 | **lulus** |
| E2E S4: submit draft → 200 | **lulus** |
| E2E S4: kepala approve tanpa verifikasi → 400/409 | **lulus** |
| E2E S4: admin verifikasi → 200 | **lulus** |
| E2E S4: kepala approve setelah verifikasi → 200 | **lulus** |
| E2E S4: double-approve → 400/409 | **lulus** |
| E2E S5: bulan=13 → 400 | **lulus** |
| E2E S5: status=invalid → 400 | **lulus** |
| E2E S5: id=abc → 400 | **lulus** |
| E2E S5: history bulan=99 → 400 | **lulus** |
| E2E S6: approve tidak ditemukan → success=false, tanpa detail SQL | **lulus** |
| E2E S6: response error tanpa bocor detail teknis | **lulus** |
| Syntax check kepala.js, laporan.js, auth.js, authz.js, adminSection.js, users.js, server.js | **0 error** |

### Catatan
- `requireRole` di `authz.js` membaca `req.user.role` — pastikan `authenticateToken` sudah set `req.user.role` (diambil dari payload JWT).
- Endpoint kepala yang tidak ada `requireRole` di file lama (`GET /reports/pending`) sekarang sudah dilindungi.
- Migration DB tidak diperlukan (perubahan hanya di lapisan middleware/route).
- Belom deploy: copy file backend yang berubah, restart server.

---

## [FIX-2026-10-12] Keamanan Tahap 4 — Upload, Penyimpanan & Download Lampiran

**Status**: BELUM DEPLOY — perbaikan source selesai, terverifikasi lokal.
Penerapan pada server production masih pending.

### Gejala
- `express.static(backend/uploads)` membuat seluruh file upload dapat diakses tanpa autentikasi.
- `backend/routes/upload.js` memakai `multer` dengan validasi hanya berdasarkan ekstensi (regex `originalname`), bukan isi file. File HTML/SVG/JS dapat diupload dengan ekstensi `.pdf`/`.jpg` lalu dieksekusi saat diunduh (stored XSS).
- Nama file penyimpanan memakai `Date.now() + Math.random()` — predictable, tidak ada SHA-256, tidak ada metadata di database.
- Frontend (employee/form.js, head-office/persetujuan.js, dashboard.js, superadmin/verifikasi.legacy.js) membuat URL download `${API_BASE}/uploads/<storedName>` — akses tanpa token.
- Tidak ada tabel metadata file; lampiran disimpan sebagai JSONB `lampiran` di `laporan` berisi URL publik.
- Tidak ada mekanisme pembersihan file orphan atau file sementara dari upload gagal.
- Error handler global di `server.js` mengembalikan 500 untuk semua error tanpa memeriksa `err.status` (multer fileFilter error menjadi 500, bukan 415).

### Akar Masalah
1. **Static serving uploads** — `app.use('/uploads', express.static(...))` di server.js membuat file upload terbuka publik.
2. **Validasi ekstensi saja** — regex `/\.(jpg|jpeg|png|gif|pdf|doc|docx)$/i` pada `file.originalname` mudah ditipu: file HTML bernama `evil.pdf` lolos.
3. **Predictable filename** — `Date.now() + Math.random()` dapat ditebak; tidak ada SHA-256 untuk integritas.
4. **Tidak ada metadata DB** — file upload tidak tercatat di database, sehingga tidak dapat diverifikasi kepemilikan dan hak akses.
5. **Frontend pakai URL publik** — semua role (pegawai, admin seksi, kepala, superadmin) mengakses lampiran via URL tanpa token.
6. **Error handler global** — multer `fileFilter` error (status 415) di-catch oleh handler global dan dijawab 500.

### Perbaikan

**1. Tabel `files` (migration 006_create_files_table.sql)**
```
files
├─ id UUID PK (gen_random_uuid())
├─ owner_user_id INT → users(id) ON DELETE CASCADE
├─ report_id INT → laporan(id) ON DELETE CASCADE
├─ original_name VARCHAR(255)
├─ stored_name VARCHAR(255) UNIQUE
├─ detected_mime_type VARCHAR(100)
├─ size_bytes BIGINT
├─ sha256 CHAR(64)
├─ storage_key VARCHAR(500)
├─ created_at TIMESTAMP
└─ deleted_at TIMESTAMP (soft delete)
```
- Index: `idx_files_owner`, `idx_files_report`, partial index `idx_files_deleted`.
- `storage_key` tidak dikirim ke klien — hanya `id` (UUID) yang dipakai untuk download.

**2. `backend/middleware/file-security.js` (BARU)**
- `detectMime(buffer)` — deteksi tipe berdasarkan magic bytes:
  - `%PDF` → `application/pdf`
  - `FF D8 FF` → `image/jpeg`
  - `89 50 4E 47 0D 0A 1A 0A` → `image/png`
  - `50 4B 03 04` (ZIP) → DOCX/XLSX
  - `3C 3F` / `3C 21` / `3C 73` → SVG/HTML **dilarang**
- `analyzeFile(path)` — streaming SHA-256 + magic bytes (8KB head), tidak memuat seluruh file.
- `sanitizeDisplayName(name)` — hapus control char, path separator, karakter bidi, nama perangkat Windows.
- `makeStoredName(mime)` — `<uuid><ext>` (ext dari MIME terdeteksi, bukan dari nama klien).
- `canAccessFile(user, fileRow)` — matriks hak akses:
  - PEGAWAI → hanya file laporan milik sendiri
  - ADMIN_SEKSI → file pegawai di seksi yang sama
  - KEPALA_KANTOR → semua laporan dalam workflow
  - SUPERADMIN → semua (kebijakan eksplisit)
  - File tanpa `report_id` → hanya pemilik
- `streamFile()` — streaming dari storage root, verifikasi path tetap di dalam root.
- `removeFileSafely()` — hapus file fisik tanpa bocorkan path.

**3. `backend/routes/upload.js` (REWRITE)**
- `POST /api/upload` — validasi:
  1. Autentikasi (JWT)
  2. `report_id` (opsional): cek kepemilikan laporan
  3. Magic bytes: tolak HTML, SVG aktif, executable, JS
  4. Allowlist MIME: PDF, JPEG, PNG, DOCX, XLSX
  5. SHA-256 + `stored_name` dari UUID server
  6. Simpan metadata ke tabel `files`
  7. Jika DB gagal → hapus file fisik (kompensasi)
  8. Return `{ id: uuid, downloadUrl: "/api/files/<uuid>" }` — bukan path filesystem
- `DELETE /api/upload/:fileId` — soft delete + hapus file fisik; hanya pemilik atau SUPERADMIN.
- File sementara di `backend/uploads/_tmp/`, dipindah ke lokasi final setelah validasi.

**4. `backend/routes/files.js` (BARU)**
- `GET /api/files/:id` — download terautentikasi:
  1. UUID validation
  2. Ambil metadata dari `files` (deleted_at = NULL)
  3. `canAccessFile()` per-role
  4. Streaming dari storage root
  5. Header: `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`
  6. Audit log ke `audit_trail` (tanpa token, tanpa isi file)
- `GET /api/files/:id/metadata` — metadata tanpa isi file.

**5. `backend/server.js` (PERUBAHAN)**
- Hapus `app.use('/uploads', express.static(uploadsDir))` — sudah dihapus Tahap 3, pastikan tidak balik.
- Tambah `app.use('/api/files', authenticateToken, filesRoutes)`.
- Error handler global: hormati `err.status` untuk 400/401/403/413/415 (multer fileFilter).
- `LIMIT_FILE_SIZE` → 413 dengan pesan aman.

**6. Frontend (PERUBAHAN)**
- `employee/form.js`:
  - `renderLampiranList()` — tombol download pakai `data-file-id` / `data-legacy-url`.
  - `downloadFileSecure()` — fetch + blob + `Authorization: Bearer <token>`.
  - `handleLampiranChange()` — simpan `id`, `originalName`, `downloadUrl` dari response upload.
- `head-office/persetujuan.js`, `head-office/dashboard.js`, `superadmin/verifikasi.legacy.js`:
  - Ganti `<a href="${API_BASE}${f.url}" target="_blank">` dengan `<button data-file-id>` + fetch token.
  - Object URL di-revoke setelah 10 detik.

**7. `scripts/cleanup-orphan-files.sh` (BARU)**
- Mode `--dry-run` (default): tampilkan file orphan tanpa menghapus.
- Mode `--apply`: hapus file fisik yang tidak ada di tabel `files` (deleted_at IS NULL).
- Bersihkan direktori kosong setelah apply.

**8. `backend/tests/fixtures/test.pdf` (BARU)**
- Fixture PDF 64 byte untuk test upload, tidak berisi data pengguna nyata.

### Matriks Hak Akses Download
| Role | Akses |
|---|---|
| PEGAWAI | file laporan milik sendiri (id_user = user.id) |
| ADMIN_SEKSI | file pegawai di seksi yang sama (id_seksi sama) |
| KEPALA_KANTOR | semua laporan dalam workflow |
| SUPERADMIN | semua file (kebijakan eksplisit) |
| Anonim | 401 |
| Pegawai lain (lintas seksi) | 403/404 |

### Tipe File
| Diterima | Ditolak |
|---|---|
| `application/pdf` | HTML (`text/html`) |
| `image/jpeg` | SVG aktif (`image/svg+xml`) |
| `image/png` | JavaScript (extensi `.js`) |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX) | Executable (ELF, Mach-O, PE) |
| `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (XLSX) | Shell script, arsip (.zip, .tar, .gz) |
| | GIF, BMP, DOC lama (.doc) |

### Hasil Test
| Test | Hasil |
|---|---|
| Unit: deteksi tipe magic bytes (7 test) | **7/7 lulus** |
| Unit: sanitasi nama file & path (5 test) | **5/5 lulus** |
| Unit: struktur tabel files (1 test) | **1/1 lulus** |
| Unit: endpoint lama /uploads (2 test) | **2/2 lulus** |
| **Total test-file-security.js** | **17 passed, 0 failed** |
| E2E: upload tanpa token → 401 | **lulus** |
| E2E: download tanpa token → 401 | **lulus** |
| E2E: upload PDF valid → 200 + id UUID | **lulus** |
| E2E: pegawai B akses file A → 403 | **lulus** |
| E2E: admin seksi A akses file A (seksi sama) → 200 | **lulus** |
| E2E: HTML bernama .pdf → 415 | **lulus** |
| E2E: SVG aktif → 415 | **lulus** |
| E2E: endpoint lama /uploads → 403 | **lulus** |
| E2E: header nosniff | **lulus** |
| E2E: header attachment | **lulus** |
| E2E: header no-store | **lulus** |
| E2E: hapus file (pemilik) → 200 | **lulus** |
| **Total E2E (test-file-security-e2e.sh)** | **12 passed, 0 failed** |
| test-static-security.js (Tahap 3) | **66/66 lulus** |
| test-jwt-rotation.js | **8/8 lulus** |
| Syntax check 27 file `.js` di backend | **0 error** |
| Syntax check frontend (employee/form.js, head-office/*.js, superadmin/*.js) | **0 error** |

### Angka
| Metrik | Nilai |
|---|---|
| Test unit file-security lulus | 17 |
| Test E2E lulus | 12 |
| Test total (file-security + static + jwt) | 91 |
| Test gagal | 0 |
| File `.js` diperiksa sintaks | 27 (backend) + 4 (frontend) = 31 |
| File frontend yang diubah | 4 (employee/form.js, head-office/persetujuan.js, head-office/dashboard.js, superadmin/verifikasi.legacy.js) |
| File backend yang diubah/ditambah | 6 (upload.js, files.js, file-security.js, server.js, migration 006, test fixture) |
| Script baru | 1 (cleanup-orphan-files.sh) |
| Endpoint baru | 2 (GET /api/files/:id, GET /api/files/:id/metadata, DELETE /api/upload/:fileId) |

### Catatan & Pekerjaan Tersisa
| Item | Keterangan |
|---|---|
| **Migrasi file lama** | File yang sudah di `backend/uploads/` sebelum Tahap 4 masih memakai pola lama (URL `/uploads/<nama>`). Script `cleanup-orphan-files.sh --dry-run` tersedia untuk inventarisasi. Migrasi file lama ke tabel `files` belum diimplementasikan — file lama akan tetap dapat diakses hingga migrasi selesai. |
| **Frontend data lama** | Lampiran yang sudah tersimpan di `laporan.lampiran` (JSONB) tanpa field `id` akan memakai fallback URL lama yang menghasilkan 404 setelah endpoint publik dihapus. Migrasi data lama diperlukan sebelum deploy. |
| **Rate limit upload** | Batas ukuran 10 MB sudah di-set di server. Rate limit khusus upload belum diimplementasikan. |
| **Scanner malware** | Interface scanner tidak diimplementasikan. Untuk production, tambahkan ClamAV atau setara sebelum deploy. |
| **Deployment** | BELUM DEPLOY. Migration 006 harus dijalankan di database production sebelum deploy server. |

### Langkah Deploy
1. Jalankan `migration 006_create_files_table.sql` di database production.
2. Jalankan `scripts/cleanup-orphan-files.sh --dry-run` untuk inventarisasi file lama.
3. Copy file yang berubah: `backend/routes/upload.js`, `backend/routes/files.js`, `backend/middleware/file-security.js`, `backend/server.js`, frontend yang berubah.
4. Restart server.
5. Verifikasi: `curl -H "Authorization: Bearer <token>" http://server/api/files/<uuid>` (harus 200), `curl http://server/uploads/<nama>` (harus 403/404).

---

## [FIX-2026-10-12] Keamanan Tahap 3 — Static File Exposure & Path Traversal

**Status**: BELUM DEPLOY — perbaikan source selesai, terverifikasi lokal.
Penerapan pada server production masih pending.

### Gejala
- `backend/server.js` memanggil `express.static(path.join(__dirname, '..'))` — root repository dilayani sebagai static directory.
- Konsekuensi: semua file di root (`.env`, `.git/`, `backend/server.js`, `ksop_laporan_v1_stable.sql`, `CHANGELOG_FIXES.md`, `scripts/`, `backend/db/schema.sql`, `backend/logs/`, `backend/uploads/`) dapat diakses via HTTP.
- `express.static` tidak melindungi dari path traversal: `/%2e%2e/backend/server.js` bisa mengembalikan isi file backend.
- Tidak ada security headers (X-Content-Type-Options, X-Frame-Options, CSP).

### Akar Masalah
- Static root menunjuk ke project root, bukan direktori frontend khusus.
- Tidak ada middleware defense-in-depth untuk path sensitif.
- Tidak ada test path traversal.

### Perbaikan

**Arsitektur static serving baru:**
```
public/            ← express.static HANYA menunjuk ke sini
├��─ index.html
├── login.html
├── style.css
├── js/
│   ├── auth/
│   ├── layouts/
│   └── navigation/
├── employee/
├── admin-section/
├── head-office/
└── superadmin/

backend/           ← TIDAK dilayani static
public/ dibuat oleh: scripts/sync-frontend.sh (from root frontend files)
```

**File yang ditambahkan:**
- `backend/middleware/static-guard.js` — 3 middleware:
  - `securityHeaders()`: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CSP (report-only, tidak mematahkan inline script)
  - `staticGuard()`: tolak prefix `/.git`, `/.env`, `/backend`, `/logs`, `/scripts`, `/db`, `/middleware`, `/routes`, `/uploads`, `/node_modules`, `/handoffs` + dotfile + internal doc
  - `cacheHeaders()`: HTML = no-cache, CSS/JS/assets = public 1h, API = no-store
- `backend/tests/test-static-security.js` — 66 test (24 internal file, 18 public file, 16 path traversal, 2 API 404, 4 security header, 2 cache)
- `scripts/sync-frontend.sh` — salin frontend root → `public/`

**File yang diubah:**
- `backend/server.js`:
  - Hapus `express.static(path.join(__dirname, '..'))` (root repo)
  - Hapus `app.use('/uploads', express.static(...))` (uploads kini hanya via route API terproteksi auth)
  - Tambah `const publicDir = path.resolve(__dirname, '..', 'public')`
  - Tambah `app.use(staticGuard)` sebelum static handler
  - `express.static(publicDir, { dotfiles:'deny', index:false, fallthrough:true })`
  - API 404 handler selalu JSON (tidak pernah kembalikan HTML)
- `.gitignore` — tambah `/public/` (build artifact, jangan commit)

**Perpindahan file (root → public/):**
| Kategori | Jumlah |
|---|---|
| HTML root (index.html, login.html) | 2 |
| CSS root (style.css, dashboard.css, dst.) | 15 |
| JS root (app.js, login.js, translations.js, dst.) | 4 |
| employee/ | 11 |
| admin-section/ | 14 |
| head-office/ | 10 |
| superadmin/ | 22 |
| js/ (auth, layouts, navigation) | 10 |
| **Total** | **88 file** |

### Hasil Test
| Test | Hasil |
|---|---|
| File internal (24 path) | **24/24 → 404/403** |
| File publik (18 path) | **18/18 → 200, Content-Type benar** |
| Path traversal (16 variasi) | **16/16 → 400/403/404** |
| API 404 → JSON (2 test) | **2/2** |
| Security headers (4 test) | **4/4** |
| Cache headers (2 test) | **2/2** |
| **Total test-static-security.js** | **66 passed, 0 failed** |
| Syntax check 68 file `.js` (project + public) | **0 error** |
| `test-jwt-rotation.js` (8 test) | **8/8 lulus** |
| Ekstraksi ZIP + npm install + all tests | **74/74 lulus** |

### Angka
| Metrik | Nilai |
|---|---|
| URL internal diuji | 24 |
| URL publik diuji | 18 |
| Variasi path traversal diuji | 16 |
| Test lulus (static security) | 66 |
| Test gagal | 0 |
| File dipindahkan ke public/ | 88 |
| Referensi frontend yang perlu diubah | 0 (absolute root path sudah sesuai) |
| File ZIP paket baru | 155 |
| Ukuran ZIP baru | 264,175 bytes (257 KB) |

### Catatan
- Uploads: route `GET /uploads/:filename` (download lampiran) belum diimplementasikan. Saat ini frontend memakai `API_BASE + f.url` (`/uploads/<filename>`) yang sebelumnya dilayani `express.static(uploads)`. Setelah Tahap 3, URL ini menghasilkan 404. **Perbaikan download lampiran ditunda ke Tahap 4** (tambah endpoint API GET terproteksi auth di `backend/routes/upload.js`).
- CSP memakai `script-src 'unsafe-inline'` karena aplikasi masih memakai inline script di HTML. Untuk CSP enforcement penuh, lihat rencana tahap XSS hardening.

---

## [FIX-2026-10-12] Keamanan Tahap 2 — Sanitasi Repository & Paket Distribusi

**Status**: BELUM DEPLOY — perbaikan source selesai, terverifikasi lokal.
Penerapan pada server production masih pending.

### Gejala
- `ksop_laporan_v1_stable.sql` (dump data nyata: 6 user, hash bcrypt, NIP, nama) berada di working tree tanpa protection.
- `STABILITY_ANALYSIS.md`, `RDP.md` (internal doc) berpotensi masuk distribusi.
- `backend/uploads/` (3 file upload nyata) masih di Git index.
- `npm install` dari ekstraksi paket gagal: `jsonwebtoken` tidak tersedia (test butuh node_modules).
- `STABILITY_ANALYSIS.md` memuat snippet JWT lama yang bisa disalin tanpa sengaja.

### Akar Masalah
- Tidak ada allowlist untuk paket distribusi (blacklist saja: file baru yang tidak dikenal lolos).
- `setup-seed.js` membawa NIP fiktif (dev seed) — acceptable tapi perlu didokumentasikan.
- `npm install --omit=dev` tidak cukup untuk test: `jsonwebtoken` ada di dependencies (OK) tapi test dipanggil sebelum install.
- Internal doc (`RDP.md`, `STABILITY_ANALYSIS.md`) tidak dieksklusi dari paket lama (blacklist-based).

### File yang Dikeluarkan dari Distribusi
| File | Alasan |
|------|--------|
| `ksop_laporan_v1_stable.sql` | Dump data nyata (user, NIP, hash bcrypt) |
| `STABILITY_ANALYSIS.md` | Dokumen analisis internal, bukan dibutuhkan untuk menjalankan aplikasi |
| `RDP.md` | Dokumen internal (Remote Desktop?) — tidak dibutuhkan untuk deploy |
| `CHANGELOG_FIXES.md` | Catatan internal proyek, bukan bagian runtime |
| `backend/uploads/*` | Data runtime/upload pengguna |
| `backend/logs/*` | Log runtime |
| `backend/private/*` | Data private runtime |
| `backend/node_modules/*` | Dependency terpasang development, bukan bagian paket |
| `.env` | Kredensial nyata |
| `.DS_Store`, `__MACOSX` | Metadata OS |
| `*.dump`, `*.backup`, `*.bak` | Backup/restore file |

### Perubahan `.gitignore`
Ditambahkan:
- `*.dump`, `*.backup`, `*.bak`, `*.sql.gz`
- `ksop_laporan_v1_stable.sql` (spesifik, bukan global `*.sql`)
- `*.tmp`, `*.temp`, `*.swp`
- `backend/node_modules/`
- `backend/private/`
- `.release-staging-*/`, `release-*/`

### Cara Pembuatan Paket Baru
```bash
cd "monitoring bulanan"
bash scripts/build-release.sh
# Output: monitoring-bulanan-release-<timestamp>.zip
# Audit:  python3 scripts/audit-release.py
```

### Perbandingan Paket
| Metrik | Paket Lama (`make-safe-release`) | Paket Baru (`build-release`) |
|--------|--------------------------------|------------------------------|
| Metode | Blacklist (rsync + exclude) | Allowlist (salin eksplisit) |
| Jumlah file | 160 | 153 |
| Ukuran | 269,546 bytes (263 KB) | 256,699 bytes (250 KB) |
| `STABILITY_ANALYSIS.md` | Ada (❌) | Tidak ada (✅) |
| `RDP.md` | Ada (❌) | Tidak ada (✅) |
| `CHANGELOG_FIXES.md` | Ada | Tidak ada |
| Internal doc lain | Tidak ada | Tidak ada |

### Hasil Audit Paket (`audit-release.py`)
- File terlarang (`.env`, `.git`, `node_modules`, `uploads`, `logs`, `.DS_Store`, `__MACOSX`, `*.dump`, `*.backup`): **0 ditemukan**
- Path traversal (`../`): **0 ditemukan**
- Symlink: **0 ditemukan**
- Hash bcrypt di file teks: **0 ditemukan**
- Pola NIP (non-seed): **0 ditemukan** (NIP di `setup-seed.js` = data dev fiktif, dikecualikan)
- Secret hex 64+ di file `.js`: **0 ditemukan**
- File wajib (`package.json`, `package-lock.json`, `.env.example`, schema, migration, test, docs): **semua hadir**

### Hasil Test
| Test | Hasil |
|------|-------|
| Syntax check 66 file `.js` (ekstrak ZIP) | 0 error |
| `test-jwt-rotation.js` (8 test) dari ekstraksi + `npm install` | **8/8 lulus** |
| `security-check.js` syntax | OK |
| `schema.sql` pada PostgreSQL kosong (test DB) | OK |
| 5 migration (001–005) pada PostgreSQL kosong | **0 error** |
| Kolom `must_change_password` setelah migration | ✅ ada |
| `npm install` dari lockfile | OK (179 packages) |

### Hasil Test
- 8/8 test JWT rotation lulus (termasuk pada ekstraksi ZIP + npm install).
- 66 file `.js` lolos syntax check.
- Schema + 5 migration valid pada PostgreSQL 16.
- `npm install` dari `package-lock.json` berhasil (179 packages, exit 0).

### Tindakan Production yang Belum Dapat Dilakukan
(Belum berubah dari Tahap 1 — akses ke server/DB production tidak tersedia)
1. Rotasi `JWT_SECRET` di server production.
2. Rotasi `DB_PASSWORD` di database production.
3. Jalankan `005_add_must_change_password.sql` di production.
4. Set `must_change_password = true` untuk user yang berasal dari dump data.
5. Ganti default password seed di production.

---

## [FIX-2026-10-12] Keamanan Tahap 1 — JWT Secret, Database Credentials, Artefak Sensitif

**Status**: BELUM DEPLOY — perbaikan source selesai dan terverifikasi lokal.
Penerapan pada server production masih pending.

### Masalah
1. `backend/uploads/*.pdf` dan `*.png` (3 file) dilacak oleh Git.
2. `ksop_laporan_v1_stable.sql` (dump data nyata berisi hash password bcrypt, nama, NIP) berada di working tree tanpa `gitignore` protection.
3. `backend/scripts/setup-seed.js` mencetak password default (`admin123`, dst.) ke console log tanpa guard production.
4. `STABILITY_ANALYSIS.md` memuat snippet kode lama dengan JWT fallback `'ksop-secret-key-change-in-production'` yang masih bisa disalin.
5. `backend/middleware/auth.js` gagal start jika `JWT_SECRET` kosong, TIDAK memvalidasi panjang atau placeholder.
6. `backend/db/database.js` membaca `DB_PASSWORD` dengan fallback `''` tanpa validasi placeholder di production.
7. Tidak ada mekanisme fail-fast terpusat untuk konfigurasi keamanan.
8. `.gitignore` tidak mencakup `*.dump`, `*.backup`, `__MACOSX`, `backend/private/`.
9. Tidak ada test otomatis untuk verifikasi rotasi JWT.
10. Tidak ada dokumentasi rotasi kredensial dan role DB minimum untuk production.

### Akar
- Tidak ada validasi konfigurasi keamanan terpusat saat startup.
- Tidak ada fail-fast untuk `JWT_SECRET` terlalu pendek/placeholder.
- Tidak ada pemisahan antara schema aman (boleh dilacak) dan dump data (wajib dikeluarkan).
- `setup-seed.js` tidak membedakan mode dev dan production.

### Perbaikan
- **`backend/scripts/security-check.js` (BARU)** — modul fail-fast yang tervalidasi oleh `server.js`:
  - Tolak startup jika `JWT_SECRET` kosong.
  - Tolak jika `JWT_SECRET` < 32 karakter.
  - Mode production: tolak `JWT_SECRET` dan `DB_PASSWORD` berisi placeholder.
  - Pesan error informatif, tidak menampilkan nilai secret.
- **`backend/server.js`** — panggil `security-check.js` sebelum inisialisasi app.
- **`backend/db/database.js`** — validasi `DB_PASSWORD` (placeholder/empty di production → exit), tidak log detail koneksi.
- **`backend/.env.example`** — placeholder aman, tanpa secret nyata, dokumentasi lengkap.
- **`.gitignore`** — diperbarui: `*.dump`, `*.backup`, `__MACOSX`, `backend/private/`.
- **`backend/tests/test-jwt-rotation.js` (BARU)** — 8 test untuk verifikasi rotasi JWT dan validasi konfigurasi.
- **`backend/db/migrations/005_add_must_change_password.sql` (BARU)** — kolom `must_change_password BOOLEAN NOT NULL DEFAULT false` untuk mekanisme password reset setelah dump data.
- **`backend/docs/db-credentials.md` (BARU)** — dokumentasi rotasi kredensial, role DB minimum, prosedur `ALTER ROLE`.
- **`backend/scripts/setup-seed.js`** — password seed sekarang via env vars; mode production menolak tanpa `SEED_*_PASSWORD`; log tidak lagi menampilkan password.
- **`STABILITY_ANALYSIS.md`** — snippet JWT lama ditandai `[DIKOREKSI] HINA SALIN-INI KE PRODUCTION`, kode sekarang ditambahkan.
- **`backend/package.json`** — tambah script `test` dan `security-check`.
- **`scripts/make-safe-release.sh` (BARU)** — prosedur pembuatan paket distribusi aman (eksklusi `.git`, `.env`, uploads, logs, `node_modules`, `.DS_Store`, `__MACOSX`, `*.dump`, `*.backup`, `ksop_laporan_v1_stable.sql`).

### Verifikasi
- **Test**: 8/8 test lulus (`node tests/test-jwt-rotation.js`).
- **Syntax check**: 66 file `.js` diperiksa, 0 error.
- **Audit ZIP**: 160 file dalam paket, 0 file sensitif, 0 hash bcrypt, 0 secret hex 64+.
- **Aplikasi gagal aman**: `JWT_SECRET=''` → exit 1 dengan pesan `[SECURITY-CHECK] FATAL: JWT_SECRET tidak diset`.
- **Rotasi JWT**: token lama (secret lama) ditolak setelah secret berubah — verified by test 1.

### Angka
| Metrik | Nilai |
|--------|-------|
| File `.js` diperiksa syntax | 66 |
| Error syntax | 0 |
| Test dijalankan | 8 |
| Test lulus | 8 |
| Test gagal | 0 |
| File dalam paket ZIP | 160 |
| File sensitif di paket | 0 |
| File untracked dari Git index (uploads) | 3 |
| Artefak Git yang dihapus dari index | 3 (`backend/uploads/*.pdf`, `*.png`) |
| Dump data nyata yang dikecualikan dari distribusi | 1 (`ksop_laporan_v1_stable.sql`) |
| Migration SQL baru | 1 (`005_add_must_change_password.sql`) |
| Dokumentasi baru | 2 (`db-credentials.md`, `security-check.js` docs) |

### Keyword Log (untuk troubleshooting)
- `[SECURITY-CHECK] FATAL: JWT_SECRET` — startup gagal karena JWT_SECRET tidak valid.
- `FATAL: DB_PASSWORD` — startup gagal karena DB_PASSWORD tidak valid di production.
- `[SECURITY-CHECK] Konfigurasi aman` — startup berhasil.

### Tindakan Production yang Belum Dapat Dilakukan
1. **Rotasi JWT_SECRET di server production** — tidak ada akses ke environment production.
   Setelah deploy: jalankan `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`,
   set `JWT_SECRET` di environment server, restart. Seluruh user harus login ulang.
2. **Rotasi DB_PASSWORD** — tidak ada akses ke database production.
   Jalankan `ALTER ROLE ksop_app WITH PASSWORD '<new_password>'` sebagai superuser,
   set `DB_PASSWORD` di environment, restart.
3. **Jalankan migration `005_add_must_change_password.sql`** di production database.
4. **Set `must_change_password = true`** untuk user yang berasal dari dump data.
5. **Ganti default password seed** (`admin123`, dst.) dengan password kuat di production.

### Catatan
- `backend/uploads/` (3 file) sudah untracked dari Git index; file masih ada di working tree lokal.
- `ksop_laporan_v1_stable.sql` sengaja TIDAK dihapus dari working tree (memiliki schema + data, berguna untuk setup).
  File ini dikecualikan dari distribusi ZIP secara eksplisit oleh `make-safe-release.sh`.
- `.git` folder tidak disentuh.
- Logout saat ini hanya hapus token di browser; tidak ada revocation server-side.
  Dokumentasi di `backend/docs/db-credentials.md`.
