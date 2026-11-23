document.addEventListener('DOMContentLoaded', async () => {
  const authenticated = await initAuth();
  if (!authenticated) return;
  try { requireRole('SUPERADMIN'); } catch (e) {
    if (e.message === 'AUTH_REQUIRED') window.location.href = '/login.html';
    else { redirectToDashboard(AuthStore.getRole()); }
    return;
  }
  initSuperadminPage('Manajemen Seksi');
  await loadSeksi();
});

async function loadSeksi() {
  const container = document.getElementById('seksiContent');
  try {
    const result = await apiFetch('/api/seksi');
    const sections = result.data || [];
    if (sections.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#127970;</div><div class="empty-state-text">Belum ada seksi.</div></div>';
      return;
    }
    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Nama Seksi</th><th>Dibuat</th><th>Aksi</th></tr></thead>
        <tbody>
          ${sections.map(s => `
            <tr>
              <td>${escapeHtmlText(s.nama_seksi)}</td>
              <td>${formatDate(s.created_at)}</td>
              <td>
                <button class="btn btn-sm btn-outline seksi-edit-btn" data-id="${s.id}" data-nama="${escapeHtmlAttr(s.nama_seksi)}">Edit</button>
                <button class="btn btn-sm btn-danger seksi-delete-btn" data-id="${s.id}" data-nama="${escapeHtmlAttr(s.nama_seksi)}">Hapus</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    // Delegasi event — nama seksi diambil dari data-nama (di-decode saat render),
    // bukan dari atribut inline onclick.
    // FIX: dataset.id adalah string DOM — konversi eksplisit ke Number.
    container.querySelectorAll('.seksi-edit-btn').forEach(btn => {
      const id = Number(btn.dataset.id);
      if (!Number.isInteger(id) || id <= 0) return;
      btn.addEventListener('click', () => editSeksi(id, btn.dataset.nama));
    });
    container.querySelectorAll('.seksi-delete-btn').forEach(btn => {
      const id = Number(btn.dataset.id);
      if (!Number.isInteger(id) || id <= 0) return;
      btn.addEventListener('click', () => deleteSeksi(id, btn.dataset.nama));
    });
  } catch (err) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#9888;</div><div class="empty-state-text">Gagal memuat data.</div></div>';
  }
}

window.showSeksiModal = function() {
  document.getElementById('seksiModalTitle').textContent = 'Tambah Seksi';
  document.getElementById('seksiForm').reset();
  document.getElementById('seksiId').value = '';
  document.getElementById('seksiModal').classList.add('active');
};

window.editSeksi = function(id, nama) {
  document.getElementById('seksiModalTitle').textContent = 'Edit Seksi';
  document.getElementById('seksiId').value = id;
  document.getElementById('seksiNama').value = nama;
  document.getElementById('seksiModal').classList.add('active');
};
window.saveSeksi = async function(e) {
  e.preventDefault();
  const id = document.getElementById('seksiId').value;
  const nama = document.getElementById('seksiNama').value.trim();
  if (!nama) { showNotification('Nama sek di wajibkan', 'error'); return; }
  try {
    let result;
    if (id) {
      result = await apiFetch(`/api/seksi/${id}`, { method: 'PUT', body: JSON.stringify({ nama_seksi: nama }) });
    } else {
      result = await apiFetch('/api/seksi', { method: 'POST', body: JSON.stringify({ nama_seksi: nama }) });
    }
    if (result.success) { showNotification('Seksi berhasil disimpan!', 'success'); closeSeksiModal(); loadSeksi(); }
  } catch (err) { showNotification(err.message || 'Gagal menyimpan', 'error'); }
};

window.deleteSeksi = async function(id, nama) {
  if (!confirm(`Hapus sek "${nama}"?`)) return;
  try {
    const result = await apiFetch(`/api/seksi/${id}`, { method: 'DELETE' });
    if (result.success) { showNotification('Seksi dihapus', 'success'); loadSeksi(); }
  } catch (err) { showNotification(err.message || 'Gagal menghapus', 'error'); }
};

window.closeSeksiModal = function() {
  document.getElementById('seksiModal').classList.remove('active');
};

document.getElementById('seksiModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeSeksiModal();
});
