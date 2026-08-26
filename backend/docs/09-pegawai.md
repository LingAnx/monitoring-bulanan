# Pegawai API

Base URL: `/api/pegawai`

**Autentikasi:** Diperlukan (`Bearer <token>`)
**Akses:** Hanya `admin_seksi` yang dapat mengakses data pegawai di sektornya.

---

## GET /api/pegawai

Daftar pegawai di seksi pengguna saat ini beserta statistik laporannya.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 3,
      "nama": "Budi Santoso",
      "nip": "199001012020011001",
      "username": "budi",
      "role": "pegawai",
      "is_active": true,
      "id_seksi": 1,
      "nama_seksi": "Seksi Operasional",
      "total_laporan": 12,
      "laporan_disetujui": 10,
      "laporan_pending": 2,
      "terakhir_lapor": "2026-01"
    }
  ]
}
```

---

## GET /api/pegawai/deadline

Cek kepatuhan pengajuan laporan per bulan (siapa yang sudah/m belum lapor).

**Query Parameters:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `bulan` | integer | Bulan saat ini | Filter bulan |
| `tahun` | integer | Tahun saat ini | Filter tahun |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 3,
      "nama": "Budi Santoso",
      "nip": "199001012020011001",
      "nama_seksi": "Seksi Operasional",
      "sudah_lapor": true,
      "bulan": 1,
      "tahun": 2026
    },
    {
      "id": 4,
      "nama": "Siti Aminah",
      "nip": "199101012021012001",
      "nama_seksi": "Seksi Operasional",
      "sudah_lapor": false,
      "bulan": 1,
      "tahun": 2026
    }
  ],
  "bulan": 1,
  "tahun": 2026
}
```