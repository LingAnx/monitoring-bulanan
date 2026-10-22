// ══════════════════════════════════════════════════
// NOTIFIKASI - Shared Layout Version
// Uses admin-section-layout.js for sidebar/topbar
// ══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  const authenticated = await initAuth();
  if (!authenticated) return;

  let userRole = null;
  try { userRole = requireRole('KEPALA_KANTOR'); } catch (e) {
    if (e.message === 'AUTH_REQUIRED' || e.message.startsWith('ACCESS_DENIED')) {
      window.location.href = '/login.html';
    }
    return;
  }
  
  initHeadOfficePage('Notifikasi');
  await loadNotifications();
  startPolling();
});

const ICON_MAP = { success: '<span class="icon icon-check"></span>', warning: '<span class="icon icon-warning"></span>', info: '<span class="icon icon-info"></span>', danger: '<span class="icon icon-warning"></span>' };

async function loadNotifications() {
  try {
    const result = await apiFetch('/api/notifications');
    if (!result.success) return;

    const notifications = result.data || [];
    const unread = result.unread || 0;

    const badge = document.getElementById('notifBadge');
    if (badge) {
      if (unread > 0) {
        badge.textContent = unread > 99 ? '99+' : unread;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    const markAllBtn = document.getElementById('markAllReadBtn');
    if (markAllBtn) {
      unread > 0 ? markAllBtn.classList.remove('hidden') : markAllBtn.classList.add('hidden');
    }

    const container = document.getElementById('notifContent');
    if (notifications.length === 0) {
      container.innerHTML = `
        <div class="empty-notif">
          <div class="empty-notif-icon"><span class="icon icon-bell"></span></div>
          <div class="empty-state-text">Belum ada notifikasi</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `<ul class="notif-list">${notifications.map(n => renderNotifItem(n)).join('')}</ul>`;
  } catch (err) {
    showNotification('Gagal memuat notifikasi', 'error');
  }
}

function renderNotifItem(n) {
  const timeStr = formatRelativeTime(n.created_at);
  const icon = ICON_MAP[n.type] || '<span class="icon icon-info"></span>';
  return `
    <li class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markRead(${n.id})">
      <div class="notif-icon notif-icon-${n.type || 'info'}">${icon}</div>
      <div class="notif-body">
        <div class="notif-title">${escapeHtml(n.title)}</div>
        <div class="notif-message">${escapeHtml(n.message)}</div>
      </div>
      <span class="notif-time">${timeStr}</span>
      <button type="button" class="notif-delete" onclick="event.stopPropagation();deleteNotif(${n.id})" title="Hapus">&times;</button>
    </li>
  `;
}

window.markRead = async function(id) {
  await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
  loadNotifications();
};

window.markAllRead = async function() {
  await apiFetch('/api/notifications/read-all', { method: 'POST' });
  loadNotifications();
};

window.deleteNotif = async function(id) {
  await apiFetch(`/api/notifications/${id}`, { method: 'DELETE' });
  loadNotifications();
};

function formatRelativeTime(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} hari lalu`;
  return formatDate(dateStr);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

let pollTimer = null;
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    const badge = document.getElementById('notifBadge');
    if (badge && !badge.classList.contains('hidden')) {
      loadNotifications();
    }
  }, 30000);
}
