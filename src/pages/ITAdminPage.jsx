import { useState, useEffect, useCallback, useRef } from 'react'
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
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} autoComplete="new-password" className="w-full rounded border border-slate-300 px-3 py-2 pr-10 text-sm dark:border-slate-600 dark:bg-slate-800" />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">{show ? 'Hide' : 'Show'}</button>
    </div>
  )
}

function SecurityModal({ config, onConfirm, onCancel }) {
  const inputRef = useRef(null)
  const [value, setValue] = useState('')
  useEffect(() => { setValue(''); inputRef.current?.focus() }, [config])
  if (!config) return null
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{config.title}</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{config.hint}</p>
        {config.challengeCode && <p className="mt-2 text-center text-2xl font-mono font-bold text-blue-600">{config.challengeCode}</p>}
        <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">{config.label}</label>
        <input ref={inputRef} type="text" value={value} onChange={(e) => setValue(e.target.value)} placeholder={config.placeholder || ''} inputMode={config.inputMode || 'text'} onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(value) }} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
        <div className="mt-4 flex gap-3 justify-end">
          <button type="button" onClick={onCancel} className="rounded bg-slate-200 px-4 py-2 text-sm font-medium dark:bg-slate-600 dark:text-white">Cancel</button>
          <button type="button" onClick={() => onConfirm(value)} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white">Continue</button>
        </div>
      </div>
    </div>
  )
}

export default function ITAdminPage() {
  const [authed, setAuthed] = useState(false)
  const [secretInput, setSecretInput] = useState('')
  const [notice, setNotice] = useState({ text: '', type: 'ok' })
  const [tab, setTab] = useState('users')
  const [stations, setStations] = useState([])
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [editForm, setEditForm] = useState({})
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

  useEffect(() => { if (authed) { loadStations(); loadUsers() } }, [authed, loadStations, loadUsers])

  const stationName = (id) => stations.find((s) => s.id === id)?.name || id || '-'
  const stationLocation = (id) => stations.find((s) => s.id === id)?.location || '-'

  const handleGateSubmit = (e) => {
    e.preventDefault()
    if (!itSecret) { showNotice('VITE_IT_PORTAL_SECRET is not set in the environment.', 'error'); return }
    if (secretInput.trim() === itSecret) { setAuthed(true); showNotice('') } else { showNotice('Invalid IT portal secret.', 'error') }
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

  if (!hasSupabaseEnv) return <div className="flex min-h-screen items-center justify-center"><p className="text-red-600 font-bold">Supabase is not configured.</p></div>

  if (!authed) return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 dark:bg-slate-900">
      <form onSubmit={handleGateSubmit} className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg dark:bg-slate-800">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">IT Control Portal</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Enter the IT portal secret to continue.</p>
        {notice.text && <p className={`mt-3 rounded p-2 text-xs ${notice.type === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'}`}>{notice.text}</p>}
        <input type="password" value={secretInput} onChange={(e) => setSecretInput(e.target.value)} placeholder="IT_PORTAL_SECRET" className="mt-4 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white" autoFocus />
        <button type="submit" className="mt-4 w-full rounded bg-blue-600 px-4 py-2 font-medium text-white">Unlock</button>
      </form>
    </div>
  )

  const tabBtnClass = (t) => `px-4 py-2 rounded-t text-sm font-medium ${tab === t ? 'bg-white dark:bg-slate-800 text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`

  return (
    <div className="min-h-screen bg-slate-100 p-4 dark:bg-slate-900 md:p-8">
      <SecurityModal config={modalConfig} onConfirm={handleModalConfirm} onCancel={handleModalCancel} />
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">IT Control Portal</h1>
          {notice.text && <p className={`mt-2 rounded p-3 text-sm ${notice.type === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'}`}>{notice.text}</p>}
        </header>

        <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
          <button type="button" className={tabBtnClass('users')} onClick={() => setTab('users')}>Users</button>
          <button type="button" className={tabBtnClass('create')} onClick={() => setTab('create')}>Create Users</button>
          <button type="button" className={tabBtnClass('stations')} onClick={() => setTab('stations')}>Stations</button>
        </nav>

        {tab === 'users' && (
          <section className="mt-4">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, role, station, or email" className="mb-4 w-full max-w-md rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
            <div className="overflow-x-auto rounded-lg bg-white shadow dark:bg-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 dark:bg-slate-700">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Username</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Station</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} onClick={() => setSelectedUser(u)} className={`cursor-pointer border-b hover:bg-slate-50 dark:hover:bg-slate-700 ${selectedUser?.id === u.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                      <td className="px-3 py-2">{u.name || '-'}</td>
                      <td className="px-3 py-2">{roleLabel(u)}</td>
                      <td className="px-3 py-2">{u.role === 'staff' ? u.manager_username || '-' : '-'}</td>
                      <td className="px-3 py-2">{u.email || '-'}</td>
                      <td className="px-3 py-2">{stationName(u.station_id)}</td>
                      <td className="px-3 py-2 space-x-1">
                        <button onClick={(e) => { e.stopPropagation(); handleResetPassword(u) }} className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Reset PW</button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteUser(u) }} className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedUser && (
              <div className="mt-4 rounded-lg bg-white p-5 shadow dark:bg-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white">Edit: {selectedUser.name}</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div><label className="text-xs font-medium text-slate-600 dark:text-slate-300">Name</label><input value={editForm.name || ''} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" /></div>
                  <div><label className="text-xs font-medium text-slate-600 dark:text-slate-300">Email</label><input type="email" value={editForm.email || ''} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" /></div>
                  <div><label className="text-xs font-medium text-slate-600 dark:text-slate-300">Role</label><select value={editForm.role || 'staff'} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"><option value="staff">Manager</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option></select></div>
                  <div><label className="text-xs font-medium text-slate-600 dark:text-slate-300">Station</label><select value={editForm.stationId || ''} onChange={(e) => setEditForm((f) => ({ ...f, stationId: e.target.value, stationLoc: stationLocation(e.target.value) }))} disabled={editForm.role !== 'staff'} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"><option value="">Select station</option>{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                  <div><label className="text-xs font-medium text-slate-600 dark:text-slate-300">Manager Username</label><input value={editForm.managerUsername || ''} onChange={(e) => setEditForm((f) => ({ ...f, managerUsername: e.target.value }))} disabled={editForm.role !== 'staff'} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" /></div>
                  <div><label className="text-xs font-medium text-slate-600 dark:text-slate-300">Manager Password (blank = keep)</label><PasswordInput value={editForm.managerPassword || ''} onChange={(e) => setEditForm((f) => ({ ...f, managerPassword: e.target.value }))} disabled={editForm.role !== 'staff'} /></div>
                </div>
                <div className="mt-4 flex gap-3">
                  <button type="button" onClick={handleSaveEdit} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white">Save Changes</button>
                  <button type="button" onClick={() => setSelectedUser(null)} className="rounded bg-slate-200 px-4 py-2 text-sm font-medium dark:bg-slate-600 dark:text-white">Cancel</button>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === 'create' && (
          <section className="mt-4 grid gap-6 lg:grid-cols-2">
            <form onSubmit={handleCreateManager} className="rounded-lg bg-white p-5 shadow dark:bg-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create Manager</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Station manager with username/password.</p>
              <div className="mt-4 space-y-3">
                <input name="name" placeholder="Full name" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
                <input name="username" placeholder="Login username" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
                <input name="password" type="password" placeholder="Password (min 8)" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
                <input name="confirmPassword" type="password" placeholder="Confirm password" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
                <select name="stationId" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"><option value="">Select station</option>{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                <input name="stationLocation" placeholder="Station location / zone" className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
              </div>
              <button type="submit" className="mt-4 w-full rounded bg-blue-600 px-4 py-2 font-medium text-white">Create Manager</button>
            </form>

            <form onSubmit={handleCreateSupervisor} className="rounded-lg bg-white p-5 shadow dark:bg-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create Supervisor</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Company email for Supabase login.</p>
              <div className="mt-4 space-y-3">
                <input name="name" placeholder="Full name" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
                <input name="email" type="email" placeholder="name@mainlandoil.com" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
                <input name="password" type="password" placeholder="Password (min 8)" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
                <input name="confirmPassword" type="password" placeholder="Confirm password" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
              </div>
              <button type="submit" className="mt-4 w-full rounded bg-green-600 px-4 py-2 font-medium text-white">Create Supervisor</button>
            </form>

            <form onSubmit={handleCreateAdmin} className="rounded-lg bg-white p-5 shadow dark:bg-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create Admin</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Company email for Supabase login.</p>
              <div className="mt-4 space-y-3">
                <input name="name" placeholder="Full name" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
                <input name="email" type="email" placeholder="name@mainlandoil.com" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
                <input name="password" type="password" placeholder="Password (min 8)" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
                <input name="confirmPassword" type="password" placeholder="Confirm password" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
              </div>
              <button type="submit" className="mt-4 w-full rounded bg-purple-600 px-4 py-2 font-medium text-white">Create Admin</button>
            </form>

            <form onSubmit={handleCreateSuperAdmin} className="rounded-lg bg-white p-5 shadow dark:bg-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create Super Admin (IT)</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Any @mainlandoil.com email.</p>
              <div className="mt-4 space-y-3">
                <input name="name" placeholder="Display name" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
                <input name="email" type="email" placeholder="name@mainlandoil.com" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
                <input name="password" type="password" placeholder="Password (min 8)" required defaultValue={IT_SUPER_ADMIN_DEFAULT_PASSWORD} className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
                <input name="confirmPassword" type="password" placeholder="Confirm password" required defaultValue={IT_SUPER_ADMIN_DEFAULT_PASSWORD} className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
              </div>
              <button type="submit" className="mt-4 w-full rounded bg-red-600 px-4 py-2 font-medium text-white">Create Super Admin</button>
            </form>
          </section>
        )}

        {tab === 'stations' && (
          <section className="mt-4 grid gap-6 lg:grid-cols-2">
            <form onSubmit={handleCreateStation} className="rounded-lg bg-white p-5 shadow dark:bg-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Add / Update Station</h2>
              <div className="mt-4 space-y-3">
                <input name="id" placeholder="Station ID (e.g. stn-9)" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
                <input name="name" placeholder="Station name" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
                <input name="location" placeholder="Zone or address" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700" />
              </div>
              <button type="submit" className="mt-4 w-full rounded bg-blue-600 px-4 py-2 font-medium text-white">Save Station</button>
            </form>
            <div className="rounded-lg bg-white p-5 shadow dark:bg-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Registered Stations</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-slate-50 dark:bg-slate-700"><tr><th className="px-3 py-2">ID</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Location</th></tr></thead>
                  <tbody>{stations.slice().sort((a, b) => a.name.localeCompare(b.name)).map((s) => <tr key={s.id} className="border-b"><td className="px-3 py-2 font-mono text-xs">{s.id}</td><td className="px-3 py-2 font-medium">{s.name}</td><td className="px-3 py-2">{s.location}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
