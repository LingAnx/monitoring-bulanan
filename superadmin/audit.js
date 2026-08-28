document.addEventListener('DOMContentLoaded', async () => {
  const authenticated = await initAuth();
  if (!authenticated) return;
  try { requireRole('SUPERADMIN'); } catch (e) {
    if (e.message === 'AUTH_REQUIRED') window.location.href = '/login.html';
    else { redirectToDashboard(AuthStore.getRole()); }
    return;
  }
  initSuperadminPage('Audit Trail');
  await loadAudit();
});

let auditPage = 1;

async function loadAudit() {
  const container = document.getElementById('auditContent');
  const bulan = document.getElementById('filterBulan').value;
  const tahun = document.getElementById('filterTahun').value;
  const action = document.getElementById('filterAction').value;

  let url = `/api/superadmin/audit-trail?page=${auditPage}&limit=50`;
  const params = [];
  if (bulan) params.push(`bulan=${bulan}`);
  if (tahun) params.push(`tahun=${tahun}`);
  if (action) params.push(`action=${encodeURIComponent(action)}`);
  if (params.length) url += '&' + params.join('&');

  try {
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Memuat data...</p></div>';
    const result = await apiFetch(url);
    const entries = result.data || [];
    const pagination = result.pagination || {};

    if (entries.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128203;</div><div class="empty-state-text">Belum ada audit trail.</div></div>';
      document.getElementById('auditPagination').innerHTML = '';
      return;
    }

    const ACTION_LABELS = {
      'user.create': 'Buat User', 'user.update': 'Edit User', 'user.delete': 'Hapus User',
      'user.activate': 'Aktifkan User', 'user.deactivate': 'Nonaktifkan User', 'user.password_reset': 'Reset Password',
      'periode.create': 'Buat Periode', 'periode.update': 'Edit Periode', 'periode.delete': 'Hapus Periode',
      'periode.open': 'Buka Periode', 'periode.close': 'Tutup Periode',
      'notification.send': 'Kirim Notifikasi', 'notification.broadcast': 'Broadcast Notifikasi',
      'backup.create': 'Buat Backup', 'backup.download': 'Unduh Backup',
      'settings.update': 'Ubah Pengaturan',
      'export.users': 'Ekspor Pengguna', 'export.reports': 'Ekspor Laporan',
    };

    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Waktu</th><th>Pelaku</th><th>Aksi</th><th>Detail</th></tr></thead>
        <tbody>
          ${entries.map(a => `
            <tr>
              <td>${formatDateTime(a.created_at)}</td>
              <td>${a.user_name || '-'} <small class="text-muted">(${a.user_role || '-'})</small></td>
              <td><span class="badge draft">${ACTION_LABELS[a.action] || a.action}</span></td>
              <td>${escapeHtml(a.detail || '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Pagination
    const totalPages = Math.ceil(pagination.total / pagination.limit);
    let pagHtml = '';
    if (pagination.total > pagination.limit) {
      pagHtml += `<button class="btn btn-sm btn-outline" onclick="goAuditPage(${auditPage - 1})" ${auditPage <= 1 ? 'disabled' : ''}>Prev</button>`;
      for (let i = Math.max(1, auditPage - 2); i <= Math.min(totalPages, auditPage + 2); i++) {
        pagHtml += `<button class="btn btn-sm ${i === auditPage ? 'btn-primary' : 'btn-outline'}" onclick="goAuditPage(${i})">${i}</button>`;
      }
      pagHtml += `<button class="btn btn-sm btn-outline" onclick="goAuditPage(${auditPage + 1})" ${auditPage >= totalPages ? 'disabled' : ''}>Next</button>`;
    }
    document.getElementById('auditPagination').innerHTML = pagHtml;
  } catch (err) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#9888;</div><div class="empty-state-text">Gagal memuat audit trail.</div></div>';
  }
}

window.loadAudit = loadAudit;
window.goAuditPage = function(page) {
  if (page < 1) return;
  auditPage = page;
  loadAudit();
};

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
         d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
