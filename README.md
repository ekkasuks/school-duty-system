# ระบบตรวจเวรรับผิดชอบประจำวัน
> School Duty Inspection System — GitHub Pages + Google Apps Script

---

## 📋 โครงสร้างโปรเจค

```
/school-duty
├── index.html          # หน้าหลัก
├── dashboard.html      # Dashboard / กราฟสรุป
├── check.html          # ตรวจเวรประจำวัน (หน้าหลัก)
├── zones.html          # จัดการพื้นที่เวร
├── students.html       # จัดการนักเรียน
├── report.html         # รายงาน + พิมพ์ PDF
├── Code.gs             # Google Apps Script API
├── assets/
│   ├── css/
│   │   ├── style.css   # หลัก
│   │   └── print.css   # สำหรับพิมพ์ PDF
│   ├── js/
│   │   ├── api.js      # API client
│   │   ├── ui.js       # UI utilities
│   │   ├── check.js    # ตรวจเวร logic
│   │   ├── dashboard.js
│   │   └── report.js
│   └── fonts/          # ← ใส่ไฟล์ฟอนต์ที่นี่
│       ├── THSarabunNew.ttf
│       └── THSarabunNewBold.ttf
└── README.md
```

---

## 🚀 ขั้นตอน Deploy

### STEP 1 — สร้าง Google Sheets

1. เปิด [sheets.google.com](https://sheets.google.com) → สร้าง Spreadsheet ใหม่
2. ตั้งชื่อ เช่น `ระบบตรวจเวร`
3. **คัดลอก Spreadsheet ID** จาก URL:
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```

### STEP 2 — สร้าง Google Drive Folder

1. เปิด [drive.google.com](https://drive.google.com) → สร้างโฟลเดอร์ใหม่ ชื่อ `เวร-รูปภาพ`
2. **คัดลอก Folder ID** จาก URL:
   ```
   https://drive.google.com/drive/folders/[FOLDER_ID]
   ```

### STEP 3 — Deploy Google Apps Script

1. เปิด Google Sheets → เมนู **Extensions → Apps Script**
2. ลบโค้ดเดิม และวางโค้ดจากไฟล์ `Code.gs` ทั้งหมด
3. แก้ไข CONFIG ตอนต้นไฟล์:
   ```javascript
   const CONFIG = {
     SPREADSHEET_ID: 'วางค่าจาก STEP 1 ที่นี่',
     DRIVE_FOLDER_ID: 'วางค่าจาก STEP 2 ที่นี่',
   };
   ```
4. กด **Run → initSheets()** ครั้งเดียวเพื่อสร้าง Sheets อัตโนมัติ
5. กด **Deploy → New Deployment**:
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. กด **Deploy** → **คัดลอก Web App URL**

### STEP 4 — แก้ไข api.js

เปิดไฟล์ `assets/js/api.js` แล้วแก้บรรทัดแรก:
```javascript
const API_URL = 'วาง Web App URL จาก STEP 3 ที่นี่';
```

### STEP 5 — เพิ่มไฟล์ฟอนต์

1. ดาวน์โหลด TH Sarabun New ฟรีจาก:
   - [f0nt.com](https://www.f0nt.com/release/th-sarabun-new/) หรือ
   - [Google Fonts Mirror](https://fonts.google.com/specimen/Sarabun)
2. ใส่ไฟล์ในโฟลเดอร์ `assets/fonts/`:
   - `THSarabunNew.ttf`
   - `THSarabunNewBold.ttf`

### STEP 6 — Deploy บน GitHub Pages

```bash
# 1. สร้าง repo บน GitHub (เช่น school-duty)
git init
git add .
git commit -m "Initial deploy"
git remote add origin https://github.com/YOUR_USERNAME/school-duty.git
git push -u origin main

# 2. เปิด Settings → Pages → Source: main branch → /root
# 3. รอสักครู่ แล้วเข้าใช้งานที่:
#    https://YOUR_USERNAME.github.io/school-duty/
```

---

## 📊 โครงสร้าง Google Sheets

| Sheet | คอลัมน์ |
|-------|---------|
| **Zones** | zone_id, zone_name, active |
| **Students** | student_id, fullname, class, room, zone_id, active |
| **DailyCheck** | check_id, date, zone_id, inspector_name, star_rating, comment, created_at |
| **Attendance** | attendance_id, check_id, student_id, status, note |
| **Photos** | photo_id, check_id, type, drive_url, uploaded_at |

---

## 🔗 API Endpoints

| Method | Action | คำอธิบาย |
|--------|--------|---------|
| GET | `?action=zones` | ดึงรายการพื้นที่ทั้งหมด |
| GET | `?action=students&zone_id=Z001` | ดึงนักเรียนตามเขต |
| GET | `?action=dashboard&date=2025-01-15` | ข้อมูล Dashboard |
| GET | `?action=report&month=1&year=2025&zone_id=all` | รายงานประจำเดือน |
| POST | `action: saveZone` | เพิ่ม/แก้ไขพื้นที่ |
| POST | `action: deleteZone` | ลบ/ปิดพื้นที่ |
| POST | `action: saveStudent` | เพิ่ม/แก้ไขนักเรียน |
| POST | `action: dailyCheck` | บันทึกการตรวจเวร |
| POST | `action: uploadPhoto` | อัปโหลดรูปภาพ |

---

## ⚡ ข้อสำคัญ

- **ไม่ต้อง Login** — ทุกคนเข้าใช้งานได้ทันที
- **ฟรีทั้งหมด** — GitHub Pages + Google Sheets + Drive ฟรี
- **Responsive** — ใช้งานได้ทั้ง Mobile และ Desktop
- **PDF Print** — ใช้ TH Sarabun New ขนาด 16pt บน A4 Portrait

---

## 🐞 Troubleshooting

| ปัญหา | แนวทางแก้ไข |
|-------|------------|
| API ไม่ตอบสนอง | ตรวจสอบ `API_URL` ใน `api.js` และ Deploy ใหม่ |
| ข้อมูลไม่บันทึก | ตรวจสอบ `SPREADSHEET_ID` ใน `Code.gs` |
| อัปโหลดรูปไม่ได้ | ตรวจสอบ `DRIVE_FOLDER_ID` และ Permission |
| ฟอนต์ PDF ผิด | ตรวจสอบไฟล์ในโฟลเดอร์ `assets/fonts/` |

---

*พัฒนาโดย: ระบบตรวจเวร v1.0 | สงวนลิขสิทธิ์ตามความเหมาะสม*
