// ══════════════════════════════════════════════════
// ROLE GUARD — Single source of truth for authorization
// Consolidates: role-guard.js + redirect-guard.js
// Usage: requireRole('PEGAWAI') | guardedInit('PEGAWAI', fn)
// ══════════════════════════════════════════════════

(function () {
  'use strict';

  if (typeof AuthStore === 'undefined') return;

  var ROLES = AuthStore.ROLES;

  // ── Role → dashboard mapping (canonical, root-relative) ──
  var DASHBOARD_MAP = {
    [ROLES.PEGAWAI]:        '/employee/dashboard.html',
    [ROLES.ADMIN_SEKSI]:    '/admin-section/dashboard.html',
    [ROLES.KEPALA_KANTOR]:  '/head-office/dashboard.html',
    [ROLES.SUPERADMIN]:     '/superadmin/dashboard.html'
  };

  // ── Internal helpers ─────────────────────────────────
  function redirectToDashboard(role) {
    var target = DASHBOARD_MAP[role];
    if (target) {
      window.location.href = target;
    }
  }

  function redirectToLogin() {
    window.location.href = '/login.html';
  }

  // ── Cross-role redirect guard ────────────────────────
  // Prevents users from navigating to pages outside their role namespace
  function checkCrossRoleRedirect() {
    if (!document.getElementById('sidebarNav')) return; // not an authenticated page
    var role = AuthStore.getRole();
    if (!role) return;

    var currentPath = window.location.pathname;
    var filename = currentPath.split('/').pop() || '';
    var dirName  = currentPath.match(/^\/([^/]+)/) ? currentPath.match(/^\/([^/]+)/)[1] : '';

    // Validate directory matches role
    var validDirMap = {
      [ROLES.PEGAWAI]:        'employee',
      [ROLES.ADMIN_SEKSI]:    'admin-section',
      [ROLES.KEPALA_KANTOR]:  'head-office',
      [ROLES.SUPERADMIN]:     'superadmin'
    };

    var expectedDir = validDirMap[role];
    if (expectedDir && dirName !== expectedDir) {
      // Wrong directory — redirect to role dashboard
      redirectToDashboard(role);
      return;
    }
  }

  // ── Public API ───────────────────────────────────────

  /**
   * requireRole(requiredRole)
   * Throws on failure — caller should catch and handle.
   * Usage: requireRole('PEGAWAI')
   */
  function requireRole(requiredRole) {
    var role = AuthStore.getRole();

    if (!role) throw new Error('AUTH_REQUIRED');
    if (role !== requiredRole) throw new Error('ACCESS_DENIED:' + role);
    return role;
  }

  /**
   * guardedInit(requiredRole, callback)
   * Safe page init wrapper. Returns false and redirects on failure.
   */
  function guardedInit(requiredRole, fn) {
    try {
      requireRole(requiredRole);
    } catch (e) {
      if (e.message === 'AUTH_REQUIRED') {
        redirectToLogin();
      } else {
        redirectToDashboard(AuthStore.getRole());
      }
      return false;
    }
    // Run cross-role guard after auth passes
    checkCrossRoleRedirect();
    fn();
    return true;
  }

  /**
   * redirectToDashboard(role)
   * Redirects user to their role's dashboard.
   */
  function redirectToRoleDashboard(role) {
    redirectToDashboard(role);
  }

  /**
   * isRole(role) — boolean check
   */
  function isRole(role) {
    return AuthStore.getRole() === role;
  }

  // ── Legacy boolean helpers (for backward compat) ────
  try {
    window.isPegawai     = function () { return isRole(ROLES.PEGAWAI); };
    window.isAdminSeksi  = function () { return isRole(ROLES.ADMIN_SEKSI); };
    window.isKepala      = function () { return isRole(ROLES.KEPALA_KANTOR); };
    window.isAdmin       = function () { return isRole(ROLES.SUPERADMIN); };
    window.requireRole      = requireRole;
    window.guardedInit      = guardedInit;
    window.redirectToDashboard = redirectToRoleDashboard;
    window.isRole           = isRole;
  } catch (e) { console.warn('role-guard: failed to assign window exports', e); }

  // ── Run cross-role guard on page load ───────────────
  try { checkCrossRoleRedirect(); } catch (e) { /* not an authenticated page */ }

})();
