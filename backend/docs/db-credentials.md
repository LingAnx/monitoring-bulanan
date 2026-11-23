# Keamanan Kredensial Database & JWT

## Kebijakan
1. Kredensial database **hanya** dibaca dari environment variables (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`).
2. **Tidak ada** password default dalam source code.
3. Di mode `production`, placeholder seperti `your_password_here` ditolak secara otomatis (fail-fast saat startup).
4. `DB_PASSWORD` tidak boleh kosong di production.

## Production: Role DB Khusus Aplikasi
Gunakan role PostgreSQL khusus aplikasi dengan hak minimum:

```sql
-- Jalankan sebagai superuser/owner database (sekali saja, di production)
CREATE ROLE ksop_app LOGIN PASSWORD '<password_kuat_acak>';
GRANT CONNECT ON DATABASE ksop_laporan TO ksop_app;
GRANT USAGE ON SCHEMA public TO ksop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ksop_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ksop_app;
-- Jangan beri GRANT SUPERUSER atau GRANT ALL secara blanket
```

Lalu set `DB_USER=ksop_app` dan `DB_PASSWORD=<password_kuat>` di environment production.

## Rotasi DB_PASSWORD
```bash
# Jalankan sebagai superuser/owner PostgreSQL (di server DB production)
ALTER ROLE ksop_app WITH PASSWORD '<password_baru_acak>';

# Update environment variable di app server, lalu restart
export DB_PASSWORD='<password_baru_acak>'
systemctl restart ksop-laporan  # atau: pm2 restart ksop-laporan
```

## Rotasi JWT_SECRET
```bash
# Generate secret baru
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Update environment variable di app server, lalu restart
export JWT_SECRET='<secret_baru>'
systemctl restart ksop-laporan
```

**Efek:** Seluruh token JWT lama (yang ditandatangani dengan secret lama)
otomatis ditolak. Seluruh pengguna aktif harus login ulang.

## Logout
Logout saat ini hanya menghapus token di sisi browser.
Tidak ada revocation server-side (tidak ada blacklist JWT di Redis/DB).
Ini berarti token yang belum expire masih valid sampai JWT_SECRET dirotasi
atau sesi berakhir secara alami. Jika revocation diperlukan, tambahkan
server-side blacklist (misal Redis dengan TTL = sisa masa berlaku token).
