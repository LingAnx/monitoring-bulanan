// Super Admin Dashboard JavaScript
// Uses AuthStore (single source of truth)
// API_BASE defined in app.js
// Safe accessor when AuthStore may not be loaded yet

document.addEventListener('DOMContentLoaded', async () => {
  const authenticated = await initAuth();
  if (!authenticated) return;

  try {
    requireRole('SUPERADMIN');
  } catch (e) {
    if (e.message === 'AUTH_REQUIRED') {
      window.location.href = '/login.html';
    } else {
      redirectToDashboard(AuthStore.getRole());
    }
    return;
  }

  initSuperadminPage('Dashboard');

  if (window.SuperadminLayout) {
    SuperadminLayout.setUserInfo(
      currentUser?.nama,
      currentUser?.role
    );
  }

  await loadDashboard();
});

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

async function loadDashboard() {
  const main = document.getElementById('mainContent');
  if (!main) return;

  try {
    const result = await apiFetch('/api/superadmin');

    if (!result.success) {
      throw new Error(result.message || 'Gagal memuat dashboard');
    }

    const data = result.data || {};
    const users = data.users || {};
    const seksi = data.seksi || {};
    const laporan = data.laporan || {};

    main.innerHTML = `
      <div class="page-header">
        <div>
          <p class="text-muted">Ringkasan kondisi sistem</p>
          <h1>Dashboard Superadmin</h1>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${users.total_users || 0}</div>
          <div class="stat-label">Total Pengguna</div>
        </div>

        <div class="stat-card">
          <div class="stat-value">${seksi.total_seksi || 0}</div>
          <div class="stat-label">Total Seksi</div>
        </div>

        <div class="stat-card">
          <div class="stat-value">${laporan.total_bulan_berjalan || 0}</div>
          <div class="stat-label">Laporan Bulan Ini</div>
        </div>

        <div class="stat-card green">
          <div class="stat-value">${laporan.total_disetujui || 0}</div>
          <div class="stat-label">Disetujui</div>
        </div>

        <div class="stat-card yellow">
          <div class="stat-value">${laporan.menunggu_verifikasi || 0}</div>
          <div class="stat-label">Menunggu Verifikasi</div>
        </div>

        <div class="stat-card red">
          <div class="stat-value">${laporan.perlu_revisi || 0}</div>
          <div class="stat-label">Perlu Revisi</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Ringkasan Pengguna</h3>
        </div>

        <div class="stats-grid">
          <div>
            <strong>${users.total_pegawai || 0}</strong>
            <div class="text-muted">Pegawai</div>
          </div>

          <div>
            <strong>${users.total_admin_seksi || 0}</strong>
            <div class="text-muted">Admin Seksi</div>
          </div>

          <div>
            <strong>${users.total_kepala_kantor || 0}</strong>
            <div class="text-muted">Kepala Kantor</div>
          </div>

          <div>
            <strong>${laporan.pegawai_belum_lapor || 0}</strong>
            <div class="text-muted">Belum Lapor</div>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Gagal memuat dashboard Superadmin:', error);

    main.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">
          Gagal memuat data dashboard.
        </div>
      </div>
    `;
  }
}
