// Super Admin Dashboard JavaScript
// Uses global apiFetch from app.js — no duplicate implementation

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
    SuperadminLayout.setUserInfo(currentUser?.nama, currentUser?.role);
  }

  await loadDashboard();
});

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
        <div class="stat-card blue">
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
        <div class="stat-card orange">
          <div class="stat-value">${laporan.menunggu_persetujuan || 0}</div>
          <div class="stat-label">Menunggu Persetujuan</div>
        </div>
        <div class="stat-card red">
          <div class="stat-value">${laporan.perlu_revisi || 0}</div>
          <div class="stat-label">Perlu Revisi</div>
        </div>
        <div class="stat-card purple">
          <div class="stat-value">${laporan.pegawai_belum_lapor || 0}</div>
          <div class="stat-label">Belum Lapor</div>
        </div>
      </div>

      <div class="charts-row">
        <div class="card chart-card">
          <div class="card-header">
            <h3 class="card-title">Distribusi Status Laporan</h3>
          </div>
          <div class="chart-container">
            <canvas id="chartStatus"></canvas>
          </div>
        </div>
        <div class="card chart-card">
          <div class="card-header">
            <h3 class="card-title">Laporan per Seksi</h3>
          </div>
          <div class="chart-container">
            <canvas id="chartSeksi"></canvas>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Tren Laporan Bulanan (6 bulan terakhir)</h3>
        </div>
        <div class="chart-container" style="height:200px">
          <canvas id="chartTrend"></canvas>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Ringkasan Pengguna</h3>
        </div>
        <div class="stats-grid">
          <div><strong>${users.total_pegawai || 0}</strong><div class="text-muted">Pegawai</div></div>
          <div><strong>${users.total_admin_seksi || 0}</strong><div class="text-muted">Admin Seksi</div></div>
          <div><strong>${users.total_kepala_kantor || 0}</strong><div class="text-muted">Kepala Kantor</div></div>
          <div><strong>${laporan.pegawai_belum_lapor || 0}</strong><div class="text-muted">Belum Lapor Bulan Ini</div></div>
        </div>
      </div>
    `;

    if (typeof Chart !== 'undefined') {
      renderCharts(laporan);
    } else {
      console.error('Chart.js tidak tersedia. Grafik tidak dapat dirender.');
    }
    
      } catch (error) {
        console.error('Gagal memuat dashboard Superadmin:', error);
    
        main.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <div class="empty-state-text">Gagal memuat data dashboard.</div>
          </div>
        `;
      }
    } 

function renderCharts(laporan) {
  // Destroy existing charts to prevent duplication
  ['chartStatus', 'chartSeksi', 'chartTrend'].forEach(function(id) {
    var c = document.getElementById(id);
    if (c && c.chart) c.chart.destroy();
  });

  // Chart 1: Status Distribution (donut)
  var statusCtx = document.getElementById('chartStatus');
  if (statusCtx) {
    var statusData = laporan.status_distribution || [];
    var statusLabels = [], statusCounts = [];
    var statusColorMap = {
      draft: '#94a3b8', diajukan: '#f59e0b', diteruskan: '#3b82f6',
      revisi_admin: '#ef4444', revisi_kantor: '#dc2626', disetujui: '#10b981'
    };
    statusData.forEach(function(s) {
      statusLabels.push(s.status);
      statusCounts.push(parseInt(s.jumlah));
    });
    statusCtx.chart = new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels: statusLabels,
        datasets: [{
          data: statusCounts,
          backgroundColor: statusLabels.map(function(l) { return statusColorMap[l] || '#64748b'; }),
          borderWidth: 2, borderColor: '#fff'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { font: { size: 12 } } } }
      }
    });
  }

  // Chart 2: Reports per Section (bar)
  var seksiCtx = document.getElementById('chartSeksi');
  if (seksiCtx) {
    var seksiData = laporan.per_seksi || [];
    var seksiLabels = [], seksiCounts = [];
    seksiData.forEach(function(s) {
      seksiLabels.push(s.nama_seksi || 'Tanpa Seksi');
      seksiCounts.push(parseInt(s.jumlah));
    });
    seksiCtx.chart = new Chart(seksiCtx, {
      type: 'bar',
      data: {
        labels: seksiLabels,
        datasets: [{
          label: 'Jumlah Laporan',
          data: seksiCounts,
          backgroundColor: '#3b82f6',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  // Chart 3: Monthly Trend (line) — uses bulan+tahun from laporan
  var trendCtx = document.getElementById('chartTrend');
  if (trendCtx) {
    var trendData = laporan.per_bulan_tahun || [];
    var trendLabels = [], trendCounts = [];
    trendData.forEach(function(p) {
      var label =
      (typeof T !== 'undefined' && T.months && T.months[p.bulan])
        ? T.months[p.bulan] + ' ' + p.tahun
        : p.bulan + '/' + p.tahun; 
      trendLabels.push(label);
      trendCounts.push(parseInt(p.jumlah));
    });
    trendCtx.chart = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: trendLabels,
        datasets: [{
          label: 'Laporan Dibuat',
          data: trendCounts,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.1)',
          fill: true, tension: 0.3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }
}
