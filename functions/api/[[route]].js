export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Set up response helper to avoid CORS / standard errors
  const resJson = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      }
    });
  };

  // Handle Options preflight requests
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      }
    });
  }

  try {
    // Safety check for D1 Database binding configuration
    if (!env || !env.DB) {
      return resJson({
        error: "Cloudflare D1 Database binding 'DB' is missing or not configured. If running locally, please ensure you execute wrangler with: 'npx wrangler pages dev public --d1=DB'"
      }, 500);
    }

    // Self-healing database migration checks
    try {
      // 1. Table: tenant_companies
      await env.DB.prepare("SELECT id FROM tenant_companies LIMIT 1").all();
    } catch (e) {
      try {
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS tenant_companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL
          )
        `).run();
        await env.DB.prepare("INSERT OR IGNORE INTO tenant_companies (id, code, name) VALUES (1, 'ADV', 'กลุ่มบริษัท แอดวานซ์')").run();
        await env.DB.prepare("INSERT OR IGNORE INTO tenant_companies (id, code, name) VALUES (2, 'BLD', 'กลุ่มบริษัท บิลเดอร์')").run();
      } catch (err) {
        console.error("Migration error tenant_companies:", err);
      }
    }

    try {
      // 2. Column: company in users
      await env.DB.prepare("SELECT company FROM users LIMIT 1").all();
    } catch (e) {
      try {
        await env.DB.prepare("ALTER TABLE users ADD COLUMN company TEXT DEFAULT NULL").run();
      } catch (err) {
        console.error("Migration error users company:", err);
      }
    }

    try {
      // 2.1 Column: max_exemptedHours in users
      await env.DB.prepare("SELECT max_exemptedHours FROM users LIMIT 1").all();
    } catch (e) {
      try {
        await env.DB.prepare("ALTER TABLE users ADD COLUMN max_exemptedHours INTEGER DEFAULT NULL").run();
      } catch (err) {
        console.error("Migration error users max_exemptedHours:", err);
      }
    }

    try {
      // 2.2 Column: adUser in users
      await env.DB.prepare("SELECT adUser FROM users LIMIT 1").all();
    } catch (e) {
      try {
        await env.DB.prepare("ALTER TABLE users ADD COLUMN adUser TEXT DEFAULT 'N'").run();
      } catch (err) {
        console.error("Migration error users adUser:", err);
      }
    }

    try {
      // 3. Columns: exemptedHours, exemptedCompany, exemptedBy, exemptedAt in parking_logs
      await env.DB.prepare("SELECT exemptedHours FROM parking_logs LIMIT 1").all();
    } catch (e) {
      try {
        await env.DB.prepare("ALTER TABLE parking_logs ADD COLUMN exemptedHours INTEGER DEFAULT NULL").run();
        await env.DB.prepare("ALTER TABLE parking_logs ADD COLUMN exemptedCompany TEXT DEFAULT NULL").run();
        await env.DB.prepare("ALTER TABLE parking_logs ADD COLUMN exemptedBy TEXT DEFAULT NULL").run();
      } catch (err) {
        console.error("Migration error parking_logs exemption:", err);
      }
    }

    try {
      // 4. Column: transferAmount in parking_logs
      await env.DB.prepare("SELECT transferAmount FROM parking_logs LIMIT 1").all();
    } catch (e) {
      try {
        await env.DB.prepare("ALTER TABLE parking_logs ADD COLUMN transferAmount INTEGER DEFAULT 0").run();
      } catch (err) {
        console.error("Migration error parking_logs transferAmount:", err);
      }
    }

    // ----------------------------------------------------
    // TRRP Carpark Endpoints
    // ----------------------------------------------------

    // GET /api/carpark/data
    if (path === "/api/carpark/data" && method === "GET") {
      // 1. Fetch Users
      const usersRes = await env.DB.prepare("SELECT * FROM users ORDER BY id ASC").all();
      const users = usersRes.results.map(u => ({
        ...u,
        id: Number(u.id)
      }));
      
      // 2. Fetch Settings
      const settingsRes = await env.DB.prepare("SELECT * FROM settings").all();
      const settings = {};
      settingsRes.results.forEach(s => {
        if (s.key === "syncVersion") settings.syncVersion = Number(s.value);
        if (s.key === "totalParkingSpaces") settings.totalParkingSpaces = Number(s.value);
      });

      // 3. Fetch Logs
      const logsRes = await env.DB.prepare("SELECT * FROM logs ORDER BY id DESC LIMIT 100").all();
      const logs = logsRes.results.map(l => ({
        ...l,
        id: Number(l.id)
      }));

      // 4. Fetch Monthly Vehicles
      const monthlyRes = await env.DB.prepare("SELECT * FROM monthly_vehicles ORDER BY id ASC").all();
      const monthlyVehicles = monthlyRes.results.map(m => ({
        ...m,
        id: Number(m.id),
        isExecutive: m.isExecutive === 1 || m.isExecutive === true
      }));

      // 5. Fetch Parking Logs
      const parkingRes = await env.DB.prepare("SELECT * FROM parking_logs ORDER BY id ASC").all();
      const parkingLogs = parkingRes.results.map(l => ({
        ...l,
        id: Number(l.id),
        amount: Number(l.amount || 0),
        transferAmount: Number(l.transferAmount || 0),
        coupons: Number(l.coupons || 0),
        exemptedHours: l.exemptedHours !== null && l.exemptedHours !== undefined ? Number(l.exemptedHours) : null
      }));

      // 6. Fetch Tenant Companies
      const companiesRes = await env.DB.prepare("SELECT * FROM tenant_companies ORDER BY id ASC").all();
      const tenantCompanies = companiesRes.results.map(c => ({
        ...c,
        id: Number(c.id)
      }));

      return resJson({
        users,
        settings,
        logs: logs.reverse(),
        monthlyVehicles,
        parkingLogs,
        tenantCompanies
      });
    }

    // Expose AD verification proxy endpoint
    if (path === "/api/carpark/auth/verify-ad" && method === "POST") {
      const { username, password } = await request.json();
      if (!username || !password) {
        return resJson({ status: "Error", error: "กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน AD" }, 400);
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
        return resJson(data);
      } catch (err) {
        return resJson({ status: "Error", error: "ไม่สามารถเชื่อมต่อระบบตรวจสอบสิทธิ์ AD ได้: " + err.message }, 500);
      }
    }

    // Added for compatibility with cached legacy clients
    if (path === "/api/carpark/login" && method === "POST") {
      const { username, pin } = await request.json();
      if (!username || !pin) {
        return resJson({ error: "กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน" }, 400);
      }

      const matchedUser = await env.DB.prepare(
        "SELECT * FROM users WHERE LOWER(username) = ?"
      ).bind(username.trim().toLowerCase()).first();

      if (!matchedUser) {
        return resJson({ error: "ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง" }, 401);
      }

      if (matchedUser.adUser === 'Y') {
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
            return resJson({
              success: true,
              user: {
                username: matchedUser.username,
                role: matchedUser.role,
                employeeUrl: empUrl
              }
            });
          } else {
            const errMsg = (data && data.error) ? data.error : "การตรวจสอบสิทธิ์ AD ล้มเหลว";
            return resJson({ error: errMsg }, 401);
          }
        } catch (err) {
          return resJson({ error: "ไม่สามารถเชื่อมต่อระบบตรวจสอบสิทธิ์ AD ได้: " + err.message }, 500);
        }
      } else {
        const pinVal = String(matchedUser.pin || matchedUser.pass || '1234').trim();
        if (String(pin).trim() === pinVal) {
          return resJson({
            success: true,
            user: {
              username: matchedUser.username,
              role: matchedUser.role
            }
          });
        } else {
          return resJson({ error: "ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง" }, 401);
        }
      }
    }

    // POST /api/carpark/users/save
    if (path === "/api/carpark/users/save" && method === "POST") {
      const { id, username, role, pin, company, max_exemptedHours, adUser, adminUsername } = await request.json();
      if (!username || !role || !adminUsername) {
        return resJson({ error: "Missing required fields" }, 400);
      }

      if (adUser !== 'Y' && (!pin || String(pin).trim() === "")) {
        return resJson({ error: "กรุณาระบุรหัสผ่าน" }, 400);
      }

      const lowercaseUsername = username.trim().toLowerCase();
      
      // Check duplicate
      const duplicate = await env.DB.prepare(
        "SELECT * FROM users WHERE LOWER(username) = ? AND id != ?"
      ).bind(lowercaseUsername, id ? Number(id) : -1).first();

      if (duplicate) {
        return resJson({ error: "ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว" }, 400);
      }

      let actionText = "";
      let savedUser;
      const pinVal = adUser === 'Y' ? null : String(pin).trim();
      const companyVal = company || null;
      const maxExemptVal = (role === 'Validator' || role === 'BuildingAdmin') ? (max_exemptedHours !== undefined && max_exemptedHours !== null ? Number(max_exemptedHours) : null) : null;
      const adUserVal = adUser || 'N';

      if (id) {
        // Edit User
        const userExists = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(Number(id)).first();
        if (!userExists) {
          return resJson({ error: "ไม่พบผู้ใช้งานนี้" }, 404);
        }

        await env.DB.prepare(
          "UPDATE users SET username = ?, role = ?, pin = ?, company = ?, max_exemptedHours = ?, adUser = ? WHERE id = ?"
        ).bind(username.trim(), role, pinVal, companyVal, maxExemptVal, adUserVal, Number(id)).run();

        savedUser = { id: Number(id), username: username.trim(), role, pin: pinVal, company: companyVal, max_exemptedHours: maxExemptVal, adUser: adUserVal };
        actionText = `แก้ไขข้อมูลผู้ใช้งาน: ${username} (Role: ${role}, AD: ${adUserVal})`;
      } else {
        // Add User
        const insertRes = await env.DB.prepare(
          "INSERT INTO users (username, role, pin, company, max_exemptedHours, adUser) VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
        ).bind(username.trim(), role, pinVal, companyVal, maxExemptVal, adUserVal).first();

        savedUser = {
          ...insertRes,
          id: Number(insertRes.id)
        };
        actionText = `เพิ่มผู้ใช้งานใหม่: ${username} (Role: ${role}, AD: ${adUserVal})`;
      }

      const logTime = new Date().toISOString();
      const logRes = await env.DB.prepare(
        "INSERT INTO logs (username, action, timestamp) VALUES (?, ?, ?) RETURNING *"
      ).bind(adminUsername, actionText, logTime).first();
      const returnLog = logRes ? { ...logRes, id: Number(logRes.id) } : { id: 999, username, action: actionText, timestamp: logTime };

      await bumpCarparkSyncVersionD1(env.DB);
      return resJson({ success: true, user: savedUser, log: returnLog });
    }

    // POST /api/carpark/users/delete
    if (path === "/api/carpark/users/delete" && method === "POST") {
      const { id, adminUsername } = await request.json();
      if (!id || !adminUsername) {
        return resJson({ error: "Missing id or adminUsername" }, 400);
      }

      const deletedUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(Number(id)).first();
      if (!deletedUser) {
        return resJson({ error: "ไม่พบผู้ใช้งานนี้" }, 404);
      }

      // Prevent deleting last admin
      if (deletedUser.role === 'admin') {
        const adminRes = await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").first();
        if (adminRes.count <= 1) {
          return resJson({ error: "ไม่สามารถลบ Admin คนสุดท้ายของระบบได้" }, 400);
        }
      }

      await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(Number(id)).run();

      const logText = `ลบผู้ใช้งาน: ${deletedUser.username}`;
      const logTime = new Date().toISOString();
      const logRes = await env.DB.prepare(
        "INSERT INTO logs (username, action, timestamp) VALUES (?, ?, ?) RETURNING *"
      ).bind(adminUsername, logText, logTime).first();
      const returnLog = logRes ? { ...logRes, id: Number(logRes.id) } : { id: 999, username, action: logText, timestamp: logTime };

      await bumpCarparkSyncVersionD1(env.DB);
      return resJson({ success: true, log: returnLog });
    }

    // POST /api/carpark/companies/save
    if (path === "/api/carpark/companies/save" && method === "POST") {
      const { id, code, name, adminUsername } = await request.json();
      if (!code || !name || !adminUsername) {
        return resJson({ error: "Missing required fields" }, 400);
      }

      const duplicate = await env.DB.prepare(
        "SELECT * FROM tenant_companies WHERE LOWER(code) = ? AND id != ?"
      ).bind(code.trim().toLowerCase(), id ? Number(id) : -1).first();

      if (duplicate) {
        return resJson({ error: "รหัสบริษัทนี้มีอยู่ในระบบแล้ว" }, 400);
      }

      let actionText = "";
      let company;

      if (id) {
        const exists = await env.DB.prepare("SELECT * FROM tenant_companies WHERE id = ?").bind(Number(id)).first();
        if (!exists) {
          return resJson({ error: "ไม่พบข้อมูลบริษัทนี้" }, 404);
        }

        await env.DB.prepare(
          "UPDATE tenant_companies SET code = ?, name = ? WHERE id = ?"
        ).bind(code.trim(), name.trim(), Number(id)).run();

        company = { id: Number(id), code: code.trim(), name: name.trim() };
        actionText = `แก้ไขข้อมูลบริษัทผู้เช่า: ${name} (Code: ${code})`;
      } else {
        const insertRes = await env.DB.prepare(
          "INSERT INTO tenant_companies (code, name) VALUES (?, ?) RETURNING *"
        ).bind(code.trim(), name.trim()).first();

        company = {
          ...insertRes,
          id: Number(insertRes.id)
        };
        actionText = `เพิ่มบริษัทผู้เช่าใหม่: ${name} (Code: ${code})`;
      }

      const logTime = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO logs (username, action, timestamp) VALUES (?, ?, ?)"
      ).bind(adminUsername, actionText, logTime).run();

      await bumpCarparkSyncVersionD1(env.DB);
      return resJson({ success: true, company });
    }

    // POST /api/carpark/companies/delete
    if (path === "/api/carpark/companies/delete" && method === "POST") {
      const { id, adminUsername } = await request.json();
      if (!id || !adminUsername) {
        return resJson({ error: "Missing id or adminUsername" }, 400);
      }

      const deleted = await env.DB.prepare("SELECT * FROM tenant_companies WHERE id = ?").bind(Number(id)).first();
      if (!deleted) {
        return resJson({ error: "ไม่พบข้อมูลบริษัทนี้" }, 404);
      }

      await env.DB.prepare("DELETE FROM tenant_companies WHERE id = ?").bind(Number(id)).run();

      const logText = `ลบบริษัทผู้เช่า: ${deleted.name} (${deleted.code})`;
      const logTime = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO logs (username, action, timestamp) VALUES (?, ?, ?)"
      ).bind(adminUsername, logText, logTime).run();

      await bumpCarparkSyncVersionD1(env.DB);
      return resJson({ success: true });
    }

    // POST /api/carpark/monthly/bulk-replace
    if (path === "/api/carpark/monthly/bulk-replace" && method === "POST") {
      const { vehicles, adminUsername } = await request.json();
      if (!Array.isArray(vehicles) || adminUsername === undefined) {
        return resJson({ error: "Missing required fields" }, 400);
      }

      await env.DB.prepare("DELETE FROM monthly_vehicles").run();
      
      const statements = [];
      for (const v of vehicles) {
        const isExecVal = v.isExecutive ? 1 : 0;
        statements.push(env.DB.prepare(
          "INSERT INTO monthly_vehicles (plate, owner, company, expMonth, isExecutive) VALUES (?, ?, ?, ?, ?)"
        ).bind(String(v.plate).trim(), String(v.owner).trim(), String(v.company).trim(), String(v.expMonth), isExecVal));
      }
      
      if (statements.length > 0) {
        await env.DB.batch(statements);
      }

      const logText = `นำเข้าข้อมูลสมาชิกรถรายเดือนใหม่ทั้งหมด จำนวน ${vehicles.length} รายการ`;
      const logTime = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO logs (username, action, timestamp) VALUES (?, ?, ?)"
      ).bind(adminUsername, logText, logTime).run();

      await bumpCarparkSyncVersionD1(env.DB);
      return resJson({ success: true, count: vehicles.length });
    }

    // POST /api/carpark/monthly/save
    if (path === "/api/carpark/monthly/save" && method === "POST") {
      const { id, plate, owner, company, expMonth, isExecutive, adminUsername } = await request.json();
      if (!plate || !owner || !company || !expMonth || adminUsername === undefined) {
        return resJson({ error: "Missing required fields" }, 400);
      }

      const lowercasePlate = plate.trim().toLowerCase();
      const duplicate = await env.DB.prepare(
        "SELECT * FROM monthly_vehicles WHERE LOWER(plate) = ? AND id != ?"
      ).bind(lowercasePlate, id ? Number(id) : -1).first();

      if (duplicate) {
        return resJson({ error: "ทะเบียนรถนี้ได้รับการลงทะเบียนรายเดือนไว้ในระบบแล้ว" }, 400);
      }

      let actionText = "";
      let vehicle;
      const isExecVal = isExecutive ? 1 : 0;

      if (id) {
        const exists = await env.DB.prepare("SELECT * FROM monthly_vehicles WHERE id = ?").bind(Number(id)).first();
        if (!exists) {
          return resJson({ error: "ไม่พบข้อมูลสมาชิกรายเดือนนี้" }, 404);
        }

        await env.DB.prepare(
          "UPDATE monthly_vehicles SET plate = ?, owner = ?, company = ?, expMonth = ?, isExecutive = ? WHERE id = ?"
        ).bind(plate.trim(), owner.trim(), company.trim(), expMonth, isExecVal, Number(id)).run();

        vehicle = { id: Number(id), plate: plate.trim(), owner: owner.trim(), company: company.trim(), expMonth, isExecutive: !!isExecutive };
        actionText = `แก้ไขข้อมูลสิทธิ์สมาชิกรายเดือน: ${plate} (เจ้าของ: ${owner})`;
      } else {
        const insertRes = await env.DB.prepare(
          "INSERT INTO monthly_vehicles (plate, owner, company, expMonth, isExecutive) VALUES (?, ?, ?, ?, ?) RETURNING *"
        ).bind(plate.trim(), owner.trim(), company.trim(), expMonth, isExecVal).first();

        vehicle = {
          ...insertRes,
          id: Number(insertRes.id),
          isExecutive: insertRes.isExecutive === 1
        };
        actionText = `ลงทะเบียนสมาชิกรายเดือนใหม่: ${plate} (เจ้าของ: ${owner})`;
      }

      const logTime = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO logs (username, action, timestamp) VALUES (?, ?, ?)"
      ).bind(adminUsername, actionText, logTime).run();

      await bumpCarparkSyncVersionD1(env.DB);
      return resJson({ success: true, vehicle });
    }

    // POST /api/carpark/monthly/delete
    if (path === "/api/carpark/monthly/delete" && method === "POST") {
      const { id, adminUsername } = await request.json();
      if (!id || adminUsername === undefined) {
        return resJson({ error: "Missing id or adminUsername" }, 400);
      }

      const deleted = await env.DB.prepare("SELECT * FROM monthly_vehicles WHERE id = ?").bind(Number(id)).first();
      if (!deleted) {
        return resJson({ error: "ไม่พบข้อมูลสมาชิกรายเดือนนี้" }, 404);
      }

      await env.DB.prepare("DELETE FROM monthly_vehicles WHERE id = ?").bind(Number(id)).run();

      const logText = `ลบสิทธิ์สมาชิกรายเดือน: ${deleted.plate} (เจ้าของ: ${deleted.owner})`;
      const logTime = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO logs (username, action, timestamp) VALUES (?, ?, ?)"
      ).bind(adminUsername, logText, logTime).run();

      await bumpCarparkSyncVersionD1(env.DB);
      return resJson({ success: true });
    }

    // POST /api/carpark/parking/save
    if (path === "/api/carpark/parking/save" && method === "POST") {
      const { id, plate, timeIn, timeOut, createdBy, updatedBy, status, amount, transferAmount, coupons, exemptedHours, exemptedCompany, exemptedBy, exemptedAt } = await request.json();
      if (!plate || !timeIn || !status || createdBy === undefined) {
        return resJson({ error: "Missing required fields" }, 400);
      }

      if (status === 'parked') {
        const lowercasePlate = plate.trim().toLowerCase();
        const duplicate = await env.DB.prepare(
          "SELECT * FROM parking_logs WHERE status = 'parked' AND LOWER(plate) = ? AND id != ?"
        ).bind(lowercasePlate, id ? Number(id) : -1).first();

        if (duplicate) {
          return resJson({ error: `ทะเบียนรถ "${plate.trim()}" มีอยู่ในระบบและยังไม่ได้บันทึกออก` }, 400);
        }
      }

      let actionText = "";
      let logRecord;

      if (id) {
        const exists = await env.DB.prepare("SELECT * FROM parking_logs WHERE id = ?").bind(Number(id)).first();
        if (!exists) {
          return resJson({ error: "ไม่พบข้อมูลรายการจอดรถนี้" }, 404);
        }

        const outVal = timeOut || null;
        const amtVal = Number(amount || 0);
        const transAmtVal = Number(transferAmount || 0);
        const cpVal = Number(coupons || 0);
        const upUser = updatedBy || null;
        const upTime = updatedBy ? new Date().toISOString() : null;

        // Extract existing or new values for exemption
        const exHours = exemptedHours !== undefined ? (exemptedHours !== null ? Number(exemptedHours) : null) : exists.exemptedHours;
        const exCompany = exemptedCompany !== undefined ? exemptedCompany : exists.exemptedCompany;
        const exBy = exemptedBy !== undefined ? exemptedBy : exists.exemptedBy;
        const exAt = exemptedAt !== undefined ? exemptedAt : exists.exemptedAt;

        await env.DB.prepare(
          `UPDATE parking_logs SET plate = ?, timeIn = ?, timeOut = ?, status = ?, amount = ?, transferAmount = ?, coupons = ?, updatedBy = ?, updatedAt = ?, exemptedHours = ?, exemptedCompany = ?, exemptedBy = ?, exemptedAt = ? WHERE id = ?`
        ).bind(plate.trim(), timeIn, outVal, status, amtVal, transAmtVal, cpVal, upUser, upTime, exHours, exCompany, exBy, exAt, Number(id)).run();

        logRecord = { id: Number(id), plate: plate.trim(), timeIn, timeOut: outVal, status, amount: amtVal, transferAmount: transAmtVal, coupons: cpVal, createdBy: exists.createdBy, createdAt: exists.createdAt, updatedBy: upUser, updatedAt: upTime, exemptedHours: exHours, exemptedCompany: exCompany, exemptedBy: exBy, exemptedAt: exAt };
        actionText = status === 'checked_out'
          ? `บันทึกรถออก: ${plate} (ยอดชำระ: ฿${amount})`
          : `แก้ไขประวัติจอดรถ: ${plate}`;
      } else {
        const insTime = new Date().toISOString();
        const amtVal = Number(amount || 0);
        const transAmtVal = Number(transferAmount || 0);
        const cpVal = Number(coupons || 0);
        const exHours = exemptedHours !== undefined && exemptedHours !== null ? Number(exemptedHours) : null;
        const exCompany = exemptedCompany !== undefined ? exemptedCompany : null;
        const exBy = exemptedBy !== undefined ? exemptedBy : null;
        const exAt = exemptedAt !== undefined ? exemptedAt : null;
        
        const insertRes = await env.DB.prepare(
          `INSERT INTO parking_logs (plate, timeIn, timeOut, createdBy, createdAt, status, amount, transferAmount, coupons, exemptedHours, exemptedCompany, exemptedBy, exemptedAt) 
           VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
        ).bind(plate.trim(), timeIn, createdBy, insTime, status, amtVal, transAmtVal, cpVal, exHours, exCompany, exBy, exAt).first();

        logRecord = {
          ...insertRes,
          id: Number(insertRes.id),
          amount: Number(insertRes.amount || 0),
          transferAmount: Number(insertRes.transferAmount || 0),
          coupons: Number(insertRes.coupons || 0),
          exemptedHours: insertRes.exemptedHours !== null && insertRes.exemptedHours !== undefined ? Number(insertRes.exemptedHours) : null
        };
        actionText = `บันทึกรถเข้า: ${plate}`;
      }

      const logTime = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO logs (username, action, timestamp) VALUES (?, ?, ?)"
      ).bind(updatedBy || createdBy, actionText, logTime).run();

      await bumpCarparkSyncVersionD1(env.DB);
      return resJson({ success: true, logRecord });
    }

    // POST /api/carpark/parking/delete
    if (path === "/api/carpark/parking/delete" && method === "POST") {
      const { id, adminUsername } = await request.json();
      if (!id || adminUsername === undefined) {
        return resJson({ error: "Missing id or adminUsername" }, 400);
      }

      const deleted = await env.DB.prepare("SELECT * FROM parking_logs WHERE id = ?").bind(Number(id)).first();
      if (!deleted) {
        return resJson({ error: "ไม่พบข้อมูลรายการจอดรถนี้" }, 404);
      }

      await env.DB.prepare("DELETE FROM parking_logs WHERE id = ?").bind(Number(id)).run();

      const logText = `ลบรายการจอดรถ: ${deleted.plate}`;
      const logTime = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO logs (username, action, timestamp) VALUES (?, ?, ?)"
      ).bind(adminUsername, logText, logTime).run();

      await bumpCarparkSyncVersionD1(env.DB);
      return resJson({ success: true });
    }

    // POST /api/carpark/settings/save
    if (path === "/api/carpark/settings/save" && method === "POST") {
      const { key, value, adminUsername } = await request.json();
      if (!key || value === undefined) {
        return resJson({ error: "Missing key or value" }, 400);
      }

      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, String(value)).run();

      const logText = `บันทึกการตั้งค่า ${key} = ${value}`;
      const logTime = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO logs (username, action, timestamp) VALUES (?, ?, ?)"
      ).bind(adminUsername || 'System', logText, logTime).run();

      await bumpCarparkSyncVersionD1(env.DB);
      return resJson({ success: true });
    }

    return resJson({ error: "Endpoint not found" }, 404);

  } catch (error) {
    return resJson({ error: error.message, stack: error.stack }, 500);
  }
}

// Helpers
async function bumpCarparkSyncVersionD1(targetDb) {
  await targetDb.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('syncVersion', '0')").run();
  await targetDb.prepare("UPDATE settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'syncVersion'").run();
}
