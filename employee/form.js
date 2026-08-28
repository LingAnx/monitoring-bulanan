document.addEventListener('DOMContentLoaded', async () => {
  const authenticated = await initAuth();
  if (!authenticated) return;

  let userRole = null;

  try {
    userRole = requireRole('PEGAWAI');
  } catch (e) {
    if (
      e.message === 'AUTH_REQUIRED' ||
      e.message.startsWith('ACCESS_DENIED')
    ) {
      window.location.href = '/login.html';
    }
    return;
  }

  if (!isPegawai()) {
    window.location.href = '/employee/dashboard.html';
    return;
  }

  // Render shared Employee sidebar + topbar
  initEmployeePage('Buat Laporan');

  // Isi informasi user di shared topbar
  if (window.EmployeeLayout) {
    EmployeeLayout.setUserInfo(
      currentUser?.nama,
      currentUser?.role
    );
  }

  // Isi field form
  document.getElementById('nama').value = currentUser.nama;
  document.getElementById('nip').value = currentUser.nip || '';
  document.getElementById('seksiDisplay').value =
    currentUser.nama_seksi || 'Belum ditentukan';

  const now = new Date();
  const monthStr =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  document.getElementById('bulanTahun').value = monthStr;

  addActivityRow();
  setupFormSidebar();

  const params = new URLSearchParams(window.location.search);
  const editId = params.get('id');

  if (editId) {
    loadReport(parseInt(editId));
    loadLampiranPreview(parseInt(editId));
  }
});

function setupFormSidebar() {
  // Mobile menu
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const menuBtn = document.getElementById('mobileMenuBtn');
  const toggleBtn = document.getElementById('sidebarToggle');

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  }
  menuBtn.addEventListener('click', openSidebar);
  toggleBtn.addEventListener('click', openSidebar);
  overlay.addEventListener('click', closeSidebar);

  // Set active nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === 'buat');
  });

  // Load badges
  loadFormBadges();
}

async function loadFormBadges() {
  try {
    const r = await apiFetch('/api/laporan');
    const reports = r.data || [];
    const draftCount = reports.filter(r => r.status === 'draft').length;
    const berjalanCount = reports.filter(r => ['diajukan', 'diteruskan', 'revisi_admin', 'revisi_kantor'].includes(r.status)).length;

    const badge1 = document.getElementById('draftBadge');
    if (badge1) {
      if (draftCount > 0) { badge1.textContent = draftCount; badge1.classList.remove('hidden'); }
      else { badge1.classList.add('hidden'); }
    }
    const badge2 = document.getElementById('berjalanBadge');
    if (badge2) {
      if (berjalanCount > 0) { badge2.textContent = berjalanCount; badge2.classList.remove('hidden'); }
      else { badge2.classList.add('hidden'); }
    }
    const notifBadge = document.getElementById('notifBadge');
    const sidebarNotif = document.getElementById('sidebarNotifBadge');
    try {
      const n = await apiFetch('/api/notifications?limit=1');
      const unread = n.unread || 0;
      if (unread > 0) {
        if (notifBadge) { notifBadge.textContent = unread > 99 ? '99+' : unread; notifBadge.classList.remove('hidden'); }
        if (sidebarNotif) { sidebarNotif.textContent = unread > 99 ? '99+' : unread; sidebarNotif.classList.remove('hidden'); }
      }
    } catch {}
  } catch {}
}

let activityCount = 0;

function addActivityRow() {
  activityCount++;
  const tbody = document.getElementById('activityBody');
  const row = document.createElement('tr');
  row.id = `activity-row-${activityCount}`;
  row.innerHTML = `
    <td>${tbody.children.length + 1}</td>
    <td><input type="date" class="act-date"></td>
    <td><input type="text" class="act-kegiatan" placeholder="Deskripsi kegiatan..."></td>
    <td><button type="button" class="btn btn-sm btn-danger" onclick="removeActivityRow(this)">Hapus</button></td>
  `;
  tbody.appendChild(row);
}

function removeActivityRow(btn) {
  const row = btn.closest('tr');
  row.remove();
  document.querySelectorAll('#activityBody tr').forEach((r, i) => {
    r.querySelector('td:first-child').textContent = i + 1;
  });
}

function gatherActivities() {
  const rows = document.querySelectorAll('#activityBody tr');
  const activities = [];
  rows.forEach(row => {
    const date = row.querySelector('.act-date').value;
    const kegiatan = row.querySelector('.act-kegiatan').value.trim();
    if (kegiatan) {
      activities.push({ tanggal: date, kegiatan, keterangan: '' });
    }
  });
  return activities;
}

function parseMonthYear(value) {
  if (!value) return { bulan: null, tahun: null };
  const [year, month] = value.split('-').map(Number);
  return { bulan: month, tahun: year };
}

async function uploadLampiran(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}` },
    body: formData
  });
  return res.json();
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📄';
  if (['jpg','jpeg','png','gif'].includes(ext)) return '🖼️';
  return '📎';
}

async function loadLampiranPreview(laporanId) {
  try {
    const result = await apiFetch(`/api/laporan/${laporanId}`);
    if (!result.success) return;
    const lampiran = result.data.lampiran;
    if (lampiran && lampiran.length > 0) {
      renderLampiranList(lampiran);
    }
  } catch (err) { /* ignore */ }
}

function renderLampiranList(files) {
  const container = document.getElementById('lampiranPreview');
  if (!container) return;
  container.innerHTML = files.map((f, i) => `
    <div class="lampiran-item">
      <span class="lampiran-icon">${getFileIcon(f.filename)}</span>
      <div class="lampiran-info">
        <div class="lampiran-name">${escapeHtml(f.filename)}</div>
        <div class="lampiran-size">${formatFileSize(f.size)}</div>
      </div>
      <a href="${API_BASE}${f.url}" target="_blank" class="lampiran-download" title="Unduh">⬇</a>
      <button class="lampiran-remove" onclick="removeLampiran(${i})" title="Hapus">&times;</button>
    </div>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function saveDraft() {
  const bulanTahun =
    document.getElementById('bulanTahun').value;

  if (!bulanTahun) {
    showNotification(
      'Periode bulan/tahun wajib diisi',
      'error'
    );
    return false;
  }

  const { bulan, tahun } =
    parseMonthYear(bulanTahun);

  console.log('SAVE DRAFT PERIODE:', {
    bulanTahun,
    bulan,
    tahun
  });

  const activities =
    gatherActivities();

  const capaian =
    document
      .getElementById('capaian')
      .value
      .trim();

  if (!capaian) {
    showNotification(
      'Capaian pekerjaan wajib diisi',
      'error'
    );
    return false;
  }

  // Ambil data lampiran yang sudah di-upload
  const lampiranEl =
    document.getElementById('lampiranData');

  const lampiran =
    lampiranEl
      ? JSON.parse(lampiranEl.value || '[]')
      : [];

  const namaBulan = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember'
  ];

  const data = {
    judul:
      `Laporan ${namaBulan[bulan - 1]} ${tahun}`,

    bulan,
    tahun,

    isi_kegiatan:
      activities.length > 0
        ? JSON.stringify(activities)
        : null,

    capaian,

    kendala:
      document
        .getElementById('kendala')
        .value
        .trim(),

    tindak_lanjut:
      document
        .getElementById('tindakLanjut')
        .value
        .trim(),

    rencana_bulan_depan:
      document
        .getElementById('rencana')
        .value
        .trim(),

    lampiran:
      lampiran.length > 0
        ? lampiran
        : null
  };

  console.log('SAVE DRAFT DATA:', data);

  try {
    const laporanIdEl =
      document.getElementById('laporanId');

    const id =
      laporanIdEl.value;

    let result;

    if (id) {
      // Update draft / laporan revisi
      result = await apiFetch(
        `/api/laporan/${id}`,
        {
          method: 'PUT',
          body: JSON.stringify(data)
        }
      );
    } else {
      // Buat draft baru
      result = await apiFetch(
        '/api/laporan',
        {
          method: 'POST',
          body: JSON.stringify(data)
        }
      );
    }

    if (!result.success) {
      showNotification(
        result.message ||
          'Gagal menyimpan laporan',
        'error'
      );

      return false;
    }

    // Jika laporan baru dibuat,
    // simpan ID-nya untuk proses submit.
    if (!id && result.data?.id) {
      laporanIdEl.value =
        result.data.id;
    }

    showNotification(
      'Draft berhasil disimpan!',
      'success'
    );

    return true;

  } catch (err) {
    console.error(
      'Save draft error:',
      err
    );

    showNotification(
      err.message || 'Gagal menyimpan draft',
      'error'
    );

    return false;
  }
}

document
  .getElementById('laporanForm')
  .addEventListener(
    'submit',
    async (e) => {
      e.preventDefault();

      // Simpan/update laporan terlebih dahulu
      const saved =
        await saveDraft();

      // Jangan submit kalau proses save gagal
      if (!saved) {
        return;
      }

      const id =
        document
          .getElementById('laporanId')
          .value;

      if (!id) {
        showNotification(
          'Laporan belum memiliki ID',
          'error'
        );

        return;
      }

      try {
        const result =
          await apiFetch(
            `/api/laporan/${id}/submit`,
            {
              method: 'POST'
            }
          );

        if (!result.success) {
          showNotification(
            result.message ||
              'Gagal mengajukan laporan',
            'error'
          );

          return;
        }

        showNotification(
          'Laporan berhasil diajukan!',
          'success'
        );

        window.location.href =
          '/employee/laporan.html';

      } catch (err) {
        console.error(
          'Submit laporan error:',
          err
        );

        showNotification(
          'Gagal mengajukan laporan',
          'error'
        );
      }
    }
  );

async function loadReport(id) {
  try {
    const result = await apiFetch(`/api/laporan/${id}`);
    if (!result.success) return;
    const r = result.data;
    if (r.id_user !== currentUser.id) return;

    document.getElementById('laporanId').value = r.id;
    document.getElementById('bulanTahun').value = `${r.tahun}-${String(r.bulan).padStart(2,'0')}`;
    document.getElementById('capaian').value = r.capaian || '';
    document.getElementById('kendala').value = r.kendala || '';
    document.getElementById('tindakLanjut').value = r.tindak_lanjut || '';
    document.getElementById('rencana').value = r.rencana_bulan_depan || '';

    const tbody = document.getElementById('activityBody');
    tbody.innerHTML = '';
    activityCount = 0;
    if (r.isi_kegiatan) {
      const activities = JSON.parse(r.isi_kegiatan);
      activities.forEach(act => addActivityRowWithValue(act));
    }
    if (activityCount === 0) addActivityRow();

    document.querySelector('.form-title').textContent = 'Edit Laporan';

    // Load lampiran
    if (r.lampiran && r.lampiran.length > 0) {
      const hidden = document.getElementById('lampiranData');
      if (hidden) hidden.value = JSON.stringify(r.lampiran);
      renderLampiranList(r.lampiran);
    }
  } catch (err) {
    showNotification('Gagal memuat laporan', 'error');
  }
}

function addActivityRowWithValue(act) {
  addActivityRow();
  const rows = document.querySelectorAll('#activityBody tr');
  const lastRow = rows[rows.length - 1];
  if (act.tanggal) lastRow.querySelector('.act-date').value = act.tanggal;
  if (act.kegiatan) lastRow.querySelector('.act-kegiatan').value = act.kegiatan;
}

window.addActivityRow = addActivityRow;
window.removeActivityRow = removeActivityRow;
window.saveDraft = saveDraft;
window.handleLampiranChange = handleLampiranChange;

// Lampiran handlers
async function handleLampiranChange(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  const hidden = document.getElementById('lampiranData');
  const existing = hidden ? JSON.parse(hidden.value || '[]') : [];

  for (const file of files) {
    try {
      const res = await uploadLampiran(file);
      if (res.success) {
        existing.push({
          filename: file.name,
          storedName: res.data.storedName,
          size: file.size,
          mimeType: file.type,
          url: res.data.url
        });
      } else {
        showNotification(res.message || 'Upload gagal', 'error');
      }
    } catch (err) {
      showNotification('Gagal mengunggah file', 'error');
    }
  }

  if (hidden) hidden.value = JSON.stringify(existing);
  renderLampiranList(existing);
  e.target.value = '';
}

function removeLampiran(index) {
  const hidden = document.getElementById('lampiranData');
  if (!hidden) return;
  const files = JSON.parse(hidden.value || '[]');
  files.splice(index, 1);
  hidden.value = JSON.stringify(files);
  renderLampiranList(files);
}

