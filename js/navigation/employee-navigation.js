// ══════════════════════════════════════════════════
// EMPLOYEE NAVIGATION CONFIG
// ══════════════════════════════════════════════════

(function () {
  'use strict';

  try { window.EmployeeNav = {
    MENU: [
      { id: 'beranda',         label: 'Dashboard',        href: '/employee/dashboard.html',        icon: 'star' },
      { group: 'LAPORAN' },
      { id: 'laporan',         label: 'Laporan Saya',     href: '/employee/laporan.html',          icon: 'doc' },
      { id: 'buat',            label: 'Buat Laporan',     href: '/employee/form.html?action=create', icon: 'plus' },
      { id: 'draft',           label: 'Draft',            href: '/employee/laporan.html?action=draft', icon: 'doc', badgeId: 'draftBadge' },
      { id: 'berjalan',        label: 'Laporan Berjalan', href: '/employee/laporan.html?action=berjalan', icon: 'hourglass', badgeId: 'berjalanBadge' },
      { id: 'riwayat',         label: 'Riwayat Laporan',  href: '/employee/laporan.html?action=riwayat', icon: 'calendar' },
      { group: 'LAINNYA' },
      { id: 'notif',           label: 'Notifikasi',       href: '/employee/notifikasi.html',       icon: 'bell', badgeId: 'sidebarNotifBadge' },
      { id: 'profil',          label: 'Profil Saya',      href: '/employee/profil.html',           icon: 'user' }
    ],

    getMenu: function (activePage) {
      return this.MENU;
    },

    getActivePage: function (pathname, params) {
      var file = pathname.split('/').pop() || 'dashboard.html';
      var action = params.get('action');
      if (file === 'dashboard.html') return 'beranda';
      if (file === 'laporan.html') {
        if (action === 'draft') return 'draft';
        if (action === 'berjalan') return 'berjalan';
        if (action === 'riwayat') return 'riwayat';
        return 'laporan';
      }
      if (file === 'form.html') return 'buat';
      if (file === 'notifikasi.html') return 'notif';
      if (file === 'profil.html') return 'profil';
      return 'beranda';
    },

    badgeIds: ['draftBadge', 'berjalanBadge', 'sidebarNotifBadge']
  }; } catch (e) { console.warn('employee-navigation: failed to assign window.EmployeeNav', e); }

})();
