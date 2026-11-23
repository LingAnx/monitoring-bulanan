document.addEventListener('DOMContentLoaded', async () => {
  const authenticated = await initAuth();
  if (!authenticated) return;
  try { requireRole('SUPERADMIN'); } catch (e) {
    if (e.message === 'AUTH_REQUIRED') window.location.href = '/login.html';
    else { redirectToDashboard(AuthStore.getRole()); }
    return;
  }
  initSuperadminPage('Data & Backup');
  await loadBackups();
});

async function loadBackups() {
  const container = document.getElementById('backupContent');
  try {
    const result = await apiFetch('/api/superadmin/backup/list');
    const backups = result.data || [];
    if (backups.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128190;</div><div class="empty-state-text">Belum ada backup.</div></div>';
      return;
    }
    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Nama File</th><th>Ukuran</th><th>Dibuat</th><th>Aksi</th></tr></thead>
        <tbody>
          ${backups.map(b => `
            <tr data-backup-filename="${encodeURIComponent(b.filename)}">
              <td style="font-family:monospace;font-size:0.8rem">${escapeHtmlText(b.filename)}</td>
              <td>${formatSize(b.size)}</td>
              <td>${formatDateTime(b.created_at)}</td>
              <td><button class="btn btn-sm btn-outline act-dl-backup">Download</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Event delegation for backup download.
    // FIX: dataset.backupFilename adalah string URL-encoded dari encodeURIComponent.
    // Konversi eksplisit + validasi: filename valid adalah string singkat dengan
    // karakter [a-zA-Z0-9._-] saja. Jika tidak valid, jangan jalankan apa-apa.
    const isValidBackupName = (s) =>
      typeof s === 'string' && s.length > 0 && s.length <= 100 && /^[a-zA-Z0-9._-]+$/.test(s);
    container.querySelectorAll('[data-backup-filename]').forEach(el => {
      const fname = decodeURIComponent(el.dataset.backupFilename || '');
      if (!isValidBackupName(fname)) return;
      const btn = el.querySelector('.act-dl-backup');
      if (btn) btn.addEventListener('click', () => downloadBackup(fname));
    });
  } catch (err) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#9888;</div><div class="empty-state-text">Gagal memuat daftar backup.</div></div>';
  }
}

window.createBackup = async function() {
  if (!confirm('Buat backup database sekarang?')) return;
  try {
    const result = await apiFetch('/api/superadmin/backup', { method: 'POST' });
    if (result.success) {
      showNotification(result.message || 'Backup berhasil dibuat', 'success');
      loadBackups();
    }
  } catch (err) { showNotification(err.message || 'Gagal membuat backup', 'error'); }
};

window.downloadBackup = async function(filename) {
  try {
    const token = AuthStore.getToken();
    const res = await fetch(`/api/superadmin/backup/download/${encodeURIComponent(filename)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Gagal mengunduh');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) { showNotification(err.message || 'Gagal mengunduh backup', 'error'); }
};

window.exportUsers = async function() {
  try {
    const result = await apiFetch('/api/superadmin/export/users');
    downloadJson(result.data, 'users-export.json');
  } catch (err) { showNotification(err.message || 'Gagal mengekspor', 'error'); }
};

window.exportReports = async function() {
  try {
    const result = await apiFetch('/api/superadmin/export/reports');
    downloadJson(result.data, 'reports-export.json');
  } catch (err) { showNotification(err.message || 'Gagal mengekspor', 'error'); }
};

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
         d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
