// ══════════════════════════════════════════════════
// ADMIN SEKSI NAVIGATION CONFIG
// Canonical routes only: every href points to an existing page.
// ══════════════════════════════════════════════════

(function () {
  'use strict';

  try { window.AdminSectionNav = {
    MENU: [
      { id: 'beranda',   label: 'Dashboard',      href: '/admin-section/dashboard.html', icon: 'star' },
      { group: 'VERIFIKASI' },
      { id: 'diajukan',  label: 'Diajukan',       href: '/admin-section/laporan.html?status=diajukan', icon: 'clipboard' },
      { id: 'diteruskan',label: 'Diteruskan',     href: '/admin-section/laporan.html?status=diteruskan', icon: 'check' },
      { id: 'revisi',    label: 'Revisi',         href: '/admin-section/laporan.html?status=revisi_admin', icon: 'warning' },
      { group: 'MANAJEMEN' },
      { id: 'laporan',   label: 'Semua Laporan',  href: '/admin-section/laporan.html', icon: 'doc' },
      { id: 'pegawai',   label: 'Data Pegawai',   href: '/admin-section/pegawai.html', icon: 'users' },
      { group: 'LAINNYA' },
      { id: 'rekap',     label: 'Rekap Laporan',  href: '/admin-section/rekap.html', icon: 'chart' },
      { id: 'notif',     label: 'Notifikasi',     href: '/admin-section/notifikasi.html', icon: 'bell', badgeId: 'sidebarNotifBadge' },
      { id: 'profil',    label: 'Profil Saya',    href: '/admin-section/profil.html', icon: 'user' }
    ],

    getActivePage: function (pathname, params) {
      var file = pathname.split('/').pop() || 'dashboard.html';
      var status = params.get('status');
      if (file === 'dashboard.html') return 'beranda';
      if (file === 'laporan.html') {
        if (status === 'diajukan') return 'diajukan';
        if (status === 'diteruskan') return 'diteruskan';
        if (status === 'revisi_admin' || status === 'revisi_kantor') return 'revisi';
        return 'laporan';
      }
      if (file === 'pegawai.html') return 'pegawai';
      if (file === 'rekap.html') return 'rekap';
      if (file === 'notifikasi.html') return 'notif';
      if (file === 'profil.html') return 'profil';
      return 'beranda';
    },

    badgeIds: ['sidebarNotifBadge']
  }; } catch (e) { console.warn('admin-section-navigation: failed to assign window.AdminSectionNav', e); }

})();
