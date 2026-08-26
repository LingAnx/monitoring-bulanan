// ══════════════════════════════════════════════════
// SUPERADMIN PAGE LAYOUT HELPER
// Load this on every superadmin page
// ══════════════════════════════════════════════════

(function () {
  'use strict';

  window.initSuperadminPage = function (pageTitle) {
    var titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = pageTitle || 'Dashboard';

    if (window.SuperadminLayout) {
      SuperadminLayout.init(pageTitle);
    }

    loadNotifBadge();
  };

  async function loadNotifBadge() {
    try {
      var notif = await apiFetch('/api/notifications/unread-count');
      var count = notif && notif.data ? notif.data.count : 0;
      if (window.SuperadminLayout) SuperadminLayout.setNotifBadge(count);
    } catch (e) { /* ignore */ }
  }

})();
