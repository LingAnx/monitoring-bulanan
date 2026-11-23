// ══════════════════════════════════════════════════
// LAPORAN SAYA - Shared Layout Version
// Uses admin-section-layout.js for sidebar/topbar
// ══════════════════════════════════════════════════

let currentPage = 1;
const pageSize = 10;
let allReports = [];

document.addEventListener('DOMContentLoaded', async () => {
  const authenticated = await initAuth();
  if (!authenticated) return;

  let userRole = null;
  try { userRole = requireRole('ADMIN_SEKSI'); } catch (e) {
    if (e.message === 'AUTH_REQUIRED' || e.message.startsWith('ACCESS_DENIED')) {
      window.location.href = '/login.html';
    }
    return;
  }

  initAdminSectionPage('Laporan');

// Read URL parameters
const urlParams = new URLSearchParams(window.location.search);
const initialStatus = urlParams.get('status');
const laporanId = urlParams.get('id');

const statusFilter = document.getElementById('filterStatus');

if (initialStatus && statusFilter) {
  statusFilter.value = initialStatus;
}

await loadNotifications();

// Pasang listener sebelum kemungkinan masuk langsung ke detail melalui ?id=.
setupLaporanActions();

if (laporanId) {
  // Validasi id: harus angka, hindari query path aneh ke API
  if (!/^\d+$/.test(laporanId)) {
    console.warn('URL param id tidak valid, diabaikan');
  } else {
    await loadLaporanDetail(laporanId);
    return;
  }
}

await loadLaporan();

   // Filter/search button listeners
  document.getElementById('filterBtn')?.addEventListener('click', () => {
    currentPage = 1;
    loadLaporan();
  });
  document.getElementById('searchBtn')?.addEventListener('click', () => {
    currentPage = 1;
    loadLaporan();
  });

});

// ── Delegasi tombol aksi halaman Laporan ────────────────────────────
function setupLaporanActions() {
  document.addEventListener('click', event => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;

    if (action === 'back-to-list') {
      window.location.href = '/admin-section/laporan.html';
      return;
    }

    if (action === 'export-pdf') {
      window.print();
      return;
    }

    if (action === 'export-csv') {
      exportCSV();
      return;
    }

    // Aksi berbasis laporan
    const id = Number.parseInt(btn.dataset.reportId, 10);

    if (!Number.isInteger(id) || id <= 0) {
      alert('ID laporan tidak valid');
      return;
    }

    if (action === 'view-detail') {
      viewLaporanDetail(id);
      return;
    }

    if (action === 'verify-report') {
      verifyLaporanAction(id, btn, 'approve');
      return;
    }

    if (action === 'revise-report') {
      verifyLaporanAction(id, btn, 'revisi');
    }
  });

}

// Tampilkan detail laporan (navigasi, tanpa replace state)
function viewLaporanDetail(id) {
  window.location.href = `/admin-section/laporan.html?id=${encodeURIComponent(String(id))}`;
}

// Eksekusi aksi verifikasi/revisi dengan guard double-click
async function verifyLaporanAction(id, btn, action) {
  if (btn) {
    if (btn.dataset.pending === 'true') return;
    btn.dataset.pending = 'true';
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  }

  try {
    const catatan =
      action === 'revisi'
        ? prompt('Alasan revisi:')
        : '';

    if (action === 'revisi' && catatan === null) {
      return; // user cancel prompt
    }

    const res = await apiFetch(`/api/laporan/${id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: action === 'revisi' ? 'revisi_admin' : 'diverifikasi',
        catatan: catatan || null
      })
    });

    if (res.success) {
      alert(action === 'revisi' ? 'Laporan diminta revisi' : 'Laporan diverifikasi');
      loadLaporan();
    } else {
      alert('Gagal: ' + (res.message || ''));
    }
  } catch (err) {
    console.error('Verify error:', err);
    alert('Gagal memverifikasi laporan');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      delete btn.dataset.pending;
    }
  }
}

async function loadNotifications() {
  try {
    const res = await apiFetch('/api/notifications');

    if (res.success) {
      const count = res.unread || 0;

      const badge = document.getElementById('notifBadge');

      if (badge) {
        badge.textContent = count || '';
        badge.classList.toggle('hidden', count === 0);
      }

      const dot = document.getElementById('notifDot');

      if (dot) {
        dot.classList.toggle('hidden', count === 0);
      }
    }
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}

async function loadLaporan() {
  const search = document.getElementById('searchLaporan')?.value || '';
  const filterStatus = document.getElementById('filterStatus')?.value || '';
  const filterBulan = document.getElementById('filterBulan')?.value || '';
  const filterTahun = document.getElementById('filterTahun')?.value || '';

  let params = new URLSearchParams();
  params.set('page', currentPage);
  params.set('limit', pageSize);
  if (search) params.set('search', search);
  if (filterStatus) params.set('status', filterStatus);
  if (filterBulan) params.set('bulan', filterBulan);
  if (filterTahun) params.set('tahun', filterTahun);

  try {
    const result = await apiFetch(`/api/laporan?${params}`);
    if (result.success) {
      // API returns { success, data: [...], pagination: {...} } — data is the array
      const items = result.data && Array.isArray(result.data.items) ? result.data.items : (Array.isArray(result.data) ? result.data : []);
      allReports = items;
      renderLaporan(items);
      renderPagination(result.pagination || result.data?.pagination);
      updatePageTitle();
    }
  } catch (err) {
    console.error('Failed to load reports:', err);
    document.getElementById('laporanContent').innerHTML =
      '<div class="error-state">Gagal memuat data. Coba lagi nanti.</div>';
  }
}

function updatePageTitle() {
  const filterStatus = document.getElementById('filterStatus')?.value || '';
  const titles = {
    'diajukan': 'Laporan Diajukan',
    'diteruskan': 'Laporan Diteruskan',
    'disetujui': 'Laporan Disetujui',
    'revisi_admin': 'Laporan Revisi Admin',
    'revisi_kantor': 'Laporan Revisi Kantor'
  };
  document.getElementById('pageTitle').textContent = titles[filterStatus] || 'Laporan Saya';
}

function renderLaporan(reports) {
  const container = document.getElementById('laporanContent');
  if (!container) return;

  if (!reports || reports.length === 0) {
    container.innerHTML = `
      <div class="empty-state-mini">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">Belum ada laporan untuk filter ini.</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>No</th>
          <th>Tanggal</th>
          <th>Bulan/Tahun</th>
          <th>Judul</th>
          <th>Status</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody>
        ${reports.map((r, i) => `
          <tr>
            <td>${(currentPage - 1) * pageSize + i + 1}</td>
            <td>${formatDate(r.created_at)}</td>
            <td>${escapeHtmlText(getMonthName(r.bulan))} ${r.tahun}</td>
            <td>${escapeHtmlText(r.judul)}</td>
            <td>${getStatusLabel(r.status)}</td>
            <td>
              <button type="button" class="btn btn-sm btn-primary" data-action="view-detail" data-report-id="${r.id}" aria-label="Lihat detail laporan" title="Lihat detail laporan"><span class="icon icon-search" aria-hidden="true"></span></button>
              ${canVerify(r.status) ? `
                <button type="button" class="btn btn-sm btn-success" data-action="verify-report" data-report-id="${r.id}" aria-label="Verifikasi laporan" title="Verifikasi laporan"><span class="icon icon-check" aria-hidden="true"></span></button>
                <button type="button" class="btn btn-sm btn-danger" data-action="revise-report" data-report-id="${r.id}" aria-label="Minta revisi laporan" title="Minta revisi laporan"><span class="icon icon-edit" aria-hidden="true"></span></button>
              ` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div id="paginationContainer" class="pagination-container"></div>`;
}

function renderPagination(pagination) {
  if (!pagination) return;
  const container = document.getElementById('paginationContainer');
  if (!container) return;

  const { page: cp = 1, totalPages = 1, total: totalItems = 0} = pagination;

  if (totalPages <= 1) {
    container.innerHTML = `<div class="pagination-info">Menampilkan ${totalItems} data</div>`;
    return;
  }

  let html = `<div class="pagination-info">Menampilkan ${totalItems} data - Halaman ${cp}/${totalPages}</div><div class="pagination-buttons">`;
  html += `<button type="button" class="btn btn-sm ${cp === 1 ? 'disabled' : ''}" ${cp === 1 ? 'disabled' : ''} data-click-action="changePage" data-action-arg="${cp - 1}">Prev</button>`;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= cp - 1 && i <= cp + 1)) {
      html += `<button type="button" class="btn btn-sm ${i === cp ? 'active' : ''}" data-click-action="changePage" data-action-arg="${i}">${i}</button>`;
    } else if (i === cp - 2 || i === cp + 2) {
      html += `<span>...</span>`;
    }
  }

  html += `<button type="button" class="btn btn-sm ${cp === totalPages ? 'disabled' : ''}" ${cp === totalPages ? 'disabled' : ''} data-click-action="changePage" data-action-arg="${cp + 1}">Next</button>`;
  html += `</div>`;
  container.innerHTML = html;
}

function changePage(page) {
  currentPage = page;
  loadLaporan();
  window.scrollTo(0, 0);
}

function getStatusLabel(status) {
  // Allowlist status → class CSS yang sudah ada di stylesheet
  return `<span class="status-badge ${statusClass(status)}">${escapeHtmlText(statusLabel(status))}</span>`;
}

function getMonthName(month) {
  const months = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return months[month] || '';
}

function canVerify(status) {
  return status === 'diajukan';
}

async function loadLaporanDetail(id) {
  const container = document.getElementById('laporanContent');

  if (!container) return;

  try {
    container.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Memuat detail laporan...</p>
      </div>
    `;

    const result = await apiFetch(`/api/laporan/${id}`);

    if (!result.success) {
      throw new Error(result.message || 'Gagal memuat detail laporan');
    }

    const laporan = result.data;

    const pageTitle = document.getElementById('pageTitle');

    if (pageTitle) {
      pageTitle.textContent = 'Detail Laporan';
    }

    // Sembunyikan filter/export ketika sedang melihat detail
    const actionButtons = document.querySelector('.action-buttons');

    if (actionButtons) {
      actionButtons.style.display = 'none';
    }

    container.innerHTML = `
      <div class="report-detail">

        <div class="detail-header">
          <div>
            <h3>${escapeHtmlDetail(laporan.judul || 'Laporan')}</h3>
            <p class="text-muted">
              ${getMonthName(laporan.bulan)} ${laporan.tahun}
            </p>
          </div>

          <button
            type="button"
            class="btn btn-outline"
            data-action="back-to-list">
            ← Kembali
          </button>
        </div>

        <div class="detail-grid">
          <div class="detail-item">
            <strong>Judul</strong>
            <p>${escapeHtmlDetail(laporan.judul || '-')}</p>
          </div>

          <div class="detail-item">
            <strong>Bulan / Tahun</strong>
            <p>${escapeHtmlText(getMonthName(laporan.bulan))} ${laporan.tahun}</p>
          </div>

          <div class="detail-item">
            <strong>Status</strong>
            <div>${getStatusLabel(laporan.status)}</div>
          </div>

          <div class="detail-item">
            <strong>Tanggal Dibuat</strong>
            <p>${formatDate(laporan.created_at)}</p>
          </div>

          <div class="detail-item detail-full">
            <strong>Isi Laporan</strong>
            <p>${escapeHtmlDetail(laporan.isi || '-')}</p>
          </div>

          ${
            laporan.catatan_admin
              ? `
                <div class="detail-item detail-full">
                  <strong>Catatan Admin</strong>
                  <p>${escapeHtmlDetail(laporan.catatan_admin)}</p>
                </div>
              `
              : ''
          }
        </div>

      </div>
    `;

  } catch (err) {
    console.error('Failed to load report detail:', err);

    container.innerHTML = `
      <div class="error-state">
        <p>Gagal memuat detail laporan.</p>

        <button
          type="button"
          class="btn btn-outline"
          data-action="back-to-list">
          ← Kembali
        </button>
      </div>
    `;
  }
}

function escapeHtmlDetail(value) {
  // Delegasikan ke util sentral
  if (typeof escapeHtmlText === 'function') return escapeHtmlText(value);
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

// Fungsi legacy — dipertahankan hanya sebagai fallback; UI sudah
// memakai data-action="view-detail" yang memicu viewLaporanDetail().
function showDetail(id) {
  viewLaporanDetail(id);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Export Functions ──────────────────────────────────────
function exportPDF(event) {
  event.preventDefault();
  window.print();
}

function exportCSV(event) {
  event.preventDefault();
  if (allReports.length === 0) {
    alert('Tidak ada data untuk di-export');
    return;
  }

  const headers = ['No', 'Tanggal', 'Bulan', 'Tahun', 'Judul', 'Isi', 'Status'];
  const rows = allReports.map((r, i) => [
    i + 1,
    formatDate(r.created_at),
    getMonthName(r.bulan),
    r.tahun,
    r.judul,
    r.isi || '',
    r.status
  ]);

  const csv = [
    headers.map(h => escapeCsvCell(h)).join(','),
    ...rows.map(row => row.map(c => escapeCsvCell(c)).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `laporan-saya-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
}

async function verifyLaporan(id, action) {
  const catatan = action === 'revisi' ? prompt('Alasan revisi:') : '';
  if (action === 'revisi' && !catatan) return;

  try {
    const res = await apiFetch(`/api/laporan/${id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: action === 'revisi' ? 'revisi_admin' : 'diverifikasi',
        catatan: catatan || null
      })
    });
    if (res.success) {
      alert(action === 'revisi' ? 'Laporan diminta revisi' : 'Laporan diverifikasi');
      loadLaporan();
    } else {
      alert('Gagal: ' + (res.message || ''));
    }
  } catch (err) {
    alert('Gagal memverifikasi laporan');
  }
}
