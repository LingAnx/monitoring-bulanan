// ════════════════════════════════════════════════════
// SHARED LAYOUT HELPERS
// Provides icon() helper used by all role layout files.
// Render a decorative SVG icon as an empty <span> with
// class "icon icon-<name>" — CSS carries the data URI.
// ════════════════════════════════════════════════════

(function () {
  'use strict';

  /**
   * Render a decorative icon span.
   * @param {string} name - icon key (e.g. 'dashboard', 'bell', 'logout')
   * @returns {HTMLSpanElement}
   */
  window.icon = function (name) {
    var span = document.createElement('span');
    span.className = 'icon icon-' + name;
    span.setAttribute('aria-hidden', 'true');
    return span;
  };

  /**
   * Render a nav icon element for sidebar items.
   * @param {string} name - icon key
   * @returns {HTMLSpanElement}
   */
  window.navIcon = function (name) {
    var span = document.createElement('span');
    span.className = 'nav-icon icon icon-' + name;
    span.setAttribute('aria-hidden', 'true');
    return span;
  };

})();
