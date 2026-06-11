// ============================================================
//  ระบบตรวจเวรรับผิดชอบประจำวัน - Google Apps Script API
//  Version: 1.0.0
//  Deploy as: Web App → Execute as Me → Anyone can access
// ============================================================

// ── บังคับ OAuth Scopes (จำเป็นต้องมี ไม่งั้น DriveApp denied) ──
// @OnlyCurrentDoc ห้ามใช้ — ต้องการ Drive + Sheets เต็ม scope
/**
 * @fileoverview
 * Requires:
 *   https://www.googleapis.com/auth/drive
 *   https://www.googleapis.com/auth/spreadsheets
 */

// ─── CONFIG ──────────────────────────────────────────────────
const CONFIG = {
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',   // ← เปลี่ยนตรงนี้
  DRIVE_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID_HERE', // ← เปลี่ยนตรงนี้
  SHEETS: {
    ZONES:          'Zones',
    STUDENTS:       'Students',
    DAILY_CHECK:    'DailyCheck',
    ATTENDANCE:     'Attendance',
    PHOTOS:         'Photos',
    BEHAVIOR_SCORE: 'BehaviorScore',
    SCORE_CATEGORY: 'ScoreCategory',
    HYGIENE_CHECK:  'HygieneCheck',
  },
};

// ─── RESPONSE HELPERS ────────────────────────────────────────
// หมายเหตุ: Apps Script ContentService ไม่รองรับ setHeader จริง
// CORS จัดการโดยฝั่ง Google อัตโนมัติเมื่อ Deploy เป็น "Anyone"
// ฝั่ง client ต้องใช้ redirect:'follow' เท่านั้น

function jsonResponse(data, statusCode = 200) {
  const payload = { status: statusCode, data: data };
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(message, statusCode = 400) {
  const payload = { status: statusCode, error: message };
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── ROUTER ──────────────────────────────────────────────────
function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) ? e.parameter.action : '';

    // ทดสอบ ping
    if (action === '' || action === 'ping') {
      return jsonResponse({ message: 'API พร้อมใช้งาน', version: '1.0', time: new Date().toISOString() });
    }

    switch (action) {
      case 'zones':        return handleGetZones();
      case 'students':     return handleGetStudents(e.parameter);
      case 'dashboard':    return handleGetDashboard(e.parameter);
      case 'report':       return handleGetReport(e.parameter);
      case 'photos':          return handleGetPhotos(e.parameter);
      case 'dailyAttendance':    return handleGetDailyAttendance(e.parameter);
      case 'behaviorCategories': return handleGetCategories();
      case 'behaviorScores':     return handleGetBehaviorScores(e.parameter);
      case 'behaviorDashboard':  return handleGetBehaviorDashboard(e.parameter);
      case 'behaviorReport':     return handleGetBehaviorReport(e.parameter);
      case 'hygieneCheck':       return handleGetHygieneChecks(e.parameter);
      case 'hygieneReport':      return handleGetHygieneReport(e.parameter);
      default:                   return errorResponse('Unknown action: ' + action, 404);
    }
  } catch (err) {
    Logger.log('doGet Error: ' + err.toString());
    return errorResponse('Server Error: ' + err.toString(), 500);
  }
}

function doPost(e) {
  try {
    const raw    = e.postData ? e.postData.contents : '{}';
    const sizeKB = Math.round((raw || '').length / 1024);
    Logger.log('doPost received: ' + sizeKB + 'KB');

    const body   = JSON.parse(raw || '{}');
    const action = body.action || '';
    Logger.log('action=' + action + (action === 'uploadPhoto' ? ' check_id=' + body.check_id : ''));

    switch (action) {
      case 'saveZone':        return handleSaveZone(body);
      case 'deleteZone':      return handleDeleteZone(body);
      case 'saveStudent':     return handleSaveStudent(body);
      case 'deleteStudent':   return handleDeleteStudent(body);
      case 'dailyCheck':      return handleDailyCheck(body);
      case 'uploadPhoto':          return handleUploadPhoto(body);
      case 'saveCategory':         return handleSaveCategory(body);
      case 'deleteCategory':       return handleDeleteCategory(body);
      case 'saveBehaviorScore':    return handleSaveBehaviorScore(body);
      case 'deleteBehaviorScore':  return handleDeleteBehaviorScore(body);
      case 'saveHygieneCheck':     return handleSaveHygieneCheck(body);
      case 'deleteHygieneCheck':   return handleDeleteHygieneCheck(body);
      default:                     return errorResponse('Unknown action: ' + action, 404);
    }
  } catch (err) {
    Logger.log('doPost Error: ' + err.toString());
    return errorResponse('Server Error: ' + err.toString(), 500);
  }
}

// ─── UTILITY HELPERS ─────────────────────────────────────────
function getSheet(name) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = createSheet(ss, name);
  return sheet;
}

function createSheet(ss, name) {
  const sheet = ss.insertSheet(name);
  const headers = {
    Zones:      ['zone_id','zone_name','active'],
    Students:   ['student_id','fullname','class','room','zone_id','active'],
    DailyCheck: ['check_id','date','zone_id','inspector_name','star_rating','comment','created_at'],
    Attendance:     ['attendance_id','check_id','student_id','status','note'],
    Photos:         ['photo_id','check_id','type','drive_url','uploaded_at'],
    BehaviorScore:  ['score_id','student_id','date','type','category_id','category_name','points','note','teacher','created_at'],
    HygieneCheck:   ['hygiene_id','student_id','date','month','year','haircut','spoon','glass','toothbrush','body_clean','note','inspector','created_at'],
    ScoreCategory:  ['cat_id','name','default_points','type','icon','active'],
  };
  if (headers[name]) {
    sheet.getRange(1, 1, 1, headers[name].length).setValues([headers[name]]);
  }
  return sheet;
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i]]))
  );
}

function generateId(prefix) {
  return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase();
}

function formatDate(d) {
  if (!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d);
  return Utilities.formatDate(dt, 'Asia/Bangkok', 'yyyy-MM-dd');
}

// ─── ZONE HANDLERS ───────────────────────────────────────────
function handleGetZones() {
  const rows = sheetToObjects(getSheet(CONFIG.SHEETS.ZONES));
  return jsonResponse(rows);
}

function handleSaveZone(body) {
  const sheet = getSheet(CONFIG.SHEETS.ZONES);
  const rows  = sheet.getDataRange().getValues();
  const headers = rows[0];

  if (body.zone_id) {
    // UPDATE
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === body.zone_id) {
        const colMap = Object.fromEntries(headers.map((h, idx) => [h, idx]));
        sheet.getRange(i+1, colMap.zone_name+1).setValue(body.zone_name);
        sheet.getRange(i+1, colMap.active+1).setValue(body.active ? 'TRUE' : 'FALSE');
        return jsonResponse({ zone_id: body.zone_id, updated: true });
      }
    }
    return errorResponse('Zone not found', 404);
  } else {
    // INSERT
    const existingIds = rows.slice(1).map(r => r[0]);
    const num = existingIds.length + 1;
    const newId = 'Z' + String(num).padStart(3,'0');
    sheet.appendRow([newId, body.zone_name, 'TRUE']);
    return jsonResponse({ zone_id: newId, created: true });
  }
}

function handleDeleteZone(body) {
  const sheet = getSheet(CONFIG.SHEETS.ZONES);
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.zone_id) {
      sheet.getRange(i+1, 3).setValue('FALSE'); // soft delete
      return jsonResponse({ zone_id: body.zone_id, deleted: true });
    }
  }
  return errorResponse('Zone not found', 404);
}

// ─── STUDENT HANDLERS ────────────────────────────────────────
function handleGetStudents(params) {
  const rows = sheetToObjects(getSheet(CONFIG.SHEETS.STUDENTS));
  const filtered = params.zone_id
    ? rows.filter(r => r.zone_id === params.zone_id && String(r.active).toUpperCase() === 'TRUE')
    : rows;
  return jsonResponse(filtered);
}

function handleSaveStudent(body) {
  const sheet = getSheet(CONFIG.SHEETS.STUDENTS);
  const rows  = sheet.getDataRange().getValues();
  const headers = rows[0];

  if (body.student_id) {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === body.student_id) {
        const c = Object.fromEntries(headers.map((h, idx) => [h, idx]));
        sheet.getRange(i+1, c.fullname+1).setValue(body.fullname);
        sheet.getRange(i+1, c.class+1).setValue(body.class);
        sheet.getRange(i+1, c.room+1).setValue(body.room);
        sheet.getRange(i+1, c.zone_id+1).setValue(body.zone_id);
        sheet.getRange(i+1, c.active+1).setValue(body.active ? 'TRUE' : 'FALSE');
        return jsonResponse({ student_id: body.student_id, updated: true });
      }
    }
    return errorResponse('Student not found', 404);
  } else {
    const existingIds = rows.slice(1).map(r => r[0]);
    const num = existingIds.length + 1;
    const newId = 'S' + String(num).padStart(4,'0');
    sheet.appendRow([newId, body.fullname, body.class, body.room, body.zone_id, 'TRUE']);
    return jsonResponse({ student_id: newId, created: true });
  }
}

function handleDeleteStudent(body) {
  const sheet = getSheet(CONFIG.SHEETS.STUDENTS);
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.student_id) {
      sheet.getRange(i+1, 6).setValue('FALSE');
      return jsonResponse({ student_id: body.student_id, deleted: true });
    }
  }
  return errorResponse('Student not found', 404);
}

// ─── DAILY CHECK HANDLER ──────────────────────────────────────
function handleDailyCheck(body) {
  const checkId  = generateId('CHK');
  const now      = new Date();
  const dateStr  = formatDate(body.date || now);

  // 1. Save DailyCheck row
  const checkSheet = getSheet(CONFIG.SHEETS.DAILY_CHECK);
  checkSheet.appendRow([
    checkId,
    dateStr,
    body.zone_id,
    body.inspector_name || 'ไม่ระบุ',
    body.star_rating,
    body.comment || '',
    Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss'),
  ]);

  // 2. Save Attendance rows
  const attSheet = getSheet(CONFIG.SHEETS.ATTENDANCE);
  (body.attendance || []).forEach((att, idx) => {
    const attId = 'ATT' + Date.now().toString(36) + idx;
    attSheet.appendRow([attId, checkId, att.student_id, att.status, att.note || '']);
  });

  return jsonResponse({ check_id: checkId, saved: true });
}

// ─── PHOTO UPLOAD HANDLER (v3: full debug + sheet fix) ─────────
function handleUploadPhoto(body) {
  try {
    // ── 1. Validate ──
    Logger.log('uploadPhoto called, check_id=' + body.check_id + ' type=' + body.type + ' hasBase64=' + !!body.base64);
    if (!body.base64)   throw new Error('ไม่มีข้อมูล base64');
    if (!body.check_id || body.check_id === 'undefined') throw new Error('check_id ไม่ถูกต้อง: ' + body.check_id);

    // ── 2. Strip data URI prefix ──
    var rawBase64 = String(body.base64);
    var commaIdx  = rawBase64.indexOf(',');
    if (commaIdx !== -1) rawBase64 = rawBase64.substring(commaIdx + 1);
    rawBase64 = rawBase64.replace(/[\s\r\n]/g, '');
    if (rawBase64.length < 20) throw new Error('base64 ว่างเปล่าหรือสั้นเกินไป: ' + rawBase64.length + ' chars');
    Logger.log('base64 length after strip: ' + rawBase64.length);

    // ── 3. Decode + Blob ──
    var decoded  = Utilities.base64Decode(rawBase64);
    var mimeType = body.mimeType || 'image/jpeg';
    var filename = body.filename || ('photo_' + Date.now() + '.jpg');
    var blob     = Utilities.newBlob(decoded, mimeType, filename);
    Logger.log('blob size: ' + blob.getBytes().length + ' bytes');

    // ── 4. Save to Drive ──
    var file;
    try {
      // ลองบันทึกใน Folder ที่กำหนดก่อน
      if (CONFIG.DRIVE_FOLDER_ID && !CONFIG.DRIVE_FOLDER_ID.includes('YOUR_')) {
        var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
        file = folder.createFile(blob);
        Logger.log('Saved to specified folder');
      } else {
        throw new Error('No folder ID configured');
      }
    } catch(folderErr) {
      // Fallback: บันทึกใน MyDrive root
      Logger.log('Folder failed (' + folderErr.message + '), falling back to MyDrive root');
      file = DriveApp.createFile(blob);
    }
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var fileId   = file.getId();
    var driveUrl = 'https://drive.google.com/uc?export=view&id=' + fileId;
    Logger.log('Drive OK: fileId=' + fileId + ' name=' + file.getName());

    // ── 5. Save to Photos sheet (เขียนตรงๆ ไม่ผ่าน getSheet เพื่อหลีกเลี่ยง cache) ──
    var ss         = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var photoSheet = ss.getSheetByName(CONFIG.SHEETS.PHOTOS);
    if (!photoSheet) {
      // สร้าง sheet ใหม่พร้อม header ถ้ายังไม่มี
      photoSheet = ss.insertSheet(CONFIG.SHEETS.PHOTOS);
      photoSheet.getRange(1, 1, 1, 5).setValues([['photo_id','check_id','type','drive_url','uploaded_at']]);
      Logger.log('Photos sheet created with headers');
    }
    // ตรวจ header แถวที่ 1 ว่าถูกต้อง
    var firstRow = photoSheet.getRange(1, 1, 1, 5).getValues()[0];
    Logger.log('Photos sheet headers: ' + JSON.stringify(firstRow));

    var photoId   = generateId('PHO');
    var timestamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
    var newRow    = [photoId, body.check_id, body.type || 'problem', driveUrl, timestamp];
    photoSheet.appendRow(newRow);
    Logger.log('Sheet write OK: ' + JSON.stringify(newRow));

    // ── 6. Flush ──
    SpreadsheetApp.flush();

    return jsonResponse({ photo_id: photoId, file_id: fileId, drive_url: driveUrl, saved: true });

  } catch (err) {
    Logger.log('Upload ERROR: ' + err.toString() + ' | stack: ' + (err.stack || ''));
    return errorResponse('Upload failed: ' + err.toString(), 500);
  }
}

function handleGetPhotos(params) {
  const rows = sheetToObjects(getSheet(CONFIG.SHEETS.PHOTOS));
  const filtered = params.check_id
    ? rows.filter(r => r.check_id === params.check_id)
    : rows;
  return jsonResponse(filtered);
}

// ─── DASHBOARD HANDLER ───────────────────────────────────────
function handleGetDashboard(params) {
  // ใช้ Bangkok timezone เป็น default date
  const todayBkk    = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  const targetDate  = params.date || todayBkk;

  const checks   = sheetToObjects(getSheet(CONFIG.SHEETS.DAILY_CHECK));
  const att      = sheetToObjects(getSheet(CONFIG.SHEETS.ATTENDANCE));
  const zones    = sheetToObjects(getSheet(CONFIG.SHEETS.ZONES));

  // Today's checks
  const todayChecks = checks.filter(c => formatDate(c.date) === targetDate);

  // Avg star today
  const avgStar = todayChecks.length > 0
    ? todayChecks.reduce((s, c) => s + Number(c.star_rating), 0) / todayChecks.length
    : 0;

  // Zone ranking today
  const zoneStars = {};
  todayChecks.forEach(c => {
    if (!zoneStars[c.zone_id]) zoneStars[c.zone_id] = [];
    zoneStars[c.zone_id].push(Number(c.star_rating));
  });
  const zoneRanking = Object.entries(zoneStars).map(([zid, stars]) => {
    const zone = zones.find(z => z.zone_id === zid) || {};
    return { zone_id: zid, zone_name: zone.zone_name || zid, avg: stars.reduce((a,b)=>a+b,0)/stars.length };
  }).sort((a, b) => b.avg - a.avg);

  // Attendance summary today
  const todayCheckIds = new Set(todayChecks.map(c => c.check_id));
  const todayAtt      = att.filter(a => todayCheckIds.has(a.check_id));
  const presentCount  = todayAtt.filter(a => a.status === 'present').length;
  const absentCount   = todayAtt.filter(a => a.status === 'absent').length;

  // 7-day trend
  const trend7 = buildTrend(checks, 7);
  const trend30 = buildTrend(checks, 30);

  // Student ranking (all time)
  const studentRanking = buildStudentRanking(att);

  return jsonResponse({
    date:         targetDate,
    avg_star:     Math.round(avgStar * 10) / 10,
    total_checks: todayChecks.length,
    present:      presentCount,
    absent:       absentCount,
    zone_ranking: zoneRanking,
    trend_7:      trend7,
    trend_30:     trend30,
    student_ranking: studentRanking,
  });
}

function buildTrend(checks, days) {
  const result  = [];
  // ใช้เวลาปัจจุบันใน Bangkok timezone เพื่อหลีกเลี่ยง UTC shift
  const nowBkk  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(nowBkk);
    d.setDate(d.getDate() - i);
    const dateStr   = Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd');
    const dayChecks = checks.filter(c => formatDate(c.date) === dateStr);
    const avg = dayChecks.length > 0
      ? dayChecks.reduce((s,c) => s + Number(c.star_rating), 0) / dayChecks.length
      : null;
    result.push({ date: dateStr, avg_star: avg !== null ? Math.round(avg * 10)/10 : null, count: dayChecks.length });
  }
  return result;
}

function buildStudentRanking(att) {
  const map = {};
  att.forEach(a => {
    if (!map[a.student_id]) map[a.student_id] = { present: 0, total: 0 };
    map[a.student_id].total++;
    if (a.status === 'present') map[a.student_id].present++;
  });
  return Object.entries(map).map(([sid, v]) => ({
    student_id: sid,
    present: v.present,
    total: v.total,
    percent: Math.round((v.present / v.total) * 100),
  })).sort((a,b) => b.percent - a.percent).slice(0, 20);
}

// ─── REPORT HANDLER ──────────────────────────────────────────
function handleGetReport(params) {
  const month   = parseInt(params.month);  // 1-12
  const year    = parseInt(params.year);
  const zoneId  = params.zone_id || 'all';

  const checks   = sheetToObjects(getSheet(CONFIG.SHEETS.DAILY_CHECK));
  const att      = sheetToObjects(getSheet(CONFIG.SHEETS.ATTENDANCE));
  const students = sheetToObjects(getSheet(CONFIG.SHEETS.STUDENTS));
  const zones    = sheetToObjects(getSheet(CONFIG.SHEETS.ZONES));

  // Filter by month/year/zone
  const filtered = checks.filter(c => {
    const d = new Date(c.date);
    const matchMonth = d.getMonth() + 1 === month && d.getFullYear() === year;
    const matchZone  = zoneId === 'all' || c.zone_id === zoneId;
    return matchMonth && matchZone;
  });

  // Daily summary
  const dailySummary = {};
  filtered.forEach(c => {
    const dateStr = formatDate(c.date);
    if (!dailySummary[dateStr]) dailySummary[dateStr] = { stars: [], inspectors: new Set(), comments: [] };
    dailySummary[dateStr].stars.push(Number(c.star_rating));
    dailySummary[dateStr].inspectors.add(c.inspector_name);
    if (c.comment) dailySummary[dateStr].comments.push(c.comment);
  });
  const dailyRows = Object.entries(dailySummary).sort(([a],[b])=>a.localeCompare(b)).map(([date, v]) => ({
    date,
    avg_star: Math.round(v.stars.reduce((a,b)=>a+b,0)/v.stars.length * 10)/10,
    inspectors: [...v.inspectors].join(', '),
    comment: v.comments.join('; '),
  }));

  // Student attendance
  const checkIds = new Set(filtered.map(c => c.check_id));
  const relAtt   = att.filter(a => checkIds.has(a.check_id));
  const studentMap = {};
  relAtt.forEach(a => {
    if (!studentMap[a.student_id]) studentMap[a.student_id] = { present: 0, absent: 0 };
    if (a.status === 'present') studentMap[a.student_id].present++;
    else studentMap[a.student_id].absent++;
  });
  const studentRows = Object.entries(studentMap).map(([sid, v]) => {
    const stu  = students.find(s => s.student_id === sid) || {};
    const total = v.present + v.absent;
    return {
      student_id: sid,
      fullname: stu.fullname || sid,
      class: stu.class || '',
      room: stu.room || '',
      present: v.present,
      absent: v.absent,
      total,
      percent: total > 0 ? Math.round((v.present/total)*100) : 0,
    };
  }).sort((a,b) => b.percent - a.percent);

  // Overall summary
  const allStars  = filtered.map(c => Number(c.star_rating));
  const overallAvg = allStars.length > 0
    ? Math.round(allStars.reduce((a,b)=>a+b,0)/allStars.length * 10)/10 : 0;

  const zoneName  = zoneId === 'all' ? 'ทุกเขต' : (zones.find(z => z.zone_id === zoneId) || {}).zone_name || zoneId;

  return jsonResponse({
    month, year, zone_id: zoneId, zone_name: zoneName,
    total_checks: filtered.length,
    overall_avg_star: overallAvg,
    daily_summary: dailyRows,
    student_rows: studentRows,
  });
}


// ─── DAILY ATTENDANCE HANDLER ────────────────────────────────
// คืนค่า attendance ของทุกนักเรียนในวันที่กำหนด
function handleGetDailyAttendance(params) {
  var targetDate = params.date || formatDate(new Date());
  var zoneId     = params.zone_id || 'all';

  var checks   = sheetToObjects(getSheet(CONFIG.SHEETS.DAILY_CHECK));
  var att      = sheetToObjects(getSheet(CONFIG.SHEETS.ATTENDANCE));
  var students = sheetToObjects(getSheet(CONFIG.SHEETS.STUDENTS));
  var zones    = sheetToObjects(getSheet(CONFIG.SHEETS.ZONES));

  // กรอง checks ของวันนั้น
  var dayChecks = checks.filter(function(c) {
    var matchDate = formatDate(c.date) === targetDate;
    var matchZone = zoneId === 'all' || c.zone_id === zoneId;
    return matchDate && matchZone;
  });

  if (!dayChecks.length) {
    return jsonResponse({ date: targetDate, zone_id: zoneId, checks: [], attendance: [] });
  }

  var checkIds = dayChecks.map(function(c) { return c.check_id; });

  // กรอง attendance ของ check_id วันนั้น
  var dayAtt = att.filter(function(a) { return checkIds.indexOf(a.check_id) !== -1; });

  // สร้าง attendance map: student_id → {status, note, check_id}
  var attMap = {};
  dayAtt.forEach(function(a) { attMap[a.student_id] = a; });

  // รวมข้อมูลนักเรียน + สถานะ
  var result = students
    .filter(function(s) {
      var active = String(s.active).toUpperCase() === 'TRUE';
      var inZone = zoneId === 'all' || s.zone_id === zoneId;
      return active && inZone;
    })
    .map(function(s) {
      var a = attMap[s.student_id] || {};
      return {
        student_id: s.student_id,
        fullname:   s.fullname,
        class:      s.class,
        room:       s.room,
        zone_id:    s.zone_id,
        status:     a.status || 'no_data',
        note:       a.note   || '',
      };
    });

  // รวม check info
  var checkInfo = dayChecks.map(function(c) {
    var zone = zones.find(function(z) { return z.zone_id === c.zone_id; }) || {};
    return {
      check_id:       c.check_id,
      zone_id:        c.zone_id,
      zone_name:      zone.zone_name || c.zone_id,
      inspector_name: c.inspector_name,
      star_rating:    c.star_rating,
      comment:        c.comment,
    };
  });

  return jsonResponse({
    date:       targetDate,
    zone_id:    zoneId,
    checks:     checkInfo,
    attendance: result,
  });
}

// ─── INIT SHEET (run once manually) ──────────────────────────
function initSheets() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  Object.keys(CONFIG.SHEETS).forEach(key => {
    const name = CONFIG.SHEETS[key];
    if (!ss.getSheetByName(name)) createSheet(ss, name);
  });
  Logger.log('Sheets initialized!');
}

// ─── FIX PHOTOS SHEET (รันครั้งเดียวถ้า Photos sheet มีปัญหา) ─
// วิธีใช้: Apps Script Editor → เลือก fixPhotosSheet → กด Run
function fixPhotosSheet() {
  var ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEETS.PHOTOS);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.PHOTOS);
    Logger.log('สร้าง Photos sheet ใหม่');
  }

  var lastRow  = sheet.getLastRow();
  var lastCol  = sheet.getLastColumn();
  var headerOK = false;

  if (lastRow >= 1 && lastCol >= 5) {
    var header = sheet.getRange(1, 1, 1, 5).getValues()[0];
    headerOK   = (header[0] === 'photo_id' && header[1] === 'check_id');
    Logger.log('Header ปัจจุบัน: ' + JSON.stringify(header));
  }

  if (!headerOK) {
    if (lastRow === 0) {
      sheet.appendRow(['photo_id','check_id','type','drive_url','uploaded_at']);
    } else {
      sheet.getRange(1,1,1,5).setValues([['photo_id','check_id','type','drive_url','uploaded_at']]);
    }
    Logger.log('ตั้ง header ใหม่เรียบร้อย');
  } else {
    Logger.log('Header ถูกต้อง — มีข้อมูล ' + (lastRow - 1) + ' รูป');
  }
}

// ─── TEST SHEET WRITE (ทดสอบเขียน Sheet อย่างเดียว) ──────────
function testSheetWrite() {
  Logger.log('=== testSheetWrite START ===');
  Logger.log('SPREADSHEET_ID = ' + CONFIG.SPREADSHEET_ID);

  // ตรวจว่า SPREADSHEET_ID ถูกตั้งค่าแล้ว
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID.includes('YOUR_')) {
    Logger.log('ERROR: SPREADSHEET_ID ยังไม่ได้ตั้งค่า!');
    return;
  }

  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    Logger.log('Spreadsheet name: ' + ss.getName());

    var sheet = ss.getSheetByName(CONFIG.SHEETS.PHOTOS);
    if (!sheet) {
      Logger.log('Photos sheet ไม่พบ — กำลังสร้างใหม่...');
      sheet = ss.insertSheet(CONFIG.SHEETS.PHOTOS);
      sheet.appendRow(['photo_id','check_id','type','drive_url','uploaded_at']);
      Logger.log('สร้าง Photos sheet สำเร็จ');
    } else {
      Logger.log('Photos sheet พบแล้ว — แถวปัจจุบัน: ' + sheet.getLastRow());
    }

    // ทดสอบเขียนแถวตรงๆ
    var testRow = ['PHO_TEST', 'CHK_TEST', 'problem', 'https://test.url', new Date().toString()];
    sheet.appendRow(testRow);
    SpreadsheetApp.flush();
    Logger.log('appendRow สำเร็จ! แถวล่าสุด: ' + sheet.getLastRow());
    Logger.log('=== testSheetWrite PASS ===');
  } catch(e) {
    Logger.log('ERROR: ' + e.toString());
  }
}

// ─── TEST UPLOAD (ทดสอบ Drive + Sheet พร้อมกัน) ───────────────
function testUpload() {
  Logger.log('=== testUpload START ===');
  Logger.log('SPREADSHEET_ID = ' + CONFIG.SPREADSHEET_ID);
  Logger.log('DRIVE_FOLDER_ID = ' + CONFIG.DRIVE_FOLDER_ID);

  if (CONFIG.SPREADSHEET_ID.includes('YOUR_') || CONFIG.DRIVE_FOLDER_ID.includes('YOUR_')) {
    Logger.log('ERROR: ยังไม่ได้ตั้งค่า ID — หยุด');
    return;
  }

  // PNG 8x8 พร้อม data URI prefix
  var dummy = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVQoU2P8z8BQz0AEYBxVQF8ABQABAQB/lAEAAAAAAElFTkSuQmCC';
  var res   = handleUploadPhoto({
    base64:   dummy,
    check_id: 'TEST_' + Date.now(),
    type:     'problem',
    filename: 'test_8x8.png',
    mimeType: 'image/png',
  });
  Logger.log('testUpload result: ' + res.getContent());
}

// ─── TEST DRIVE WRITE ────────────────────────────────────────
function testDriveWrite() {
  Logger.log('=== testDriveWrite START ===');
  var blob = Utilities.newBlob('test', 'text/plain', 'test_write.txt');

  // ทดสอบ 1: เขียนใน Folder ที่กำหนด
  Logger.log('--- Test 1: Specified Folder ---');
  try {
    var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    Logger.log('Folder name: ' + folder.getName());
    var f1 = folder.createFile(blob);
    Logger.log('✅ Folder createFile OK: ' + f1.getId());
    f1.setTrashed(true);
  } catch(e) {
    Logger.log('❌ Folder createFile FAIL: ' + e.toString());
  }

  // ทดสอบ 2: เขียนใน MyDrive root (fallback)
  Logger.log('--- Test 2: MyDrive Root ---');
  try {
    var f2 = DriveApp.createFile(blob);
    Logger.log('✅ MyDrive createFile OK: ' + f2.getId());
    f2.setTrashed(true);
  } catch(e) {
    Logger.log('❌ MyDrive createFile FAIL: ' + e.toString());
  }

  Logger.log('=== testDriveWrite END ===');
}

// ============================================================
//  ระบบบันทึกคะแนนความประพฤติ — Behavior Score System
//  เพิ่มเติมจากระบบตรวจเวร ใช้ฐานข้อมูลนักเรียนร่วมกัน
// ============================================================

// ─── BEHAVIOR: doGet / doPost routes ─────────────────────────
// (เพิ่มใน switch ใน doGet/doPost เดิมไม่ได้ เลยเช็คที่นี่)
// วิธีใช้: เพิ่ม case ใน doGet และ doPost เดิม ดังนี้
/*
  doGet:
    case 'behaviorCategories':  return handleGetCategories();
    case 'behaviorScores':      return handleGetBehaviorScores(e.parameter);
    case 'behaviorDashboard':   return handleGetBehaviorDashboard(e.parameter);
    case 'behaviorReport':      return handleGetBehaviorReport(e.parameter);
  doPost:
    case 'saveCategory':        return handleSaveCategory(body);
    case 'deleteCategory':      return handleDeleteCategory(body);
    case 'saveBehaviorScore':   return handleSaveBehaviorScore(body);
    case 'deleteBehaviorScore': return handleDeleteBehaviorScore(body);
*/

// ─── SCORE CATEGORY HANDLERS ─────────────────────────────────
function handleGetCategories() {
  var rows = sheetToObjects(getSheet(CONFIG.SHEETS.SCORE_CATEGORY));
  return jsonResponse(rows);
}

function handleSaveCategory(body) {
  var sheet   = getSheet(CONFIG.SHEETS.SCORE_CATEGORY);
  var rows    = sheet.getDataRange().getValues();
  var headers = rows[0];

  if (body.cat_id) {
    // UPDATE
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === body.cat_id) {
        var c = {};
        headers.forEach(function(h, idx) { c[h] = idx; });
        sheet.getRange(i+1, c.name+1).setValue(body.name);
        sheet.getRange(i+1, c.default_points+1).setValue(body.default_points);
        sheet.getRange(i+1, c.type+1).setValue(body.type);
        sheet.getRange(i+1, c.icon+1).setValue(body.icon || '📝');
        sheet.getRange(i+1, c.active+1).setValue(body.active !== false ? 'TRUE' : 'FALSE');
        return jsonResponse({ cat_id: body.cat_id, updated: true });
      }
    }
    return errorResponse('Category not found', 404);
  } else {
    // INSERT
    var num   = rows.length;
    var newId = 'CAT' + String(num).padStart(3,'0');
    sheet.appendRow([
      newId, body.name,
      Number(body.default_points),
      body.type || 'add',
      body.icon || '📝',
      'TRUE'
    ]);
    return jsonResponse({ cat_id: newId, created: true });
  }
}

function handleDeleteCategory(body) {
  var sheet = getSheet(CONFIG.SHEETS.SCORE_CATEGORY);
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.cat_id) {
      sheet.getRange(i+1, 6).setValue('FALSE');
      return jsonResponse({ cat_id: body.cat_id, deleted: true });
    }
  }
  return errorResponse('Not found', 404);
}

function initDefaultCategories() {
  var sheet = getSheet(CONFIG.SHEETS.SCORE_CATEGORY);
  if (sheet.getLastRow() > 1) {
    Logger.log('Categories already exist');
    return;
  }
  var defaults = [
    ['CAT001','ช่วยเหลืองานโรงเรียน', 5,'add','🌟','TRUE'],
    ['CAT002','ทำความดีช่วยเหลือผู้อื่น', 3,'add','💛','TRUE'],
    ['CAT003','ส่งงานตรงเวลาครบถ้วน', 2,'add','📚','TRUE'],
    ['CAT004','รักษาความสะอาด', 2,'add','🧹','TRUE'],
    ['CAT005','ได้รับรางวัล/เกียรติยศ',10,'add','🏆','TRUE'],
    ['CAT006','ทะเลาะวิวาท',         -10,'sub','⚠️','TRUE'],
    ['CAT007','ไม่ส่งงาน/การบ้าน',    -3,'sub','📕','TRUE'],
    ['CAT008','มาสาย',                -2,'sub','⏰','TRUE'],
    ['CAT009','พูดจาไม่สุภาพ',        -3,'sub','🚫','TRUE'],
    ['CAT010','ฝ่าฝืนระเบียบโรงเรียน',-5,'sub','❌','TRUE'],
  ];
  defaults.forEach(function(row) { sheet.appendRow(row); });
  Logger.log('Default categories created: ' + defaults.length);
}

// ─── BEHAVIOR SCORE HANDLERS ──────────────────────────────────
function handleSaveBehaviorScore(body) {
  if (!body.student_id)   throw new Error('ไม่มี student_id');
  if (!body.category_id)  throw new Error('ไม่มี category_id');
  if (!body.teacher)      throw new Error('ไม่มีชื่อครูผู้บันทึก');
  if (body.points === undefined) throw new Error('ไม่มีคะแนน');

  var scoreId   = generateId('BHV');
  var now       = new Date();
  var dateStr   = body.date || Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd');
  var timestamp = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var points    = Number(body.points);
  var type      = points >= 0 ? 'add' : 'sub';

  var sheet = getSheet(CONFIG.SHEETS.BEHAVIOR_SCORE);
  sheet.appendRow([
    scoreId,
    body.student_id,
    dateStr,
    type,
    body.category_id,
    body.category_name || '',
    points,
    body.note || '',
    body.teacher,
    timestamp,
  ]);
  SpreadsheetApp.flush();
  Logger.log('BehaviorScore saved: ' + scoreId + ' student=' + body.student_id + ' pts=' + points);
  return jsonResponse({ score_id: scoreId, saved: true });
}

function handleDeleteBehaviorScore(body) {
  var sheet = getSheet(CONFIG.SHEETS.BEHAVIOR_SCORE);
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.score_id) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ score_id: body.score_id, deleted: true });
    }
  }
  return errorResponse('Not found', 404);
}

function handleGetBehaviorScores(params) {
  var scores   = sheetToObjects(getSheet(CONFIG.SHEETS.BEHAVIOR_SCORE));
  var students = sheetToObjects(getSheet(CONFIG.SHEETS.STUDENTS));
  var stuMap   = {};
  students.forEach(function(s) { stuMap[s.student_id] = s; });

  var filtered = scores;
  if (params.student_id) filtered = filtered.filter(function(r) { return r.student_id === params.student_id; });
  if (params.date)       filtered = filtered.filter(function(r) { return formatDate(r.date) === params.date; });
  if (params.month && params.year) {
    filtered = filtered.filter(function(r) {
      var d = new Date(r.date);
      return d.getMonth()+1 === parseInt(params.month) && d.getFullYear() === parseInt(params.year);
    });
  }

  var result = filtered.map(function(r) {
    var stu = stuMap[r.student_id] || {};
    return Object.assign({}, r, {
      fullname: stu.fullname || r.student_id,
      class: stu.class || '',
      room:  stu.room  || '',
      zone_id: stu.zone_id || '',
    });
  }).sort(function(a,b) { return String(b.created_at).localeCompare(String(a.created_at)); });

  return jsonResponse(result);
}

// ─── BEHAVIOR DASHBOARD ───────────────────────────────────────
function handleGetBehaviorDashboard(params) {
  var now      = new Date();
  var month    = params.month ? parseInt(params.month) : now.getMonth() + 1;
  var year     = params.year  ? parseInt(params.year)  : now.getFullYear();

  var scores   = sheetToObjects(getSheet(CONFIG.SHEETS.BEHAVIOR_SCORE));
  var students = sheetToObjects(getSheet(CONFIG.SHEETS.STUDENTS));

  // นักเรียน active ทั้งหมด
  var activeStudents = students.filter(function(s) {
    return String(s.active).toUpperCase() === 'TRUE';
  });

  // กรองเดือนปัจจุบัน
  var monthScores = scores.filter(function(r) {
    var d = new Date(r.date);
    return d.getMonth()+1 === month && d.getFullYear() === year;
  });

  // คะแนนรวมรายคน (เริ่มต้น 10 คะแนน + บวก/หัก)
  var INITIAL_SCORE = 10;
  var stuScoreMap   = {};
  activeStudents.forEach(function(s) {
    stuScoreMap[s.student_id] = { student: s, total: INITIAL_SCORE, add: 0, sub: 0 };
  });
  monthScores.forEach(function(r) {
    if (!stuScoreMap[r.student_id]) return;
    var pts = Number(r.points);
    stuScoreMap[r.student_id].total += pts;
    if (pts >= 0) stuScoreMap[r.student_id].add += pts;
    else          stuScoreMap[r.student_id].sub += Math.abs(pts);
  });

  // Top 10
  var ranking = Object.values(stuScoreMap)
    .sort(function(a,b) { return b.total - a.total; })
    .slice(0, 10)
    .map(function(r) {
      return {
        student_id: r.student.student_id,
        fullname:   r.student.fullname,
        class:      r.student.class,
        room:       r.student.room,
        total:      r.total,
        add:        r.add,
        sub:        r.sub,
      };
    });

  // 10 รายการล่าสุด
  var stuMap = {};
  activeStudents.forEach(function(s) { stuMap[s.student_id] = s; });
  var recent = scores
    .sort(function(a,b) { return String(b.created_at).localeCompare(String(a.created_at)); })
    .slice(0, 10)
    .map(function(r) {
      var stu = stuMap[r.student_id] || {};
      return {
        score_id:      r.score_id,
        student_id:    r.student_id,
        fullname:      stu.fullname || r.student_id,
        class:         stu.class || '',
        room:          stu.room  || '',
        date:          formatDate(r.date),
        type:          r.type,
        category_name: r.category_name,
        points:        Number(r.points),
        note:          r.note,
        teacher:       r.teacher,
      };
    });

  // สถิติรายเดือน
  var totalAdd  = monthScores.filter(function(r){return Number(r.points)>=0;}).reduce(function(s,r){return s+Number(r.points);},0);
  var totalSub  = monthScores.filter(function(r){return Number(r.points)<0;}).reduce(function(s,r){return s+Math.abs(Number(r.points));},0);
  var totalTxn  = monthScores.length;

  // นักเรียนคะแนนสูงสุดของเดือน (รวม all-time month scores)
  var monthWinner = ranking.length > 0 ? ranking[0] : null;

  return jsonResponse({
    month: month, year: year,
    ranking:       ranking,
    recent:        recent,
    stats: {
      total_transactions: totalTxn,
      total_add:          totalAdd,
      total_sub:          totalSub,
      active_students:    activeStudents.length,
    },
    month_winner: monthWinner,
  });
}

// ─── BEHAVIOR REPORT (รายคน / รายเดือน) ─────────────────────
function handleGetBehaviorReport(params) {
  var month  = parseInt(params.month);
  var year   = parseInt(params.year);

  var scores   = sheetToObjects(getSheet(CONFIG.SHEETS.BEHAVIOR_SCORE));
  var students = sheetToObjects(getSheet(CONFIG.SHEETS.STUDENTS));

  var activeStudents = students.filter(function(s) {
    return String(s.active).toUpperCase() === 'TRUE';
  });

  var monthScores = scores.filter(function(r) {
    var d = new Date(r.date);
    return d.getMonth()+1 === month && d.getFullYear() === year;
  });

  var INITIAL_SCORE = 10;
  var stuMap = {};
  activeStudents.forEach(function(s) { stuMap[s.student_id] = s; });

  var studentReport = activeStudents.map(function(s) {
    var myScores = monthScores.filter(function(r) { return r.student_id === s.student_id; });
    var totalAdd = myScores.filter(function(r){return Number(r.points)>=0;}).reduce(function(a,r){return a+Number(r.points);},0);
    var totalSub = myScores.filter(function(r){return Number(r.points)<0;}).reduce(function(a,r){return a+Math.abs(Number(r.points));},0);
    var total    = INITIAL_SCORE + totalAdd - totalSub;
    return {
      student_id: s.student_id,
      fullname:   s.fullname,
      class:      s.class,
      room:       s.room,
      initial:    INITIAL_SCORE,
      add:        totalAdd,
      sub:        totalSub,
      total:      total,
      transactions: myScores.length,
    };
  }).sort(function(a,b) { return b.total - a.total; });

  return jsonResponse({
    month: month, year: year,
    student_report: studentReport,
    total_transactions: monthScores.length,
  });
}

// ─── INIT BEHAVIOR (รันครั้งเดียว) ──────────────────────────
function initBehaviorSystem() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  ['BehaviorScore','ScoreCategory'].forEach(function(name) {
    if (!ss.getSheetByName(name)) {
      createSheet(ss, name);
      Logger.log('Created: ' + name);
    } else {
      Logger.log('Already exists: ' + name);
    }
  });
  initDefaultCategories();
  Logger.log('Behavior system initialized!');
}

// ============================================================
//  ระบบตรวจสุขลักษณะนักเรียน — Hygiene Check System
//  รายการ: ผม | ช้อน | แก้วน้ำ | แปรงสีฟัน | ร่างกาย
// ============================================================

// ─── SAVE HYGIENE CHECK ──────────────────────────────────────
function handleSaveHygieneCheck(body) {
  if (!body.date)      throw new Error('ไม่มีวันที่');
  if (!body.inspector) throw new Error('ไม่มีชื่อผู้ตรวจ');
  if (!body.records || !body.records.length) throw new Error('ไม่มีข้อมูลนักเรียน');

  var sheet     = getSheet(CONFIG.SHEETS.HYGIENE_CHECK);
  var now       = new Date();
  var dateStr   = body.date;
  var dateParts = dateStr.split('-');
  var month     = parseInt(dateParts[1]);
  var year      = parseInt(dateParts[0]);
  var saved     = 0;

  // ตรวจสอบว่ามีข้อมูลของวันนี้อยู่แล้วหรือยัง → ถ้ามีให้ลบก่อน update
  var existing = sheet.getDataRange().getValues();
  var delRows  = [];
  for (var i = existing.length - 1; i >= 1; i--) {
    var rowDate     = formatDate(existing[i][2]);
    var rowStudentId = existing[i][1];
    var studentInBody = body.records.some(function(r) { return r.student_id === rowStudentId; });
    if (rowDate === dateStr && studentInBody) {
      delRows.push(i + 1); // 1-based
    }
  }
  // ลบจากล่างขึ้นบน
  delRows.sort(function(a,b){return b-a;}).forEach(function(r) { sheet.deleteRow(r); });

  // เพิ่มข้อมูลใหม่
  body.records.forEach(function(rec) {
    var hygieneId = generateId('HYG');
    var timestamp = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([
      hygieneId,
      rec.student_id,
      dateStr,
      month,
      year,
      rec.haircut    ? 'pass' : 'fail',   // ผม
      rec.spoon      ? 'pass' : 'fail',   // ช้อน
      rec.glass      ? 'pass' : 'fail',   // แก้วน้ำ
      rec.toothbrush ? 'pass' : 'fail',   // แปรงสีฟัน
      rec.body_clean ? 'pass' : 'fail',   // ร่างกาย
      rec.note       || '',
      body.inspector,
      timestamp,
    ]);
    saved++;
  });

  SpreadsheetApp.flush();
  Logger.log('HygieneCheck saved: ' + saved + ' records for ' + dateStr);
  return jsonResponse({ saved: saved, date: dateStr });
}

// ─── DELETE HYGIENE CHECK ────────────────────────────────────
function handleDeleteHygieneCheck(body) {
  var sheet = getSheet(CONFIG.SHEETS.HYGIENE_CHECK);
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.hygiene_id) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ hygiene_id: body.hygiene_id, deleted: true });
    }
  }
  return errorResponse('Not found', 404);
}

// ─── GET HYGIENE CHECKS ──────────────────────────────────────
function handleGetHygieneChecks(params) {
  var rows     = sheetToObjects(getSheet(CONFIG.SHEETS.HYGIENE_CHECK));
  var students = sheetToObjects(getSheet(CONFIG.SHEETS.STUDENTS));
  var stuMap   = {};
  students.forEach(function(s) { stuMap[s.student_id] = s; });

  var filtered = rows;

  if (params.date) {
    filtered = filtered.filter(function(r) { return formatDate(r.date) === params.date; });
  }
  if (params.month && params.year) {
    filtered = filtered.filter(function(r) {
      return String(r.month) === String(params.month) && String(r.year) === String(params.year);
    });
  }
  if (params.student_id) {
    filtered = filtered.filter(function(r) { return r.student_id === params.student_id; });
  }

  var result = filtered.map(function(r) {
    var stu = stuMap[r.student_id] || {};
    return {
      hygiene_id:  r.hygiene_id,
      student_id:  r.student_id,
      fullname:    stu.fullname  || r.student_id,
      class:       stu.class    || '',
      room:        stu.room     || '',
      zone_id:     stu.zone_id  || '',
      date:        formatDate(r.date),
      month:       r.month,
      year:        r.year,
      haircut:     r.haircut    === 'pass',
      spoon:       r.spoon      === 'pass',
      glass:       r.glass      === 'pass',
      toothbrush:  r.toothbrush === 'pass',
      body_clean:  r.body_clean === 'pass',
      note:        r.note       || '',
      inspector:   r.inspector  || '',
      created_at:  r.created_at || '',
      // คะแนนรวม (5 รายการ)
      score: [r.haircut,r.spoon,r.glass,r.toothbrush,r.body_clean]
               .filter(function(v){return v==='pass';}).length,
    };
  });

  return jsonResponse(result);
}

// ─── GET HYGIENE REPORT (สรุปรายเดือน) ──────────────────────
function handleGetHygieneReport(params) {
  var month = parseInt(params.month);
  var year  = parseInt(params.year);

  var rows     = sheetToObjects(getSheet(CONFIG.SHEETS.HYGIENE_CHECK));
  var students = sheetToObjects(getSheet(CONFIG.SHEETS.STUDENTS));

  var activeStudents = students.filter(function(s) {
    return String(s.active).toUpperCase() === 'TRUE';
  });

  var monthRows = rows.filter(function(r) {
    return String(r.month) === String(month) && String(r.year) === String(year);
  });

  var stuMap = {};
  activeStudents.forEach(function(s) { stuMap[s.student_id] = s; });

  // รวมผลรายคน — ถ้าตรวจหลายครั้ง นับรอบล่าสุด
  var stuResultMap = {};
  monthRows.forEach(function(r) {
    var existing = stuResultMap[r.student_id];
    var ts = String(r.created_at || '');
    if (!existing || ts > String(existing.created_at || '')) {
      stuResultMap[r.student_id] = r;
    }
  });

  var summary = activeStudents.map(function(s) {
    var r = stuResultMap[s.student_id];
    if (!r) {
      return {
        student_id: s.student_id, fullname: s.fullname,
        class: s.class, room: s.room,
        checked: false,
        haircut: null, spoon: null, glass: null,
        toothbrush: null, body_clean: null,
        score: 0, note: '', inspector: '', date: '',
      };
    }
    var score = [r.haircut,r.spoon,r.glass,r.toothbrush,r.body_clean]
                  .filter(function(v){return v==='pass';}).length;
    return {
      student_id: s.student_id, fullname: s.fullname,
      class: s.class, room: s.room,
      checked:    true,
      haircut:    r.haircut    === 'pass',
      spoon:      r.spoon      === 'pass',
      glass:      r.glass      === 'pass',
      toothbrush: r.toothbrush === 'pass',
      body_clean: r.body_clean === 'pass',
      score:      score,
      note:       r.note     || '',
      inspector:  r.inspector|| '',
      date:       formatDate(r.date),
    };
  }).sort(function(a,b) { return b.score - a.score; });

  // สถิติ
  var checked      = summary.filter(function(r){return r.checked;});
  var passAll      = summary.filter(function(r){return r.score === 5;}).length;
  var failHaircut  = checked.filter(function(r){return !r.haircut;}).length;
  var failSpoon    = checked.filter(function(r){return !r.spoon;}).length;
  var failGlass    = checked.filter(function(r){return !r.glass;}).length;
  var failToothbrush = checked.filter(function(r){return !r.toothbrush;}).length;
  var failBody     = checked.filter(function(r){return !r.body_clean;}).length;

  // วันที่ตรวจ (unique)
  var dates = [...new Set(monthRows.map(function(r){return formatDate(r.date);}))].sort();

  return jsonResponse({
    month: month, year: year,
    total_students:    activeStudents.length,
    checked_students:  checked.length,
    pass_all:          passAll,
    check_dates:       dates,
    fail_stats: {
      haircut:    failHaircut,
      spoon:      failSpoon,
      glass:      failGlass,
      toothbrush: failToothbrush,
      body_clean: failBody,
    },
    student_summary: summary,
  });
}

// ─── INIT HYGIENE SHEET (รันครั้งเดียว ไม่แตะ Sheet เดิม) ──
function initHygieneSheet() {
  Logger.log('=== initHygieneSheet START ===');
  var ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var name  = CONFIG.SHEETS.HYGIENE_CHECK;
  var sheet = ss.getSheetByName(name);

  if (sheet) {
    Logger.log('HygieneCheck sheet already exists — rows: ' + sheet.getLastRow());
  } else {
    sheet = ss.insertSheet(name);
    sheet.getRange(1,1,1,13).setValues([[
      'hygiene_id','student_id','date','month','year',
      'haircut','spoon','glass','toothbrush','body_clean',
      'note','inspector','created_at'
    ]]);
    Logger.log('HygieneCheck sheet created with headers');
  }

  // ตรวจสอบ Sheet เดิม ว่ายังอยู่ครบ
  var existing = ['Zones','Students','DailyCheck','Attendance','Photos'];
  existing.forEach(function(n) {
    var s = ss.getSheetByName(n);
    Logger.log((s ? '✅' : '❌') + ' ' + n + ': ' + (s ? s.getLastRow()+' rows' : 'NOT FOUND'));
  });
  Logger.log('=== initHygieneSheet DONE ===');
}
