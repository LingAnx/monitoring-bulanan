# Upload API

Base URL: `/api/upload`

**Autentikasi:** Diperlukan (`Bearer <token>`)

---

## POST /api/upload

Mengunggah file (gambar, PDF, dokumen).

**Multipart Form Data:**
| Field | Tipe | Deskripsi |
|-------|------|-----------|
| `file` | file | File yang diunggah (wajib) |

**Tipe file yang didukung:** `.jpg`, `.jpeg`, `.png`, `.gif`, `.pdf`, `.doc`, `.docx`
**Batas ukuran:** 10 MB

**Response (200):**
```json
{
  "success": true,
  "data": {
    "filename": "laporan-januari.pdf",
    "storedName": "1737372000000-847261593.pdf",
    "size": 245760,
    "mimeType": "application/pdf",
    "url": "/uploads/1737372000000-847261593.pdf"
  }
}
```

**Error (400):** File tidak ditemukan / Tipe file tidak didukung.

**Storage:** File disimpan di folder `backend/uploads/`.