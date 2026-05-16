// ============================================================
//  ระบบตรวจเวรรับผิดชอบประจำวัน - Google Apps Script API
//  Version: 1.0.0
//  Deploy as: Web App → Execute as Me → Anyone can access
// ============================================================

// ─── CONFIG ──────────────────────────────────────────────────
const CONFIG = {
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',   // ← เปลี่ยนตรงนี้
  DRIVE_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID_HERE', // ← เปลี่ยนตรงนี้
  SHEETS: {
    ZONES:       'Zones',
    STUDENTS:    'Students',
    DAILY_CHECK: 'DailyCheck',
    ATTENDANCE:  'Attendance',
    PHOTOS:      'Photos',
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
      case 'photos':       return handleGetPhotos(e.parameter);
      default:             return errorResponse('Unknown action: ' + action, 404);
    }
  } catch (err) {
    Logger.log('doGet Error: ' + err.toString());
    return errorResponse('Server Error: ' + err.toString(), 500);
  }
}

function doPost(e) {
  try {
    // รับได้ทั้ง application/json และ text/plain (เพื่อหลีกเลี่ยง CORS preflight)
    const raw  = e.postData ? e.postData.contents : '{}';
    const body = JSON.parse(raw || '{}');
    const action = body.action || '';

    switch (action) {
      case 'saveZone':        return handleSaveZone(body);
      case 'deleteZone':      return handleDeleteZone(body);
      case 'saveStudent':     return handleSaveStudent(body);
      case 'deleteStudent':   return handleDeleteStudent(body);
      case 'dailyCheck':      return handleDailyCheck(body);
      case 'uploadPhoto':     return handleUploadPhoto(body);
      default:                return errorResponse('Unknown action: ' + action, 404);
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
    Attendance: ['attendance_id','check_id','student_id','status','note'],
    Photos:     ['photo_id','check_id','type','drive_url','uploaded_at'],
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

// ─── PHOTO UPLOAD HANDLER ─────────────────────────────────────
function handleUploadPhoto(body) {
  try {
    const folder   = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    const decoded  = Utilities.base64Decode(body.base64.split(',').pop());
    const blob     = Utilities.newBlob(decoded, body.mimeType || 'image/jpeg', body.filename || 'photo.jpg');
    const file     = folder.createFile(blob);

    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const driveUrl = 'https://drive.google.com/uc?export=view&id=' + file.getId();

    // Save to Photos sheet
    const photoId = generateId('PHO');
    const sheet   = getSheet(CONFIG.SHEETS.PHOTOS);
    sheet.appendRow([
      photoId,
      body.check_id,
      body.type || 'problem',
      driveUrl,
      Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss'),
    ]);

    return jsonResponse({ photo_id: photoId, drive_url: driveUrl, saved: true });
  } catch (err) {
    Logger.log('Upload error: ' + err);
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
  const targetDate = params.date || formatDate(new Date());

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
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr   = formatDate(d);
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

// ─── INIT SHEET (run once manually) ──────────────────────────
function initSheets() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  Object.keys(CONFIG.SHEETS).forEach(key => {
    const name = CONFIG.SHEETS[key];
    if (!ss.getSheetByName(name)) createSheet(ss, name);
  });
  Logger.log('Sheets initialized!');
}
