# Backend — Sistem Digitalisasi Laporan Kinerja Bulanan KSOP Cirebon

Backend aplikasi Sistem Digitalisasi Laporan Kinerja Bulanan KSOP Cirebon menggunakan Node.js, Express, PostgreSQL, JWT, dan bcrypt.

## Instalasi Aman

Ikuti urutan di bawah. **Jangan** memakai dump database aktual untuk setup.

```bash
# 1. Ekstrak source / package
cd backend

# 2. Salin .env.example ke .env (lokal, jangan commit)
cp .env.example .env

# 3. Isi secret melalui environment atau secret manager:
#    - JWT_SECRET: generate nilai acak kuat (min 32 char)
#    - DB_PASSWORD: password role DB khusus aplikasi
#    Jangan hardcode nilai di file .env yang di-commit.
#    Lihat: .env.example untuk daftar variabel.

# 4. Instal dependensi dari lockfile
npm install --omit=dev

# 5. Jalankan schema + migration pada database kosong
psql -U <db_user> -d <db_name> < db/schema.sql
for f in db/migrations/*.sql; do psql -U <db_user> -d <db_name> < "$f"; done

# 6. Buat akun administrator melalui script setup
#    Mode production: set env vars SEED_*_PASSWORD sebelum menjalankan
#    node scripts/setup-admin.js <username> <password_kuat> "Nama Lengkap"
#    node scripts/setup-seed.js --prod   # hanya jika semua SEED_*_PASSWORD sudah diset

# 7. Jalankan aplikasi
NODE_ENV=production node server.js

# 8. Verifikasi health check
curl http://localhost:3000/health
```

## Keamanan — Ringkasan Kebijakan

- `JWT_SECRET` wajib diset; aplikasi gagal start jika tidak ada atau < 32 char.
- Tidak ada fallback secret. Rotasi `JWT_SECRET` membuat seluruh token lama tidak valid.
- `DB_PASSWORD` hanya dari environment; placeholder ditolak di mode production.
- Logout saat ini hanya hapus token di browser (tanpa revocation server-side).
- Role DB production: pakai role khusus aplikasi dengan hak minimum, bukan superuser.

Lihat `docs/db-credentials.md` untuk detail rotasi kredensial.

## Canonical Roles

Aplikasi menggunakan empat role internal canonical:

- `PEGAWAI` — Pegawai yang membuat dan mengirim laporan kinerja bulanan.
- `ADMIN_SEKSI` — Admin Seksi yang melakukan verifikasi laporan pegawai pada seksinya.
- `KEPALA_KANTOR` — Kepala Kantor yang melakukan monitoring dan persetujuan akhir laporan.
- `SUPERADMIN` — Administrator sistem yang mengelola pengguna dan konfigurasi sistem.

Nilai role internal yang valid hanya:

```text
PEGAWAI
ADMIN_SEKSI
KEPALA_KANTOR
SUPERADMIN
```

Role legacy berikut tidak boleh digunakan untuk data baru:

```text
pegawai
admin_seksi
kepala_kantor
admin
superadmin
SUPER_ADMIN
```

Mapping legacy hanya digunakan untuk compatibility atau migrasi data lama:

```text
pegawai       -> PEGAWAI
admin_seksi   -> ADMIN_SEKSI
kepala_kantor -> KEPALA_KANTOR
admin         -> SUPERADMIN
superadmin    -> SUPERADMIN
```

Seluruh role baru yang disimpan ke database, digunakan dalam JWT, middleware backend, dan state autentikasi frontend harus menggunakan canonical role uppercase.

---

## Authentication

### Login

Contoh response login:

```json
{
  "success": true,
  "message": "Login berhasil",
  "token": "jwt-token-here",
  "user": {
    "id": 1,
    "username": "admin",
    "nama": "Administrator",
    "role": "SUPERADMIN"
  }
}
```

Field `role` harus berisi salah satu nilai berikut:

```text
PEGAWAI
ADMIN_SEKSI
KEPALA_KANTOR
SUPERADMIN
```

Catatan:

Username `admin` tidak berarti role internal pengguna adalah `admin`.

Contoh yang benar:

```text
username = admin
role     = SUPERADMIN
```

---

## User Management

Contoh payload pembuatan user:

```json
{
  "username": "user1",
  "password": "password123",
  "nama": "Nama User",
  "role": "PEGAWAI"
}
```

Nilai role yang diperbolehkan:

```text
PEGAWAI
ADMIN_SEKSI
KEPALA_KANTOR
SUPERADMIN
```

Backend harus menolak role non-canonical seperti:

```text
user
admin
admin_seksi
kepala_kantor
super_admin
administrator
HEAD_OFFICE
```

Validasi role harus diterapkan baik saat membuat user maupun saat memperbarui user.

---

## Role Hierarchy dan Workflow

Alur utama laporan:

```text
PEGAWAI
    |
    | submit laporan
    v
ADMIN_SEKSI
    |
    | verifikasi / minta revisi
    v
KEPALA_KANTOR
    |
    | persetujuan akhir
    v
FINAL
```

`SUPERADMIN` berfungsi pada level administrasi sistem dan manajemen pengguna, bukan sebagai pengganti proses verifikasi atau persetujuan laporan.

---

## Role dan Seksi

Secara umum:

```text
PEGAWAI
-> dapat memiliki id_seksi

ADMIN_SEKSI
-> harus terkait dengan id_seksi

KEPALA_KANTOR
-> tidak bergantung pada satu id_seksi

SUPERADMIN
-> tidak bergantung pada satu id_seksi
```

Aturan final tetap mengikuti validasi yang diterapkan pada backend dan database.

---

## Database — users

Field role pada tabel `users` harus menggunakan canonical role.

Contoh dokumentasi:

| Column | Type | Description |
|---|---|---|
| `id` | SERIAL | Primary key |
| `username` | VARCHAR | Username unik |
| `password` | VARCHAR | Password yang sudah di-hash |
| `nama` | VARCHAR | Nama lengkap pengguna |
| `id_seksi` | INTEGER / FK | Referensi seksi jika diperlukan |
| `role` | VARCHAR(50) | `PEGAWAI`, `ADMIN_SEKSI`, `KEPALA_KANTOR`, atau `SUPERADMIN` |
| `is_active` | BOOLEAN | Status akun |
| `created_at` | TIMESTAMP | Waktu data dibuat |
| `updated_at` | TIMESTAMP | Waktu data diperbarui |

Default canonical role untuk user baru:

```text
PEGAWAI
```

Database sebaiknya membatasi nilai `users.role` hanya pada:

```text
PEGAWAI
ADMIN_SEKSI
KEPALA_KANTOR
SUPERADMIN
```

---

## Role Migration

Untuk database lama yang masih menggunakan lowercase role, mapping migrasi adalah:

```text
pegawai       -> PEGAWAI
admin_seksi   -> ADMIN_SEKSI
kepala_kantor -> KEPALA_KANTOR
admin         -> SUPERADMIN
superadmin    -> SUPERADMIN
```

Sebelum menjalankan migrasi, verifikasi terlebih dahulu nilai role aktual:

```sql
SELECT role, COUNT(*) AS total
FROM users
GROUP BY role
ORDER BY role;
```

Jangan melakukan mapping otomatis terhadap role yang tidak dikenal.

---

## Setup Superadmin

Untuk membuat atau memperbarui akun Superadmin:

```bash
npm run setup-admin
```

Jika script mendukung custom username, password, dan nama:

```bash
npm run setup-admin username password "Nama Lengkap"
```

Akun yang dibuat oleh utility ini harus menggunakan:

```text
SUPERADMIN
```

bukan:

```text
admin
```

---

## Setup Seed Data

Jika project menyediakan script seed:

```bash
npm run setup-seed
```

Gunakan hanya pada environment development/testing atau sesuai prosedur project.

Seed data harus menggunakan role canonical:

```text
PEGAWAI
ADMIN_SEKSI
KEPALA_KANTOR
SUPERADMIN
```

Jangan menjalankan seed pada database production tanpa memahami efek script terhadap data yang sudah ada.

---

## Backend Authorization

Backend adalah sumber otoritatif untuk authorization.

Frontend role guard hanya digunakan untuk navigasi dan pengalaman pengguna.

Contoh konsep:

```js
requireRole('ADMIN_SEKSI')
requireRole('KEPALA_KANTOR')
requireRole('SUPERADMIN')
```

Backend tidak boleh bergantung pada role lowercase seperti:

```text
pegawai
admin_seksi
kepala_kantor
admin
superadmin
```

untuk authorization aktif maupun query data aktif.

---

## Frontend Role Mapping

Frontend menggunakan canonical role:

```text
PEGAWAI
ADMIN_SEKSI
KEPALA_KANTOR
SUPERADMIN
```

Mapping lowercase boleh tetap ada sementara untuk backward compatibility terhadap auth state lama, tetapi bukan sebagai source of truth.

Redirect canonical:

```text
PEGAWAI
-> employee/dashboard.html

ADMIN_SEKSI
-> admin-section/dashboard.html

KEPALA_KANTOR
-> head-office/dashboard.html

SUPERADMIN
-> superadmin/dashboard.html
```

---

## Important Development Rule

Role source of truth aplikasi adalah:

```text
PEGAWAI
ADMIN_SEKSI
KEPALA_KANTOR
SUPERADMIN
```

Jangan memperkenalkan kembali identifier seperti:

```text
admin
pegawai
admin_seksi
kepala_kantor
superadmin
```

ke database baru, JWT baru, middleware aktif, API authorization, atau query backend aktif.

Jika menemukan role legacy, tentukan terlebih dahulu apakah penggunaannya termasuk:

- migration compatibility
- frontend backward compatibility
- documentation lama
- legacy file
- active bug

Sebelum melakukan perubahan.
