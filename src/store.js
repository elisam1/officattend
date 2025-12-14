const KEY = 'officattend_store_v1'

function read() {
  const raw = localStorage.getItem(KEY)
  if (!raw) return { companies: [], session: null }
  try { return JSON.parse(raw) } catch { return { companies: [], session: null } }
}

function write(data) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function createCompany(name, admin) {
  const data = read()
  const id = crypto.randomUUID()
  const company = { id, name, admins: [{ id: crypto.randomUUID(), ...admin }], employees: [], attendance: [], settings: { schedule: { checkInEnd: '10:00', checkOutStart: '16:00' } } }
  data.companies.push(company)
  data.session = { companyId: id, adminId: company.admins[0].id }
  write(data)
  return company
}

export function getSession() {
  const data = read()
  return data.session
}

export function setSession(session) {
  const data = read()
  data.session = session
  write(data)
}

export function getCompany(companyId) {
  const data = read()
  return data.companies.find(c => c.id === companyId) || null
}

export function updateCompany(company) {
  const data = read()
  const idx = data.companies.findIndex(c => c.id === company.id)
  if (idx >= 0) data.companies[idx] = company
  write(data)
}

export function addEmployee(companyId, employee) {
  const c = getCompany(companyId)
  if (!c) return null
  const newEmp = { id: crypto.randomUUID(), ...employee }
  c.employees.push(newEmp)
  updateCompany(c)
  return newEmp
}

export function listEmployees(companyId) {
  const c = getCompany(companyId)
  return c ? c.employees : []
}

export function renameEmployee(companyId, empId, name) {
  const c = getCompany(companyId)
  if (!c) return null
  const e = c.employees.find(x => x.id === empId)
  if (!e) return null
  e.name = name
  updateCompany(c)
  return e
}

export function deleteEmployee(companyId, empId) {
  const c = getCompany(companyId)
  if (!c) return false
  const e = c.employees.find(x => x.id === empId)
  if (e) {
    for (const r of c.attendance) {
      if (r.employeeId === empId && !r.employeeName) r.employeeName = e.name || null
    }
  }
  c.employees = c.employees.filter(x => x.id !== empId)
  updateCompany(c)
  return true
}

export function recordAttendance(companyId, employeeId, type, ts) {
  const c = getCompany(companyId)
  if (!c) return
  const date = new Date(ts).toISOString().slice(0,10)
  let rec = c.attendance.find(r => r.date === date && r.employeeId === employeeId)
  const emp = c.employees.find(e => e.id === employeeId)
  if (!rec) {
    rec = { id: crypto.randomUUID(), employeeId, employeeName: emp?.name || null, date, checkIn: null, checkOut: null, late: false, earlyLeave: false, absent: false }
    c.attendance.push(rec)
  } else {
    if (!rec.employeeName && emp) rec.employeeName = emp.name
  }
  const sched = (c.settings && c.settings.schedule) || { checkInEnd: '10:00', checkOutStart: '16:00' }
  const toTs = (hhmm) => { const [h,m] = (hhmm||'00:00').split(':').map(Number); const d = new Date(date); d.setHours(h||0,m||0,0,0); return d.getTime() }
  if (type === 'in' && !rec.checkIn) { rec.checkIn = ts; rec.late = ts > toTs(sched.checkInEnd); rec.absent = false }
  if (type === 'out' && !rec.checkOut) { rec.checkOut = ts; rec.earlyLeave = ts < toTs(sched.checkOutStart); rec.absent = false }
  updateCompany(c)
  return rec
}

export function listTodayAttendance(companyId) {
  const c = getCompany(companyId)
  if (!c) return []
  const date = new Date().toISOString().slice(0,10)
  return c.attendance.filter(r => r.date === date)
}

export function serializeDescriptor(desc) {
  return Array.from(desc)
}

export function setSchedule(companyId, schedule) {
  const c = getCompany(companyId)
  if (!c) return null
  c.settings = c.settings || {}
  c.settings.schedule = { ...(c.settings.schedule || {}), ...schedule }
  updateCompany(c)
  return c.settings.schedule
}

export function listAttendanceRange(companyId, start, end) {
  const c = getCompany(companyId)
  if (!c) return []
  return c.attendance.filter(r => (!start || r.date >= start) && (!end || r.date <= end))
}

export function closeDayLocal(companyId, dateStr) {
  const c = getCompany(companyId)
  if (!c) return
  const date = dateStr || new Date().toISOString().slice(0,10)
  const existing = new Map(c.attendance.filter(r => r.date === date).map(r => [r.employeeId, r]))
  for (const e of c.employees) {
    const r = existing.get(e.id)
    if (!r) c.attendance.push({ id: crypto.randomUUID(), employeeId: e.id, employeeName: e.name || null, date, checkIn: null, checkOut: null, late: false, earlyLeave: false, absent: true })
    else if (!r.checkIn) r.absent = true
  }
  updateCompany(c)
}
