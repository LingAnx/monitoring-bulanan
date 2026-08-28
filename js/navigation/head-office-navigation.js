// ══════════════════════════════════════════════════
// HEAD OFFICE (KEPALA KANTOR) NAVIGATION CONFIG
// Uses the existing persetujuan.html tabs; no dead page routes.
// ══════════════════════════════════════════════════

(function () {
  'use strict';

  try { window.HeadOfficeNav = {
    MENU: [
      { id: 'beranda',      label: 'Dashboard',            href: '/head-office/dashboard.html', icon: '★' },
      { group: 'PERSETUJUAN' },
      { id: 'pending',      label: 'Menunggu Persetujuan', href: '/head-office/persetujuan.html?tab=pending', icon: '⏳' },
      { id: 'revision',     label: 'Perlu Revisi',         href: '/head-office/persetujuan.html?tab=pending&show=revisi', icon: '⚠' },
      { id: 'approved',     label: 'Disetujui',            href: '/head-office/persetujuan.html?tab=history', icon: '✓' },
      { group: 'MONITORING' },
      { id: 'monitoring',   label: 'Monitoring Seksi',     href: '/head-office/persetujuan.html?tab=monitoring', icon: '🔍' },
      { id: 'all-reports',  label: 'Semua Laporan',        href: '/head-office/persetujuan.html?tab=reports', icon: '📂' },
      { id: 'archive',      label: 'Arsip Laporan',        href: '/head-office/persetujuan.html?tab=archive', icon: '📁' },
      { id: 'history',      label: 'Riwayat Persetujuan',  href: '/head-office/persetujuan.html?tab=history', icon: '🕘' },
      { group: 'LAINNYA' },
      { id: 'notif',        label: 'Notifikasi',           href: '/head-office/notifikasi.html', icon: '🔔', badgeId: 'sidebarNotifBadge' },
      { id: 'profil',       label: 'Profil Saya',          href: '/head-office/profil.html', icon: '♡' }
    ],

    getActivePage: function (pathname, params) {
      var file = pathname.split('/').pop() || 'dashboard.html';
      var tab = params.get('tab');
      var show = params.get('show');
      if (file === 'dashboard.html') return 'beranda';
      if (file === 'persetujuan.html') {
        if (tab === 'pending' && show === 'revisi') return 'revision';
        if (tab === 'pending') return 'pending';
        if (tab === 'history') return 'approved';
        if (tab === 'monitoring') return 'monitoring';
        if (tab === 'reports') return 'all-reports';
        if (tab === 'archive') return 'archive';
        return 'pending';
      }
      if (file === 'notifikasi.html') return 'notif';
      if (file === 'profil.html') return 'profil';
      return 'beranda';
    },

    badgeIds: ['sidebarNotifBadge']
  }; } catch (e) { console.warn('head-office-navigation: failed to assign window.HeadOfficeNav', e); }

})();
