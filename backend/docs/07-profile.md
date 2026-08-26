# Profile API

Base URL: `/api/profile`

**Autentikasi:** Diperlukan (`Bearer <token>`)
**Akses:** Setiap pengguna hanya dapat mengakses profilnya sendiri.

---

## PUT /api/profile

Memperbarui profil pengguna.

**Request Body:**
```json
{
  "nama": "Budi Santoso (Revisi)",
  "nip": "199001012020011001",
  "password": "password_baru123"
}
```

- `nama` dan `nip` opsional.
- `password` opsional; jika diisi, akan di-hash menggunakan bcrypt.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 3,
    "username": "budi",
    "nama": "Budi Santoso (Revisi)",
    "nip": "199001012020011001",
    "role": "pegawai",
    "nama_seksi": "Seksi Operasional"
  }
}
```

**Error (400):** Tidak ada data yang diubah (semua field kosong).

---

## GET /api/profile

Mengambil data profil pengguna saat ini.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 3,
    "username": "budi",
    "nama": "Budi Santoso",
    "nip": "199001012020011001",
    "role": "pegawai",
    "is_active": true,
    "created_at": "2026-01-10T08:00:00.000Z",
    "nama_seksi": "Seksi Operasional"
  }
}
```

**Error (404):** User tidak ditemukan.