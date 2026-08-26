// approve.js - Approval & Monitoring for Kepala Kantor
document.addEventListener('DOMContentLoaded', async () => {
  requireRole('KEPALA_KANTOR');
  const authenticated = await initAuth();
  if (!authenticated) return;

  if (!isKepala()) {
    window.location.href = '/head-office/dashboard.html';
    return;
  }

  initHeadOfficePage('Persetujuan');
  HeadOfficeLayout.setUserInfo(currentUser?.nama, currentUser?.role);
  HeadOfficeLayout.setGreeting();
  loadNotifBadge();

  // Parse URL params for initial tab
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab') || 'pending';
  const show = params.get('show');

  // Set active tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  ['pending', 'reports', 'history', 'archive', 'monitoring'].forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.classList.toggle('tab-content-hidden', t !== tab);
  });

  if (tab === 'pending') loadPendingApprovals();
  if (tab === 'reports') loadAllReports();
  if (tab === 'history') loadHistory();
  if (tab === 'archive') loadArchive();
  if (tab === 'monitoring') loadMonitoring();
});

// ─── Tab Switching ───────────────────────────────────────────────────────────
window.switchTab = function(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');
  ['pending', 'reports', 'history', 'archive', 'monitoring'].forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.classList.toggle('tab-content-hidden', t !== tab);
  });
  if (tab === 'reports') loadAllReports();
  if (tab === 'history') loadHistory();
  if (tab === 'archive') loadArchive();
  if (tab === 'monitoring') loadMonitoring();
};

// ─── Pending Approvals ───────────────────────────────────────────────────────
window.loadPendingApprovals = async function() {
  const container = document.getElementById('approveContent');
  if (!container) return;

  const bulan = parseInt(document.getElementById('filterPendingBulan')?.value) || new Date().getMonth() + 1;
  const tahun = parseInt(document.getElementById('filterPendingTahun')?.value) || new Date().getFullYear();

  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Memuat...</p></div>';

  try {
    const result = await apiFetch(`/api/kepala/reports/pending?bulan=${bulan}&tahun=${tahun}`);
    const reports = result.data || [];

    if (reports.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎉</div>
          <div class="empty-state-text">Tidak ada laporan yang menunggu persetujuan.</div>
          <div class="empty-state-desc">Semua laporan yang telah diverifikasi Admin Seksi sudah selesai ditinjau.</div>
        </div>`;
      return;
    }

    container.innerHTML = reports.map(r => `
      <div class="pending-item">
        <div class="pending-avatar">${getInitials(r.nama)}</div>
        <div class="pending-info">
          <div class="pending-name">${escapeHtml(r.nama)}</div>
          <div class="pending-meta">
            <span>${escapeHtml(r.nama_seksi || '-')}</span>
            <span class="meta-sep">•</span>
            <span>${formatMonthYear(r.bulan, r.tahun)}</span>
          </div>
          ${r.catatan_admin ? `<div class="pending-admin">Catatan Admin: "${escapeHtml(r.catatan_admin.substring(0, 50))}${r.catatan_admin.length > 50 ? '...' : ''}"</div>` : ''}
        </div>
        <div class="pending-time">
          <small>Diverifikasi: ${formatDate(r.tanggal_verifikasi)}</small>
          <br><span class="status-badge-simple status-diteruskan">Menunggu Persetujuan</span>
        </div>
        <div class="pending-actions">
          <button type="button" class="btn btn-sm btn-outline" onclick="viewReportDetail(${r.id})">Lihat</button>
          <button type="button" class="btn btn-sm btn-primary" onclick="showApproveModal(${r.id})">Tinjau →</button>
        </div>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Gagal memuat data.</div></div>';
  }
};

// ─── All Reports ──────────────────────────────────────────────────────────────
window.loadAllReports = async function() {
  const container = document.getElementById('reportsContent');
  if (!container) return;

  const params = new URLSearchParams();
  const status = document.getElementById('filterStatus')?.value || '';
  const bulan = document.getElementById('filterBulanRep')?.value || '';
  const tahun = document.getElementById('filterTahunRep')?.value || '';
  const search = document.getElementById('searchReport')?.value.trim() || '';
  if (status) params.append('status', status);
  if (bulan) params.append('bulan', bulan);
  if (tahun) params.append('tahun', tahun);
  if (search) params.append('search', search);

  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Memuat...</p></div>';

  try {
    const result = await apiFetch(`/api/kepala/reports?${params.toString()}`);
    const reports = result.data || [];

    if (reports.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📄</div><div class="empty-state-text">Tidak ada laporan ditemukan.</div></div>';
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>No</th><th>Pegawai</th><th>Seksi</th><th>Judul</th><th>Periode</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>
          ${reports.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(r.user_nama)}</td>
              <td>${escapeHtml(r.nama_seksi || '-')}</td>
              <td>${escapeHtml(r.judul.substring(0, 40))}${r.judul.length > 40 ? '...' : ''}</td>
              <td>${formatMonthYear(r.bulan, r.tahun)}</td>
              <td><span class="badge badge-${r.status}">${statusLabel(r.status)}</span></td>
              <td><button type="button" class="btn btn-sm btn-outline" onclick="viewReportDetail(${r.id})">Detail</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  } catch {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Gagal memuat data.</div></div>';
  }
};

// ─── History ──────────────────────────────────────────────────────────────────
window.loadHistory = async function() {
  const container = document.getElementById('historyContent');
  if (!container) return;

  const params = new URLSearchParams();
  const status = document.getElementById('filterHisStatus')?.value || '';
  if (status) params.append('status', status);

  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Memuat...</p></div>';

  try {
    const result = await apiFetch(`/api/kepala/history?${params.toString()}`);
    const records = result.data || [];

    if (records.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✓</div><div class="empty-state-text">Belum ada riwayat persetujuan.</div></div>';
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Pegawai</th><th>Seksi</th><th>Judul</th><th>Periode</th><th>Status</th><th>Catatan</th><th>Tanggal</th></tr></thead>
        <tbody>
          ${records.map(r => `
            <tr>
              <td>${escapeHtml(r.pegawai_nama)}</td>
              <td>${escapeHtml(r.nama_seksi || '-')}</td>
              <td>${escapeHtml(r.judul.substring(0, 35))}${r.judul.length > 35 ? '...' : ''}</td>
              <td>${formatMonthYear(r.bulan, r.tahun)}</td>
              <td><span class="badge badge-${r.status === 'disetujui' ? 'disetujui' : 'revisi_kantor'}">${r.status === 'disetujui' ? 'Disetujui' : 'Revisi'}</span></td>
              <td>${escapeHtml(r.catatan || '-')}</td>
              <td>${formatDate(r.created_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  } catch {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Gagal memuat riwayat.</div></div>';
  }
};

// ─── Archive ──────────────────────────────────────────────────────────────────
window.loadArchive = async function() {
  const container = document.getElementById('archiveContent');
  if (!container) return;

  const params = new URLSearchParams();
  const bulan = document.getElementById('filterArchiveBulan')?.value || '';
  const tahun = document.getElementById('filterArchiveTahun')?.value || '';
  const search = document.getElementById('searchArchive')?.value.trim() || '';
  if (bulan) params.append('bulan', bulan);
  if (tahun) params.append('tahun', tahun);
  if (search) params.append('search', search);

  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Memuat...</p></div>';

  try {
    const result = await apiFetch(`/api/kepala/archive?${params.toString()}`);
    const reports = result.data || [];

    if (reports.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📁</div><div class="empty-state-text">Tidak ada arsip laporan.</div></div>';
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>No</th><th>Pegawai</th><th>Seksi</th><th>Judul</th><th>Periode</th><th>Tgl Persetujuan</th></tr></thead>
        <tbody>
          ${reports.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(r.user_nama)}</td>
              <td>${escapeHtml(r.nama_seksi || '-')}</td>
              <td>${escapeHtml(r.judul.substring(0, 40))}${r.judul.length > 40 ? '...' : ''}</td>
              <td>${formatMonthYear(r.bulan, r.tahun)}</td>
              <td>${formatDate(r.tanggal_persetujuan)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  } catch {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Gagal memuat arsip.</div></div>';
  }
};

// ─── Monitoring ───────────────────────────────────────────────────────────────
window.loadMonitoring = async function() {
  const container = document.getElementById('monitoringContent');
  if (!container) return;

  const bulan = parseInt(document.getElementById('monBulan')?.value) || new Date().getMonth() + 1;
  const tahun = parseInt(document.getElementById('monTahun')?.value) || new Date().getFullYear();

  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Memuat...</p></div>';

  try {
    const result = await apiFetch(`/api/kepala/sections?bulan=${bulan}&tahun=${tahun}`);
    const sections = result.data || [];

    if (sections.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">Belum ada data seksi.</div></div>';
      return;
    }

    let totalPegawai = 0, totalSubmitted = 0;
    let html = `<div class="deadline-summary" style="margin-bottom:20px">`;
    sections.forEach(s => {
      totalPegawai += s.total_pegawai || 0;
      totalSubmitted += s.submitted || 0;
    });
    const pct = totalPegawai > 0 ? Math.round((totalSubmitted / totalPegawai) * 100) : 0;
    html += `
      <div class="deadline-stat"><div class="deadline-stat-value">${totalPegawai}</div><div class="deadline-stat-label">Total Pegawai</div></div>
      <div class="deadline-stat"><div class="deadline-stat-value green">${totalSubmitted}</div><div class="deadline-stat-label">Sudah Lapor</div></div>
      <div class="deadline-stat"><div class="deadline-stat-value red">${totalPegawai - totalSubmitted}</div><div class="deadline-stat-label">Belum Lapor</div></div>
      <div class="deadline-stat"><div class="deadline-stat-value">${pct}%</div><div class="deadline-stat-label">Capaian</div></div>
    `;
    html += '</div>';

    sections.forEach(s => {
      const secPct = s.total_pegawai > 0 ? Math.round((s.submitted / s.total_pegawai) * 100) : 0;
      html += `
        <div class="seksi-block">
          <div class="seksi-block-header">
            <span class="seksi-block-name">${escapeHtml(s.nama_seksi)}</span>
            <span class="seksi-block-count">${s.submitted}/${s.total_pegawai} • ${secPct}%</span>
          </div>
          <div class="progress-bar-wrap" style="margin-bottom:8px">
            <div class="progress-bar" style="width:${secPct}%"></div>
          </div>
          <div style="display:flex;gap:16px;font-size:0.78rem;color:var(--gray-500)">
            <span>✓ Disetujui: ${s.approved || 0}</span>
            <span>⏳ Menunggu Persetujuan: ${s.pending_approval || 0}</span>
            <span>📋 Menunggu Verifikasi: ${s.pending_verification || 0}</span>
            <span>⚠️ Revisi: ${s.revision || 0}</span>
            <span>✗ Belum: ${s.not_submitted || 0}</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Gagal memuat data monitoring.</div></div>';
  }
};

// ─── Report Detail Modal ─────────────────────────────────────────────────────
window.viewReportDetail = async function(id) {
  const result = await apiFetch(`/api/laporan/${id}`);
  const r = result.data;
  if (!r) return;

  const status = r.status;

  const kegiatan = r.isi_kegiatan ? JSON.parse(r.isi_kegiatan) : [];

  const lampiran = r.lampiran && r.lampiran.length > 0
    ? r.lampiran.map(f => `
        <li class="lampiran-row">
          <span class="lampiran-icon">${getFileIcon(f.filename)}</span>
          <span class="lampiran-name">
            ${escapeHtml(f.filename)} (${formatFileSize(f.size)})
          </span>
          <a href="${API_BASE}${f.url}" target="_blank" class="lampiran-link">
            Unduh
          </a>
        </li>
      `).join('')
    : '<li class="text-muted">Tidak ada lampiran</li>';

  const verifikasiHistory = await apiFetch(
    `/api/laporan/${id}/verifikasi-history`
  );

  const historyRows =
    (verifikasiHistory.success && verifikasiHistory.data.length > 0)
      ? verifikasiHistory.data.map(v => `
          <div class="history-item">
            <span class="history-badge">${statusLabel(v.status)}</span>
            <span class="history-admin">${escapeHtml(v.admin_nama || '-')}</span>
            <span class="history-catatan">${escapeHtml(v.catatan || '-')}</span>
            <span class="history-date">${formatDate(v.created_at)}</span>
          </div>
        `).join('')
      : '<p class="text-muted">Belum ada catatan verifikasi.</p>';

  // Workflow steps based on status
  const steps = [
    { num: 1, label: 'Draft', done: true, current: status === 'draft' },
    { num: 2, label: 'Diajukan', done: ['diajukan','diteruskan','disetujui','revisi_kantor'].includes(status), current: status === 'diajukan' },
    { num: 3, label: 'Verifikasi Admin', done: ['diteruskan','disetujui','revisi_kantor'].includes(status), current: status === 'diteruskan' },
    { num: 4, label: 'Persetujuan Kepala', done: ['disetujui','revisi_kantor'].includes(status), current: status === 'diteruskan' },
    { num: 5, label: 'Final', done: status === 'disetujui', current: false }
  ];

  const canAct = status === 'diteruskan';

  document.getElementById('modalTitle').textContent = r.judul;
  document.getElementById('modalBody').innerHTML = `
    <div class="workflow-steps">
      ${steps.map(s => `
        <div class="wf-step ${s.done ? 'wf-done' : ''} ${s.current ? 'wf-current' : ''}">
          <span class="wf-num">${s.done ? '✓' : s.num}</span>
          <span class="wf-label">${s.label}</span>
        </div>
      `).join('')}
    </div>

    <div class="detail-grid">
      <div class="detail-row"><span class="detail-label">Pegawai</span><span>${escapeHtml(r.user_nama)}</span></div>
      <div class="detail-row"><span class="detail-label">NIP</span><span>${r.nip || '-'}</span></div>
      <div class="detail-row"><span class="detail-label">Seksi</span><span>${escapeHtml(r.nama_seksi || '-')}</span></div>
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
    ${r.rencana_bulan_depan ? `<h4 class="detail-section-title">Rencana Bulan Berikutnya</h4><p class="detail-text">${escapeHtml(r.rencana_bulan_depan)}</p>` : ''}
    ${r.lampiran ? `<h4 class="detail-section-title">Lampiran</h4><ul class="lampiran-list">${lampiran}</ul>` : ''}
    ${r.catatan_admin ? `<div class="catatan-section"><strong>Catatan Admin Seksi:</strong> <span>${escapeHtml(r.catatan_admin)}</span></div>` : ''}
    ${r.catatan_kantor ? `<div class="catatan-section" style="background:#dbeafe;border-color:#93c5fd;"><strong>Catatan Kepala Kantor:</strong> <span>${escapeHtml(r.catatan_kantor)}</span></div>` : ''}
    <div class="history-section">
      <h4 class="detail-section-title">Riwayat Verifikasi</h4>
      ${historyRows}
    </div>
    ${canAct ? `
      <div class="form-group mt-3">
        <label for="headOfficeNote">Catatan Kepala Kantor</label>
        <textarea id="headOfficeNote" rows="3" placeholder="Tuliskan catatan atau arahan untuk laporan ini..."></textarea>
      </div>
    ` : ''}
  `;

  if (canAct) {
    document.getElementById('modalFooter').innerHTML = `
      <button type="button" class="btn btn-danger" onclick="processApproval(${r.id}, 'revisi_kantor')">Minta Revisi</button>
      <button type="button" class="btn btn-success" onclick="processApproval(${r.id}, 'disetujui')">Setujui Laporan</button>
    `;
  } else {
    document.getElementById('modalFooter').innerHTML = '<button type="button" class="btn btn-outline" onclick="closeModal()">Tutup</button>';
  }

  document.getElementById('detailModal').classList.add('active');
};

window.showApproveModal = function(id) {
  viewReportDetail(id);
};

// ─── Approval Processing ─────────────────────────────────────────────────────
let confirmCallback = null;

window.processApproval = async function(id, status) {
  const catatan = document.getElementById('headOfficeNote')?.value.trim() || '';
  if (status === 'revisi_kantor' && !catatan) {
    showNotification('Catatan revisi wajib diisi', 'error');
    return;
  }

  const title = status === 'disetujui' ? 'Setujui Laporan' : 'Minta Revisi';
  const msg = status === 'disetujui'
    ? 'Apakah Anda yakin ingin menyetujui laporan ini? Setelah disetujui, laporan akan masuk ke proses finalisasi.'
    : 'Tuliskan alasan revisi di kotak catatan di atas.';

  showConfirmModal(title, msg, async () => {
    try {
      const result = await apiFetch(`/api/laporan/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ status, catatan })
      }); 
      if (result.success) {
        showNotification(
          status === 'disetujui' ? 'Laporan berhasil disetujui!' : 'Permintaan revisi dikirim.',
          'success'
        );
        closeModal();
        loadPendingApprovals();
      } else {
        showNotification(result.message || 'Gagal memproses', 'error');
      }
    } catch {
      showNotification('Gagal memproses persetujuan', 'error');
    }
  });
};

window.closeModal = function() {
  document.getElementById('detailModal')?.classList.remove('active');
};

function showConfirmModal(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmExtra').innerHTML = '';

  confirmCallback = onConfirm;

  const btn = document.getElementById('confirmActionBtn');

  btn.onclick = () => {
    const callback = confirmCallback;

    closeConfirmModal();

    if (callback) {
      callback();
    }
  };

  document.getElementById('confirmModal').classList.add('active');
}

window.closeConfirmModal = function() {
  document.getElementById('confirmModal')?.classList.remove('active');
  confirmCallback = null;
};

// ─── Notification Badge ──────────────────────────────────────────────────────
async function loadNotifBadge() {
  try {
    const notif = await apiFetch('/api/notifications/unread-count');
    const count = notif?.data?.count || 0;
    HeadOfficeLayout.setNotifBadge(count);
  } catch (e) { /* ignore */ }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📄';
  if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return '🖼️';
  return '📎';
}

// ─── Close modals on overlay click ───────────────────────────────────────────
document.addEventListener('click', (e) => {
  if (e.target.id === 'detailModal') closeModal();
  if (e.target.id === 'confirmModal') closeConfirmModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeConfirmModal();
  }
});
