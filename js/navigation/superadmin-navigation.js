// ══════════════════════════════════════════════════
// SUPERADMIN NAVIGATION CONFIG
// All functional superadmin pages
// ══════════════════════════════════════════════════

(function () {
  'use strict';

  try { window.SuperadminNav = {
    MENU: [
      {
        id: 'beranda',
        label: 'Dashboard',
        href: '/superadmin/dashboard.html',
        icon: 'star'
      },

      {
        id: 'pengguna',
        label: 'Manajemen Pengguna',
        href: '/superadmin/pengguna.html',
        icon: 'users'
      },

      {
        id: 'seksi',
        label: 'Manajemen Seksi',
        href: '/superadmin/seksi.html',
        icon: 'building'
      },

      {
        id: 'periode',
        label: 'Manajemen Periode',
        href: '/superadmin/periode.html',
        icon: 'calendar'
      },

      {
        id: 'semua-laporan',
        label: 'Semua Laporan',
        href: '/superadmin/laporan.html',
        icon: 'doc'
      },

      {
        id: 'monitoring',
        label: 'Monitoring',
        href: '/superadmin/monitoring.html',
        icon: 'chart'
      },

      {
        id: 'audit',
        label: 'Audit Trail',
        href: '/superadmin/audit.html',
        icon: 'clipboard'
      },

      {
        id: 'notifikasi',
        label: 'Notifikasi',
        href: '/superadmin/notifikasi.html',
        icon: 'bell'
      },

      {
        id: 'backup',
        label: 'Data & Backup',
        href: '/superadmin/backup.html',
        icon: 'save'
      },

      {
        id: 'pengaturan',
        label: 'Pengaturan Sistem',
        href: '/superadmin/pengaturan.html',
        icon: 'settings'
      }
    ],

    getActivePage: function (pathname, params) {
      var file = pathname.split('/').pop() || 'dashboard.html';
      var map = {
        'dashboard.html': 'beranda',
        'pengguna.html': 'pengguna',
        'seksi.html': 'seksi',
        'periode.html': 'periode',
        'laporan.html': 'semua-laporan',
        'monitoring.html': 'monitoring',
        'audit.html': 'audit',
        'notifikasi.html': 'notifikasi',
        'backup.html': 'backup',
        'pengaturan.html': 'pengaturan',
      };
      return map[file] || 'beranda';
    },

    badgeIds: []
  }; } catch (e) { console.warn('superadmin-navigation: failed to assign window.SuperadminNav', e); }

})();
