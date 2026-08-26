# API Documentation — Sistem Pelaporan Kinerja Bulanan KSOP Kelas II Cirebon

## Daftar Isi

| No | Dokumen | Endpoint |
|----|---------|----------|
| 1 | [Auth API](01-auth.md) | `/api/auth` |
| 2 | [Laporan API](02-laporan.md) | `/api/laporan` |
| 3 | [Rekap API](03-rekap.md) | `/api/rekap` |
| 4 | [Users API](04-users.md) | `/api/users` |
| 5 | [Seksi API](05-seksi.md) | `/api/seksi` |
| 6 | [Notifications API](06-notifications.md) | `/api/notifications` |
| 7 | [Profile API](07-profile.md) | `/api/profile` |
| 8 | [Upload API](08-upload.md) | `/api/upload` |
| 9 | [Pegawai API](09-pegawai.md) | `/api/pegawai` |
| 10 | [Kepala Kantor API](10-kepala.md) | `/api/kepala` |
| 11 | [Superadmin API](11-superadmin.md) | `/api/superadmin` |
| 12 | [Export API](12-export.md) | `/api/export` |

---

## Authentication

Semua endpoint (kecuali `/api/auth/login` dan `/api/auth/me`) memerlukan header:

```
Authorization: Bearer <token>
```

Token diperoleh dari `/api/auth/login` dan berlaku selama **7 hari**.

## Roles

| Role | Deskripsi |
|------|-----------|
| `admin` | Superadmin, akses penuh ke semua endpoint |
| `admin_seksi` | Admin masing-masing seksi, mengelola laporan di sektornya |
| `kepala_kantor` | Kepala Kantor, menyetujui/menolak laporan |
| `pegawai` | Pegawai, membuat dan mengajukan laporan |

## Status Laporan

| Status | Deskripsi |
|--------|-----------|
| `draft` | Laporan baru dibuat, belum diajukan |
| `diajukan` | Laporan sudah diajukan, menunggu verifikasi admin seksi |
| `diteruskan` | Laporan sudah diverifikasi admin seksi, menunggu persetujuan kepala |
| `disetujui` | Laporan disetujui, selesai |
| `revisi_admin` | Laporan diminta revisi oleh admin seksi |
| `revisi_kantor` | Laporan diminta revisi oleh kepala kantor |

## Response Format

Semua endpoint mengembalikan JSON dengan format standar:

**Sukses:**
```json
{ "success": true, "data": { ... } }
```

**Gagal:**
```json
{ "success": false, "message": "Deskripsi error" }
```

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad Request — validasi gagal |
| 401 | Unauthorized — token tidak valid atau tidak ada |
| 403 | Forbidden — role tidak memiliki akses |
| 404 | Not Found — resource tidak ditemukan |
| 500 | Internal Server Error |

## Base URL

```
http://localhost:3000/api
```

## Static Files

- Upload file: `http://localhost:3000/uploads/<filename>`
- Frontend: `http://localhost:3000/` (served dari folder root)