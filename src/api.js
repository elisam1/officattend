const BASE = 'http://localhost:3001'
let authToken = null
export function setAuthToken(token) { authToken = token }

export async function health() {
  try { const r = await fetch(BASE + '/health'); return r.ok } catch { return false }
}

export async function createCompanyRemote(name, admin) {
  const r = await fetch(BASE + '/setup/company', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ name, admin }) })
  if (!r.ok) throw new Error('createCompany failed');
  return r.json()
}
export async function getCompanyRemote(id) {
  const r = await fetch(BASE + `/company/${id}`)
  if (!r.ok) throw new Error('getCompany failed');
  return r.json()
}
export async function listEmployeesRemote(id) {
  const r = await fetch(BASE + `/company/${id}/employees`)
  if (!r.ok) throw new Error('listEmployees failed');
  return r.json()
}
export async function addEmployeeRemote(id, employee) {
  const r = await fetch(BASE + `/company/${id}/employees`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(employee) })
  if (!r.ok) throw new Error('addEmployee failed');
  return r.json()
}
export async function renameEmployeeRemote(id, empId, name) {
  const r = await fetch(BASE + `/company/${id}/employees/${empId}`, { method: 'PUT', headers: { 'Content-Type':'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: JSON.stringify({ name }) })
  if (!r.ok) throw new Error('renameEmployee failed');
  return r.json()
}
export async function deleteEmployeeRemote(id, empId) {
  const r = await fetch(BASE + `/company/${id}/employees/${empId}`, { method: 'DELETE', headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) } })
  if (!r.ok) throw new Error('deleteEmployee failed');
  return r.json()
}
export async function listTodayAttendanceRemote(id) {
  const r = await fetch(BASE + `/company/${id}/attendance/today`)
  if (!r.ok) throw new Error('listTodayAttendance failed');
  return r.json()
}
export async function recordAttendanceRemote(id, employeeId, type, ts) {
  const r = await fetch(BASE + `/company/${id}/attendance`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ employeeId, type, ts }) })
  if (!r.ok) throw new Error('recordAttendance failed');
  return r.json()
}
export async function updateSettingsRemote(id, settings) {
  const r = await fetch(BASE + `/company/${id}/settings`, { method: 'PUT', headers: { 'Content-Type':'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: JSON.stringify(settings) })
  if (!r.ok) throw new Error('updateSettings failed');
  return r.json()
}
export function csvUrl(id, start, end) {
  const u = new URL(BASE + `/company/${id}/attendance.csv`)
  if (start) u.searchParams.set('start', start)
  if (end) u.searchParams.set('end', end)
  return u.toString()
}

export async function loginRemote(companyId, email, password) {
  // companyId is optional; backend supports login by email+password alone
  const payload = companyId ? { companyId, email, password } : { email, password }
  const r = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) })
  if (!r.ok) {
    try { const e = await r.json(); throw new Error('login failed: ' + (e.error||r.status)) } catch { throw new Error('login failed: ' + r.status) }
  }
  return r.json()
}

export async function listAttendanceRangeRemote(id, start, end) {
  const u = new URL(BASE + `/company/${id}/attendance`)
  if (start) u.searchParams.set('start', start)
  if (end) u.searchParams.set('end', end)
  const r = await fetch(u.toString())
  if (!r.ok) throw new Error('listAttendanceRange failed')
  return r.json()
}

export async function closeDayRemote(id, date) {
  const r = await fetch(BASE + `/company/${id}/attendance/closeDay`, { method: 'POST', headers: { 'Content-Type':'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: JSON.stringify({ date }) })
  if (!r.ok) throw new Error('closeDay failed')
  return r.json()
}

// Departments
export async function listDepartmentsRemote(id) {
  const r = await fetch(BASE + `/company/${id}/departments`)
  if (!r.ok) throw new Error('listDepartments failed');
  return r.json()
}
export async function createDepartmentRemote(id, name) {
  const r = await fetch(BASE + `/company/${id}/departments`, { method: 'POST', headers: { 'Content-Type':'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: JSON.stringify({ name }) })
  if (!r.ok) throw new Error('createDepartment failed');
  return r.json()
}
export async function deleteDepartmentRemote(id, depId) {
  const r = await fetch(BASE + `/company/${id}/departments/${depId}`, { method: 'DELETE', headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) } })
  if (!r.ok) throw new Error('deleteDepartment failed');
  return r.json()
}

// Shifts
export async function listShiftsRemote(id) {
  const r = await fetch(BASE + `/company/${id}/shifts`)
  if (!r.ok) throw new Error('listShifts failed');
  return r.json()
}
export async function createShiftRemote(id, payload) {
  const r = await fetch(BASE + `/company/${id}/shifts`, { method: 'POST', headers: { 'Content-Type':'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: JSON.stringify(payload) })
  if (!r.ok) throw new Error('createShift failed');
  return r.json()
}
export async function deleteShiftRemote(id, shiftId) {
  const r = await fetch(BASE + `/company/${id}/shifts/${shiftId}`, { method: 'DELETE', headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) } })
  if (!r.ok) throw new Error('deleteShift failed');
  return r.json()
}

export async function updateEmployeeRemote(id, empId, payload) {
  const r = await fetch(BASE + `/company/${id}/employees/${empId}`, { method: 'PUT', headers: { 'Content-Type':'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: JSON.stringify(payload) })
  if (!r.ok) throw new Error('updateEmployee failed');
  return r.json()
}
