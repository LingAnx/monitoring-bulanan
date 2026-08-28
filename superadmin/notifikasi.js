document.addEventListener('DOMContentLoaded', async () => {
  const authenticated = await initAuth();
  if (!authenticated) return;
  try { requireRole('SUPERADMIN'); } catch (e) {
    if (e.message === 'AUTH_REQUIRED') window.location.href = '/login.html';
    else { redirectToDashboard(AuthStore.getRole()); }
    return;
  }
  initSuperadminPage('Notifikasi');
  await loadNotifications();
  await loadUserOptions();
});

async function loadNotifications() {
  const container = document.getElementById('notifContent');
  try {
    const result = await apiFetch('/api/notifications?limit=50');
    const notifs = result.data || [];
    if (notifs.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128276;</div><div class="empty-state-text">Belum ada notifikasi.</div></div>';
      return;
    }
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px">
        ${notifs.map(n => `
          <div style="padding:12px 16px;border-radius:10px;border:1px solid var(--gray-200);background:${n.is_read ? 'var(--gray-50)' : '#fff'};display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <div style="min-width:0">
              <div style="font-weight:600;font-size:0.9rem;color:var(--gray-900)">${escapeHtml(n.title)} ${n.is_read ? '' : '<span style="background:var(--primary);color:#fff;font-size:0.6rem;padding:2px 6px;border-radius:99px;vertical-align:middle">BARU</span>'}</div>
              <div style="font-size:0.82rem;color:var(--gray-600);margin-top:2px">${escapeHtml(n.message)}</div>
              <div style="font-size:0.72rem;color:var(--gray-400);margin-top:4px">${formatDateTime(n.created_at)}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              ${!n.is_read ? `<button class="btn btn-sm btn-outline" onclick="markRead(${n.id})">Tandai dibaca</button>` : ''}
              <button class="btn btn-sm btn-danger" onclick="deleteNotif(${n.id})">Hapus</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#9888;</div><div class="empty-state-text">Gagal memuat notifikasi.</div></div>';
  }
}

async function loadUserOptions() {
  try {
    const result = await apiFetch('/api/users');
    const sel = document.getElementById('sendTarget');
    (result.data || []).filter(u => u.is_active).forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id; opt.textContent = `${u.nama} (${u.role})`;
      sel.appendChild(opt);
    });
  } catch (e) { /* ignore */ }
}

window.showSendModal = function() {
  document.getElementById('sendModal').classList.add('active');
};

window.closeSendModal = function() {
  document.getElementById('sendModal').classList.remove('active');
};

window.sendNotification = async function(e) {
  e.preventDefault();
  const id_user = document.getElementById('sendTarget').value;
  const title = document.getElementById('sendTitle').value.trim();
  const message = document.getElementById('sendMessage').value.trim();
  const type = document.getElementById('sendType').value;
  if (!title || !message) { showNotification('Judul dan pesan wajib diisi', 'error'); return; }
  try {
    const result = await apiFetch('/api/superadmin/notifications/send', {
      method: 'POST',
      body: JSON.stringify(id_user ? { id_user, title, message, type } : { title, message, type })
    });
    if (result.success) {
      showNotification(result.message || 'Notifikasi terkirim!', 'success');
      closeSendModal();
      document.getElementById('sendTitle').value = '';
      document.getElementById('sendMessage').value = '';
    }
  } catch (err) {
    showNotification(err.message || 'Gagal mengirim notifikasi', 'error');
  }
};

window.markRead = async function(id) {
  try {
    const result = await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
    if (result.success) loadNotifications();
  } catch (err) { showNotification(err.message || 'Gagal', 'error'); }
};

window.deleteNotif = async function(id) {
  if (!confirm('Hapus notifikasi ini?')) return;
  try {
    const result = await apiFetch(`/api/notifications/${id}`, { method: 'DELETE' });
    if (result.success) loadNotifications();
  } catch (err) { showNotification(err.message || 'Gagal', 'error'); }
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
