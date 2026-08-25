// ============================================================
//  api.js  —  API Client for Google Apps Script REST
// ============================================================

// ★ เปลี่ยน URL ตรงนี้หลัง Deploy Apps Script แล้ว ★
const API_URL = 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';

// ─── ตรวจสอบ URL ก่อนใช้งาน ────────────────────────────────
function checkApiUrl() {
  if (!API_URL || API_URL.includes('YOUR_APPS_SCRIPT')) {
    throw new Error(
      'ยังไม่ได้ตั้งค่า API URL\n\n' +
      'วิธีแก้: เปิดไฟล์ assets/js/api.js\n' +
      'แล้วแก้ค่า API_URL บรรทัดที่ 6 เป็น URL จาก Apps Script'
    );
  }
  if (!API_URL.startsWith('https://')) {
    throw new Error('API URL ต้องขึ้นต้นด้วย https://');
  }
}

// ─── BUILD URL (ไม่ใช้ new URL() เพื่อหลีกเลี่ยง crash) ─────
function buildGetUrl(action, params) {
  let url = API_URL;
  const qs = [];
  qs.push('action=' + encodeURIComponent(action));
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    }
  });
  return url + (url.includes('?') ? '&' : '?') + qs.join('&');
}

// ─── CORE GET ────────────────────────────────────────────────
async function apiGet(action, params = {}) {
  checkApiUrl();
  const url = buildGetUrl(action, params);

  let res;
  try {
    res = await fetch(url, { method: 'GET', redirect: 'follow' });
  } catch (netErr) {
    throw new Error('เชื่อมต่อ API ไม่ได้: ' + netErr.message);
  }

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Response ไม่ใช่ JSON: ' + text.slice(0, 150));
  }

  if (json.status !== 200) throw new Error(json.error || 'API Error ' + json.status);
  return json.data;
}

// ─── CORE POST ───────────────────────────────────────────────
async function apiPost(action, body = {}) {
  checkApiUrl();
  const payload = JSON.stringify({ action, ...body });

  // แจ้งขนาด payload เพื่อ debug
  const sizeKB = Math.round(payload.length / 1024);
  if (sizeKB > 100) console.log('[apiPost] ' + action + ' payload size: ' + sizeKB + 'KB');

  let res;
  try {
    // ใช้ AbortController เพื่อ timeout 60 วินาที (รูปใหญ่ใช้เวลานาน)
    const ctrl    = new AbortController();
    const timer   = setTimeout(() => ctrl.abort(), 60000);
    res = await fetch(API_URL, {
      method:   'POST',
      redirect: 'follow',
      headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
      body:     payload,
      signal:   ctrl.signal,
    });
    clearTimeout(timer);
  } catch (netErr) {
    if (netErr.name === 'AbortError') throw new Error('หมดเวลา (timeout 60s) — รูปอาจใหญ่เกินไป');
    throw new Error('เชื่อมต่อ API ไม่ได้: ' + netErr.message);
  }

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Response ไม่ใช่ JSON: ' + text.slice(0, 200));
  }

  if (json.status !== 200) throw new Error(json.error || 'API Error ' + json.status);
  return json.data;
}

// ─── ZONES ───────────────────────────────────────────────────
const ZoneAPI = {
  getAll: ()     => apiGet('zones'),
  save:   (data) => apiPost('saveZone', data),
  delete: (id)   => apiPost('deleteZone', { zone_id: id }),
};

// ─── STUDENTS ────────────────────────────────────────────────
const StudentAPI = {
  getAll:    ()       => apiGet('students'),
  getByZone: (zid)    => apiGet('students', { zone_id: zid }),
  save:      (data)   => apiPost('saveStudent', data),
  delete:    (id)     => apiPost('deleteStudent', { student_id: id }),
};

// ─── DAILY CHECK ─────────────────────────────────────────────
const CheckAPI = {
  save: (data) => apiPost('dailyCheck', data),
};

// ─── PHOTOS ──────────────────────────────────────────────────
const PhotoAPI = {
  upload:     (data) => apiPost('uploadPhoto', data),
  getByCheck: (cid)  => apiGet('photos', { check_id: cid }),
};

// ─── DASHBOARD ───────────────────────────────────────────────
const DashboardAPI = {
  get:        (date) => apiGet('dashboard', { date }),
  zoneStatus: (date) => apiGet('zoneStatus', { date }),  // lightweight — for check-page board
};

// ─── REPORT ──────────────────────────────────────────────────
const ReportAPI = {
  get:            (month, year, zone_id) => apiGet('report', { month, year, zone_id }),
  getDailyAttend: (date, zone_id)        => apiGet('dailyAttendance', { date, zone_id }),
};

// ─── HYGIENE ─────────────────────────────────────────────────
const HygieneAPI = {
  save:      (data)              => apiPost('saveHygieneCheck', data),
  delete:    (hygiene_id)        => apiPost('deleteHygieneCheck', { hygiene_id }),
  getByDate: (date)              => apiGet('hygieneCheck', { date }),
  getReport: (month, year)       => apiGet('hygieneReport', { month, year }),
};

// ─── CACHE ───────────────────────────────────────────────────
const Cache = {
  set(key, data, ttl = 300) {
    try {
      localStorage.setItem(key, JSON.stringify({ data, exp: Date.now() + ttl * 1000 }));
    } catch {}
  },
  get(key) {
    try {
      const item = JSON.parse(localStorage.getItem(key));
      if (!item || Date.now() > item.exp) { localStorage.removeItem(key); return null; }
      return item.data;
    } catch { return null; }
  },
  clear(key) { try { localStorage.removeItem(key); } catch {} },
};

async function getCachedZones() {
  const cached = Cache.get('zones');
  if (cached) return cached;
  const data = await ZoneAPI.getAll();
  Cache.set('zones', data, 300);
  return data;
}

// ─── API_URL SETUP HELPER ─────────────────────────────────────
// เรียกตอน load หน้า — แสดง banner เตือนถ้ายังไม่ตั้งค่า
function checkAndShowSetupBanner() {
  if (!API_URL || API_URL.includes('YOUR_APPS_SCRIPT')) {
    const banner = document.createElement('div');
    banner.id = 'setup-banner';
    banner.style.cssText = `
      position:fixed; top:64px; left:0; right:0; z-index:9000;
      background:#FEF08A; border-bottom:2px solid #EAB308;
      padding:0.75rem 1.25rem; font-size:0.9rem; color:#713F12;
      display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;
    `;
    banner.innerHTML = `
      <i class="fas fa-exclamation-triangle" style="color:#D97706; font-size:1.1rem;"></i>
      <strong>ยังไม่ได้ตั้งค่า API URL</strong>
      <span>— เปิดไฟล์ <code style="background:rgba(0,0,0,.08);padding:0.1rem 0.4rem;border-radius:4px;">assets/js/api.js</code>
      แก้ค่า <code style="background:rgba(0,0,0,.08);padding:0.1rem 0.4rem;border-radius:4px;">API_URL</code>
      บรรทัดที่ 6 เป็น URL จาก Google Apps Script</span>
      <a href="README.md" target="_blank" style="margin-left:auto;color:#92400E;font-weight:700;">
        ดูวิธีตั้งค่า →
      </a>`;
    document.body.appendChild(banner);
    // ขยับ page-wrapper ลง
    const pw = document.querySelector('.page-wrapper');
    if (pw) pw.style.paddingTop = 'calc(64px + 54px + 1.5rem)';
  }
}

document.addEventListener('DOMContentLoaded', checkAndShowSetupBanner);
