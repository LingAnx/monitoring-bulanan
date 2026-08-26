// ══════════════════════════════════════════════════
// EMPLOYEE NAVIGATION CONFIG
// ══════════════════════════════════════════════════

(function () {
  'use strict';

  try { window.EmployeeNav = {
    MENU: [
      { id: 'beranda',         label: 'Dashboard',        href: '/employee/dashboard.html',        icon: '&#9733;' },
      { group: 'LAPORAN' },
      { id: 'laporan',         label: 'Laporan Saya',     href: '/employee/laporan.html',          icon: '&#128196;' },
      { id: 'buat',            label: 'Buat Laporan',     href: '/employee/form.html?action=create', icon: '&#43;' },
      { id: 'draft',           label: 'Draft',            href: '/employee/laporan.html?action=draft', icon: '&#128196;', badgeId: 'draftBadge' },
      { id: 'berjalan',        label: 'Laporan Berjalan', href: '/employee/laporan.html?action=berjalan', icon: '&#9203;', badgeId: 'berjalanBadge' },
      { id: 'riwayat',         label: 'Riwayat Laporan',  href: '/employee/laporan.html?action=riwayat', icon: '&#128197;' },
      { group: 'LAINNYA' },
      { id: 'notif',           label: 'Notifikasi',       href: '/employee/notifikasi.html',       icon: '&#128276;', badgeId: 'sidebarNotifBadge' },
      { id: 'profil',          label: 'Profil Saya',      href: '/employee/profil.html',           icon: '&#9825;' }
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
