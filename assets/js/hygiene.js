// ============================================================
//  hygiene.js — ระบบตรวจสุขลักษณะนักเรียน v2
//  กรองได้: ทั้งโรงเรียน / รายชั้น ป.1-ป.6
// ============================================================

const HYGIENE_ITEMS = [
  { key: 'haircut',    label: 'ทรงผม',      icon: '🪮' },
  { key: 'spoon',      label: 'ช้อน',        icon: '🥄' },
  { key: 'glass',      label: 'แก้วน้ำ',     icon: '🥤' },
  { key: 'toothbrush', label: 'แปรงสีฟัน',  icon: '🪥' },
  { key: 'body_clean', label: 'ยาสีฟัน',    icon: '🪥' },
];

let studentsAll  = [];
let hygieneMap   = {};   // student_id → { haircut, spoon, glass, toothbrush, body_clean, note }
let existingData = {};   // student_id → hygiene_id
let currentFilter = 'all'; // 'all' | '1'|'2'|'3'|'4'|'5'|'6'

// ─── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
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
    studentsAll = (await StudentAPI.getAll())
      .filter(s => String(s.active).toUpperCase() === 'TRUE');

    // default ทุกคน = pass ทั้งหมด
    hygieneMap = {};
    studentsAll.forEach(s => {
      hygieneMap[s.student_id] = {
        haircut: true, spoon: true, glass: true,
        toothbrush: true, body_clean: true, note: '',
      };
    });

    // โหลดข้อมูลที่บันทึกไว้แล้วในวันนั้น
    const existing = await HygieneAPI.getByDate(date);
    existingData = {};
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

    buildClassTabs();
    renderList();
    document.getElementById('filter-wrap').style.display  = '';

    if (existing.length) {
      Toast.info(`พบข้อมูลที่บันทึกไว้ ${existing.length} คน — โหลดค่าเดิมแล้ว`);
    } else {
      Toast.success(`โหลดรายชื่อ ${studentsAll.length} คน เรียบร้อย`);
    }
  } catch(e) {
    Toast.error('โหลดไม่สำเร็จ: ' + e.message);
  } finally { Loading.hide(); }
}

// ─── BUILD CLASS FILTER TABS ───────────────────────────────────
function buildClassTabs() {
  const wrap = document.getElementById('class-tabs');

  // หา class ที่มีนักเรียนจริง
  const classes = [...new Set(studentsAll.map(s => String(s.class)))]
    .sort((a,b) => parseInt(a)-parseInt(b));

  let html = `<button class="class-tab-btn ${currentFilter==='all'?'active':''}"
    onclick="switchFilter('all')">
    ทั้งโรงเรียน <span class="tab-count">${studentsAll.length}</span>
  </button>`;

  classes.forEach(cls => {
    const count = studentsAll.filter(s => String(s.class) === cls).length;
    html += `<button class="class-tab-btn ${currentFilter===cls?'active':''}"
      onclick="switchFilter('${cls}')">
      ป.${cls} <span class="tab-count">${count}</span>
    </button>`;
  });

  wrap.innerHTML = html;
}

function switchFilter(filter) {
  currentFilter = filter;
  buildClassTabs();
  renderList();
}

// ─── GET FILTERED STUDENTS ─────────────────────────────────────
function getFilteredStudents() {
  if (currentFilter === 'all') return studentsAll;
  return studentsAll.filter(s => String(s.class) === currentFilter);
}

// ─── RENDER LIST ───────────────────────────────────────────────
function renderList() {
  const listEl   = document.getElementById('hygiene-list');
  const students = getFilteredStudents();

  if (!students.length) {
    listEl.innerHTML = `<div class="empty-state" style="padding:2rem;">
      <i class="fas fa-user-slash"></i><p>ไม่มีนักเรียนในชั้นนี้</p></div>`;
    updateSummary();
    return;
  }

  // จัดกลุ่มตามชั้น (ถ้าดูทั้งโรงเรียน)
  if (currentFilter === 'all') {
    const grouped = {};
    students.forEach(s => {
      const key = `ป.${s.class}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(s);
    });

    listEl.innerHTML = Object.entries(grouped).map(([cls, list]) => `
      <div class="class-group">
        <div class="class-group-header">
          <i class="fas fa-users"></i> ${cls}
          <span class="tab-count" style="margin-left:0.5rem;">${list.length} คน</span>
        </div>
        ${list.map(s => buildRow(s)).join('')}
      </div>`).join('');
  } else {
    listEl.innerHTML = students.map(s => buildRow(s)).join('');
  }

  updateSummary();
}

function buildRow(s) {
  const h       = hygieneMap[s.student_id];
  const allPass = HYGIENE_ITEMS.every(i => h[i.key]);
  const rowCls  = allPass ? 'all-pass' : 'has-fail';
  const saved   = !!existingData[s.student_id];

  const checks = HYGIENE_ITEMS.map(item => `
    <div class="hyg-check ${h[item.key]?'pass':'fail'}"
      id="chk-${s.student_id}-${item.key}"
      onclick="toggleItem('${s.student_id}','${item.key}')"
      title="${item.label}">
      ${h[item.key]?'✅':'❌'}
    </div>`).join('');

  return `
    <div class="hygiene-row ${rowCls}" id="row-${s.student_id}">
      <div class="stu-info" onclick="toggleNote('${s.student_id}')" style="cursor:pointer;">
        <div class="stu-name">
          ${saved?'<span class="saved-badge">✓</span>':''}
          ${s.fullname}
        </div>
        <div class="stu-class">ป.${s.class}/${s.room}</div>
      </div>
      ${checks}
    </div>
    <div class="note-row" id="note-${s.student_id}">
      <input class="note-input" type="text"
        placeholder="หมายเหตุ (กดที่ชื่อเพื่อเปิด/ปิด)"
        value="${h.note||''}"
        onchange="setNote('${s.student_id}',this.value)">
    </div>`;
}

// ─── TOGGLE ────────────────────────────────────────────────────
function toggleItem(sid, key) {
  hygieneMap[sid][key] = !hygieneMap[sid][key];
  const chk = document.getElementById(`chk-${sid}-${key}`);
  const val = hygieneMap[sid][key];
  chk.className   = `hyg-check ${val?'pass':'fail'}`;
  chk.textContent = val ? '✅' : '❌';
  const row     = document.getElementById(`row-${sid}`);
  const allPass = HYGIENE_ITEMS.every(i => hygieneMap[sid][i.key]);
  row.className = `hygiene-row ${allPass?'all-pass':'has-fail'}`;
  updateSummary();
}

function toggleNote(sid) {
  document.getElementById(`note-${sid}`)?.classList.toggle('show');
}

function setNote(sid, note) {
  if (hygieneMap[sid]) hygieneMap[sid].note = note;
}

// ─── MARK ALL ──────────────────────────────────────────────────
function markAllPass() {
  getFilteredStudents().forEach(s => {
    HYGIENE_ITEMS.forEach(item => { hygieneMap[s.student_id][item.key] = true; });
  });
  renderList();
  Toast.info('ตั้งค่าผ่านทั้งหมดแล้ว');
}

function markAllFail(key) {
  getFilteredStudents().forEach(s => { hygieneMap[s.student_id][key] = false; });
  renderList();
}

// ─── SUMMARY ───────────────────────────────────────────────────
function updateSummary() {
  const students = getFilteredStudents();
  const passAll  = students.filter(s => HYGIENE_ITEMS.every(i => hygieneMap[s.student_id]?.[i.key])).length;
  const hasFail  = students.length - passAll;
  document.getElementById('sum-pass').textContent  = `ผ่านทั้งหมด ${passAll} คน`;
  document.getElementById('sum-fail').textContent  = `ไม่ผ่านบางรายการ ${hasFail} คน`;
  document.getElementById('sum-total').textContent = `รวม ${students.length} คน`;

  // Item stats
  const itemStats = HYGIENE_ITEMS.map(item => {
    const fail = students.filter(s => !hygieneMap[s.student_id]?.[item.key]).length;
    return `${item.icon} ${fail > 0 ? `<span style="color:var(--danger);">ไม่ผ่าน ${fail}</span>` : '<span style="color:#065F46;">ผ่านหมด</span>'}`;
  }).join(' &nbsp;|&nbsp; ');
  document.getElementById('sum-items').innerHTML = itemStats;
}

// ─── SAVE ──────────────────────────────────────────────────────
async function saveHygiene() {
  const date      = document.getElementById('hygiene-date').value;
  const inspector = document.getElementById('hygiene-inspector').value.trim();
  if (!date || !inspector) return Toast.warning('กรุณากรอกข้อมูลให้ครบ');

  // บันทึกเฉพาะ filter ปัจจุบันหรือทั้งหมด
  const toSave = getFilteredStudents();
  if (!toSave.length) return Toast.warning('ไม่มีนักเรียนที่จะบันทึก');

  Loading.show(`กำลังบันทึก ${toSave.length} คน...`);
  try {
    const records = toSave.map(s => ({
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

    // อัปเดต saved badges
    const updated = await HygieneAPI.getByDate(date);
    existingData  = {};
    updated.forEach(r => { existingData[r.student_id] = r.hygiene_id; });
    renderList();
  } catch(e) {
    Toast.error('บันทึกไม่สำเร็จ: ' + e.message);
  } finally { Loading.hide(); }
}
