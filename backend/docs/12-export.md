# Export API

Base URL: `/api/export`

**Autentikasi:** Diperlukan (`Bearer <token>`)
**Role:** Hanya `admin`.

---

## GET /api/export/csv/users

Export data pengguna ke CSV.

**Response:** File CSV dengan header:
`id,username,nama,nip,role,is_active,nama_seksi,created_at`

---

## GET /api/export/csv/reports

Export data laporan ke CSV.

**Query Parameters:**
| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `bulan` | integer | Filter bulan (opsional) |
| `tahun` | integer | Filter tahun (opsional) |

**Response:** File CSV dengan header:
`id,judul,bulan,tahun,status,catatan_admin,tanggal_pengajuan,nama_pegawai,nip,nama_seksi`

---

## GET /api/export/pdf/reports

Stub endpoint untuk export PDF (belum tersedia).

**Response (200):**
```json
{
  "success": true,
  "message": "PDF export akan segera hadir",
  "data": null
}
```