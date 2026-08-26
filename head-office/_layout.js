// ══════════════════════════════════════════════════
// HEAD OFFICE PAGE LAYOUT HELPER
// Load this on every head-office page
// ══════════════════════════════════════════════════

(function () {
  'use strict';

  window.initHeadOfficePage = function (pageTitle) {
    var titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = pageTitle || 'Dashboard';

    if (window.HeadOfficeLayout) {
      HeadOfficeLayout.init(pageTitle);
    }

    if (window.HeadOfficeLayout) {
      HeadOfficeLayout.setGreeting();
    }

    loadNotifBadge();
  };

  async function loadNotifBadge() {
    try {
      var notif = await apiFetch('/api/notifications/unread-count');
      var count = notif && notif.data ? notif.data.count : 0;
      if (window.HeadOfficeLayout) HeadOfficeLayout.setNotifBadge(count);
    } catch (e) { /* ignore */ }
  }

})();
