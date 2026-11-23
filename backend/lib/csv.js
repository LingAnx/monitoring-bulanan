// ============================================================
// lib/csv.js — Utilitas CSV server-side (formula-injection safe)
//
// escapeCsvCell: netralkan control char, blok formula injection
//   (= + - @ atau tab di awal → prepend ' agar tidak dieksekusi
//   Excel/LibreOffice), dan wrap dalam double-quote jika
//   mengandung koma/quote/CR/LF.
//
// toCSV: header + rows → string CSV lengkap.
//
// Dipakai oleh routes/rekap.js, routes/export.js — menggantikan
// helper lokal yang tidak lengkap (belum netralisasi control
// char atau formula injection).
// ============================================================

function escapeCsvCell(value) {
  let v = (value === null || value === undefined) ? '' : String(value);
  // Netralkan control char
  v = v.replace(/[\u0000-\u001F]/g, ' ');
  // Formula injection: = + - @ atau tab di awal → prepend '
  if (/^[=+\-@\t]/.test(v)) {
    v = "'" + v;
  }
  // Wrap dalam quote jika mengandung koma, quote, CR, atau LF
  if (/[,\"\r\n]/.test(v)) {
    v = '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

function toCSV(headers, rows) {
  const lines = [headers.map(escapeCsvCell).join(',')];
  rows.forEach(row => {
    lines.push(row.map(escapeCsvCell).join(','));
  });
  return lines.join('\n');
}

module.exports = { escapeCsvCell, toCSV };
