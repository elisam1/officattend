const { app, BrowserWindow, Tray, Menu, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Import Express and dependencies directly into Electron's Node process
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

let mainWindow;
let tray;
let server;

const isDev = process.env.NODE_ENV === 'development';
const BACKEND_PORT = 3001;

// ============================================
// EMBEDDED EXPRESS SERVER
// ============================================

function createExpressServer() {
  const expressApp = express();
  expressApp.use(cors());
  expressApp.use(express.json({ limit: '2mb' }));

  // Data storage path
  const DATA_PATH = isDev 
    ? path.join(__dirname, '..', 'server', 'data.json')
    : path.join(app.getPath('userData'), 'data.json');
  
  console.log('Data storage path:', DATA_PATH);

  // JWT secret
  const JWT_SECRET = 'officattend-secret-key-2024';

  // Data helpers
  function read() {
    try {
      const raw = fs.readFileSync(DATA_PATH, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return { companies: [], sessions: [] };
    }
  }

  function write(data) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  }

  function getCompany(data, id) {
    return data.companies.find(c => c.id === id);
  }

  // Simple JWT implementation
  function createToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 86400000 })).toString('base64url');
    const signature = require('crypto').createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  function verifyToken(token) {
    try {
      const [header, body, signature] = token.split('.');
      const expectedSig = require('crypto').createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
      if (signature !== expectedSig) return null;
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (payload.exp < Date.now()) return null;
      return payload;
    } catch {
      return null;
    }
  }

  // Simple password hashing
  function hashPassword(password) {
    return require('crypto').createHash('sha256').update(password + JWT_SECRET).digest('hex');
  }

  function comparePassword(password, hash) {
    return hashPassword(password) === hash;
  }

  // Auth middleware
  function authRequired(req, res, next) {
    const h = req.headers['authorization'] || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'no_token' });
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'invalid_token' });
    req.auth = payload;
    next();
  }

  // Routes
  expressApp.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  // Setup company - matches frontend: { name, admin: { email, password, name? } }
  expressApp.post('/setup/company', (req, res) => {
    const { name, admin } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    
    const data = read();
    const normName = String(name).trim().toLowerCase();
    if ((data.companies || []).some(c => String(c.name || '').trim().toLowerCase() === normName)) {
      return res.status(409).json({ error: 'company_name_exists' });
    }
    
    const adminEmail = (admin && admin.email) ? String(admin.email).trim() : '';
    const adminPassword = (admin && admin.password) ? String(admin.password).trim() : '';
    if (!adminEmail) return res.status(400).json({ error: 'admin_email_required' });
    if (!adminPassword) return res.status(400).json({ error: 'admin_password_required' });
    
    const adminEmailNorm = adminEmail.toLowerCase();
    const emailExists = (data.companies || []).some(c => 
      (c.admins || []).some(a => String(a.email || '').toLowerCase() === adminEmailNorm)
    );
    if (emailExists) return res.status(409).json({ error: 'admin_email_exists' });
    
    const id = crypto.randomUUID();
    const firstAdmin = { 
      id: crypto.randomUUID(), 
      name: (admin?.name || 'Admin'), 
      email: adminEmail, 
      passwordHash: hashPassword(adminPassword) 
    };
    const company = { 
      id, 
      name, 
      admins: [firstAdmin], 
      employees: [], 
      attendance: [], 
      settings: { schedule: { checkInEnd: '10:00', checkOutStart: '16:00' } },
      departments: [], 
      shifts: [] 
    };
    data.companies.push(company);
    write(data);
    res.json(company);
  });

  // Auth - matches frontend: { companyId?, email, password }
  expressApp.post('/auth/login', (req, res) => {
    const { companyId, email, password } = req.body || {};
    const data = read();
    
    let c = null;
    let admin = null;
    
    if (companyId) {
      c = getCompany(data, companyId);
      if (!c) return res.status(404).json({ error: 'company_not_found' });
      admin = (c.admins || []).find(a => (a.email || '').toLowerCase() === (email || '').toLowerCase());
      if (!admin) return res.status(404).json({ error: 'admin_not_found' });
    } else {
      // Login by email only: search across companies
      for (const company of data.companies || []) {
        const found = (company.admins || []).find(a => 
          (a.email || '').toLowerCase() === (email || '').toLowerCase()
        );
        if (found && comparePassword(password, found.passwordHash)) {
          admin = found;
          c = company;
          break;
        }
      }
      if (!admin) return res.status(401).json({ error: 'invalid_credentials' });
    }
    
    if (!comparePassword(password, admin.passwordHash)) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    
    const token = createToken({ companyId: c.id, email: admin.email, adminId: admin.id });
    res.json({ token, companyId: c.id, companyName: c.name });
  });

  // Company
  expressApp.get('/company/:id', (req, res) => {
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    res.json(c);
  });

  // Employees
  expressApp.get('/company/:id/employees', (req, res) => {
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    res.json(c.employees || []);
  });

  expressApp.post('/company/:id/employees', (req, res) => {
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    const emp = {
      id: crypto.randomUUID(),
      name: req.body?.name || 'Unknown',
      descriptor: req.body?.descriptor || null,
      department: req.body?.department || null,
      shift: req.body?.shift || null
    };
    c.employees = c.employees || [];
    c.employees.push(emp);
    write(data);
    res.json(emp);
  });

  expressApp.put('/company/:id/employees/:empId', authRequired, (req, res) => {
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    const emp = (c.employees || []).find(e => e.id === req.params.empId);
    if (!emp) return res.status(404).json({ error: 'employee_not_found' });
    if (req.body?.name) emp.name = req.body.name;
    if (req.body?.descriptor) emp.descriptor = req.body.descriptor;
    if (req.body && 'departmentId' in req.body) emp.departmentId = req.body.departmentId || null;
    if (req.body && 'shiftId' in req.body) emp.shiftId = req.body.shiftId || null;
    write(data);
    res.json(emp);
  });

  expressApp.delete('/company/:id/employees/:empId', authRequired, (req, res) => {
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    c.employees = (c.employees || []).filter(e => e.id !== req.params.empId);
    write(data);
    res.json({ ok: true });
  });

  // Attendance
  expressApp.get('/company/:id/attendance/today', (req, res) => {
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    const today = new Date().toISOString().slice(0, 10);
    const records = (c.attendance || []).filter(a => a.date === today);
    res.json(records);
  });

  expressApp.get('/company/:id/attendance', (req, res) => {
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    let records = c.attendance || [];
    const { start, end } = req.query;
    if (start) records = records.filter(a => a.date >= start);
    if (end) records = records.filter(a => a.date <= end);
    res.json(records);
  });

  expressApp.post('/company/:id/attendance', (req, res) => {
    const { employeeId, type, ts } = req.body || {};
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    const date = new Date(ts || Date.now()).toISOString().slice(0, 10);
    c.attendance = c.attendance || [];
    let rec = c.attendance.find(r => r.date === date && r.employeeId === employeeId);
    let schedule = (c.settings && c.settings.schedule) || { checkInEnd: '10:00', checkOutStart: '16:00' };
    const emp = (c.employees || []).find(e => e.id === employeeId);
    if (!rec) {
      rec = { id: crypto.randomUUID(), employeeId, employeeName: emp?.name || null, date, checkIn: null, checkOut: null, late: false, earlyLeave: false, absent: false };
      c.attendance.push(rec);
    } else {
      if (!rec.employeeName && emp) rec.employeeName = emp.name;
    }
    if (emp && emp.shiftId) {
      const sh = (c.shifts || []).find(s => s.id === emp.shiftId);
      if (sh && sh.schedule) schedule = sh.schedule;
    }
    const toTime = (hhmm) => {
      const [h, m] = (hhmm || '00:00').split(':').map(Number);
      const d = new Date(date);
      d.setHours(h || 0, m || 0, 0, 0);
      return d.getTime();
    };
    if (type === 'in' && !rec.checkIn) {
      rec.checkIn = ts || Date.now();
      rec.late = rec.checkIn > toTime(schedule.checkInEnd);
      rec.absent = false;
    }
    if (type === 'out' && !rec.checkOut) {
      rec.checkOut = ts || Date.now();
      rec.earlyLeave = rec.checkOut < toTime(schedule.checkOutStart);
      rec.absent = false;
    }
    write(data);
    res.json(rec);
  });

  expressApp.post('/company/:id/attendance/closeDay', authRequired, (req, res) => {
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    const date = (req.body && req.body.date) || new Date().toISOString().slice(0, 10);
    c.attendance = c.attendance || [];
    const existingByEmp = new Map(c.attendance.filter(r => r.date === date).map(r => [r.employeeId, r]));
    for (const e of (c.employees || [])) {
      const r = existingByEmp.get(e.id);
      if (!r) {
        c.attendance.push({ id: crypto.randomUUID(), employeeId: e.id, employeeName: e.name || null, date, checkIn: null, checkOut: null, late: false, earlyLeave: false, absent: true });
      } else if (!r.checkIn) {
        r.absent = true;
      }
    }
    write(data);
    res.json({ ok: true });
  });

  // CSV Export
  expressApp.get('/company/:id/attendance.csv', (req, res) => {
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    let records = c.attendance || [];
    const { start, end } = req.query;
    if (start) records = records.filter(a => a.date >= start);
    if (end) records = records.filter(a => a.date <= end);
    const empMap = Object.fromEntries((c.employees || []).map(e => [e.id, e.name]));
    const fmtTime = (ts) => {
      if (!ts) return '';
      const d = new Date(ts);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    };
    const lines = ['Date,Name,CheckIn,CheckOut,Late,EarlyLeave,Absent'];
    for (const r of records) {
      const name = r.employeeName || empMap[r.employeeId] || 'Unknown';
      lines.push(`${r.date},${name},${fmtTime(r.checkIn)},${fmtTime(r.checkOut)},${r.late ? 'late' : ''},${r.earlyLeave ? 'early' : ''},${r.absent ? 'absent' : ''}`);
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance.csv');
    res.send(lines.join('\n'));
  });

  // Departments
  expressApp.get('/company/:id/departments', (req, res) => {
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    res.json(c.departments || []);
  });

  expressApp.post('/company/:id/departments', authRequired, (req, res) => {
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    const dep = { id: crypto.randomUUID(), name: req.body?.name || 'Department' };
    c.departments = c.departments || [];
    c.departments.push(dep);
    write(data);
    res.json(dep);
  });

  expressApp.delete('/company/:id/departments/:depId', authRequired, (req, res) => {
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    c.departments = (c.departments || []).filter(d => d.id !== req.params.depId);
    write(data);
    res.json({ ok: true });
  });

  // Shifts
  expressApp.get('/company/:id/shifts', (req, res) => {
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    res.json(c.shifts || []);
  });

  expressApp.post('/company/:id/shifts', authRequired, (req, res) => {
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    const s = {
      id: crypto.randomUUID(),
      name: req.body?.name || 'Shift',
      schedule: req.body?.schedule || { checkInEnd: '10:00', checkOutStart: '16:00' }
    };
    c.shifts = c.shifts || [];
    c.shifts.push(s);
    write(data);
    res.json(s);
  });

  expressApp.delete('/company/:id/shifts/:shiftId', authRequired, (req, res) => {
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    c.shifts = (c.shifts || []).filter(s => s.id !== req.params.shiftId);
    write(data);
    res.json({ ok: true });
  });

  // Settings
  expressApp.put('/company/:id/settings', authRequired, (req, res) => {
    const data = read();
    const c = getCompany(data, req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    c.settings = { ...(c.settings || {}), ...(req.body || {}) };
    write(data);
    res.json(c.settings);
  });

  return expressApp;
}

// Start the embedded server
function startServer() {
  return new Promise((resolve, reject) => {
    try {
      const expressApp = createExpressServer();
      server = expressApp.listen(BACKEND_PORT, () => {
        console.log(`Embedded server running on port ${BACKEND_PORT}`);
        resolve();
      });
      server.on('error', (err) => {
        console.error('Server error:', err);
        reject(err);
      });
    } catch (err) {
      console.error('Failed to create server:', err);
      reject(err);
    }
  });
}

// ============================================
// ELECTRON WINDOW MANAGEMENT
// ============================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    show: false,
    title: 'OfficAttend'
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const distPath = path.join(process.resourcesPath, 'dist', 'index.html');
    console.log('Loading from:', distPath);
    mainWindow.loadFile(distPath);
  }

  // Allow DevTools with Ctrl+Shift+I
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.ico');
  try {
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open OfficAttend', click: () => mainWindow?.show() },
      { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
    ]);
    tray.setToolTip('OfficAttend');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => mainWindow?.show());
  } catch (e) {
    console.log('Tray creation failed:', e);
  }
}

function showLoadingWindow() {
  const loading = new BrowserWindow({
    width: 400, height: 200,
    frame: false, transparent: true, alwaysOnTop: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });

  loading.loadURL(`data:text/html,
    <html><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;
    background:linear-gradient(135deg,#1e3a5f,#0f172a);border-radius:12px;font-family:system-ui;color:white;flex-direction:column;">
    <h2 style="margin:0 0 16px">OfficAttend</h2>
    <p style="margin:0;opacity:0.8">Starting up...</p>
    <div style="margin-top:20px;width:200px;height:4px;background:rgba(255,255,255,0.2);border-radius:2px;overflow:hidden">
    <div style="width:40%;height:100%;background:#3b82f6;animation:load 1.5s ease-in-out infinite"></div></div>
    <style>@keyframes load{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}</style>
    </body></html>
  `);

  return loading;
}

function setupPermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('Permission requested:', permission);
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'geolocation', 'notifications'];
    callback(allowed.includes(permission));
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'geolocation', 'notifications'];
    return allowed.includes(permission);
  });
}

// ============================================
// APP LIFECYCLE
// ============================================

app.whenReady().then(async () => {
  const loading = showLoadingWindow();

  try {
    setupPermissions();
    
    console.log('Starting embedded server...');
    await startServer();
    console.log('Server ready!');

    loading.close();
    createWindow();
    createTray();

  } catch (error) {
    console.error('Startup error:', error);
    loading.close();
    dialog.showErrorBox('Startup Error', `Failed to start: ${error.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (server) server.close();
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
