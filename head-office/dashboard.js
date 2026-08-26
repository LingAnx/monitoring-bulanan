// dashboard-kepala.js - Dashboard for Kepala Kantor role
document.addEventListener('DOMContentLoaded', async () => {
  requireRole('KEPALA_KANTOR');
  const authenticated = await initAuth();
  if (!authenticated) return;

  if (!isKepala()) {
    window.location.href = '/head-office/dashboard.html';
    return;
  }

  initHeadOfficePage('Dashboard');
  HeadOfficeLayout.setUserInfo(currentUser?.nama, currentUser?.role);
  HeadOfficeLayout.setGreeting();
  HeadOfficeLayout.setUserInfo(currentUser?.nama, currentUser?.role);
  await loadDashboardData();
  loadNotifBadge();
});

let currentDashboardData = null;

async function loadDashboardData() {
  const skeleton = document.getElementById('skeletonLoading');
  const content = document.getElementById('dashboardContent');
  if (skeleton) skeleton.classList.remove('hidden');
  if (content) content.classList.add('dashboard-content-hidden');

  try {
    const bulan = parseInt(document.getElementById('chartFilterBulan')?.value) || new Date().getMonth() + 1;
    const tahun = parseInt(document.getElementById('chartFilterTahun')?.value) || new Date().getFullYear();

    const result = await apiFetch(`/api/kepala/dashboard?bulan=${bulan}&tahun=${tahun}`);
    if (!result.success) throw new Error(result.message);

    currentDashboardData = result.data;
    renderDashboard(currentDashboardData);
  } catch (error) {
    console.error('Failed to load dashboard:', error);
    showNotification('Gagal memuat dashboard', 'error');
  } finally {
    if (skeleton) skeleton.classList.add('hidden');
    if (content) content.classList.remove('dashboard-content-hidden');
  }
}

function renderDashboard(data) {
  renderHero(data);
  renderStats(data.summaryCounts);
  renderAlerts(data.priorityAlerts, data.activePeriod);
  renderPendingApprovals(data.pendingReports);
  renderOfficeProgress(data.officeProgress);
  renderSectionMonitoring(data.sections);
  renderStatusChart(data.statusDistribution);
  renderQuickActions(data.summaryCounts);
  renderApprovalHistory(data.recentApprovals);
  renderActivityTimeline(data.recentActivities);
  renderPendingCount(data.summaryCounts.pendingApproval || 0);
}

function renderHero(data) {
  const h = new Date().getHours();
  let g = 'Selamat Pagi';
  if (h >= 11 && h < 15) g = 'Selamat Siang';
  else if (h >= 15 && h < 18) g = 'Selamat Sore';
  else if (h >= 18) g = 'Selamat Malam';

  const greetingEl = document.getElementById('heroGreeting');
  const subEl = document.getElementById('heroSub');
  const periodEl = document.getElementById('heroPeriod');
  const actionsEl = document.getElementById('heroActions');

  if (greetingEl) greetingEl.textContent = g + ', Kepala Kantor 👋';
  if (subEl) subEl.textContent = 'Pantau kondisi pelaporan seluruh seksi dan selesaikan persetujuan laporan bulan berjalan.';
  if (periodEl) periodEl.textContent = data.activePeriod?.name || `Agustus ${new Date().getFullYear()}`;

  if (actionsEl) {
    const pending = data.summaryCounts?.pendingApproval || 0;
    if (pending > 0) {
      actionsEl.innerHTML = `<a href="/head-office/persetujuan.html?tab=pending" class="btn btn-primary ho-cta-btn">Tinjau ${pending} Laporan Menunggu →</a>`;
    } else {
      actionsEl.innerHTML = `<span class="btn btn-success ho-cta-btn" style="cursor:default;">✓ Semua Laporan Telah Ditinjau</span>`;
    }
  }

  HeadOfficeLayout.setPeriod(
    data.activePeriod?.id ? parseInt(data.activePeriod.id.split('_')[2]) : new Date().getMonth() + 1,
    data.activePeriod?.id ? parseInt(data.activePeriod.id.split('_')[1]) : new Date().getFullYear()
  );
}

function renderStats(counts) {
  animateValue('statPending', counts.pendingApproval || 0);
  animateValue('statApproved', counts.approved || 0);
  animateValue('statRevision', counts.revision || 0);
  animateValue('statNotSubmitted', counts.notSubmitted || 0);
  animateValue('statTotal', counts.totalReports || 0);
}

function animateValue(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step = Math.max(1, Math.floor(target / 20));
  const interval = setInterval(() => {
    current += step;
    if (current >= target) {
      current = target;
      clearInterval(interval);
    }
    el.textContent = current;
  }, 30);
}

function renderAlerts(alerts, period) {
  const container = document.getElementById('hoAlertsContainer');
  if (!container) return;

  if (!alerts.hasPending && alerts.notSubmitted === 0) {
    container.innerHTML = `
      <div class="alert alert-success" role="alert">
        ✓ Tidak ada laporan yang memerlukan tindakan saat ini.
      </div>`;
    return;
  }

  let html = '';
  if (alerts.hasPending) {
    html += `
      <div class="alert alert-warning" role="alert">
        ⚠️ Perlu Perhatian<br>
        <small>${alerts.pendingCount} laporan menunggu persetujuan Anda. ${alerts.over2Days > 0 ? alerts.over2Days + ' laporan telah menunggu lebih dari 2 hari.' : ''}</small>
        <a href="/head-office/persetujuan.html?tab=pending" class="btn btn-sm btn-primary" style="margin-left:8px;">Tinjau Sekarang</a>
      </div>`;
  }
  if (alerts.notSubmitted > 0) {
    const deadline = period?.deadline ? formatDate(period.deadline) : '31 Agustus 2026';
    html += `
      <div class="alert alert-info" role="alert">
        ⚠️ Pengumpulan Belum Lengkap<br>
        <small>${alerts.notSubmitted} pegawai belum mengirim laporan. Deadline: ${deadline}</small>
        <a href="/head-office/persetujuan.html?tab=monitoring" class="btn btn-sm btn-outline" style="margin-left:8px;">Lihat Detail</a>
      </div>`;
  }
  container.innerHTML = html;
}

function renderPendingApprovals(reports) {
  const container = document.getElementById('pendingApprovalList');
  if (!container) return;

  if (!reports || reports.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎉</div>
        <div class="empty-state-text">Tidak ada laporan yang menunggu persetujuan.</div>
        <div class="empty-state-desc">Semua laporan yang telah diverifikasi Admin Seksi sudah selesai ditinjau.</div>
      </div>`;
    return;
  }

  const limited = reports.slice(0, 5);
  container.innerHTML = limited.map(r => `
    <div class="pending-item">
      <div class="pending-avatar">${getInitials(r.nama)}</div>
      <div class="pending-info">
        <div class="pending-name">${escapeHtml(r.nama)}</div>
        <div class="pending-meta">
          <span>${escapeHtml(r.nama_seksi || '-')}</span>
          <span class="meta-sep">•</span>
          <span>${formatMonthYear(r.bulan, r.tahun)}</span>
        </div>
        <div class="pending-admin">
          Diverifikasi oleh: <strong>${escapeHtml(r.admin_nama || 'Admin')}</strong>
        </div>
      </div>
      <div class="pending-time">
        <small>${formatDateTime(r.tanggal_verifikasi || r.created_at)}</small>
        <br><span class="status-badge-simple status-diteruskan">Menunggu Persetujuan</span>
      </div>
      <div class="pending-actions">
        <button type="button" class="btn btn-sm btn-outline" onclick="viewReportDetail(${r.id})">Lihat</button>
        <button type="button" class="btn btn-sm btn-primary" onclick="showApproveModal(${r.id})">Tinjau Laporan →</button>
      </div>
    </div>
  `).join('') + '<div class="load-more"><a href="/head-office/persetujuan.html?tab=pending">Lihat Semua Laporan Menunggu →</a></div>';
}

function renderOfficeProgress(progress) {
  const container = document.getElementById('officeProgressCard');
  if (!container) return;

  const pct = progress.percentage || 0;
  const submitted = progress.submitted || 0;
  const total = progress.totalEmployees || 0;
  const notSubmitted = total - submitted;

  container.innerHTML = `
    <div class="progress-card">
      <div class="progress-card-header">
        <span class="progress-card-title">Progress Pengumpulan</span>
        <span class="progress-percentage">${pct}%</span>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar" style="width:${pct}%"></div>
      </div>
      <div class="progress-stats">
        <span><span class="progress-dot progress-dot-done"></span> Sudah Mengirim: <strong>${submitted}</strong></span>
        <span><span class="progress-dot progress-dot-pending"></span> Belum Mengirim: <strong>${notSubmitted}</strong></span>
      </div>
      <a href="/head-office/persetujuan.html?tab=monitoring" class="load-more">Lihat Detail →</a>
    </div>`;
}

function renderSectionMonitoring(sections) {
  const container = document.getElementById('sectionProgressList');
  if (!container) return;

  if (!sections || sections.length === 0) {
    container.innerHTML = '<div class="empty-state-mini">Belum ada data seksi</div>';
    return;
  }

  container.innerHTML = sections.map(s => {
    const total = s.total_pegawai || 0;
    const submitted = s.submitted || 0;
    const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
    const notSub = total - submitted;
    const statusIcon = pct === 100 ? '✓' : pct >= 80 ? '⚠' : '✗';
    const statusText = pct === 100 ? 'Lengkap' : pct >= 80 ? 'Hampir Lengkap' : 'Perlu Ditingkatkan';

    return `
      <div class="section-progress-item" onclick="viewSectionDetail(${s.id})" tabindex="0">
        <div class="section-progress-header">
          <span class="section-progress-name">${escapeHtml(s.nama_seksi)}</span>
          <span class="section-progress-count">${submitted}/${total} • ${pct}%</span>
        </div>
        <div class="progress-bar-wrap small">
          <div class="progress-bar" style="width:${pct}%"></div>
        </div>
        <div class="section-progress-meta">
          ${statusIcon} ${statusText}
          ${notSub > 0 ? `<span class="text-muted">• ${notSub} Belum Mengirim</span>` : ''}
          ${s.pending_approval > 0 ? `<span class="text-warning">• ${s.pending_approval} Menunggu Persetujuan</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

function renderStatusChart(distribution) {
  const container = document.getElementById('statusChartContainer');
  if (!container) return;

  const max = Math.max(...Object.values(distribution), 1);
  const items = [
    { key: 'disetujui', label: 'Disetujui', color: '#10b981', icon: '✅' },
    { key: 'diteruskan', label: 'Menunggu Persetujuan', color: '#f59e0b', icon: '⏳' },
    { key: 'diajukan', label: 'Menunggu Verifikasi', color: '#3b82f6', icon: '📋' },
    { key: 'revisi_kantor', label: 'Revisi Kantor', color: '#ef4444', icon: '⚠️' },
    { key: 'revisi_admin', label: 'Revisi Admin', color: '#f97316', icon: '🔄' },
    { key: 'draft', label: 'Draft', color: '#94a3b8', icon: '📝' },
  ];

  const nonZero = items.filter(i => distribution[i.key] > 0 || i.key === 'diteruskan');
  if (nonZero.length === 0) {
    container.innerHTML = '<div class="empty-state-mini">Belum ada data untuk periode ini</div>';
    return;
  }

  container.innerHTML = nonZero.map(item => {
    const count = distribution[item.key] || 0;
    const pct = max > 0 ? Math.round((count / max) * 100) : 0;
    return `
      <div class="chart-bar-row">
        <div class="chart-bar-label">
          <span class="chart-bar-icon">${item.icon}</span>
          <span>${item.label}</span>
          <span class="chart-bar-count">${count}</span>
        </div>
        <div class="chart-bar-track">
          <div class="chart-bar-fill" style="width:${Math.max(pct, 2)}%;background:${item.color}"></div>
        </div>
      </div>`;
  }).join('');
}

function renderQuickActions(counts) {
  const desc = document.getElementById('qaPendingDesc');
  if (desc) desc.textContent = (counts.pendingApproval || 0) + ' Menunggu';
}

function renderApprovalHistory(approvals) {
  const tbody = document.getElementById('approvalHistoryBody');
  if (!tbody) return;

  if (!approvals || approvals.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state-mini">Belum ada riwayat persetujuan</td></tr>';
    return;
  }

  tbody.innerHTML = approvals.map(a => `
    <tr>
      <td>${escapeHtml(a.pegawai_nama)}</td>
      <td>${escapeHtml(a.nama_seksi || '-')}</td>
      <td>${formatMonthYear(a.bulan, a.tahun)}</td>
      <td>${formatDate(a.created_at)}</td>
      <td><span class="badge badge-${a.status === 'disetujui' ? 'disetujui' : 'revisi_kantor'}">${a.status === 'disetujui' ? 'Disetujui' : 'Revisi'}</span></td>
      <td><button class="btn btn-sm btn-outline" onclick="viewReportDetail(${a.id_laporan})">Lihat</button></td>
    </tr>
  `).join('');
}

function renderActivityTimeline(activities) {
  const container = document.getElementById('activityTimeline');
  if (!container) return;

  if (!activities || activities.length === 0) {
    container.innerHTML = '<div class="empty-state-mini">Belum ada aktivitas</div>';
    return;
  }

  container.innerHTML = activities.slice(0, 8).map(a => {
    const timeAgo = getRelativeTime(a.created_at);
    let icon = '📄';
    let text = '';
    if (a.action === 'create') {
      icon = '📝';
      text = `${escapeHtml(a.actor_name || 'User')} membuat laporan.`;
    } else if (a.action === 'submit') {
      icon = '📤';
      text = `${escapeHtml(a.actor_name || 'User')} mengajukan laporan.`;
    } else if (a.action === 'verify') {
      icon = '✓';
      text = `${escapeHtml(a.actor_name || 'Admin')} memverifikasi laporan.`;
    } else if (a.action === 'approve') {
      icon = '✅';
      text = `${escapeHtml(a.actor_name || 'Kepala')} menyetujui laporan.`;
    } else if (a.action === 'request_revision') {
      icon = '⚠️';
      text = `${escapeHtml(a.actor_name || 'Kepala')} meminta revisi.`;
    } else {
      text = `${escapeHtml(a.detail || a.action)} — ${escapeHtml(a.actor_name || 'User')}`;
    }
    return `
      <div class="activity-item">
        <div class="activity-icon">${icon}</div>
        <div class="activity-content">
          <div class="activity-text">${text}</div>
          <div class="activity-time">${timeAgo}</div>
        </div>
      </div>`;
  }).join('');
}

function renderPendingCount(count) {
  // For CTA button in hero
}

// ─── Detail Modal ────────────────────────────────────────────────────────────
window.viewReportDetail = async function(id) {
  const result = await apiFetch(`/api/laporan/${id}`);
  const r = result.data;
  if (!r) return;

  const kegiatan = r.isi_kegiatan ? JSON.parse(r.isi_kegiatan) : [];
  const lampiran = r.lampiran && r.lampiran.length > 0
    ? r.lampiran.map(f => `<li class="lampiran-row"><span class="lampiran-icon">${getFileIcon(f.filename)}</span><span class="lampiran-name">${escapeHtml(f.filename)} (${formatFileSize(f.size)})</span><a href="${API_BASE}${f.url}" target="_blank" class="lampiran-link">Unduh</a></li>`).join('')
    : '<li class="text-muted">Tidak ada lampiran</li>';

  const verifikasiHistory = await apiFetch(`/api/laporan/${id}/verifikasi-history`);
  const historyRows = (verifikasiHistory.success && verifikasiHistory.data.length > 0)
    ? verifikasiHistory.data.map(v => `<div class="history-item"><span class="history-badge">${statusLabel(v.status)}</span><span class="history-admin">${escapeHtml(v.admin_nama || '-')}</span><span class="history-catatan">${escapeHtml(v.catatan || '-')}</span><span class="history-date">${formatDate(v.created_at)}</span></div>`).join('')
    : '<p class="text-muted">Belum ada catatan verifikasi.</p>';

  document.getElementById('modalTitle').textContent = r.judul;
  document.getElementById('modalBody').innerHTML = `
    <div class="workflow-steps">
      <div class="wf-step ${canApprove(r.status) ? 'wf-done' : r.status === 'diteruskan' ? 'wf-current' : 'wf-done'}">
        <span class="wf-num">1</span><span class="wf-label">Draft</span>
      </div>
      <div class="wf-step ${['diajukan','diteruskan','disetujui','revisi_kantor'].includes(r.status) ? 'wf-done' : ''}">
        <span class="wf-num">2</span><span class="wf-label">Diajukan</span>
      </div>
      <div class="wf-step ${['diteruskan','disetujui','revisi_kantor'].includes(r.status) ? 'wf-done' : ''}">
        <span class="wf-num">3</span><span class="wf-label">Verifikasi Admin</span>
      </div>
      <div class="wf-step ${r.status === 'diteruskan' ? 'wf-current' : r.status === 'disetujui' || r.status === 'revisi_kantor' ? 'wf-done' : ''}">
        <span class="wf-num">4</span><span class="wf-label">Persetujuan Kepala</span>
      </div>
      <div class="wf-step ${r.status === 'disetujui' ? 'wf-done' : ''}">
        <span class="wf-num">5</span><span class="wf-label">Final</span>
      </div>
    </div>

    <div class="detail-grid">
      <div class="detail-row"><span class="detail-label">Pegawai</span><span>${escapeHtml(r.user_nama)}</span></div>
      <div class="detail-row"><span class="detail-label">NIP</span><span>${r.nip || '-'}</span></div>
      <div class="detail-row"><span class="detail-label">Jabatan</span><span>${r.user_role || '-'}</span></div>
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
    <div class="form-group mt-3" id="headOfficeNoteGroup" style="${canApprove(r.status) ? '' : 'display:none;'}">
      <label for="headOfficeNote">Catatan Kepala Kantor</label>
      <textarea id="headOfficeNote" rows="3" placeholder="Tuliskan catatan atau arahan untuk laporan ini..."></textarea>
    </div>
  `;

  document.getElementById('modalFooter').innerHTML = canApprove(r.status) ? `
    <button type="button" class="btn btn-danger" onclick="processApproval(${r.id}, 'revisi_kantor')">Minta Revisi</button>
    <button type="button" class="btn btn-success" onclick="processApproval(${r.id}, 'disetujui')">Setujui Laporan</button>
  ` : '<button type="button" class="btn btn-outline" onclick="closeDetailModal()">Tutup</button>';

  document.getElementById('detailModal').classList.add('active');
};

function canApprove(status) {
  return status === 'diteruskan';
}

window.processApproval = async function(id, status) {
  const catatan = document.getElementById('headOfficeNote').value.trim();
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
      const result = await apiFetch(`/api/kepala/reports/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ status, catatan })
      });
      if (result.success) {
        showNotification(
          status === 'disetujui' ? 'Laporan berhasil disetujui!' : 'Permintaan revisi dikirim.',
          'success'
        );
        closeDetailModal();
        await loadDashboardData();
      } else {
        showNotification(result.message || 'Gagal memproses', 'error');
      }
    } catch {
      showNotification('Gagal memproses persetujuan', 'error');
    }
  });
};

window.closeDetailModal = function() {
  document.getElementById('detailModal')?.classList.remove('active');
};

// ─── Confirmation Modal ──────────────────────────────────────────────────────
let confirmCallback = null;

function showConfirmModal(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmExtra').innerHTML = '';
  confirmCallback = onConfirm;
  const btn = document.getElementById('confirmActionBtn');
  btn.onclick = () => {
    closeConfirmModal();
    if (confirmCallback) confirmCallback();
  };
  document.getElementById('confirmModal').classList.add('active');
}

window.closeConfirmModal = function() {
  document.getElementById('confirmModal')?.classList.remove('active');
  confirmCallback = null;
};

function showApproveModal(id) {
  viewReportDetail(id);
}

// ─── Section Detail ──────────────────────────────────────────────────────────
window.viewSectionDetail = async function(seksiId) {
  const params = new URLSearchParams(window.location.search);
  const bulan = params.get('bulan') || new Date().getMonth() + 1;
  const tahun = params.get('tahun') || new Date().getFullYear();

  const result = await apiFetch(`/api/kepala/sections/${seksiId}?bulan=${bulan}&tahun=${tahun}`);
  if (!result.success) return;

  const sec = result.data.section;
  const pegawai = result.data.pegawai;

  const alreadySubmitted = pegawai.filter(p => p.sudah_lapor).length;
  const notSubmitted = pegawai.length - alreadySubmitted;

  document.getElementById('modalTitle').textContent = `Monitoring: ${sec.nama_seksi}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="deadline-summary" style="margin-bottom:20px">
      <div class="deadline-stat"><div class="deadline-stat-value">${pegawai.length}</div><div class="deadline-stat-label">Total Pegawai</div></div>
      <div class="deadline-stat"><div class="deadline-stat-value green">${alreadySubmitted}</div><div class="deadline-stat-label">Sudah Lapor</div></div>
      <div class="deadline-stat"><div class="deadline-stat-value red">${notSubmitted}</div><div class="deadline-stat-label">Belum Lapor</div></div>
    </div>
    <table class="data-table">
      <thead><tr><th>Nama</th><th>NIP</th><th>Status Laporan</th></tr></thead>
      <tbody>
        ${pegawai.map(p => `
          <tr>
            <td>${escapeHtml(p.nama)}</td>
            <td>${p.nip || '-'}</td>
            <td>${p.sudah_lapor
              ? `<span class="badge badge-${p.laporan_status === 'disetujui' ? 'disetujui' : p.laporan_status === 'diteruskan' ? 'diteruskan' : 'diajukan'}">${statusLabel(p.laporan_status)}</span>`
              : '<span class="badge badge-revisi_admin">Belum Mengirim</span>'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  document.getElementById('modalFooter').innerHTML = '<button type="button" class="btn btn-outline" onclick="closeDetailModal()">Tutup</button>';
  document.getElementById('detailModal').classList.add('active');
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

function getRelativeTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return Math.floor(diff / 60) + ' menit lalu';
  if (diff < 86400) return Math.floor(diff / 3600) + ' jam lalu';
  if (diff < 172800) return 'Kemarin';
  return formatDate(dateStr);
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

// ─── Click outside modal to close ────────────────────────────────────────────
document.addEventListener('click', (e) => {
  if (e.target.id === 'detailModal') closeDetailModal();
  if (e.target.id === 'confirmModal') closeConfirmModal();
});

// ─── Keyboard support ────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDetailModal();
    closeConfirmModal();
  }
});
