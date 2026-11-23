// ══════════════════════════════════════════════════
// SUPERADMIN LAYOUT — Dynamic sidebar & topbar
// ══════════════════════════════════════════════════

(function () {
  'use strict';

  var NavConfig = window.SuperadminNav;
  if (!NavConfig) {
    console.error('SuperadminNav not loaded');
    return;
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'className') e.className = attrs[k];
      else if (k === 'textContent') e.textContent = attrs[k];
      else if (k === 'innerHTML') e.innerHTML = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (typeof c === 'string') e.appendChild(document.createTextNode(c));
        else if (c && c.nodeType) e.appendChild(c);
      });
    }
    return e;
  }

  function escapeHtml(t) {
    var d = document.createElement('div');
    d.textContent = t || '';
    return d.innerHTML;
  }

  function getActivePage() {
    var path = window.location.pathname.split('/').pop() || 'dashboard.html';
    return NavConfig.getActivePage(path, new URLSearchParams(window.location.search));
  }

  function renderSidebar() {
    var nav = document.getElementById('sidebarNav');
    if (!nav) return;
    nav.innerHTML = '';

    var activePage = getActivePage();

    NavConfig.MENU.forEach(function (item) {
      if (item.group) {
        var sec = el('div', { className: 'nav-section' });
        sec.appendChild(el('div', { className: 'nav-section-title', textContent: item.group }));
        nav.appendChild(sec);
        return;
      }

      var a = el('a', {
        className: 'nav-item' + (item.id === activePage ? ' nav-item-active' : ''),
        href: item.href,
        'data-page': item.id
      });
      a.appendChild(navIcon(item.icon || 'doc'));
      a.appendChild(el('span', { className: 'nav-label', textContent: item.label }));
      nav.appendChild(a);
    });

    var footer = document.querySelector('.sidebar-footer');
    if (!footer) {
      footer = el('div', { className: 'sidebar-footer' });
      var aside = document.getElementById('sidebar');
      if (aside) aside.appendChild(footer);
    }
    footer.innerHTML = '';
    var logout = el('a', { className: 'nav-item logout-item', href: '#' });
    logout.addEventListener('click', function (e) { e.preventDefault(); handleLogout(); });
    var logoutIcon = icon('logout'); logoutIcon.classList.add('nav-icon');
    logout.appendChild(logoutIcon);
    logout.appendChild(el('span', { className: 'nav-label', textContent: 'Logout' }));
    footer.appendChild(logout);
  }

  function renderTopbar(pageTitle) {
    var header = document.querySelector('.topbar');
    if (!header) return;
    header.innerHTML = '';

    var user = (typeof AuthStore !== 'undefined' && AuthStore.getCurrentUser()) || null;
    var left = el('div', { className: 'topbar-left' });
    var menuBtn = el('button', {
      className: 'mobile-menu-btn',
      id: 'mobileMenuBtn',
      type: 'button',
      'aria-label': 'Buka menu navigasi',
      'aria-expanded': 'false',
      'aria-controls': 'sidebar'
    });
    menuBtn.appendChild(icon('menu'));
    left.appendChild(menuBtn);

    var titleEl = el('div', { className: 'topbar-title-wrap' });
    titleEl.appendChild(el('span', { className: 'topbar-page-title', id: 'pageTitle', textContent: pageTitle || 'Dashboard' }));
    left.appendChild(titleEl);

    var right = el('div', { className: 'topbar-right' });

    var notifBtn = el('a', { className: 'notif-btn', id: 'notifBtn', href: '/superadmin/notifikasi.html', title: 'Notifikasi' });
    var bellIcon = icon('bell');
    notifBtn.appendChild(bellIcon);
    notifBtn.appendChild(el('span', { className: 'notif-badge hidden', id: 'notifBadge', textContent: '0' }));
    right.appendChild(notifBtn);

    var profileWrap = el('div', { className: 'profile-wrap' });
    profileWrap.innerHTML = '<button type="button" class="profile-trigger" id="profileTrigger" aria-haspopup="true" aria-expanded="false" aria-controls="profileDropdown" aria-label="Menu profil"><span class="profile-avatar" id="profileAvatar">' + (user ? user.nama.charAt(0).toUpperCase() : '-') + '</span><span class="profile-name" id="profileName">' + escapeHtml(user ? user.nama : '-') + '</span></button>';
    right.appendChild(profileWrap);

    header.appendChild(left);
    header.appendChild(right);

    var trigger = document.getElementById('profileTrigger');
    var dropdown = document.createElement('ul');
    dropdown.className = 'profile-dropdown hidden';
    dropdown.id = 'profileDropdown';
    profileWrap.appendChild(dropdown);
    function syncDropdownAria() {
      trigger.setAttribute('aria-expanded', String(!dropdown.classList.contains('hidden')));
    }
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
      syncDropdownAria();
    });
    document.addEventListener('click', function () {
      dropdown.classList.add('hidden');
      syncDropdownAria();
    });
    [
      { label: 'Manajemen Pengguna', href: '/superadmin/pengguna.html' }, 
    ].forEach(function (item) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.label;
      li.appendChild(a);
      dropdown.appendChild(li);
    });
    var logoutLi = document.createElement('li');
    var logoutA = document.createElement('a');
    logoutA.href = '#';
    logoutA.textContent = 'Logout';
    logoutA.addEventListener('click', function (e) { e.preventDefault(); handleLogout(); });
    logoutLi.appendChild(logoutA);
    dropdown.appendChild(logoutLi);
  }

  // ── Mobile Menu ─────────────────────────────────────
  var _escapeBound = false;

  function setupMobileMenu() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    var menuBtn = document.getElementById('mobileMenuBtn');
    var toggleBtn = document.getElementById('sidebarToggle');

    function syncAria() {
      var expanded = !!(sidebar && sidebar.classList.contains('open'));
      if (menuBtn) menuBtn.setAttribute('aria-expanded', String(expanded));
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(expanded));
    }

    function openSidebar() {
      if (sidebar) sidebar.classList.add('open');
      if (overlay) overlay.classList.add('active');
      syncAria();
    }
    function closeSidebar() {
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('active');
      syncAria();
    }
    function toggleSidebar() {
      if (!sidebar) return;
      var open = !sidebar.classList.contains('open');
      if (open) openSidebar(); else closeSidebar();
    }

    // Tombol hamburger di topbar — pasang listener per tombol
    // (tombol baru dibuat tiap renderTopbar, jadi aman dari duplikat).
    if (menuBtn) menuBtn.addEventListener('click', toggleSidebar);
    // Toggle di sidebar-header (desktop collapse)
    if (toggleBtn) toggleBtn.addEventListener('click', toggleSidebar);
    // Overlay menutup
    if (overlay) overlay.addEventListener('click', closeSidebar);

    // Escape menutup sidebar + dropdown profile — SATU listener global
    // (flag modul mencegah duplikat saat init berulang).
    if (!_escapeBound) {
      _escapeBound = true;
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        closeSidebar();
        var dd = document.getElementById('profileDropdown');
        if (dd) {
          dd.classList.add('hidden');
          var trig = document.getElementById('profileTrigger');
          if (trig) trig.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Bersihkan state open/active saat kembali ke desktop (resize).
    // Listener dipasang sekali — guarded oleh data attr.
    if (!document.body.hasAttribute('data-sidebar-resize-bound')) {
      document.body.setAttribute('data-sidebar-resize-bound', '1');
      var mq = window.matchMedia('(min-width: 1025px)');
      var handler = function () {
        if (mq.matches) closeSidebar();
      };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    }
  }

  window.SuperadminLayout = {
    init: function (pageTitle) {
      renderSidebar();
      renderTopbar(pageTitle || 'Dashboard');
      setupMobileMenu();
    },

    setUserInfo: function (name, role) {
      var el2 = document.getElementById('userName');
      var roleEl = document.getElementById('roleBadge');
      var avatarEl = document.getElementById('profileAvatar');
      var profileNameEl = document.getElementById('profileName');
      if (el2) el2.textContent = name || '-';
      if (roleEl) {
        roleEl.textContent = role
          ? (typeof T !== 'undefined' && T.role ? T.role[role] || role : role)
          : '-';
      }
      if (avatarEl) avatarEl.textContent = (name || '-').charAt(0).toUpperCase();
      if (profileNameEl) profileNameEl.textContent = name || '-';
    },
    setGreeting: function () {
      var h = new Date().getHours();
      var g = 'Selamat Pagi';
      if (h >= 11 && h < 15) g = 'Selamat Siang';
      else if (h >= 15 && h < 18) g = 'Selamat Sore';
      else if (h >= 18) g = 'Selamat Malam';
      var el3 = document.getElementById('greeting');
      if (el3) el3.textContent = g + ',';
    },
    setNotifBadge: function (count) {
      var badge = document.getElementById('notifBadge');
      if (!badge) return;
      if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.classList.remove('hidden'); }
      else badge.classList.add('hidden');
    }
  };

})();

window.initSuperadmin = function (pageTitle) {
  SuperadminLayout.init(pageTitle);
};
