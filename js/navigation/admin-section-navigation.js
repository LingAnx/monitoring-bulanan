// ══════════════════════════════════════════════════
// ADMIN SEKSI NAVIGATION CONFIG
// Canonical routes only: every href points to an existing page.
// ══════════════════════════════════════════════════

(function () {
  'use strict';

  try { window.AdminSectionNav = {
    MENU: [
      { id: 'beranda',   label: 'Dashboard',      href: '/admin-section/dashboard.html', icon: '&#9733;' },
      { group: 'VERIFIKASI' },
      { id: 'diajukan',  label: 'Diajukan',       href: '/admin-section/laporan.html?status=diajukan', icon: '&#128203;' },
      { id: 'diteruskan',label: 'Diteruskan',     href: '/admin-section/laporan.html?status=diteruskan', icon: '&#9989;' },
      { id: 'revisi',    label: 'Revisi',         href: '/admin-section/laporan.html?status=revisi_admin', icon: '&#9888;' },
      { group: 'MANAJEMEN' },
      { id: 'laporan',   label: 'Semua Laporan',  href: '/admin-section/laporan.html', icon: '&#128196;' },
      { id: 'pegawai',   label: 'Data Pegawai',   href: '/admin-section/pegawai.html', icon: '&#128104;&#65039;' },
      { group: 'LAINNYA' },
      { id: 'rekap',     label: 'Rekap Laporan',  href: '/admin-section/rekap.html', icon: '&#128200;' },
      { id: 'notif',     label: 'Notifikasi',     href: '/admin-section/notifikasi.html', icon: '&#128276;', badgeId: 'sidebarNotifBadge' },
      { id: 'profil',    label: 'Profil Saya',    href: '/admin-section/profil.html', icon: '&#9825;' }
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
