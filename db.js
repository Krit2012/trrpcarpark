import fs from 'fs';
import path from 'path';

const DB_FILE = path.resolve('db.json');

const defaultUsers = [
  { id: 1, username: "admin", role: "admin", pin: "1234", adUser: "N" },
  { id: 2, username: "user1", role: "user", pin: "1234", adUser: "N" }
];

function initDB() {
  if (!fs.existsSync(DB_FILE)) {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 7);
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);

    const initialData = {
      users: defaultUsers.map(u => ({ ...u, company: null })),
      monthlyVehicles: [
        { id: 1, plate: '1กก1111', owner: 'คุณเกียรติภูมิ มั่นคง', company: 'กลุ่มบริษัท แอดวานซ์', expMonth: nextMonth, isExecutive: true },
        { id: 2, plate: '2กก2222', owner: 'คุณวิชัย เลิศลอย', company: 'กลุ่มบริษัท บิลเดอร์', expMonth: prevMonth, isExecutive: false }
      ],
      parkingLogs: [
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
      ],
      tenantCompanies: [
        { id: 1, code: 'ADV', name: 'กลุ่มบริษัท แอดวานซ์' },
        { id: 2, code: 'BLD', name: 'กลุ่มบริษัท บิลเดอร์' }
      ],
      settings: {
        syncVersion: 1
      },
      logs: [
        {
          id: 1,
          username: "system",
          action: "Initialize TRRP Car Park database with sample data",
          timestamp: new Date().toISOString()
        }
      ]
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

// Initialise DB
initDB();

export function readCarparkDB() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    const db = JSON.parse(data);

    let migrated = false;
    if (!db.users) {
      db.users = defaultUsers;
      migrated = true;
    }
    // Migrate company field on users
    db.users.forEach(u => {
      if (u.company === undefined) {
        u.company = null;
        migrated = true;
      }
      if (u.max_exemptedHours === undefined) {
        u.max_exemptedHours = null;
        migrated = true;
      }
      if (u.adUser === undefined) {
        u.adUser = 'N';
        migrated = true;
      }
    });

    if (!db.tenantCompanies) {
      db.tenantCompanies = [
        { id: 1, code: 'ADV', name: 'กลุ่มบริษัท แอดวานซ์' },
        { id: 2, code: 'BLD', name: 'กลุ่มบริษัท บิลเดอร์' }
      ];
      migrated = true;
    }
    if (!db.settings) {
      db.settings = { syncVersion: 1 };
      migrated = true;
    }
    if (!db.logs) {
      db.logs = [];
      migrated = true;
    }

    if (migrated) {
      writeCarparkDB(db);
    }

    return db;
  } catch (error) {
    console.error("Error reading carpark database file:", error);
    return {
      users: defaultUsers,
      monthlyVehicles: [],
      parkingLogs: [],
      settings: { syncVersion: 1 },
      logs: []
    };
  }
}

export function writeCarparkDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error("Error writing carpark database file:", error);
    return false;
  }
}

export function logCarparkAction(username, action) {
  const db = readCarparkDB();
  const newLog = {
    id: db.logs.length > 0 ? Math.max(...db.logs.map(l => l.id)) + 1 : 1,
    username,
    action,
    timestamp: new Date().toISOString()
  };
  db.logs.push(newLog);
  // Keep only last 100 logs to prevent bloat
  if (db.logs.length > 100) {
    db.logs.shift();
  }
  writeCarparkDB(db);
  return newLog;
}

export function bumpCarparkSyncVersion() {
  const db = readCarparkDB();
  db.settings.syncVersion = (db.settings.syncVersion || 0) + 1;
  writeCarparkDB(db);
  return db.settings.syncVersion;
}
