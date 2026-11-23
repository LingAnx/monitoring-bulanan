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
  try { userRole = requireRole('PEGAWAI'); } catch (e) {
    if (e.message === 'AUTH_REQUIRED' || e.message.startsWith('ACCESS_DENIED')) {
      window.location.href = '/login.html';
    }
    return;
  }

  initEmployeePage('Laporan Saya');

  await loadNotifications();
  await loadLaporan();
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
    console.error('Failed to load notifications', err);
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
      allReports = result.data || [];
      renderLaporan(allReports);
      renderPagination(result.pagination);
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
              <button type="button" class="btn btn-sm btn-primary" data-click-action="showDetail" data-action-arg="${r.id}"><span class="icon icon-search"></span> Detail</button>
              ${canEdit(r.status) ? `<button type="button" class="btn btn-sm btn-warning" data-click-action="editLaporan" data-action-arg="${r.id}"><span class="icon icon-edit"></span> Edit</button>` : ''}
              ${r.status === 'draft' ? `<button type="button" class="btn btn-sm btn-danger" data-click-action="deleteLaporan" data-action-arg="${r.id}"><span class="icon icon-trash"></span></button>` : ''}
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
  // Gunakan allowlist statusClass + statusLabel global; render teks aman
  return `<span class="status-badge ${statusClass(status)}">${escapeHtmlText(statusLabel(status))}</span>`;
}

function getMonthName(month) {
  const months = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return months[month] || '';
}

function canEdit(status) {
  return ['draft', 'revisi_admin', 'revisi_kantor'].includes(status);
}

function showDetail(id) {
  window.location.href = `/employee/form.html?id=${id}&mode=view`;
}

function editLaporan(id) {
  window.location.href = `/employee/form.html?id=${id}`;
}

async function deleteLaporan(id) {
  if (!confirm('Yakin ingin menghapus laporan ini?')) return;
  try {
    const res = await apiFetch(`/api/laporan/${id}`, { method: 'DELETE' });
    if (res.success) {
      alert('Laporan berhasil dihapus');
      loadLaporan();
    } else {
      alert('Gagal menghapus: ' + (res.message || ''));
    }
  } catch (err) {
    alert('Gagal menghapus laporan');
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  const filterBtn = document.getElementById('filterBtn');
  if (filterBtn) {
    filterBtn.addEventListener('click', () => {
      currentPage = 1;
      loadLaporan();
    });
  }

  const searchBtn = document.getElementById('searchBtn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      currentPage = 1;
      loadLaporan();
    });
  }
});

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
