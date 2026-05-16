// ============================================================
//  dashboard.js  —  Dashboard Page Logic
// ============================================================

let trendChart = null;
let dashData   = null;
let activeTab  = 7;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('dash-date').value = todayISO();
  loadDashboard();
});

async function loadDashboard() {
  const date = document.getElementById('dash-date').value || todayISO();
  document.getElementById('dash-date-label').textContent = 'ข้อมูล ณ วันที่ ' + formatThaiDate(date);

  Loading.show('กำลังโหลด Dashboard...');
  try {
    dashData = await DashboardAPI.get(date);
    renderStats(dashData);
    renderZoneBanners(dashData);
    renderTrendChart(dashData, activeTab);
    renderZoneRanking(dashData);
    renderStudentRanking(dashData);
  } catch (e) {
    Toast.error('โหลด Dashboard ไม่สำเร็จ: ' + e.message);
  } finally {
    Loading.hide();
  }
}

// ─── STATS ────────────────────────────────────────────────────
function renderStats(d) {
  document.getElementById('stat-avg-star').innerHTML = d.avg_star
    ? `${d.avg_star} <span style="font-size:1rem;">⭐</span>` : '—';
  document.getElementById('stat-checks').textContent  = d.total_checks || 0;
  document.getElementById('stat-present').textContent = d.present || 0;
  document.getElementById('stat-absent').textContent  = d.absent  || 0;
}

// ─── ZONE BANNERS ─────────────────────────────────────────────
function renderZoneBanners(d) {
  const ranking = d.zone_ranking || [];
  const top = ranking[0];
  const bot = ranking[ranking.length - 1];

  if (top) {
    document.getElementById('top-zone-name').textContent  = top.zone_name;
    document.getElementById('top-zone-stars').innerHTML   = renderStars(top.avg) + ` (${top.avg})`;
  }
  if (bot && bot !== top) {
    document.getElementById('bot-zone-name').textContent  = bot.zone_name;
    document.getElementById('bot-zone-stars').innerHTML   = renderStars(bot.avg) + ` (${bot.avg})`;
  }
}

// ─── TREND CHART ──────────────────────────────────────────────
function renderTrendChart(d, days) {
  const raw    = days === 7 ? (d.trend_7 || []) : (d.trend_30 || []);
  const labels = raw.map(r => {
    const dt = new Date(r.date);
    return `${dt.getDate()}/${dt.getMonth()+1}`;
  });
  const values = raw.map(r => r.avg_star);

  if (trendChart) trendChart.destroy();
  const ctx = document.getElementById('trend-chart').getContext('2d');
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'ดาวเฉลี่ย',
        data: values,
        borderColor: '#6C9BCF',
        backgroundColor: 'rgba(108,155,207,0.12)',
        borderWidth: 2.5,
        pointBackgroundColor: '#6C9BCF',
        pointRadius: 4,
        fill: true,
        tension: 0.4,
        spanGaps: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ctx.parsed.y !== null ? `${ctx.parsed.y} ดาว` : 'ไม่มีข้อมูล',
          },
        },
      },
      scales: {
        y: { min: 0, max: 5, ticks: { stepSize: 1 }, grid: { color: '#f0eeff' } },
        x: { grid: { display: false } },
      },
    },
  });
}

function switchTab(days) {
  activeTab = days;
  document.getElementById('tab7').classList.toggle('active', days === 7);
  document.getElementById('tab30').classList.toggle('active', days === 30);
  if (dashData) renderTrendChart(dashData, days);
}

// ─── ZONE RANKING ─────────────────────────────────────────────
function renderZoneRanking(d) {
  const el   = document.getElementById('zone-ranking');
  const list = d.zone_ranking || [];
  if (!list.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>ยังไม่มีข้อมูลวันนี้</p></div>'; return; }

  el.innerHTML = list.map((z, i) => `
    <div class="ranking-item">
      <div class="rank-num ${i===0?'top1':i===1?'top2':i===2?'top3':''}">${i+1}</div>
      <div class="rank-info">
        <div class="rank-name">${z.zone_name}</div>
        <div class="rank-sub">${renderStars(z.avg)}</div>
      </div>
      <div class="rank-score">${z.avg}⭐</div>
    </div>`).join('');
}

// ─── STUDENT RANKING ──────────────────────────────────────────
async function renderStudentRanking(d) {
  const el   = document.getElementById('student-ranking');
  const list = d.student_ranking || [];
  if (!list.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>ยังไม่มีข้อมูล</p></div>'; return; }

  // Fetch student names
  let studentMap = {};
  try {
    const students = await StudentAPI.getAll();
    students.forEach(s => { studentMap[s.student_id] = s; });
  } catch {}

  el.innerHTML = list.slice(0, 10).map((r, i) => {
    const stu = studentMap[r.student_id] || {};
    const name = stu.fullname || r.student_id;
    const cls  = stu.class && stu.room ? `ม.${stu.class}/${stu.room}` : '';
    return `
      <div class="ranking-item">
        <div class="rank-num ${i===0?'top1':i===1?'top2':i===2?'top3':''}">${i+1}</div>
        <div class="rank-info">
          <div class="rank-name">${name}</div>
          <div class="rank-sub">${cls} · มา ${r.present}/${r.total} ครั้ง</div>
        </div>
        <div class="rank-score" style="color:${r.percent>=80?'var(--accent)':r.percent>=50?'var(--accent2)':'var(--danger)'}">${r.percent}%</div>
      </div>`;
  }).join('');
}
