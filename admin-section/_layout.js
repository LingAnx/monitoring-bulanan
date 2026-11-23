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
      // API eksplisit: pisahkan pageTitle dari activeId.
      // activeId disorot dari URL + query parameter via getActivePage()
      // (di dalam layout) — sehingga menu yang benar tersorot untuk
      // Dashboard, Diajukan, Diteruskan, Revisi, Semua Laporan, Pegawai,
      // Rekap, Notifikasi, dan Profil.
      AdminSectionLayout.init({
        pageTitle: pageTitle,
        activeId: (window.AdminSectionNav && window.AdminSectionNav.getActivePage)
          ? window.AdminSectionNav.getActivePage(
              window.location.pathname,
              new URLSearchParams(window.location.search)
            )
          : undefined
      });
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
