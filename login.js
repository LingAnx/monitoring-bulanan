// Safe accessor when AuthStore may not be loaded yet
function _auth(name, val) {
  try { return (typeof AuthStore !== 'undefined' && AuthStore[name]) ? AuthStore[name](val) : undefined; } catch (e) { return undefined; }
}

const API_BASE = '';

// ══════════════════════════════════════════════════
// LOGIN — Uses AuthStore for all auth operations
// Redirects to role-appropriate dashboard
// ══════════════════════════════════════════════════

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errEl = document.getElementById('errorMessage');
  const btn = document.querySelector('.login-btn');
  const btnText = document.getElementById('loginBtnText');
  const loader = document.getElementById('loginBtnLoader');

  errEl.textContent = '';
  errEl.className = 'error-message';
  btn.disabled = true;
  btnText.style.display = 'none';
  loader.style.display = 'block';

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      // ── Alur force password change (skema v2) ─────────────
      // Server mengembalikan `mustChangePassword: true` +
      // `temporaryToken` (bukan token sesi penuh). Tidak ada
      // yang disimpan ke AuthStore; token sementara dikirim
      // sebagai parameter URL ke halaman change-password.
      if (data.mustChangePassword === true && data.temporaryToken) {
        // Token sementara disimpan di sessionStorage (bukan URL) —
        // hindari kebocoran lewat browser history, Referer, atau log.
        _auth('clear');
        try { sessionStorage.setItem('pwd_change_token', data.temporaryToken); } catch (e) {}
        window.location.href = '/change-password.html';
        return;
      }
      // Normal login.
      _auth('setToken', data.token);
      _auth('setCurrentUser', data.user);
      redirectToDashboard(data.user.role);
    } else {
      errEl.textContent = data.message || T.messages.gagal_login;
      errEl.className = 'error-message show';
      btn.disabled = false;
      btnText.style.display = 'block';
      loader.style.display = 'none';
    }
  } catch (err) {
    errEl.textContent = T.messages.error_koneksi;
    errEl.className = 'error-message show';
    btn.disabled = false;
    btnText.style.display = 'block';
    loader.style.display = 'none';
  }
});

// Check existing session on load
window.addEventListener('DOMContentLoaded', () => {
  if (_auth('isAuthenticated')) {
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${_auth('getToken')}` }
    }).then(r => r.json()).then(data => {
      if (data.success) {
        _auth('setCurrentUser', data.user);
        redirectToDashboard(data.user.role);
      } else {
        _auth('clear');
      }
    }).catch(() => {
      _auth('clear');
    });
  }
});
