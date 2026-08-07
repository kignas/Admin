/* ==========================================================================
   Nearbite Admin — shared API client
   Mirrors the vendor portal's localStorage convention (nearbite_vendor_token)
   with its own key so the two sessions never collide in the same browser.
   ========================================================================== */

// SECURITY FIX: Now pulling dynamically from your config.js file!
const API_BASE = CONFIG.API_BASE_URL; 
const TOKEN_KEY = 'nearbite_admin_token';
const ADMIN_KEY = 'nearbite_admin_user';

const AdminAuth = {
  getToken() { return localStorage.getItem(TOKEN_KEY); },
  setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(user));
  },
  getAdmin() {
    try { return JSON.parse(localStorage.getItem(ADMIN_KEY)); }
    catch (_) { return null; }
  },
  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
  },
  isLoggedIn() { return !!this.getToken(); },
  logout() {
    this.clearSession();
    window.location.href = 'login.html';
  },
};

/**
 * apiRequest — thin fetch wrapper.
 * - Attaches the admin JWT automatically.
 * - Throws an Error with a readable .message on any non-2xx response.
 * - On 401, clears the session and bounces to login (token expired/invalid).
 */
async function apiRequest(path, { method = 'GET', body, query } = {}) {
  let url = `${API_BASE}${path}`;
  if (query) {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const headers = { 'Content-Type': 'application/json' };
  const token = AdminAuth.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  let data = null;
  try { data = await res.json(); } catch (_) { /* empty body */ }

  if (res.status === 401) {
    AdminAuth.clearSession();
    if (!location.pathname.endsWith('login.html')) {
      window.location.href = 'login.html';
    }
    throw new Error(data?.message || 'Session expired. Please log in again.');
  }

  if (!res.ok || data?.success === false) {
    throw new Error(data?.message || `Request failed (${res.status}).`);
  }

  return data;
}

/**
 * uploadImage — uploads a single image file to Cloudinary via the backend's
 * reusable upload endpoint. Uses XMLHttpRequest rather than fetch because
 * only XHR exposes upload progress events (xhr.upload.onprogress).
 *
 * @param {File} file
 * @param {'restaurants'|'menu'|'categories'} type
 * @param {(percent: number) => void} [onProgress]
 * @returns {Promise<string>} the Cloudinary secure URL
 */
function uploadImage(file, type, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/upload/${type}`);

    const token = AdminAuth.getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch (_) { /* empty/invalid body */ }

      if (xhr.status === 401) {
        AdminAuth.clearSession();
        window.location.href = 'login.html';
        return reject(new Error('Session expired. Please log in again.'));
      }

      if (xhr.status >= 200 && xhr.status < 300 && data && data.success) {
        resolve(data.data.url);
      } else {
        reject(new Error((data && data.message) || `Upload failed (${xhr.status}).`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Could not reach the server. Check your connection and try again.'));
    });

    const formData = new FormData();
    formData.append('image', file);
    xhr.send(formData);
  });
}

/**
 * apiRequestMultipart — like apiRequest, but sends a FormData body instead
 * of JSON. Needed for endpoints that accept the file directly in the same
 * request (e.g. admin rider create/edit, which use upload.single('photo')
 * server-side) rather than the separate upload-then-store-URL pattern that
 * uploadImage()/img-upload widgets use for restaurants/menu/categories.
 * Mirrors apiRequest's error handling and 401 session logic exactly.
 */
async function apiRequestMultipart(path, method, formData) {
  const headers = {};
  const token = AdminAuth.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: formData });
  } catch (networkErr) {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  let data = null;
  try { data = await res.json(); } catch (_) { /* empty body */ }

  if (res.status === 401) {
    AdminAuth.clearSession();
    if (!location.pathname.endsWith('login.html')) {
      window.location.href = 'login.html';
    }
    throw new Error(data?.message || 'Session expired. Please log in again.');
  }

  if (!res.ok || data?.success === false) {
    throw new Error(data?.message || `Request failed (${res.status}).`);
  }

  return data;
}

/* ── Toasts ──────────────────────────────────────────────────── */

function showToast(message, type = 'success') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.2s ease';
    setTimeout(() => el.remove(), 200);
  }, 3800);
}

/* ── Formatting helpers used across views ───────────────────── */

function formatMoney(n) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN')}`;
}
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
}
