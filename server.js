import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { readCarparkDB, writeCarparkDB, logCarparkAction, bumpCarparkSyncVersion } from './db.js';

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// TRRP Carpark APIs
app.get('/api/carpark/data', (req, res) => {
  const db = readCarparkDB();
  res.json(db);
});

// Expose AD verification proxy endpoint
app.post('/api/carpark/auth/verify-ad', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ status: "Error", error: "กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน AD" });
  }

  try {
    const response = await fetch('https://trr-api.trrgroup.com/api_sys_auth/sysauth/Sys_auth_emp_profile_Get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        auth_admin_profileModel: {
          domain_id: "|TRRGROUP.COM|,|TRR.TRRGROUP.COM|,|BSI.TRRGROUP.COM|,|TMI.TRRGROUP.COM|,|TRRSK.TRRGROUP.COM|,|SK.TRRGROUP.COM|,|PS.TRRGROUP.COM|,|CST.TRRGROUP.COM|,"
        },
        ParamGetMode: "CHECKAD"
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Error proxying AD verification:", err);
    res.status(500).json({ status: "Error", error: "ไม่สามารถเชื่อมต่อระบบตรวจสอบสิทธิ์ AD ได้: " + err.message });
  }
});

// Added for compatibility with cached legacy clients
app.post('/api/carpark/login', async (req, res) => {
  const { username, pin } = req.body;
  if (!username || !pin) {
    return res.status(400).json({ error: "กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน" });
  }

  const db = readCarparkDB();
  const lowerUsername = username.trim().toLowerCase();
  const matchedUser = db.users.find(u =>
    String(u.username).trim().toLowerCase() === lowerUsername
  );

  if (!matchedUser) {
    return res.status(401).json({ error: "ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง" });
  }

  if (matchedUser.adUser === 'Y') {
    // Authenticate via external TRR AD API
    try {
      const response = await fetch('https://trr-api.trrgroup.com/api_sys_auth/sysauth/Sys_auth_emp_profile_Get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password: pin,
          auth_admin_profileModel: {
            domain_id: "|TRRGROUP.COM|,|TRR.TRRGROUP.COM|,|BSI.TRRGROUP.COM|,|TMI.TRRGROUP.COM|,|TRRSK.TRRGROUP.COM|,|SK.TRRGROUP.COM|,|PS.TRRGROUP.COM|,|CST.TRRGROUP.COM|,"
          },
          ParamGetMode: "CHECKAD"
        })
      });
      const data = await response.json();
      if (data && data.status === 'Success') {
        const empUrl = data.employee_url || (data.data ? data.data.employee_url : null);
        res.json({
          success: true,
          user: {
            username: matchedUser.username,
            role: matchedUser.role,
            employeeUrl: empUrl
          }
        });
      } else {
        const errMsg = (data && data.error) ? data.error : "การตรวจสอบสิทธิ์ AD ล้มเหลว";
        res.status(401).json({ error: errMsg });
      }
    } catch (err) {
      res.status(500).json({ error: "ไม่สามารถเชื่อมต่อระบบตรวจสอบสิทธิ์ AD ได้: " + err.message });
    }
  } else {
    // Normal user check
    const pinVal = String(matchedUser.pin || matchedUser.pass || '1234').trim();
    if (String(pin).trim() === pinVal) {
      res.json({
        success: true,
        user: {
          username: matchedUser.username,
          role: matchedUser.role
        }
      });
    } else {
      res.status(401).json({ error: "ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง" });
    }
  }
});

app.post('/api/carpark/users/save', (req, res) => {
  const { id, username, role, pin, company, max_exemptedHours, adUser, adminUsername } = req.body;
  if (!username || !role || !adminUsername) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const db = readCarparkDB();
  
  // Check if username already exists for other users
  const lowercaseUsername = username.trim().toLowerCase();
  const duplicate = db.users.find(u => u.username.toLowerCase() === lowercaseUsername && u.id !== Number(id));
  if (duplicate) {
    return res.status(400).json({ error: "ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว" });
  }

  if (adUser !== 'Y' && (!pin || String(pin).trim() === "")) {
    return res.status(400).json({ error: "กรุณาระบุรหัสผ่าน" });
  }

  const pinVal = adUser === 'Y' ? null : String(pin).trim();
  let user;
  let actionText = "";

  const maxExemptVal = (role === 'Validator' || role === 'BuildingAdmin') ? (max_exemptedHours !== undefined && max_exemptedHours !== null ? Number(max_exemptedHours) : null) : null;

  if (id) {
    // Edit User
    const userIndex = db.users.findIndex(u => u.id === Number(id));
    if (userIndex === -1) {
      return res.status(404).json({ error: "ไม่พบผู้ใช้งานนี้" });
    }
    user = db.users[userIndex];
    user.username = username.trim();
    user.role = role;
    user.pin = pinVal;
    user.adUser = adUser || 'N';
    user.company = company || null;
    user.max_exemptedHours = maxExemptVal;
    
    db.users[userIndex] = user;
    actionText = `แก้ไขข้อมูลผู้ใช้งาน: ${username} (Role: ${role}, AD: ${user.adUser})`;
  } else {
    // Add User
    const newId = db.users.length > 0 ? Math.max(...db.users.map(u => u.id)) + 1 : 1;
    user = {
      id: newId,
      username: username.trim(),
      role: role,
      pin: pinVal,
      adUser: adUser || 'N',
      company: company || null,
      max_exemptedHours: maxExemptVal
    };
    
    db.users.push(user);
    actionText = `เพิ่มผู้ใช้งานใหม่: ${username} (Role: ${role}, AD: ${user.adUser})`;
  }

  const log = logCarparkAction(adminUsername, actionText);
  bumpCarparkSyncVersion();
  writeCarparkDB(db);

  res.json({ success: true, user, log });
});

app.post('/api/carpark/users/delete', (req, res) => {
  const { id, adminUsername } = req.body;
  if (!id || !adminUsername) {
    return res.status(400).json({ error: "Missing id or adminUsername" });
  }

  const db = readCarparkDB();
  const userIndex = db.users.findIndex(u => u.id === Number(id));
  if (userIndex === -1) {
    return res.status(404).json({ error: "ไม่พบผู้ใช้งานนี้" });
  }

  const deletedUser = db.users[userIndex];
  
  // Prevent deleting the last admin
  if (deletedUser.role === 'admin') {
    const adminCount = db.users.filter(u => u.role === 'admin').length;
    if (adminCount <= 1) {
      return res.status(400).json({ error: "ไม่สามารถลบ Admin คนสุดท้ายของระบบได้" });
    }
  }

  db.users.splice(userIndex, 1);
  
  const log = logCarparkAction(adminUsername, `ลบผู้ใช้งาน: ${deletedUser.username}`);
  bumpCarparkSyncVersion();
  writeCarparkDB(db);

  res.json({ success: true, log });
});

// Company save & delete endpoints
app.post('/api/carpark/companies/save', (req, res) => {
  const { id, code, name, adminUsername } = req.body;
  if (!code || !name || !adminUsername) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const db = readCarparkDB();
  
  // Check duplicate code
  const duplicate = db.tenantCompanies.find(c => c.code.toLowerCase() === code.trim().toLowerCase() && c.id !== Number(id));
  if (duplicate) {
    return res.status(400).json({ error: "รหัสบริษัทนี้มีอยู่ในระบบแล้ว" });
  }

  let company;
  let actionText = "";

  if (id) {
    const idx = db.tenantCompanies.findIndex(c => c.id === Number(id));
    if (idx === -1) {
      return res.status(404).json({ error: "ไม่พบข้อมูลบริษัทนี้" });
    }
    company = db.tenantCompanies[idx];
    company.code = code.trim();
    company.name = name.trim();
    actionText = `แก้ไขข้อมูลบริษัทผู้เช่า: ${name} (Code: ${code})`;
  } else {
    const newId = db.tenantCompanies.length > 0 ? Math.max(...db.tenantCompanies.map(c => c.id)) + 1 : 1;
    company = {
      id: newId,
      code: code.trim(),
      name: name.trim()
    };
    db.tenantCompanies.push(company);
    actionText = `เพิ่มบริษัทผู้เช่าใหม่: ${name} (Code: ${code})`;
  }

  const log = logCarparkAction(adminUsername, actionText);
  bumpCarparkSyncVersion();
  writeCarparkDB(db);

  res.json({ success: true, company, log });
});

app.post('/api/carpark/companies/delete', (req, res) => {
  const { id, adminUsername } = req.body;
  if (!id || !adminUsername) {
    return res.status(400).json({ error: "Missing id or adminUsername" });
  }

  const db = readCarparkDB();
  const idx = db.tenantCompanies.findIndex(c => c.id === Number(id));
  if (idx === -1) {
    return res.status(404).json({ error: "ไม่พบข้อมูลบริษัทนี้" });
  }

  const deleted = db.tenantCompanies[idx];
  db.tenantCompanies.splice(idx, 1);

  const log = logCarparkAction(adminUsername, `ลบบริษัทผู้เช่า: ${deleted.name} (${deleted.code})`);
  bumpCarparkSyncVersion();
  writeCarparkDB(db);

  res.json({ success: true, log });
});

app.post('/api/carpark/monthly/save', (req, res) => {
  const { id, plate, owner, company, expMonth, isExecutive, adminUsername } = req.body;
  if (!plate || !owner || !company || !expMonth || adminUsername === undefined) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const db = readCarparkDB();
  const duplicate = db.monthlyVehicles.find(mv => mv.plate.toLowerCase() === plate.trim().toLowerCase() && mv.id !== Number(id));
  if (duplicate) {
    return res.status(400).json({ error: "ทะเบียนรถนี้ได้รับการลงทะเบียนรายเดือนไว้ในระบบแล้ว" });
  }

  let vehicle;
  let actionText = "";

  if (id) {
    const idx = db.monthlyVehicles.findIndex(mv => mv.id === Number(id));
    if (idx === -1) {
      return res.status(404).json({ error: "ไม่พบข้อมูลสมาชิกรายเดือนนี้" });
    }
    vehicle = db.monthlyVehicles[idx];
    vehicle.plate = plate.trim();
    vehicle.owner = owner.trim();
    vehicle.company = company.trim();
    vehicle.expMonth = expMonth;
    vehicle.isExecutive = !!isExecutive;
    
    db.monthlyVehicles[idx] = vehicle;
    actionText = `แก้ไขข้อมูลสิทธิ์สมาชิกรายเดือน: ${plate} (เจ้าของ: ${owner})`;
  } else {
    const newId = db.monthlyVehicles.length > 0 ? Math.max(...db.monthlyVehicles.map(m => m.id)) + 1 : 1;
    vehicle = {
      id: newId,
      plate: plate.trim(),
      owner: owner.trim(),
      company: company.trim(),
      expMonth,
      isExecutive: !!isExecutive
    };
    db.monthlyVehicles.push(vehicle);
    actionText = `ลงทะเบียนสมาชิกรายเดือนใหม่: ${plate} (เจ้าของ: ${owner})`;
  }

  const log = logCarparkAction(adminUsername, actionText);
  bumpCarparkSyncVersion();
  writeCarparkDB(db);

  res.json({ success: true, vehicle, log });
});

app.post('/api/carpark/monthly/delete', (req, res) => {
  const { id, adminUsername } = req.body;
  if (!id || adminUsername === undefined) {
    return res.status(400).json({ error: "Missing id or adminUsername" });
  }

  const db = readCarparkDB();
  const idx = db.monthlyVehicles.findIndex(mv => mv.id === Number(id));
  if (idx === -1) {
    return res.status(404).json({ error: "ไม่พบข้อมูลสมาชิกรายเดือนนี้" });
  }

  const deleted = db.monthlyVehicles[idx];
  db.monthlyVehicles.splice(idx, 1);

  const log = logCarparkAction(adminUsername, `ลบสิทธิ์สมาชิกรายเดือน: ${deleted.plate} (เจ้าของ: ${deleted.owner})`);
  bumpCarparkSyncVersion();
  writeCarparkDB(db);

  res.json({ success: true, log });
});

app.post('/api/carpark/parking/save', (req, res) => {
  const { id, plate, timeIn, timeOut, createdBy, updatedBy, status, amount, coupons, exemptedHours, exemptedCompany, exemptedBy, exemptedAt } = req.body;
  if (!plate || !timeIn || !status || createdBy === undefined) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const db = readCarparkDB();

  // Validate duplicate plate for parked vehicles
  if (status === 'parked') {
    const lowercasePlate = plate.trim().toLowerCase();
    const duplicate = db.parkingLogs.find(l => 
      l.status === 'parked' && 
      l.plate.trim().toLowerCase() === lowercasePlate && 
      (!id || l.id !== Number(id))
    );
    if (duplicate) {
      return res.status(400).json({ error: `ทะเบียนรถ "${plate.trim()}" มีอยู่ในระบบและยังไม่ได้บันทึกออก` });
    }
  }

  let logRecord;
  let actionText = "";

  if (id) {
    const idx = db.parkingLogs.findIndex(l => l.id === Number(id));
    if (idx === -1) {
      return res.status(404).json({ error: "ไม่พบข้อมูลรายการจอดรถนี้" });
    }
    logRecord = db.parkingLogs[idx];
    logRecord.plate = plate.trim();
    logRecord.timeIn = timeIn;
    logRecord.timeOut = timeOut || null;
    logRecord.status = status;
    logRecord.amount = Number(amount || 0);
    logRecord.coupons = Number(coupons || 0);
    if (exemptedHours !== undefined) logRecord.exemptedHours = exemptedHours;
    if (exemptedCompany !== undefined) logRecord.exemptedCompany = exemptedCompany;
    if (exemptedBy !== undefined) logRecord.exemptedBy = exemptedBy;
    if (exemptedAt !== undefined) logRecord.exemptedAt = exemptedAt;
    if (updatedBy) {
      logRecord.updatedBy = updatedBy;
      logRecord.updatedAt = new Date().toISOString();
    }
    
    db.parkingLogs[idx] = logRecord;
    actionText = status === 'checked_out'
      ? `บันทึกรถออก: ${plate} (ยอดชำระ: ฿${amount})`
      : `แก้ไขประวัติจอดรถ: ${plate}`;
  } else {
    const newId = db.parkingLogs.length > 0 ? Math.max(...db.parkingLogs.map(l => l.id)) + 1 : 10001;
    logRecord = {
      id: newId,
      plate: plate.trim(),
      timeIn,
      timeOut: timeOut || null,
      createdBy,
      createdAt: new Date().toISOString(),
      updatedBy: null,
      updatedAt: null,
      status,
      amount: Number(amount || 0),
      coupons: Number(coupons || 0),
      exemptedHours: exemptedHours !== undefined ? exemptedHours : null,
      exemptedCompany: exemptedCompany !== undefined ? exemptedCompany : null,
      exemptedBy: exemptedBy !== undefined ? exemptedBy : null,
      exemptedAt: exemptedAt !== undefined ? exemptedAt : null
    };
    db.parkingLogs.push(logRecord);
    actionText = `บันทึกรถเข้า: ${plate}`;
  }

  const log = logCarparkAction(updatedBy || createdBy, actionText);
  bumpCarparkSyncVersion();
  writeCarparkDB(db);

  res.json({ success: true, logRecord, log });
});

app.post('/api/carpark/parking/delete', (req, res) => {
  const { id, adminUsername } = req.body;
  if (!id || adminUsername === undefined) {
    return res.status(400).json({ error: "Missing id or adminUsername" });
  }

  const db = readCarparkDB();
  const idx = db.parkingLogs.findIndex(l => l.id === Number(id));
  if (idx === -1) {
    return res.status(404).json({ error: "ไม่พบข้อมูลรายการจอดรถนี้" });
  }

  const deleted = db.parkingLogs[idx];
  db.parkingLogs.splice(idx, 1);

  const log = logCarparkAction(adminUsername, `ลบรายการจอดรถ: ${deleted.plate}`);
  bumpCarparkSyncVersion();
  writeCarparkDB(db);

  res.json({ success: true, log });
});

// Redirect all root requests to index.html
app.get('/', (req, res) => {
  res.sendFile(path.resolve('public', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TRRP Car Park Server running at http://localhost:${PORT}`);
  console.log(`For mobile devices, connect to http://[YOUR-LOCAL-IP]:${PORT}`);
});
