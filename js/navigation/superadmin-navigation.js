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
        icon: '★'
      },
    
      {
        id: 'pengguna',
        label: 'Manajemen Pengguna',
        href: '/superadmin/pengguna.html',
        icon: '👤'
      },
    
      {
        id: 'seksi',
        label: 'Manajemen Seksi',
        href: '/superadmin/seksi.html',
        icon: '🏢'
      },
    
      {
        id: 'periode',
        label: 'Manajemen Periode',
        href: '/superadmin/periode.html',
        icon: '📅'
      },
    
      {
        id: 'semua-laporan',
        label: 'Semua Laporan',
        href: '/superadmin/laporan.html',
        icon: '📄'
      },
    
      {
        id: 'monitoring',
        label: 'Monitoring',
        href: '/superadmin/monitoring.html',
        icon: '📊'
      },
    
      {
        id: 'audit',
        label: 'Audit Trail',
        href: '/superadmin/audit.html',
        icon: '📋'
      },
    
      {
        id: 'notifikasi',
        label: 'Notifikasi',
        href: '/superadmin/notifikasi.html',
        icon: '🔔'
      },
    
      {
        id: 'backup',
        label: 'Data & Backup',
        href: '/superadmin/backup.html',
        icon: '💾'
      },
    
      {
        id: 'pengaturan',
        label: 'Pengaturan Sistem',
        href: '/superadmin/pengaturan.html',
        icon: '⚙️'
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
