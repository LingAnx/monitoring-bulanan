document.addEventListener('DOMContentLoaded', async () => {
  const authenticated = await initAuth();
  if (!authenticated) return;
  try { requireRole('SUPERADMIN'); } catch (e) {
    if (e.message === 'AUTH_REQUIRED') window.location.href = '/login.html';
    else { redirectToDashboard(AuthStore.getRole()); }
    return;
  }
  initSuperadminPage('Monitoring');
  await loadMonitoring();
});

async function loadMonitoring() {
  const container = document.getElementById('monitoringContent');
  const bulan = document.getElementById('filterBulan').value;
  const tahun = document.getElementById('filterTahun').value;
  try {
    const result = await apiFetch(`/api/superadmin/monitoring?bulan=${bulan}&tahun=${tahun}`);
    const data = result.data || {};
    const sections = data.sections || [];
    const compliance = data.compliance_rate || 0;
    container.innerHTML = `
      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card blue">
          <div class="stat-value">${compliance}%</div>
          <div class="stat-label">Tingkat Kepatuhan</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${sections.reduce((s, sec) => s + sec.total_pegawai, 0)}</div>
          <div class="stat-label">Total Pegawai</div>
        </div>
        <div class="stat-card green">
          <div class="stat-value">${sections.reduce((s, sec) => s + sec.sudah_lapor, 0)}</div>
          <div class="stat-label">Sudah Lapor</div>
        </div>
        <div class="stat-card red">
          <div class="stat-value">${sections.reduce((s, sec) => s + sec.belum_lapor, 0)}</div>
          <div class="stat-label">Belum Lapor</div>
        </div>
      </div>
      ${sections.map(sec => `
        <div class="card" style="margin-bottom:16px">
          <div class="card-header">
            <h3 class="card-title">${sec.nama_seksi} — ${sec.sudah_lapor}/${sec.total_pegawai} sudah lapor</h3>
            <span class="badge ${sec.belum_lapor > 0 ? 'revision' : 'approved'}">${sec.belum_lapor} belum</span>
          </div>
          ${sec.belum_lapor > 0 ? `
            <div style="padding:0 4px">
              <div style="font-size:0.82rem;font-weight:600;color:var(--danger);margin-bottom:8px">Belum Mengajukan:</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                ${sec.belum.map(p => `<span style="background:var(--gray-100);padding:4px 10px;border-radius:6px;font-size:0.8rem;color:var(--gray-700)">${p.nama} (${p.nip || '-'})</span>`).join('')}
              </div>
            </div>
          ` : '<div style="padding:8px 4px;color:var(--success);font-size:0.9rem">&#10003; Semua pegawai sudah melaporkan</div>'}
        </div>
      `).join('')}
    `;
  } catch (err) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#9888;</div><div class="empty-state-text">Gagal memuat data monitoring.</div></div>';
  }
}
window.loadMonitoring = loadMonitoring;
