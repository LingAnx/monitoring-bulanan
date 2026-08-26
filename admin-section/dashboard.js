// ══════════════════════════════════════════════════
// DASHBOARD ADMIN SEKSI - Main Script
// Uses shared admin-section-layout.js for sidebar/topbar
// ══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  requireRole('ADMIN_SEKSI');
  const authenticated = await initAuth();
  if (!authenticated) return;

  // Initialize shared layout
  initAdminSectionPage('Dashboard');
  AdminSectionLayout.setUserInfo(currentUser?.nama, currentUser?.role);

  if (!isAdminSeksi()) {
    window.location.href = '/admin-section/dashboard.html';
    return;
  }

  await loadDashboardData();
  startDashboardPolling();
});

// ── Load Dashboard Data ─────────────────────────────────
async function loadDashboardData() {
  showSkeleton(true);

  try {
    const [dashboardRes, reportsRes] = await Promise.all([
      apiFetch('/api/admin-section/dashboard'),
      apiFetch('/api/laporan?limit=5')
    ]);
    
    if (!dashboardRes.success) {
      throw new Error(
        dashboardRes.message || 'Gagal memuat dashboard'
      );
    }
    
    const stats = dashboardRes.stats || {};
    const reports = reportsRes.data || [];
    
    document.getElementById('statPending').textContent =
      stats.pending ?? 0;
    
    document.getElementById('statRevisi').textContent =
      stats.revisi ?? 0;
    
    document.getElementById('statDisetujui').textContent =
      stats.disetujui ?? 0;
    
    document.getElementById('statPegawai').textContent =
      stats.total_pegawai ?? 0;

    // Period & Deadline
    const monthNames = [
      'Januari',
      'Februari',
      'Maret',
      'April',
      'Mei',
      'Juni',
      'Juli',
      'Agustus',
      'September',
      'Oktober',
      'November',
      'Desember'
    ];
    
    const period = dashboardRes.period;
    const deadline = dashboardRes.deadline;
    
    if (period) {
      document.getElementById('periodName').textContent =
        `Periode ${monthNames[period.bulan - 1]} ${period.tahun}`;
    
      document.getElementById('periodMonth').textContent =
        monthNames[period.bulan - 1];
    
      document.getElementById('periodYear').textContent =
        period.tahun;
    
      document
        .getElementById('periodActiveBadge')
        .classList.remove('hidden');
    } else {
      document.getElementById('periodName').textContent =
        'Tidak ada periode aktif';
    
      document.getElementById('periodMonth').textContent = '-';
      document.getElementById('periodYear').textContent = '-';
    
      document
        .getElementById('periodActiveBadge')
        .classList.add('hidden');
    }
    
    const deadlineInfo = document.getElementById('deadlineInfo');
    
    if (deadline?.deadlineDate) {
      deadlineInfo.classList.remove('hidden');
    
      const deadlineDate = new Date(deadline.deadlineDate);
    
      document.getElementById('deadlineValue').textContent =
        formatDate(deadline.deadlineDate);
    
      document.getElementById('deadlineRemaining').textContent =
        deadline.daysRemaining > 0
          ? `${deadline.daysRemaining} hari lagi`
          : 'Deadline telah tiba/lewat';
    
      const usedPercent = Math.min(
        100,
        Math.max(0, (1 - deadline.daysRemaining / 30) * 100)
      );
    
      document.getElementById('deadlineUsed').textContent =
        `${Math.round(usedPercent)}% terpakai`;
    
      const barFill = document.getElementById('deadlineBarFill');
      barFill.style.width = `${usedPercent}%`;
      barFill.classList.remove('hidden');
    } else {
      deadlineInfo.classList.add('hidden');
    }

    // Recent Reports
    const recent = reports.slice(0, 5);
    const tbody = document.getElementById('recentTableBody');

    if (recent.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state-mini">Belum ada laporan di seksi ini.</td></tr>`;
    } else {
      tbody.innerHTML = recent.map(r => `
        <tr>
          <td><strong>${r.user_nama || '-'}</strong></td>
          <td>${monthNames[r.bulan-1]} ${r.tahun}</td>
          <td>${getStatusBadge(r.status)}</td>
          <td>${formatDate(r.created_at)}</td>
          <td>
            <button type="button" class="btn btn-sm btn-primary" onclick="viewDetail(${r.id})">👁️</button>
            ${r.status === 'diajukan' ? `<button type="button" class="btn btn-sm btn-success" onclick="verifyReport(${r.id})">✓</button>` : ''}
          </td>
        </tr>
      `).join('');
    }

    // Activity Timeline
    const timeline = document.getElementById('activityTimeline');
    const activities = dashboardRes.activities || [];

    if (activities.length === 0) {
      timeline.innerHTML = '<div class="empty-state-mini">Belum ada aktivitas</div>';
    } else {
      timeline.innerHTML = activities.map(a => `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <div class="timeline-title">${a.nama_pegawai || '-'}</div>
            <div class="timeline-desc">${a.last_action || '-'}</div>
            <div class="timeline-meta">${formatDate(a.created_at)}</div>
          </div>
        </div>
      `).join('');
    }

    // Notifications
    const notifList = document.getElementById('notifList');

    const notifications = (dashboardRes.notifications || []).map(n => ({
      message: n.message,
      status: n.is_read ? 'read' : 'unread',
      timestamp: n.created_at
    }));
    
    renderNotifications(notifList, notifications); 

  } catch (err) {
    console.error('Failed to load dashboard:', err);
  } finally {
    showSkeleton(false);
  }
}

function renderNotifications(container, notifications) {
  if (!notifications || notifications.length === 0) {
    container.innerHTML = '<div class="empty-state-mini">Tidak ada notifikasi</div>';
    return;
  }

  container.innerHTML = notifications.map(n => `
    <div class="notif-item ${n.status === 'unread' ? 'unread' : ''}">
      <div class="notif-icon">${n.status === 'unread' ? '🔔' : '🔕'}</div>
      <div class="notif-text">${n.message}</div>
      <div class="notif-time">${timeAgo(n.timestamp)}</div>
    </div>
  `).join('');
}

function viewDetail(id) {
  apiFetch(`/api/laporan/${id}`)
    .then(res => {
      if (res.success) showDetailModal(res.data);
    })
    .catch(err => alert('Gagal memuat detail'));
}

function verifyReport(id) {
  apiFetch(`/api/laporan/${id}/verify`, {
    method: 'POST',
    body: JSON.stringify({
      status: 'diverifikasi'
    })
  })
    .then(res => {
      if (res.success) {
        showSuccess('Laporan berhasil diverifikasi!');
        loadDashboardData();
      } else {
        showError(
          res.message || 'Gagal memverifikasi laporan'
        );
      }
    })
    .catch(err => {
      console.error('Verification error:', err);
      showError('Terjadi kesalahan saat memverifikasi laporan');
    });
}

function showSkeleton(show) {
  document.getElementById('skeletonLoading').style.display = show ? 'block' : 'none';
  document.getElementById('dashboardContent').style.display = show ? 'none' : 'block';
}

function getStatusBadge(status) {
  const map = {
    'draft': '<span class="status-badge status-draft">Draft</span>',
    'diajukan': '<span class="status-badge status-diajukan">Diajukan</span>',
    'diteruskan': '<span class="status-badge status-diteruskan">Diteruskan</span>',
    'disetujui': '<span class="status-badge status-disetujui">Disetujui</span>',
    'revisi_admin': '<span class="status-badge status-revisi">Revisi Admin</span>',
    'revisi_kantor': '<span class="status-badge status-revisi">Revisi Kantor</span>'
  };
  return map[status] || `<span class="status-badge">${status}</span>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return `${Math.floor(diff/60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff/3600)} jam lalu`;
  return `${Math.floor(diff/86400)} hari lalu`;
}

function showSuccess(msg) {
  alert(msg);
}

function showError(msg) {
  alert(msg);
}

// ── Auto-refresh every 60 seconds ───────────────────────
let _dashPollInterval = null;

function startDashboardPolling() {
  clearInterval(_dashPollInterval);
  _dashPollInterval = setInterval(() => {
    if (document.hidden) return;
    loadDashboardData();
  }, 60000);
}
