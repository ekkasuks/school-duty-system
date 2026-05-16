// ============================================================
//  check.js  —  Daily Check Page Logic
// ============================================================

let studentsData = [];
let attendanceMap = {}; // student_id → { status, note }

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Set today
  const today = todayISO();
  document.getElementById('check-date').value = today;
  document.getElementById('today-sub').textContent = 'วันที่ ' + formatThaiDate(today);

  // Restore inspector name
  const saved = localStorage.getItem('inspector_name');
  if (saved) document.getElementById('inspector-name').value = saved;

  // Load zones
  await loadZones();

  // Star rating
  initStarRating('star-container', 'star-value');

  // Photo uploads
  initPhotoUpload('drop-problem', 'input-problem', 'preview-problem', 3);
  initPhotoUpload('drop-result',  'input-result',  'preview-result',  3);

  // Zone change listener
  document.getElementById('zone-select').addEventListener('change', onZoneChange);
});

// ─── LOAD ZONES ───────────────────────────────────────────────
async function loadZones() {
  try {
    const zones = await getCachedZones();
    const sel = document.getElementById('zone-select');
    zones.filter(z => String(z.active).toUpperCase() === 'TRUE').forEach(z => {
      const opt = document.createElement('option');
      opt.value = z.zone_id;
      opt.textContent = `[${z.zone_id}] ${z.zone_name}`;
      sel.appendChild(opt);
    });
  } catch (e) {
    Toast.error('ไม่สามารถโหลดพื้นที่ได้: ' + e.message);
  }
}

// ─── ZONE CHANGE ──────────────────────────────────────────────
async function onZoneChange() {
  const zoneId = document.getElementById('zone-select').value;
  if (!zoneId) {
    renderEmptyStudentList();
    return;
  }
  Loading.show('กำลังโหลดรายชื่อนักเรียน...');
  try {
    studentsData = await StudentAPI.getByZone(zoneId);
    attendanceMap = {};
    studentsData.forEach(s => {
      attendanceMap[s.student_id] = { status: 'present', note: '' };
    });
    renderStudentList();
    updateAttCount();
  } catch (e) {
    Toast.error('โหลดรายชื่อไม่สำเร็จ: ' + e.message);
  } finally {
    Loading.hide();
  }
}

// ─── RENDER STUDENT LIST ──────────────────────────────────────
function renderStudentList() {
  const wrap = document.getElementById('student-list-wrap');
  if (!studentsData.length) {
    wrap.innerHTML = `<div class="empty-state"><i class="fas fa-user-slash"></i><p>ไม่มีนักเรียนในพื้นที่นี้</p></div>`;
    return;
  }

  wrap.innerHTML = `<div class="att-list" id="att-list"></div>`;
  const list = document.getElementById('att-list');

  studentsData.forEach(s => {
    const att = attendanceMap[s.student_id];
    const initials = s.fullname.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const div = document.createElement('div');
    div.className = `att-item ${att.status}`;
    div.id = `att-row-${s.student_id}`;
    div.innerHTML = `
      <div class="att-avatar">${initials}</div>
      <div style="flex:1;">
        <div class="att-name">${s.fullname}</div>
        <div class="att-class">ป.${s.class}/${s.room}</div>
      </div>
      <div class="att-actions">
        <button class="att-btn present-btn ${att.status==='present'?'active-present':''}"
          onclick="setAtt('${s.student_id}','present')" title="มาทำเวร">✅</button>
        <button class="att-btn absent-btn ${att.status==='absent'?'active-absent':''}"
          onclick="setAtt('${s.student_id}','absent')" title="ไม่มาทำเวร">❌</button>
      </div>
      <input class="att-note" type="text" placeholder="หมายเหตุ"
        value="${att.note}"
        onchange="setNote('${s.student_id}', this.value)"
        title="หมายเหตุ เช่น ลาป่วย">`;
    list.appendChild(div);
  });
}

function renderEmptyStudentList() {
  document.getElementById('student-list-wrap').innerHTML = `
    <div class="empty-state"><i class="fas fa-users"></i><p>เลือกพื้นที่รับผิดชอบก่อน</p></div>`;
  document.getElementById('att-count').textContent = '0 คน';
}

// ─── SET ATTENDANCE ───────────────────────────────────────────
function setAtt(studentId, status) {
  if (!attendanceMap[studentId]) return;
  attendanceMap[studentId].status = status;

  const row = document.getElementById(`att-row-${studentId}`);
  if (!row) return;
  row.className = `att-item ${status}`;

  row.querySelector('.present-btn').classList.toggle('active-present', status === 'present');
  row.querySelector('.absent-btn').classList.toggle('active-absent', status === 'absent');
  updateAttCount();
}

function setNote(studentId, note) {
  if (attendanceMap[studentId]) attendanceMap[studentId].note = note;
}

function updateAttCount() {
  const present = Object.values(attendanceMap).filter(a => a.status === 'present').length;
  const total   = Object.keys(attendanceMap).length;
  document.getElementById('att-count').textContent = `${present}/${total} คน`;
}

// ─── SUBMIT ───────────────────────────────────────────────────
async function submitCheck() {
  // Validation
  const date          = document.getElementById('check-date').value;
  const inspectorName = document.getElementById('inspector-name').value.trim();
  const zoneId        = document.getElementById('zone-select').value;
  const starRating    = parseInt(document.getElementById('star-value').value) || 0;
  const comment       = document.getElementById('check-comment').value.trim();

  if (!date)          return Toast.warning('กรุณาเลือกวันที่');
  if (!inspectorName) return Toast.warning('กรุณากรอกชื่อผู้ตรวจเวร');
  if (!zoneId)        return Toast.warning('กรุณาเลือกพื้นที่');
  if (starRating < 1) return Toast.warning('กรุณาให้คะแนนดาวความสะอาด');

  // Save inspector name for next time
  localStorage.setItem('inspector_name', inspectorName);

  Loading.show('กำลังบันทึกข้อมูล...');
  document.getElementById('submit-btn').disabled = true;

  try {
    // 1. Save check data
    const attendance = Object.entries(attendanceMap).map(([student_id, a]) => ({
      student_id, status: a.status, note: a.note,
    }));

    const result = await CheckAPI.save({
      date, zone_id: zoneId, inspector_name: inspectorName,
      star_rating: starRating, comment, attendance,
    });
    const checkId = result.check_id;

    // 2. Upload problem photos
    const dropProblem = document.getElementById('drop-problem');
    const dropResult  = document.getElementById('drop-result');
    const problemFiles = dropProblem._getFiles ? dropProblem._getFiles() : [];
    const resultFiles  = dropResult._getFiles  ? dropResult._getFiles()  : [];

    const uploads = [
      ...problemFiles.map(f => uploadPhotoFile(f, checkId, 'problem')),
      ...resultFiles.map(f  => uploadPhotoFile(f, checkId, 'result')),
    ];
    if (uploads.length) {
      Loading.show(`กำลังอัปโหลดรูป (${uploads.length} ไฟล์)...`);
      await Promise.allSettled(uploads);
    }

    Toast.success('✅ บันทึกการตรวจเวรสำเร็จ!');
    Cache.clear('dashboard');

    // Reset form
    setTimeout(() => {
      document.getElementById('zone-select').value = '';
      document.getElementById('check-comment').value = '';
      document.getElementById('star-value').value = '0';
      document.querySelectorAll('.star').forEach(s => s.classList.remove('active'));
      dropProblem._clear && dropProblem._clear();
      dropResult._clear  && dropResult._clear();
      renderEmptyStudentList();
      studentsData = [];
      attendanceMap = {};
    }, 800);

  } catch (e) {
    Toast.error('บันทึกไม่สำเร็จ: ' + e.message);
  } finally {
    Loading.hide();
    document.getElementById('submit-btn').disabled = false;
  }
}
