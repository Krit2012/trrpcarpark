// API Configuration
const API_BASE = '';

// Core State Models
let logs = [];
let monthlyVehicles = [];
let tenantCompanies = []; // Added for tenant companies list
let users = [];
let session = null;
let activeScreen = 'checkin'; // Defaults to checkin (first menu option)

// Selected date for dashboard filter (defaults to today)
let selectedDashDate = new Date().toISOString().split('T')[0];
let dashboardFilter = 'all'; // Filters: 'all', 'parked', 'checked_out', 'revenue'

// Rate Configuration
const HOURLY_RATE = 20; // 20 THB/hr
const FREE_HOURS = 1;   // 1 Hour Free

// Screen ID casing mapping to resolve case-sensitivity bug
const screenMap = {
  checkin: 'scrCheckIn',
  checkout: 'scrCheckOut',
  dashboard: 'scrDashboard',
  monthly: 'scrMonthly',
  users: 'scrUsers',
  companies: 'scrCompanies', // Added companies screen panel
  exempt: 'scrExempt'       // Added exemptions screen panel
};

// Tab button ID mapping
const tabButtonMap = {
  checkin: 'navTabCheckIn',
  checkout: 'navTabCheckOut',
  dashboard: 'navTabDashboard',
  monthly: 'navTabMonthly',
  users: 'navTabUsers',
  companies: 'navTabCompanies', // Added companies navigation tab
  exempt: 'navTabExempt'        // Added exemptions navigation tab
};

// Initialisation
window.addEventListener('DOMContentLoaded', () => {
  initClock();
  initTheme();
  loadData();
  
  // Setup check-in time as current time (auto-updates every minute)
  resetCheckInTimeField();
  setInterval(resetCheckInTimeField, 60000); // update every 60 seconds
  
  // Setup user role listener for showing/hiding company selector
  const usrRoleEl = document.getElementById('usrRole');
  if (usrRoleEl) {
    usrRoleEl.addEventListener('change', handleUserRoleChange);
  }

  // Check session
  checkSession();
});

// Clock Manager
function initClock() {
  const ticker = document.getElementById('tickerText');
  function tick() {
    if (!ticker) return;
    const now = new Date();
    const dateStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('th-TH', { hour12: false });
    ticker.textContent = `ข้อมูลระบบ: ${dateStr} เวลา: ${timeStr}`;
  }
  tick();
  setInterval(tick, 1000);
}

// Light-Dark Theme Manager
function initTheme() {
  document.getElementById('themeToggle').addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('trrp_theme_dark', isDark);
  });
  
  const savedDark = localStorage.getItem('trrp_theme_dark') === 'true';
  if (savedDark || (localStorage.getItem('trrp_theme_dark') === null && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add('dark-mode');
  }
}

// Load and Seed Database
function loadData() {
  // 1. Users
  loadUsersFromLocalStorage();

  // 2. Tenant Companies
  loadCompaniesFromLocalStorage();

  // 3. Monthly Vehicles
  loadMonthlyFromLocalStorage();

  // 4. Logs (Check-in & Check-out records)
  loadLogsFromLocalStorage();

  // 5. Sync everything with backend
  syncAllDataWithBackend();
}

function loadCompaniesFromLocalStorage() {
  const storedCompanies = localStorage.getItem('trrp_db_companies');
  if (storedCompanies) {
    tenantCompanies = JSON.parse(storedCompanies);
  } else {
    tenantCompanies = [
      { id: 1, code: 'ADV', name: 'กลุ่มบริษัท แอดวานซ์' },
      { id: 2, code: 'BLD', name: 'กลุ่มบริษัท บิลเดอร์' }
    ];
    localStorage.setItem('trrp_db_companies', JSON.stringify(tenantCompanies));
  }
}

function loadMonthlyFromLocalStorage() {
  const storedMonthly = localStorage.getItem('trrp_db_monthly');
  if (storedMonthly) {
    monthlyVehicles = JSON.parse(storedMonthly);
  } else {
    const now = new Date();
    // Expiration months setup
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 7); // Expiration: next month
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7); // Expiration: previous month (expired)
    
    monthlyVehicles = [
      { id: 1, plate: '1กก1111', owner: 'คุณเกียรติภูมิ มั่นคง', company: 'กลุ่มบริษัท แอดวานซ์', expMonth: nextMonth, isExecutive: true },
      { id: 2, plate: '2กก2222', owner: 'คุณวิชัย เลิศลอย', company: 'กลุ่มบริษัท บิลเดอร์', expMonth: prevMonth, isExecutive: false }
    ];
    localStorage.setItem('trrp_db_monthly', JSON.stringify(monthlyVehicles));
  }
}

function loadLogsFromLocalStorage() {
  const storedLogs = localStorage.getItem('trrp_db_logs');
  if (storedLogs) {
    logs = JSON.parse(storedLogs);
  } else {
    const now = new Date();
    // Seed some mock parked cars
    logs = [
      {
        id: 10001,
        plate: '1กก1111',
        timeIn: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 10).toISOString(),
        timeOut: null,
        createdBy: 'admin',
        createdAt: new Date().toISOString(),
        updatedBy: null,
        updatedAt: null,
        status: 'parked',
        amount: 0,
        coupons: 0,
        exemptedHours: null,
        exemptedCompany: null,
        exemptedBy: null,
        exemptedAt: null
      },
      {
        id: 10002,
        plate: '2กก2222',
        timeIn: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 15).toISOString(),
        timeOut: null,
        createdBy: 'admin',
        createdAt: new Date().toISOString(),
        updatedBy: null,
        updatedAt: null,
        status: 'parked',
        amount: 0,
        coupons: 0,
        exemptedHours: null,
        exemptedCompany: null,
        exemptedBy: null,
        exemptedAt: null
      },
      {
        id: 10003,
        plate: '3กก3333',
        timeIn: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 30).toISOString(),
        timeOut: null,
        createdBy: 'admin',
        createdAt: new Date().toISOString(),
        updatedBy: null,
        updatedAt: null,
        status: 'parked',
        amount: 0,
        coupons: 0,
        exemptedHours: null,
        exemptedCompany: null,
        exemptedBy: null,
        exemptedAt: null
      }
    ];
    localStorage.setItem('trrp_db_logs', JSON.stringify(logs));
  }
}

async function syncAllDataWithBackend() {
  try {
    const response = await fetch(`${API_BASE}/api/carpark/data`);
    if (response.ok) {
      const data = await response.json();
      
      // 1. Sync Users
      if (data.users) {
        users = data.users.map(u => ({
          id: u.id,
          username: u.username,
          role: u.role,
          pass: u.pin || u.pass || '1234',
          company: u.company || null,
          max_exemptedHours: u.max_exemptedHours !== undefined && u.max_exemptedHours !== null ? Number(u.max_exemptedHours) : null
        }));
        localStorage.setItem('trrp_db_users', JSON.stringify(users));
        if (activeScreen === 'users') {
          renderUsersTable();
        }
      }

      // 2. Sync Tenant Companies
      if (data.tenantCompanies) {
        tenantCompanies = data.tenantCompanies.map(c => ({
          id: c.id,
          code: c.code,
          name: c.name
        }));
        localStorage.setItem('trrp_db_companies', JSON.stringify(tenantCompanies));
        populateCompanyDropdowns();
        if (activeScreen === 'companies') {
          renderCompaniesTable();
        }
      }

      // 3. Sync Monthly Vehicles
      if (data.monthlyVehicles) {
        monthlyVehicles = data.monthlyVehicles.map(m => ({
          id: m.id,
          plate: m.plate,
          owner: m.owner,
          company: m.company,
          expMonth: m.expMonth,
          isExecutive: m.isExecutive === 1 || m.isExecutive === true
        }));
        localStorage.setItem('trrp_db_monthly', JSON.stringify(monthlyVehicles));
        if (activeScreen === 'monthly') {
          renderMonthlyTable();
        }
      }

      // 4. Sync Parking Logs
      if (data.parkingLogs) {
        logs = data.parkingLogs.map(l => ({
          id: l.id,
          plate: l.plate,
          timeIn: l.timeIn,
          timeOut: l.timeOut || null,
          createdBy: l.createdBy,
          createdAt: l.createdAt,
          updatedBy: l.updatedBy || null,
          updatedAt: l.updatedAt || null,
          status: l.status,
          amount: Number(l.amount || 0),
          coupons: Number(l.coupons || 0),
          exemptedHours: l.exemptedHours !== null && l.exemptedHours !== undefined ? Number(l.exemptedHours) : null,
          exemptedCompany: l.exemptedCompany || null,
          exemptedBy: l.exemptedBy || null,
          exemptedAt: l.exemptedAt || null
        }));
        localStorage.setItem('trrp_db_logs', JSON.stringify(logs));
        if (activeScreen === 'dashboard') {
          renderDashboard();
        }
      }
    }
  } catch (error) {
    console.warn("Could not sync all data with backend, using offline cache:", error);
  }
}

// Session Check
function checkSession() {
  const storedSession = localStorage.getItem('trrp_session');
  if (storedSession) {
    session = JSON.parse(storedSession);
    document.getElementById('sessionUserDisplay').textContent = session.username;
    
    const roleBadge = document.getElementById('sessionRoleBadge');
    if (session.role === 'admin') {
      roleBadge.textContent = 'แอดมิน';
    } else if (session.role === 'Validator') {
      roleBadge.textContent = 'ผู้บันทึกสิทธิ์';
    } else {
      roleBadge.textContent = 'ผู้ใช้งาน';
    }
    roleBadge.className = `role-badge ${session.role}`;
    
    // Role Restrictions: Toggle visibility of Admin/Dashboard/Monthly pages
    const navTabCheckIn = document.getElementById('navTabCheckIn');
    const navTabCheckOut = document.getElementById('navTabCheckOut');
    const navTabDashboard = document.getElementById('navTabDashboard');
    const navTabMonthly = document.getElementById('navTabMonthly');
    const navTabExempt = document.getElementById('navTabExempt');
    const navTabCompanies = document.getElementById('navTabCompanies');
    const navTabUsers = document.getElementById('navTabUsers');
    
    if (session.role === 'admin') {
      navTabCheckIn.style.display = 'block';
      navTabCheckOut.style.display = 'block';
      navTabDashboard.style.display = 'block';
      navTabMonthly.style.display = 'block';
      navTabExempt.style.display = 'block';
      navTabCompanies.style.display = 'block';
      navTabUsers.style.display = 'block';
      
      // Admin starts at Dashboard
      switchMainScreen('dashboard');
    } else if (session.role === 'Validator') {
      navTabCheckIn.style.display = 'none';
      navTabCheckOut.style.display = 'none';
      navTabDashboard.style.display = 'none';
      navTabMonthly.style.display = 'none';
      navTabExempt.style.display = 'block';
      navTabCompanies.style.display = 'none';
      navTabUsers.style.display = 'none';
      
      // Validator starts at Exemption
      switchMainScreen('exempt');
    } else {
      // General User (Staff) can ONLY access Check-in and Check-out
      navTabCheckIn.style.display = 'block';
      navTabCheckOut.style.display = 'block';
      navTabDashboard.style.display = 'none';
      navTabMonthly.style.display = 'none';
      navTabExempt.style.display = 'none';
      navTabCompanies.style.display = 'none';
      navTabUsers.style.display = 'none';
      
      // User starts at Check-in
      switchMainScreen('checkin');
    }
    
    // Show Main app
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'flex';
  } else {
    session = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
  }
}

// User Actions: Login
async function handleLogin() {
  const userVal = document.getElementById('loginUser').value.trim();
  const passVal = document.getElementById('loginPass').value.trim(); // Trim password to prevent trailing space failures
  const errMsg = document.getElementById('loginErrorMsg');
  
  errMsg.style.display = 'none';
  
  // Always fetch latest users from the database/backend first
  await syncUsersWithBackend();
  
  const matchedUser = users.find(u => 
    String(u.username).trim().toLowerCase() === userVal.toLowerCase() && 
    String(u.pass).trim() === String(passVal)
  );
  if (matchedUser) {
    const sessionObj = {
      username: matchedUser.username,
      role: matchedUser.role
    };
    localStorage.setItem('trrp_session', JSON.stringify(sessionObj));
    
    // Clear inputs
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    
    checkSession();
  } else {
    errMsg.style.display = 'block';
  }
}

// User Actions: Logout
function handleLogout() {
  if (confirm("คุณต้องการออกจากระบบหรือไม่?")) {
    localStorage.removeItem('trrp_session');
    checkSession();
  }
}

// Reset/Refresh check-in time to current time (called on load and every minute)
function resetCheckInTimeField() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  const localISOTime = new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  const el = document.getElementById('chkInTime');
  if (el) el.value = localISOTime;
}

// Screen Switcher
function switchMainScreen(screenId) {
  activeScreen = screenId;

  // Toggle active-screen class on panels
  Object.keys(screenMap).forEach(key => {
    const panelId = screenMap[key];
    const el = document.getElementById(panelId);
    if (el) el.classList.remove('active-screen');
  });

  // Toggle active class on tab buttons
  Object.keys(tabButtonMap).forEach(key => {
    const btnId = tabButtonMap[key];
    const el = document.getElementById(btnId);
    if (el) el.classList.remove('active');
  });
  
  // Activate selected screen & tab button
  const activePanelId = screenMap[screenId];
  const activePanel = document.getElementById(activePanelId);
  if (activePanel) activePanel.classList.add('active-screen');
  
  const activeBtnId = tabButtonMap[screenId];
  const activeBtn = document.getElementById(activeBtnId);
  if (activeBtn) activeBtn.classList.add('active');

  // Trigger UI renders specific to screen
  if (screenId === 'dashboard') {
    renderDashboard();
  } else if (screenId === 'monthly') {
    renderMonthlyTable();
  } else if (screenId === 'users') {
    renderUsersTable();
  } else if (screenId === 'companies') {
    renderCompaniesTable();
  } else if (screenId === 'exempt') {
    resetExemptScreen();
  }
}

// Populate Company Select Dropdowns
function populateCompanyDropdowns() {
  const usrCompanySelect = document.getElementById('usrCompany');
  const monCompanySelect = document.getElementById('monCompany');
  
  if (usrCompanySelect) {
    usrCompanySelect.innerHTML = '<option value="">-- เลือกบริษัทผู้เช่า --</option>';
    tenantCompanies.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = `${c.code} - ${c.name}`;
      usrCompanySelect.appendChild(opt);
    });
  }

  if (monCompanySelect) {
    monCompanySelect.innerHTML = '<option value="">-- เลือกบริษัทผู้เช่า --</option>';
    tenantCompanies.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = `${c.code} - ${c.name}`;
      monCompanySelect.appendChild(opt);
    });
  }
}

// User Role Change Listener for Tenant Company dropdown visibility & requirement
function handleUserRoleChange() {
  const role = document.getElementById('usrRole').value;
  const companyGroup = document.getElementById('usrCompanyGroup');
  const companySelect = document.getElementById('usrCompany');
  const maxExemptGroup = document.getElementById('usrMaxExemptHoursGroup');
  const maxExemptInput = document.getElementById('usrMaxExemptHours');
  
  if (!companyGroup || !companySelect) return;

  if (role === 'Validator') {
    companyGroup.style.display = 'block';
    companySelect.required = true;
    companySelect.disabled = false;
    if (maxExemptGroup) maxExemptGroup.style.display = 'block';
    if (maxExemptInput) {
      maxExemptInput.required = true;
      maxExemptInput.disabled = false;
    }
  } else {
    companyGroup.style.display = 'none';
    companySelect.required = false;
    companySelect.disabled = true;
    companySelect.value = ''; // Reset selection
    if (maxExemptGroup) maxExemptGroup.style.display = 'none';
    if (maxExemptInput) {
      maxExemptInput.required = false;
      maxExemptInput.disabled = true;
      maxExemptInput.value = ''; // Reset value
    }
  }
}

// ==========================================
// 📊 SCREEN 3: DASHBOARD
// ==========================================
function handleDashDateChange() {
  selectedDashDate = document.getElementById('dashDateSelector').value;
  renderDashboard();
}

function renderDashboard() {
  // Synchronize date picker input value
  document.getElementById('dashDateSelector').value = selectedDashDate;

  // Calculate stats
  // 1. Cars currently parked (status === 'parked', always live)
  const activeParked = logs.filter(l => l.status === 'parked');
  const occupiedNowCount = activeParked.length;
  
  // 2. Cars checked out on selected date
  const selectedDateLogs = logs.filter(l => {
    if (l.status !== 'checked_out') return false;
    const timeOutDate = l.timeOut.split('T')[0];
    return timeOutDate === selectedDashDate;
  });
  
  const checkedOutCount = selectedDateLogs.length;
  const revenueTotal = selectedDateLogs.reduce((sum, log) => sum + (log.amount || 0), 0);

  // Update top KPI cards
  document.getElementById('statOccupiedNow').textContent = occupiedNowCount;
  document.getElementById('statCheckedOutToday').textContent = checkedOutCount;
  document.getElementById('statRevenueAmount').textContent = `฿${revenueTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

  // Update card active highlights
  const cards = {
    parked: document.getElementById('cardOccupied'),
    checked_out: document.getElementById('cardCheckedOut'),
    revenue: document.getElementById('cardRevenue')
  };
  
  Object.keys(cards).forEach(key => {
    const cardEl = cards[key];
    if (cardEl) {
      if (dashboardFilter === key) {
        cardEl.classList.add('active-card');
      } else {
        cardEl.classList.remove('active-card');
      }
    }
  });

  // Render Date Logs table
  renderDailyLogsTable();
}

function renderDailyLogsTable() {
  const tbody = document.getElementById('dashLogsTableBody');
  tbody.innerHTML = '';

  // Filter logs based on active filter
  let filtered;
  if (dashboardFilter === 'parked') {
    // Show all parked vehicles across all days/dates
    filtered = logs.filter(l => l.status === 'parked');
  } else {
    // Filter logs for selected date (matching check-in OR check-out date)
    filtered = logs.filter(l => {
      const timeInDate = l.timeIn.split('T')[0];
      const timeOutDate = l.timeOut ? l.timeOut.split('T')[0] : null;
      return timeInDate === selectedDashDate || timeOutDate === selectedDashDate;
    });

    // Apply other card filter conditions
    if (dashboardFilter === 'checked_out') {
      filtered = filtered.filter(l => l.status === 'checked_out');
    } else if (dashboardFilter === 'revenue') {
      filtered = filtered.filter(l => l.status === 'checked_out' && l.amount > 0);
    }
  }

  // Update Show All Logs button visibility
  const btnShowAll = document.getElementById('btnShowAllLogs');
  if (btnShowAll) {
    btnShowAll.style.display = dashboardFilter !== 'all' ? 'inline-flex' : 'none';
  }

  if (filtered.length === 0) {
    const emptyMsg = dashboardFilter === 'parked'
      ? 'ไม่มีรถจอดอยู่ในอาคารขณะนี้'
      : `ไม่มีประวัติรถจอดตามเงื่อนไขที่เลือกในวันที่ ${selectedDashDate}`;
    tbody.innerHTML = `<tr><td colspan="11" class="empty-state">${emptyMsg}</td></tr>`;
    return;
  }

  // Sort logs by timeIn descending
  const sorted = [...filtered].sort((a, b) => new Date(b.timeIn) - new Date(a.timeIn));

  sorted.forEach(log => {
    const tr = document.createElement('tr');
    
    const timeIn = new Date(log.timeIn);
    const timeInStr = timeIn.toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
    
    const timeOutStr = log.timeOut 
      ? new Date(log.timeOut).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
      : `<span style="color: var(--warning); font-weight:600;">ยังไม่บันทึกเวลาออก</span>`;

    // Duration calculation
    let elapsedStr = '-';
    if (log.timeOut) {
      const diffMs = new Date(log.timeOut) - timeIn;
      const elapsedMinutes = Math.floor(diffMs / (60 * 1000));
      const hours = Math.floor(elapsedMinutes / 60);
      const mins = elapsedMinutes % 60;
      elapsedStr = `${hours}:${String(mins).padStart(2, '0')} ชั่วโมง`;
    }

    // Lookup monthly membership status
    const isMonthly = monthlyVehicles.some(mv => mv.plate === log.plate);
    const statusBadge = isMonthly 
      ? `<span class="badge-type moto" style="font-size:10px;">รถรายเดือน</span>`
      : `<span class="badge-type car" style="font-size:10px;">รถทั่วไป</span>`;

    const userIn = log.createdBy || 'System';
    const userOut = log.updatedBy || '-';
    const usersMeta = `In: ${userIn} / Out: ${userOut}`;

    const couponsVal = log.coupons || 0;
    const exemptedHoursVal = log.exemptedHours ? `${log.exemptedHours} ชม.` : '-';
    const exemptedCompanyVal = log.exemptedCompany || '-';

    tr.innerHTML = `
      <td class="td-plate">${log.plate}</td>
      <td>${statusBadge}</td>
      <td>${timeInStr}</td>
      <td>${timeOutStr}</td>
      <td>${elapsedStr}</td>
      <td style="font-weight: 700; color: var(--primary)">${log.timeOut ? '฿' + log.amount.toFixed(2) : '-'}</td>
      <td>${couponsVal}</td>
      <td>${exemptedHoursVal}</td>
      <td>${exemptedCompanyVal}</td>
      <td style="font-size: 11.5px; color: var(--text-muted);">${usersMeta}</td>
      <td style="text-align: center; white-space: nowrap;">
        <button class="btn-action-edit" onclick="openEditParkingLogModal(${log.id})">แก้ไข</button>
        <button class="btn-action-checkout" onclick="deleteParkingLog(${log.id})">ลบ</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterDashboard(filterType) {
  dashboardFilter = filterType;
  renderDashboard();
}

// Edit Parking Log Modal Handlers
function openEditParkingLogModal(logId) {
  const log = logs.find(l => l.id === logId);
  if (!log) return;

  document.getElementById('editLogId').value = log.id;
  document.getElementById('editLogPlate').value = log.plate;
  document.getElementById('editLogTimeIn').value = isoToLocalDateString(log.timeIn);
  document.getElementById('editLogTimeOut').value = log.timeOut ? isoToLocalDateString(log.timeOut) : '';

  document.getElementById('editLogModal').style.display = 'flex';
}

function closeEditParkingLogModal() {
  document.getElementById('editLogModal').style.display = 'none';
}

async function saveEditedParkingLog() {
  const logId = parseInt(document.getElementById('editLogId').value);
  const plate = document.getElementById('editLogPlate').value.trim();
  const timeInVal = document.getElementById('editLogTimeIn').value;
  const timeOutVal = document.getElementById('editLogTimeOut').value;

  if (!plate || !timeInVal) {
    alert("กรุณากรอกทะเบียนรถและวันเวลาเข้า!");
    return;
  }

  const idx = logs.findIndex(l => l.id === logId);
  if (idx === -1) return;

  const log = logs[idx];
  const timeIn = new Date(timeInVal).toISOString();
  let timeOut = null;
  let status = 'parked';
  let amount = 0;
  let coupons = log.coupons || 0;

  if (timeOutVal) {
    status = 'checked_out';
    timeOut = new Date(timeOutVal).toISOString();

    const isMonthly = monthlyVehicles.some(mv => mv.plate.toLowerCase() === plate.toLowerCase());
    if (isMonthly) {
      amount = 0;
      coupons = 0;
    } else {
      const diffMs = new Date(timeOut) - new Date(timeIn);
      const diffMins = Math.max(0, Math.floor(diffMs / (60 * 1000)));
      const totalRoundedHours = Math.ceil(diffMins / 60);
      const exemptHours = Number(log.exemptedHours || 0);
      const payableHours = Math.max(0, totalRoundedHours - FREE_HOURS - exemptHours);
      const baseAmount = payableHours * HOURLY_RATE;
      amount = Math.max(0, baseAmount - (coupons * 20));
    }
  }

  // Try to save to central backend first
  let savedOnBackend = false;
  try {
    const payload = {
      id: logId,
      plate,
      timeIn,
      timeOut,
      createdBy: log.createdBy,
      updatedBy: session.username,
      status,
      amount,
      coupons
    };
    const response = await fetch(`${API_BASE}/api/carpark/parking/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      const resData = await response.json();
      if (resData && resData.success) {
        savedOnBackend = true;
        await syncAllDataWithBackend();
      } else if (resData && resData.error) {
        alert("ข้อผิดพลาดจากเซิร์ฟเวอร์: " + resData.error);
        return;
      }
    }
  } catch (error) {
    console.warn("Could not save edited parking log to central backend, falling back to local storage:", error);
  }

  if (!savedOnBackend) {
    log.plate = plate;
    log.timeIn = timeIn;
    log.status = status;
    log.timeOut = timeOut;
    log.amount = amount;
    log.coupons = coupons;
    log.updatedBy = session.username;
    log.updatedAt = new Date().toISOString();

    localStorage.setItem('trrp_db_logs', JSON.stringify(logs));
  }

  closeEditParkingLogModal();
  renderDashboard();
  alert("แก้ไขข้อมูลรายการจอดรถเรียบร้อย!");
}

function isoToLocalDateString(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

// Delete parking record log (to correct typos)
async function deleteParkingLog(logId) {
  const log = logs.find(l => l.id === logId);
  if (!log) return;

  if (confirm(`คุณแน่ใจว่าต้องการลบรายการจอดรถของทะเบียน "${log.plate}" หรือไม่?`)) {
    let deletedOnBackend = false;
    try {
      const payload = {
        id: Number(logId),
        adminUsername: session ? session.username : 'System'
      };
      const response = await fetch(`${API_BASE}/api/carpark/parking/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const resData = await response.json();
        if (resData && resData.success) {
          deletedOnBackend = true;
          await syncAllDataWithBackend();
        } else if (resData && resData.error) {
          alert("ข้อผิดพลาดจากเซิร์ฟเวอร์: " + resData.error);
          return;
        }
      }
    } catch (error) {
      console.warn("Could not delete parking log from central backend, falling back to local storage:", error);
    }

    if (!deletedOnBackend) {
      logs = logs.filter(l => l.id !== logId);
      localStorage.setItem('trrp_db_logs', JSON.stringify(logs));
    }
    
    // If active checkout was loaded with this log, clear it
    if (activeSelectedLog && activeSelectedLog.id === logId) {
      cancelCheckoutBill();
    }
    
    renderDashboard();
    alert("ลบประวัติรายการจอดรถเรียบร้อย!");
  }
}

// Export Daily Logs to Excel
function exportDailyLogsToExcel() {
  const filtered = logs.filter(l => {
    const timeInDate = l.timeIn.split('T')[0];
    const timeOutDate = l.timeOut ? l.timeOut.split('T')[0] : null;
    const isSelectedDate = (timeInDate === selectedDashDate || timeOutDate === selectedDashDate);
    const isCurrentlyParked = (l.status === 'parked');
    return isSelectedDate || isCurrentlyParked;
  });

  if (filtered.length === 0) {
    alert(`ไม่มีข้อมูลรายการจอดรถที่จะทำการส่งออกได้`);
    return;
  }

  // Map to format suitable for Excel
  const excelData = filtered.map(log => {
    const timeIn = new Date(log.timeIn).toLocaleString('th-TH');
    const timeOut = log.timeOut ? new Date(log.timeOut).toLocaleString('th-TH') : "ยังไม่เช็คเอาท์";
    
    let elapsedStr = '-';
    if (log.timeOut) {
      const diffMs = new Date(log.timeOut) - new Date(log.timeIn);
      const elapsedMinutes = Math.floor(diffMs / (60 * 1000));
      const hours = Math.floor(elapsedMinutes / 60);
      const mins = elapsedMinutes % 60;
      elapsedStr = `${hours}:${String(mins).padStart(2, '0')} ชั่วโมง`;
    }

    const isMonthly = monthlyVehicles.some(mv => mv.plate === log.plate);
    const memberType = isMonthly ? "รถรายเดือน" : "รถทั่วไป";
    const amountVal = log.timeOut ? log.amount : 0;
    const userIn = log.createdBy || 'System';
    const userOut = log.updatedBy || '-';

    return {
      "ทะเบียนรถ": log.plate,
      "สถานะสมาชิก": memberType,
      "วันเวลาเข้า": timeIn,
      "วันเวลาออก": timeOut,
      "ระยะเวลาจอด (ชั่วโมง)": elapsedStr,
      "ค่าบริการ (บาท)": amountVal,
      "คูปอง(ใบ)": log.coupons || 0,
      "ยกเว้น(ชั่วโมง)": log.exemptedHours || 0,
      "บริษัท": log.exemptedCompany || "-",
      "ผู้บันทึกยกเว้น": log.exemptedBy || "-",
      "ผู้เช็คอิน": userIn,
      "ผู้เช็คเอาท์": userOut
    };
  });

  // Create Excel workbook and sheet
  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Parking Logs");

  // Generate file and trigger download
  XLSX.writeFile(workbook, `parking_report_${selectedDashDate}.xlsx`);
}

// ==========================================
// 📥 SCREEN 2: CHECK-IN
// ==========================================
async function submitCheckIn() {
  const plate = document.getElementById('chkInPlate').value.trim();
  const customTime = document.getElementById('chkInTime').value;

  if (!plate || !customTime) {
    alert("กรุณากรอกข้อมูลทะเบียนรถให้ครบถ้วน!");
    return;
  }

  const timeIn = new Date(customTime).toISOString();
  const createdBy = session.username;

  // Try to save to central backend first
  let savedOnBackend = false;
  try {
    const payload = {
      plate,
      timeIn,
      createdBy,
      status: 'parked',
      amount: 0,
      coupons: 0
    };
    const response = await fetch(`${API_BASE}/api/carpark/parking/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      const resData = await response.json();
      if (resData && resData.success) {
        savedOnBackend = true;
        await syncAllDataWithBackend();
      } else if (resData && resData.error) {
        alert("ข้อผิดพลาดจากเซิร์ฟเวอร์: " + resData.error);
        return;
      }
    }
  } catch (error) {
    console.warn("Could not save check-in to central backend, falling back to local storage:", error);
  }

  if (!savedOnBackend) {
    const newId = logs.length > 0 ? Math.max(...logs.map(l => l.id)) + 1 : 10001;
    const newCheckIn = {
      id: newId,
      plate,
      timeIn,
      timeOut: null,
      createdBy,
      createdAt: new Date().toISOString(),
      updatedBy: null,
      updatedAt: null,
      status: 'parked',
      amount: 0,
      coupons: 0
    };
    logs.push(newCheckIn);
    localStorage.setItem('trrp_db_logs', JSON.stringify(logs));
  }

  // Reset Form
  document.getElementById('chkInPlate').value = '';
  resetCheckInTimeField();
  
  // Notify and Redirect to default main screen based on role
  alert(`เช็คอินนำรถเข้าจอดสำเร็จ! ทะเบียน: ${plate}`);
  if (session.role === 'admin') {
    switchMainScreen('dashboard');
  } else {
    switchMainScreen('checkin');
  }
}

// ==========================================
// 📤 SCREEN 3: CHECK-OUT (WITH BILL CALCULATIONS)
// ==========================================
let activeSelectedLog = null;
let currentPayableBaseAmount = 0;

function handlePlateSearchInput() {
  const input = document.getElementById('chkOutSearchPlate').value.trim().toLowerCase();
  const dropdown = document.getElementById('autocompleteList');
  dropdown.innerHTML = '';
  
  if (input.length === 0) {
    dropdown.style.display = 'none';
    return;
  }

  // Search active parked vehicles matching input plate partially
  const activeParked = logs.filter(l => l.status === 'parked' && l.plate.toLowerCase().includes(input));
  
  if (activeParked.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'autocomplete-item';
    emptyDiv.style.color = 'var(--text-muted)';
    emptyDiv.style.cursor = 'default';
    emptyDiv.textContent = 'ไม่พบทะเบียนรถที่จอดในขณะนี้';
    dropdown.appendChild(emptyDiv);
  } else {
    activeParked.forEach(log => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      
      const isMonthly = monthlyVehicles.some(mv => mv.plate === log.plate);
      const tagText = isMonthly ? 'รายเดือน' : 'รถทั่วไป';
      
      item.innerHTML = `
        <span><strong>${log.plate}</strong></span>
        <span class="autocomplete-meta">${tagText}</span>
      `;
      
      item.addEventListener('click', () => {
        document.getElementById('chkOutSearchPlate').value = log.plate;
        dropdown.style.display = 'none';
        selectAutocompleteVehicle(log.plate);
      });
      
      dropdown.appendChild(item);
    });
  }
  
  dropdown.style.display = 'block';
}

// Load vehicle properties and process billing layout options
function selectAutocompleteVehicle(plate) {
  const matchedLog = logs.find(l => l.plate.toLowerCase() === plate.toLowerCase() && l.status === 'parked');
  
  if (!matchedLog) {
    alert("ไม่พบข้อมูลทะเบียนรถนี้จอดในระบบ!");
    cancelCheckoutBill();
    return;
  }

  activeSelectedLog = matchedLog;
  
  // Calculate billing parameters
  const now = new Date();
  const timeIn = new Date(matchedLog.timeIn);
  let timeOut = now;
  if (timeOut < timeIn) {
    timeOut = timeIn;
  }

  const diffMs = timeOut - timeIn;
  const diffMins = Math.floor(diffMs / (60 * 1000));
  
  // Convert minutes into decimal hours and display string
  const hrsPart = Math.floor(diffMins / 60);
  const minsPart = diffMins % 60;
  const durationStr = `${hrsPart}:${String(minsPart).padStart(2, '0')}`;

  // Reset Warnings and display cards
  const warningBox = document.getElementById('chkOutWarningBox');
  warningBox.style.display = 'none';
  
  const detailsBox = document.getElementById('checkoutDetailsBox');
  const placeholder = document.getElementById('checkoutPlaceholder');
  
  // 1. LOOKUP MONTHLY MEMBER RECORD
  const monthlyMember = monthlyVehicles.find(mv => mv.plate.toLowerCase() === plate.toLowerCase());
  
  if (monthlyMember) {
    // Member Found!
    document.getElementById('chkOutMemberBadge').textContent = monthlyMember.isExecutive ? 'VIP/ผู้บริหาร' : 'สมาชิกรายเดือน';
    document.getElementById('chkOutMemberBadge').className = 'role-badge success';
    
    // Check if subscription has expired
    const currentMonthString = now.toISOString().slice(0, 7); // e.g. "2026-06"
    
    if (currentMonthString > monthlyMember.expMonth) {
      // Expired!
      warningBox.style.display = 'block';
      document.getElementById('chkOutWarningText').textContent = 'กรุณาชำระค่าจอดรถรายเดือน (หมดอายุ ณ สิ้นเดือน ' + monthlyMember.expMonth + ')';
    }
    
    // Display Monthly details
    document.getElementById('chkOutMonthlyCalcBlock').style.display = 'block';
    document.getElementById('chkOutRegularCalcBlock').style.display = 'none';
    
    // Populate details
    document.getElementById('chkOutOwnerDisplay').textContent = monthlyMember.owner;
    document.getElementById('chkOutCompanyDisplay').textContent = monthlyMember.company;
    document.getElementById('chkOutExpDisplay').textContent = monthlyMember.expMonth;
    
    currentPayableBaseAmount = 0;
    document.getElementById('chkOutCoupons').value = 0;
  } else {
    // 2. REGULAR TICKET CALCULATOR
    document.getElementById('chkOutMemberBadge').textContent = 'รถทั่วไป';
    document.getElementById('chkOutMemberBadge').className = 'role-badge';
    
    document.getElementById('chkOutMonthlyCalcBlock').style.display = 'none';
    document.getElementById('chkOutRegularCalcBlock').style.display = 'block';
    // Calculate chargeable hours:
    // - Free first hour (60 minutes)
    // - Exemption hours
    // - Fraction of subsequently elapsed hours: e.g. 1 hour 1 minute -> 2 hours.
    const totalRoundedHours = Math.ceil(diffMins / 60);
    const exemptHours = Number(matchedLog.exemptedHours || 0);
    const payableHours = Math.max(0, totalRoundedHours - FREE_HOURS - exemptHours);
    
    currentPayableBaseAmount = payableHours * HOURLY_RATE;
    
    // Do not default calculated coupons - set to 0 as requested
    document.getElementById('chkOutCoupons').value = 0;
    
    // Toggle exemption row visibility
    const exemptRow = document.getElementById('chkOutExemptRow');
    if (exemptRow) {
      if (exemptHours > 0) {
        exemptRow.style.display = 'flex';
        document.getElementById('chkOutExemptHoursDisplay').textContent = exemptHours;
      } else {
        exemptRow.style.display = 'none';
      }
    }

    // Populate text details
    document.getElementById('chkOutDurationDisplay').textContent = `${durationStr} ชั่วโมง`;
    document.getElementById('chkOutFreeDisplay').textContent = `${FREE_HOURS} ชั่วโมง`;
    document.getElementById('chkOutPayableHoursDisplay').textContent = `${payableHours}:00 ชั่วโมง`;
    
    // Render initial amount
    recalculateCoupons();
  }

  // Populate general UI fields
  document.getElementById('chkOutPlateDisplay').textContent = matchedLog.plate;
  document.getElementById('chkOutTimeInDisplay').textContent = timeIn.toLocaleString('th-TH');
  document.getElementById('chkOutTimeOutDisplay').textContent = timeOut.toLocaleString('th-TH');
  
  detailsBox.style.display = 'block';
  placeholder.style.display = 'none';
}

function recalculateCoupons() {
  if (!activeSelectedLog) return;
  
  let coupons = parseInt(document.getElementById('chkOutCoupons').value);
  if (isNaN(coupons) || coupons < 0) {
    coupons = 0;
    document.getElementById('chkOutCoupons').value = 0;
  }

  // Maximum deduction is the base amount
  const maxCoupons = Math.floor(currentPayableBaseAmount / 20);
  if (coupons > maxCoupons) {
    coupons = maxCoupons;
    document.getElementById('chkOutCoupons').value = maxCoupons;
  }

  const finalAmount = Math.max(0, currentPayableBaseAmount - (coupons * 20));
  document.getElementById('chkOutTotalAmount').textContent = `฿${finalAmount.toFixed(2)}`;
}

function cancelCheckoutBill() {
  activeSelectedLog = null;
  currentPayableBaseAmount = 0;
  document.getElementById('chkOutSearchPlate').value = '';
  document.getElementById('checkoutDetailsBox').style.display = 'none';
  document.getElementById('checkoutPlaceholder').style.display = 'flex';
  const exemptRow = document.getElementById('chkOutExemptRow');
  if (exemptRow) exemptRow.style.display = 'none';
}

// Save Check-Out logs
async function submitCheckOut() {
  if (!activeSelectedLog) return;

  const now = new Date();
  const timeOutISO = now.toISOString();

  // Find index in logs array
  const logIndex = logs.findIndex(l => l.id === activeSelectedLog.id);
  if (logIndex === -1) return;

  // Calculate final numbers
  const isMonthly = monthlyVehicles.some(mv => mv.plate.toLowerCase() === activeSelectedLog.plate.toLowerCase());
  let coupons = 0;
  let finalAmount = 0;

  if (!isMonthly) {
    coupons = parseInt(document.getElementById('chkOutCoupons').value) || 0;
    finalAmount = Math.max(0, currentPayableBaseAmount - (coupons * 20));
  }

  // Try to save to central backend first
  let savedOnBackend = false;
  try {
    const payload = {
      id: activeSelectedLog.id,
      plate: activeSelectedLog.plate,
      timeIn: activeSelectedLog.timeIn,
      timeOut: timeOutISO,
      createdBy: activeSelectedLog.createdBy,
      updatedBy: session.username,
      status: 'checked_out',
      amount: finalAmount,
      coupons
    };
    const response = await fetch(`${API_BASE}/api/carpark/parking/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      const resData = await response.json();
      if (resData && resData.success) {
        savedOnBackend = true;
        await syncAllDataWithBackend();
      } else if (resData && resData.error) {
        alert("ข้อผิดพลาดจากเซิร์ฟเวอร์: " + resData.error);
        return;
      }
    }
  } catch (error) {
    console.warn("Could not save check-out to central backend, falling back to local storage:", error);
  }

  if (!savedOnBackend) {
    // Update record metadata
    logs[logIndex].status = 'checked_out';
    logs[logIndex].timeOut = timeOutISO;
    logs[logIndex].amount = finalAmount;
    logs[logIndex].coupons = coupons;
    logs[logIndex].updatedBy = session.username;
    logs[logIndex].updatedAt = now.toISOString();

    // Save database
    localStorage.setItem('trrp_db_logs', JSON.stringify(logs));
  }

  const successPlate = activeSelectedLog.plate;
  
  // Clear bill panel
  cancelCheckoutBill();
  
  // Alert and render
  alert(`เช็คเอาท์ออกอาคารสำเร็จ! ทะเบียน: ${successPlate} เรียบร้อยแล้ว (ยอดคิดเงิน: ฿${finalAmount.toFixed(2)})`);
  
  // Switch to default start screen
  if (session.role === 'admin') {
    selectedDashDate = now.toISOString().split('T')[0];
    switchMainScreen('dashboard');
  } else {
    switchMainScreen('checkin');
  }
}

// ==========================================
// 💳 SCREEN 4: MONTHLY REGISTERED CRUD
// ==========================================
function renderMonthlyTable() {
  const tbody = document.getElementById('monthlyTableBody');
  tbody.innerHTML = '';

  if (monthlyVehicles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">ไม่มีข้อมูลสมาชิกรถรายเดือน</td></tr>`;
    return;
  }

  monthlyVehicles.forEach(mv => {
    const tr = document.createElement('tr');
    const statusText = mv.isExecutive ? '👑 ผู้บริหาร' : 'ทั่วไป';
    const statusClass = mv.isExecutive ? 'role-badge admin' : 'role-badge';
    
    // Expiry check
    const now = new Date();
    const currentMonthString = now.toISOString().slice(0, 7);
    const isExpired = currentMonthString > mv.expMonth;
    const expiryStyle = isExpired ? 'color: var(--danger); font-weight:700;' : '';
    const expiryText = isExpired ? `${mv.expMonth} (หมดอายุ)` : mv.expMonth;

    tr.innerHTML = `
      <td class="td-plate">${mv.plate}</td>
      <td>${mv.owner}</td>
      <td>${mv.company}</td>
      <td style="${expiryStyle}">${expiryText}</td>
      <td><span class="${statusClass}">${statusText}</span></td>
      <td style="text-align: center;">
        <button class="btn-action-edit" onclick="editMonthlyVehicle(${mv.id})">แก้ไข</button>
        <button class="btn-action-checkout" onclick="deleteMonthlyVehicle(${mv.id})">ลบ</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function saveMonthlyVehicle() {
  const id = document.getElementById('monthlyId').value;
  const plate = document.getElementById('monPlate').value.trim();
  const owner = document.getElementById('monOwner').value.trim();
  const company = document.getElementById('monCompany').value.trim();
  const expMonth = document.getElementById('monExpMonth').value;
  const isExecutive = document.getElementById('monIsExecutive').checked;

  if (!plate || !owner || !company || !expMonth) {
    alert("กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบถ้วน!");
    return;
  }

  // Try to save to central backend first
  let savedOnBackend = false;
  try {
    const payload = {
      id: id ? Number(id) : undefined,
      plate,
      owner,
      company,
      expMonth,
      isExecutive,
      adminUsername: session ? session.username : 'System'
    };
    const response = await fetch(`${API_BASE}/api/carpark/monthly/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      const resData = await response.json();
      if (resData && resData.success) {
        savedOnBackend = true;
        await syncAllDataWithBackend();
      } else if (resData && resData.error) {
        alert("ข้อผิดพลาดจากเซิร์ฟเวอร์: " + resData.error);
        return;
      }
    }
  } catch (error) {
    console.warn("Could not save monthly vehicle to central backend, falling back to local storage:", error);
  }

  if (!savedOnBackend) {
    if (id) {
      const idx = monthlyVehicles.findIndex(mv => mv.id === parseInt(id));
      if (idx !== -1) {
        monthlyVehicles[idx] = { id: parseInt(id), plate, owner, company, expMonth, isExecutive };
      }
    } else {
      if (monthlyVehicles.some(m => m.plate.toLowerCase() === plate.toLowerCase())) {
        alert("ทะเบียนรถนี้ได้รับการลงทะเบียนรายเดือนไว้ในระบบแล้ว!");
        return;
      }
      const newId = monthlyVehicles.length > 0 ? Math.max(...monthlyVehicles.map(m => m.id)) + 1 : 1;
      monthlyVehicles.push({ id: newId, plate, owner, company, expMonth, isExecutive });
    }
    localStorage.setItem('trrp_db_monthly', JSON.stringify(monthlyVehicles));
  }
  
  renderMonthlyTable();
  resetMonthlyForm();
  alert("บันทึกสิทธิ์รถรายเดือนเรียบร้อย!");
}

function editMonthlyVehicle(id) {
  const mv = monthlyVehicles.find(m => m.id === id);
  if (!mv) return;

  document.getElementById('monthlyId').value = mv.id;
  document.getElementById('monPlate').value = mv.plate;
  document.getElementById('monOwner').value = mv.owner;
  document.getElementById('monCompany').value = mv.company;
  document.getElementById('monExpMonth').value = mv.expMonth;
  document.getElementById('monIsExecutive').checked = mv.isExecutive;

  document.getElementById('monthlyFormTitle').textContent = '✏️ แก้ไขสิทธิ์สมาชิกรายเดือน';
  document.getElementById('btnCancelMonEdit').style.display = 'inline-flex';
}

async function deleteMonthlyVehicle(id) {
  if (confirm("คุณแน่ใจว่าต้องการลบสิทธิ์สมาชิกรายเดือนคันนี้ใช่หรือไม่?")) {
    let deletedOnBackend = false;
    try {
      const payload = {
        id: Number(id),
        adminUsername: session ? session.username : 'System'
      };
      const response = await fetch(`${API_BASE}/api/carpark/monthly/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const resData = await response.json();
        if (resData && resData.success) {
          deletedOnBackend = true;
          await syncAllDataWithBackend();
        } else if (resData && resData.error) {
          alert("ข้อผิดพลาดจากเซิร์ฟเวอร์: " + resData.error);
          return;
        }
      }
    } catch (error) {
      console.warn("Could not delete monthly vehicle from central backend, falling back to local storage:", error);
    }

    if (!deletedOnBackend) {
      monthlyVehicles = monthlyVehicles.filter(m => m.id !== id);
      localStorage.setItem('trrp_db_monthly', JSON.stringify(monthlyVehicles));
    }
    renderMonthlyTable();
  }
}

function resetMonthlyForm() {
  document.getElementById('monthlyId').value = '';
  document.getElementById('monPlate').value = '';
  document.getElementById('monOwner').value = '';
  document.getElementById('monCompany').value = '';
  document.getElementById('monExpMonth').value = '';
  document.getElementById('monIsExecutive').checked = false;

  document.getElementById('monthlyFormTitle').textContent = '💳 เพิ่มสมาชิกรายเดือนใหม่ (Register Monthly Pass)';
  document.getElementById('btnCancelMonEdit').style.display = 'none';
}

// ==========================================
// 👥 SCREEN 5: USER MANAGEMENT CRUD
// ==========================================
function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = '';

  users.forEach(u => {
    const tr = document.createElement('tr');
    
    // Mask password
    const passDisplay = `<span class="pin-masked" title="ชี้เพื่อดูรหัสผ่าน" style="cursor:help;">****</span>`;

    const isSelf = u.username.toLowerCase() === session.username.toLowerCase();
    const isAdmin = u.role === 'admin';
    
    let roleText = 'พนักงาน';
    if (isAdmin) {
      roleText = 'แอดมิน';
    } else if (u.role === 'Validator') {
      const maxHours = u.max_exemptedHours !== undefined && u.max_exemptedHours !== null ? u.max_exemptedHours : 72;
      roleText = `ผู้บันทึกสิทธิ์ (${u.company || '-'} / Max: ${maxHours} ชม.)`;
    }
    
    // Disable delete on self or on the last admin
    const canDelete = !isSelf && !(isAdmin && users.filter(usr => usr.role === 'admin').length === 1);
    
    const deleteButton = canDelete
      ? `<button class="btn-action-checkout" onclick="deleteUserAccount(${u.id})">ลบ</button>`
      : `<button class="btn-action-checkout" disabled style="opacity:0.3; cursor:not-allowed;">ลบ</button>`;

    const pinVal = u.pass || u.pin || '****';

    tr.innerHTML = `
      <td><strong>${u.username}</strong> ${isSelf ? '(ตัวเอง)' : ''}</td>
      <td><span class="role-badge ${u.role}">${roleText}</span></td>
      <td onmouseenter="this.querySelector('.pin-masked').textContent='${pinVal}'"
          onmouseleave="this.querySelector('.pin-masked').textContent='****'">
        ${passDisplay}
      </td>
      <td style="text-align: center;">
        <button class="btn-action-edit" onclick="editUserAccount(${u.id})">แก้ไข</button>
        ${deleteButton}
      </td>
    `;
    tbody.appendChild(tr);
  });

}

async function saveUserAccount() {
  const id = document.getElementById('userId').value;
  const username = document.getElementById('usrUsername').value.trim();
  const role = document.getElementById('usrRole').value;
  const pass = document.getElementById('usrPassword').value.trim(); // Trim password to prevent whitespace-related login issues
  const company = role === 'Validator' ? document.getElementById('usrCompany').value : null;
  const max_exemptedHours = role === 'Validator' ? parseInt(document.getElementById('usrMaxExemptHours').value) : null;

  if (!username || !role || !pass) {
    alert("กรุณากรอกข้อมูลที่สำคัญให้ครบถ้วน!");
    return;
  }

  if (role === 'Validator' && !company) {
    alert("กรุณาเลือกบริษัทผู้เช่าสำหรับบทบาทผู้บันทึกสิทธิ์!");
    return;
  }

  if (role === 'Validator') {
    if (isNaN(max_exemptedHours) || max_exemptedHours < 1 || max_exemptedHours > 72) {
      alert("กรุณาระบุจำนวนชั่วโมงยกเว้นค่าจอดรถสูงสุดเป็นตัวเลขระหว่าง 1 ถึง 72!");
      return;
    }
  }

  // Find currently logged-in user ID before editing/saving
  let loggedInUserId = null;
  if (session && session.username) {
    const currUser = users.find(u => u.username.toLowerCase() === session.username.toLowerCase());
    if (currUser) loggedInUserId = currUser.id;
  }

  // Try to save to central backend first
  let savedOnBackend = false;
  try {
    const payload = {
      id: id ? Number(id) : undefined,
      username,
      role,
      pin: pass,
      company,
      max_exemptedHours,
      adminUsername: session ? session.username : 'System'
    };
    const response = await fetch(`${API_BASE}/api/carpark/users/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      const resData = await response.json();
      if (resData && resData.success) {
        savedOnBackend = true;
        // Fetch fresh users data to sync
        await syncUsersWithBackend();
      } else if (resData && resData.error) {
        alert("ข้อผิดพลาดจากเซิร์ฟเวอร์: " + resData.error);
        return;
      }
    }
  } catch (error) {
    console.warn("Could not save user to central backend, falling back to local storage:", error);
  }

  if (!savedOnBackend) {
    if (id) {
      // Edit User
      const idx = users.findIndex(u => u.id === parseInt(id));
      if (idx !== -1) {
        users[idx] = { id: parseInt(id), username, role, pass, company, max_exemptedHours };
      }
    } else {
      // Add User
      // Check duplicate
      if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        alert("ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว!");
        return;
      }
      const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
      users.push({ id: newId, username, role, pass, company, max_exemptedHours });
    }
    // Save to DB
    localStorage.setItem('trrp_db_users', JSON.stringify(users));
  }
  
  // Refresh and reset
  renderUsersTable();
  resetUserForm();
  
  // Refresh session info in header if self edited
  if (id && parseInt(id) === loggedInUserId) {
    const sessionObj = { username, role };
    localStorage.setItem('trrp_session', JSON.stringify(sessionObj));
    checkSession();
  }
  
  alert("บันทึกข้อมูลผู้ใช้งานระบบเรียบร้อย!");
}

function editUserAccount(id) {
  const u = users.find(usr => usr.id === id);
  if (!u) return;

  document.getElementById('userId').value = u.id;
  document.getElementById('usrUsername').value = u.username;
  document.getElementById('usrRole').value = u.role;
  document.getElementById('usrPassword').value = u.pass;

  // Toggle company selector based on role
  handleUserRoleChange();
  if (u.role === 'Validator') {
    document.getElementById('usrCompany').value = u.company || '';
    document.getElementById('usrMaxExemptHours').value = (u.max_exemptedHours !== undefined && u.max_exemptedHours !== null) ? u.max_exemptedHours : '';
  }

  document.getElementById('userFormTitle').textContent = '✏️ แก้ไขบัญชีผู้ใช้ระบบ';
  document.getElementById('btnCancelUsrEdit').style.display = 'inline-flex';
}

async function deleteUserAccount(id) {
  if (confirm("คุณแน่ใจว่าต้องการลบบัญชีผู้ใช้งานระบบรายนี้ใช่หรือไม่?")) {
    let deletedOnBackend = false;
    try {
      const payload = {
        id: Number(id),
        adminUsername: session ? session.username : 'System'
      };
      const response = await fetch(`${API_BASE}/api/carpark/users/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const resData = await response.json();
        if (resData && resData.success) {
          deletedOnBackend = true;
          await syncUsersWithBackend();
        } else if (resData && resData.error) {
          alert("ข้อผิดพลาดจากเซิร์ฟเวอร์: " + resData.error);
          return;
        }
      }
    } catch (error) {
      console.warn("Could not delete user from central backend, falling back to local storage:", error);
    }

    if (!deletedOnBackend) {
      users = users.filter(u => u.id !== id);
      localStorage.setItem('trrp_db_users', JSON.stringify(users));
    }
    renderUsersTable();
  }
}

function loadUsersFromLocalStorage() {
  const storedUsers = localStorage.getItem('trrp_db_users');
  if (storedUsers) {
    users = JSON.parse(storedUsers);
  } else {
    users = [
      { id: 1, username: 'admin', role: 'admin', pass: '1234' },
      { id: 2, username: 'user1', role: 'user', pass: '1234' }
    ];
    localStorage.setItem('trrp_db_users', JSON.stringify(users));
  }
}

async function syncUsersWithBackend() {
  await syncAllDataWithBackend();
}

function resetUserForm() {
  document.getElementById('userId').value = '';
  document.getElementById('usrUsername').value = '';
  document.getElementById('usrRole').value = 'user';
  document.getElementById('usrPassword').value = '';

  // Reset role selection and hide company field
  handleUserRoleChange();

  document.getElementById('userFormTitle').textContent = '👥 เพิ่มผู้ใช้งานระบบใหม่ (Add User Accounts)';
  document.getElementById('btnCancelUsrEdit').style.display = 'none';
}

// ==========================================
// 📂 IMPORT MONTHLY MEMBERS FROM EXCEL
// ==========================================
async function importMonthlyFromExcel(inputEl) {
  const file = inputEl.files[0];
  if (!file) return;

  const fileNameEl = document.getElementById('monthlyExcelFileName');
  const resultEl = document.getElementById('monthlyImportResult');

  fileNameEl.textContent = file.name;
  resultEl.style.display = 'block';
  resultEl.innerHTML = '<span style="color:var(--text-muted);">⏳ กำลังอ่านไฟล์...</span>';

  // Check XLSX library
  if (typeof XLSX === 'undefined') {
    resultEl.innerHTML = '<span style="color:var(--color-danger);">❌ ไม่พบ Library XLSX กรุณา reload หน้าเว็บ</span>';
    return;
  }

  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Skip header row (row 0), process from row 1
    const dataRows = rows.slice(1).filter(r => r[0] && String(r[0]).trim() !== '');

    if (dataRows.length === 0) {
      resultEl.innerHTML = '<span style="color:var(--color-danger);">❌ ไม่พบข้อมูลในไฟล์ (ตรวจสอบว่า row แรกเป็น header)</span>';
      return;
    }

    // Parse rows: [ทะเบียนรถ, เจ้าของ, กลุ่มบริษัท, สิ้นสุดสัญญา (YYYY-MM), สถานะ]
    const importedVehicles = dataRows.map((r, idx) => ({
      plate: String(r[0] || '').trim(),
      owner: String(r[1] || '').trim(),
      company: String(r[2] || '').trim(),
      expMonth: String(r[3] || '').trim(),
      isExecutive: String(r[4]).trim() === '1' || String(r[4]).trim().toLowerCase() === 'true'
    })).filter(v => v.plate && v.owner && v.company && v.expMonth);

    if (importedVehicles.length === 0) {
      resultEl.innerHTML = '<span style="color:var(--color-danger);">❌ ไม่มีข้อมูลที่ถูกต้อง กรุณาตรวจสอบ format ของไฟล์</span>';
      return;
    }

    // Confirm before replacing all data
    const confirmed = confirm(
      `⚠️ ยืนยันการนำเข้าข้อมูล?\n\n` +
      `พบข้อมูล ${importedVehicles.length} รายการ\n` +
      `ข้อมูลสมาชิกรายเดือนเดิมทั้งหมด (${monthlyVehicles.length} รายการ) จะถูกลบออกก่อนนำเข้าใหม่\n\n` +
      `ดำเนินการต่อหรือไม่?`
    );
    if (!confirmed) {
      resultEl.innerHTML = '<span style="color:var(--text-muted);">ยกเลิกการนำเข้า</span>';
      inputEl.value = '';
      fileNameEl.textContent = 'ยังไม่ได้เลือกไฟล์';
      return;
    }

    resultEl.innerHTML = '<span style="color:var(--text-muted);">⏳ กำลังลบข้อมูลเดิมและนำเข้าใหม่...</span>';

    let successCount = 0;
    let errorCount = 0;
    const adminUser = session ? session.username : 'System';

    // Step 1: Delete all existing monthly vehicles via API
    const existingIds = [...monthlyVehicles.map(m => m.id)];
    for (const id of existingIds) {
      try {
        const delRes = await fetch(`${API_BASE}/api/carpark/monthly/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, adminUsername: adminUser })
        });
        // ignore individual delete errors - best effort
      } catch (e) {}
    }
    // Clear local state
    monthlyVehicles = [];

    // Step 2: Insert all imported vehicles
    for (const v of importedVehicles) {
      try {
        const saveRes = await fetch(`${API_BASE}/api/carpark/monthly/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plate: v.plate,
            owner: v.owner,
            company: v.company,
            expMonth: v.expMonth,
            isExecutive: v.isExecutive,
            adminUsername: adminUser
          })
        });
        if (saveRes.ok) {
          const res = await saveRes.json();
          if (res.success) {
            successCount++;
            if (res.vehicle) monthlyVehicles.push({
              id: res.vehicle.id,
              plate: res.vehicle.plate,
              owner: res.vehicle.owner,
              company: res.vehicle.company,
              expMonth: res.vehicle.expMonth,
              isExecutive: res.vehicle.isExecutive === 1 || res.vehicle.isExecutive === true
            });
          } else {
            errorCount++;
          }
        } else {
          errorCount++;
        }
      } catch (e) {
        errorCount++;
      }
    }

    // Save to localStorage
    localStorage.setItem('trrp_db_monthly', JSON.stringify(monthlyVehicles));

    // Sync fresh data
    await syncAllDataWithBackend();
    renderMonthlyTable();

    // Reset file input
    inputEl.value = '';
    fileNameEl.textContent = 'ยังไม่ได้เลือกไฟล์';

    const statusColor = errorCount === 0 ? 'var(--color-success, #10b981)' : '#f59e0b';
    resultEl.innerHTML = `<span style="color:${statusColor};">
      ✅ นำเข้าสำเร็จ ${successCount} รายการ${errorCount > 0 ? ` | ⚠️ ล้มเหลว ${errorCount} รายการ` : ''}
    </span>`;

  } catch (err) {
    console.error('Import Excel error:', err);
    resultEl.innerHTML = `<span style="color:var(--color-danger);">❌ เกิดข้อผิดพลาด: ${err.message}</span>`;
  }
}

// ==========================================
// 🏢 SCREEN 6: TENANT COMPANIES CRUD
// ==========================================
function renderCompaniesTable() {
  const tbody = document.getElementById('companiesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (tenantCompanies.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state">ไม่มีข้อมูลบริษัทผู้เช่า</td></tr>`;
    return;
  }

  tenantCompanies.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${c.code}</strong></td>
      <td>${c.name}</td>
      <td style="text-align: center; white-space: nowrap;">
        <button class="btn-action-edit" onclick="editCompany(${c.id})">แก้ไข</button>
        <button class="btn-action-checkout" onclick="deleteCompany(${c.id})">ลบ</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function saveCompany() {
  const id = document.getElementById('companyId').value;
  const code = document.getElementById('compCode').value.trim();
  const name = document.getElementById('compName').value.trim();

  if (!code || !name) {
    alert("กรุณากรอกข้อมูลรหัสบริษัทและชื่อบริษัท!");
    return;
  }

  // Try to save to central backend first
  let savedOnBackend = false;
  try {
    const payload = {
      id: id ? Number(id) : undefined,
      code,
      name,
      adminUsername: session ? session.username : 'System'
    };
    const response = await fetch(`${API_BASE}/api/carpark/companies/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      const resData = await response.json();
      if (resData && resData.success) {
        savedOnBackend = true;
        await syncAllDataWithBackend();
      } else if (resData && resData.error) {
        alert("ข้อผิดพลาดจากเซิร์ฟเวอร์: " + resData.error);
        return;
      }
    }
  } catch (error) {
    console.warn("Could not save company to central backend, falling back to local storage:", error);
  }

  if (!savedOnBackend) {
    if (id) {
      const idx = tenantCompanies.findIndex(c => c.id === parseInt(id));
      if (idx !== -1) {
        tenantCompanies[idx] = { id: parseInt(id), code, name };
      }
    } else {
      if (tenantCompanies.some(c => c.code.toLowerCase() === code.toLowerCase())) {
        alert("รหัสบริษัทนี้มีอยู่ในระบบแล้ว!");
        return;
      }
      const newId = tenantCompanies.length > 0 ? Math.max(...tenantCompanies.map(c => c.id)) + 1 : 1;
      tenantCompanies.push({ id: newId, code, name });
    }
    localStorage.setItem('trrp_db_companies', JSON.stringify(tenantCompanies));
    populateCompanyDropdowns();
  }

  renderCompaniesTable();
  resetCompanyForm();
  alert("บันทึกข้อมูลบริษัทผู้เช่าเรียบร้อย!");
}

function editCompany(id) {
  const c = tenantCompanies.find(comp => comp.id === id);
  if (!c) return;

  document.getElementById('companyId').value = c.id;
  document.getElementById('compCode').value = c.code;
  document.getElementById('compName').value = c.name;

  document.getElementById('companyFormTitle').textContent = '✏️ แก้ไขข้อมูลบริษัทผู้เช่า';
  document.getElementById('btnCancelCompEdit').style.display = 'inline-flex';
}

async function deleteCompany(id) {
  const c = tenantCompanies.find(comp => comp.id === id);
  if (!c) return;

  if (confirm(`คุณแน่ใจว่าต้องการลบบริษัทผู้เช่า "${c.name}" หรือไม่?`)) {
    let deletedOnBackend = false;
    try {
      const payload = {
        id: Number(id),
        adminUsername: session ? session.username : 'System'
      };
      const response = await fetch(`${API_BASE}/api/carpark/companies/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const resData = await response.json();
        if (resData && resData.success) {
          deletedOnBackend = true;
          await syncAllDataWithBackend();
        } else if (resData && resData.error) {
          alert("ข้อผิดพลาดจากเซิร์ฟเวอร์: " + resData.error);
          return;
        }
      }
    } catch (error) {
      console.warn("Could not delete company from central backend, falling back to local storage:", error);
    }

    if (!deletedOnBackend) {
      tenantCompanies = tenantCompanies.filter(comp => comp.id !== id);
      localStorage.setItem('trrp_db_companies', JSON.stringify(tenantCompanies));
      populateCompanyDropdowns();
    }
    renderCompaniesTable();
  }
}

function resetCompanyForm() {
  document.getElementById('companyId').value = '';
  document.getElementById('compCode').value = '';
  document.getElementById('compName').value = '';

  document.getElementById('companyFormTitle').textContent = '🏢 เพิ่มบริษัทผู้เช่าใหม่ (Add Tenant Company)';
  document.getElementById('btnCancelCompEdit').style.display = 'none';
}


// ==========================================
// 🎟️ SCREEN 7: RECORD PARKING EXEMPTION
// ==========================================
let activeExemptLog = null;

function handleExemptPlateSearchInput() {
  const input = document.getElementById('exemptSearchPlate').value.trim().toLowerCase();
  const dropdown = document.getElementById('exemptAutocompleteList');
  if (!dropdown) return;
  dropdown.innerHTML = '';
  
  if (input.length === 0) {
    dropdown.style.display = 'none';
    return;
  }

  // Filter active parked vehicles matching input plate partially, and check they are NOT monthly vehicles
  const activeParked = logs.filter(l => 
    l.status === 'parked' && 
    l.plate.toLowerCase().includes(input) &&
    !monthlyVehicles.some(mv => mv.plate.toLowerCase() === l.plate.toLowerCase())
  );
  
  if (activeParked.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'autocomplete-item';
    emptyDiv.style.color = 'var(--text-muted)';
    emptyDiv.style.cursor = 'default';
    emptyDiv.textContent = 'ไม่พบทะเบียนรถผู้มาติดต่อที่จอดในขณะนี้';
    dropdown.appendChild(emptyDiv);
  } else {
    activeParked.forEach(log => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML = `
        <span><strong>${log.plate}</strong></span>
        <span class="autocomplete-meta">จอดสะสม: ${calculateDurationString(log.timeIn)}</span>
      `;
      
      item.addEventListener('click', () => {
        document.getElementById('exemptSearchPlate').value = log.plate;
        dropdown.style.display = 'none';
        selectExemptVehicle(log);
      });
      
      dropdown.appendChild(item);
    });
  }
  
  dropdown.style.display = 'block';
}

function selectExemptVehicle(log) {
  activeExemptLog = log;
  
  document.getElementById('exemptPlateDisplay').textContent = log.plate;
  document.getElementById('exemptTimeInDisplay').textContent = new Date(log.timeIn).toLocaleString('th-TH');
  document.getElementById('exemptDurationDisplay').textContent = calculateDurationString(log.timeIn);
  
  // Populate existing exempted hours if any
  document.getElementById('exemptHoursInput').value = log.exemptedHours || '';
  
  document.getElementById('exemptDetailsBox').style.display = 'block';
  document.getElementById('exemptPlaceholder').style.display = 'none';
}

function resetExemptScreen() {
  activeExemptLog = null;
  const searchInput = document.getElementById('exemptSearchPlate');
  if (searchInput) searchInput.value = '';
  const hoursInput = document.getElementById('exemptHoursInput');
  if (hoursInput) hoursInput.value = '';
  const detailsBox = document.getElementById('exemptDetailsBox');
  if (detailsBox) detailsBox.style.display = 'none';
  const placeholder = document.getElementById('exemptPlaceholder');
  if (placeholder) placeholder.style.display = 'flex';
}

async function submitExemption() {
  if (!activeExemptLog) return;
  
  const hoursVal = parseInt(document.getElementById('exemptHoursInput').value);
  if (isNaN(hoursVal) || hoursVal < 1 || hoursVal > 99) {
    alert("กรุณาระบุจำนวนชั่วโมงที่ยกเว้นเป็นตัวเลขระหว่าง 1 ถึง 99!");
    return;
  }

  const currentUser = users.find(u => u.username.toLowerCase() === session.username.toLowerCase());
  const maxAllowed = (currentUser && currentUser.max_exemptedHours !== undefined && currentUser.max_exemptedHours !== null)
    ? currentUser.max_exemptedHours
    : 72;

  if (hoursVal > maxAllowed) {
    alert("คุณไม่สามารถยกเว้นค่าจอดรถเกินกว่าที่กำหนดไว้ได้ (สูงสุด " + maxAllowed + " ชั่วโมง)!");
    return;
  }

  const exemptedCompany = currentUser ? currentUser.company || '' : '';
  const exemptedBy = session.username;
  const exemptedAt = new Date().toISOString();

  // Try to save to central backend first
  let savedOnBackend = false;
  try {
    const payload = {
      id: activeExemptLog.id,
      plate: activeExemptLog.plate,
      timeIn: activeExemptLog.timeIn,
      status: activeExemptLog.status, // 'parked'
      createdBy: activeExemptLog.createdBy,
      updatedBy: exemptedBy,
      exemptedHours: hoursVal,
      exemptedCompany: exemptedCompany,
      exemptedBy: exemptedBy,
      exemptedAt: exemptedAt
    };
    
    const response = await fetch(`${API_BASE}/api/carpark/parking/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      const resData = await response.json();
      if (resData && resData.success) {
        savedOnBackend = true;
        await syncAllDataWithBackend();
      } else if (resData && resData.error) {
        alert("ข้อผิดพลาดจากเซิร์ฟเวอร์: " + resData.error);
        return;
      }
    }
  } catch (error) {
    console.warn("Could not save exemption to central backend, falling back to local storage:", error);
  }

  if (!savedOnBackend) {
    const logIndex = logs.findIndex(l => l.id === activeExemptLog.id);
    if (logIndex !== -1) {
      logs[logIndex].exemptedHours = hoursVal;
      logs[logIndex].exemptedCompany = exemptedCompany;
      logs[logIndex].exemptedBy = exemptedBy;
      logs[logIndex].exemptedAt = exemptedAt;
      logs[logIndex].updatedBy = exemptedBy;
      logs[logIndex].updatedAt = new Date().toISOString();
      
      localStorage.setItem('trrp_db_logs', JSON.stringify(logs));
    }
  }

  alert(`บันทึกการยกเว้นค่าจอดรถสำเร็จ! ทะเบียน: ${activeExemptLog.plate} จำนวน: ${hoursVal} ชั่วโมง`);
  resetExemptScreen();
  
  if (session.role === 'admin') {
    switchMainScreen('dashboard');
  } else {
    switchMainScreen('exempt');
  }
}

function calculateDurationString(timeInISO) {
  const diffMs = new Date() - new Date(timeInISO);
  const diffMins = Math.max(0, Math.floor(diffMs / (60 * 1000)));
  const hrs = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hrs}:${String(mins).padStart(2, '0')} ชม.`;
}

