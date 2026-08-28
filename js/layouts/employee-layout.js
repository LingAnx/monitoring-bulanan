// ══════════════════════════════════════════════════
// EMPLOYEE LAYOUT — Dynamic sidebar & topbar for Pegawai
// Import after employee-navigation.js
// ══════════════════════════════════════════════════

(function () {
  'use strict';

  var NavConfig = window.EmployeeNav;
  if (!NavConfig) {
    console.error('EmployeeNav not loaded');
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

  // ── Active state ────────────────────────────────────
  function getActivePage() {
    var path = window.location.pathname.split('/').pop() || 'dashboard.html';
    var params = new URLSearchParams(window.location.search);
    return NavConfig.getActivePage(path, params);
  }

  // ── Logout ──────────────────────────────────────────
  function handleLogout() {
    if (typeof AuthStore !== 'undefined' && AuthStore.logout) {
      AuthStore.logout();
      return;
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.href = '/login.html';
  }

  // ── Render Sidebar ──────────────────────────────────
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
      a.appendChild(el('span', { className: 'nav-icon', textContent: item.icon }));
      a.appendChild(el('span', { className: 'nav-label', textContent: item.label }));

      if (item.badgeId) {
        a.appendChild(el('span', { className: 'nav-badge hidden', id: item.badgeId }));
      }

      nav.appendChild(a);
    });

    // Logout
    var footer = document.querySelector('.sidebar-footer');
    if (!footer) {
      footer = el('div', { className: 'sidebar-footer' });
      var aside = document.getElementById('sidebar');
      if (aside) aside.appendChild(footer);
    }
    footer.innerHTML = '';
    var logout = el('a', { className: 'nav-item logout-item', href: '#' });
    logout.addEventListener('click', function (e) { e.preventDefault(); handleLogout(); });
    logout.appendChild(el('span', { className: 'nav-icon', textContent: '➜' }));
    logout.appendChild(el('span', { className: 'nav-label', textContent: 'Logout' }));
    footer.appendChild(logout);

    setupMobileMenu();
  }

  // ── Render Topbar ───────────────────────────────────
  function renderTopbar(pageTitle) {
    var topbar = document.getElementById('topbar');
    if (!topbar) return;

    var user = (typeof AuthStore !== 'undefined' && AuthStore.getCurrentUser()) || null;
    topbar.innerHTML = '';

    var left = el('div', { className: 'topbar-left' });
    left.appendChild(el('button', {
      className: 'mobile-menu-btn',
      id: 'mobileMenuBtn',
      type: 'button',
      'aria-label': 'Toggle menu',
      textContent: '☰'
    }));

    var titleWrap = el('div', { className: 'topbar-title-wrap' });
    titleWrap.appendChild(el('span', { className: 'topbar-page-title', id: 'pageTitle', textContent: pageTitle || 'Dashboard' }));
    left.appendChild(titleWrap);

    var right = el('div', { className: 'topbar-right' });

    var period = el('div', { className: 'period-badge', id: 'periodBadge' });
    period.appendChild(el('span', { className: 'period-dot' }));
    period.appendChild(el('span', { textContent: 'Periode Aktif: ' }));
    period.appendChild(el('strong', { id: 'activePeriod', textContent: '-' }));
    right.appendChild(period);

    var notifBtn = el('a', { className: 'notif-btn', id: 'notifBtn', href: '/employee/notifikasi.html', title: 'Notifikasi' });
    notifBtn.innerHTML = '🔔<span class="notif-badge hidden" id="notifBadge">0</span>';
    right.appendChild(notifBtn);

    var profileWrap = el('div', { className: 'profile-wrap' });
    profileWrap.innerHTML = '<div class="profile-trigger" id="profileTrigger"><span class="profile-avatar" id="profileAvatar">' + (user ? user.nama.charAt(0).toUpperCase() : '-') + '</span><span class="profile-name" id="profileName">' + escapeHtml(user ? user.nama : '-') + '</span></div>';
    // Create dropdown element so setupProfileDropdown can find it
    var dropdown = el('ul', { className: 'profile-dropdown hidden', id: 'profileDropdown' });
    profileWrap.appendChild(dropdown);
    right.appendChild(profileWrap);

    topbar.appendChild(left);
    topbar.appendChild(right);

    // Profile dropdown
    setupProfileDropdown(user);
  }

  function setupProfileDropdown(user) {
    var trigger = document.getElementById('profileTrigger');
    var dropdown = document.getElementById('profileDropdown');
    if (!trigger) return;

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (dropdown) dropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', function () {
      if (dropdown) dropdown.classList.add('hidden');
    });

    if (!dropdown) return;
    dropdown.innerHTML = '';
    var items = [
      { label: 'Profil Saya', href: '/employee/profil.html' },
      { label: 'Ubah Password', href: '/employee/profil.html#password' },
      { label: 'Logout', action: 'logout' }
    ];
    items.forEach(function (item) {
      var li = el('li');
      var a = el('a', { href: item.href || '#', textContent: item.label });
      if (item.action === 'logout') {
        a.href = '#';
        a.addEventListener('click', function (e) { e.preventDefault(); handleLogout(); });
      }
      li.appendChild(a);
      dropdown.appendChild(li);
    });
  }

  // ── Mobile Menu ─────────────────────────────────────
  function setupMobileMenu() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    var menuBtn = document.getElementById('mobileMenuBtn');
    var toggleBtn = document.getElementById('sidebarToggle');

    function openSidebar() {
      if (sidebar) sidebar.classList.add('open');
      if (overlay) overlay.classList.add('active');
    }
    function closeSidebar() {
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('active');
    }

    if (menuBtn) menuBtn.addEventListener('click', openSidebar);
    if (toggleBtn) toggleBtn.addEventListener('click', openSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);
  }

  // ── Public API ──────────────────────────────────────
  window.EmployeeLayout = {
    init: function (pageTitle) {
      renderSidebar();
      renderTopbar(pageTitle || 'Dashboard');
    },
    setUserInfo: function (name, role) {
      var nameEl = document.getElementById('userName');
      var roleEl = document.getElementById('roleBadge');
      var avatarEl = document.getElementById('profileAvatar');
      var profileNameEl = document.getElementById('profileName');
      if (nameEl) nameEl.textContent = name || '-';
      if (roleEl) roleEl.textContent = role ? (T && T.role ? T.role[role] || role : role) : '-';
      if (avatarEl) avatarEl.textContent = (name || '-').charAt(0).toUpperCase();
      if (profileNameEl) profileNameEl.textContent = name || '-';
    },
    setGreeting: function () {
      var h = new Date().getHours();
      var g = 'Selamat Pagi';
      if (h >= 11 && h < 15) g = 'Selamat Siang';
      else if (h >= 15 && h < 18) g = 'Selamat Sore';
      else if (h >= 18) g = 'Selamat Malam';
      var el2 = document.getElementById('greeting');
      if (el2) el2.textContent = g + ',';
    },
    setNotifBadge: function (count) {
      var badge = document.getElementById('notifBadge');
      var sbadge = document.getElementById('sidebarNotifBadge');
      if (!badge) return;
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
      if (sbadge) {
        if (count > 0) {
          sbadge.textContent = count > 99 ? '99+' : count;
          sbadge.classList.remove('hidden');
        } else {
          sbadge.classList.add('hidden');
        }
      }
    },
    setPeriod: function (bulan, tahun) {
      var periodEl = document.getElementById('activePeriod');
      if (!periodEl) return;
      if (T && T.months && T.months[bulan]) {
        periodEl.textContent = T.months[bulan] + ' ' + tahun;
      } else {
        periodEl.textContent = (bulan ? bulan + '/' : '') + (tahun || new Date().getFullYear());
      }
    }
  };

})();

window.initEmployee = function (pageTitle) {
  EmployeeLayout.init(pageTitle);
};
