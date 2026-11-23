document.addEventListener('DOMContentLoaded', async () => {
  const authenticated = await initAuth();
  if (!authenticated) return;
  try { requireRole('SUPERADMIN'); } catch (e) {
    if (e.message === 'AUTH_REQUIRED') window.location.href = '/login.html';
    else { redirectToDashboard(AuthStore.getRole()); }
    return;
  }
  initSuperadminPage('Pengaturan Sistem');
  await loadSettings();
});

const SETTING_LABELS = {
  'app_name': 'Nama Aplikasi',
  'app_version': 'Versi Aplikasi',
  'report_deadline_day': 'Tenggat Laporan (hari ke-)',
  'enable_broadcast': 'Izinkan Broadcast Notifikasi'
};

async function loadSettings() {
  const container = document.getElementById('settingsContent');
  try {
    const result = await apiFetch('/api/superadmin/settings');
    if (!result.success) throw new Error(result.message);
    const settings = result.data || {};
    const keys = Object.keys(settings);
    if (keys.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#9881;&#65039;</div><div class="empty-state-text">Belum ada pengaturan.</div></div>';
      return;
    }
    container.innerHTML = `
      <form data-submit-action="saveSettings" data-action-event="true">
        ${keys.map(key => {
          const s = settings[key];
          const val = typeof s === 'object' && s !== null ? s.value : s;
          const desc = typeof s === 'object' && s !== null ? s.description : '';
          const label = SETTING_LABELS[key] || key;
          const isBool = typeof val === 'boolean';
          return `
            <div class="form-group">
              <label>${escapeHtml(label)}</label>
              ${isBool
                ? `<select data-setting="${key}" class="setting-input"><option value="true" ${val ? 'selected' : ''}>Aktif</option><option value="false" ${!val ? 'selected' : ''}>Nonaktif</option></select>`
                : `<input type="text" data-setting="${key}" value="${escapeHtml(String(val))}" class="setting-input">`
              }
              ${desc ? `<small class="text-muted">${escapeHtml(desc)}</small>` : ''}
            </div>
          `;
        }).join('')}
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Simpan Pengaturan</button>
        </div>
      </form>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#9888;</div><div class="empty-state-text">${escapeHtml(err.message || 'Gagal memuat pengaturan. Pastikan tabel settings sudah dibuat (migrasi 004).')}</div></div>`;
  }
}

window.saveSettings = async function(e) {
  e.preventDefault();
  const inputs = document.querySelectorAll('.setting-input[data-setting]');
  const updates = {};
  inputs.forEach(inp => {
    let val = inp.value;
    if (val === 'true') val = true;
    else if (val === 'false') val = false;
    updates[inp.dataset.setting] = val;
  });
  try {
    const result = await apiFetch('/api/superadmin/settings', {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
    if (result.success) {
      showNotification('Pengaturan berhasil disimpan', 'success');
      loadSettings();
    }
  } catch (err) { showNotification(err.message || 'Gagal menyimpan pengaturan', 'error'); }
};

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
