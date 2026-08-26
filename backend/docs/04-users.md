# Users API

Base URL: `/api/users`

**Autentikasi:** Diperlukan (`Bearer <token>`)
**Role:** Hanya `admin` yang dapat mengakses.

---

## GET /api/users

Daftar semua pengguna beserta seksi masing-masing.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "username": "admin",
      "nama": "Administrator",
      "nip": null,
      "role": "admin",
      "is_active": true,
      "created_at": "2026-01-01T00:00:00.000Z",
      "nama_seksi": null
    },
    {
      "id": 2,
      "username": "seksi1",
      "nama": "Ahmad Rizki",
      "nip": "199001012020011002",
      "role": "admin_seksi",
      "is_active": true,
      "created_at": "2026-01-01T00:00:00.000Z",
      "nama_seksi": "Seksi Operasional"
    }
  ]
}
```

---

## POST /api/users

Membuat pengguna baru.

**Request Body:**
```json
{
  "username": "pegawai_baru",
  "password": "rahasia123",
  "nama": "Siti Aminah",
  "nip": "199101012021012001",
  "id_seksi": 1,
  "role": "pegawai",
  "is_active": true
}
```

**Role yang tersedia:** `pegawai`, `admin_seksi`, `kepala_kantor`, `admin`

**Validasi (400):** `username`, `password`, `nama`, dan `role` wajib diisi. Username harus unik.

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 10,
    "username": "pegawai_baru",
    "nama": "Siti Aminah",
    "role": "pegawai"
  }
}
```

---

## PUT /api/users/:id

Memperbarui data pengguna.

**Request Body:**
```json
{
  "nama": "Siti Aminah Baru",
  "nip": "199101012021012001",
  "id_seksi": 2,
  "role": "admin_seksi",
  "is_active": false
}
```

**Response (200):**
```json
{ "success": true, "data": { "id": 10, "username": "pegawai_baru", "nama": "Siti Aminah Baru", "role": "admin_seksi" } }
```

**Error (404):** Pengguna tidak ditemukan.

---

## DELETE /api/users/:id

Menghapus pengguna.

**Response (200):**
```json
{ "success": true, "message": "Pengguna dihapus" }
```

**Error (404):** Pengguna tidak ditemukan.