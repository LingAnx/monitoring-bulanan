document.addEventListener('DOMContentLoaded', () => {
  // _auth is already defined globally in app.js (loaded before this file).
  // No local redefinition needed.

  const token = _auth('getToken');
  if (token) {
    fetch(`${API_BASE}/api/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json()).then(data => {
        if (data.success) {
          currentUser = data.user;
          authToken = token;
          document.getElementById('loginTab').style.display = 'none';
          // Normalize and store
          const roles = _auth('ROLES') || {};
          const normalizedUser = { ...data.user, role: roles[data.user.role] || data.user.role };
          _auth('setCurrentUser', normalizedUser);
          _auth('setToken', token);
          const role = _auth('getRole');
          redirectToDashboard(role);
        }
      }).catch(() => {});
  }
});

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  });
});
