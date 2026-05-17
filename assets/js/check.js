// ============================================================
//  check.js  —  Daily Check Page Logic (v2)
//  แก้ไข: Zone Board, แยก pending/done, fix photo upload
// ============================================================

let studentsData  = [];
let attendanceMap = {};   // student_id → { status, note }
let zonesAll      = [];   // zones ทั้งหมด (active)
let todayCheckedZones = {}; // zone_id → { star_rating, check_id }

// ─── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const today = todayISO();
  document.getElementById('check-date').value = today;
  document.getElementById('today-sub').textContent = 'วันที่ ' + formatThaiDate(today);

  const savedName = localStorage.getItem('inspector_name');
  if (savedName) document.getElementById('inspector-name').value = savedName;

  initStarRating('star-container', 'star-value');
  initPhotoUpload('drop-problem', 'input-problem', 'preview-problem', 3);
  initPhotoUpload('drop-result',  'input-result',  'preview-result',  3);

  document.getElementById('zone-select').addEventListener('change', onZoneChange);
  document.getElementById('check-date').addEventListener('change', refreshBoard);

  await initPage();
});

async function initPage() {
  try {
    zonesAll = (await getCachedZones()).filter(z => String(z.active).toUpperCase() === 'TRUE');
    populateZoneSelect();
    await refreshBoard();
  } catch (e) {
    Toast.error('โหลดข้อมูลไม่สำเร็จ: ' + e.message);
  }
}

// ─── POPULATE ZONE DROPDOWN ────────────────────────────────────
function populateZoneSelect() {
  const sel = document.getElementById('zone-select');
  // ล้าง option เดิม (ยกเว้น default)
  while (sel.options.length > 1) sel.remove(1);
  zonesAll.forEach(z => {
    const opt = document.createElement('option');
    opt.value = z.zone_id;
    opt.textContent = `[${z.zone_id}] ${z.zone_name}`;
    sel.appendChild(opt);
  });
}

// ─── REFRESH BOARD ─────────────────────────────────────────────
// ดึงข้อมูล Dashboard ของวันที่เลือก แล้ว render board
async function refreshBoard() {
  const date = document.getElementById('check-date').value || todayISO();
  try {
    const dash = await DashboardAPI.get(date);
    // สร้าง map ของ zone ที่ตรวจแล้ว
    todayCheckedZones = {};
    (dash.zone_ranking || []).forEach(z => {
      todayCheckedZones[z.zone_id] = { avg: z.avg };
    });
    renderZoneBoard();
  } catch {
    // ถ้า API ยังไม่พร้อม ให้แสดง board แบบไม่มีข้อมูล
    todayCheckedZones = {};
    renderZoneBoard();
  }
}

// ─── RENDER ZONE STATUS BOARD ──────────────────────────────────
function renderZoneBoard() {
  const body    = document.getElementById('zone-board-body');
  const summary = document.getElementById('board-summary');

  if (!zonesAll.length) {
    body.innerHTML = `<div class="empty-state" style="padding:1rem 0;">
      <i class="fas fa-map-marker-alt"></i><p>ยังไม่มีพื้นที่เวร</p></div>`;
    return;
  }

  const pending = zonesAll.filter(z => !todayCheckedZones[z.zone_id]);
  const done    = zonesAll.filter(z =>  todayCheckedZones[z.zone_id]);

  summary.textContent = `ตรวจแล้ว ${done.length}/${zonesAll.length} เขต`;

  let html = '';

  // ── ยังไม่ตรวจ ──
  if (pending.length) {
    html += `<div class="board-section-label">
      <i class="fas fa-clock" style="color:#F59E0B;"></i> รอตรวจ (${pending.length} เขต)
    </div>
    <div class="zone-pill-grid">
      ${pending.map(z => `
        <div class="zone-pill pending" onclick="selectZone('${z.zone_id}')" title="คลิกเพื่อเลือกตรวจ">
          <i class="fas fa-map-marker-alt"></i>
          ${z.zone_name}
        </div>`).join('')}
    </div>`;
  } else {
    html += `<div style="color:#065F46; font-weight:600; font-size:0.9rem; margin-bottom:0.5rem;">
      <i class="fas fa-check-circle"></i> ตรวจครบทุกเขตแล้ว!
    </div>`;
  }

  // ── ตรวจแล้ว ──
  if (done.length) {
    if (pending.length) html += `<hr class="zone-divider">`;
    html += `<div class="board-section-label">
      <i class="fas fa-check-circle" style="color:#10B981;"></i> ตรวจแล้ว (${done.length} เขต)
    </div>
    <div class="zone-pill-grid">
      ${done.map(z => {
        const info = todayCheckedZones[z.zone_id];
        const stars = info ? `<span class="pill-star">⭐${info.avg}</span>` : '';
        return `<div class="zone-pill done" title="${z.zone_name} — ตรวจแล้ว">
          <i class="fas fa-check"></i> ${z.zone_name} ${stars}
        </div>`;
      }).join('')}
    </div>`;
  }

  body.innerHTML = html;
}

// ─── SELECT ZONE FROM BOARD ────────────────────────────────────
function selectZone(zoneId) {
  const sel = document.getElementById('zone-select');
  sel.value = zoneId;
  sel.dispatchEvent(new Event('change'));
  // Scroll ไปที่ form
  document.getElementById('student-list-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── ZONE CHANGE ───────────────────────────────────────────────
async function onZoneChange() {
  const zoneId = document.getElementById('zone-select').value;
  if (!zoneId) { renderEmptyStudentList(); return; }

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

// ─── RENDER STUDENT LIST (pending top / done bottom) ──────────
function renderStudentList() {
  const wrap = document.getElementById('student-list-wrap');

  if (!studentsData.length) {
    wrap.innerHTML = `<div class="empty-state">
      <i class="fas fa-user-slash"></i><p>ไม่มีนักเรียนในพื้นที่นี้</p></div>`;
    return;
  }

  wrap.innerHTML = `
    <div id="pending-section"></div>
    <div id="done-section"></div>`;

  rebuildStudentSections();
}

function rebuildStudentSections() {
  const pendingSec = document.getElementById('pending-section');
  const doneSec    = document.getElementById('done-section');
  if (!pendingSec || !doneSec) return;

  // แยก present (ยังไม่ยืนยัน = pending) / absent (ยืนยันแล้ว)
  // ตรรกะ: "ยังไม่ตรวจ" = ยังไม่กดปุ่มใด (status ยังเป็น default 'present' แต่ยังไม่ได้ confirm)
  // เราใช้ flag confirmed แทน
  const pending = studentsData.filter(s => !attendanceMap[s.student_id]?.confirmed);
  const done    = studentsData.filter(s =>  attendanceMap[s.student_id]?.confirmed);

  // ── Pending section ──
  if (pending.length) {
    pendingSec.innerHTML = `
      <div class="att-section-label pending">
        <i class="fas fa-hourglass-half"></i> รอตรวจ (${pending.length} คน)
        <button style="margin-left:auto; background:none; border:none; cursor:pointer;
          font-size:0.78rem; color:#92400E; font-weight:700; font-family:inherit;"
          onclick="markAllPresent()">✅ ทุกคนมาเวร</button>
      </div>
      <div class="att-list" id="pending-list"></div>`;
    const pList = document.getElementById('pending-list');
    pending.forEach(s => pList.appendChild(buildAttRow(s)));
  } else {
    pendingSec.innerHTML = '';
  }

  // ── Done section ──
  if (done.length) {
    doneSec.innerHTML = `
      <div class="att-section-label done">
        <i class="fas fa-check-double"></i> บันทึกแล้ว (${done.length} คน)
      </div>
      <div class="att-list" id="done-list"></div>`;
    const dList = document.getElementById('done-list');
    done.forEach(s => dList.appendChild(buildAttRow(s)));
  } else {
    doneSec.innerHTML = '';
  }
}

function buildAttRow(s) {
  const att      = attendanceMap[s.student_id];
  const initials = s.fullname.trim().split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase();
  const div      = document.createElement('div');
  div.className  = `att-item ${att.status}`;
  div.id         = `att-row-${s.student_id}`;
  div.innerHTML  = `
    <div class="att-avatar">${initials}</div>
    <div style="flex:1; min-width:0;">
      <div class="att-name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.fullname}</div>
      <div class="att-class">ป.${s.class}/${s.room}</div>
    </div>
    <div class="att-actions">
      <button class="att-btn present-btn ${att.status==='present'?'active-present':''}"
        onclick="setAtt('${s.student_id}','present')" title="มาทำเวร">✅</button>
      <button class="att-btn absent-btn ${att.status==='absent'?'active-absent':''}"
        onclick="setAtt('${s.student_id}','absent')" title="ไม่มาทำเวร">❌</button>
    </div>
    <input class="att-note" type="text" placeholder="หมายเหตุ"
      value="${att.note || ''}"
      onchange="setNote('${s.student_id}', this.value)"
      title="หมายเหตุ เช่น ลาป่วย">`;
  return div;
}

function renderEmptyStudentList() {
  document.getElementById('student-list-wrap').innerHTML = `
    <div class="empty-state"><i class="fas fa-users"></i><p>เลือกพื้นที่รับผิดชอบก่อน</p></div>`;
  document.getElementById('att-count').textContent = '0 คน';
}

// ─── SET ATTENDANCE + AUTO SORT ────────────────────────────────
function setAtt(studentId, status) {
  if (!attendanceMap[studentId]) return;
  attendanceMap[studentId].status    = status;
  attendanceMap[studentId].confirmed = true;   // ← mark ว่าตรวจแล้ว

  updateAttCount();
  rebuildStudentSections();   // re-render ย้าย row ไปส่วนที่ถูกต้อง
}

function setNote(studentId, note) {
  if (attendanceMap[studentId]) attendanceMap[studentId].note = note;
}

function markAllPresent() {
  studentsData
    .filter(s => !attendanceMap[s.student_id]?.confirmed)
    .forEach(s => {
      attendanceMap[s.student_id].status    = 'present';
      attendanceMap[s.student_id].confirmed = true;
    });
  updateAttCount();
  rebuildStudentSections();
}

function updateAttCount() {
  const confirmed = Object.values(attendanceMap).filter(a => a.confirmed).length;
  const present   = Object.values(attendanceMap).filter(a => a.confirmed && a.status === 'present').length;
  const total     = Object.keys(attendanceMap).length;
  document.getElementById('att-count').textContent =
    `มา ${present} | ขาด ${confirmed - present} | รอ ${total - confirmed}`;
}

// ─── PHOTO UPLOAD (แก้ bug: บีบอัด + ส่งทีละไฟล์) ────────────
// ปัญหาเดิม: base64 ขนาดใหญ่ส่งผ่าน Apps Script เกิน payload limit
// แก้: compress รูปก่อน (canvas) แล้วส่งทีละไฟล์พร้อม progress

async function compressImage(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width  = maxWidth;
        }
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve({ base64, filename: file.name.replace(/\.[^.]+$/, '.jpg') });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadFilesWithProgress(files, checkId, type) {
  if (!files.length) return { ok: [], fail: [] };

  const progressEl    = document.getElementById('upload-progress');
  const progressFill  = document.getElementById('upload-progress-fill');
  const progressLabel = document.getElementById('upload-progress-label');
  const resultList    = document.getElementById('upload-result-list');

  progressEl.classList.add('show');
  resultList.innerHTML = '';

  const ok = [], fail = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const pct  = Math.round(((i) / files.length) * 100);
    progressFill.style.width   = pct + '%';
    progressLabel.textContent  = `กำลังอัปโหลด ${i+1}/${files.length}: ${file.name}`;

    try {
      // 1. Compress
      const { base64, filename } = await compressImage(file);

      // 2. Upload ทีละไฟล์
      const res = await PhotoAPI.upload({
        base64,
        filename: `${checkId}_${type}_${i+1}_${filename}`,
        mimeType: 'image/jpeg',
        check_id: checkId,
        type,
      });

      ok.push({ name: file.name, url: res.drive_url });
      resultList.innerHTML += `
        <div class="upload-result-item ok">
          <i class="fas fa-check-circle"></i> ${file.name} — อัปโหลดสำเร็จ
        </div>`;
    } catch (e) {
      fail.push({ name: file.name, error: e.message });
      resultList.innerHTML += `
        <div class="upload-result-item fail">
          <i class="fas fa-times-circle"></i> ${file.name} — ล้มเหลว: ${e.message}
        </div>`;
    }
  }

  progressFill.style.width  = '100%';
  progressLabel.textContent = `เสร็จสิ้น: สำเร็จ ${ok.length} ล้มเหลว ${fail.length} ไฟล์`;
  return { ok, fail };
}

// ─── SUBMIT ────────────────────────────────────────────────────
async function submitCheck() {
  const date          = document.getElementById('check-date').value;
  const inspectorName = document.getElementById('inspector-name').value.trim();
  const zoneId        = document.getElementById('zone-select').value;
  const starRating    = parseInt(document.getElementById('star-value').value) || 0;
  const comment       = document.getElementById('check-comment').value.trim();

  if (!date)          return Toast.warning('กรุณาเลือกวันที่');
  if (!inspectorName) return Toast.warning('กรุณากรอกชื่อผู้ตรวจเวร');
  if (!zoneId)        return Toast.warning('กรุณาเลือกพื้นที่');
  if (starRating < 1) return Toast.warning('กรุณาให้คะแนนดาวความสะอาด');

  const unconfirmed = Object.values(attendanceMap).filter(a => !a.confirmed).length;
  if (unconfirmed > 0) {
    if (!confirm(`ยังมี ${unconfirmed} คนที่ยังไม่ได้บันทึกสถานะ\nต้องการบันทึกโดยถือว่า "มาเวร" ทั้งหมดหรือไม่?`)) return;
    // auto mark ที่เหลือว่า present
    Object.keys(attendanceMap).forEach(sid => {
      if (!attendanceMap[sid].confirmed) {
        attendanceMap[sid].confirmed = true;
        attendanceMap[sid].status    = 'present';
      }
    });
  }

  localStorage.setItem('inspector_name', inspectorName);
  Loading.show('กำลังบันทึกข้อมูล...');
  document.getElementById('submit-btn').disabled = true;

  try {
    // 1. บันทึก Check + Attendance
    const attendance = Object.entries(attendanceMap).map(([student_id, a]) => ({
      student_id, status: a.status, note: a.note || '',
    }));

    const result = await CheckAPI.save({
      date, zone_id: zoneId, inspector_name: inspectorName,
      star_rating: starRating, comment, attendance,
    });
    const checkId = result.check_id;
    Loading.hide();

    // 2. Upload รูปทีละไฟล์พร้อม progress
    const dropProblem  = document.getElementById('drop-problem');
    const dropResult   = document.getElementById('drop-result');
    const problemFiles = dropProblem._getFiles ? dropProblem._getFiles() : [];
    const resultFiles  = dropResult._getFiles  ? dropResult._getFiles()  : [];
    const allFiles     = [...problemFiles, ...resultFiles];

    if (allFiles.length) {
      const pRes = await uploadFilesWithProgress(problemFiles, checkId, 'problem');
      const rRes = await uploadFilesWithProgress(resultFiles,  checkId, 'result');
      const totalFail = pRes.fail.length + rRes.fail.length;
      if (totalFail > 0) {
        Toast.warning(`บันทึกสำเร็จ แต่รูป ${totalFail} ไฟล์อัปโหลดไม่สำเร็จ`);
      } else {
        Toast.success(`✅ บันทึกสำเร็จ! อัปโหลดรูป ${allFiles.length} ไฟล์เรียบร้อย`);
      }
    } else {
      Toast.success('✅ บันทึกการตรวจเวรสำเร็จ!');
    }

    Cache.clear('dashboard');

    // 3. Refresh board + reset form
    await refreshBoard();
    setTimeout(resetForm, 1200);

  } catch (e) {
    Toast.error('บันทึกไม่สำเร็จ: ' + e.message);
    Loading.hide();
  } finally {
    document.getElementById('submit-btn').disabled = false;
  }
}

function resetForm() {
  document.getElementById('zone-select').value   = '';
  document.getElementById('check-comment').value = '';
  document.getElementById('star-value').value    = '0';
  document.querySelectorAll('#star-container .star').forEach(s => s.classList.remove('active'));
  const dp = document.getElementById('drop-problem');
  const dr = document.getElementById('drop-result');
  if (dp._clear) dp._clear();
  if (dr._clear) dr._clear();
  document.getElementById('upload-progress').classList.remove('show');
  document.getElementById('upload-result-list').innerHTML = '';
  studentsData  = [];
  attendanceMap = {};
  renderEmptyStudentList();
}
