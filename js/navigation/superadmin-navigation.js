// ══════════════════════════════════════════════════
// SUPERADMIN NAVIGATION CONFIG
// Only pages that currently exist are exposed.
// ══════════════════════════════════════════════════

(function () {
  'use strict';

  try { window.SuperadminNav = {
    MENU: [
      { id: 'beranda',    label: 'Dashboard',          href: '/superadmin/dashboard.html', icon: '&#9733;' },
      { group: 'MANAJEMEN' },
      { id: 'pengguna',   label: 'Manajemen Pengguna', href: '/superadmin/pengguna.html', icon: '&#128104;&#65039;' },
    ],

    getActivePage: function (pathname, params) {
      var file = pathname.split('/').pop() || 'dashboard.html';
      if (file === 'dashboard.html') return 'beranda';
      if (file === 'pengguna.html') return 'pengguna';
      return 'beranda';
    },

    badgeIds: []
  }; } catch (e) { console.warn('superadmin-navigation: failed to assign window.SuperadminNav', e); }

})();
