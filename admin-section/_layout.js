// ══════════════════════════════════════════════════
// ADMIN SECTION PAGE LAYOUT HELPER
// Load this on every admin-section page
// ══════════════════════════════════════════════════

(function () {
  'use strict';

  window.initAdminSectionPage = function (pageTitle) {
    var titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = pageTitle || 'Dashboard';

    if (window.AdminSectionLayout) {
      AdminSectionLayout.init(pageTitle);
    }

    if (window.AdminSectionLayout) {
      AdminSectionLayout.setGreeting();
    }

    loadNotifBadge();
  };

  async function loadNotifBadge() {
    try {
      var notif = await apiFetch('/api/notifications/unread-count');
      var count = notif && notif.data ? notif.data.count : 0;
      if (window.AdminSectionLayout) AdminSectionLayout.setNotifBadge(count);
    } catch (e) { /* ignore */ }
  }

})();
