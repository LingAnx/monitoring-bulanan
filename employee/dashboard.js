// ══════════════════════════════════════════════════
// EMPLOYEE DASHBOARD — Uses EmployeeLayout for sidebar/topbar
// ══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  requireRole('PEGAWAI');
  const authenticated = await initAuth();
  if (!authenticated) return;

  // Initialize layout (sidebar + topbar)
  initEmployeePage('Dashboard');
  
  // Set user info
  EmployeeLayout.setUserInfo(currentUser?.nama, currentUser?.role);
  
  // Update period badge
  const period = getCurrentPeriod();
  EmployeeLayout.setPeriod(period.month, period.year);

  // Load dashboard content
  renderDashboard();
});

// All other functions remain unchanged...

function getCurrentPeriod() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

async function loadDraftBadges() {
  try {
    const r = await apiFetch('/api/laporan');
    const reports = r.data || [];
    const draftCount = reports.filter(r => r.status === 'draft').length;
    const berjalanCount = reports.filter(r => ['diajukan', 'diteruskan', 'revisi_admin', 'revisi_kantor'].includes(r.status)).length;

    const badge1 = document.getElementById('draftBadge');
    if (badge1) {
      if (draftCount > 0) { badge1.textContent = draftCount; badge1.classList.remove('hidden'); }
      else { badge1.classList.add('hidden'); }
    }
    const badge2 = document.getElementById('berjalanBadge');
    if (badge2) {
      if (berjalanCount > 0) { badge2.textContent = berjalanCount; badge2.classList.remove('hidden'); }
      else { badge2.classList.add('hidden'); }
    }
  } catch {}
}

async function renderDashboard() {
  const content = document.getElementById('dashboardContent');
  const skeleton = document.getElementById('skeletonLoading');

  try {
    skeleton.style.display = 'block';
    content.style.display = 'none';

    const [stats, reports, notifications] = await Promise.all([
      apiFetch('/api/laporan/stats'),
      apiFetch('/api/laporan'),
      apiFetch('/api/notifications?limit=20')
    ]);

    const s = stats.data || {};
    const allReports = reports.data || [];
    const currentPeriod = getCurrentPeriod();
    const activeReport = allReports.find(r => r.bulan === currentPeriod.month && r.tahun === currentPeriod.year);
    const revisionNote = findRevisionNote(activeReport, notifications.data || []);
    const recentReports = allReports.filter(r => r.status !== 'draft').sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 5);
    const activities = generateActivities(allReports, notifications.data || []);

    content.innerHTML = buildDashboardHTML(activeReport, revisionNote, recentReports, activities, allReports, notifications.data || []);
    skeleton.style.display = 'none';
    content.style.display = 'block';
    loadDraftBadges();

  } catch (err) {
    console.error('Dashboard error:', err);
    skeleton.style.display = 'none';
    content.innerHTML = `
      <div class="error-page">
        <div class="error-icon">&#9888;</div>
        <div class="error-text">Gagal memuat dashboard.</div>
        <small>${err.message || 'Coba lagi nanti.'}</small>
        <button class="btn btn-primary" onclick="location.reload()" style="margin-top:16px">Coba Lagi</button>
      </div>
    `;
  }
}

function buildDashboardHTML(activeReport, revisionNote, recentReports, activities, allReports = [], notifications = []) {
  const pendingCount = allReports.filter(r => r.status === 'diajukan' || r.status === 'diteruskan').length;
  const reviseCount = allReports.filter(r => r.status === 'revisi_admin' || r.status === 'revisi_kantor').length;
  const approvedCount = allReports.filter(r => r.status === 'disetujui').length;

  const deadlineInfo = calcDeadline(getCurrentPeriod());
  const progress = activeReport ? calcCompletionProgress(activeReport) : null;

  return `
    <!-- Hero Section -->
    <section class="hero-section">
      <div class="hero-content">
        <h1 class="hero-title">Selamat Datang, ${currentUser.nama.split(' ')[0]}! &#128075;</h1>
        <p class="hero-subtitle">Kelola dan pantau laporan bulanan Anda dengan mudah dan terstruktur.</p>
      </div>
      <div class="hero-actions">
        ${activeReport ? `
          <button class="btn btn-primary" onclick="window.location.href='/employee/laporan.html'">Lihat Status Laporan</button>
        ` : `
          <button class="btn btn-primary" onclick="window.location.href='/employee/form.html'">Buat Laporan Baru</button>
        `}
      </div>
      <div class="hero-decoration">
        <div class="deco-circle deco-1"></div>
        <div class="deco-circle deco-2"></div>
        <div class="deco-circle deco-3"></div>
      </div>
    </section>

    <!-- Stats Cards -->
    <section class="stats-grid-modern">
      <div class="stat-card-modern stat-blue" onclick="window.location.href='/employee/laporan.html'">
        <div class="stat-icon"><span>&#128196;</span></div>
        <div class="stat-info">
          <div class="stat-value">${activeReport ? 1 : 0}</div>
          <div class="stat-label">Laporan Bulan Ini</div>
          <div class="stat-desc">Laporan</div>
        </div>
        <div class="stat-arrow">&#10132;</div>
      </div>

      <div class="stat-card-modern stat-yellow" onclick="window.location.href='/employee/laporan.html'">
        <div class="stat-icon"><span>&#9203;</span></div>
        <div class="stat-info">
          <div class="stat-value">${pendingCount}</div>
          <div class="stat-label">Menunggu Verifikasi</div>
          <div class="stat-desc">Laporan</div>
        </div>
        <div class="stat-arrow">&#10132;</div>
      </div>

      <div class="stat-card-modern stat-red" onclick="window.location.href='/employee/laporan.html'">
        <div class="stat-icon"><span>&#9888;</span></div>
        <div class="stat-info">
          <div class="stat-value">${reviseCount}</div>
          <div class="stat-label">Perlu Revisi</div>
          <div class="stat-desc">Laporan</div>
        </div>
        <div class="stat-arrow">&#10132;</div>
      </div>

      <div class="stat-card-modern stat-green" onclick="window.location.href='/employee/laporan.html'">
        <div class="stat-icon"><span>&#10003;</span></div>
        <div class="stat-info">
          <div class="stat-value">${approvedCount}</div>
          <div class="stat-label">Disetujui</div>
          <div class="stat-desc">Laporan</div>
        </div>
        <div class="stat-arrow">&#10132;</div>
      </div>
    </section>

    <!-- Revision Alert -->
    ${revisionNote ? buildRevisionAlert(revisionNote) : ''}

    <!-- Main Grid -->
    <section class="dashboard-grid">
      <div class="dashboard-left">
        <!-- Workflow Timeline -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Status Laporan Bulan Ini</h3>
          </div>
          <div class="workflow-timeline">
            ${buildWorkflowTimeline(activeReport)}
          </div>
        </div>

        <!-- Quick Actions + Completion -->
        <div class="row-card-group">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Aksi Cepat</h3>
            </div>
            <div class="quick-actions-grid">
              ${buildQuickActions(activeReport)}
            </div>
          </div>
          ${progress ? buildCompletionCard(progress) : ''}
        </div>

        <!-- Report History -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Riwayat Laporan Terbaru</h3>
            <a href="/employee/laporan.html" class="btn btn-text">Lihat Semua Riwayat <span class="arrow-right">&#10132;</span></a>
          </div>
          ${recentReports.length === 0 ? `
            <div class="empty-state-mini">
              <div class="empty-icon">&#128197;</div>
              <div>Belum ada laporan. <a href="/employee/form.html">Buat Laporan Pertama</a></div>
            </div>
          ` : `
            <div class="history-table-wrap">
              <table class="history-table">
                <thead><tr><th>Periode</th><th>Tanggal Buat</th><th>Tanggal Submit</th><th>Status</th><th>Terakhir Diperbarui</th><th>Aksi</th></tr></thead>
                <tbody>
                  ${recentReports.map(r => `
                    <tr>
                      <td>${formatMonthYear(r.bulan, r.tahun)}</td>
                      <td>${formatDate(r.created_at)}</td>
                      <td>${r.tanggal_pengajuan ? formatDate(r.tanggal_pengajuan) : '-'}</td>
                      <td><span class="status-badge-simple status-${r.status}">${statusLabel(r.status)}</span></td>
                      <td>${formatDate(r.updated_at)}</td>
                      <td>
                        <button class="btn btn-text btn-sm" onclick="showReportDetail(${r.id})">Lihat</button>
                        ${r.status === 'disetujui' ? `<button class="btn btn-text btn-sm" onclick="downloadReport(${r.id})">Download</button>` : ''}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>

      <div class="dashboard-right">
        <!-- Period Info -->
        <div class="card period-info-card">
          <div class="card-header">
            <h3 class="card-title">Periode Aktif</h3>
          </div>
          <div class="period-content">
            <div class="period-name">${getCurrentPeriod().month === new Date().getMonth() + 1 ? T.months[getCurrentPeriod().month] + ' ' + getCurrentPeriod().year : 'Periode saat ini'}</div>
            <div class="period-dates">
              <span>${T.months[getCurrentPeriod().month]} ${getCurrentPeriod().year}</span>
              <span class="period-sep">&#8212;</span>
              <span>${getDaysInMonth(getCurrentPeriod().month, getCurrentPeriod().year)} ${T.months[getCurrentPeriod().month]} ${getCurrentPeriod().year}</span>
            </div>
            <span class="period-active-badge">AKTIF</span>
          </div>
          <div class="deadline-info">
            <div class="deadline-label">Deadline Pengumpulan</div>
            <div class="deadline-value">${getDaysInMonth(getCurrentPeriod().month, getCurrentPeriod().year)} ${T.months[getCurrentPeriod().month]} ${getCurrentPeriod().year}</div>
          </div>
          <div class="deadline-progress">
            <div class="deadline-bar-track">
              <div class="deadline-bar-fill ${deadlineInfo.urgent ? 'urgent' : ''}" style="width:${Math.min(100, Math.max(0, deadlineInfo.progress))}%"></div>
            </div>
            <div class="deadline-meta">
              <span class="deadline-remaining ${deadlineInfo.urgent ? 'urgent' : ''}">${deadlineInfo.daysLeft} Hari Lagi</span>
              <span class="deadline-used">${Math.round(deadlineInfo.progress)}% terpakai</span>
            </div>
          </div>
          <button class="btn btn-primary full-width" onclick="window.location.href='/employee/laporan.html'">Lihat Status Laporan</button>
        </div>

        <!-- Notifications -->
        <div class="card notifications-card">
          <div class="card-header">
            <h3 class="card-title">Notifikasi Terbaru</h3>
            <a href="/employee/notifikasi.html" class="btn btn-text">Lihat Semua</a>
          </div>
          <div class="notifications-list">
            ${buildNotificationsList(notifications.slice(0, 5))}
          </div>
        </div>

        <!-- Activity -->
        <div class="card activity-card">
          <div class="card-header">
            <h3 class="card-title">Aktivitas Terbaru</h3>
            <a href="/employee/notifikasi.html" class="btn btn-text">Lihat Semua</a>
          </div>
          <div class="activity-timeline">
            ${activities.length > 0 ? activities.slice(0, 5).map(a => `
              <div class="activity-item">
                <div class="activity-dot ${a.type}"></div>
                <div class="activity-content">
                  <div class="activity-text">${a.text}</div>
                  <div class="activity-time">${a.time}</div>
                </div>
              </div>
            `).join('') : `
              <div class="empty-state-mini">
                <div class="empty-icon">&#128203;</div>
                <div>Belum ada aktivitas.</div>
              </div>
            `}
          </div>
        </div>
      </div>
    </section>
  `;
}

function buildWorkflowTimeline(report) {
  if (!report) {
    return `
      <div class="workflow-steps">
        <div class="wf-step active">
          <div class="wf-dot">&#128196;</div>
          <div class="wf-label">Draft</div>
        </div>
        <div class="wf-connector"></div>
        <div class="wf-step"><div class="wf-dot">&#9654;</div><div class="wf-label">Diajukan</div></div>
        <div class="wf-connector"></div>
        <div class="wf-step"><div class="wf-dot">&#9203;</div><div class="wf-label">Verifikasi</div></div>
        <div class="wf-connector"></div>
        <div class="wf-step"><div class="wf-dot">&#128269;</div><div class="wf-label">Persetujuan</div></div>
        <div class="wf-connector"></div>
        <div class="wf-step"><div class="wf-dot">&#10003;</div><div class="wf-label">Selesai</div></div>
      </div>
    `;
  }

  const steps = [
    { key: 'draft', label: 'Draft', icon: '&#128196;' },
    { key: 'submitted', label: 'Diajukan', icon: '&#9654;' },
    { key: 'verified', label: 'Verifikasi', icon: '&#9203;' },
    { key: 'approved', label: 'Persetujuan', icon: '&#128269;' },
    { key: 'done', label: 'Selesai', icon: '&#10003;' }
  ];

  let currentStep = 0;
  let statusCls = '';
  let revisionNote = '';

  if (report.status === 'draft') {
    currentStep = 0; statusCls = 'active';
  } else if (report.status === 'diajukan') {
    currentStep = 1; steps[1].date = report.tanggal_pengajuan; statusCls = 'active';
  } else if (report.status === 'diteruskan') {
    currentStep = 2; steps[2].date = report.tanggal_verifikasi; statusCls = 'active';
  } else if (report.status === 'revisi_admin') {
    currentStep = 2; steps[2].date = report.tanggal_verifikasi; statusCls = 'revision'; revisionNote = report.catatan_admin;
  } else if (report.status === 'revisi_kantor') {
    currentStep = 3; steps[3].date = report.tanggal_persetujuan; statusCls = 'revision'; revisionNote = report.catatan_kantor;
  } else if (report.status === 'disetujui') {
    currentStep = 4; steps[4].date = report.tanggal_persetujuan; statusCls = 'completed';
  }

  return `
    <div class="workflow-steps">
      ${steps.map((step, i) => {
        const done = i < currentStep;
        const active = !['revision'].includes(statusCls) && i === currentStep;
        const revision = statusCls === 'revision' && i === currentStep;
        const completed = statusCls === 'completed';
        const stepClass = done ? 'done' : active ? 'active' : revision ? 'revision' : completed ? 'done' : '';
        const connector = i < steps.length - 1 ? `<div class="wf-connector ${done || completed ? 'done' : ''}"></div>` : '';
        return `
          <div class="wf-step ${stepClass}">
            <div class="wf-dot">${done || completed ? '&#10003;' : step.icon}</div>
            <div class="wf-label">${step.label}</div>
            ${steps[i].date ? `<div class="wf-date">${formatDate(steps[i].date)}</div>` : ''}
          </div>${connector}
        `;
      }).join('')}
    </div>
    ${revisionNote ? `<div class="wf-revision-note">Revisi: ${revisionNote}</div>` : ''}
    <div style="text-align:right;margin-top:12px"><button class="btn btn-outline btn-sm" onclick="showReportDetail(${report.id})">Lihat Detail</button></div>
  `;
}

function buildQuickActions(report) {
  if (!report) {
    return `
      <a href="/employee/form.html" class="qa-item"><div class="qa-icon blue">&#43;</div><span>Buat Laporan</span></a>
      <a href="/employee/laporan.html" class="qa-item"><div class="qa-icon gray">&#128197;</div><span>Riwayat Laporan</span></a>
    `;
  }
  if (report.status === 'draft') {
    return `
      <a href="/employee/form.html" class="qa-item"><div class="qa-icon orange">&#9998;</div><span>Lanjutkan Draft</span></a>
      <a href="/employee/laporan.html" class="qa-item"><div class="qa-icon gray">&#128197;</div><span>Riwayat Laporan</span></a>
    `;
  }
  if (report.status === 'revisi_admin' || report.status === 'revisi_kantor') {
    return `
      <a href="/employee/form.html" class="qa-item"><div class="qa-icon red">&#9888;</div><span>Perbaiki Laporan</span></a>
      <a href="/employee/laporan.html" class="qa-item"><div class="qa-icon gray">&#128197;</div><span>Riwayat Laporan</span></a>
    `;
  }
  return `
    <button class="qa-item" onclick="showReportDetail(${report.id})"><div class="qa-icon blue">&#128065;</div><span>Lihat Laporan</span></button>
    ${report.status === 'disetujui' ? `<button class="qa-item" onclick="downloadReport(${report.id})"><div class="qa-icon green">&#8681;</div><span>Download PDF</span></button>` : ''}
    <a href="/employee/laporan.html" class="qa-item"><div class="qa-icon gray">&#128197;</div><span>Riwayat Laporan</span></a>
  `;
}

function buildCompletionCard(progress) {
  const pct = progress.percent;
  const fields = progress.fields;
  return `
    <div class="card">
      <div class="card-header"><h3 class="card-title">Kelengkapan Laporan</h3></div>
      <div class="completion-donut">
        <div class="donut-chart-wrap">
          <canvas id="completionChart" width="120" height="120"></canvas>
          <div class="donut-center"><div class="donut-percent">${pct}%</div><div class="donut-label">Lengkap</div></div>
        </div>
        <div class="completion-fields-check">
          ${fields.map(f => '<div class="field-check-row ' + (f.checked ? 'checked' : 'empty') + '"><span class="fc-dot">' + (f.checked ? '&#10003;' : '&#10071;') + '</span><span class="fc-label">' + f.label + '</span>' + (f.checked ? '<span class="fc-check-icon">&#10003;</span>' : '') + '</div>').join('')}
        </div>
      </div>
      <div style="text-align:center;margin-top:12px"><button class="btn btn-outline btn-sm" onclick="window.location.href='/employee/form.html'">Lengkapi Laporan</button></div>
    </div>
  `;
}

function buildNotificationsList(notifications) {
  if (notifications.length === 0) {
    return `<div class="empty-state-mini"><div class="empty-icon">&#128276;</div><div>Belum ada notifikasi.</div></div>`;
  }
  const iconMap = { success: '&#10003;', info: '&#128172;', warning: '&#9888;', danger: '&#10007;' };
  return notifications.map(n => {
    const icon = iconMap[n.type] || '&#128172;';
    const dotClass = n.is_read ? 'unread-dot-unread' : 'unread-dot';
    return `
      <a href="/employee/notifikasi.html" class="notif-item">
        <div class="notif-dot">${icon}</div>
        <div class="notif-content">
          <div class="notif-title">${n.title}</div>
          <div class="notif-message">${n.message}</div>
          <div class="notif-time">${formatRelativeTime(n.created_at)}</div>
        </div>
        <div class="notif-indicator ${dotClass}"></div>
      </a>
    `;
  }).join('');
}

function buildRevisionAlert(note) {
  return `
    <div class="revision-alert-card">
      <div class="revision-alert-icon">&#9888;</div>
      <div class="revision-alert-content">
        <div class="revision-alert-title">Laporan Perlu Revisi</div>
        <div class="revision-alert-text">${note.note}</div>
        <div class="revision-alert-meta"><span>Dari: ${note.by}</span><span>&#8226;</span><span>${note.date}</span></div>
      </div>
      <button class="btn btn-sm btn-danger" onclick="window.location.href='/employee/form.html'">Perbaiki Sekarang</button>
    </div>
  `;
}

function findRevisionNote(report, notifications) {
  if (!report || !['revisi_admin', 'revisi_kantor'].includes(report.status)) return null;
  const source = report.status === 'revisi_admin' ? 'Admin Seksi' : 'Kepala Kantor';
  const note = report.status === 'revisi_admin' ? report.catatan_admin : report.catatan_kantor;
  const date = report.status === 'revisi_admin' ? report.tanggal_verifikasi : report.tanggal_persetujuan;
  return { by: source, note: note || 'Tidak ada catatan revisi.', date: date };
}

function calcDeadline(period) {
  const now = new Date();
  const deadline = new Date(period.year, period.month - 1, getDaysInMonth(period.month, period.year));
  const diff = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
  const total = getDaysInMonth(period.month, period.year);
  const elapsed = total - diff;
  return { daysLeft: Math.max(0, diff), progress: Math.min(100, Math.max(0, (elapsed / total) * 100)), urgent: diff <= 3 };
}

function calcCompletionProgress(report) {
  const fields = [
    { key: 'judul', label: 'Identitas', checked: !!report.judul },
    { key: 'isi_kegiatan', label: 'Kegiatan', checked: !!report.isi_kegiatan },
    { key: 'capaian', label: 'Capaian', checked: !!report.capaian },
    { key: 'kendala', label: 'Kendala', checked: !!report.kendala },
    { key: 'tindak_lanjut', label: 'Tindak Lanjut', checked: !!report.tindak_lanjut },
    { key: 'rencana_bulan_depan', label: 'Rencana Bulan Depan', checked: !!report.rencana_bulan_depan },
    { key: 'lampiran', label: 'Dokumentasi', checked: report.lampiran && Array.isArray(JSON.parse(report.lampiran || '[]')) && JSON.parse(report.lampiran || '[]').length > 0 }
  ];
  const filled = fields.filter(f => f.checked).length;
  return { percent: Math.round(filled / fields.length * 100), filled, total: fields.length, fields };
}

function generateActivities(reports, notifications) {
  const activities = [];
  const iconMap = { draft: 'create', submit: 'submit', verify: 'verify', approve: 'approve', revision: 'revision', create: 'create' };
  for (const r of reports) {
    activities.push({ type: 'create', text: `Anda membuat laporan <strong>"${truncate(r.judul, 30)}"</strong> (${formatMonthYear(r.bulan, r.tahun)})`, time: formatRelativeTime(r.created_at) });
    if (r.tanggal_pengajuan) activities.push({ type: 'submit', text: `Anda mengirim laporan <strong>"${truncate(r.judul, 30)}"</strong> untuk diverifikasi`, time: formatRelativeTime(r.tanggal_pengajuan) });
    if (r.tanggal_verifikasi) {
      const verb = (r.status === 'revisi_admin') ? 'diminta revisi oleh Admin Seksi' : 'diverifikasi oleh Admin Seksi';
      activities.push({ type: 'revision', text: `Laporan <strong>"${truncate(r.judul, 30)}"</strong> ${verb}`, time: formatRelativeTime(r.tanggal_verifikasi) });
    }
    if (r.tanggal_persetujuan) {
      const verb = (r.status === 'revisi_kantor') ? 'diminta revisi oleh Kepala Kantor' : 'disetujui oleh Kepala Kantor';
      activities.push({ type: 'approve', text: `Laporan <strong>"${truncate(r.judul, 30)}"</strong> ${verb}`, time: formatRelativeTime(r.tanggal_persetujuan) });
    }
  }
  for (const n of notifications.filter(n => !n.is_read).slice(0, 3)) {
    activities.push({ type: 'verify', text: n.message, time: formatRelativeTime(n.created_at) });
  }
  return activities.sort((a, b) => new Date(b.time) - new Date(a.time));
}

function truncate(str, len) { return str && str.length > len ? str.substring(0, len) + '...' : str || ''; }

function formatRelativeTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return Math.floor(diff / 60) + ' menit yang lalu';
  if (diff < 86400) return Math.floor(diff / 3600) + ' jam yang lalu';
  if (diff < 172800) return 'Kemarin';
  return formatDate(dateStr);
}

function getDaysInMonth(month, year) { return new Date(year, month, 0).getDate(); }

function initCompletionChart(progress) {
  if (!progress || !document.getElementById('completionChart')) return;
  const ctx = document.getElementById('completionChart').getContext('2d');
  if (window.completionChartInstance) window.completionChartInstance.destroy();
  const pct = progress.percent;
  window.completionChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: ['Lengkap', 'Belum'], datasets: [{ data: [pct, 100 - pct], backgroundColor: ['#10b981', '#e2e8f0'], borderWidth: 0, cutout: '72%' }] },
    options: { responsive: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { animateRotate: true, duration: 800 } }
  });
}

window.showReportDetail = async function(id) {
  try {
    const data = await apiFetch(`/api/laporan/${id}`);
    const r = data.data;
    if (!r) return;
    document.getElementById('modalTitle').textContent = r.judul;
    const kegiatan = r.isi_kegiatan ? JSON.parse(r.isi_kegiatan) : [];
    const lampiran = r.lampiran ? JSON.parse(r.lampiran) : [];
    document.getElementById('modalBody').innerHTML = `
      <div class="detail-grid">
        <div class="detail-row"><span class="detail-label">Pegawai</span><span>${r.user_nama}</span></div>
        <div class="detail-row"><span class="detail-label">NIP</span><span>${r.nip || '-'}</span></div>
        <div class="detail-row"><span class="detail-label">Seksi</span><span>${r.nama_seksi || '-'}</span></div>
        <div class="detail-row"><span class="detail-label">Periode</span><span>${formatMonthYear(r.bulan, r.tahun)}</span></div>
        <div class="detail-row"><span class="detail-label">Status</span><span><span class="badge badge-${r.status}">${statusLabel(r.status)}</span></span></div>
        <div class="detail-row"><span class="detail-label">Diajukan</span><span>${r.tanggal_pengajuan ? formatDate(r.tanggal_pengajuan) : '-'}</span></div>
      </div>
      ${kegiatan.length > 0 ? `<h4 style="margin:16px 0 8px;font-size:0.9rem">Kegiatan</h4><table class="data-table" style="margin-bottom:16px"><thead><tr><th>No</th><th>Tanggal</th><th>Kegiatan</th><th>Keterangan</th></tr></thead><tbody>${kegiatan.map((k,i) => `<tr><td>${i+1}</td><td>${k.tanggal}</td><td>${k.kegiatan}</td><td>${k.keterangan||''}</td></tr>`).join('')}</tbody></table>` : ''}
      ${r.capaian ? `<h4 style="margin:16px 0 8px;font-size:0.9rem">Capaian</h4><p>${r.capaian}</p>` : ''}
      ${r.kendala ? `<h4 style="margin:16px 0 8px;font-size:0.9rem">Kendala</h4><p>${r.kendala}</p>` : ''}
      ${r.tindak_lanjut ? `<h4 style="margin:16px 0 8px;font-size:0.9rem">Tindak Lanjut</h4><p>${r.tindak_lanjut}</p>` : ''}
      ${r.catatan_admin ? `<h4 style="margin:16px 0 8px;font-size:0.9rem">Catatan Admin Seksi</h4><p>${r.catatan_admin}</p>` : ''}
      ${r.catatan_kantor ? `<h4 style="margin:16px 0 8px;font-size:0.9rem">Catatan Kepala Kantor</h4><p>${r.catatan_kantor}</p>` : ''}
      ${lampiran.length > 0 ? `<h4 style="margin:16px 0 8px;font-size:0.9rem">Lampiran (${lampiran.length} file)</h4><ul style="padding-left:20px;font-size:0.85rem;color:var(--gray-600)">${lampiran.map(f => `<li>${f.nama}</li>`).join('')}</ul>` : ''}
    `;
    document.getElementById('detailModal').classList.add('active');
  } catch (err) { showNotification('Gagal memuat detail laporan', 'error'); }
};

window.closeModal = function() { document.getElementById('detailModal').classList.remove('active'); };
document.getElementById('detailModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });

window.downloadReport = async function(id) {
  try {
    const data = await apiFetch(`/api/laporan/${id}`);
    const r = data.data;
    if (!r) return;
    const kegiatan = r.isi_kegiatan ? JSON.parse(r.isi_kegiatan) : [];
    let content = `LAPORAN KINERJA BULANAN\nKSOP Kelas II Cirebon\n${'='.repeat(40)}\n\n`;
    content += `Nama: ${r.user_nama}\nNIP: ${r.nip || '-'}\nSeksi: ${r.nama_seksi || '-'}\nPeriode: ${formatMonthYear(r.bulan, r.tahun)}\nStatus: ${statusLabel(r.status)}\n\n`;
    content += `${'-'.repeat(40)}\nKEGIATAN\n${'-'.repeat(40)}\n`;
    kegiatan.forEach((k, i) => { content += `\n${i+1}. Tanggal: ${k.tanggal}\n   Kegiatan: ${k.kegiatan}\n   Keterangan: ${k.keterangan || '-'}\n`; });
    if (r.capaian) content += `\n${'-'.repeat(40)}\nCAPAIAN\n${'-'.repeat(40)}\n${r.capaian}\n`;
    if (r.kendala) content += `\n${'-'.repeat(40)}\nKENDALA\n${'-'.repeat(40)}\n${r.kendala}\n`;
    if (r.tindak_lanjut) content += `\n${'-'.repeat(40)}\nTINDAK LANJUT\n${'-'.repeat(40)}\n${r.tindak_lanjut}\n`;
    if (r.rencana_bulan_depan) content += `\n${'-'.repeat(40)}\nRENCANA BULAN DEPAN\n${'-'.repeat(40)}\n${r.rencana_bulan_depan}\n`;
    if (r.catatan_admin) content += `\nCATATAN ADMIN SEKI: ${r.catatan_admin}\n`;
    if (r.catatan_kantor) content += `\nCATATAN KEPALA KANTOR: ${r.catatan_kantor}\n`;
    content += `\n${'='.repeat(40)}\nDicetak pada: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Laporan_${r.user_nama}_${r.bulan}_${r.tahun}.txt`; a.click();
    URL.revokeObjectURL(url);
  } catch { showNotification('Gagal mengunduh laporan', 'error'); }
};
