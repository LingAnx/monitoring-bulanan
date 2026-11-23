document.addEventListener('DOMContentLoaded', async () => {
  const authenticated = await initAuth();
  if (!authenticated) return;

  try {
    requireRole('SUPERADMIN');
  } catch (e) {
    if (e.message === 'AUTH_REQUIRED') window.location.href = '/login.html';
    else { redirectToDashboard(AuthStore.getRole()); }
    return;
  }

  initSuperadminPage('Manajemen Pengguna');
  await loadSeksiOptions();
  await loadUsers();
});

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
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128104;</div><div class="empty-state-text">Belum ada pengguna.</div></div>';
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
            <tr data-user-id="${u.id}" data-active="${u.is_active ? '1' : '0'}">
              <td>${escapeHtml(u.nama)}</td>
              <td>${escapeHtml(u.username)}</td>
              <td>${escapeHtmlText(u.nip || '-' )}</td>
              <td><span class="${statusBadgeClass(getBadgeClass(u.role))}">${escapeHtmlText(u.role)}</span></td>
              <td>${escapeHtmlText(u.nama_seksi || '-' )}</td>
              <td>${u.is_active ? '<span style="color:var(--success)">Aktif</span>' : '<span style="color:var(--danger)">Nonaktif</span>'}</td>
              <td>
                <button class="btn btn-sm btn-outline act-edit">Edit</button>
                ${u.id !== currentUser.id ? `
                  <button class="btn btn-sm ${u.is_active ? 'btn-warning' : 'btn-success'} act-toggle">
                    ${u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                  <button class="btn btn-sm btn-outline act-resetpw">Reset PW</button>
                  <button class="btn btn-sm btn-danger act-delete">Hapus</button>
                ` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Event delegation — replace inline onclick handlers with
    // data-* attributes and a single delegated listener on the
    // container. This avoids CSP 'unsafe-inline' violations and
    // prevents XSS via unescaped user data in handler arguments.
    container.addEventListener('click', (e) => {
      const row = e.target.closest('tr[data-user-id]');
      if (!row) return;
      // FIX: dataset.userId adalah string DOM — konversi eksplisit ke Number.
      // Jika konversi gagal (NaN), jangan jalankan action apa pun.
      const userId = Number(row.dataset.userId);
      if (!Number.isInteger(userId) || userId <= 0) return;
      const active = row.dataset.active === '1';
      if (e.target.classList.contains('act-edit')) {
        editUser(userId);
      } else if (e.target.classList.contains('act-toggle')) {
        toggleUser(userId, active);
      } else if (e.target.classList.contains('act-resetpw')) {
        const user = users.find(x => x.id === userId);
        showResetModal(userId, user ? user.username : '');
      } else if (e.target.classList.contains('act-delete')) {
        const user = users.find(x => x.id === userId);
        deleteUser(userId, user ? user.nama : '');
      }
    });
  } catch (err) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#9888;</div><div class="empty-state-text">Gagal memuat data.</div></div>';
  }
}

function getBadgeClass(role) {
  const map = { SUPERADMIN: 'disetujui', ADMIN_SEKSI: 'diteruskan', KEPALA_KANTOR: 'diverifikasi', PEGAWAI: 'draft' };
  return map[role] || 'draft';
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
  // FIX: Use id_seksi (integer) from API response, not nama_seksi (string)
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
    // FIX: Send id_seksi as integer (use value directly from select)
    id_seksi: document.getElementById('userSeksi').value ? parseInt(document.getElementById('userSeksi').value) : null,
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
  } else {
    // Don't send empty password - only update if provided
    const pw = document.getElementById('userPassword').value;
    if (pw) {
      data.password = pw;
    }
  }

  try {
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
  } catch (err) {
    showNotification(err.message || 'Gagal menyimpan pengguna', 'error');
  }
};

// Toggle active/inactive (deactivation, not deletion)
window.toggleUser = async function(id, currentActive) {
  const action = currentActive ? 'nonaktifkan' : 'aktifkan';
  if (!confirm(`${currentActive ? 'Nonaktifkan' : 'Aktifkan'} pengguna ini?`)) return;
  try {
    const result = await apiFetch(`/api/users/${id}/toggle-status`, { method: 'PATCH' });
    if (result.success) {
      showNotification(result.message, 'success');
      loadUsers();
    }
  } catch (err) {
    showNotification(err.message || `Gagal ${action} pengguna`, 'error');
  }
};

// Show password reset modal
window.showResetModal = function(id, username) {
  document.getElementById('resetUserId').value = id;
  document.getElementById('resetUserName').value = username;
  document.getElementById('resetPassword').value = '';
  document.getElementById('resetConfirm').value = '';
  document.getElementById('resetModal').classList.add('active');
};

window.closeResetModal = function() {
  document.getElementById('resetModal').classList.remove('active');
};

window.resetPassword = async function(e) {
  e.preventDefault();
  const id = document.getElementById('resetUserId').value;
  const pw = document.getElementById('resetPassword').value;
  const confirm = document.getElementById('resetConfirm').value;
  if (pw !== confirm) {
    showNotification('Password tidak cocok', 'error');
    return;
  }
  if (pw.length < 6) {
    showNotification('Password minimal 6 karakter', 'error');
    return;
  }
  try {
    const result = await apiFetch(`/api/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password: pw })
    });
    if (result.success) {
      showNotification('Password berhasil direset', 'success');
      closeResetModal();
    }
  } catch (err) {
    showNotification(err.message || 'Gagal mereset password', 'error');
  }
};

// Safe delete with 409 protection
window.deleteUser = async function(id, nama) {
  if (!confirm(`Hapus pengguna "${nama}"? Hapus hanya boleh dilakukan jika pengguna TIDAK memiliki laporan.`)) return;
  try {
    const result = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
    if (result.success) {
      showNotification('Pengguna dihapus', 'success');
      loadUsers();
    } else if (result.status === 409) {
      showNotification(result.message || 'Gagal menghapus: pengguna memiliki data historis. Gunakan "Nonaktifkan Akun".', 'error');
    }
  } catch (err) {
    if (err.status === 409) {
      showNotification(err.message || 'Gagal menghapus: pengguna memiliki data historis. Gunakan "Nonaktifkan Akun".', 'error');
    } else {
      showNotification(err.message || 'Gagal menghapus pengguna', 'error');
    }
  }
};

window.closeUserModal = function() {
  document.getElementById('userModal').classList.remove('active');
};

document.getElementById('userModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeUserModal();
});
document.getElementById('resetModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeResetModal();
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
