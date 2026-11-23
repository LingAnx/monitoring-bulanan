// ══════════════════════════════════════════════════
// CHANGE-PASSWORD — force-password-change flow (v2, 2026-10-26)
//
// Alur (skema NEW, lihat CHANGELOG_FIXES.md):
// 1. User login dengan flag must_change_password=true.
//    Respons login membawa `temporaryToken` (expiry 10 menit,
//    audience 'ksop-laporan-pwd-change', terikat token_version).
// 2. Frontend mengarahkan ke halaman ini dengan membawa:
//      - temporaryToken (WAJIB) — dipakai sebagai Authorization Bearer
//      - currentPassword (password LAMA) — WAJIB divalidasi server
// 3. PUT /api/auth/change-password
//      body: { currentPassword, newPassword, confirmNewPassword }
//      header: Authorization: Bearer <temporaryToken>
// 4. Server memverifikasi:
//      - token sementara valid (audience khusus, token_version match,
//        user masih must_change_password=true, akun aktif)
//      - password LAMA benar (tidak bisa ganti tanpa tahu lama)
//      - kebijakan password baru (≥8, min 1 huruf+1 angka, konfirmasi
//        sama, baru ≠ lama)
// 5. Berhasil → must_change_password=false, token_version +1
//    (semua sesi ter-revoke). Frontend menghapus AuthStore,
//    mengarahkan ke /login.html untuk login ulang.
//
// Jika token kedaluwarsa (10 menit) → user diarahkan ke /login.html.
// (Catatan: tidak ada lagi endpoint /api/auth/reset-password —
//  penghapusan jalur tanpa password lama.)
// ══════════════════════════════════════════════════
(function () {
  'use strict';

  var API_BASE = '';

  // ── Token sementara diambil dari sessionStorage (di-set login.js) ──
  // TIDAK ADA secret di URL — hindari browser history / Referer / log.
  var tempToken = '';
  try { tempToken = sessionStorage.getItem('pwd_change_token') || ''; } catch (e) {}
  // Hapus token dari storage setelah halaman load (single-use dalam session).
  // Jika halaman di-refresh, user harus login ulang.
  if (tempToken) {
    try { sessionStorage.removeItem('pwd_change_token'); } catch (e) {}
  }

  // Guard: AuthStore tidak boleh memegang token sesi penuh di sini.
  try { if (typeof AuthStore !== 'undefined' && AuthStore.clear) AuthStore.clear(); } catch (e) {}

  var form = document.getElementById('changePasswordForm');
  var oldPwInput = document.getElementById('oldPassword');
  var newPw = document.getElementById('newPassword');
  var confirmPw = document.getElementById('confirmNewPassword');
  var errEl = document.getElementById('cpErrorMessage');
  var btn = form ? form.querySelector('button[type=submit]') : null;
  var btnText = document.getElementById('cpBtnText');
  var btnLoader = document.getElementById('cpBtnLoader');

  if (!form || !newPw || !confirmPw) return;

  // Jika URL tidak membawa token & oldPw, tampilkan pesan kembali login.
  if (!tempToken) {
    var msg = document.createElement('p');
    msg.className = 'sub';
    msg.textContent = 'Sesi perubahan password sudah berakhir. Silakan login kembali.';
    form.insertBefore(msg, form.firstChild);
    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'login-btn';
    back.textContent = 'Kembali ke Login';
    back.addEventListener('click', function () { window.location.href = '/login.html'; });
    form.appendChild(back);
    return;
  }

  // Password lama tidak pernah disimpan di storage — user wajib
  // mengetikkannya ulang di halaman ini.
  if (oldPwInput) oldPwInput.focus();

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errEl.textContent = '';
    errEl.className = 'error-message';

    var pw = newPw.value;
    var confirm = confirmPw.value;
    var old = oldPwInput ? oldPwInput.value : '';

    // Client-side mirror of server policy.
    if (old === '') {
      errEl.textContent = 'Password lama wajib diisi';
      errEl.className = 'error-message show';
      return;
    }
    if (pw.length < 8) {
      errEl.textContent = 'Password baru minimal 8 karakter';
      errEl.className = 'error-message show';
      return;
    }
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
      errEl.textContent = 'Password baru harus mengandung minimal 1 huruf dan 1 angka';
      errEl.className = 'error-message show';
      return;
    }
    if (pw !== confirm) {
      errEl.textContent = 'Konfirmasi password tidak cocok';
      errEl.className = 'error-message show';
      return;
    }

    if (btn) btn.disabled = true;
    if (btnText) btnText.style.display = 'none';
    if (btnLoader) btnLoader.style.display = 'block';

    try {
      var res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tempToken}`
        },
        body: JSON.stringify({
          currentPassword: old,
          newPassword: pw,
          confirmNewPassword: confirm
        })
      });
      var data = await res.json().catch(function () { return {}; });

      if (res.ok && data.success) {
        // Success — bersihkan state (termasuk token tersisa), arahkan ke login.
        try { if (typeof AuthStore !== 'undefined' && AuthStore.clear) AuthStore.clear(); } catch (e2) {}
        try { sessionStorage.removeItem('pwd_change_token'); } catch (e2) {}
        window.location.href = '/login.html';
        return;
      }

      // 401 (token tidak valid/kedaluwarsa/versi token tak cocok) → login ulang.
      if (res.status === 401 || data.code === 'PASSWORD_CHANGE_REQUIRED' ||
          /kedaluwarsa|tidak berlaku/i.test(data.message || '')) {
        try { sessionStorage.removeItem('pwd_change_token'); } catch (e2) {}
        errEl.textContent = 'Sesi perubahan password sudah berakhir. Silakan login kembali.';
        errEl.className = 'error-message show';
        setTimeout(function () { window.location.href = '/login.html'; }, 1800);
        return;
      }

      errEl.textContent = data.message || 'Gagal mengubah password';
      errEl.className = 'error-message show';
    } catch (err) {
      errEl.textContent = 'Gagal terhubung ke server';
      errEl.className = 'error-message show';
    } finally {
      if (btn) btn.disabled = false;
      if (btnText) btnText.style.display = 'block';
      if (btnLoader) btnLoader.style.display = 'none';
    }
  });
})();
