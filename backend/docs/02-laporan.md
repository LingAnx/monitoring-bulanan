# Laporan API

Base URL: `/api/laporan`

**Autentikasi:** Diperlukan (`Bearer <token>`)

---

## GET /api/laporan

Mengambil daftar laporan sesuai role pengguna.

**Query Parameters:**
| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `bulan` | integer | Filter berdasarkan bulan (1-12) |
| `tahun` | integer | Filter berdasarkan tahun |
| `status` | string | Filter berdasarkan status |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "id_user": 3,
      "judul": "Laporan Kinerja Bulan Januari",
      "bulan": 1,
      "tahun": 2026,
      "isi_kegiatan": "Melaksanakan ...",
      "capaian": "Target tercapai 90%",
      "kendala": "Keterlambatan barang",
      "tindak_lanjut": "Follow up pengadaan",
      "rencana_bulan_depan": "Melanjutkan program ...",
      "status": "diajukan",
      "catatan_admin": null,
      "catatan_kantor": null,
      "tanggal_pengajuan": "2026-01-15T10:00:00.000Z",
      "tanggal_verifikasi": "2026-01-16T08:30:00.000Z",
      "tanggal_persetujuan": null,
      "created_at": "2026-01-10T08:00:00.000Z",
      "updated_at": "2026-01-16T08:30:00.000Z",
      "user_nama": "Budi Santoso",
      "username": "budi",
      "id_seksi": 1,
      "nama_seksi": "Seksi Operasional"
    }
  ]
}
```

**Filter per Role:**
- `pegawai`: Hanya laporan miliknya sendiri
- `admin_seksi`: Semua laporan di sektornya
- `kepala_kantor` / `admin`: Semua laporan

---

## GET /api/laporan/stats

Statistik dashboard laporan sesuai role.

**Response (pegawai):**
```json
{
  "success": true,
  "data": {
    "total": 12,
    "draft": 2,
    "submitted": 3,
    "approved": 7
  }
}
```

**Response (admin_seksi):**
```json
{
  "success": true,
  "data": {
    "total": 45,
    "pending": 8,
    "verified": 30,
    "rejected": 7,
    "bySeksi": [{ "nama_seksi": "Seksi Operasional" }]
  }
}
```

**Response (kepala_kantor):**
```json
{
  "success": true,
  "data": {
    "total": 120,
    "totalLaporan": 350,
    "pending": 25,
    "approved": 280,
    "rejected": 45,
    "bySeksi": [
      { "nama_seksi": "Seksi Operasional", "total_pegawai": 15, "total_laporan": 80 },
      { "nama_seksi": "Seksi Perencanaan", "total_pegawai": 12, "total_laporan": 65 }
    ]
  }
}
```

---

## POST /api/laporan

Membuat laporan baru dengan status `draft`.

**Request Body:**
```json
{
  "judul": "Laporan Kinerja Bulan Februari",
  "bulan": 2,
  "tahun": 2026,
  "isi_kegiatan": "Kegiatan ...",
  "capaian": "Capaian ...",
  "kendala": "Kendala ...",
  "tindak_lanjut": "Tindak lanjut ...",
  "rencana_bulan_depan": "Rencana ..."
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 5,
    "judul": "Laporan Kinerja Bulan Februari",
    "bulan": 2,
    "tahun": 2026,
    "status": "draft",
    ...
  }
}
```

**Validasi (400):** `judul`, `bulan`, dan `tahun` wajib diisi.

---

## PUT /api/laporan/:id

Mengedit laporan yang berstatus `draft` atau `revisi_admin` / `revisi_kantor`.

**Request Body:**
```json
{
  "judul": "Laporan Diperbarui",
  "bulan": 2,
  "tahun": 2026,
  "isi_kegiatan": "Kegiatan ...",
  "capaian": "Capaian ...",
  "kendala": "Kendala ...",
  "tindak_lanjut": "Tindak lanjut ...",
  "rencana_bulan_depan": "Rencana ..."
}
```

**Response (200):**
```json
{ "success": true, "data": { ... } }
```

**Error (400):** Hanya laporan draft atau perlu revisi yang dapat diedit.

---

## POST /api/laporan/:id/submit

Mengajukan laporan dari status `draft` ke `diajukan`.

**Response (200):**
```json
{ "success": true, "data": { "status": "diajukan", ... } }
```

**Error (400):** Hanya laporan draft yang dapat diajukan.

---

## POST /api/laporan/:id/verify

Verifikasi laporan (hanya `admin_seksi`).

**Request Body:**
```json
{
  "status": "diverifikasi",
  "catatan": "Sudah sesuai"
}
```

**Status:** `diverifikasi` → laporan menjadi `diteruskan`, `revisi_admin` → laporan menjadi `revisi_admin`.

---

## POST /api/laporan/:id/approve

Persetujuan/revisi laporan (hanya `kepala_kantor`).

**Request Body:**
```json
{
  "status": "disetujui",
  "catatan": "Disetujui"
}
```

**Status:** `disetujui` → laporan menjadi `disetujui`, `revisi_kantor` → laporan menjadi `revisi_kantor`.

---

## GET /api/laporan/:id

Mengambil detail satu laporan.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "judul": "...",
    "status": "diajukan",
    ...
  }
}
```

---

## GET /api/laporan/:id/audit

Mengambil riwayat audit trail suatu laporan.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "id_laporan": 1,
      "id_user": 3,
      "user_nama": "Budi Santoso",
      "action": "create",
      "detail": "Laporan dibuat",
      "created_at": "2026-01-10T08:00:00.000Z"
    }
  ]
}
```

---

## GET /api/laporan/:id/verifikasi-history

Mengambil riwayat verifikasi suatu laporan.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "id_laporan": 1,
      "id_admin_seksi": 2,
      "admin_nama": "Admin Seksi",
      "status": "diverifikasi",
      "catatan": "Sudah sesuai",
      "created_at": "2026-01-16T08:30:00.000Z"
    }
  ]
}
```
