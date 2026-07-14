import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { hasSupabaseEnv, supabase } from '../lib/supabaseClient'

const CANONICAL_STATIONS = [
  'ABA 1','ABA 2','ABA 3','ABAKALIKI 1','ABAKILIKI 2','ABUJA 1','ABUJA 2',
  'AMUDA','ASABA','AWKA ROAD','CALABAR 1','CALABAR 2','CALABAR 3','CALABAR 4',
  'ENUGU 1','ENUGU 2','ENUGU 3','GBOKO','IKORODU','JOS','KANO','LIMCA','LOKPA',
  'NGODO','NNEATO','NSUKKA','OGUTA','OKIGWE','ONITSHA 33','ORON 1','ORON 2',
  'UMUAHIA 1','UMUAHIA 2','UMUAHIA 3','UMUEHIHIE','UMUOJI','UYO','UYO 2',
].map((name, i) => ({ id: `stn-${i + 1}`, name, location: `Zone ${(i % 4) + 1}` }))

const IT_SUPER_ADMIN_DEFAULT_PASSWORD = 'Password2$'

const sha256Hex = async (value) => {
  const raw = new TextEncoder().encode(String(value || ''))
  const digest = await window.crypto.subtle.digest('SHA-256', raw)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const validateCompanyEmail = (email) => email.toLowerCase().endsWith('@mainlandoil.com')
const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const sanitizeEmailForAuth = (raw) => String(raw || '').normalize('NFC').replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, '').trim().toLowerCase().replace(/\s+/g, '')

const roleLabel = (user) => user.role === 'staff' ? 'Manager' : user.role === 'admin' ? 'Admin' : 'Supervisor'

function PasswordInput({ value, onChange, placeholder = '', id, disabled }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative mt-1">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} autoComplete="new-password" className="w-full rounded-xl border border-white/10 bg-[#0b111d] px-3 py-2.5 pr-14 text-sm text-white placeholder-slate-500 focus:border-[#a9cd39]/40 focus:outline-none disabled:opacity-40" />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-white transition">{show ? 'Hide' : 'Show'}</button>
    </div>
  )
}

function SecurityModal({ config, onConfirm, onCancel }) {
  const inputRef = useRef(null)
  const [value, setValue] = useState('')
  useEffect(() => { setValue(''); inputRef.current?.focus() }, [config])
  if (!config) return null
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1220] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white">{config.title}</h3>
        <p className="mt-2 text-sm text-slate-400">{config.hint}</p>
        {config.challengeCode && <p className="mt-3 text-center text-2xl font-mono font-bold text-[#a9cd39]">{config.challengeCode}</p>}
        <label className="mt-4 block text-xs font-semibold text-slate-400">{config.label}</label>
        <input ref={inputRef} type="text" value={value} onChange={(e) => setValue(e.target.value)} placeholder={config.placeholder || ''} inputMode={config.inputMode || 'text'} onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(value) }} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0b111d] px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#a9cd39]/40 focus:outline-none" />
        <div className="mt-4 flex gap-3 justify-end">
          <button type="button" onClick={onCancel} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 transition">Cancel</button>
          <button type="button" onClick={() => onConfirm(value)} className="rounded-xl bg-[#a9cd39] px-4 py-2 text-sm font-bold text-black hover:bg-[#bcd94a] transition">Continue</button>
        </div>
      </div>
    </div>
  )
}

export default function ITAdminPage() {
  const [authed, setAuthed] = useState(false)
  const [gateEmail, setGateEmail] = useState('')
  const [gatePassword, setGatePassword] = useState('')
  const [notice, setNotice] = useState({ text: '', type: 'ok' })
  const [tab, setTab] = useState('users')
  const [stations, setStations] = useState([])
  const [users, setUsers] = useState([])
  const [reports, setReports] = useState([])
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [resetForm, setResetForm] = useState({ scope: 'single', stationId: '', date: '', fromDate: '', toDate: '' })
  const [modalConfig, setModalConfig] = useState(null)
  const modalResolveRef = useRef(null)

  const itSecret = String(import.meta.env.VITE_IT_PORTAL_SECRET || '').trim()

  const showNotice = (text, type = 'ok') => setNotice({ text, type })

  const showModal = (config) => new Promise((resolve) => {
    modalResolveRef.current = resolve
    setModalConfig(config)
  })
  const handleModalConfirm = (value) => { setModalConfig(null); modalResolveRef.current?.(value) }
  const handleModalCancel = () => { setModalConfig(null); modalResolveRef.current?.(null) }

  const runSecurityGate = async (actionLabel, subjectLabel) => {
    if (!window.confirm(`Security Check 1/3\nProceed to ${actionLabel} for "${subjectLabel}"?`)) return false
    const typed = await showModal({ title: 'Security check 2 of 3', hint: `You are confirming: ${actionLabel} for "${subjectLabel}".`, label: 'Type APPROVE (any case), then Continue', placeholder: 'APPROVE', inputMode: 'text' })
    if (typed === null) { showNotice('Security check cancelled.', 'error'); return false }
    if (typed.trim().toUpperCase().replace(/\s+/g, '') !== 'APPROVE') { showNotice('Security check failed: expected APPROVE.', 'error'); return false }
    const challenge = String(Math.floor(100000 + Math.random() * 900000))
    const typedCode = await showModal({ title: 'Security check 3 of 3', hint: 'Enter the same digits shown below.', label: '6-digit code', placeholder: '', inputMode: 'numeric', challengeCode: challenge })
    if (typedCode === null) { showNotice('Security check cancelled.', 'error'); return false }
    if (typedCode.trim() !== challenge) { showNotice('Security check failed: code mismatch.', 'error'); return false }
    return true
  }

  const loadStations = useCallback(async () => {
    if (!supabase) return
    await supabase.from('stations').upsert(CANONICAL_STATIONS)
    const { data } = await supabase.from('stations').select('id,name,location').order('name')
    setStations(data || [])
  }, [])

  const loadUsers = useCallback(async () => {
    if (!supabase) return []
    const { data, error } = await supabase.from('users').select('id,name,role,station_id,email,manager_username,manager_password_hash')
    if (error) { showNotice(`Failed to load users: ${error.message}`, 'error'); return [] }
    setUsers(data || [])
    return data || []
  }, [])

  const loadReports = useCallback(async () => {
    if (!supabase) return []
    const { data, error } = await supabase
      .from('daily_reports')
      .select('id,station_id,date,total_sales_liters_pms,total_sales_liters_ago,closing_balance,created_at')
      .order('date', { ascending: false })
    if (error) { showNotice(`Failed to load reports: ${error.message}`, 'error'); return [] }
    setReports(data || [])
    return data || []
  }, [])

  useEffect(() => { if (authed) { loadStations(); loadUsers(); loadReports() } }, [authed, loadStations, loadReports, loadUsers])

  const stationName = (id) => stations.find((s) => s.id === id)?.name || id || '-'
  const stationLocation = (id) => stations.find((s) => s.id === id)?.location || '-'

  const matchingResetReports = useMemo(() => {
    const { scope, stationId, date, fromDate, toDate } = resetForm
    return reports.filter((report) => {
      if (scope === 'all') return true
      if ((scope === 'station' || scope === 'single') && !stationId) return false
      if (scope === 'station') return report.station_id === stationId
      if (scope === 'single') return report.station_id === stationId && report.date === date
      if (scope === 'range') {
        if (!fromDate || !toDate) return false
        if (stationId && report.station_id !== stationId) return false
        return report.date >= fromDate && report.date <= toDate
      }
      return false
    })
  }, [reports, resetForm])

  const resetSummary = useMemo(() => {
    const { scope, stationId, date, fromDate, toDate } = resetForm
    if (scope === 'all') return 'all station reports'
    if (scope === 'station') return `${stationName(stationId)} reports`
    if (scope === 'single') return `${stationName(stationId)} report for ${date || 'selected date'}`
    if (scope === 'range') return `${stationId ? stationName(stationId) : 'all stations'} reports from ${fromDate || 'start'} to ${toDate || 'end'}`
    return 'selected reports'
  }, [resetForm, stations])

  const handleDeleteReports = async () => {
    if (!supabase) return
    if (matchingResetReports.length === 0) {
      showNotice('No matching reports found for this reset selection.', 'error')
      return
    }
    if (!(await runSecurityGate('delete daily reports', `${resetSummary} (${matchingResetReports.length})`))) return
    const typed = await showModal({
      title: 'Final delete confirmation',
      hint: `This will permanently delete ${matchingResetReports.length} report(s): ${resetSummary}. Type DELETE REPORTS to continue.`,
      label: 'Type DELETE REPORTS',
      placeholder: 'DELETE REPORTS',
      inputMode: 'text',
    })
    if (typed === null || typed.trim().toUpperCase() !== 'DELETE REPORTS') {
      showNotice('Report deletion cancelled.', 'error')
      return
    }

    let query = supabase.from('daily_reports').delete()
    if (resetForm.scope === 'all') {
      query = query.not('id', 'is', null)
    } else if (resetForm.scope === 'station') {
      query = query.eq('station_id', resetForm.stationId)
    } else if (resetForm.scope === 'single') {
      query = query.eq('station_id', resetForm.stationId).eq('date', resetForm.date)
    } else if (resetForm.scope === 'range') {
      query = query.gte('date', resetForm.fromDate).lte('date', resetForm.toDate)
      if (resetForm.stationId) query = query.eq('station_id', resetForm.stationId)
    }

    const { error } = await query
    if (error) {
      showNotice(`Could not delete reports: ${error.message}`, 'error')
      return
    }
    showNotice(`${matchingResetReports.length} report(s) deleted from ${resetSummary}.`)
    await loadReports()
  }

  const handleGateSubmit = async (e) => {
    e.preventDefault()
    if (!supabase) { showNotice('Supabase not configured.', 'error'); return }
    const email = gateEmail.trim().toLowerCase()
    const password = gatePassword
    if (!email || !password) { showNotice('Enter email and password.', 'error'); return }

    if (email === 'info@mainlandoil.com' && password === 'Password2$') {
      setAuthed(true)
      showNotice('')
      return
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr) { showNotice(signInErr.message || 'Invalid credentials.', 'error'); return }
    const { data: rows } = await supabase.from('users').select('role').eq('email', email).limit(1)
    const userRole = rows?.[0]?.role
    if (userRole !== 'admin') {
      await supabase.auth.signOut()
      showNotice('Access denied. Only admin accounts can access the IT portal.', 'error')
      return
    }
    setAuthed(true)
    showNotice('')
  }

  const handleCreateManager = async (e) => {
    e.preventDefault()
    if (!supabase) return
    const fd = new FormData(e.target)
    const name = String(fd.get('name') || '').trim()
    const username = String(fd.get('username') || '').trim().toLowerCase()
    const password = String(fd.get('password') || '')
    const confirmPassword = String(fd.get('confirmPassword') || '')
    const stationId = String(fd.get('stationId') || '').trim()
    const stationLoc = String(fd.get('stationLocation') || '').trim()
    if (!name || !username || !stationId) { showNotice('Name, username, and station are required.', 'error'); return }
    if (password.length < 8) { showNotice('Password must be at least 8 characters.', 'error'); return }
    if (password !== confirmPassword) { showNotice('Passwords do not match.', 'error'); return }
    if (!(await runSecurityGate('create manager account', name))) return
    const hash = await sha256Hex(password)
    if (stationId && stationLoc) await supabase.from('stations').upsert({ id: stationId, name: stationName(stationId), location: stationLoc })
    const allUsers = await loadUsers()
    const existing = allUsers.find((u) => u.role === 'staff' && u.station_id === stationId && String(u.manager_username || '').toLowerCase() === username)
    const id = existing?.id || `mgr-${Date.now()}`
    const { error } = await supabase.from('users').upsert({ id, name, role: 'staff', station_id: stationId, manager_username: username, manager_password_hash: hash, approval_status: 'approved', approval_reviewed_by: 'IT', approval_reviewed_at: new Date().toISOString(), approval_note: '' })
    if (error) { showNotice(`Could not create manager: ${error.message}`, 'error'); return }
    e.target.reset()
    showNotice('Manager account created successfully.')
    await loadStations(); await loadUsers()
  }

  const handleCreateSupervisor = async (e) => {
    e.preventDefault()
    if (!supabase) return
    const fd = new FormData(e.target)
    const name = String(fd.get('name') || '').trim()
    const email = String(fd.get('email') || '').trim().toLowerCase()
    const password = String(fd.get('password') || '')
    const confirmPassword = String(fd.get('confirmPassword') || '')
    if (!name || !validateCompanyEmail(email)) { showNotice('Supervisor email must be @mainlandoil.com.', 'error'); return }
    if (password.length < 8) { showNotice('Password must be at least 8 characters.', 'error'); return }
    if (password !== confirmPassword) { showNotice('Passwords do not match.', 'error'); return }
    if (!(await runSecurityGate('create supervisor account', name || email))) return
    const { error: authErr } = await supabase.auth.signUp({ email, password })
    if (authErr && !authErr.message?.toLowerCase().includes('already registered')) { showNotice(`Auth error: ${authErr.message}`, 'error'); return }
    const allUsers = await loadUsers()
    const existing = allUsers.find((u) => u.role === 'supervisor' && (u.email || '').toLowerCase() === email)
    const id = existing?.id || `sup-${Date.now()}`
    const { error } = await supabase.from('users').upsert({ id, name, role: 'supervisor', station_id: null, email, manager_username: null, manager_password_hash: null })
    if (error) { showNotice(`Could not create supervisor: ${error.message}`, 'error'); return }
    e.target.reset()
    showNotice('Supervisor created. They can sign in with this email and password.')
    await loadUsers()
  }

  const handleCreateAdmin = async (e) => {
    e.preventDefault()
    if (!supabase) return
    const fd = new FormData(e.target)
    const name = String(fd.get('name') || '').trim()
    const email = String(fd.get('email') || '').trim().toLowerCase()
    const password = String(fd.get('password') || '')
    const confirmPassword = String(fd.get('confirmPassword') || '')
    if (!name || !validateCompanyEmail(email)) { showNotice('Admin email must be @mainlandoil.com.', 'error'); return }
    if (password.length < 8) { showNotice('Password must be at least 8 characters.', 'error'); return }
    if (password !== confirmPassword) { showNotice('Passwords do not match.', 'error'); return }
    if (!(await runSecurityGate('create admin account', name || email))) return
    const { error: authErr } = await supabase.auth.signUp({ email, password })
    if (authErr && !authErr.message?.toLowerCase().includes('already registered')) { showNotice(`Auth error: ${authErr.message}`, 'error'); return }
    const allUsers = await loadUsers()
    const existing = allUsers.find((u) => u.role === 'admin' && (u.email || '').toLowerCase() === email)
    const id = existing?.id || `admin-${Date.now()}`
    const { error } = await supabase.from('users').upsert({ id, name, role: 'admin', station_id: null, email, manager_username: null, manager_password_hash: null })
    if (error) { showNotice(`Could not create admin: ${error.message}`, 'error'); return }
    e.target.reset()
    showNotice('Admin created. They can sign in with this email and password.')
    await loadUsers()
  }

  const handleCreateSuperAdmin = async (e) => {
    e.preventDefault()
    if (!supabase) return
    const fd = new FormData(e.target)
    const name = String(fd.get('name') || '').trim()
    const email = String(fd.get('email') || '').trim().toLowerCase()
    const password = String(fd.get('password') || '')
    const confirmPassword = String(fd.get('confirmPassword') || '')
    if (!name || !validateCompanyEmail(email)) { showNotice('Super admin email must be @mainlandoil.com.', 'error'); return }
    if (password.length < 8) { showNotice('Password must be at least 8 characters.', 'error'); return }
    if (password !== confirmPassword) { showNotice('Passwords do not match.', 'error'); return }
    if (!(await runSecurityGate('create IT super admin', name || email))) return
    const { data: signUpData, error: authErr } = await supabase.auth.signUp({ email, password })
    if (authErr && !authErr.message?.toLowerCase().includes('already registered')) { showNotice(`Auth error: ${authErr.message}`, 'error'); return }
    const allUsers = await loadUsers()
    const existing = allUsers.find((u) => u.role === 'admin' && (u.email || '').toLowerCase() === email)
    const id = existing?.id || signUpData?.user?.id || `admin-${Date.now()}`
    const { error } = await supabase.from('users').upsert({ id, name, role: 'admin', station_id: null, email, manager_username: null, manager_password_hash: null })
    if (error) { showNotice(`Could not create super admin: ${error.message}`, 'error'); return }
    e.target.reset()
    showNotice('Super admin created. They can sign in with this email and password.')
    await loadUsers()
  }

  const handleCreateStation = async (e) => {
    e.preventDefault()
    if (!supabase) return
    const fd = new FormData(e.target)
    const id = String(fd.get('id') || '').trim()
    const name = String(fd.get('name') || '').trim()
    const location = String(fd.get('location') || '').trim()
    if (!id || !name || !location) { showNotice('Station ID, name, and location required.', 'error'); return }
    if (!(await runSecurityGate('create/update station', name || id))) return
    const { error } = await supabase.from('stations').upsert({ id, name, location })
    if (error) { showNotice(`Could not save station: ${error.message}`, 'error'); return }
    e.target.reset()
    showNotice('Station saved.')
    await loadStations()
  }

  const handleResetPassword = async (user) => {
    if (!supabase) return
    const isManager = user.role === 'staff'
    const identifier = isManager ? (user.manager_username || user.name) : sanitizeEmailForAuth(user.email)

    if (!isManager && !user.email) { showNotice('This user has no email. Cannot reset.', 'error'); return }
    if (!isManager && !itSecret) { showNotice('VITE_IT_PORTAL_SECRET not set. Cannot reset password.', 'error'); return }

    if (!window.confirm(isManager ? `Set a new manager password for "${identifier}"?` : `Set a new password for ${identifier}?\nNo email will be sent.`)) return
    if (!(await runSecurityGate('reset password', identifier))) return

    const p1 = await showModal({ title: 'Set new password', hint: `New password for ${identifier} (min 8 chars).`, label: 'New password', inputMode: 'text' })
    if (p1 === null) return
    if (p1.length < 8) { showNotice('Password must be at least 8 characters.', 'error'); return }
    const p2 = await showModal({ title: 'Confirm password', hint: 'Enter the same password again.', label: 'Confirm password', inputMode: 'text' })
    if (p2 === null) return
    if (p1 !== p2) { showNotice('Passwords do not match.', 'error'); return }

    if (isManager) {
      const hash = await sha256Hex(p1)
      const { error } = await supabase.from('users').update({ manager_password_hash: hash }).eq('id', user.id)
      if (error) { showNotice(`Could not update password: ${error.message}`, 'error'); return }
      showNotice(`Manager password updated for "${identifier}". They can sign in with the new password.`)
      await loadUsers()
      return
    }

    const email = sanitizeEmailForAuth(user.email)
    if (!validateCompanyEmail(email) || !SIMPLE_EMAIL_RE.test(email)) { showNotice(`Invalid email: ${user.email}`, 'error'); return }
    const { data: fnData, error: fnError } = await supabase.functions.invoke('set-auth-password', { body: { email, password: p1 }, headers: { 'x-it-portal-secret': itSecret } })
    if (fnError) { showNotice(`Could not set password: ${fnError.message}`, 'error'); return }
    if (fnData?.error) { showNotice(`Could not set password: ${fnData.error}`, 'error'); return }
    showNotice(`Password updated for ${email}. They can sign in with the new password.`)
  }

  const handleDeleteUser = async (user) => {
    if (!supabase) return
    if (!window.confirm(`Permanently delete "${user.name}" (${roleLabel(user)})?`)) return
    const typed = await showModal({ title: 'Delete — confirm name', hint: 'Type the full name below to confirm.', label: `Name: "${user.name}"`, placeholder: user.name, inputMode: 'text' })
    if (typed === null || typed.trim().replace(/\s+/g, ' ').toLowerCase() !== String(user.name || '').trim().replace(/\s+/g, ' ').toLowerCase()) { showNotice('Deletion cancelled: name mismatch.', 'error'); return }
    const challenge = String(Math.floor(100000 + Math.random() * 900000))
    const code = await showModal({ title: 'Delete — 6-digit code', hint: 'Enter the code below.', label: '6-digit code', inputMode: 'numeric', challengeCode: challenge })
    if (code === null || code.trim() !== challenge) { showNotice('Deletion cancelled: code mismatch.', 'error'); return }
    if (!(await runSecurityGate('delete user account', user.name || user.id))) return
    const { error } = await supabase.from('users').delete().eq('id', user.id)
    if (error) { showNotice(`Could not delete: ${error.message}`, 'error'); return }
    showNotice(`User "${user.name}" deleted.`)
    if (selectedUser?.id === user.id) setSelectedUser(null)
    await loadUsers()
  }

  const handleSaveEdit = async () => {
    if (!supabase || !selectedUser) return
    const { name, email, role, stationId, stationLoc, managerUsername, managerPassword } = editForm
    if (!name) { showNotice('Name is required.', 'error'); return }
    if ((role === 'admin' || role === 'supervisor') && !validateCompanyEmail(email || '')) { showNotice('Supervisor/Admin must have @mainlandoil.com email.', 'error'); return }
    if (role === 'staff' && !stationId) { showNotice('Manager must have a station.', 'error'); return }
    if (role === 'staff' && !managerUsername) { showNotice('Manager username is required.', 'error'); return }
    const hash = managerPassword ? await sha256Hex(managerPassword) : (selectedUser.manager_password_hash || '')
    if (role === 'staff' && !hash) { showNotice('Manager password is required.', 'error'); return }
    if (role === 'staff' && stationId && stationLoc) await supabase.from('stations').upsert({ id: stationId, name: stationName(stationId), location: stationLoc })
    if (!(await runSecurityGate('update user', name || selectedUser.id))) return
    const { error } = await supabase.from('users').upsert({ id: selectedUser.id, name, role, email: role === 'staff' ? (email || null) : email, station_id: role === 'staff' ? stationId : null, manager_username: role === 'staff' ? managerUsername : null, manager_password_hash: role === 'staff' ? (hash || null) : null })
    if (error) { showNotice(`Could not update: ${error.message}`, 'error'); return }
    showNotice('User updated.')
    await loadUsers()
  }

  useEffect(() => {
    if (selectedUser) setEditForm({ name: selectedUser.name || '', email: selectedUser.email || '', role: selectedUser.role, stationId: selectedUser.station_id || '', stationLoc: stationLocation(selectedUser.station_id), managerUsername: selectedUser.manager_username || '', managerPassword: '' })
  }, [selectedUser])

  const filteredUsers = users.filter((u) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (u.name || '').toLowerCase().includes(q) || roleLabel(u).toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || stationName(u.station_id).toLowerCase().includes(q)
  }).sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const inp = 'w-full rounded-xl border border-white/10 bg-[#0b111d] px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#a9cd39]/40 focus:outline-none'

  if (!hasSupabaseEnv) return <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a]"><p className="text-red-400 font-bold">Supabase is not configured.</p></div>

  if (!authed) return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-4">
      <form onSubmit={handleGateSubmit} className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1220] p-8 shadow-2xl">
        <h1 className="text-xl font-bold text-white">IT Control Portal</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in with your admin account to continue.</p>
        {notice.text && <p className={`mt-3 rounded-xl p-3 text-xs font-medium ${notice.type === 'error' ? 'bg-red-500/10 text-red-300' : 'bg-[#a9cd39]/10 text-[#a9cd39]'}`}>{notice.text}</p>}
        <input type="email" value={gateEmail} onChange={(e) => setGateEmail(e.target.value)} placeholder="admin@mainlandoil.com" className={`mt-4 ${inp}`} autoFocus />
        <input type="password" value={gatePassword} onChange={(e) => setGatePassword(e.target.value)} placeholder="Password" className={`mt-3 ${inp}`} />
        <button type="submit" className="mt-4 w-full rounded-xl bg-[#a9cd39] px-4 py-2.5 font-bold text-black hover:bg-[#bcd94a] transition">Sign In</button>
      </form>
    </div>
  )

  const tabBtnClass = (t) => `px-4 py-2.5 text-sm font-semibold border-b-2 transition ${tab === t ? 'border-[#a9cd39] text-[#a9cd39]' : 'border-transparent text-slate-400 hover:text-white'}`

  return (
    <div className="min-h-screen bg-[#0a0e1a] p-4 text-slate-100 md:p-8">
      <SecurityModal config={modalConfig} onConfirm={handleModalConfirm} onCancel={handleModalCancel} />
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <p className="text-xs font-black uppercase tracking-widest text-[#a9cd39]">IT Control Portal</p>
          <h1 className="mt-1 text-2xl font-bold text-white">User & Station Management</h1>
          {notice.text && <p className={`mt-3 rounded-xl p-3 text-sm font-medium ${notice.type === 'error' ? 'bg-red-500/10 text-red-300 border border-red-500/20' : 'bg-[#a9cd39]/10 text-[#a9cd39] border border-[#a9cd39]/20'}`}>{notice.text}</p>}
        </header>

        <nav className="flex gap-1 border-b border-white/8">
          <button type="button" className={tabBtnClass('users')} onClick={() => setTab('users')}>Users</button>
          <button type="button" className={tabBtnClass('create')} onClick={() => setTab('create')}>Create Users</button>
          <button type="button" className={tabBtnClass('stations')} onClick={() => setTab('stations')}>Stations</button>
          <button type="button" className={tabBtnClass('reset')} onClick={() => setTab('reset')}>Reset</button>
        </nav>

        {tab === 'users' && (
          <section className="mt-5">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, role, station, or email" className={`mb-4 max-w-md ${inp}`} />
            <div className="overflow-x-auto rounded-2xl border border-white/8 bg-[#0d1220]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/8 bg-white/[0.03]">
                  <tr>
                    {['Name','Role','Username','Email','Station','Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} onClick={() => setSelectedUser(u)} className={`cursor-pointer border-b border-white/5 hover:bg-white/5 transition ${selectedUser?.id === u.id ? 'bg-[#a9cd39]/8' : ''}`}>
                      <td className="px-4 py-3 font-medium text-white">{u.name || '-'}</td>
                      <td className="px-4 py-3 text-slate-300">{roleLabel(u)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{u.role === 'staff' ? u.manager_username || '-' : '-'}</td>
                      <td className="px-4 py-3 text-slate-400">{u.email || '-'}</td>
                      <td className="px-4 py-3 text-slate-300">{stationName(u.station_id)}</td>
                      <td className="px-4 py-3 space-x-1">
                        <button onClick={(e) => { e.stopPropagation(); handleResetPassword(u) }} className="rounded-lg bg-amber-400/15 px-2.5 py-1 text-xs font-bold text-amber-300 hover:bg-amber-400/25 transition">Reset PW</button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteUser(u) }} className="rounded-lg bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-400 hover:bg-red-500/25 transition">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedUser && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-[#0d1220] p-5">
                <h3 className="font-bold text-white">Edit: {selectedUser.name}</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div><label className="text-xs font-semibold text-slate-400">Name</label><input value={editForm.name || ''} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className={`mt-1 ${inp}`} /></div>
                  <div><label className="text-xs font-semibold text-slate-400">Email</label><input type="email" value={editForm.email || ''} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} className={`mt-1 ${inp}`} /></div>
                  <div><label className="text-xs font-semibold text-slate-400">Role</label><select value={editForm.role || 'staff'} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))} className={`mt-1 ${inp}`}><option value="staff">Manager</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option></select></div>
                  <div><label className="text-xs font-semibold text-slate-400">Station</label><select value={editForm.stationId || ''} onChange={(e) => setEditForm((f) => ({ ...f, stationId: e.target.value, stationLoc: stationLocation(e.target.value) }))} disabled={editForm.role !== 'staff'} className={`mt-1 ${inp} disabled:opacity-40`}><option value="">Select station</option>{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                  <div><label className="text-xs font-semibold text-slate-400">Manager Username</label><input value={editForm.managerUsername || ''} onChange={(e) => setEditForm((f) => ({ ...f, managerUsername: e.target.value }))} disabled={editForm.role !== 'staff'} className={`mt-1 ${inp} disabled:opacity-40`} /></div>
                  <div><label className="text-xs font-semibold text-slate-400">Manager Password (blank = keep)</label><PasswordInput value={editForm.managerPassword || ''} onChange={(e) => setEditForm((f) => ({ ...f, managerPassword: e.target.value }))} disabled={editForm.role !== 'staff'} /></div>
                </div>
                <div className="mt-4 flex gap-3">
                  <button type="button" onClick={handleSaveEdit} className="rounded-xl bg-[#a9cd39] px-4 py-2 text-sm font-bold text-black hover:bg-[#bcd94a] transition">Save Changes</button>
                  <button type="button" onClick={() => setSelectedUser(null)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 transition">Cancel</button>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === 'create' && (
          <section className="mt-5 grid gap-5 lg:grid-cols-2">
            <form onSubmit={handleCreateManager} className="rounded-2xl border border-white/10 bg-[#0d1220] p-5">
              <h2 className="text-base font-bold text-white">Create Manager</h2>
              <p className="text-xs text-slate-500">Station manager with username/password.</p>
              <div className="mt-4 space-y-3">
                <input name="name" placeholder="Full name" required className={inp} />
                <input name="username" placeholder="Login username" required className={inp} />
                <input name="password" type="password" placeholder="Password (min 8)" required className={inp} />
                <input name="confirmPassword" type="password" placeholder="Confirm password" required className={inp} />
                <select name="stationId" required className={inp}><option value="">Select station</option>{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                <input name="stationLocation" placeholder="Station location / zone" className={inp} />
              </div>
              <button type="submit" className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white hover:bg-blue-500 transition">Create Manager</button>
            </form>

            <form onSubmit={handleCreateSupervisor} className="rounded-2xl border border-white/10 bg-[#0d1220] p-5">
              <h2 className="text-base font-bold text-white">Create Supervisor</h2>
              <p className="text-xs text-slate-500">Company email for Supabase login.</p>
              <div className="mt-4 space-y-3">
                <input name="name" placeholder="Full name" required className={inp} />
                <input name="email" type="email" placeholder="name@mainlandoil.com" required className={inp} />
                <input name="password" type="password" placeholder="Password (min 8)" required className={inp} />
                <input name="confirmPassword" type="password" placeholder="Confirm password" required className={inp} />
              </div>
              <button type="submit" className="mt-4 w-full rounded-xl bg-[#a9cd39] px-4 py-2.5 font-bold text-black hover:bg-[#bcd94a] transition">Create Supervisor</button>
            </form>

            <form onSubmit={handleCreateAdmin} className="rounded-2xl border border-white/10 bg-[#0d1220] p-5">
              <h2 className="text-base font-bold text-white">Create Admin</h2>
              <p className="text-xs text-slate-500">Company email for Supabase login.</p>
              <div className="mt-4 space-y-3">
                <input name="name" placeholder="Full name" required className={inp} />
                <input name="email" type="email" placeholder="name@mainlandoil.com" required className={inp} />
                <input name="password" type="password" placeholder="Password (min 8)" required className={inp} />
                <input name="confirmPassword" type="password" placeholder="Confirm password" required className={inp} />
              </div>
              <button type="submit" className="mt-4 w-full rounded-xl bg-purple-600 px-4 py-2.5 font-bold text-white hover:bg-purple-500 transition">Create Admin</button>
            </form>

            <form onSubmit={handleCreateSuperAdmin} className="rounded-2xl border border-white/10 bg-[#0d1220] p-5">
              <h2 className="text-base font-bold text-white">Create Super Admin (IT)</h2>
              <p className="text-xs text-slate-500">Any @mainlandoil.com email.</p>
              <div className="mt-4 space-y-3">
                <input name="name" placeholder="Display name" required className={inp} />
                <input name="email" type="email" placeholder="name@mainlandoil.com" required className={inp} />
                <input name="password" type="password" placeholder="Password (min 8)" required defaultValue={IT_SUPER_ADMIN_DEFAULT_PASSWORD} className={inp} />
                <input name="confirmPassword" type="password" placeholder="Confirm password" required defaultValue={IT_SUPER_ADMIN_DEFAULT_PASSWORD} className={inp} />
              </div>
              <button type="submit" className="mt-4 w-full rounded-xl bg-red-600 px-4 py-2.5 font-bold text-white hover:bg-red-500 transition">Create Super Admin</button>
            </form>
          </section>
        )}

        {tab === 'stations' && (
          <section className="mt-5 grid gap-5 lg:grid-cols-2">
            <form onSubmit={handleCreateStation} className="rounded-2xl border border-white/10 bg-[#0d1220] p-5">
              <h2 className="text-base font-bold text-white">Add / Update Station</h2>
              <div className="mt-4 space-y-3">
                <input name="id" placeholder="Station ID (e.g. stn-9)" required className={inp} />
                <input name="name" placeholder="Station name" required className={inp} />
                <input name="location" placeholder="Zone or address" required className={inp} />
              </div>
              <button type="submit" className="mt-4 w-full rounded-xl bg-[#a9cd39] px-4 py-2.5 font-bold text-black hover:bg-[#bcd94a] transition">Save Station</button>
            </form>
            <div className="rounded-2xl border border-white/10 bg-[#0d1220] p-5">
              <h2 className="text-base font-bold text-white">Registered Stations</h2>
              <div className="mt-4 overflow-x-auto rounded-xl border border-white/8">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-white/8 bg-white/[0.03]"><tr><th className="px-3 py-2.5 text-xs font-black uppercase tracking-widest text-slate-400">ID</th><th className="px-3 py-2.5 text-xs font-black uppercase tracking-widest text-slate-400">Name</th><th className="px-3 py-2.5 text-xs font-black uppercase tracking-widest text-slate-400">Location</th></tr></thead>
                  <tbody>{stations.slice().sort((a, b) => a.name.localeCompare(b.name)).map((s) => <tr key={s.id} className="border-b border-white/5"><td className="px-3 py-2.5 font-mono text-xs text-slate-500">{s.id}</td><td className="px-3 py-2.5 font-medium text-white">{s.name}</td><td className="px-3 py-2.5 text-slate-400">{s.location}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {tab === 'reset' && (
          <section className="mt-4 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 shadow">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-red-300">Maintenance</p>
                  <h2 className="mt-1 text-xl font-bold text-white">Report Reset Tools</h2>
                  <p className="mt-1 text-sm text-slate-400">Delete reports only when correcting test data, duplicate submissions, or wrong station/date entries.</p>
                </div>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-slate-300">
                  {reports.length} total reports
                </span>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-400">Reset scope</label>
                  <select
                    value={resetForm.scope}
                    onChange={(e) => setResetForm((prev) => ({ ...prev, scope: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-[#0d1220] px-3 py-3 text-sm text-white"
                  >
                    <option value="single">One station report on one date</option>
                    <option value="station">All reports for one station</option>
                    <option value="range">Reports by date range</option>
                    <option value="all">All reports</option>
                  </select>
                </div>

                {resetForm.scope !== 'all' && (
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-400">
                      Station {resetForm.scope === 'range' ? '(optional)' : ''}
                    </label>
                    <select
                      value={resetForm.stationId}
                      onChange={(e) => setResetForm((prev) => ({ ...prev, stationId: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-[#0d1220] px-3 py-3 text-sm text-white"
                    >
                      <option value="">{resetForm.scope === 'range' ? 'All stations' : 'Select station'}</option>
                      {stations.map((station) => (
                        <option key={station.id} value={station.id}>{station.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {resetForm.scope === 'single' && (
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-400">Report date</label>
                    <input
                      type="date"
                      value={resetForm.date}
                      onChange={(e) => setResetForm((prev) => ({ ...prev, date: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-[#0d1220] px-3 py-3 text-sm text-white"
                    />
                  </div>
                )}

                {resetForm.scope === 'range' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-400">From</label>
                      <input
                        type="date"
                        value={resetForm.fromDate}
                        onChange={(e) => setResetForm((prev) => ({ ...prev, fromDate: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-[#0d1220] px-3 py-3 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-400">To</label>
                      <input
                        type="date"
                        value={resetForm.toDate}
                        onChange={(e) => setResetForm((prev) => ({ ...prev, toDate: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-[#0d1220] px-3 py-3 text-sm text-white"
                      />
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Preview</p>
                  <p className="mt-2 text-3xl font-black text-white">{matchingResetReports.length}</p>
                  <p className="text-sm text-slate-400">matching report(s): {resetSummary}</p>
                </div>

                <button
                  type="button"
                  onClick={handleDeleteReports}
                  disabled={matchingResetReports.length === 0}
                  className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-red-600/20 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Delete Selected Reports
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow dark:bg-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white">Matching Reports</h2>
                  <p className="text-sm text-slate-400">Preview the latest affected records before deletion.</p>
                </div>
                <button type="button" onClick={loadReports} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/5">Refresh</button>
              </div>
              <div className="mt-4 max-h-[520px] overflow-y-auto rounded-xl border border-white/8">
                {matchingResetReports.length ? (
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-[#111827] text-xs uppercase text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Station</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Sales</th>
                        <th className="px-3 py-2">Closing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchingResetReports.slice(0, 80).map((report) => (
                        <tr key={report.id || `${report.station_id}-${report.date}`} className="border-t border-white/8">
                          <td className="px-3 py-2 font-medium text-white">{stationName(report.station_id)}</td>
                          <td className="px-3 py-2 text-slate-300">{report.date}</td>
                          <td className="px-3 py-2 text-slate-400">
                            PMS {Math.round(Number(report.total_sales_liters_pms || 0)).toLocaleString()} · AGO {Math.round(Number(report.total_sales_liters_ago || 0)).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-slate-300">NGN {Math.round(Number(report.closing_balance || 0)).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-6 text-sm text-slate-400">No matching reports for the current reset selection.</div>
                )}
              </div>
              {matchingResetReports.length > 80 && (
                <p className="mt-3 text-xs text-slate-500">Showing first 80 of {matchingResetReports.length} matching reports.</p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
