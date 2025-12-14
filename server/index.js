import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

const DATA_PATH = path.join(process.cwd(), 'server', 'data.json')
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

function read() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return { companies: [], sessions: [] }
  }
}
function write(data) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true })
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))
}

function getCompany(data, id) {
  return data.companies.find(c => c.id === id)
}

function authRequired(req, res, next) {
  const h = req.headers['authorization'] || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return res.status(401).json({ error: 'no_token' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.auth = payload
    next()
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token' })
  }
}

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

// Setup company with first admin
app.post('/setup/company', (req, res) => {
  const { name, admin } = req.body || {}
  if (!name) return res.status(400).json({ error: 'name required' })
  const data = read()
  const normName = String(name).trim().toLowerCase()
  if ((data.companies||[]).some(c => String(c.name||'').trim().toLowerCase() === normName)) {
    return res.status(409).json({ error: 'company_name_exists' })
  }
  const adminEmail = (admin&&admin.email) ? String(admin.email).trim() : ''
  const adminPassword = (admin&&admin.password) ? String(admin.password).trim() : ''
  if (!adminEmail) return res.status(400).json({ error: 'admin_email_required' })
  if (!adminPassword) return res.status(400).json({ error: 'admin_password_required' })
  const adminEmailNorm = adminEmail.toLowerCase()
  const emailExists = (data.companies||[]).some(c => (c.admins||[]).some(a => String(a.email||'').toLowerCase() === adminEmailNorm))
  if (emailExists) return res.status(409).json({ error: 'admin_email_exists' })
  const id = crypto.randomUUID()
  const passwordHash = bcrypt.hashSync(adminPassword, 10)
  const firstAdmin = { id: crypto.randomUUID(), name: (admin?.name || 'Admin'), email: adminEmail, passwordHash }
  const company = { id, name, admins: [firstAdmin], employees: [], attendance: [], settings: { schedule: { checkInEnd: '10:00', checkOutStart: '16:00' } }, departments: [], shifts: [] }
  data.companies.push(company)
  write(data)
  res.json(company)
})

app.get('/company/:id', (req, res) => {
  const data = read()
  const c = getCompany(data, req.params.id)
  if (!c) return res.status(404).json({ error: 'not_found' })
  res.json(c)
})

// Auth
app.post('/auth/login', (req, res) => {
  const { companyId, email, password } = req.body || {}
  const data = read()
  let c = null
  let admin = null
  if (companyId) {
    c = getCompany(data, companyId)
    if (!c) return res.status(404).json({ error: 'company_not_found' })
    admin = (c.admins||[]).find(a => (a.email||'').toLowerCase() === (email||'').toLowerCase())
    if (!admin) return res.status(404).json({ error: 'admin_not_found' })
  } else {
    // Login by email only: search across companies and validate password per match
    let emailMatched = false
    for (const comp of (data.companies||[])) {
      const a = (comp.admins||[]).find(x => (x.email||'').toLowerCase() === (email||'').toLowerCase())
      if (!a) continue
      emailMatched = true
      let passOk = false
      if (a.passwordHash) {
        passOk = bcrypt.compareSync(password || '', a.passwordHash)
      } else if (a.password) {
        passOk = (String(a.password) === String(password || ''))
        if (passOk) {
          try {
            a.passwordHash = bcrypt.hashSync(String(a.password), 10)
            delete a.password
            write(data)
          } catch {}
        }
      }
      if (passOk) { c = comp; admin = a; break }
    }
    if (!admin || !c) {
      return res.status(emailMatched ? 401 : 404).json({ error: emailMatched ? 'invalid_credentials' : 'admin_not_found' })
    }
  }
  let ok = false
  if (admin.passwordHash) {
    ok = bcrypt.compareSync(password || '', admin.passwordHash)
  } else if (admin.password) {
    ok = (String(admin.password) === String(password || ''))
    if (ok) {
      try {
        admin.passwordHash = bcrypt.hashSync(String(admin.password), 10)
        delete admin.password
        write(data)
      } catch {}
    }
  }
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' })
  const token = jwt.sign({ companyId: c.id, adminId: admin.id }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, companyId: c.id, adminId: admin.id })
})

// Employees
app.get('/company/:id/employees', (req, res) => {
  const data = read()
  const c = getCompany(data, req.params.id)
  if (!c) return res.status(404).json({ error: 'not_found' })
  res.json(c.employees)
})
app.post('/company/:id/employees', (req, res) => {
  const { name, descriptor } = req.body || {}
  const data = read()
  const c = getCompany(data, req.params.id)
  if (!c) return res.status(404).json({ error: 'not_found' })
  const emp = { id: crypto.randomUUID(), name: name || 'Unnamed', descriptor: Array.isArray(descriptor) ? descriptor : [] }
  c.employees.push(emp)
  write(data)
  res.json(emp)
})
app.put('/company/:id/employees/:empId', authRequired, (req, res) => {
  const { name } = req.body || {}
  const data = read()
  const c = getCompany(data, req.params.id)
  if (!c) return res.status(404).json({ error: 'not_found' })
  const e = c.employees.find(x => x.id === req.params.empId)
  if (!e) return res.status(404).json({ error: 'emp_not_found' })
  e.name = name || e.name
  if (req.body && 'departmentId' in req.body) e.departmentId = req.body.departmentId || null
  if (req.body && 'shiftId' in req.body) e.shiftId = req.body.shiftId || null
  write(data)
  res.json(e)
})
app.delete('/company/:id/employees/:empId', authRequired, (req, res) => {
  const data = read()
  const c = getCompany(data, req.params.id)
  if (!c) return res.status(404).json({ error: 'not_found' })
  const e = (c.employees||[]).find(x => x.id === req.params.empId)
  if (e) {
    for (const r of (c.attendance||[])) {
      if (r.employeeId === e.id && !r.employeeName) r.employeeName = e.name || null
    }
  }
  c.employees = c.employees.filter(x => x.id !== req.params.empId)
  write(data)
  res.json({ ok: true })
})

// Attendance
app.get('/company/:id/attendance', (req, res) => {
  const data = read()
  const c = getCompany(data, req.params.id)
  if (!c) return res.status(404).json({ error: 'not_found' })
  const start = req.query.start
  const end = req.query.end
  const rows = (c.attendance||[]).filter(r => {
    return (!start || r.date >= start) && (!end || r.date <= end)
  })
  res.json(rows)
})
app.get('/company/:id/attendance/today', (req, res) => {
  const data = read()
  const c = getCompany(data, req.params.id)
  if (!c) return res.status(404).json({ error: 'not_found' })
  const date = new Date().toISOString().slice(0,10)
  res.json((c.attendance||[]).filter(r => r.date === date))
})
app.post('/company/:id/attendance', (req, res) => {
  const { employeeId, type, ts } = req.body || {}
  const data = read()
  const c = getCompany(data, req.params.id)
  if (!c) return res.status(404).json({ error: 'not_found' })
  const date = new Date(ts || Date.now()).toISOString().slice(0,10)
  let rec = (c.attendance||[]).find(r => r.date === date && r.employeeId === employeeId)
  let schedule = (c.settings&&c.settings.schedule) || { checkInEnd: '10:00', checkOutStart: '16:00' }
  const emp = (c.employees||[]).find(e => e.id === employeeId)
  if (!rec) { rec = { id: crypto.randomUUID(), employeeId, employeeName: emp?.name || null, date, checkIn: null, checkOut: null, late: false, earlyLeave: false, absent: false }; c.attendance.push(rec) } else { if (!rec.employeeName && emp) rec.employeeName = emp.name }
  if (emp && emp.shiftId) {
    const sh = (c.shifts||[]).find(s => s.id === emp.shiftId)
    if (sh && sh.schedule) schedule = sh.schedule
  }
  const toTime = (hhmm) => { const [h,m] = (hhmm||'00:00').split(':').map(Number); const d = new Date(date); d.setHours(h||0,m||0,0,0); return d.getTime() }
  if (type === 'in' && !rec.checkIn) {
    rec.checkIn = ts || Date.now()
    rec.late = rec.checkIn > toTime(schedule.checkInEnd)
    rec.absent = false
  }
  if (type === 'out' && !rec.checkOut) {
    rec.checkOut = ts || Date.now()
    rec.earlyLeave = rec.checkOut < toTime(schedule.checkOutStart)
    rec.absent = false
  }
  write(data)
  res.json(rec)
})

// Settings
app.put('/company/:id/settings', authRequired, (req, res) => {
  const data = read()
  const c = getCompany(data, req.params.id)
  if (!c) return res.status(404).json({ error: 'not_found' })
  c.settings = { ...(c.settings||{}), ...(req.body||{}) }
  write(data)
  res.json(c.settings)
})

// CSV export (today or date range if provided)
app.get('/company/:id/attendance.csv', (req, res) => {
  const data = read()
  const c = getCompany(data, req.params.id)
  if (!c) return res.status(404).send('not_found')
  const start = req.query.start
  const end = req.query.end
  // Use a locale-independent formatter to avoid spreadsheet hash rendering
  const fmtTime = (ts) => {
    const d = new Date(ts)
    const hh = String(d.getHours()).padStart(2,'0')
    const mm = String(d.getMinutes()).padStart(2,'0')
    const ss = String(d.getSeconds()).padStart(2,'0')
    return `${hh}:${mm}:${ss}`
  }
  const rows = (c.attendance||[]).filter(r => {
    if (!start && !end) return r.date === new Date().toISOString().slice(0,10)
    return (!start || r.date >= start) && (!end || r.date <= end)
  }).map(r => {
    const emp = c.employees.find(e => e.id === r.employeeId)
    return [
      r.date,
      (r.employeeName || (emp?.name || r.employeeId)),
      r.checkIn ? fmtTime(r.checkIn) : '',
      r.checkOut ? fmtTime(r.checkOut) : '',
      r.late ? 'late' : '',
      r.earlyLeave ? 'early' : '',
      r.absent ? 'absent' : ''
    ]
  })
  const header = ['Date','Name','CheckIn','CheckOut','Late','EarlyLeave','Absent']
  const csv = [header, ...rows].map(row => row.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n')
  res.setHeader('Content-Type','text/csv')
  res.send(csv)
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`)
})
// Close day: mark absentees
app.post('/company/:id/attendance/closeDay', authRequired, (req, res) => {
  const data = read()
  const c = getCompany(data, req.params.id)
  if (!c) return res.status(404).json({ error: 'not_found' })
  const date = (req.body&&req.body.date) || new Date().toISOString().slice(0,10)
  const existingByEmp = new Map((c.attendance||[]).filter(r => r.date === date).map(r => [r.employeeId, r]))
  for (const e of (c.employees||[])) {
    const r = existingByEmp.get(e.id)
    if (!r) {
      c.attendance.push({ id: crypto.randomUUID(), employeeId: e.id, employeeName: e.name || null, date, checkIn: null, checkOut: null, late: false, earlyLeave: false, absent: true })
    } else if (!r.checkIn) {
      r.absent = true
    }
  }
  write(data)
  res.json({ ok: true })
})

// Departments
app.get('/company/:id/departments', (req, res) => {
  const data = read(); const c = getCompany(data, req.params.id); if (!c) return res.status(404).json({ error:'not_found' }); res.json(c.departments||[])
})
app.post('/company/:id/departments', authRequired, (req, res) => {
  const data = read(); const c = getCompany(data, req.params.id); if (!c) return res.status(404).json({ error:'not_found' });
  const d = { id: crypto.randomUUID(), name: (req.body&&req.body.name) || 'Department' }
  c.departments = c.departments || []; c.departments.push(d); write(data); res.json(d)
})
app.delete('/company/:id/departments/:depId', authRequired, (req, res) => {
  const data = read(); const c = getCompany(data, req.params.id); if (!c) return res.status(404).json({ error:'not_found' });
  c.departments = (c.departments||[]).filter(d => d.id !== req.params.depId); write(data); res.json({ ok:true })
})

// Shifts
app.get('/company/:id/shifts', (req, res) => {
  const data = read(); const c = getCompany(data, req.params.id); if (!c) return res.status(404).json({ error:'not_found' }); res.json(c.shifts||[])
})
app.post('/company/:id/shifts', authRequired, (req, res) => {
  const data = read(); const c = getCompany(data, req.params.id); if (!c) return res.status(404).json({ error:'not_found' });
  const s = { id: crypto.randomUUID(), name: (req.body&&req.body.name) || 'Shift', schedule: (req.body&&req.body.schedule) || { checkInEnd:'10:00', checkOutStart:'16:00' } }
  c.shifts = c.shifts || []; c.shifts.push(s); write(data); res.json(s)
})
app.delete('/company/:id/shifts/:shiftId', authRequired, (req, res) => {
  const data = read(); const c = getCompany(data, req.params.id); if (!c) return res.status(404).json({ error:'not_found' });
  c.shifts = (c.shifts||[]).filter(s => s.id !== req.params.shiftId); write(data); res.json({ ok:true })
})
