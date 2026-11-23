// ══════════════════════════════════════════════════
// DATA PEGAWAI - Shared Layout Version
// Uses admin-section-layout.js for sidebar/topbar
// ══════════════════════════════════════════════════

let currentPage = 1;
const pageSize = 10;
let allPegawai = [];

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

  initAdminSectionPage('Data Pegawai');

  // Tombol modal — listener langsung, tanpa inline onclick
  document.getElementById('addPegawaiBtn')?.addEventListener('click', openAddPegawai);
  document.getElementById('closePegawaiModalBtn')?.addEventListener('click', closePegawaiModal);
  document.getElementById('cancelPegawaiBtn')?.addEventListener('click', closePegawaiModal);

  // Form submit
  document.getElementById('pegawaiForm')?.addEventListener('submit', savePegawai);

  await loadPegawai();
});

async function loadPegawai() {
  const container = document.getElementById('pegawaiContent');
  if (!container) return;

  try {
    const result = await apiFetch('/api/pegawai');
    const pegawai = result.data || [];

    if (pegawai.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#128196;</div><div class="empty-state-text">Tidak ada data pegawai di seksi ini.</div></div>`;
      return;
    }

    allPegawai = pegawai;
    renderPegawai(pegawai.slice(0, pageSize));
    renderPegawaiPagination(pegawai.length);

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#9888;</div><div class="empty-state-text">Gagal memuat data pegawai.</div></div>`;
  }
}

function renderPegawai(data) {
  const container = document.getElementById('pegawaiContent');
  if (!container) return;

  container.innerHTML = `
    <div class="pegawai-summary">
      <div class="pegawai-stat">
        <div class="pegawai-stat-value">${data.length}</div>
        <div class="pegawai-stat-label">Total Pegawai</div>
      </div>
      <div class="pegawai-stat">
        <div class="pegawai-stat-value">${data.filter(p => p.is_active).length}</div>
        <div class="pegawai-stat-label">Aktif</div>
      </div>
      <div class="pegawai-stat">
        <div class="pegawai-stat-value">${data.filter(p => p.sudah_lapor > 0).length}</div>
        <div class="pegawai-stat-label">Sudah Laporan</div>
      </div>
      <div class="pegawai-stat">
        <div class="pegawai-stat-value">${data.filter(p => !p.is_active).length}</div>
        <div class="pegawai-stat-label">Nonaktif</div>
      </div>
    </div>
    <table class="data-table">
      <thead><tr><th>Nama</th><th>NIP</th><th>Username</th><th>Total Laporan</th><th>Disetujui</th><th>Terakhir Lapor</th><th>Status</th></tr></thead>
      <tbody>
        ${data.map(p => `
          <tr>
            <td>${escapeHtmlText(p.nama)}</td>
            <td>${p.nip || '-'}</td>
            <td>${escapeHtmlText(p.username)}</td>
            <td>${p.total_laporan || 0}</td>
            <td><span class="badge badge-disetujui">${p.laporan_disetujui || 0}</span></td>
            <td>${p.terakhir_lapor || '-'}</td>
            <td>${p.is_active
              ? '<span style="color:var(--success);font-weight:600">Aktif</span>'
              : '<span style="color:var(--danger);font-weight:600">Nonaktif</span>'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div id="pegawaiPagination"></div>
  `;
}

function renderPegawaiPagination(total) {
  const container = document.getElementById('pegawaiPagination');
  if (!container) return;
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) {
    container.innerHTML = `<div class="pagination-info">Menampilkan ${total} data</div>`;
    return;
  }
  container.innerHTML = `
    <div class="pagination-buttons">
      <button type="button" class="btn btn-sm ${currentPage === 1 ? 'disabled' : ''}" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Prev</button>
      ${Array.from({length: totalPages}, (_, i) => i + 1)
        .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
        .map((p, i, arr) => {
          if (i > 0 && p - arr[i-1] > 1) return `<span>...</span>`;
          return `<button type="button" class="btn btn-sm ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
        }).join('')}
      <button type="button" class="btn btn-sm ${currentPage === totalPages ? 'disabled' : ''}" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
    </div>
  `;
}

// Delegasi halaman — satu listener untuk semua tombol pagination
document.addEventListener('click', event => {
  const btn = event.target.closest('[data-page]');
  if (!btn) return;
  const page = Number.parseInt(btn.dataset.page, 10);
  if (Number.isInteger(page) && page >= 1) {
    changePegawaiPage(page);
  }
});

window.changePegawaiPage = function(page) {
  if (page < 1) return;
  currentPage = page;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  renderPegawai(allPegawai.slice(start, end));
  renderPegawaiPagination(allPegawai.length);
};

window.openAddPegawai = function() {
  document.getElementById('pegawaiModalTitle').textContent = 'Tambah Pegawai';
  document.getElementById('pegawaiForm').reset();
  document.getElementById('pegawaiId').value = '';
  document.getElementById('pegawaiModal').classList.add('active');
};

window.closePegawaiModal = function() {
  document.getElementById('pegawaiModal').classList.remove('active');
};

window.savePegawai = async function(e) {
  e.preventDefault();
  const id = document.getElementById('pegawaiId').value;
  const data = {
    nama: document.getElementById('pegawaiNama').value,
    nip: document.getElementById('pegawaiNip').value,
    jabatan: document.getElementById('pegawaiJabatan').value,
    status: document.getElementById('pegawaiStatus').value
  };
  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/pegawai/${id}` : '/api/pegawai';
    const res = await apiFetch(url, { method, body: JSON.stringify(data) });
    if (res.success) {
      alert(id ? 'Pegawai berhasil diupdate' : 'Pegawai berhasil ditambahkan');
      closePegawaiModal();
      loadPegawai();
    } else {
      alert('Gagal menyimpan: ' + (res.message || ''));
    }
  } catch (err) {
    alert('Terjadi kesalahan saat menyimpan');
  }
};

document.addEventListener('click', (e) => {
  const modal = document.getElementById('pegawaiModal');
  if (modal && e.target === modal) closePegawaiModal();
});
