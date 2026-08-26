// ══════════════════════════════════════════════════
// AUTH STORE — Single source of truth for authentication
// All auth state flows through this module.
// ══════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Canonical Role Enum ────────────────────────────
  var ROLES = {
    PEGAWAI: 'PEGAWAI',
    ADMIN_SEKSI: 'ADMIN_SEKSI',
    KEPALA_KANTOR: 'KEPALA_KANTOR',
    SUPERADMIN: 'SUPERADMIN'
  };

  // Legacy lowercase role compatibility.
  var DB_ROLE_MAP = {
    'pegawai': ROLES.PEGAWAI,
    'admin_seksi': ROLES.ADMIN_SEKSI,
    'kepala_kantor': ROLES.KEPALA_KANTOR,
    'admin': ROLES.SUPERADMIN
  };

  var TOKEN_KEY = 'auth_token';
  var USER_KEY = 'auth_user';

  // Legacy keys that must be cleared on every login/logout
  var LEGACY_KEYS = [
    'role',
    'userRole',
    'user_role',
    'currentRole',
    'loggedRole',
    'selectedRole',
    'currentUser',
    'loggedInUser'
  ];

  // ── Internal helpers ────────────────────────────────
  function getUserFromStorage() {
    try {
      var raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function getTokenFromStorage() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function normalizeRole(role) {
    if (!role) return null;

    var upper = String(role).toUpperCase().trim();

    return ROLES[upper] || DB_ROLE_MAP[role] || upper;
  }

  function clearLegacyAuthState() {
    LEGACY_KEYS.forEach(function (key) {
      localStorage.removeItem(key);
    });
  }

  // ── Public API ──────────────────────────────────────
  try {
    window.AuthStore = {
      ROLES: ROLES,

      // Current user
      getCurrentUser: function () {
        return getUserFromStorage();
      },

      setCurrentUser: function (user) {
        if (user) {
          user.role = normalizeRole(user.role);
          localStorage.setItem(USER_KEY, JSON.stringify(user));
        } else {
          localStorage.removeItem(USER_KEY);
        }
      },

      clearCurrentUser: function () {
        localStorage.removeItem(USER_KEY);
      },

      // Token
      getToken: getTokenFromStorage,

      setToken: function (token) {
        if (token) {
          localStorage.setItem(TOKEN_KEY, token);
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
      },

      clearToken: function () {
        localStorage.removeItem(TOKEN_KEY);
      },

      // Full clear
      clear: function () {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      },

      // Helpers
      isAuthenticated: function () {
        return !!getTokenFromStorage() && !!getUserFromStorage();
      },

      getRole: function () {
        var user = getUserFromStorage();
        return user ? user.role : null;
      },

      // Legacy compatibility
      clearLegacyAuthState: clearLegacyAuthState,

      loginCleanup: function () {
        clearLegacyAuthState();
      },

      logoutCleanup: function () {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        clearLegacyAuthState();
      },

      // Canonical logout
      logout: function () {
        this.logoutCleanup();
        window.location.href = '/login.html';
      }
    };
  } catch (e) {
    console.warn('AuthStore: failed to assign window.AuthStore', e);
  }

  // Sync legacy globals
  try {
    window.currentUser = getUserFromStorage();
    window.authToken = getTokenFromStorage();
    window.ROLES = ROLES;
  } catch (e) {
    console.warn('AuthStore: failed to set legacy globals', e);
  }

  try {
    window.addEventListener('storage', function () {
      window.currentUser = getUserFromStorage();
      window.authToken = getTokenFromStorage();
    });
  } catch (e) {
    console.warn('AuthStore: failed to add storage listener', e);
  }

})();