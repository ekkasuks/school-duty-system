// ============================================================
//  api.js  —  API Client for Google Apps Script REST
//  ใส่ URL ของ Web App ที่ Deploy แล้วในตัวแปร API_URL
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbwcRUxCGmm3P8d5iJTVR38QFcvyoz_NYiNJJStiTfHuNzKuO3KgNjOqgqpO6SqO_vwU/exec'; // ← เปลี่ยนตรงนี้

// ─── CORE FETCH WRAPPER ───────────────────────────────────────
async function apiGet(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, v));

  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== 200) throw new Error(json.error || 'API Error');
  return json.data;
}

async function apiPost(action, body = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== 200) throw new Error(json.error || 'API Error');
  return json.data;
}

// ─── ZONES ───────────────────────────────────────────────────
const ZoneAPI = {
  getAll: () => apiGet('zones'),
  save:   (data) => apiPost('saveZone', data),
  delete: (zone_id) => apiPost('deleteZone', { zone_id }),
};

// ─── STUDENTS ─────────────────────────────────────────────────
const StudentAPI = {
  getAll:     ()        => apiGet('students'),
  getByZone:  (zone_id) => apiGet('students', { zone_id }),
  save:       (data)    => apiPost('saveStudent', data),
  delete:     (student_id) => apiPost('deleteStudent', { student_id }),
};

// ─── DAILY CHECK ──────────────────────────────────────────────
const CheckAPI = {
  save: (data) => apiPost('dailyCheck', data),
};

// ─── PHOTOS ──────────────────────────────────────────────────
const PhotoAPI = {
  upload: (data) => apiPost('uploadPhoto', data),
  getByCheck: (check_id) => apiGet('photos', { check_id }),
};

// ─── DASHBOARD ───────────────────────────────────────────────
const DashboardAPI = {
  get: (date) => apiGet('dashboard', { date }),
};

// ─── REPORT ──────────────────────────────────────────────────
const ReportAPI = {
  get: (month, year, zone_id) => apiGet('report', { month, year, zone_id }),
};

// ─── IMAGE TO BASE64 HELPER ───────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── UPLOAD PHOTO HELPER (file → Drive) ──────────────────────
async function uploadPhotoFile(file, check_id, type) {
  const base64 = await fileToBase64(file);
  return PhotoAPI.upload({
    base64,
    filename: file.name,
    mimeType: file.type,
    check_id,
    type,
  });
}

// ─── LOCAL STORAGE CACHE ──────────────────────────────────────
const Cache = {
  set(key, data, ttlSeconds = 300) {
    localStorage.setItem(key, JSON.stringify({ data, exp: Date.now() + ttlSeconds * 1000 }));
  },
  get(key) {
    try {
      const item = JSON.parse(localStorage.getItem(key));
      if (!item || Date.now() > item.exp) { localStorage.removeItem(key); return null; }
      return item.data;
    } catch { return null; }
  },
  clear(key) { localStorage.removeItem(key); },
};

// ─── CACHED ZONES (5 min) ─────────────────────────────────────
async function getCachedZones() {
  const cached = Cache.get('zones');
  if (cached) return cached;
  const data = await ZoneAPI.getAll();
  Cache.set('zones', data, 300);
  return data;
}
