// ══════════════════════════════════════════════════
// REKAP LAPORAN - Shared Layout Version
// Uses admin-section-layout.js for sidebar/topbar
// ══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  requireRole(['ADMIN_SEKSI', 'KEPALA_KANTOR']);
  const authenticated = await initAuth();
  if (!authenticated) return;

  if (!isAdminSeksi() && !isKepala()) {
    window.location.href = '/admin-section/dashboard.html';
    return;
  }

  initAdminSectionPage('Rekap Laporan');
  await loadStats();
  await loadRekap();
});

async function loadStats() {
  const stats = await apiFetch('/api/rekap/summary');
  const s = stats.data;
  const grid = document.getElementById('statsGrid');

  if (isKepala()) {
    grid.innerHTML = `
      <div class="stat-card"><div class="stat-value">${s.totalPegawai || 0}</div><div class="stat-label">Total Pegawai</div></div>
      <div class="stat-card"><div class="stat-value">${s.totalLaporan || 0}</div><div class="stat-label">Total Laporan</div></div>
      <div class="stat-card yellow"><div class="stat-value">${s.byStatus?.diteruskan || 0}</div><div class="stat-label">Menunggu Persetujuan</div></div>
      <div class="stat-card green"><div class="stat-value">${s.byStatus?.disetujui || 0}</div><div class="stat-label">Disetujui</div></div>
    `;
  } else if (isAdminSeksi()) {
    grid.innerHTML = `
      <div class="stat-card"><div class="stat-value">${s.total || 0}</div><div class="stat-label">Total Laporan</div></div>
      <div class="stat-card yellow"><div class="stat-value">${s.byStatus?.diajukan || 0}</div><div class="stat-label">Menunggu</div></div>
      <div class="stat-card green"><div class="stat-value">${s.byStatus?.diteruskan || 0}</div><div class="stat-label">Diverifikasi</div></div>
      <div class="stat-card red"><div class="stat-value">${s.byStatus?.revisi_admin || 0}</div><div class="stat-label">Perlu Revisi</div></div>
    `;
  }
}

async function loadRekap() {
  const bulan = document.getElementById('filterBulan').value;
  const tahun = document.getElementById('filterTahun').value;
  const params = new URLSearchParams();
  if (bulan) params.append('bulan', bulan);
  if (tahun) params.append('tahun', tahun);

  const container = document.getElementById('rekapContent');
  try {
    const result = await apiFetch('/api/laporan?' + params.toString());
    const reports = result.data || [];

    if (reports.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#128196;</div><div class="empty-state-text">Tidak ada laporan pada periode tersebut.</div></div>`;
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Judul</th>
            <th>Pegawai</th>
            <th>Seksi</th>
            <th>Periode</th>
            <th>Status</th>
            <th>Tanggal</th>
          </tr>
        </thead>
        <tbody>
          ${reports.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${r.judul}</td>
              <td>${r.user_nama}</td>
              <td>${r.nama_seksi || '-'}</td>
              <td>${formatMonthYear(r.bulan, r.tahun)}</td>
              <td><span class="badge badge-${r.status}">${statusLabel(r.status)}</span></td>
              <td>${formatDate(r.tanggal_pengajuan)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#9888;</div><div class="empty-state-text">Gagal memuat data.</div></div>`;
  }
}

window.exportCSV = function(e) {
  e.preventDefault();
  const bulan = document.getElementById('filterBulan').value;
  const tahun = document.getElementById('filterTahun').value;
  const params = new URLSearchParams();
  if (bulan) params.append('bulan', bulan);
  if (tahun) params.append('tahun', tahun);

  const url = `${API_BASE}/api/rekap/export?${params.toString()}`;
  fetch(url, { headers: { 'Authorization': `Bearer ${authToken}` } })
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'rekap_laporan.csv';
      a.click();
    })
    .catch(() => showNotification('Gagal export', 'error'));
};
