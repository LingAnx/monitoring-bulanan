document.addEventListener('DOMContentLoaded', async () => {
  const authenticated = await initAuth();
  if (!authenticated) return;
  try { requireRole('SUPERADMIN'); } catch (e) {
    if (e.message === 'AUTH_REQUIRED') window.location.href = '/login.html';
    else { redirectToDashboard(AuthStore.getRole()); }
    return;
  }
  initSuperadminPage('Semua Laporan');
  await loadSeksiOptions();
  await loadLaporan();
  document.getElementById('filterBulan').addEventListener('change', loadLaporan);
  document.getElementById('filterTahun').addEventListener('change', loadLaporan);
  document.getElementById('filterStatus').addEventListener('change', loadLaporan);
  document.getElementById('filterSeksi').addEventListener('change', loadLaporan);
});

async function loadSeksiOptions() {
  const result = await apiFetch('/api/seksi');
  const sel = document.getElementById('filterSeksi');
  result.data.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id; opt.textContent = s.nama_seksi;
    sel.appendChild(opt);
  });
}

const STATUS_LABEL = {
  draft: 'Draft', diajukan: 'Diajukan', diteruskan: 'Diteruskan',
  revisi_admin: 'Revisi Admin', revisi_kantor: 'Revisi Kantor', disetujui: 'Disetujui'
};

const STATUS_BADGE = {
  draft: 'draft', diajukan: 'diajukan', diteruskan: 'diteruskan',
  revisi_admin: 'revision', revisi_kantor: 'revision', disetujui: 'approved'
};

async function loadLaporan() {
  const container = document.getElementById('laporanContent');
  const bulan = document.getElementById('filterBulan').value;
  const tahun = document.getElementById('filterTahun').value;
  const status = document.getElementById('filterStatus').value;
  const id_seksi = document.getElementById('filterSeksi').value;

  let url = '/api/laporan?limit=100';
  const params = [];
  if (bulan) params.push(`bulan=${bulan}`);
  if (tahun) params.push(`tahun=${tahun}`);
  if (status) params.push(`status=${status}`);
  if (id_seksi) params.push(`id_seksi=${id_seksi}`);
  if (params.length) url += '&' + params.join('&');

  try {
    const result = await apiFetch(url);
    const reports = result.data || [];
    if (reports.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128196;</div><div class="empty-state-text">Tidak ada laporan ditemukan.</div></div>';
      return;
    }
    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Pegawai</th><th>Judul</th><th>Seksi</th><th>Periode</th><th>Status</th><th>Tgl Pengajuan</th></tr></thead>
        <tbody>
          ${reports.map(r => `
            <tr>
              <td>${r.user_nama || '-'}</td>
              <td>${r.judul || '-'}</td>
              <td>${r.nama_seksi || '-'}</td>
              <td>${r.bulan ? (T && T.months ? T.months[r.bulan] : r.bulan) + ' ' + r.tahun : '-'}</td>
              <td><span class="badge badge-${STATUS_BADGE[r.status] || 'draft'}">${STATUS_LABEL[r.status] || r.status}</span></td>
              <td>${r.tanggal_pengajuan ? formatDate(r.tanggal_pengajuan) : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#9888;</div><div class="empty-state-text">Gagal memuat data.</div></div>';
  }
}
