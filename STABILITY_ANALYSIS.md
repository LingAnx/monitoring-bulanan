# Analisis Stabilitas - Sistem Pelaporan Kinerja Bulanan KSOP

## Ringkasan Masalah

Berdasarkan audit kode, terdapat 6 kategori masalah stabilitas yang perlu ditangani:

---

## 1. KEAMANAN (CRITICAL)

### 1.1 JWT Secret Hardcoded
**File**: `backend/middleware/auth.js:4`
```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'ksop-secret-key-change-in-production';
```
**Masalah**: Secret default mudah ditebak, semua token bisa diforgery.

**Solusi**: 
- Generate secret kuat di `.env`: `JWT_SECRET=<random-64-char>`
- Gunakan `crypto.randomBytes(64).toString('hex')`
- Validasi secret ada sebelum server start

### 1.2 Tidak Ada Rate Limiting
**File**: `backend/server.js`
**Masalah**: Tidak ada proteksi dari brute force login atau abuse API.

**Solusi**: Tambahkan `express-rate-limit` atau `express-brute`.

### 1.3 CORS Terbuka
**File**: `backend/server.js:32`
```javascript
app.use(cors()); // Allow all origins
```
**Masalah**: Siapapun bisa mengakses API dari domain manapun.

**Solusi**: Batasi origin ke domain production.

---

## 2. DATABASE (HIGH)

### 2.1 N+1 Query di Stats Endpoint
**File**: `backend/routes/laporan.js:54-105`
**Masalah**: 4-5 query terpisah untuk statistik sederhana.

**Solusi**: Gabung jadi 1 query dengan conditional aggregation:
```sql
SELECT 
  COUNT(*) FILTER (WHERE status='draft') as draft,
  COUNT(*) FILTER (WHERE status='diajukan') as submitted,
  COUNT(*) FILTER (WHERE status='disetujui') as approved
FROM laporan WHERE id_user = $1
```

### 2.2 Tidak Ada Pagination
**File**: `backend/routes/laporan.js:7-50`
**Masalah**: Endpoint `/api/laporan` return semua data tanpa limit.

**Solusi**: Tambah `limit` dan `offset` dari query params.

### 2.3 Connection Pool Tanpa Config
**File**: `backend/db/database.js`
**Masalah**: Pool default tanpa max/min/timeout config.

**Solusi**:
```javascript
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 2.4 Tidak Ada Health Check DB
**Masalah**: Server bisa running tapi DB mati.

**Solusi**: Tambah endpoint `/health` yang cek DB connection.

---

## 3. PERFORMANCE (MEDIUM)

### 3.1 Semua CSS Dimuat di Setiap Halaman
**Masalah**: 17 file CSS dimuat untuk setiap halaman, padahal tiap section hanya butuh sebagian.

**Solusi**: 
- Bundle CSS per role/section
- Atau gunakan code-splitting

### 3.2 Tidak Ada Caching
**File**: `backend/server.js:25-30`
```javascript
res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
```
**Masalah**: Semua response di-cache disabled, termasuk data statis.

**Solusi**: 
- Cache HTML/CSS/JS client-side (long expiry)
- Cache API response dengan Redis atau in-memory cache

### 3.3 Query Tanpa Index yang Optimal
**File**: `backend/db/schema.sql`
**Masalah**: 
- `laporan.id_user` sudah ada index, tapi `laporan.status` juga perlu compound index
- `users.id_seksi` perlu index untuk join cepat

**Solusi**: 
```sql
CREATE INDEX idx_laporan_user_status ON laporan(id_user, status);
CREATE INDEX idx_users_seksi_role ON users(id_seksi, role);
```

---

## 4. ERROR HANDLING (MEDIUM)

### 4.1 Tidak Ada Global Error Boundary
**File**: `app.js`, `employee/dashboard.js`, dll
**Masalah**: Fetch error hanya di-catch di level component, tidak ada fallback global.

**Solusi**: Tambah global error handler di `app.js`:
```javascript
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error);
  // Show user-friendly error
});
```

### 4.2 Tidak Ada Timeout pada Fetch
**File**: `app.js:109-119`
**Masalah**: Fetch tanpa timeout bisa hang indefinitely.

**Solusi**:
```javascript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);
const res = await fetch(url, { ...options, signal: controller.signal });
clearTimeout(timeout);
```

### 4.3 No Retry on Failure
**Masalah**: Jika API gagal sekali, langsung tampilkan error.

**Solusi**: Tambah retry logic dengan exponential backoff.

---

## 5. DEPLOYMENT (HIGH)

### 5.1 API Base Hardcoded
**File**: `app.js:1`, `login.js:6`, semua `*.js` di section folders
```javascript
const API_BASE = 'http://localhost:3000';
```
**Masalah**: Tidak akan bekerja di production/deployment.

**Solusi**: 
```javascript
const API_BASE = window.location.origin + '/api';
// atau ambil dari environment variable
```

### 5.2 Tidak Ada Build Step
**Masalah**: Semua file JS/CSS dikirim apa adanya ke browser.

**Solusi**: Tambah build dengan Vite/Webpack untuk:
- Minify & bundle
- Environment variable injection
- Code splitting

---

## 6. MONITORING (LOW-MEDIUM)

### 6.1 Tidak Ada Structured Logging
**File**: `backend/server.js`, semua route files
**Masalah**: Hanya `console.error()` dan `console.log()`.

**Solusi**: Tambah `winston` atau `pino` untuk:
- Log levels (info, warn, error)
- Request logging middleware
- Error tracking

### 6.2 Tidak Ada Request Metrics
**Masalah**: Tidak tahu response time, error rate, request count.

**Solusi**: Tambah `express-mongo-sanitize` + custom metrics.

---

## ACTIONABLE PLAN

### Phase 1: Critical Fixes (1-2 hari)
1. [ ] Set JWT_SECRET di .env
2. [ ] Tambah rate limiting
3. [ ] Fix CORS ke specific origin
4. [ ] Ganti API_BASE hardcoded ke dynamic
5. [ ] Tambah DB connection pool config

### Phase 2: Performance (2-3 hari)
6. [ ] Optimasi query stats (N+1 fix)
7. [ ] Tambah pagination di laporan endpoint
8. [ ] Bundle CSS per section
9. [ ] Tambah query indexes

### Phase 3: Reliability (2-3 hari)
10. [ ] Tambah fetch timeout
11. [ ] Tambah retry logic
12. [ ] Global error boundary
13. [ ] DB health check endpoint

### Phase 4: Monitoring (1-2 hari)
14. [ ] Tambah structured logging
15. [ ] Tambah request metrics
16. [ ] Setup error tracking (Sentry/LogRocket)

---

## Priority Matrix

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| P0 | JWT Secret hardcode | Security breach | Low |
| P0 | API hardcoded localhost | Production fail | Low |
| P1 | N+1 queries | Performance | Medium |
| P1 | No rate limiting | Abuse/DDoS | Low |
| P2 | No pagination | Scalability | Low |
| P2 | No fetch timeout | UX hangs | Low |
| P3 | No monitoring | Debug difficulty | Medium |

---

Total estimated fix time: 1-2 minggu untuk semua phase.
