const API_BASE = '';
const API_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;

// ── Safe AuthStore accessor ──────────────────────────
function _auth(name, val) {
  try {
    if (name === 'ROLES') return typeof AuthStore !== 'undefined' ? AuthStore.ROLES : {};
    return (typeof AuthStore !== 'undefined' && AuthStore[name]) ? AuthStore[name](val) : undefined;
  } catch (e) { return undefined; }
}

// ── Auth state (synced with AuthStore) ───────────────
let currentUser = _auth('getCurrentUser') || null;
let authToken   = _auth('getToken') || null;

async function initAuth() {
  const token = _auth('getToken');
  if (!token) {
    window.location.href = '/login.html';
    return false;
  }
  try {
    const res = await apiFetch(`${API_BASE}/api/auth/me`, {}, { timeout: 5000 });
    if (!res.success) {
      _auth('logoutCleanup') || void 0;
      window.location.href = '/login.html';
      return false;
    }
    // Normalize role on every refresh
    const normalizedUser = { ...res.user, role: (_auth('ROLES', null) || {})[res.user.role] || res.user.role };
    _auth('setCurrentUser', normalizedUser);
    _auth('setToken', token);
    currentUser = _auth('getCurrentUser') || currentUser;
    authToken   = _auth('getToken');
    return true;
  } catch {
    _auth('logoutCleanup') || void 0;
    window.location.href = '/login.html';
    return false;
  }
}

function clearAuth() {
  _auth('logoutCleanup') || void 0;
  currentUser = null;
  authToken   = null;
}

function getAuthHeaders() {
  const token = _auth('getToken');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
}

function getRole() {
  return currentUser ? currentUser.role : null;
}

// ── Role checks — use AuthStore.ROLES (UPPERCASE) ──
function isPegawai() { return getRole() === (_auth('ROLES') || {}).PEGAWAI; }
function isAdminSeksi() { return getRole() === (_auth('ROLES') || {}).ADMIN_SEKSI; }
function isKepala() { return getRole() === (_auth('ROLES') || {}).KEPALA_KANTOR; }
function isAdmin() { return getRole() === (_auth('ROLES') || {}).SUPERADMIN; }

function roleName(role) {
  return T && T.role ? (T.role[role] || role) : (role || '-');
}

function showElement(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = '';
}

function hideElement(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

window.handleLogout = function() {
  if (confirm('Apakah Anda yakin ingin logout?')) {
    clearAuth();
    window.location.href = '/login.html';
  }
};

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatMonthYear(bulan, tahun) {
  return `${T.months[bulan]} ${tahun}`;
}

function showNotification(msg, type = 'info') {
  const existing = document.querySelector('.notification-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `notification-toast notification-${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── Fetch with timeout and retry ─────────────────────
async function apiFetch(url, options = {}, config = {}) {
  const { timeout = API_TIMEOUT, retries = MAX_RETRIES } = config;

  const method = (options.method || 'GET').toUpperCase();

  // Hanya request baca yang boleh di-retry.
  // POST/PUT/PATCH/DELETE hanya boleh dikirim satu kali.
  const canRetry = method === 'GET' || method === 'HEAD';
  const maxAttempts = canRetry ? Math.max(1, retries) : 1;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers: {
          ...getAuthHeaders(),
          ...options.headers
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      let data;

      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (res.status === 401) {
        _auth('logoutCleanup') || void 0;
        currentUser = null;
        authToken = null;
        window.location.href = '/login.html';
        return data;
      }

      if (!res.ok) {
        const error = new Error(
          data.message || `HTTP ${res.status}`
        );

        error.status = res.status;
        throw error;
      }

      return data;

    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      // POST/PUT/PATCH/DELETE tidak pernah retry
      if (!canRetry) {
        break;
      }

      // Timeout tidak diulang
      if (error.name === 'AbortError') {
        break;
      }

      // Error client 4xx tidak diulang
      if (
        error.status >= 400 &&
        error.status < 500
      ) {
        break;
      }

      // Sudah mencapai percobaan terakhir
      if (attempt >= maxAttempts) {
        break;
      }

      // Retry hanya untuk GET/HEAD pada network error / server error
      await new Promise(resolve =>
        setTimeout(
          resolve,
          Math.pow(2, attempt - 1) * 500
        )
      );
    }
  }

  throw lastError;
}
// ── Global error boundary ────────────────────────────
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error);
  showNotification('Terjadi kesalahan. Silakan refresh halaman.', 'error');
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
  showNotification('Terjadi kesalahan pada aplikasi.', 'error');
});
