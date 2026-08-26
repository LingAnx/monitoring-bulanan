# Notifications API

Base URL: `/api/notifications`

**Autentikasi:** Diperlukan (`Bearer <token>`)

---

## GET /api/notifications

Mengambil daftar notifikasi pengguna saat ini.

**Query Parameters:**
| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `limit` | integer | 20 | Jumlah notifikasi maksimal |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "id_user": 3,
      "title": "Laporan Baru Diajukan",
      "message": "Laporan Kinerja Bulan Januari telah diajukan oleh Budi Santoso",
      "type": "info",
      "is_read": false,
      "created_at": "2026-01-16T08:30:00.000Z"
    }
  ],
  "unread": 5
}
```

---

## POST /api/notifications/read-all

Menandai semua notifikasi pengguna sebagai sudah dibaca.

**Response (200):**
```json
{ "success": true, "message": "Semua notifikasi dibaca" }
```

---

## POST /api/notifications/:id/read

Menandai satu notifikasi sebagai sudah dibaca.

**Response (200):**
```json
{ "success": true, "message": "Notifikasi dibaca" }
```

**Error (404):** Notifikasi tidak ditemukan atau bukan milik pengguna.

---

## DELETE /api/notifications/:id

Menghapus notifikasi.

**Response (200):**
```json
{ "success": true, "message": "Notifikasi dihapus" }
```

**Error (404):** Notifikasi tidak ditemukan atau bukan milik pengguna.