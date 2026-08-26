# Kepala Kantor API

Base URL: `/api/kepala`

**Autentikasi:** Diperlukan (`Bearer <token>`)
**Role:** Hanya `kepala_kantor`.

---

## GET /api/kepala/stats

Statistik dashboard Kepala Kantor (total pegawai, laporan, compliance, grafik bulanan).

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalPegawai": 45,
    "totalLaporan": 350,
    "pending": 25,
    "approved": 280,
    "rejected": 45,
    "draft": 15,
    "submitted": 10,
    "bySeksi": [
      {
        "id": 1,
        "nama_seksi": "Seksi Operasional",
        "total_pegawai": 15,
        "approved": 60,
        "pending": 10,
        "no_lapor": 3
      }
    ],
    "compliance": [
      { "nama_seksi": "Seksi Operasional", "total": 15, "reported": 13 }
    ],
    "monthly": [
      { "tahun": 2026, "bulan": 1, "count": 45 }
    ],
    "statusDist": { "disetujui": 280, "diajukan": 25, "draft": 15 }
  }
}
```

---

## GET /api/kepala/monitoring

Monitoring kepatuhan pegawai per seksi (siapa sudah melapor, siapa belum).

**Query Parameters:**
| Parameter | Tipe | Default |
|-----------|------|---------|
| `bulan` | integer | Bulan saat ini |
| `tahun` | integer | Tahun saat ini |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "sek_id": 1,
      "nama_seksi": "Seksi Operasional",
      "user_id": 3,
      "nama": "Budi Santoso",
      "nip": "199001012020011001",
      "sudah_lapor": true
    }
  ],
  "bulan": 1,
  "tahun": 2026
}
```

---

## GET /api/kepala/history

Riwayat persetujuan dari tabel `persetujuan`.

**Query Parameters:**
| Parameter | Tipe | Default |
|-----------|------|---------|
| `bulan` | integer | Filter bulan |
| `tahun` | integer | Filter tahun |
| `status` | string | Filter status persetujuan |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "id_laporan": 5,
      "id_kepala": 1,
      "status": "disetujui",
      "catatan": "Sudah sesuai",
      "judul": "Laporan Kinerja Januari",
      "bulan": 1,
      "tahun": 2026,
      "pegawai_nama": "Budi Santoso",
      "nip": "199001012020011001",
      "nama_seksi": "Seksi Operasional",
      "kepala_nama": "Dr. H. Ahmad",
      "created_at": "2026-01-20T10:00:00.000Z"
    }
  ]
}
```

---

## GET /api/kepala/archive

Arsip laporan yang sudah `disetujui`.

**Query Parameters:**
| Parameter | Tipe | Default |
|-----------|------|---------|
| `bulan` | integer | Filter bulan |
| `tahun` | integer | Filter tahun |
| `search` | string | Pencarian judul / nama pegawai |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 5,
      "judul": "Laporan Kinerja Januari",
      "bulan": 1,
      "tahun": 2026,
      "status": "disetujui",
      "user_nama": "Budi Santoso",
      "nama_seksi": "Seksi Operasional"
    }
  ]
}
```

---

## GET /api/kepala/reports

Semua laporan dengan filter lengkap.

**Query Parameters:**
| Parameter | Tipe | Default |
|-----------|------|---------|
| `bulan` | integer | Filter bulan |
| `tahun` | integer | Filter tahun |
| `status` | string | Filter status |
| `seksi` | integer | Filter berdasarkan ID seksi |
| `search` | string | Pencarian judul / nama pegawai |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 5,
      "judul": "Laporan Kinerja Januari",
      "bulan": 1,
      "tahun": 2026,
      "status": "disetujui",
      "user_nama": "Budi Santoso",
      "nip": "199001012020011001",
      "nama_seksi": "Seksi Operasional"
    }
  ]
}
```