// ============================================================
//  report.js  —  Monthly Report Page Logic + PDF Print
// ============================================================

const THAI_MONTHS = [
  '','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
];

let reportData = null;

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  buildMonthYearSelectors();
  await loadZoneSelector();
});

function buildMonthYearSelectors() {
  const now   = new Date();
  const selM  = document.getElementById('sel-month');
  const selY  = document.getElementById('sel-year');

  THAI_MONTHS.slice(1).forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = i + 1;
    opt.textContent = name;
    if (i + 1 === now.getMonth() + 1) opt.selected = true;
    selM.appendChild(opt);
  });

  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + 543;
    if (y === now.getFullYear()) opt.selected = true;
    selY.appendChild(opt);
  }
}

async function loadZoneSelector() {
  try {
    const zones = await getCachedZones();
    const sel   = document.getElementById('sel-zone');
    zones.filter(z => String(z.active).toUpperCase() === 'TRUE').forEach(z => {
      const opt = document.createElement('option');
      opt.value = z.zone_id;
      opt.textContent = `[${z.zone_id}] ${z.zone_name}`;
      sel.appendChild(opt);
    });
  } catch {}
}

// ─── LOAD REPORT ──────────────────────────────────────────────
async function loadReport() {
  const month  = parseInt(document.getElementById('sel-month').value);
  const year   = parseInt(document.getElementById('sel-year').value);
  const zoneId = document.getElementById('sel-zone').value;

  Loading.show('กำลังโหลดรายงาน...');
  try {
    reportData = await ReportAPI.get(month, year, zoneId);
    document.getElementById('report-empty').style.display  = 'none';
    document.getElementById('screen-report').style.display = 'block';
    renderScreenReport(reportData);
  } catch (e) {
    Toast.error('โหลดรายงานไม่สำเร็จ: ' + e.message);
  } finally {
    Loading.hide();
  }
}

// ─── SCREEN REPORT ────────────────────────────────────────────
function renderScreenReport(d) {
  // Stats
  const statsEl = document.getElementById('rpt-stats');
  const topStu  = d.student_rows[0];
  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon yellow"><i class="fas fa-star"></i></div>
      <div><div class="stat-value">${d.overall_avg_star}</div><div class="stat-label">ดาวเฉลี่ยทั้งเดือน</div></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon blue"><i class="fas fa-clipboard-check"></i></div>
      <div><div class="stat-value">${d.total_checks}</div><div class="stat-label">ครั้งที่ตรวจ</div></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green"><i class="fas fa-calendar-check"></i></div>
      <div><div class="stat-value">${d.daily_summary.length}</div><div class="stat-label">วันที่มีข้อมูล</div></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon purple"><i class="fas fa-user-check"></i></div>
      <div><div class="stat-value">${topStu ? topStu.percent+'%' : '—'}</div>
        <div class="stat-label">มาเวรสูงสุด${topStu?': '+topStu.fullname.split(' ')[0]:''}</div>
      </div>
    </div>`;

  // Daily table
  const tbody = document.getElementById('daily-tbody');
  tbody.innerHTML = d.daily_summary.map((r, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${formatThaiDate(r.date)}</td>
      <td>${renderStars(r.avg_star)} (${r.avg_star})</td>
      <td>${r.inspectors}</td>
      <td style="font-size:0.85rem; color:var(--text-lt);">${r.comment || '—'}</td>
    </tr>`).join('');

  // Student table
  const stbody = document.getElementById('student-tbody');
  stbody.innerHTML = d.student_rows.map((r, i) => `
    <tr>
      <td>${i+1}</td>
      <td style="font-weight:600;">${r.fullname}</td>
      <td>ม.${r.class}/${r.room}</td>
      <td style="text-align:center; color:var(--accent); font-weight:700;">${r.present}</td>
      <td style="text-align:center; color:var(--danger); font-weight:700;">${r.absent}</td>
      <td style="text-align:center;">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <div class="progress-bar" style="flex:1; min-width:60px;">
            <div class="progress-fill ${r.percent>=80?'green':r.percent<50?'red':''}" style="width:${r.percent}%"></div>
          </div>
          <strong>${r.percent}%</strong>
        </div>
      </td>
    </tr>`).join('');
}

// ─── PRINT REPORT ─────────────────────────────────────────────
function printReport() {
  if (!reportData) return Toast.warning('กรุณาโหลดรายงานก่อน');

  const d          = reportData;
  const schoolName = document.getElementById('school-name').value || 'โรงเรียน';
  const periodStr  = `${THAI_MONTHS[d.month]} ${d.year + 543}`;

  // Fill print header
  document.getElementById('pr-school').textContent    = schoolName;
  document.getElementById('pr-period').textContent    = periodStr;
  document.getElementById('pr-zone-name').textContent = `พื้นที่: ${d.zone_name}`;

  // Summary
  const topStu = d.student_rows[0];
  document.getElementById('pr-avg-star').textContent    = `${d.overall_avg_star} ดาว`;
  document.getElementById('pr-total-checks').textContent = `${d.total_checks} ครั้ง`;
  document.getElementById('pr-top-student').textContent  = topStu
    ? `${topStu.fullname} (${topStu.percent}%)` : '—';

  // Daily table
  const dailyTbody = document.getElementById('pr-daily-tbody');
  dailyTbody.innerHTML = d.daily_summary.map((r, i) => {
    const stars = [1,2,3,4,5].map(n => n <= r.avg_star ? '★' : '☆').join('');
    return `<tr>
      <td style="text-align:center;">${i+1}</td>
      <td>${formatThaiDate(r.date)}</td>
      <td style="text-align:center; font-size:14pt; letter-spacing:2px;">${stars} (${r.avg_star})</td>
      <td>${r.inspectors}</td>
      <td style="font-size:14pt;">${r.comment || ''}</td>
    </tr>`;
  }).join('');

  // Student table
  const stuTbody = document.getElementById('pr-student-tbody');
  stuTbody.innerHTML = d.student_rows.map((r, i) => {
    const pctClass = r.percent >= 80 ? 'pct-high' : r.percent >= 50 ? 'pct-mid' : 'pct-low';
    return `<tr>
      <td style="text-align:center;">${i+1}</td>
      <td>${r.fullname}</td>
      <td style="text-align:center;">ม.${r.class}/${r.room}</td>
      <td style="text-align:center;">${r.present}</td>
      <td style="text-align:center;">${r.absent}</td>
      <td class="pct-cell ${pctClass}">${r.percent}%</td>
    </tr>`;
  }).join('');

  // Print date footer
  document.getElementById('pr-print-date').textContent =
    `พิมพ์วันที่ ${formatThaiDate(todayISO())}`;

  // Show print layout and trigger print
  document.getElementById('print-report').style.display = 'block';
  setTimeout(() => {
    window.print();
    // Hide after print
    setTimeout(() => {
      document.getElementById('print-report').style.display = 'none';
    }, 500);
  }, 200);
}
