// ══════════════════════════════════════════════════
// CHANGE-PASSWORD — force-password-change flow
// Dipanggil setelah login.js redirect dengan
// PASSWORD_CHANGE_REQUIRED.
//
// Alur:
// 1. User mengisi password baru (min. 8 char, 1 huruf + 1 angka).
// 2. Kita POST ke /api/auth/reset-password (stateless, tanpa
//    currentPassword — dipakai khusus untuk reset setelah
//    first-login / admin-reset).
//    Catatan: endpoint ini TIDAK verifikasi currentPassword;
//    dipakai untuk reset flow via token/force-change,
//    bukan untuk change-password biasa (yang di profile).
// 3. Setelah sukses, user diarahkan ke login.html untuk
//    login ulang dengan password baru.
//
// 401/403/500 → tampilkan error, jangan redirect.
// ══════════════════════════════════════════════════
(function () {
  'use strict';

  var API_BASE = '';

  var form = document.getElementById('changePasswordForm');
  var newPw = document.getElementById('newPassword');
  var confirmPw = document.getElementById('confirmNewPassword');
  var errEl = document.getElementById('cpErrorMessage');
  var btn = form ? form.querySelector('button[type=submit]') : null;
  var btnText = document.getElementById('cpBtnText');
  var btnLoader = document.getElementById('cpBtnLoader');

  if (!form || !newPw || !confirmPw) return;

  // Guard: kalau user sudah punya token valid, tidak perlu di sini.
  var _auth = function (name, val) {
    try {
      return (typeof AuthStore !== 'undefined' && AuthStore[name]) ? AuthStore[name](val) : undefined;
    } catch (e) { return undefined; }
  };
  if (_auth('isAuthenticated')) {
    // User already has a session — send to dashboard.
    window.location.href = '/index.html';
    return;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errEl.textContent = '';
    errEl.className = 'error-message';

    var pw = newPw.value;
    var confirm = confirmPw.value;

    // Client-side mirror of server policy.
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

    if (btn) { btn.disabled = true; }
    if (btnText) btnText.style.display = 'none';
    if (btnLoader) btnLoader.style.display = 'block';

    try {
      var res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword: pw,
          confirmNewPassword: confirm
        })
      });
      var data = await res.json();

      if (res.ok && data.success) {
        // Clear any stale auth state, redirect to login.
        _auth('clear');
        window.location.href = '/login.html';
        return;
      }

      errEl.textContent = data.message || 'Gagal mengubah password';
      errEl.className = 'error-message show';
      if (btn) btn.disabled = false;
      if (btnText) btnText.style.display = 'block';
      if (btnLoader) btnLoader.style.display = 'none';
    } catch (err) {
      errEl.textContent = 'Gagal terhubung ke server';
      errEl.className = 'error-message show';
      if (btn) btn.disabled = false;
      if (btnText) btnText.style.display = 'block';
      if (btnLoader) btnLoader.style.display = 'none';
    }
  });
})();
