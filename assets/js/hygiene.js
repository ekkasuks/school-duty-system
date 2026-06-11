// ============================================================
//  hygiene.js — ระบบตรวจสุขลักษณะนักเรียน
// ============================================================

const HYGIENE_ITEMS = [
  { key: 'haircut',    label: 'ผม',        icon: '🪮' },
  { key: 'spoon',      label: 'ช้อน',      icon: '🥄' },
  { key: 'glass',      label: 'แก้วน้ำ',   icon: '🥤' },
  { key: 'toothbrush', label: 'แปรงสีฟัน', icon: '🪥' },
  { key: 'body_clean', label: 'ร่างกาย',   icon: '🧼' },
];

let studentsAll  = [];
let zonesAll     = [];
let hygieneMap   = {};   // student_id → { haircut, spoon, glass, toothbrush, body_clean, note }
let currentZone  = 'all';
let existingData = {};   // student_id → hygiene_id (ถ้ามีข้อมูลเดิม)

// ─── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('hygiene-date').value = todayISO();
  const saved = localStorage.getItem('hygiene_inspector');
  if (saved) document.getElementById('hygiene-inspector').value = saved;
});

// ─── LOAD STUDENTS ─────────────────────────────────────────────
async function loadStudents() {
  const date      = document.getElementById('hygiene-date').value;
  const inspector = document.getElementById('hygiene-inspector').value.trim();
  if (!date)      return Toast.warning('กรุณาเลือกวันที่');
  if (!inspector) return Toast.warning('กรุณากรอกชื่อผู้ตรวจ');
  localStorage.setItem('hygiene_inspector', inspector);

  Loading.show('กำลังโหลดรายชื่อ...');
  try {
    [studentsAll, zonesAll] = await Promise.all([
      StudentAPI.getAll(),
      ZoneAPI.getAll(),
    ]);
    studentsAll = studentsAll.filter(s => String(s.active).toUpperCase() === 'TRUE');

    // โหลดข้อมูลที่ตรวจไปแล้วในวันนั้น (ถ้ามี)
    const existing = await HygieneAPI.getByDate(date);
    existingData   = {};
    hygieneMap     = {};

    // default ทุกคน = pass ทั้งหมด
    studentsAll.forEach(s => {
      hygieneMap[s.student_id] = {
        haircut: true, spoon: true, glass: true,
        toothbrush: true, body_clean: true, note: '',
      };
    });

    // ถ้ามีข้อมูลเดิม → ใส่ค่าเดิม
    existing.forEach(r => {
      existingData[r.student_id] = r.hygiene_id;
      if (hygieneMap[r.student_id]) {
        hygieneMap[r.student_id] = {
          haircut:    r.haircut,
          spoon:      r.spoon,
          glass:      r.glass,
          toothbrush: r.toothbrush,
          body_clean: r.body_clean,
          note:       r.note || '',
        };
      }
    });

    buildZoneTabs();
    renderCurrentZone();
    document.getElementById('zone-tabs-wrap').style.display = '';
    document.getElementById('action-btns').style.display    = '';

    if (existing.length) {
      Toast.info(`โหลดข้อมูลที่ตรวจไปแล้ว ${existing.length} คน`);
    }
  } catch(e) {
    Toast.error('โหลดไม่สำเร็จ: ' + e.message);
  } finally { Loading.hide(); }
}

// ─── ZONE TABS ─────────────────────────────────────────────────
function buildZoneTabs() {
  const tabs    = document.getElementById('zone-tabs');
  const active  = zonesAll.filter(z => String(z.active).toUpperCase() === 'TRUE');
  const allCount = studentsAll.length;

  let html = `<button class="zone-tab-btn ${currentZone==='all'?'active':''}"
    onclick="switchZone('all')">ทั้งหมด <span class="tab-count">${allCount}</span></button>`;

  active.forEach(z => {
    const count = studentsAll.filter(s => s.zone_id === z.zone_id).length;
    if (!count) return;
    html += `<button class="zone-tab-btn ${currentZone===z.zone_id?'active':''}"
      onclick="switchZone('${z.zone_id}')">${z.zone_name}
      <span class="tab-count">${count}</span></button>`;
  });

  tabs.innerHTML = html;
}

function switchZone(zoneId) {
  currentZone = zoneId;
  buildZoneTabs();
  renderCurrentZone();
}

// ─── RENDER LIST ───────────────────────────────────────────────
function renderCurrentZone() {
  const list = document.getElementById('hygiene-list');
  const students = currentZone === 'all'
    ? studentsAll
    : studentsAll.filter(s => s.zone_id === currentZone);

  if (!students.length) {
    list.innerHTML = `<div class="empty-state" style="padding:2rem;">
      <i class="fas fa-user-slash"></i><p>ไม่มีนักเรียนในพื้นที่นี้</p></div>`;
    updateSummary();
    return;
  }

  list.innerHTML = students.map((s, i) => buildHygieneRow(s, i)).join('');
  updateSummary();
}

function buildHygieneRow(s, idx) {
  const h   = hygieneMap[s.student_id];
  const allPass = HYGIENE_ITEMS.every(item => h[item.key]);
  const hasFail = HYGIENE_ITEMS.some(item => !h[item.key]);
  const rowClass = allPass ? 'all-pass' : hasFail ? 'has-fail' : '';
  const hasExisting = !!existingData[s.student_id];

  const checks = HYGIENE_ITEMS.map(item => `
    <div class="hyg-check ${h[item.key] ? 'pass' : 'fail'}"
      id="chk-${s.student_id}-${item.key}"
      onclick="toggleItem('${s.student_id}','${item.key}')"
      title="${item.label}">
      ${h[item.key] ? '✅' : '❌'}
    </div>`).join('');

  return `
    <div class="hygiene-row ${rowClass}" id="row-${s.student_id}">
      <div class="stu-info" onclick="toggleNote('${s.student_id}')" style="cursor:pointer;">
        <div class="stu-name">
          ${hasExisting ? '<span style="color:var(--accent);font-size:0.7rem;">✓บันทึกแล้ว </span>' : ''}
          ${s.fullname}
        </div>
        <div class="stu-class">ป.${s.class}/${s.room}</div>
      </div>
      ${checks}
    </div>
    <div class="note-row" id="note-${s.student_id}">
      <input class="note-input" type="text"
        placeholder="หมายเหตุ (ไม่บังคับ)"
        value="${h.note || ''}"
        onchange="setNote('${s.student_id}', this.value)">
    </div>`;
}

// ─── TOGGLE ────────────────────────────────────────────────────
function toggleItem(studentId, key) {
  if (!hygieneMap[studentId]) return;
  hygieneMap[studentId][key] = !hygieneMap[studentId][key];

  // อัปเดต DOM
  const chk = document.getElementById(`chk-${studentId}-${key}`);
  const val  = hygieneMap[studentId][key];
  chk.className = `hyg-check ${val ? 'pass' : 'fail'}`;
  chk.textContent = val ? '✅' : '❌';

  // อัปเดต row class
  const row     = document.getElementById(`row-${studentId}`);
  const h       = hygieneMap[studentId];
  const allPass = HYGIENE_ITEMS.every(item => h[item.key]);
  row.className = `hygiene-row ${allPass ? 'all-pass' : 'has-fail'}`;

  updateSummary();
}

function toggleNote(studentId) {
  const noteRow = document.getElementById(`note-${studentId}`);
  if (noteRow) noteRow.classList.toggle('show');
}

function setNote(studentId, note) {
  if (hygieneMap[studentId]) hygieneMap[studentId].note = note;
}

function markAllPass() {
  const students = currentZone === 'all'
    ? studentsAll
    : studentsAll.filter(s => s.zone_id === currentZone);
  students.forEach(s => {
    HYGIENE_ITEMS.forEach(item => { hygieneMap[s.student_id][item.key] = true; });
  });
  renderCurrentZone();
  Toast.info('ตั้งค่าผ่านทั้งหมดแล้ว');
}

// ─── SUMMARY ───────────────────────────────────────────────────
function updateSummary() {
  const students = currentZone === 'all'
    ? studentsAll
    : studentsAll.filter(s => s.zone_id === currentZone);

  const passAll = students.filter(s =>
    HYGIENE_ITEMS.every(item => hygieneMap[s.student_id]?.[item.key])
  ).length;
  const hasFail = students.length - passAll;

  document.getElementById('sum-pass').textContent  = `ผ่านทั้งหมด: ${passAll} คน`;
  document.getElementById('sum-fail').textContent  = `ไม่ผ่านบางรายการ: ${hasFail} คน`;
  document.getElementById('sum-total').textContent = `รวม: ${students.length} คน`;
}

// ─── SAVE ──────────────────────────────────────────────────────
async function saveHygiene() {
  const date      = document.getElementById('hygiene-date').value;
  const inspector = document.getElementById('hygiene-inspector').value.trim();
  if (!date || !inspector) return Toast.warning('กรุณาเลือกวันที่และชื่อผู้ตรวจ');

  Loading.show('กำลังบันทึก...');
  try {
    const records = studentsAll.map(s => ({
      student_id:  s.student_id,
      haircut:     hygieneMap[s.student_id]?.haircut    ?? true,
      spoon:       hygieneMap[s.student_id]?.spoon      ?? true,
      glass:       hygieneMap[s.student_id]?.glass      ?? true,
      toothbrush:  hygieneMap[s.student_id]?.toothbrush ?? true,
      body_clean:  hygieneMap[s.student_id]?.body_clean ?? true,
      note:        hygieneMap[s.student_id]?.note       || '',
    }));

    const res = await HygieneAPI.save({ date, inspector, records });
    Toast.success(`✅ บันทึกสำเร็จ ${res.saved} คน`);

    // reload เพื่ออัปเดต "บันทึกแล้ว" badges
    await loadStudents();
  } catch(e) {
    Toast.error('บันทึกไม่สำเร็จ: ' + e.message);
  } finally { Loading.hide(); }
}
