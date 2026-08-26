document.addEventListener('DOMContentLoaded', async () => {
  requireRole('SUPERADMIN');
  const authenticated = await initAuth();
  if (!authenticated) return;

  document.getElementById('userName').textContent = currentUser.nama;
  document.getElementById('roleBadge').textContent = roleName(currentUser.role);

  const month = new Date().getMonth() + 1;
  document.getElementById('deadlineBulan').value = month;
  document.getElementById('deadlineTahun').value = new Date().getFullYear();

  setupSidebar();

  const initialTab = new URLSearchParams(window.location.search).get('tab') || 'pending';
  if (['pending', 'history', 'deadline'].includes(initialTab)) {
    switchTab(initialTab);
  } else {
    loadPendingReports();
  }
});

function setupSidebar() {
  // Mobile menu
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const menuBtn = document.getElementById('mobileMenuBtn');
  const toggleBtn = document.getElementById('sidebarToggle');

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  }
  menuBtn.addEventListener('click', openSidebar);
  toggleBtn.addEventListener('click', openSidebar);
  overlay.addEventListener('click', closeSidebar);

  // Set active nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === 'verify');
  });
}

// ─── Tab Switching ───────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');
  ['pending', 'history', 'deadline'].forEach(t => {
    const el = document.getElementById('tab-' + t);
    el.classList.toggle('tab-content-hidden', t !== tab);
  });
  if (tab === 'pending') loadPendingReports();
  if (tab === 'history') loadVerifyHistory();
  if (tab === 'deadline') loadDeadline();
}

// ─── Pending Reports ─────────────────────────────────────────────────────────
async function loadPendingReports() {
  const container = document.getElementById('verifyContent');
  try {
    const result = await apiFetch('/api/laporan?status=diajukan');
    const reports = result.data || [];

    if (reports.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#10003;</div><div class="empty-state-text">Tidak ada laporan menunggu verifikasi.</div></div>`;
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Pegawai</th><th>Judul</th><th>Periode</th><th>Tanggal</th><th>Aksi</th></tr></thead>
        <tbody>
          ${reports.map(r => `
            <tr>
              <td>${r.user_nama}</td>
              <td>${r.judul.substring(0, 40)}${r.judul.length > 40 ? '...' : ''}</td>
              <td>${formatMonthYear(r.bulan, r.tahun)}</td>
              <td>${formatDate(r.tanggal_pengajuan)}</td>
              <td><button type="button" class="btn btn-sm btn-primary" onclick="showVerifyModal(${r.id})">Periksa</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#9888;</div><div class="empty-state-text">Gagal memuat data.</div></div>`;
  }
}

// ─── Verify Modal ────────────────────────────────────────────────────────────
window.showVerifyModal = async function(id) {
  const result = await apiFetch(`/api/laporan/${id}`);
  const r = result.data;
  if (!r) return;

  const kegiatan = r.isi_kegiatan ? JSON.parse(r.isi_kegiatan) : [];
  const lampiran = r.lampiran && r.lampiran.length > 0
    ? r.lampiran.map(f => `<li class="lampiran-row"><span class="lampiran-icon">${getFileIcon(f.filename)}</span><span class="lampiran-name">${escapeHtml(f.filename)} (${formatFileSize(f.size)})</span><a href="${API_BASE}${f.url}" target="_blank" class="lampiran-link">Unduh</a></li>`).join('')
    : '<li class="text-muted">Tidak ada lampiran</li>';

  document.getElementById('modalTitle').textContent = r.judul;
  document.getElementById('modalBody').innerHTML = `
    <div class="detail-grid">
      <div class="detail-row"><span class="detail-label">Pegawai</span><span>${r.user_nama}</span></div>
      <div class="detail-row"><span class="detail-label">NIP</span><span>${r.nip || '-'}</span></div>
      <div class="detail-row"><span class="detail-label">Seksi</span><span>${r.nama_seksi || '-'}</span></div>
      <div class="detail-row"><span class="detail-label">Periode</span><span>${formatMonthYear(r.bulan, r.tahun)}</span></div>
      <div class="detail-row"><span class="detail-label">Status</span><span><span class="badge badge-${r.status}">${statusLabel(r.status)}</span></span></div>
    </div>
    ${kegiatan.length > 0 ? `
      <h4 class="detail-section-title">Kegiatan Bulanan</h4>
      <table class="data-table">
        <thead><tr><th>No</th><th>Tanggal</th><th>Kegiatan</th></tr></thead>
        <tbody>
          ${kegiatan.map((k, i) => `<tr><td>${i + 1}</td><td>${k.tanggal}</td><td>${escapeHtml(k.kegiatan)}</td></tr>`).join('')}
        </tbody>
      </table>
    ` : ''}
    ${r.capaian ? `<h4 class="detail-section-title">Capaian</h4><p class="detail-text">${escapeHtml(r.capaian)}</p>` : ''}
    ${r.kendala ? `<h4 class="detail-section-title">Kendala</h4><p class="detail-text">${escapeHtml(r.kendala)}</p>` : ''}
    ${r.tindak_lanjut ? `<h4 class="detail-section-title">Tindak Lanjut</h4><p class="detail-text">${escapeHtml(r.tindak_lanjut)}</p>` : ''}
    ${r.rencana_bulan_depan ? `<h4 class="detail-section-title">Rencana Bulan Depan</h4><p class="detail-text">${escapeHtml(r.rencana_bulan_depan)}</p>` : ''}
    ${r.lampiran ? `
      <h4 class="detail-section-title">Lampiran</h4>
      <ul class="lampiran-list">${lampiran}</ul>
    ` : ''}
    <div class="form-group mt-3">
      <label for="verifyCatatan">Catatan Verifikasi</label>
      <textarea id="verifyCatatan" rows="3" placeholder="Tuliskan catatan atau instruksi perbaikan..."></textarea>
    </div>
  `;

  document.getElementById('modalFooter').innerHTML = `
    <button type="button" class="btn btn-danger" onclick="processVerify(${id}, 'revisi_admin')">Kembalikan untuk Revisi</button>
    <button type="button" class="btn btn-success" onclick="processVerify(${id}, 'diverifikasi')">Terima & Lanjutkan</button>
  `;

  document.getElementById('detailModal').classList.add('active');
};

window.processVerify = async function(id, status) {
  const catatan = document.getElementById('verifyCatatan').value.trim();
  try {
    const result = await apiFetch(`/api/laporan/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify({ status, catatan })
    });
    if (result.success) {
      showNotification(status === 'diverifikasi' ? 'Laporan berhasil diverifikasi!' : 'Laporan dikembalikan untuk revisi.', 'success');
      closeModal();
      loadPendingReports();
    }
  } catch {
    showNotification('Gagal memverifikasi laporan', 'error');
  }
};

// ─── Verification History ────────────────────────────────────────────────────
async function loadVerifyHistory() {
  const container = document.getElementById('historyContent');
  try {
    const result = await apiFetch('/api/laporan');
    const reports = result.data || [];
    const historyEntries = [];

    for (const r of reports) {
      try {
        const vResult = await apiFetch(`/api/laporan/${r.id}/verifikasi-history`);
        if (vResult.success && vResult.data.length > 0) {
          historyEntries.push(...vResult.data.map(v => ({ ...v, laporan_judul: r.judul, laporan_bulan: r.bulan, laporan_tahun: r.tahun, pegawai_nama: r.user_nama })));
        }
      } catch { /* ignore individual errors */ }
    }

    historyEntries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (historyEntries.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#10003;</div><div class="empty-state-text">Belum ada riwayat verifikasi.</div></div>`;
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Pegawai</th><th>Judul Laporan</th><th>Periode</th><th>Status</th><th>Catatan</th><th>Tanggal</th></tr></thead>
        <tbody>
          ${historyEntries.map(v => `
            <tr>
              <td>${v.pegawai_nama}</td>
              <td>${v.laporan_judul.substring(0, 35)}${v.laporan_judul.length > 35 ? '...' : ''}</td>
              <td>${formatMonthYear(v.laporan_bulan, v.laporan_tahun)}</td>
              <td><span class="badge badge-${v.status === 'diverifikasi' ? 'diverifikasi' : 'revisi_admin'}">${statusLabel(v.status)}</span></td>
              <td>${escapeHtml(v.catatan || '-')}</td>
              <td>${formatDate(v.created_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#9888;</div><div class="empty-state-text">Gagal memuat riwayat.</div></div>`;
  }
}

// ─── Deadline Monitoring ─────────────────────────────────────────────────────
async function loadDeadline() {
  const bulan = document.getElementById('deadlineBulan').value;
  const tahun = document.getElementById('deadlineTahun').value;
  const container = document.getElementById('deadlineContent');

  try {
    const result = await apiFetch(`/api/pegawai/deadline?bulan=${bulan}&tahun=${tahun}`);
    const data = result.data || [];

    if (data.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#128196;</div><div class="empty-state-text">Tidak ada data pegawai.</div></div>`;
      return;
    }

    const sudah = data.filter(p => p.sudah_lapor).length;
    const belum = data.length - sudah;

    container.innerHTML = `
      <div class="deadline-summary">
        <div class="deadline-stat">
          <div class="deadline-stat-value">${sudah}</div>
          <div class="deadline-stat-label">Sudah Mengirim</div>
        </div>
        <div class="deadline-stat">
          <div class="deadline-stat-value">${belum}</div>
          <div class="deadline-stat-label">Belum Mengirim</div>
        </div>
        <div class="deadline-stat">
          <div class="deadline-stat-value">${data.length}</div>
          <div class="deadline-stat-label">Total Pegawai</div>
        </div>
      </div>
      <table class="data-table">
        <thead><tr><th>Nama</th><th>NIP</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>
          ${data.map(p => `
            <tr>
              <td>${p.nama}</td>
              <td>${p.nip || '-'}</td>
              <td>${p.sudah_lapor
                ? '<span class="badge badge-diverifikasi">Sudah Lapor</span>'
                : '<span class="badge badge-revisi_admin">Belum Lapor</span>'}</td>
              <td><a href="/superadmin/verifikasi.html?tab=history" class="btn btn-sm btn-outline">Lihat Laporan</a></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#9888;</div><div class="empty-state-text">Gagal memuat data deadline.</div></div>`;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📄';
  if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return '🖼️';
  return '📎';
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


window.closeModal = function() {
  document.getElementById('detailModal').classList.remove('active');
};

document.getElementById('detailModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

