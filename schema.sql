-- 1. Users Table (TRRP Car Park specific users)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  pin TEXT DEFAULT NULL,
  company TEXT DEFAULT NULL,
  max_exemptedHours INTEGER DEFAULT NULL
);

-- Seed Default Carpark Users
INSERT OR IGNORE INTO users (id, username, role, pin, company) VALUES (1, 'admin', 'admin', '1234', NULL);
INSERT OR IGNORE INTO users (id, username, role, pin, company) VALUES (2, 'user1', 'user', '1234', NULL);

-- 2. Settings Table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('syncVersion', '1');

-- 3. Logs Table
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

-- Insert Default Initial Log
INSERT INTO logs (username, action, timestamp) VALUES ('system', 'Initialize TRRP Carpark D1 database with sample data', datetime('now'));

-- 4. Monthly Vehicles Table (TRRP Car Park)
CREATE TABLE IF NOT EXISTS monthly_vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate TEXT NOT NULL UNIQUE,
  owner TEXT NOT NULL,
  company TEXT NOT NULL,
  expMonth TEXT NOT NULL,
  isExecutive INTEGER DEFAULT 0
);

-- Seed Default Monthly Vehicles
INSERT OR IGNORE INTO monthly_vehicles (id, plate, owner, company, expMonth, isExecutive) VALUES
(1, '1กก1111', 'คุณเกียรติภูมิ มั่นคง', 'กลุ่มบริษัท แอดวานซ์', strftime('%Y-%m', datetime('now', '+1 month')), 1),
(2, '2กก2222', 'คุณวิชัย เลิศลอย', 'กลุ่มบริษัท บิลเดอร์', strftime('%Y-%m', datetime('now', '-1 month')), 0);

-- 5. Parking Logs Table (TRRP Car Park)
CREATE TABLE IF NOT EXISTS parking_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate TEXT NOT NULL,
  timeIn TEXT NOT NULL,
  timeOut TEXT DEFAULT NULL,
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedBy TEXT DEFAULT NULL,
  updatedAt TEXT DEFAULT NULL,
  status TEXT NOT NULL,
  amount REAL NOT NULL,
  coupons INTEGER NOT NULL,
  exemptedHours INTEGER DEFAULT NULL,
  exemptedCompany TEXT DEFAULT NULL,
  exemptedBy TEXT DEFAULT NULL,
  exemptedAt TEXT DEFAULT NULL
);

-- Seed Default Parking Logs
INSERT OR IGNORE INTO parking_logs (id, plate, timeIn, timeOut, createdBy, createdAt, updatedBy, updatedAt, status, amount, coupons, exemptedHours, exemptedCompany, exemptedBy, exemptedAt) VALUES
(10001, '1กก1111', datetime('now', 'start of day', '+9 hours', '+10 minutes'), NULL, 'admin', datetime('now'), NULL, NULL, 'parked', 0, 0, NULL, NULL, NULL, NULL),
(10002, '2กก2222', datetime('now', 'start of day', '+10 hours', '+15 minutes'), NULL, 'admin', datetime('now'), NULL, NULL, 'parked', 0, 0, NULL, NULL, NULL, NULL),
(10003, '3กก3333', datetime('now', 'start of day', '+11 hours', '+30 minutes'), NULL, 'admin', datetime('now'), NULL, NULL, 'parked', 0, 0, NULL, NULL, NULL, NULL);

-- 6. Tenant Companies Table
CREATE TABLE IF NOT EXISTS tenant_companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

-- Seed Default Tenant Companies
INSERT OR IGNORE INTO tenant_companies (id, code, name) VALUES (1, 'ADV', 'กลุ่มบริษัท แอดวานซ์');
INSERT OR IGNORE INTO tenant_companies (id, code, name) VALUES (2, 'BLD', 'กลุ่มบริษัท บิลเดอร์');

