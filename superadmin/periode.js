document.addEventListener('DOMContentLoaded', async () => {
  const authenticated = await initAuth();
  if (!authenticated) return;
  try { requireRole('SUPERADMIN'); } catch (e) {
    if (e.message === 'AUTH_REQUIRED') window.location.href = '/login.html';
    else { redirectToDashboard(AuthStore.getRole()); }
    return;
  }
  initSuperadminPage('Manajemen Periode');
  await loadPeriode();
});

const MONTHS = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

async function loadPeriode() {
  const container = document.getElementById('periodeContent');
  try {
    const result = await apiFetch('/api/superadmin/periode');
    const periods = result.data || [];
    if (periods.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128197;</div><div class="empty-state-text">Belum ada periode.</div></div>';
      return;
    }
    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Periode</th><th>Tanggal Mulai</th><th>Deadline</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>
          ${periods.map(p => `
            <tr>
              <td>${MONTHS[p.bulan]} ${p.tahun}</td>
              <td>${formatDate(p.tanggal_mulai)}</td>
              <td>${formatDate(p.deadline)}</td>
              <td><span class="badge ${p.status === 'aktif' ? 'approved' : 'revision'}">${p.status === 'aktif' ? 'Aktif' : 'Ditutup'}</span></td>
              <td>
                <button class="btn btn-sm btn-outline" onclick="editPeriode(${p.id},'${p.bulan}','${p.tahun}','${p.tanggal_mulai}','${p.deadline}','${p.status}')">Edit</button>
                ${p.status === 'aktif'
                  ? `<button class="btn btn-sm btn-danger" onclick="togglePeriode(${p.id},'close')">Tutup</button>`
                  : `<button class="btn btn-sm btn-success" onclick="togglePeriode(${p.id},'open')">Buka</button>`
                }
                <button class="btn btn-sm btn-danger" onclick="deletePeriode(${p.id},'${MONTHS[p.bulan]} ${p.tahun}')">Hapus</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#9888;</div><div class="empty-state-text">Gagal memuat data.</div></div>';
  }
}

window.showPeriodeModal = function() {
  document.getElementById('periodeModalTitle').textContent = 'Tambah Periode';
  document.getElementById('periodeForm').reset();
  document.getElementById('periodeId').value = '';
  const now = new Date();
  document.getElementById('periodeBulan').value = now.getMonth() + 1;
  document.getElementById('periodeTahun').value = now.getFullYear();
  document.getElementById('periodeMulai').value = now.toISOString().split('T')[0];
  document.getElementById('periodeDeadline').value = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  document.getElementById('periodeModal').classList.add('active');
};

window.editPeriode = function(id, bulan, tahun, mulai, deadline, status) {
  document.getElementById('periodeModalTitle').textContent = 'Edit Periode';
  document.getElementById('periodeId').value = id;
  document.getElementById('periodeBulan').value = bulan;
  document.getElementById('periodeTahun').value = tahun;
  document.getElementById('periodeMulai').value = mulai;
  document.getElementById('periodeDeadline').value = deadline;
  document.getElementById('periodeStatus').value = status;
  document.getElementById('periodeModal').classList.add('active');
};

window.savePeriode = async function(e) {
  e.preventDefault();
  const id = document.getElementById('periodeId').value;
  const data = {
    bulan: parseInt(document.getElementById('periodeBulan').value),
    tahun: parseInt(document.getElementById('periodeTahun').value),
    tanggal_mulai: document.getElementById('periodeMulai').value,
    deadline: document.getElementById('periodeDeadline').value,
    status: document.getElementById('periodeStatus').value
  };
  try {
    let result;
    if (id) {
      result = await apiFetch(`/api/superadmin/periode/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      result = await apiFetch('/api/superadmin/periode', { method: 'POST', body: JSON.stringify(data) });
    }
    if (result.success) { showNotification('Periode berhasil disimpan!', 'success'); closePeriodeModal(); loadPeriode(); }
  } catch (err) { showNotification(err.message || 'Gagal menyimpan', 'error'); }
};

window.togglePeriode = async function(id, action) {
  try {
    const result = await apiFetch(`/api/superadmin/periode/${id}/${action}`, { method: 'POST' });
    if (result.success) { showNotification(result.message, 'success'); loadPeriode(); }
  } catch (err) { showNotification(err.message || 'Gagal mengubah periode', 'error'); }
};

window.deletePeriode = async function(id, label) {
  if (!confirm(`Hapus periode ${label}?`)) return;
  try {
    const result = await apiFetch(`/api/superadmin/periode/${id}`, { method: 'DELETE' });
    if (result.success) { showNotification('Periode dihapus', 'success'); loadPeriode(); }
  } catch (err) { showNotification(err.message || 'Gagal menghapus', 'error'); }
};

window.closePeriodeModal = function() {
  document.getElementById('periodeModal').classList.remove('active');
};

document.getElementById('periodeModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closePeriodeModal();
});
