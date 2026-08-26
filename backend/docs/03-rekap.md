# Rekap API

Base URL: `/api/rekap`

**Autentikasi:** Diperlukan (`Bearer <token>`)

---

## GET /api/rekap/summary

Ringkasan statistik laporan sesuai role.

**Response (pegawai):**
```json
{
  "success": true,
  "data": {
    "monthly": [
      { "bulan": 1, "tahun": 2026, "status": "disetujui", "count": 1 },
      { "bulan": 1, "tahun": 2026, "status": "diajukan", "count": 1 }
    ],
    "byStatus": { "disetujui": 8, "diajukan": 2, "draft": 3 },
    "total": 13
  }
}
```

**Response (admin_seksi):**
```json
{
  "success": true,
  "data": {
    "byStatus": { "disetujui": 30, "diajukan": 8, "revisi_admin": 7 },
    "total": 45
  }
}
```

**Response (admin):**
```json
{
  "success": true,
  "data": {
    "totalPegawai": 45,
    "totalLaporan": 350,
    "totalSeksi": 5,
    "byStatus": { "disetujui": 280, "diajukan": 25, "draft": 45 },
    "total": 350
  }
}
```

**Response (kepala_kantor):**
```json
{
  "success": true,
  "data": {
    "totalPegawai": 45,
    "byStatus": { "disetujui": 280, "diteruskan": 25 },
    "bySeksi": [
      { "nama_seksi": "Seksi Operasional", "total_pegawai": 15, "approved": 60, "pending": 10 }
    ]
  }
}
```

---

## GET /api/rekap/export

Export laporan ke format CSV.

**Query Parameters:**
| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `bulan` | integer | Filter bulan |
| `tahun` | integer | Filter tahun |
| `status` | string | Filter status |

**Response:** File CSV dengan header:
`Judul,Bulan,Tahun,Status,Nama Pegawai,NIP,Username,Seksi,Capaian,Kendala,Tindak Lanjut,Tanggal Pengajuan`

---

## GET /api/rekap/export-pdf

Export laporan ke format HTML (siap print/PDF).

**Query Parameters:** sama seperti `/export`

**Response:** Halaman HTML dengan tabel rekap dan tombol print otomatis (`window.print()`).