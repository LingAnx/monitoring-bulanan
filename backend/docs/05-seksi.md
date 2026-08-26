# Seksi API

Base URL: `/api/seksi`

**Autentikasi:** Diperlukan (`Bearer <token>`)
**Role:** `GET` semua role, `POST/PUT/DELETE` hanya `admin`.

---

## GET /api/seksi

Daftar semua seksi diurutkan berdasarkan ID.

**Response (200):**
```json
{
  "success": true,
  "data": [
    { "id": 1, "nama_seksi": "Seksi Operasional" },
    { "id": 2, "nama_seksi": "Seksi Perencanaan" },
    { "id": 3, "nama_seksi": "Seksi Keuangan" }
  ]
}
```

---

## POST /api/seksi

Membuat seksi baru.

**Request Body:**
```json
{
  "nama_seksi": "Seksi Kepegawaian"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": { "id": 4, "nama_seksi": "Seksi Kepegawaian" }
}
```

**Validasi (400):** `nama_seksi` wajib diisi.

---

## PUT /api/seksi/:id

Memperbarui nama seksi.

**Request Body:**
```json
{
  "nama_seksi": "Seksi Kepegawaian dan Umum"
}
```

**Response (200):**
```json
{ "success": true, "data": { "id": 4, "nama_seksi": "Seksi Kepegawaian dan Umum" } }
```

**Error (404):** Seksi tidak ditemukan.

---

## DELETE /api/seksi/:id

Menghapus seksi.

**Response (200):**
```json
{ "success": true, "message": "Seksi berhasil dihapus" }
```

**Error (404):** Seksi tidak ditemukan.