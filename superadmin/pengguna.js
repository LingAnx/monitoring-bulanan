document.addEventListener('DOMContentLoaded', async () => {
  requireRole('SUPERADMIN');
  if (!isAdmin()) { window.location.href = '/superadmin/dashboard.html'; return; }
  const authenticated = await initAuth();
  if (!authenticated) return;

  document.getElementById('userName').textContent = currentUser.nama;
  document.getElementById('roleBadge').textContent = 'Admin';
  renderNav();
  await loadSeksiOptions();
  await loadUsers();
});

function renderNav() {
  document.getElementById('navTabs').innerHTML = `
    <a href="/superadmin/dashboard.html" class="nav-tab">Dashboard</a>
    <a href="/superadmin/pengguna.html" class="nav-tab active">Manajemen User</a>
    <a href="/superadmin/dashboard.html" class="nav-tab">Laporan</a>
  `;
}

async function loadSeksiOptions() {
  const result = await apiFetch('/api/seksi');
  const select = document.getElementById('userSeksi');
  result.data.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.nama_seksi;
    select.appendChild(opt);
  });
}

async function loadUsers() {
  const container = document.getElementById('usersContent');
  try {
    const result = await apiFetch('/api/users');
    const users = result.data || [];

    if (users.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#128101;</div><div class="empty-state-text">Belum ada pengguna.</div></div>`;
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Nama</th>
            <th>Username</th>
            <th>NIP</th>
            <th>Role</th>
            <th>Seksi</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>${u.nama}</td>
              <td>${u.username}</td>
              <td>${u.nip || '-'}</td>
              <td><span class="badge badge-${u.role === 'SUPERADMIN' ? 'disetujui' : u.role === 'KEPALA_KANTOR' ? 'diteruskan' : u.role === 'ADMIN_SEKSI' ? 'diverifikasi' : 'draft'}">${u.role}</span></td>
              <td>${u.nama_seksi || '-'}</td>
              <td>${u.is_active ? '<span style="color:var(--success)">Aktif</span>' : '<span style="color:var(--danger)">Nonaktif</span>'}</td>
              <td>
                <button class="btn btn-sm btn-outline" onclick="editUser(${u.id})">Edit</button>
                ${u.id !== currentUser.id ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">Hapus</button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#9888;</div><div class="empty-state-text">Gagal memuat data.</div></div>`;
  }
}

window.showUserModal = function() {
  document.getElementById('userModalTitle').textContent = 'Tambah Pengguna';
  document.getElementById('userForm').reset();
  document.getElementById('userId').value = '';
  document.getElementById('userActive').checked = true;
  document.getElementById('userUsername').disabled = false;
  document.getElementById('userModal').classList.add('active');
};

window.editUser = async function(id) {
  const result = await apiFetch('/api/users');
  const u = result.data.find(x => x.id === id);
  if (!u) return;

  document.getElementById('userModalTitle').textContent = 'Edit Pengguna';
  document.getElementById('userId').value = u.id;
  document.getElementById('userUsername').value = u.username;
  document.getElementById('userUsername').disabled = true;
  document.getElementById('userNama').value = u.nama;
  document.getElementById('userNip').value = u.nip || '';
  document.getElementById('userRole').value = u.role;
  document.getElementById('userSeksi').value = u.id_seksi || '';
  document.getElementById('userActive').checked = u.is_active;
  document.getElementById('userPassword').value = '';
  document.getElementById('userModal').classList.add('active');
};

window.saveUser = async function(e) {
  e.preventDefault();
  const id = document.getElementById('userId').value;
  const data = {
    nama: document.getElementById('userNama').value.trim(),
    nip: document.getElementById('userNip').value.trim(),
    id_seksi: document.getElementById('userSeksi').value || null,
    role: document.getElementById('userRole').value,
    is_active: document.getElementById('userActive').checked
  };

  if (!id) {
    data.username = document.getElementById('userUsername').value.trim();
    data.password = document.getElementById('userPassword').value;
    if (!data.password) {
      showNotification('Password wajib diisi untuk user baru', 'error');
      return;
    }
  }

  let result;
  if (id) {
    result = await apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  } else {
    result = await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(data) });
  }

  if (result.success) {
    showNotification('Pengguna berhasil disimpan!', 'success');
    closeUserModal();
    loadUsers();
  }
};

window.deleteUser = async function(id) {
  if (!confirm('Hapus pengguna ini? Laporan terkait mungkin akan terpengaruh.')) return;
  const result = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
  if (result.success) {
    showNotification('Pengguna dihapus', 'success');
    loadUsers();
  }
};

window.closeUserModal = function() {
  document.getElementById('userModal').classList.remove('active');
};

document.getElementById('userModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeUserModal();
});
