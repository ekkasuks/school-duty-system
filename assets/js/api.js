// ============================================================
//  api.js  —  API Client for Google Apps Script REST
//  ใส่ URL ของ Web App ที่ Deploy แล้วในตัวแปร API_URL
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbyt414q0mVijpXng_Ibp5maCnS1NdfsVo_QeRucFkB5OTDz79XXpFJkK7SVDQNg7YArkw/exec'; // ← เปลี่ยนตรงนี้

// ─── CORE FETCH WRAPPER ───────────────────────────────────────
// สำคัญ: Apps Script Web App จะ redirect ไป URL ใหม่เสมอ
// ต้องใช้ redirect: 'follow' และ mode จัดการ CORS ผ่าน Apps Script ฝั่ง server

async function apiGet(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });

  let res;
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow',   // ← จำเป็นสำหรับ Apps Script
    });
  } catch (netErr) {
    throw new Error('เชื่อมต่อ API ไม่ได้: ' + netErr.message);
  }

  // Apps Script ส่ง 302 redirect → fetch follow แล้วได้ 200
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error('Response ไม่ใช่ JSON: ' + text.slice(0, 200)); }

  if (json.status !== 200) throw new Error(json.error || 'API Error ' + json.status);
  return json.data;
}

async function apiPost(action, body = {}) {
  // Apps Script POST ต้องส่งเป็น form-urlencoded หรือ raw text
  // ใช้ application/x-www-form-urlencoded เพื่อหลีกเลี่ยง CORS preflight
  const payload = JSON.stringify({ action, ...body });

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',            // ← จำเป็นสำหรับ Apps Script
      headers: { 'Content-Type': 'text/plain' },  // ← หลีกเลี่ยง preflight
      body: payload,
    });
  } catch (netErr) {
    throw new Error('เชื่อมต่อ API ไม่ได้: ' + netErr.message);
  }

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error('Response ไม่ใช่ JSON: ' + text.slice(0, 200)); }

  if (json.status !== 200) throw new Error(json.error || 'API Error ' + json.status);
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
