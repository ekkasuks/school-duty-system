// ============================================================
//  report.js  —  รายงานรายวัน + รายเดือน + PDF Print
//  โรงเรียนบ้านใหม่
// ============================================================

const SCHOOL_NAME  = 'โรงเรียนบ้านใหม่';
const SYSTEM_NAME  = 'ระบบตรวจเวรรับผิดชอบประจำวัน';

const THAI_MONTHS_SHORT = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const THAI_MONTHS_FULL  = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                           'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

let zonesAll    = [];
let studentsAll = [];
let currentMode = 'daily';

// ─── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('daily-date').value = todayISO();
  buildMonthYearSelectors();
  try {
    [zonesAll, studentsAll] = await Promise.all([ZoneAPI.getAll(), StudentAPI.getAll()]);
    populateZoneSelectors();
  } catch(e) {
    Toast.error('โหลดข้อมูลพื้นที่ไม่สำเร็จ: ' + e.message);
  }
});

function buildMonthYearSelectors() {
  const now  = new Date();
  const selM = document.getElementById('sel-month');
  const selY = document.getElementById('sel-year');
  THAI_MONTHS_FULL.slice(1).forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = i + 1; opt.textContent = name;
    if (i + 1 === now.getMonth() + 1) opt.selected = true;
    selM.appendChild(opt);
  });
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y + 543;
    if (y === now.getFullYear()) opt.selected = true;
    selY.appendChild(opt);
  }
}

function populateZoneSelectors() {
  const active = zonesAll.filter(z => String(z.active).toUpperCase() === 'TRUE');
  ['daily-zone', 'monthly-zone'].forEach(id => {
    const sel = document.getElementById(id);
    active.forEach(z => {
      const opt = document.createElement('option');
      opt.value = z.zone_id; opt.textContent = z.zone_name;
      sel.appendChild(opt);
    });
  });
}

// ─── SWITCH MODE ───────────────────────────────────────────────
function switchMode(mode) {
  currentMode = mode;
  document.getElementById('panel-daily').style.display   = mode === 'daily'   ? '' : 'none';
  document.getElementById('panel-monthly').style.display = mode === 'monthly' ? '' : 'none';
  document.getElementById('tab-daily').classList.toggle('active',   mode === 'daily');
  document.getElementById('tab-monthly').classList.toggle('active', mode === 'monthly');
}

// ══════════════════════════════════════════════════════════════
//  MODE A: DAILY REPORT
// ══════════════════════════════════════════════════════════════
let dailyData = null;

async function loadDailyReport() {
  const date   = document.getElementById('daily-date').value;
  const zoneId = document.getElementById('daily-zone').value;
  if (!date) return Toast.warning('กรุณาเลือกวันที่');

  Loading.show('กำลังโหลดข้อมูล...');
  try {
    // ใช้ dailyAttendance API ใหม่ — ได้ attendance รายคนของวันนั้นเลย
    const data = await ReportAPI.getDailyAttend(date, zoneId);
    dailyData  = { date, zoneId, ...data };
    renderDailyResult(dailyData);
    document.getElementById('btn-print-daily').style.display =
      data.attendance.length ? '' : 'none';
  } catch(e) {
    Toast.error('โหลดไม่สำเร็จ: ' + e.message);
  } finally { Loading.hide(); }
}

function renderDailyResult(d) {
  const el = document.getElementById('daily-result');

  if (!d.attendance || !d.attendance.length) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i>
      <p>ไม่พบข้อมูลการตรวจเวร วันที่ ${formatThaiDate(d.date)}</p></div>`;
    return;
  }

  // จัดกลุ่มตาม zone
  const grouped = {};
  d.attendance.forEach(a => {
    if (!grouped[a.zone_id]) grouped[a.zone_id] = [];
    grouped[a.zone_id].push(a);
  });

  let html = '';
  Object.entries(grouped).forEach(([zid, stuList]) => {
    const zoneInfo  = zonesAll.find(z => z.zone_id === zid) || { zone_name: zid };
    const checkInfo = (d.checks || []).find(c => c.zone_id === zid) || {};
    const present   = stuList.filter(s => s.status === 'present').length;
    const absent    = stuList.filter(s => s.status === 'absent').length;
    const noData    = stuList.filter(s => s.status === 'no_data').length;

    html += `
      <div class="result-card">
        <div class="result-header">
          <i class="fas fa-map-marker-alt" style="color:var(--primary);"></i>
          <h3>${zoneInfo.zone_name}</h3>
          <div style="margin-left:auto; display:flex; gap:0.5rem; align-items:center;">
            ${checkInfo.star_rating ? `<span class="badge badge-yellow">⭐ ${checkInfo.star_rating} ดาว</span>` : ''}
            <span class="badge badge-green">มา ${present}</span>
            <span class="badge badge-red">ขาด ${absent}</span>
            ${noData ? `<span class="badge badge-gray">ไม่มีข้อมูล ${noData}</span>` : ''}
          </div>
        </div>
        <div class="result-body">
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>#</th><th>ชื่อ-สกุล</th><th>ชั้น/ห้อง</th>
                <th style="text-align:center;">สถานะ</th><th>หมายเหตุ</th>
              </tr></thead>
              <tbody>
                ${stuList.map((s,i) => `
                  <tr>
                    <td>${i+1}</td>
                    <td style="font-weight:600;">${s.fullname}</td>
                    <td>ป.${s.class}/${s.room}</td>
                    <td style="text-align:center;">
                      <span class="badge ${s.status==='present'?'badge-green':s.status==='absent'?'badge-red':'badge-gray'}">
                        ${s.status==='present'?'✅ มาทำเวร':s.status==='absent'?'❌ ขาดเวร':'— ไม่มีข้อมูล'}
                      </span>
                    </td>
                    <td style="font-size:0.85rem; color:var(--text-lt);">${s.note||''}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  });

  el.innerHTML = html;
}

// ─── PRINT DAILY ───────────────────────────────────────────────
async function printDaily() {
  if (!dailyData) return Toast.warning('กรุณาโหลดข้อมูลก่อน');

  const { date, zoneId, rpt } = dailyData;
  // ดึง zone จากข้อมูลที่มีจริงในวันนั้น
  const zones = [...new Set((dailyData.attendance||[]).map(a => a.zone_id))]
    .map(zid => zonesAll.find(z => z.zone_id === zid) || { zone_id: zid, zone_name: zid });

  // สร้าง attendance map จาก dailyAttendance API
  const attMap = {};
  (dailyData.attendance || []).forEach(a => { attMap[a.student_id] = a; });

  let zonesHtml = '';
  zones.forEach((z, zi) => {
    // ใช้ข้อมูล attendance จาก API ตรงๆ จัดกลุ่มตาม zone
    const stuList = (dailyData.attendance || []).filter(a => a.zone_id === z.zone_id);
    if (!stuList.length) return;

    const presentCount = stuList.filter(s => s.status === 'present').length;
    const absentCount  = stuList.filter(s => s.status === 'absent').length;
    const checkInfo    = (dailyData.checks || []).find(c => c.zone_id === z.zone_id) || {};

    zonesHtml += `
      <div class="pr-zone-block">
        <div class="pr-section-title">
          พื้นที่: ${z.zone_name} (${z.zone_id})
          ${checkInfo.star_rating ? ` &nbsp;|&nbsp; คะแนน ${checkInfo.star_rating} ดาว` : ''}
          &nbsp;|&nbsp; มา ${presentCount} คน &nbsp; ขาด ${absentCount} คน
        </div>
        <table class="pr-table">
          <thead><tr>
            <th style="width:6%;">ที่</th>
            <th style="width:40%;">ชื่อ-สกุล</th>
            <th style="width:14%;">ชั้น/ห้อง</th>
            <th style="width:18%;">มาทำเวร</th>
            <th>หมายเหตุ</th>
          </tr></thead>
          <tbody>
            ${stuList.map((s, i) => `<tr>
              <td class="pr-center">${i+1}</td>
              <td>${s.fullname}</td>
              <td class="pr-center">ป.${s.class}/${s.room}</td>
              <td class="${s.status==='present' ? 'pr-present' : 'pr-absent'}">
                ${s.status==='present' ? '✅ มา' : '❌ ขาด'}
              </td>
              <td style="font-size:14pt;">${s.note||''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  });

  // รวมสถิติ
  const att          = dailyData.attendance || [];
  const totalStu     = att.length;
  const totalPresent = att.filter(a => a.status === 'present').length;
  const totalAbsent  = att.filter(a => a.status === 'absent').length;

  // สร้าง HTML สำหรับพิมพ์
  const printHtml = `
    <div class="pr-doc">
      <div class="pr-header">
        <div class="pr-school">${SCHOOL_NAME}</div>
        <div class="pr-system">${SYSTEM_NAME}</div>
        <div class="pr-title">รายงานสรุปการมาทำเวรประจำวัน</div>
        <div class="pr-sub">
          วันที่ ${formatThaiDate(date)}
          &nbsp;&nbsp;|&nbsp;&nbsp;
          พื้นที่: ${zoneId === 'all' ? 'ทุกพื้นที่' : (zonesAll.find(z=>z.zone_id===zoneId)||{}).zone_name || zoneId}
        </div>
      </div>

      ${zonesHtml}

      <div class="pr-summary-box pr-no-break">
        <div style="font-size:16pt; font-weight:bold; margin-bottom:0.2cm;">สรุปภาพรวม</div>
        <div class="pr-summary-row">
          <span style="font-weight:bold;">นักเรียนทั้งหมด</span>
          <span>${totalStu} คน</span>
        </div>
        <div class="pr-summary-row">
          <span style="font-weight:bold;">มาทำเวร</span>
          <span style="color:#065F46; font-weight:bold;">${totalPresent} คน</span>
        </div>
        <div class="pr-summary-row">
          <span style="font-weight:bold;">ขาดเวร</span>
          <span style="color:#991B1B; font-weight:bold;">${totalAbsent} คน</span>
        </div>
        <div class="pr-summary-row">
          <span style="font-weight:bold;">ร้อยละการมาเวร</span>
          <span style="font-weight:bold;">${totalStu > 0 ? Math.round(totalPresent/totalStu*100) : 0}%</span>
        </div>
      </div>

      <div class="pr-sig-grid pr-no-break">
        <div class="pr-sig-block">
          <div class="pr-sig-line"></div>
          <div class="pr-sig-role">ผู้ตรวจเวร</div>
          <div class="pr-sig-name">(________________)</div>
          <div class="pr-sig-name">วันที่ .............</div>
        </div>
        <div class="pr-sig-block">
          <div class="pr-sig-line"></div>
          <div class="pr-sig-role">หัวหน้าฝ่ายอาคารสถานที่</div>
          <div class="pr-sig-name">(________________)</div>
          <div class="pr-sig-name">วันที่ .............</div>
        </div>
        <div class="pr-sig-block">
          <div class="pr-sig-line"></div>
          <div class="pr-sig-role">ผู้อำนวยการโรงเรียน</div>
          <div class="pr-sig-name">(________________)</div>
          <div class="pr-sig-name">วันที่ .............</div>
        </div>
      </div>

      <div class="pr-footer">พิมพ์เมื่อ ${formatThaiDate(todayISO())}</div>
    </div>`;

  triggerPrint(printHtml);
}

// ══════════════════════════════════════════════════════════════
//  MODE B: MONTHLY REPORT
// ══════════════════════════════════════════════════════════════
let monthlyData = null;

async function loadMonthlyReport() {
  const month  = parseInt(document.getElementById('sel-month').value);
  const year   = parseInt(document.getElementById('sel-year').value);
  const zoneId = document.getElementById('monthly-zone').value;

  Loading.show('กำลังโหลดรายงานประจำเดือน...');
  try {
    monthlyData = await ReportAPI.get(month, year, zoneId);
    renderMonthlyResult(monthlyData);
    document.getElementById('btn-print-monthly').style.display = '';
  } catch(e) {
    Toast.error('โหลดไม่สำเร็จ: ' + e.message);
  } finally { Loading.hide(); }
}

function renderMonthlyResult(d) {
  const el      = document.getElementById('monthly-result');
  const period  = `${THAI_MONTHS_FULL[d.month]} ${d.year + 543}`;

  if (!d.daily_summary.length) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i>
      <p>ไม่พบข้อมูล ${period}</p></div>`;
    return;
  }

  // Stats
  const topStu = d.student_rows[0];
  el.innerHTML = `
    <div class="stats-grid" style="margin-bottom:1.25rem;">
      <div class="stat-card"><div class="stat-icon yellow"><i class="fas fa-star"></i></div>
        <div><div class="stat-value">${d.overall_avg_star}⭐</div><div class="stat-label">ดาวเฉลี่ยทั้งเดือน</div></div></div>
      <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-clipboard-check"></i></div>
        <div><div class="stat-value">${d.total_checks}</div><div class="stat-label">ครั้งที่ตรวจ</div></div></div>
      <div class="stat-card"><div class="stat-icon green"><i class="fas fa-calendar-check"></i></div>
        <div><div class="stat-value">${d.daily_summary.length}</div><div class="stat-label">วันที่มีข้อมูล</div></div></div>
      <div class="stat-card"><div class="stat-icon purple"><i class="fas fa-trophy"></i></div>
        <div><div class="stat-value">${topStu ? topStu.percent+'%' : '—'}</div>
          <div class="stat-label">${topStu ? topStu.fullname.split(' ')[0] : 'ยังไม่มีข้อมูล'}</div></div></div>
    </div>

    <div class="result-card">
      <div class="result-header">
        <i class="fas fa-calendar-alt" style="color:var(--primary);"></i>
        <h3>สรุปคะแนนรายวัน — ${period}</h3>
      </div>
      <div class="result-body">
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>วันที่</th><th>คะแนนดาว</th><th>ผู้ตรวจ</th><th>หมายเหตุ</th></tr></thead>
            <tbody>
              ${d.daily_summary.map((r,i) => `
                <tr>
                  <td>${i+1}</td>
                  <td>${formatThaiDate(r.date)}</td>
                  <td>${renderStars(r.avg_star)} (${r.avg_star})</td>
                  <td style="font-size:0.85rem;">${r.inspectors}</td>
                  <td style="font-size:0.82rem; color:var(--text-lt);">${r.comment || '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="result-card">
      <div class="result-header">
        <i class="fas fa-user-graduate" style="color:var(--secondary);"></i>
        <h3>สรุปการมาทำเวรนักเรียน</h3>
      </div>
      <div class="result-body">
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>ชื่อ-สกุล</th><th>ชั้น/ห้อง</th>
              <th style="text-align:center;">มา</th><th style="text-align:center;">ขาด</th>
              <th style="text-align:center;">ร้อยละ</th></tr></thead>
            <tbody>
              ${d.student_rows.map((r,i) => `
                <tr>
                  <td>${i+1}</td>
                  <td style="font-weight:600;">${r.fullname}</td>
                  <td>ป.${r.class}/${r.room}</td>
                  <td style="text-align:center; color:#065F46; font-weight:700;">${r.present}</td>
                  <td style="text-align:center; color:var(--danger); font-weight:700;">${r.absent}</td>
                  <td style="text-align:center;">
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                      <div class="progress-bar" style="flex:1; min-width:50px;">
                        <div class="progress-fill ${r.percent>=80?'green':r.percent<50?'red':''}" style="width:${r.percent}%"></div>
                      </div>
                      <strong>${r.percent}%</strong>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// ─── PRINT MONTHLY ─────────────────────────────────────────────
async function printMonthly() {
  if (!monthlyData) return Toast.warning('กรุณาโหลดข้อมูลก่อน');
  const d      = monthlyData;
  const period = `${THAI_MONTHS_FULL[d.month]} ${d.year + 543}`;
  const topStu = d.student_rows[0];

  // สร้าง Zone groups สำหรับ monthly
  const zoneId = document.getElementById('monthly-zone').value;
  const zoneLabel = zoneId === 'all'
    ? 'ทุกพื้นที่'
    : (zonesAll.find(z => z.zone_id === zoneId)||{}).zone_name || zoneId;

  const printHtml = `
    <div class="pr-doc">
      <!-- Header -->
      <div class="pr-header">
        <div class="pr-school">${SCHOOL_NAME}</div>
        <div class="pr-system">${SYSTEM_NAME}</div>
        <div class="pr-title">รายงานสรุปคะแนนความสะอาดประจำเดือน</div>
        <div class="pr-sub">${period} &nbsp;|&nbsp; พื้นที่: ${zoneLabel}</div>
      </div>

      <!-- Section 1: Daily Score -->
      <div class="pr-section-title">1. สรุปคะแนนความสะอาดรายวัน</div>
      <table class="pr-table">
        <thead><tr>
          <th style="width:6%;">ที่</th>
          <th style="width:22%;">วันที่</th>
          <th style="width:20%;">คะแนนดาว</th>
          <th style="width:28%;">ผู้ตรวจเวร</th>
          <th>หมายเหตุ</th>
        </tr></thead>
        <tbody>
          ${d.daily_summary.map((r,i) => {
            const stars = [1,2,3,4,5].map(n => n <= Math.round(r.avg_star) ? '★' : '☆').join('');
            return `<tr>
              <td class="pr-center">${i+1}</td>
              <td>${formatThaiDate(r.date)}</td>
              <td class="pr-star">${stars} (${r.avg_star})</td>
              <td style="font-size:14pt;">${r.inspectors}</td>
              <td style="font-size:14pt;">${r.comment||''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>

      <!-- Section 2: Student Attendance -->
      <div class="pr-section-title">2. สรุปการมาทำเวรนักเรียน</div>
      <table class="pr-table">
        <thead><tr>
          <th style="width:6%;">ที่</th>
          <th style="width:36%;">ชื่อ-สกุล</th>
          <th style="width:14%;">ชั้น/ห้อง</th>
          <th style="width:11%;">มา (ครั้ง)</th>
          <th style="width:11%;">ขาด (ครั้ง)</th>
          <th style="width:14%;">ร้อยละ</th>
          <th>ระดับ</th>
        </tr></thead>
        <tbody>
          ${d.student_rows.map((r,i) => `<tr>
            <td class="pr-center">${i+1}</td>
            <td>${r.fullname}</td>
            <td class="pr-center">ป.${r.class}/${r.room}</td>
            <td class="pr-present">${r.present}</td>
            <td class="pr-absent">${r.absent}</td>
            <td class="pr-center" style="font-weight:bold;">${r.percent}%</td>
            <td class="pr-center" style="font-size:14pt;">
              ${r.percent>=80?'🥇 ดีเยี่ยม':r.percent>=60?'🥈 ดี':r.percent>=40?'🥉 พอใช้':'⚠️ ต้องปรับปรุง'}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>

      <!-- Section 3: Summary -->
      <div class="pr-section-title">3. สรุปผลท้ายรายงาน</div>
      <div class="pr-summary-box pr-no-break">
        <div class="pr-summary-row">
          <span style="font-weight:bold;">ดาวเฉลี่ยทั้งเดือน</span>
          <span>${d.overall_avg_star} ดาว</span>
        </div>
        <div class="pr-summary-row">
          <span style="font-weight:bold;">จำนวนครั้งที่ตรวจ</span>
          <span>${d.total_checks} ครั้ง</span>
        </div>
        <div class="pr-summary-row">
          <span style="font-weight:bold;">วันที่มีการตรวจเวร</span>
          <span>${d.daily_summary.length} วัน</span>
        </div>
        <div class="pr-summary-row">
          <span style="font-weight:bold;">นักเรียนมาเวรสูงสุด</span>
          <span>${topStu ? `${topStu.fullname} (${topStu.percent}%)` : '—'}</span>
        </div>
      </div>

      <!-- Signatures -->
      <div class="pr-sig-grid pr-no-break">
        <div class="pr-sig-block">
          <div class="pr-sig-line"></div>
          <div class="pr-sig-role">ผู้ตรวจเวร</div>
          <div class="pr-sig-name">(________________)</div>
          <div class="pr-sig-name">วันที่ .............</div>
        </div>
        <div class="pr-sig-block">
          <div class="pr-sig-line"></div>
          <div class="pr-sig-role">หัวหน้าฝ่ายอาคารสถานที่</div>
          <div class="pr-sig-name">(________________)</div>
          <div class="pr-sig-name">วันที่ .............</div>
        </div>
        <div class="pr-sig-block">
          <div class="pr-sig-line"></div>
          <div class="pr-sig-role">ผู้อำนวยการโรงเรียน</div>
          <div class="pr-sig-name">(________________)</div>
          <div class="pr-sig-name">วันที่ .............</div>
        </div>
      </div>
      <div class="pr-footer">พิมพ์เมื่อ ${formatThaiDate(todayISO())}</div>
    </div>`;

  triggerPrint(printHtml);
}

// ─── TRIGGER PRINT ─────────────────────────────────────────────
function triggerPrint(html) {
  const area = document.getElementById('print-area');
  area.innerHTML = html;
  setTimeout(() => {
    window.print();
    setTimeout(() => { area.innerHTML = ''; }, 1000);
  }, 300);
}
