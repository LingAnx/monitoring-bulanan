// ══════════════════════════════════════════════════
// EMPLOYEE PAGE LAYOUT HELPER
// Load this on EVERY employee page after app.js and translations.js
// Initializes EmployeeLayout and sets up guards
// ══════════════════════════════════════════════════

(function () {
  'use strict';

  window.initEmployeePage = function (pageTitle) {
    // Set page title
    var titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = pageTitle || 'Dashboard';

    // Initialize layout
    if (window.EmployeeLayout) {
      EmployeeLayout.init(pageTitle);
    }

    // Set greeting
    if (window.EmployeeLayout) {
      EmployeeLayout.setGreeting();
    }

    // Load notif badge
    loadNotifBadge();
  };

  async function loadNotifBadge() {
    try {
      var notif = await apiFetch('/api/notifications/unread-count');
      var count = notif && notif.data ? notif.data.count : 0;
      if (window.EmployeeLayout) EmployeeLayout.setNotifBadge(count);
    } catch (e) { /* ignore */ }
  }

})();
