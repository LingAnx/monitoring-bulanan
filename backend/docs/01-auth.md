# Auth API

Base URL: `/api/auth`

Semua endpoint di bawah ini **tidak memerlukan autentikasi** kecuali yang disebutkan.

---

## POST /api/auth/login

Login pengguna dan menerima token JWT.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response (200):**
```json
{
  "success": true,
  "token": "eyJ...",
  "user": {
    "id": 1,
    "username": "pegawai1",
    "nama": "Budi Santoso",
    "nip": "199001012020011001",
    "role": "pegawai",
    "id_seksi": 1,
    "is_active": true,
    "created_at": "2026-01-15T08:00:00.000Z"
  }
}
```

**Error Response (400):**
```json
{ "success": false, "message": "Username dan password wajib diisi" }
```

**Error Response (401):**
```json
{ "success": false, "message": "Username atau password salah" }
```

---

## GET /api/auth/me

Mengambil data pengguna saat ini berdasarkan token JWT.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "pegawai1",
    "nama": "Budi Santoso",
    "role": "pegawai",
    "id_seksi": 1
  }
}
```

---

## POST /api/auth/logout

Logout pengguna (token tetap valid sampai expire, hanya untuk pencatatan).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{ "success": true, "message": "Logout berhasil" }
```
