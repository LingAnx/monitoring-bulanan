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
      a.appendChild(el('span', { className: 'nav-icon', innerHTML: item.icon }));
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
    logout.appendChild(el('span', { className: 'nav-icon', textContent: '&#10140;' }));
    logout.appendChild(el('span', { className: 'nav-label', textContent: 'Logout' }));
    footer.appendChild(logout);

    setupMobileMenu();
  }

  function renderTopbar(pageTitle) {
    var header = document.querySelector('.topbar');
    if (!header) return;
    header.innerHTML = '';

    var user = (typeof AuthStore !== 'undefined' && AuthStore.getCurrentUser()) || null;
    var left = el('div', { className: 'topbar-left' });
    left.appendChild(el('button', {
      className: 'mobile-menu-btn',
      id: 'mobileMenuBtn',
      type: 'button',
      'aria-label': 'Toggle menu',
      textContent: '&#9776;'
    }));

    var titleEl = el('div', { className: 'topbar-title-wrap' });
    titleEl.appendChild(el('span', { className: 'topbar-page-title', id: 'pageTitle', textContent: pageTitle || 'Dashboard' }));
    left.appendChild(titleEl);

    var right = el('div', { className: 'topbar-right' });

    var notifBtn = el('a', { className: 'notif-btn', id: 'notifBtn', href: '/superadmin/dashboard.html', title: 'Notifikasi' });
    notifBtn.innerHTML = '&#128276;<span class="notif-badge hidden" id="notifBadge">0</span>';
    right.appendChild(notifBtn);

    var profileWrap = el('div', { className: 'profile-wrap' });
    profileWrap.innerHTML = '<div class="profile-trigger" id="profileTrigger"><span class="profile-avatar" id="profileAvatar">' + (user ? user.nama.charAt(0).toUpperCase() : '-') + '</span><span class="profile-name" id="profileName">' + escapeHtml(user ? user.nama : '-') + '</span></div>';
    right.appendChild(profileWrap);

    header.appendChild(left);
    header.appendChild(right);

    var trigger = document.getElementById('profileTrigger');
    var dropdown = document.createElement('ul');
    dropdown.className = 'profile-dropdown hidden';
    dropdown.id = 'profileDropdown';
    profileWrap.appendChild(dropdown);
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', function () { dropdown.classList.add('hidden'); });
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

  window.SuperadminLayout = {
    init: function (pageTitle) {
      renderSidebar();
      renderTopbar(pageTitle || 'Dashboard');
    },
    setUserInfo: function (name, role) {
      var el2 = document.getElementById('userName');
      var roleEl = document.getElementById('roleBadge');
      var avatarEl = document.getElementById('profileAvatar');
      var profileNameEl = document.getElementById('profileName');
      if (el2) el2.textContent = name || '-';
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
