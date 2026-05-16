// ============================================================
//  ui.js  —  Shared UI Utilities
// ============================================================

// ─── TOAST ────────────────────────────────────────────────────
const Toast = {
  container: null,

  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      document.body.appendChild(this.container);
    }
  },

  show(message, type = 'info', duration = 3500) {
    this.init();
    const iconMap = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `
      <i class="fas ${iconMap[type] || iconMap.info}"></i>
      <span>${message}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
    this.container.appendChild(el);
    setTimeout(() => { el.style.animation = 'fadeOut 0.3s forwards'; setTimeout(() => el.remove(), 300); }, duration);
  },

  success: (msg) => Toast.show(msg, 'success'),
  error:   (msg) => Toast.show(msg, 'error', 5000),
  info:    (msg) => Toast.show(msg, 'info'),
  warning: (msg) => Toast.show(msg, 'warning'),
};

// ─── LOADING ──────────────────────────────────────────────────
const Loading = {
  el: null,

  init() {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'loading-overlay';
      this.el.innerHTML = `<div class="spinner"></div><div class="loading-text">กำลังโหลด...</div>`;
      document.body.appendChild(this.el);
    }
  },

  show(text = 'กำลังดำเนินการ...') {
    this.init();
    this.el.querySelector('.loading-text').textContent = text;
    this.el.classList.add('show');
  },

  hide() { this.el && this.el.classList.remove('show'); },
};

// ─── MODAL ────────────────────────────────────────────────────
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}
// Close on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ─── NAVBAR ACTIVE LINK ───────────────────────────────────────
function setActiveNav() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navbar-links a, .mobile-menu a').forEach(a => {
    const href = a.getAttribute('href') || '';
    a.classList.toggle('active', href === page || (page === '' && href === 'index.html'));
  });
}

// ─── HAMBURGER MENU ───────────────────────────────────────────
function initHamburger() {
  const btn  = document.getElementById('hamburger-btn');
  const menu = document.getElementById('mobile-menu');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => menu.classList.toggle('open'));
  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) menu.classList.remove('open');
  });
}

// ─── STAR RATING WIDGET ───────────────────────────────────────
function initStarRating(containerId, inputId) {
  const container = document.getElementById(containerId);
  const input     = document.getElementById(inputId);
  if (!container || !input) return;

  container.innerHTML = [1,2,3,4,5].map(n =>
    `<span class="star" data-val="${n}" title="${n} ดาว">★</span>`
  ).join('');

  const stars = container.querySelectorAll('.star');

  function setStars(val) {
    stars.forEach(s => s.classList.toggle('active', parseInt(s.dataset.val) <= val));
    input.value = val;
  }

  stars.forEach(s => {
    s.addEventListener('mouseover', () => setStars(parseInt(s.dataset.val)));
    s.addEventListener('click',     () => setStars(parseInt(s.dataset.val)));
  });
  container.addEventListener('mouseleave', () => setStars(parseInt(input.value) || 0));

  if (input.value) setStars(parseInt(input.value));
}

// ─── PHOTO UPLOAD WIDGET ──────────────────────────────────────
function initPhotoUpload(dropZoneId, inputId, previewId, maxFiles = 5) {
  const dropZone = document.getElementById(dropZoneId);
  const input    = document.getElementById(inputId);
  const preview  = document.getElementById(previewId);
  if (!dropZone || !input) return;

  let files = [];

  function render() {
    if (!preview) return;
    preview.innerHTML = files.map((f, i) => `
      <div class="photo-thumb">
        <img src="${URL.createObjectURL(f)}" alt="preview">
        <button class="rm-btn" onclick="removePhoto(${i},'${dropZoneId}')">×</button>
      </div>`).join('');
  }

  window[`removePhoto`] = function(i, dzId) {
    if (dzId !== dropZoneId) return;
    files.splice(i, 1);
    render();
  };

  dropZone.addEventListener('click', () => input.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    addFiles([...e.dataTransfer.files]);
  });
  input.addEventListener('change', () => addFiles([...input.files]));

  function addFiles(newFiles) {
    const imageFiles = newFiles.filter(f => f.type.startsWith('image/'));
    files = [...files, ...imageFiles].slice(0, maxFiles);
    render();
  }

  dropZone._getFiles = () => files;
  dropZone._clear    = () => { files = []; render(); };
}

// ─── FORMAT HELPERS ───────────────────────────────────────────
function formatThaiDate(dateStr) {
  if (!dateStr) return '-';
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const d = new Date(dateStr);
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function formatThaiMonth(month, year) {
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  return `${months[month - 1]} ${year + 543}`;
}

function renderStars(val) {
  val = Math.round(val);
  return [1,2,3,4,5].map(i => `<span style="color:${i<=val?'#FFC107':'#ddd'}">★</span>`).join('');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentThaiMonth() {
  const d = new Date();
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

// ─── CONFIRM DIALOG ───────────────────────────────────────────
function confirmAction(message) {
  return window.confirm(message);
}

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setActiveNav();
  initHamburger();
});
