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

  // Apply canonical navigation filter from URL, e.g. ?status=diajukan
  const initialStatus = new URLSearchParams(window.location.search).get('status');
  const statusFilter = document.getElementById('filterStatus');
  if (initialStatus && statusFilter) statusFilter.value = initialStatus;

  await loadNotifications();
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
            <td>${getMonthName(r.bulan)} ${r.tahun}</td>
            <td>${r.judul}</td>
            <td>${getStatusLabel(r.status)}</td>
            <td>
              <button type="button" class="btn btn-sm btn-primary" onclick="showDetail(${r.id})">👁️ Detail</button>
              ${canVerify(r.status) ? `
                <button type="button" class="btn btn-sm btn-success" onclick="verifyLaporan(${r.id}, 'approve')">✓ Verifikasi</button>
                <button type="button" class="btn btn-sm btn-danger" onclick="verifyLaporan(${r.id}, 'revisi')">✏️ Revisi</button>
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
  html += `<button type="button" class="btn btn-sm ${cp === 1 ? 'disabled' : ''}" ${cp === 1 ? 'disabled' : ''} onclick="changePage(${cp - 1})">Prev</button>`;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= cp - 1 && i <= cp + 1)) {
      html += `<button type="button" class="btn btn-sm ${i === cp ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    } else if (i === cp - 2 || i === cp + 2) {
      html += `<span>...</span>`;
    }
  }

  html += `<button type="button" class="btn btn-sm ${cp === totalPages ? 'disabled' : ''}" ${cp === totalPages ? 'disabled' : ''} onclick="changePage(${cp + 1})">Next</button>`;
  html += `</div>`;
  container.innerHTML = html;
}

function changePage(page) {
  currentPage = page;
  loadLaporan();
  window.scrollTo(0, 0);
}

function getStatusLabel(status) {
  const map = {
    'draft': '<span class="status-badge status-draft">Draft</span>',
    'diajukan': '<span class="status-badge status-diajukan">Diajukan</span>',
    'diteruskan': '<span class="status-badge status-diteruskan">Diteruskan</span>',
    'disetujui': '<span class="status-badge status-disetujui">Disetujui</span>',
    'revisi_admin': '<span class="status-badge status-revisi">Revisi Admin</span>',
    'revisi_kantor': '<span class="status-badge status-revisi">Revisi Kantor</span>'
  };
  return map[status] || status;
}

function getMonthName(month) {
  const months = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return months[month] || '';
}

function canVerify(status) {
  return status === 'diajukan';
}

function showDetail(id) {
  window.location.href = `/admin-section/laporan.html?id=${id}`;
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
    `"${r.judul.replace(/"/g, '""')}"`,
    `"${(r.isi || '').replace(/"/g, '""')}"`,
    r.status
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
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
