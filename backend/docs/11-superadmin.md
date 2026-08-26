# Superadmin API

Base URL: `/api/superadmin`

**Autentikasi:** Diperlukan (`Bearer <token>`)
**Role:** Hanya `admin`.

---

## GET /api/superadmin

Dashboard stats untuk admin (ringkasan pengguna, laporan, monitoring, dll).

**Response (200):**
```json
{
  "success": true,
  "data": {
    "users": {
      "total_users": 50,
      "total_pegawai": 45,
      "total_admin_seksi": 5,
      "total_kepala_kantor": 1
    },
    "seksi": {
      "total_seksi": 5
    },
    "laporan": {
      "total_bulan_berjalan": 30,
      "total_disetujui": 280,
      "menunggu_verifikasi": 25,
      "perlu_revisi": 45,
      "pegawai_belum_lapor": 8,
      "per_seksi": [
        { "nama_seksi": "Seksi Operasional", "jumlah": 80 }
      ],
      "per_bulan": [
        { "bulan": 1, "tahun": 2026, "jumlah": 45 }
      ],
      "status_distribution": [
        { "status": "disetujui", "jumlah": 280 }
      ]
    }
  }
}
```

---

## GET /api/superadmin/audit-trail

Riwayat audit trail dengan pagination.

**Query Parameters:**
| Parameter | Tipe | Default |
|-----------|------|---------|
| `bulan` | integer | Filter bulan |
| `tahun` | integer | Filter tahun |
| `user_id` | integer | Filter berdasarkan user |
| `action` | string | Filter kata kunci action |
| `page` | integer | 1 |
| `limit` | integer | 50 |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "id_laporan": 5,
      "id_user": 3,
      "user_name": "Budi Santoso",
      "action": "create",
      "detail": "Laporan dibuat",
      "created_at": "2026-01-10T08:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 120 }
}
```

---

## GET /api/superadmin/monitoring

Monitoring pegawai yang belum melapor per seksi.

**Query Parameters:**
| Parameter | Tipe | Default |
|-----------|------|---------|
| `bulan` | integer | Bulan saat ini |
| `tahun` | integer | Tahun saat ini |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "bulan": 1,
    "tahun": 2026,
    "sections": [
      {
        "id_seksi": 1,
        "nama_seksi": "Seksi Operasional",
        "total_pegawai": 15,
        "sudah_lapor": [
          { "id": 3, "nama": "Budi Santoso", "nip": "1990..." }
        ],
        "belum_lapor": [
          { "id": 4, "nama": "Siti Aminah", "nip": "1991..." }
        ]
      }
    ]
  }
}
```

---

## Period Management

### GET /api/superadmin/periode
Daftar semua periode laporan.

### POST /api/superadmin/periode
Membuat periode baru.
```json
{
  "bulan": 2,
  "tahun": 2026,
  "tanggal_mulai": "2026-02-01",
  "deadline": "2026-03-05",
  "status": "aktif"
}
```

### PUT /api/superadmin/periode/:id
Memperbarui periode (field apa pun yang dikirim akan di-update).

### DELETE /api/superadmin/periode/:id
Menghapus periode.

### POST /api/superadmin/periode/:id/close
Menutup periode (status → `ditutup`).

### POST /api/superadmin/periode/:id/open
Membuka kembali periode (status → `aktif`).

---

## Settings

### GET /api/superadmin/settings
Mengambil semua pengaturan sistem (key-value store).

**Response (200):**
```json
{
  "success": true,
  "data": {
    "deadline_per_bulan": 10,
    "notifikasi_otomatis": true
  }
}
```

### PUT /api/superadmin/settings
Memperbarui beberapa pengaturan sekaligus.
```json
{
  "deadline_per_bulan": 15,
  "notifikasi_otomatis": false
}
```

---

## Export

### GET /api/superadmin/export/users
Export data pengguna ke JSON.

### GET /api/superadmin/export/reports
Export data laporan ke JSON.
**Query Parameters:** `bulan`, `tahun` (opsional).

---

## Backup

### POST /api/superadmin/backup
Membuat backup database ke file JSON di `uploads/backups/`.

**Response (200):**
```json
{
  "success": true,
  "message": "Backup berhasil dibuat",
  "data": {
    "filename": "backup-2026-01-20T10-00-00-000Z.json",
    "size": 524288
  }
}
```

### GET /api/superadmin/backup/list
Daftar file backup yang tersimpan.

### GET /api/superadmin/backup/download/:filename
Unduh file backup.

---

## Notification Send (Admin)

### POST /api/superadmin/notifications/send
Mengirim notifikasi ke pengguna tertentu atau broadcast ke semua pengguna aktif.

**Request Body (ke satu pengguna):**
```json
{
  "id_user": 3,
  "title": "Pengingat Pengajuan",
  "message": "Mohon segera ajukan laporan bulan Januari",
  "type": "warning"
}
```

**Request Body (broadcast):**
```json
{
  "title": "Pengumuman",
  "message": "Periode laporan bulan Februari telah dibuka",
  "type": "info"
}
```