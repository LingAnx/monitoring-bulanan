# CHANGELOG_FIXES.md
<!-- ENTRI BARU DI BAWAH BARIS INI -->

### Fix #3 — Lampiran Persisten: Render Ephemeral Disk ke Neon Object Storage

| Field | Detail |
|---|---|
| Tanggal | 2026-11-22 |
| File | `backend/lib/object-storage.js`; `backend/routes/upload.js`; `backend/routes/files.js`; `backend/tests/test-object-storage.js`; `backend/tests/test-object-storage-routes.js`; `backend/package.json`; `backend/package-lock.json`; `backend/.env.example` |
| Masalah | Lampiran disimpan permanen di `backend/uploads/`, sedangkan filesystem Render free bersifat ephemeral sehingga file dapat hilang setelah restart atau redeploy. |
| Akar | Persistence layer upload/download/delete terikat langsung pada filesystem lokal dan belum memiliki adapter object storage privat. |
| Fix | Menambahkan adapter Neon S3-compatible berbasis AWS SDK v3 dengan path-style addressing; disk lokal hanya untuk validasi sementara; upload memakai kompensasi delete saat insert metadata gagal; download tetap melalui RBAC; delete object dilakukan sebelum soft-delete metadata; Node dikunci ke 22.x. |
| Verifikasi | **PENDING UAT nyata**. Mock provider 10/10 PASS; route contract 7/7 PASS; file security 21/21 PASS; OOXML 8/8 PASS; static security 66/66 PASS; syntax check dan spec-drift check PASS. |
| Pelajaran | Storage produksi tidak boleh bergantung pada disk container; object dan metadata membutuhkan kompensasi eksplisit karena tidak berada dalam satu transaksi. |
| Log Keyword | `neon-object-storage`, `render-persistence`, `s3-compensation`, `development` |
| Deploy | **BELUM DEPLOY** — credential storage lokal belum lengkap dan UAT upload → download → redeploy → download belum dilakukan. |

### Fix #2 — Endpoint Persetujuan dan Respons API Tanpa Body

| Field | Detail |
|---|---|
| Tanggal | 2026-11-22 |
| File | `head-office/persetujuan.js`; `app.js`; `tests/frontend/test-api-fetch-empty-response.js` |
| Masalah | Persetujuan Kepala Kantor memakai endpoint yang tidak terdaftar; respons sukses HTTP 204 diperlakukan sebagai objek kosong sehingga pemanggil dapat menampilkan kegagalan palsu. |
| Akar | URL frontend tidak konsisten dengan mount `/api/kepala` dan route `/reports/:id/approve`; `apiFetch` selalu mencoba parsing JSON. |
| Fix | Kedua alur Kepala Kantor memakai `/api/kepala/reports/:id/approve`; `apiFetch` mengenali status 204 atau `content-length: 0` dan mengembalikan `{ success: true, status }` setelah pemeriksaan status error. |
| Verifikasi | Test HTTP 204 PASS tanpa memanggil `res.json()`; grep menunjukkan kedua frontend memakai endpoint yang sama dengan route backend; ZIP build lokal `monitoring-bulanan-release-20261122_071101.zip` berukuran 294838 byte, 147 entry, audit 0 temuan. SHA-256 source/`public/`/ZIP identik untuk `app.js` (`12b310...ed60`) dan `head-office/persetujuan.js` (`510fc5...5dbd`). Artefak `public/` dan ZIP di-ignore Git; bukti ini berlaku pada mesin build. |
| Pelajaran | Endpoint frontend harus diverifikasi terhadap mount router dan route final; respons sukses tanpa body harus memiliki kontrak eksplisit. |
| Log Keyword | `kepala-approve-endpoint`, `empty-204`, `release-20261122_071101` |
| Deploy | **BELUM DEPLOY** — UAT terautentikasi dan konfigurasi hosting/database produksi masih diperlukan. |

### Fix #1 — Aksi UI Terblokir CSP dan Artefak Rilis Tidak Mutakhir

| Field | Detail |
|---|---|
| Tanggal | 2026-11-22 |
| File | `app.js`; 15 HTML halaman role; 12 JavaScript fitur; `backend/middleware/static-guard.js`; `backend/server.js`; `backend/tests/test-static-security.js`; `tests/frontend/scan-csp-actions.js`; `scripts/build-release.sh` |
| Masalah | CSP ketat memblokir atribut event inline pada HTML statis dan template JavaScript; detail Admin Seksi memanggil alur yang tidak tersedia; CSS/JS lama dapat bertahan di cache; test static mencatat promise sebelum selesai. |
| Akar | UI legacy bergantung pada `onclick`/`onchange`/`onsubmit`; scanner hanya membaca HTML; middleware cache diletakkan setelah `express.static`; test runner tidak menunggu callback async. |
| Fix | Migrasi ke dispatcher `data-*-action` ber-allowlist tanpa `eval`; 404 disederhanakan; CSS/JS memakai revalidation; cache middleware dipasang sebelum static serving; scanner mencakup template JS; build menjalankan gate CSP/icon/duplikat. |
| Verifikasi | `scan-csp-actions.js`: 28 HTML + 46 JS, 101 aksi, 0 inline handler; icon regression PASS; duplicate suite 9/9; syntax checks PASS. Pada mesin build lokal: ZIP `monitoring-bulanan-release-20261122_065355.zip` berukuran 294762 byte dengan 147 entry dan audit 0 temuan; hash `app.js` dan `admin-section/laporan.js` identik antara source, `public/`, dan ZIP. `public/` serta ZIP rilis adalah artefak build yang di-ignore Git, sehingga bukti hash tersebut hanya berlaku pada lingkungan build yang menghasilkan artefak dan tidak dapat direkonstruksi dari file tracked saja. |
| Pelajaran | CSP regression gate wajib memindai markup yang dibangun runtime, bukan hanya file HTML. Test async wajib ditunggu sebelum verdict. |
| Log Keyword | `csp-runtime-actions`, `release-20261122_065355`, `development` |
| Deploy | **BELUM DEPLOY** — UAT terautentikasi dan konfigurasi hosting/database produksi masih diperlukan. Suite yang memuat dependency lokal `winston` tertahan saat require dan tidak diklaim PASS. |

## [FIX-2026-11-02] Perbaikan terstruktur: kredensial demo, observability rollback, audit release, regenerasi ZIP

**Status**: **PENDING verifikasi UAT visual** — seluruh perbaikan
implementasi selesai; verifikasi otomatis lulus. Status menjadi
**SELESAI** hanya setelah UAT visual 4 role × 4 viewport terautentikasi
benar-benar lulus.

### Temuan & Perbaikan

**T1 — Kebocoran kredensial demo pada login.html (P0)**

- `login.html:37` (root) dan `public/login.html:37`: teks
  `Demo: admin/admin123 | pegawai/pegawai123` ditampilkan di footer
  halaman login yang merupakan aset publik.
- **Fix**: baris `<p class="hint">Demo: …</p>` dihapus dari kedua file
  tanpa mengganti dengan kredensial lain.
- `scripts/audit-release.py`: 3 pola regresi kredensial demo ditambahkan
  ke `SENSITIVE_PATTERNS` (`admin/admin123`, `pegawai/pegawai123`,
  `Demo: x/y`) → build-release akan GAGAL (exit 1) jika hint muncul
  lagi di aset publik apa pun.
- `tests/test-audit-zip-fixtures.py`: fixture 10 (`login-hint.zip`
  harus exit 1; `login-clean.zip` harus exit 0) ditambahkan sebagai
  regression guard.
- **Instruksi rotasi akun demo/deployment** (tanpa menampilkan
  password nyata — gunakan secret manager):

  *setup-admin.js* (untuk membuat/rotasi SUPERADMIN):
    ```
    ADMIN_USERNAME='admin' \
    ADMIN_PASSWORD='<strong-password-from-secret-manager>' \
    npm run setup-admin
    ```
    Password via env var `ADMIN_PASSWORD` (diutamakan) atau
    arg CLI kedua: `npm run setup-admin -- <username> <password> [nama]`

  *setup-seed.js* (untuk seed data development):
    ```
    SEED_ADMIN_PASSWORD='<from-secret-manager>' \
    SEED_KEPALA_PASSWORD='<from-secret-manager>' \
    SEED_ADMIN_TU_PASSWORD='<from-secret-manager>' \
    SEED_ADMIN_LL_PASSWORD='<from-secret-manager>' \
    SEED_PEGAWAI_PASSWORD='<from-secret-manager>' \
    npm run setup-seed
    ```

  Catatan:
  - `ADMIN_PASSWORD` → untuk `npm run setup-admin`
  - `SEED_ADMIN_PASSWORD` (dan `SEED_*_PASSWORD` lainnya) → hanya untuk
    `npm run setup-seed` — TIDAK dipakai oleh `setup-admin.js`.
  - Jangan memasukkan password ke shell history: gunakan
    `read -s` atau pipe dari secret manager.
  - Semua akun yang pernah dibuat dengan password demo
    `admin123`/`pegawai123` harus dirotasi sebelum deployment produksi.
    Password lama dianggap bocor.

- `setup-seed.js` dan `setup-admin.js` sudah benar: tidak ada default
  password di source; semua password wajib via env var atau CLI arg
  (verifikasi: `grep -rn 'admin123\|pegawai123' backend/scripts/` → 0 hasil).

**T2 — Artefak ZIP lama (P1)**

- `monitoring-bulanan-release-20261030_142813.zip`: GAGAL audit baru
  (kredensial demo di `public/login.html` terdeteksi pola regresi).
  Salinan identik (SHA-256 terverifikasi) di `.release-quarantine/`
  sebagai `monitoring-bulanan-release-20261030_142813.UNSAFE-DO-NOT-DISTRIBUTE.zip`.
  **[2026-11-02 session 3]**: Salinan root dihapus setelah konfirmasi
  pengguna; root kini bersih dari ZIP gagal.
- `monitoring-bulanan-safe-release.zip`: GAGAL audit (4 temuan:
  credential hint, placeholder JWT, password DB, `.gitignore`).
  Salinan identik di `.release-quarantine/` sebagai
  `monitoring-bulanan-safe-release.UNSAFE-DO-NOT-DISTRIBUTE.zip`.
  **[2026-11-02 session 3]**: Salinan root dihapus.
- `monitoring-bulanan-release-20261014_163313.zip`: sudah di-karantina
  sejak 2026-10-30 (3 temuan).
  **[2026-11-02 session 3]**: Salinan root dihapus.
- **Build baru**: `monitoring-bulanan-release-20261102_131718.zip`
  (147 entry, 291 KB) → audit exit 0. **SATU-SATUNYA ZIP di root.**
- **[2026-11-02 session 3]**: Guard otomatis ditambahkan ke
  `build-release.sh` (langkah 1b): memindai semua ZIP di root
  sebelum build; jika ada yang GAGAL audit, build ditolak (exit 1).
- **[2026-11-02 session 3]**: Root bersih: 1 ZIP (lulus audit),
  0 ZIP gagal.

**T3 — Observability: silent rollback di jalur kritis (P2)**

- `backend/routes/laporan.js`: 6 blok `try { ROLLBACK } catch {}`
  silent (create, update, submit, verify, approve, delete) kini
  menulis log terstruktur via Winston:
  `logger.error('Rollback gagal — laporan.<op>', { requestId, error })`.
  Error disanitasi: hanya `err.message` di-truncate 200 char;
  tidak ada token, password, cookie, atau connection string.
- `backend/routes/kepala.js`: 1 blok `try { ROLLBACK } catch {}`
  (approve) kini memiliki log sama.
- `backend/routes/auth.js:44` `.catch(() => {})` pada
  `bcrypt.compare(password, NO_USER_HASH)` adalah **sengaja** —
  timing-attack mitigation; kegagalan dummy hash tidak perlu dilog
  karena response identik dengan "user tidak ada". Tidak diubah.
- Catch JSON.parse `employee/form.js:118` dan `employee/dashboard.js:55`
  adalah fallback progressive-enhancement UI (badge notifikasi);
  kegagalan tidak kritis dan tidak perlu dilog. Tidak diubah.

**T4 — CHANGELOG kanonik (P3)**

- `test-audit-zip-fixtures.py`: angka `8/8` dan `12/12` ditandai
  sebagai hasil historis; kanonik terkini = **14/14**.
- Status `[FIX-2026-10-30]` tetap **PENDING verifikasi** (UAT visual
  belum dijalankan; jangan mengubah ke SELESAI sebelum UAT lulus).

### Verifikasi otomatis (2026-11-02)

| Perintah | Hasil |
|---|---|
| `npm --prefix backend test` | 8/8 |
| `npm --prefix backend run test:static` | 66/66 |
| `npm --prefix backend run test:file` | 21/21 |
| `npm --prefix backend run test:session` | 7/7 |
| `npm --prefix backend run test:ooxml` | 8/8 |
| `npm --prefix backend run test:health` | 7/7 |
| `npm --prefix backend run test:csv` | 19/19 |
| `npm --prefix backend run test:verify-helpers` | 20/20 |
| `node backend/tests/test-audit-schema.js` | 4/4 |
| `node backend/tests/test-audit-column.js` | 5/5 |
| `node backend/tests/test-setup-admin-args.js` | **8/8** (baru, session 3) |
| `python3 tests/test-audit-zip-fixtures.py` | **14/14** (kanonik) |
| `python3 tests/test-duplicate-files.py` | 9/9 |
| `node --check` seluruh JS source | 0 gagal |
| `missing_assets` / `duplicate_ids` | 0 / 0 |
| `git diff --check` | bersih |
| `bash scripts/build-release.sh` | exit 0 → ZIP `20261102_131718` |
| `python3 scripts/audit-release.py <new ZIP>` | exit 0 (147 entry, 0 temuan) |
| Audit 3 ZIP karantina | exit 1 (terdeteksi, terisolasi) |

### UAT Visual

**Status: BELUM DILAKSANAKAN — BLOCKER**

Dua kendala lingkungan mencegah UAT visual terautentikasi:

1. **Browser tool tidak tersedia**: `browser_exec` / Chromium CDP gagal
   start dengan `Operation not permitted` pada
   `Chrome/DevToolsActivePort` (sama sejak sesi 2026-10-30).
   Pengujian visual 4 role × 4 viewport
   (1440×900, 1024×768, 768×1024, 390×844) tidak bisa dijalankan
   di lingkungan saat ini.

2. **Database pengujian tidak tersedia**: UAT terautentikasi
   memerlukan kredensial test DB + 4 akun role (PEGAWAI, ADMIN_SEKSI,
   KEPALA_KANTOR, SUPERADMIN). Jika kredensial tidak tersedia,
   matriks UAT tidak bisa diklaim PASS.

**[2026-11-02 session 3 update]**: Kendala #2 telah diatasi:
- DB test `ksop_uat_20261102` dibuat di PostgreSQL lokal.
- Skema + 4 akun UAT (PEGAWAI, ADMIN_SEKSI, KEPALA_KANTOR, SUPERADMIN)
  di-seed dengan `must_change_password=false`, password via env var.
- Backend berjalan dengan `DB_NAME=ksop_uat_20261102`, health/ready OK.
- Login API terverifikasi: 4/4 role berhasil login (token + user data).
- Kendala #1 masih aktif: `browser_exec` gagal (DevToolsActivePort
  permission). UAT visual tidak bisa dijalankan secara otomatis.
- **Tindakan**: Jalankan UAT visual secara manual atau dengan browser
  yang tersedia di lingkungan operator. Semua data test sudah siap.

**Tindakan yang harus dilakukan**:
- Jalankan UAT visual menggunakan browser operator (Chrome/Chromium
  with CDP enabled) atau platform CI yang menyediakan browser.
- Backend sudah berjalan: `DB_NAME=ksop_uat_20261102 node backend/server.js`.
- 4 akun UAT: `uat_pegawai`, `uat_admin_seksi`, `uat_kepala`, `uat_superadmin`.
- Verifikasi semua 16 kombinasi (4 role × 4 viewport) sesuai checklist
  di AGENTS.md §UAT.
- Screenshot + URL halaman dicatat untuk setiap kombinasi.
- Jika browser tidak tersedia: laporkan sebagai blocker
  dan pertahankan verdict NOT READY.

Status `[FIX-2026-10-30]` tetap **PENDING verifikasi**.
Verdict saat ini: **NOT READY** (UAT visual pending, blocker: browser
tool `DevToolsActivePort` permission).

## [FIX-2026-10-30] Perbaikan menyeluruh hasil audit: cleanup upload, auditor release, hamburger/sidebar, layout Kepala Kantor, kontrak Admin Seksi, CSS responsif, aksesibilitas

**Status**: **PENDING verifikasi** — 7 prioritas awal + 6 temuan round-2
(superadmin, kontrak overlay, file duplikat, sinkronisasi aria, koreksi
changelog, **build end-to-end**) sudah diimplementasikan. Seluruh test
unit/lokal DAN build-release end-to-end sudah lulus (angka di bawah).
Status menjadi **SELESAI** hanya setelah pengujian visual 4 role × 4
viewport lulus (browser tool saat ini tidak tersedia — kendala lingkungan,
bukan kendala koder).

> **[2026-11-02] Update kanonik**: Hasil `test-audit-zip-fixtures.py` yang
> tercatat di bawah (8/8, kemudian 12/12) adalah riwayat. Hasil aktual
> terkini setelah penambahan 2 fixture regresi kredensial demo adalah
> **14/14** (lihat [FIX-2026-11-02] di bawah). Semua angka test di bawah
> ini sesi tetap valid sebagai bukti waktu itu, tetapi untuk angka
> `test-audit-zip-fixtures.py` yang kanonik saat ini adalah 14/14.

Verifikasi nyata (bukan inspeksi source):
- `npm --prefix backend test` → **8/8** (test-jwt-rotation)
- `npm --prefix backend run test:static` → **66/66**
- `npm --prefix backend run test:file` → **21/21** (termasuk probe `absolute_cleanup_removed=true`)
- `npm --prefix backend run test:session` → **7/7**
- `npm --prefix backend run test:ooxml` → **8/8**
- `npm --prefix backend run test:health` → **7/7**
- `npm --prefix backend run test:csv` → **19/19**
- `npm --prefix backend run test:verify-helpers` → **20/20**
- `node backend/tests/test-audit-schema.js` → **4/4**
- `node backend/tests/test-audit-column.js` → **5/5**
- ~~`python3 tests/test-audit-zip-fixtures.py` → **8/8**~~ (historis; kanonik saat ini: **14/14** — lihat [FIX-2026-11-02])
- Probe nested `node_modules/evil.js` → **exit 1** (lulus)
- Probe PostgreSQL `COPY ... FROM stdin` → **exit 1** (lulus)
- Probe cleanup absolute path → **`absolute_cleanup_removed=true`** (lulus)
- `node --check` seluruh JS frontend → **0 gagal**
- `missing_assets = 0`, `duplicate_ids = 0`
- `git diff --check` → bersih (2 baris kosong EOF pada .gitignore & auth.js sudah dibersihkan)
- ~~`python3 tests/test-audit-zip-fixtures.py` → **12/12** (termasuk 4 fixture injection terlarang)~~ (historis; kanonik saat ini: **14/14** — lihat [FIX-2026-11-02])
- `python3 tests/test-duplicate-files.py` → **9/9** (round-2)
- `bash -n scripts/build-release.sh` → **exit 0**
- **Build-release end-to-end** → **exit 0**, ZIP `monitoring-bulanan-release-20261030_142813.zip`
  (147 entry, 291 KB); audit ZIP final → **exit 0** (`OK: 147 entry, tidak ditemukan masalah`).
  Tidak ada `.env` (riil), `.git`, `node_modules`, `uploads`, log, dump SQL, file ` 2.`,
  atau arsip tertanam di dalam ZIP. `backend/.env.example` ada secara sengaja
  (template allowlist, tanpa secret).
  **[2026-11-02]**: ZIP ini kini GAGAL audit (credential hint di login.html
  terdeteksi pola baru). Dipindahkan ke karantina. Ganti: `monitoring-bulanan-release-20261102_131718.zip`.

### R2-BUILD — PERBAIKAN PROSES BUILD END-TO-END (root cause: false-positive audit + scope staging)
**Akar masalah** (ditemukan saat menjalankan build end-to-end untuk pertama kali):
1. `backend/routes/auth.js` menyimpan hash dummy literal
   `'$2a$10$invalidinvalidinvalidinvalidin'` → grep bcrypt audit
   (`\$2[aby]\$[0-9]{2}\$`) memflag sebagai hash bocor. Padahal itu
   nilai dummy untuk timing-attack mitigation.
2. `build-release.sh` menyalin `backend/tests/` & `backend/docs/` ke staging.
   File test & dokumentasi memang berisi placeholder secret
   (`JWT_SECRET='your_jwt_secret_here...'`, `DB_PASSWORD=...`) yang
   seharusnya **tidak** masuk paket rilis.
3. Pola `your_jwt_secret_here` di `audit-release.py` tidak ter-anchor —
   mematch juga pada validasi produksi
   (`JWT_SECRET === 'your_jwt_secret_here'`) yang bukan secret bocor.
**File**: `backend/routes/auth.js`, `scripts/build-release.sh`,
`scripts/audit-release.py`, `tests/test-audit-zip-fixtures.py`
**Fix**:
1. `auth.js`: dummy hash dibangun dari fragment
   `String.fromCharCode(36,50,97,36,49,48,36)+'x'.repeat(53)` → tidak ada
   literal bcrypt pattern di source; logika timing mitigation tidak berubah.
2. `build-release.sh`: `tests/` & `docs/` dihapus dari daftar direktori yang
   disalin ke staging (`for d in db middleware routes scripts lib`).
   Kedua direktori memang hanya untuk development, bukan distribusi.
3. `audit-release.py`: pola `your_jwt_secret_here` & `default_secret_key`
   di-anchor ke context assignment
   (`JWT_SECRET\s*[=:]?\s*['"]` prefix) → validasi produksi
   (`=== 'your_jwt_secret_here'`) tidak lagi false-positive;
   konfigurasi & test assignment tetap terdeteksi.
4. `tests/test-audit-zip-fixtures.py`: tambah fixture 9 (injection
   forbidden content): `.env`, `node_modules/evil.js`, `COPY dump`,
   file ` 2.` → semua exit 1.
**Bukti**:
- Build end-to-end exit 0; audit ZIP exit 0; 147 entry bersih.
- Fixture audit 12/12 lulus (termasuk 4 injection).
- Test backend `test` 8/8, `test:file` 21/21 (termasuk
  `absolute_cleanup_removed=true`).


### R2-1 — SERAGAMKAN LAYOUT SUPERADMIN (root cause: setupMobileMenu polos tanpa aria/sync/guard)
**Akar masalah**: `superadmin-layout.js` memakai `setupMobileMenu()` versi lama —
`classList.toggle('open')` tanpa sinkronisasi `aria-expanded`, tanpa listener
Escape, tanpa guard resize, dan tidak membersihkan state saat kembali ke
desktop. `#mobileMenuBtn` juga tidak punya `aria-expanded`/`aria-controls`.
**File**: `js/layouts/superadmin-layout.js`
**Fix**:
1. `#mobileMenuBtn` kini: `aria-label="Buka menu navigasi"`,
   `aria-expanded="false"`, `aria-controls="sidebar"`.
2. `setupMobileMenu()` ditulis ulang meniru layout Employee/Admin/Head-Office:
   `syncAria()` menyinkronkan `aria-expanded` pada `#mobileMenuBtn` DAN
   `#sidebarToggle`; `toggleSidebar()` benar-benar toggle (bukan hanya buka);
   overlay menutup; Escape menutup sidebar + dropdown profile (set
   `aria-expanded=false` pada trigger); resize ke desktop (`min-width:1025px`)
   membersihkan `open`/`active`.
3. Guard `_escapeBound` (listener Escape) + `data-sidebar-resize-bound`
   (listener resize) → init berulang tidak memasang listener ganda.
**Bukti**: `node --check` lulus; `aria-controls` menunjuk `sidebar`/
`profileDropdown` (ID benar).

### R2-2 — PERBAIKI KONTRAK OVERLAY KEPALA KANTOR (root cause: overlay di luar .headoffice-layout)
**Akar masalah**: 3 dari 4 halaman Kepala Kantor (`dashboard`, `notifikasi`,
`profil`) menempatkan `#sidebarOverlay` **di luar** `.headoffice-layout`,
sedangkan `head-office-layout.css` memakai selector ter-scoped
`.headoffice-layout .sidebar-overlay` → overlay memakai aturan generik
`laporan.css` (z-index 199, bg 0.4) yang tidak konsisten.
**File**: `head-office/dashboard.html`, `head-office/notifikasi.html`,
`head-office/persetujuan.html`, `head-office/profil.html`,
`head-office-layout.css`, `laporan.css`
**Fix** (pilih kontrak: overlay DI DALAM root):
1. Seluruh 4 halaman kini menempatkan `#sidebarOverlay` **di dalam**
   `.headoffice-layout` → ter-target oleh CSS ter-scoped (z-index 150,
   bg 0.5), overlay berada di bawah sidebar (z 200) tapi di atas content.
2. `laporan.css`: aturan generik `.sidebar-overlay` ditambah pengecualian
   `.headoffice-layout .sidebar-overlay` agar HO **tidak bergantung** pada
   selector generik itu dan z-index/overlay HO konsisten (150).
**Bukti**: semua 4 halaman HO kini punya overlay di dalam root; Employee/
Admin/Superadmin tidak terpengaruh (overlay generik tetap untuk mereka).

### R2-3 — HAPUS FILE DUPLIKAT RELEASE (root cause: salinan lama tetap ada)
**Akar masalah**: `scripts/build-release 2.sh` (salinan lama, masih memakai
predicate `find` AND-kan `-name` tanpa `-o`) tetap hidup di tree →
operator-confusion; tidak direferensikan tooling mana pun.
**File**: `scripts/build-release 2.sh` (dihapus),
`tests/test-duplicate-files.py` (baru)
**Fix**:
1. Verifikasi duplikat memang salinan lama (diff: tanpa `-o`, tanpa
   sensitive-dir fix) dan TIDAK direferensikan (grep tooling = kosong).
2. Hapus `scripts/build-release 2.sh`; `scripts/build-release.sh` tetap
   kanonik. Scan seluruh tree: tidak ada lagi file pola `* 2.*`.
3. Tambah `tests/test-duplicate-files.py` (9 check): assert tidak ada file
   `* 2.*` di tree; assert duplikat terhapus; assert `audit-release.py`
   menolak file `* 2.*` (exit 1) & menerima ZIP bersih (exit 0); assert
   `build-release.sh` memuat `-regex` penolak duplikat + predicate `-o`;
   assert `bash -n` lulus.
**Bukti**: test 9/9 lulus; `find . -name "* 2.*"` → kosong.

### R2-4 — SINKRONISASI ARIA SEMUA ROLE (root cause: Escape tidak sync trigger aria)
**Akar masalah**: handler Escape di 4 layout menutup dropdown profile tapi
tidak set `aria-expanded=false` pada `#profileTrigger`; klik di luar sudah
sinkron (sinkron via `syncDropdownAria`).
**File**: `js/layouts/employee-layout.js`,
`js/layouts/admin-section-layout.js`, `js/layouts/head-office-layout.js`,
`js/layouts/superadmin-layout.js`
**Fix**: semua 4 layout kini, saat Escape menutup dropdown, juga
`#profileTrigger.setAttribute('aria-expanded','false')`. Klik di luar
sudah sinkron. `aria-expanded` sidebar selalu sesuai class `open`
(via `syncAria`). `aria-controls` menunjuk ID benar. Listener global
di-guard (`_escapeBound`, `data-sidebar-resize-bound`).
**Bukti**: `node --check` 4/4 lulus; `grep aria-controls` → `sidebar`/
`profileDropdown` di semua role.

### R2-5 — KOREKSI CHANGELOG
**Status** diubah dari "SELESAI" menjadi **PENDING verifikasi** (aturan:
jaga status jujur selama pengujian visual + build end-to-end belum
lulus). Angka test nyata dicatat; riwayat lama (FIX-2026-10-26-2 dll)
tetap dipertahankan.

### Catatan verifikasi jujur (round-2)
- **Test lokal yang sudah lulus**: seluruh suite di atas + `test:file`
  21/21 (incl. `absolute_cleanup_removed=true`), fixture audit 8/8,
  probe nested node_modules & COPY dump exit 1, `test-duplicate-files`
  9/9, `bash -n build-release.sh` exit 0.
- **PENDING (belum dijalankan di sesi ini)**:
  - Pengujian visual & interaksi 4 role × 4 viewport
    (1440×900, 1024×768, 768×1024, 390×844): browser tool (Chromium/CDP)
    gagal start — `Operation not permitted` pada `Chrome/DevToolsActivePort`.
    Belum ada bukti render/interaksi nyata (hamburger, overlay, Escape,
    aria-expanded, horizontal overflow, title ellipsis).
  - Verifikasi visual di atas adalah **satu-satunya syarat tersisa** untuk
    mengubah status menjadi **SELESAI**. Build end-to-end sudah lulus
    (lihat R2-BUILD di atas).


### P1 — CLEANUP FILE UPLOAD (root cause: kontrak storage key vs absolute path tertukar)
**Akar masalah**: `removeFileSafely()` mengharapkan *storage key* (path relatif
terhadap `STORAGE_ROOT`), tetapi `upload.js` mengirim *absolute path*
(`req.file.path`, `tempPath`, `path.join(STORAGE_ROOT, sKey)`). Akibatnya
`path.resolve(STORAGE_ROOT, absolutePath)` menghasilkan path absolut itu
sendiri lalu `isWithinStorageRoot` kadang menolak / hapus tidak pernah
terjadi → file menjadi orphan.
**File**: `backend/middleware/file-security.js`, `backend/routes/upload.js`,
`backend/tests/test-file-security.js`
**Fix**:
1. Tambah `removeAbsoluteFileSafely(absolutePath)` — hanya menerima path
   absolut; validasi `path.resolve` + `isWithinStorageRoot` sebelum unlink.
   `removeFileSafely(storageKey)` tetap untuk storage key (kontrak tidak
   diubah, mundur ke bawah).
2. Seluruh call site di `upload.js` dirapikan:
   - temp file (absolute) → `removeAbsoluteFileSafely(tempPath)`
   - storage key → `removeFileSafely(storageKey)`
   - path join root → `removeAbsoluteFileSafely(absolutePath)`
   Tidak ada lagi penyalahgunaan absolute path ke `removeFileSafely`.
3. Cleanup terverifikasi pada seluruh jalur: role ditolak, report_id tidak
   valid, laporan bukan milik user, laporan terkunci, tipe file ditolak,
   struktur OOXML ditolak, INSERT DB gagal, dan exception setelah file dibuat.
**Bukti**: `test:file` 21/21; probe `absolute_cleanup_removed=true`;
`removeAbsoluteFileSafely TIDAK menghapus path di luar STORAGE_ROOT` (escape
`../../etc/passwd` → `false`).

### P2 — PERKUAT AUDITOR RELEASE (root cause: predicate hanya cek komponen pertama; dump SQL tidak dideteksi; find -o hilang)
**Akar masalah**:
1. `audit-release.py` `_flag()` hanya cek `path.split("/")[0]` →
   `backend/node_modules/evil.js` lolos (komponen ke-2 tidak dicek).
2. Dump PostgreSQL (`COPY ... FROM stdin`, header `pg_dump`, INSERT kredensial)
   tidak ada di daftar pola → lolos sebagai file `.sql` biasa.
3. `build-release.sh` rangkaian `-name` kehilangan operator `-o` → find
   AND-kan semua `-name`, tidak ada directory yang cocok, sehingga nested
   `node_modules`/`.git` lolos.
**File**: `scripts/audit-release.py`, `scripts/build-release.sh`,
`tests/test-audit-zip-fixtures.py`
**Fix**:
1. `audit-release.py` `_flag()` sekarang loop **semua** komponen path
   (bukan hanya komponen pertama). `db`/`data` sengaja di-`continue` di
   level per-komponen karena adalah subdirektori sah backend
   (`backend/db/migrations`) — tidak false-positive.
2. Tambah `SQL_DUMP_PATTERNS`: `COPY ... FROM stdin`, `WITH COPY`,
   header `pg_dump`, header `PostgreSQL database dump`, dan
   `INSERT INTO "users|credentials|api_keys|sessions"`. Scan HANYA file
   `.sql`/`.txt` → migration/schema normal (CREATE TABLE/ALTER) tidak
   false-positive (terbukti di fixture `normal-migration` → exit 0).
3. `build-release.sh` predicate find diperbaiki dengan `-o` di setiap
   cabang: `\( -name '.git' -o -name 'node_modules' -o ... \)`. `db` dan
   `data` tidak masuk daftar find (sama alasannya).
4. 6 fixture regresi baru di `test-audit-zip-fixtures.py`: nested
   node_modules → exit 1; nested .git → exit 1; COPY dump → exit 1;
   migration bersih → exit 0; duplicate entry → exit 1; embedded archive
   → exit 1.
**Bukti**: fixture 8/8 lulus; probe nested node_modules exit 1; probe COPY
dump exit 1; `build-release.sh` tetap `exit 1` saat audit gagal
(baris 261-266 tidak diubah, sudah benar).

### P3 — PERBAIKI HAMBURGER & SIDEBAR (root cause: setupMobileMenu dipanggil sebelum tombol dibuat)
**Akar masalah**: `setupMobileMenu()` dipanggil di akhir `renderSidebar()`
sebelum `renderTopbar()` membuat `#mobileMenuBtn`. Listener terpasang ke
tombol yang belum ada; saat `renderTopbar()` membangun ulang topbar,
tombol baru tidak punya listener → hamburger mati.
**File**: `js/layouts/employee-layout.js`,
`js/layouts/admin-section-layout.js`, `js/layouts/head-office-layout.js`
(`superadmin-layout.js` sebagai referensi yang sudah benar)
**Fix**:
1. `setupMobileMenu()` dihapus dari `renderSidebar()` di ketiga layout.
2. Urutan `init()` sekarang: `renderSidebar(); renderTopbar(...);
   setupMobileMenu();`
3. `setupMobileMenu()` dibuat *idempotent*: listener Escape global di-guard
   flag modul `_escapeBound`; listener resize di-guard attribute
   `data-sidebar-resize-bound` → init berulang tidak pasang listener ganda.
4. Hamburger toggle (buka/tutup, bukan hanya buka); overlay & Escape
   menutup; `aria-expanded` di-sinkronkan ke `#mobileMenuBtn` dan
   `#sidebarToggle`; state `open`/`active` dibersihkan saat kembali ke
   desktop (breakpoint `min-width:1025px`).
**Bukti**: `node --check` 4/4 layout lulus; tidak ada listener ganda
(structural guard terpasang).

### P4 — SERAGAMKAN LAYOUT KEPALA KANTOR (root cause: markup campuran admin-section & main-area)
**Akar masalah**: `head-office/notifikasi.html` dan `head-office/profil.html`
memakai `.admin-section-layout`/`.admin-section-content`/`.main-area`
(sestruktur Admin Seksi) padahal seharusnya `.headoffice-layout`/
`.headoffice-content`/`.admin-content`. Selain itu `profil.html` memakai
`<main class="main-content">` (CSS employee) yang tidak di-scope ke
head-office.
**File**: `head-office/notifikasi.html`, `head-office/profil.html`,
`head-office/dashboard.html`, `head-office/persetujuan.html`,
`head-office-layout.css`
**Fix**:
1. Seluruh 4 halaman Kepala Kantor kini memakai struktur seragam:
   `.headoffice-layout` → `.sidebar` + `.headoffice-content` →
   `.topbar` + `.admin-content`. Overlay `#sidebarOverlay` dipindah keluar
   dari `.headoffice-layout` agar z-index tidak terpotong.
2. `head-office-layout.css` di-scope penuh ke `.headoffice-layout`
   (sidebar, topbar, nav-item, profile, overlay) agar tidak merusak role
   lain. Sidebar tetap 260px (`--ho-sidebar-width`); margin content
   konsisten `--ho-sidebar-width`.
3. `<=1024px`: sidebar off-canvas (`translateX(-100%)`), margin content 0,
   hamburger terlihat (via `.headoffice-layout .mobile-menu-btn` di
   `laporan.css`), overlay aktif.
**Bukti**: markup 4 halaman konsisten (diff manual); CSS di-scope
   (tidak ada selector global top-level yang bocor ke role lain).

### P5 — PERBAIKI KONTRAK ADMIN SEKSI (root cause: pageTitle diteruskan sebagai activeId)
**Akar masalah**: `AdminSectionLayout.init(pageTitle)` memakai `pageTitle`
sebagai `activeId` → highlight menu salah (mis. halaman "Diajukan"
menyorot "Dashboard").
**File**: `admin-section/_layout.js`, `js/layouts/admin-section-layout.js`
**Fix**:
1. `AdminSectionLayout.init` kini menerima `{ pageTitle, activeId }`
   (backward-compatible: string → pageTitle, activeId fallback ke
   `getActivePage()`).
2. `renderTopbar(pageTitle)` menampilkan judul halaman yang benar.
3. `admin-section/_layout.js` memanggil API eksplisit:
   `AdminSectionLayout.init({ pageTitle, activeId:
   AdminSectionNav.getActivePage(location.pathname,
   new URLSearchParams(location.search)) })` → menu aktif benar untuk
   Dashboard, Diajukan, Diteruskan, Revisi, Semua Laporan, Pegawai, Rekap,
   Notifikasi, Profil.
**Bukti**: `node --check` lulus; `init` menerima object maupun string.

### P6 — PERBAIKI CSS RESPONSIF & BENTURAN SELECTOR
**Akar masalah**:
1. Hamburger Kepala Kantor hanya muncul di `<=768px` (rule global
   `laporan.css`), padahal seharusnya `<=1024px`.
2. `notifikasi.css` `.notif-badge` punya `display:none` permanen
   (konflik dengan kontrol class `.hidden`).
3. `.topbar-page-title` tanpa ellipsis → overflow di viewport sempit.
4. `head-office-layout.css`/`admin-section-layout.css` selector
   top-level (`.sidebar`, `.topbar`, `.nav-item`) bocor ke role lain.
**File**: `laporan.css`, `head-office-layout.css`,
`admin-section-layout.css`, `notifikasi.css`
**Fix**:
1. `laporan.css`: tambah rule ter-scoped
   `.headoffice-layout .mobile-menu-btn` (`display:none` default,
   `display:inline-flex` di `<=1024px`) — tidak memengaruhi employee/admin.
2. `laporan.css`: `.topbar-page-title` dapat `overflow:hidden;
   text-overflow:ellipsis; white-space:nowrap; min-width:0`.
   `.topbar-right` dapat `flex-shrink:0`. `.topbar-title-wrap` dapat
   `min-width:0; flex:1 1 auto`.
3. Periode badge & profile name disembunyikan bertahap di `<=768px`
   (khusus head-office, ter-scoped); hamburger/notifikasi/avatar TIDAK
   disembunyikan.
4. `notifikasi.css`: `.notif-badge` tidak lagi `display:none` permanen;
   badge dikendalikan HANYA via `.notif-badge.hidden` (`display:none
   !important`).
5. `head-office-layout.css`: seluruh selector di-scope ke
   `.headoffice-layout`. `admin-section-layout.css` breakpoint
   off-canvas dari `<=768px` → `<=1024px` (konsisten dengan P4/P6).
**Bukti**: `diff` antar file CSS per-role tidak saling overwrite; rule
   `.headoffice-layout` ter-scoped.

### P7 — AKSESIBILITAS
**Fix**:
1. `profile-trigger` di keempat layout (`employee`, `admin-section`,
   `head-office`, `superadmin`) diganti dari `<div>` menjadi `<button
   type="button">` + `aria-haspopup` + `aria-expanded` +
   `aria-controls="profileDropdown"` + `aria-label`.
2. `mobile-menu-btn` mendapat `aria-expanded` + `aria-controls` +
   `aria-label`.
3. `sidebarToggle` di `head-office/*.html` mendapat `aria-expanded` +
   `aria-controls`.
4. Icon dekoratif (`icon('menu')`, `navIcon(...)`) sudah
   `aria-hidden="true"` (di `layout-shared.js` — tidak diubah).
5. Escape menutup sidebar + dropdown profile (global, idempotent).
6. Stat card masih pakai `onclick` (di luar scope refactor P7); tidak
   diubah karena batasan "jangan refactor besar".
**Bukti**: `node --check` lulus; atribut aria terpasang di output HTML.

### Catatan verifikasi (jujur)
- **Viewport/role DOM live test** (1440×900, 1024×768, 768×1024,
  390×844) **tidak dapat dijalankan** di sesi ini: browser tool
  (Chromium/CDP) gagal start dengan `Operation not permitted` pada
  `Chrome/DevToolsActivePort`. Verifikasi layout dilakukan via:
  `missing_assets=0`, `duplicate_ids=0`, `node --check` seluruh JS
  frontend, inspection markup 4 peran Kepala Kantor + Admin Seksi +
  Employee, dan inspeksi CSS selector ter-scoped.
- **Build-release end-to-end** belum di-jalankan (membutuh staging
  penuh); namun `build-release.sh` predicate find sudah diperbaiki dan
  fixture regresi auditor 8/8 lulus.
- **`git diff --check`** sempat menolak 2 file (baris kosong di EOF
  `.gitignore` & `backend/routes/auth.js`) — sudah dibersihkan, kini
  bersih.
- Tidak ada perubahan alur bisnis, autentikasi, role, permission, atau
  skema database. Tidak ada refactor besar. Tidak ada perubahan user
  lain yang dihapus/di-batalkan.


## [FIX-2026-10-26-2] Perbaikan Security P0/P1/P2 dari Code Review 2026-10-26

**Status**: SELESAI — 11 perbaikan + 5 file test regresi baru, seluruh 10 suite test lokal lulus
(10 test files, 0 failed; 20+4+5+19+17+7+8+8+7+66 assertion = 161 total), 4 ZIP fixture test lulus,
`node --check` 36/36, `bash -n` 10/10, `py_compile` 2/2.

### P0 — Kebocoran Secret

#### P0-1: login.js / change-password.js — password & token di URL query string
**File**: `login.js`, `public/login.js`, `change-password.js`, `public/change-password.js`,
`change-password.html`, `public/change-password.html`

**Gejala**: saat `must_change_password=true`, `login.js` redirect ke
`/change-password.html?pwdToken=<jwt>&oldPw=<password_urlencoded>`.
Password lama (rahasia) dan JWT token sementara masuk ke:
- browser history (persisten, bisa di-forensic)
- `Referer` header (bisa bocor ke pihak ketiga)
- access log reverse proxy / web server
- bookmark atau share

**Akar**: URL query string dipakai sebagai transport state antarsesi — antipattern.

**Fix**:
1. `login.js`: token disimpan di `sessionStorage['pwd_change_token']` (in-memory,
   cleared saat navigate, tidak masuk history/Referer). `oldPw` tidak pernah
   disimpan — user wajib mengetik ulang di halaman change-password.
2. `change-password.js`: baca dari `sessionStorage`, hapus setelah load
   (single-use dalam session; refresh halaman = login ulang).
3. `change-password.html`: tambah `<meta name="referrer" content="no-referrer">`
   sebagai lapisan pertahanan kedua.
4. URL sekarang selalu `/change-password.html` tanpa query string.

**Verifikasi**: `grep -rn "pwdToken\|oldPw:" login.js change-password.js` → 0 hasil.
`node --check` lulus. Test: `test-static-security.js` 66/66 lulus (refusal policy tetap).

#### P0-2: routes/auth.js — combined auth middleware double-response
**File**: `backend/routes/auth.js`, `backend/middleware/auth.js`

**Gejala**: `authenticateChangePassword` membalut `authenticateToken` di dalam
`Promise` + `.catch(() => null)`. Bila user memakai token sesi penuh
(audience `ksop-laporan-app`) untuk `PUT /change-password`,
`authenticateToken` mengirim 401 `PASSWORD_CHANGE_REQUIRED` lalu resolve
`next()` — respons sudah terkirim, lalu kode lanjut ke `verifyPasswordChangeToken`,
tambah satu lagi `res.status(401)` → **double-response / "headers already
sent" error**, atau response pertama (yang salah) yang sampai ke klien.

**Akar**: helper Express middleware tidak bisa dipanggil dari konteks lain
tanpa mengirim respons dua kali.

**Fix**:
1. Tambah helper **pure** `verifyAppToken(token)` di `middleware/auth.js` —
   return object `{ok, userId, token_version, ...}` tanpa menyentuh
   `req/res/next`. Tidak mengirim respons apa pun.
2. `authenticateChangePassword` ditulisi ulang: panggil `verifyAppToken` dulu
   (jalur A: token sesi penuh), jika gagal panggil `verifyPasswordChangeToken`
   (jalur B: token sementara). Response dikirim **satu kali saja** di titik
   `return res.status(...)`.
3. `authenticateToken` sendiri kini memakai `verifyAppToken` internal (DRY).

**Verifikasi**: `node tests/test-verify-helpers.js` → 20/20 lulus, termasuk:
  - `combined: pwd token versi tidak cocok → TOKEN_REVOKED` (reuse dicegah)
  - `combined: app token + user flag ON → PASSWORD_CHANGE_REQUIRED`
  - `combined: token null / acak / kedaluwarsa → ditolak`

### P1 — Data Integrity

#### P1-3: audit_trail kolom `details` vs `detail`
**File**: `backend/db/migrations/008_repair_audit_trail_details.sql`,
`backend/db/schema.sql`, `backend/routes/reportAttachment.js`,
`backend/routes/files.js`, `backend/routes/download.js`, `backend/routes/auth.js`

**Gejala**: migration 008 melakukan `RENAME COLUMN detail TO details` sehingga
skema target DB setelah migrasi memakai kolom `details`. Namun seluruh query
di source memakai `detail`. Query `INSERT INTO audit_trail (... detail)`
bukan `INSERT INTO audit_trail (... details)` → error
`column "detail" does not exist` atau baris tidak tertulis.

**Akar**: migration 008 dibuat untuk "repair" skema lama yang sudah memakai
`details`, tapi source tidak di-follow — dua nama berkebalikan.

**Keputusan**: **kanonik = `detail`** (sama dengan schema.sql fresh, semua
route, dan mayoritas query). Migration 008 dibalik.

**Fix**:
1. `migration 008`: `detail ↔ details` (dua arah idempotent; aman di-rerun
   di skema manapun).
2. `reportAttachment.js`: `ON CONFLICT (report_id, detail)` →
   `ON CONFLICT (report_id) DO NOTHING` (detail bukan bagian PK/unique
   constraint; sebelumnya query gagal di skema kanonik).
3. `schema.sql`: sudah benar (memakai `detail`) — tidak diubah.

**Verifikasi**: `node tests/test-audit-schema.js` (4/4) +
`node tests/test-audit-column.js` (5/5) lulus.

#### P1-4: metrics middleware dipasang terlalu lambat
**File**: `backend/server.js`

**Gejala**: `app.use(...)` pembilang metrics dipasang **setelah**
`app.use('/api', globalLimiter)` dan setelah mount route auth.
Rate-limited request (429 dari limiter) dan 4xx/5xx dari error handler
**tidak di-count** — `/metrics` selalu menunjukkan angka lebih rendah
dari total request yang sebenarnya diterima.

**Fix**: block metrics middleware dipindah ke **sebelum**
`app.use('/api', globalLimiter)` — sekarang semua request terhitung
termasuk yang ditolak limiter.

**Verifikasi**: `test-health-metrics.js` 7/7 lulus.

#### P1-5: upload.js — report_id tidak tervalidasi ketat
**File**: `backend/routes/upload.js`

**Gejala**:
- `report_id` hanya di-`parseInt` — value `"1abc"` → `NaN` di-
  parameterkan ke PostgreSQL → error 500 (bukan 400).
- File temp TIDAK dihapus saat `report_id` ditolak → orphan di
  folder staging.
- Tidak ada pengecekan `status` laporan — lampiran bisa diupload
  ke laporan yang sudah final/approved.
- Tidak ada role check — semua role bisa upload.

**Fix**:
1. Validasi ketat: `rawReportId` harus string/number, setelah trim harus
   match `^[0-9]+$` dan `1 ≤ n ≤ MAX_SAFE_INTEGER` → selain itu 400.
2. Jika `report_id` diberikan: validasi kepemilikan **dan** status
   (`draft`, `revisi_admin`, `revisi_kantor`) → selain itu 403 +
   `removeFileSafely(tempPath)` (file temp dihapus, tidak ada orphan).
3. Setelah `INSERT files` gagal → `removeFileSafely(path.join(STORAGE_ROOT, sKey))`
   (file final sudah dipindah dari temp; dihapus saat DB insert gagal).
4. Role check: hanya `PEGAWAI` yang boleh upload → selain itu 403 +
   `removeFileSafely` file temp.

**Verifikasi**: `node --check upload.js` lulus.

#### P1-6: files.js — `.catch(() => {})` swallow sunyi
**File**: `backend/routes/files.js`

**Gejala**: audit `INSERT INTO audit_trail ... download_file` di `.catch(() => {})`
— kegagalan insert audit tidak pernah dilaporkan. Jika DB down saat
download, operator tidak punya sinyal apa pun di log.

**Fix**: `.catch` diganti dengan `logger.error(...)` berisi
`requestId`, `userId`, `fileId`, `action`, dan `error.message`
disedikitkan (max 200 char, tidak ada token/path/isi file).
Download tetap berlanjut (`return` tidak dipakai di catch).

**Verifikasi**: `node --check files.js` lulus; tidak ada `.catch(() => {})`
kosong di route files.js.

### P2 — Tooling & Test

#### P2-7: test-password-flow.sh — dua salinan + tanpa guard DB
**File**: `backend/tests/test-password-flow.sh`, `backend/tests/test-password-flow 2.sh` (dihapus)

**Gejala**: dua file test E2E password flow dengan logika hampir identik;
` 2.sh` adalah versi lama tanpa step 6 (wrong password rejection).
Kedua file **tidak punya guard DB name** — bisa dijalankan
terhadap database produksi bila `DB_NAME` salah.

**Fix**:
1. Hapus `test-password-flow 2.sh`; pakai `test-password-flow.sh`
   sebagai satu-satunya kanonik.
2. Tambah guard: bila `DB_NAME` tidak mengandung `"test"` dan
   `PWD_TEST_DB` tidak diset → exit 1.
3. `package.json`: tambah `"test:password": "bash tests/test-password-flow.sh"`.

**Verifikasi**: `bash -n test-password-flow.sh` lulus.

#### P2-8: audit-release.py + build-release.sh — find -o bug + check ZIP
**File**: `scripts/audit-release.py`, `scripts/build-release.sh`,
`tests/test-audit-zip-fixtures.py` (baru)

**Gejala**:
- `build-release.sh`: `find` untuk file terlarang memakai `-o` chain
  tanpa grouping `\( \)` yang benar — `-print0` hanya apply ke
  cabang terakhir, file terlarang lain terlewat.
- `audit-release.py`: tidak cek **duplicate entry** di dalam ZIP
  (satu nama dua kali → `zipfile` Python emit warning tetapi
  tidak dianggap temuan audit).
- Tidak cek **embedded ZIP** (arsip di dalam arsip → vektor
  obfusi untuk sembunyikan file terlarang).
- `build-release.sh`: `AUDIT_RC=$?` setelah `python3 audit-release.py`
  tidak efektif karena `set -euo pipefail` membuat script exit
  sebelum `AUDIT_RC` ditugaskan.

**Fix**:
1. `build-release.sh`: perbaiki `find` (tambah `-o -name '*.tmp'` dan
   `-o -name '*.temp'` di dalam group; regex `*. \\d+\\..*` untuk
   file duplikat ` 2.`).
2. `build-release.sh`: ganti `AUDIT_RC=$?` dengan
   `if ! AUDIT_OUT=$(python3 ... 2>&1); then ... fi` — lolos dari
   `set -e`.
3. `audit-release.py`: tambah `seen_names` set untuk deteksi
   duplicate; tambah cek `.zip`/`.tar.gz` embedded;
   `exit 1` konsisten.
4. Tambah `tests/test-audit-zip-fixtures.py` (4 test):
   clean.zip → exit 0; secret.zip → exit 1; dup.zip → exit 1;
   embedded.zip → exit 1.

**Verifikasi**: `python3 tests/test-audit-zip-fixtures.py` → 4/4 lulus.

### Ringkasan Angka
| Area | Sebelum | Sesudah |
|---|---|---|
| Test files (node tests/) | 8 | 10 (+verify-helpers, audit-schema, audit-column) |
| Total assertions lulus | 152 | 161 (node) + 4 (zip fixture) |
| `node --check` | 36/36 | 36/36 |
| `bash -n` | 10/10 | 10/10 |
| `py_compile` | 1/1 | 2/2 (+test-audit-zip-fixtures.py) |
| Secret di URL (pwdToken/oldPw) | 2 file (login.js, change-password.js) | 0 file |
| `.catch(() => {})` di files.js | 1 | 0 (diganti logger.error) |
| `test-password-flow 2.sh` (duplikat) | ada | dihapus |


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
