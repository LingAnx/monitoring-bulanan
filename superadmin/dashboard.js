// Super Admin Dashboard JavaScript
// Uses AuthStore (single source of truth)
// API_BASE defined in app.js
// Safe accessor when AuthStore may not be loaded yet
function _auth(name, val) {
  try {
    if (name === 'ROLES') return typeof AuthStore !== 'undefined' ? AuthStore.ROLES : {};
    return (typeof AuthStore !== 'undefined' && AuthStore[name]) ? AuthStore[name](val) : undefined;
  } catch (e) { return undefined; }
}


let chartPerSeksi = null;
let chartPerBulan = null;
let chartStatus = null;
let usersCache = null;
let seksiCache = null;
let periodeCache = null;

async function initAuth() {
  const token = _auth('getToken');
  if (!token) {
    window.location.href = '/login.html';
    return false;
  }
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success) {
      _auth('logoutCleanup');
      window.location.href = '/login.html';
      return false;
    }
    // Normalize role from DB format (admin_seksi) to canonical (ADMIN_SEKSI)
    const normalizedUser = { ...data.user, role: (_auth('ROLES') || {})[data.user.role] || data.user.role };
    _auth('setCurrentUser', normalizedUser);
    _auth('setToken', token);
    currentUser = _auth('getCurrentUser') || currentUser;
    authToken   = _auth('getToken');
    return true;
  } catch {
    _auth('logoutCleanup');
    window.location.href = '/login.html';
    return false;
  }
}

function clearAuth() {
  _auth('logoutCleanup');
}

function getAuthHeaders() {
  const token = _auth('getToken');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
}

function isAdmin() { return currentUser && currentUser.role === 'SUPERADMIN'; }

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
  const months = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return `${months[bulan]} ${tahun}`;
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

async function apiFetch(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers: { ...getAuthHeaders(), ...options.headers } });
  const data = await res.json();
  if (res.status === 401) {
    _auth('logoutCleanup');
    window.location.href = '/login.html';
  }
  return data;
}
