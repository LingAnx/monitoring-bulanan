// ══════════════════════════════════════════════════
// ENCODING UTILITIES — central XSS / output encoding
// Tahap 5: XSS hardening, output encoding, CSV sanitization
//
// Load AFTER app.js (uses no app globals). Exposes:
//   escapeHtmlText(value)   — teks HTML (isi elemen, template literal)
//   escapeHtmlAttr(value)   — nilai atribut (setelah setAttribute/set href)
//   safeUrl(value, opts)    — validasi URL dinamis (href/src)
//   escapeCsvCell(value)    — sel CSV + netralisasi formula injection
//   STATUS_CLASS / STATUS_BADGE / statusClass / statusLabel / statusBadgeClass
//     — allowlist status (jangan pernah pakai nilai DB mentah untuk class)
//   h(tag, props, ...children) — bangun elemen DOM aman
//
// Peraturan:
//   - Teks dinamis dari DB/pengguna SELALU lewat escapeHtmlText sebelum
//     masuk template literal / innerHTML.
//   - Atribut dinamis: pakai h()/createElement + setAttribute, jangan
//     template literal mentah. safeUrl untuk href.
//   - Jangan pernah membuat event handler inline dari data.
//   - Status dari DB dipetakan ke class via allowlist, bukan concat mentah.
// ══════════════════════════════════════════════════
(function () {
  'use strict';

  // ── escapeHtmlText ────────────────────────────────────
  // Escape teks untuk konteks HTML (isi elemen / template string).
  // & < > " ' \ ` dilindungi agar tidak memulai tag/atribut/JS.
  function escapeHtmlText(value) {
    if (value === null || value === undefined) return '';
    var s = String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/`/g, '&#96;');
    // Netralisasi control char yang bisa dipakai untuk breaking out
    s = s.replace(/[\u0000-\u001F]/g, '');
    return s;
  }

  // ── escapeHtmlAttr ────────────────────────────────────
  // Escape untuk nilai atribut. Dipakai saat setAttribute; untuk URL
  // dinamis gunakan safeUrl() terlebih dahulu (validasi skema).
  function escapeHtmlAttr(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── safeUrl ───────────────────────────────────────────
  // Validasi URL dinamis untuk atribut href/src.
  // Membolehkan: relative URL internal (/...), https://, dan blob:
  // (hasil download dari API sendiri). Menolak: javascript:, vbscript:,
  // data:text/html, protokol relative, skema lainnya.
  function safeUrl(value, opts) {
    if (value === null || value === undefined) return '';
    var s = String(value).replace(/[\u0000-\u0020]/g, '');
    if (s === '') return '';
    var lower = s.toLowerCase();
    // Tolak skema berbahaya (periksa di awal string SETELAH strip whitespace)
    if (
      lower.indexOf('javascript:') === 0 ||
      lower.indexOf('vbscript:') === 0 ||
      lower.indexOf('data:text/html') === 0 ||
      lower.indexOf('data:') === 0 ||
      lower.indexOf('file:') === 0
    ) {
      return '';
    }
    // Protokol relative → tidak diharapkan
    if (s.charAt(0) === '/' && s.charAt(1) === '/') {
      // "//host/..." dianggap URL absolut eksternal — batasi ke https
      var m = s.match(/^\/\/([^/]+)/);
      if (m) {
        var host = m[1].toLowerCase();
        if (host === 'cdn.jsdelivr.net' || host === 'fonts.googleapis.com') {
          return s; // diizinkan
        }
        return '';
      }
    }
    // Blob URL dari download API sendiri
    if (lower.indexOf('blob:') === 0) {
      return s;
    }
    // https URL eksternal yang diizinkan
    if (lower.indexOf('https://') === 0) {
      var hosts = {
        'cdn.jsdelivr.net': true,
        'fonts.googleapis.com': true,
        'fonts.gstatic.com': true
      };
      var parsed = s.match(/^https:\/\/([^/]+)/);
      if (parsed && hosts[parsed[1].toLowerCase()]) {
        return s;
      }
      // https lain: hanya izinkan jika caller membolehkan eksternal
      if (opts && opts.allowExternal) return s;
      return '';
    }
    // Relative internal: harus dimulai / atau tanpa skema
    if (/^\/|^[a-z0-9\-_./?&=+#%]+$/i.test(s)) {
      return s;
    }
    return '';
  }

  // ── CSV ──────────────────────────���────────────────────
  // Escape satu sel CSV:
  //   - netralisasi formula injection: nilai yang diawali = + - @ \t \r
  //     diberi awalan tab lalu di-strip — strategi yang dipakai
  //     spreadsheet modern: prepend single quote tidak efektif di semua
  //     aplikasi; cara andal: awali dengan tab. Kita pakai pendekatan
  //     yang terdokumentasi: prepend ' lalu selubungi dengan kutip.
  //     (Excel membuka "=HYPERLINK(...)" sebagai teks jika sel diawali
  //     ' dan dikutip ganda; spreadsheet lain (LibreOffice, Numbers,
  //     Google Sheets) memperlakukan dengan cara serupa.)
  //   - escape kutip CSV: " → ""
  //   - wrap dengan " jika mengandung , " atau newline
  function escapeCsvCell(value) {
    if (value === null || value === undefined) return '';
    var s = String(value);
    // Netralisasi formula injection
    if (/^[=+\-@\t\r]/.test(s)) {
      s = "'" + s;
    }
    // Bersihkan kontrol lain
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    var needsQuote = /["\n\r,]/.test(s);
    s = s.replace(/"/g, '""');
    if (needsQuote) s = '"' + s + '"';
    return s;
  }

  // ── Allowlist status ──────────────────────────────────
  // Map status DB → class CSS yang sudah ada di stylesheet.
  // Jangan pernah membentuk class dari nilai mentah DB.
  // .status-badge.* / .status-badge-simple.* (dashboard.css)
  // Nilai = class yang SEBENARNYA ada di stylesheet, tanpa suffix.
  var STATUS_CLASS = {
    draft: 'draft',
    diajukan: 'diajukan',
    diteruskan: 'diteruskan',
    disetujui: 'disetujui',
    revisi_admin: 'revisi_admin',
    revisi_kantor: 'revisi_kantor'
  };
  // .badge.badge-* (style.css) — dipakai di halaman kepala kantor
  var STATUS_BADGE = {
    draft: 'badge-draft',
    diajukan: 'badge-diajukan',
    diteruskan: 'badge-diteruskan',
    disetujui: 'badge-disetujui',
    revisi_admin: 'badge-revisi-admin',
    revisi_kantor: 'badge-revisi-kantor'
  };
  function statusClass(status) {
    return STATUS_CLASS[status] || STATUS_CLASS.draft;
  }
  function statusBadgeClass(status) {
    return STATUS_BADGE[status] || STATUS_BADGE.draft;
  }
  // Label teks status — allowlist, bukan nilai DB mentah
  var STATUS_LABELS = {
    draft: 'Draft',
    diajukan: 'Diajukan',
    diteruskan: 'Diteruskan',
    disetujui: 'Disetujui',
    revisi_admin: 'Revisi Admin',
    revisi_kantor: 'Revisi Kantor',
    diverifikasi: 'Diverifikasi'
  };
  function statusLabel(status) {
    return STATUS_LABELS[status] || status;
  }

  // ── h(): bangun elemen DOM secara aman ────────────────
  // h('div', { class: 'x', text: 'data' })
  //   text   → textContent (aman)
  //   html   → innerHTML (PEMANGGIL tanggung jawab escape)
  //   on     → addEventListener
  //   dataset→ setAttribute
  function h(tag, props) {
    var el = document.createElement(tag);
    var children = Array.prototype.slice.call(arguments, 2);
    if (props) {
      for (var k in props) {
        if (props[k] === undefined || props[k] === null) continue;
        switch (k) {
          case 'class':
            el.className = String(props[k]); break;
          case 'text':
            el.textContent = String(props[k]); break;
          case 'html':
            el.innerHTML = String(props[k]); break; // caller escapes
          case 'id':
            el.id = String(props[k]); break;
          case 'href':
          case 'src':
            var u = safeUrl(String(props[k]));
            if (u) el.setAttribute(k, u);
            break;
          case 'target':
          case 'rel':
          case 'type':
          case 'title':
          case 'placeholder':
          case 'for':
          case 'value':
            el.setAttribute(k, String(props[k])); break;
          default:
            if (k.indexOf('data-') === 0) {
              el.setAttribute(k, String(props[k]));
            } else if (k.charAt(0) === 'on' && typeof props[k] === 'function') {
              el.addEventListener(k.slice(2), props[k]);
            } else {
              el.setAttribute(k, String(props[k]));
            }
        }
      }
    }
    children.forEach(function (c) {
      if (c === null || c === undefined) return;
      if (typeof c === 'string' || typeof c === 'number') {
        el.appendChild(document.createTextNode(String(c)));
      } else {
        el.appendChild(c);
      }
    });
    return el;
  }

  // ── Publik ────────────────────────────────────────────
  window.escapeHtmlText = escapeHtmlText;
  window.escapeHtmlAttr = escapeHtmlAttr;
  window.safeUrl = safeUrl;
  window.escapeCsvCell = escapeCsvCell;
  window.STATUS_CLASS = STATUS_CLASS;
  window.STATUS_BADGE = STATUS_BADGE;
  window.statusClass = statusClass;
  window.statusBadgeClass = statusBadgeClass;
  window.statusLabel = statusLabel;
  // alias untuk delegasi dari translations.js (hindari circular self-ref)
  window._coreStatusLabel = statusLabel;
  window.h = h;

  // Backward-compat: beberapa file sudah mendefinisikan escapeHtml lokal.
  // Jika belum ada, daftarkan agar tidak conflict.
  if (!window.escapeHtml) {
    window.escapeHtml = escapeHtmlText;
  }
})();
