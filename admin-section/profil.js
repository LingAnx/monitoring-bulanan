// ══════════════════════════════════════════════════
// PROFIL SAYA - Shared Layout Version
// Uses admin-section-layout.js for sidebar/topbar
// ══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  requireRole('ADMIN_SEKSI');
  const authenticated = await initAuth();
  if (!authenticated) return;

  initAdminSectionPage('Profil Saya');
  loadProfileForm();
});

async function loadProfileForm() {
  const container = document.getElementById('profileContent');
  if (!container) return;

  if (!currentUser) {
    container.innerHTML = '<div class="error-state">Data pengguna tidak ditemukan.</div>';
    return;
  }

  container.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${currentUser.nama.charAt(0).toUpperCase()}</div>
      <div class="profile-info">
        <h2>${escapeHtml(currentUser.nama)}</h2>
        <p>${escapeHtml(currentUser.username)}</p>
        <span class="role-badge">${escapeHtml(roleName(currentUser.role))}</span>
      </div>
    </div>

    <form id="profileForm" class="profile-form" onsubmit="updateProfile(event)">
      <div class="form-row">
        <div class="form-group">
          <label for="nama">Nama Lengkap</label>
          <input type="text" id="nama" name="nama" value="${escapeHtml(currentUser.nama)}" required>
        </div>
        <div class="form-group">
          <label for="nip">NIP</label>
          <input type="text" id="nip" name="nip" value="${escapeHtml(currentUser.nip || '')}">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="seksi">Seksi</label>
          <select id="seksi" name="seksi">
            <option value="">-- Pilih Seksi --</option>
          </select>
        </div>
        <div class="form-group">
          <label for="jabatan">Jabatan</label>
          <input type="text" id="jabatan" name="jabatan" value="${escapeHtml(currentUser.jabatan || '')}">
        </div>
      </div>

      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" value="${escapeHtml(currentUser.email || '')}">
      </div>

      <hr>
      <h3>Ganti Password</h3>
      <div class="form-row">
        <div class="form-group">
          <label for="currentPassword">Password Sekarang</label>
          <input type="password" id="currentPassword" name="currentPassword">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="newPassword">Password Baru</label>
          <input type="password" id="newPassword" name="newPassword">
        </div>
        <div class="form-group">
          <label for="confirmPassword">Konfirmasi Password</label>
          <input type="password" id="confirmPassword" name="confirmPassword">
        </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
        <a href="/admin-section/dashboard.html" class="btn btn-outline">Kembali</a>
      </div>
    </form>
  `;

  // Load sections for select
  try {
    const sectionsRes = await apiFetch('/api/seksi');
    if (sectionsRes.success && sectionsRes.data) {
      const select = document.getElementById('seksi');
      if (select) {
        sectionsRes.data.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.nama;
          if (currentUser.seksi_id === s.id || currentUser.seksi === s.nama) {
            opt.selected = true;
          }
          select.appendChild(opt);
        });
      }
    }
  } catch (err) {
    console.error('Failed to load sections:', err);
  }
}

async function updateProfile(e) {
  e.preventDefault();
  const form = document.getElementById('profileForm');
  const data = new FormData(form);
  const payload = {
    nama: data.get('nama'),
    nip: data.get('nip'),
    jabatan: data.get('jabatan'),
    email: data.get('email')
  };

  const seksi = data.get('seksi');
  if (seksi) payload.seksi = seksi;

  // Only include password fields if they have values
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (newPassword || currentPassword) {
    if (!currentPassword) {
      alert('Masukkan password sekarang');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('Konfirmasi password tidak cocok');
      return;
    }
    if (newPassword.length < 6) {
      alert('Password minimal 6 karakter');
      return;
    }
    payload.currentPassword = currentPassword;
    payload.newPassword = newPassword;
  }

  try {
    const res = await apiFetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.success) {
      alert('Profil berhasil diupdate!');
      if (res.data) {
        currentUser = { ...currentUser, ...res.data };
        saveUserToStorage();
        loadProfileForm();
      }
    } else {
      alert('Gagal mengupdate profil: ' + (res.message || ''));
    }
  } catch (err) {
    alert('Terjadi kesalahan saat mengupdate profil');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.handleLogout = function() {
  if (confirm('Apakah Anda yakin ingin logout?')) {
    clearAuth();
    window.location.href = '/login.html';
  }
};
