import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Card from '../components/ui/Card'
import { DEMO_INSPECTOR } from '../constants/inspectorVisit'
import { useAppStore } from '../store/useAppStore'
import { hasSupabaseEnv, supabase } from '../lib/supabaseClient'

const SignInPage = () => {
  const role = useAppStore((state) => state.role)
  const login = useAppStore((state) => state.login)
  /** Always refresh users before login — hydrateFromSupabase only loads once per session (would hide IT-created accounts). */
  const refreshFromSupabase = useAppStore((state) => state.refreshFromSupabase)
  const getRoleRoute = useAppStore((state) => state.getRoleRoute)
  const [form, setForm] = useState({
    identifier: '',
    password: '',
  })
  const [notice, setNotice] = useState('')
  const navigate = useNavigate()

  if (role) {
    return <Navigate to={getRoleRoute()} replace />
  }

  const identifier = String(form.identifier || '').trim()
  const isEmailLogin = identifier.includes('@')

  const hashPassword = async (value) => {
    const raw = new TextEncoder().encode(String(value || ''))
    const digest = await window.crypto.subtle.digest('SHA-256', raw)
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  }

  const tryInspectorDemoFallback = (email, password, latestUsers) => {
    const isDemoInspector =
      email === DEMO_INSPECTOR.email.toLowerCase() && password === DEMO_INSPECTOR.password
    if (!isDemoInspector) {
      return false
    }
    const matchedUser =
      latestUsers.find((user) => user.id === DEMO_INSPECTOR.userId) ||
      latestUsers.find(
        (user) =>
          user.role === 'inspector' &&
          String(user.email || '').trim().toLowerCase() === DEMO_INSPECTOR.email.toLowerCase(),
      )
    if (!matchedUser?.role) {
      return false
    }
    login('inspector', matchedUser.id)
    navigate('/inspector', { replace: true })
    return true
  }

  const performSignIn = async ({ identifierValue, passwordValue }) => {
    setNotice('')
    const trimmedIdentifier = String(identifierValue || '').trim()
    if (!trimmedIdentifier) {
      setNotice('Enter your email or manager username.')
      return
    }
    const password = String(passwordValue || '')
    if (!password) {
      setNotice('Enter your password.')
      return
    }

    await refreshFromSupabase()
    const latestUsers = useAppStore.getState().users
    const emailLogin = trimmedIdentifier.includes('@')

    if (emailLogin) {
      const email = trimmedIdentifier.toLowerCase()
      if (!hasSupabaseEnv || !supabase) {
        if (tryInspectorDemoFallback(email, password, latestUsers)) {
          return
        }
        setNotice('Supabase auth is not configured in this environment.')
        return
      }
      await supabase.auth.signOut()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        if (tryInspectorDemoFallback(email, password, latestUsers)) {
          return
        }
        const raw = String(error.message || '')
        const lc = raw.toLowerCase()
        const code = String(error.code || '')
        const unconfirmed =
          code === 'email_not_confirmed' || lc.includes('email not confirmed')
        if (unconfirmed) {
          setNotice(
            'This account is still waiting on email confirmation in Supabase. Ask IT to turn off “Confirm email” under Authentication → Providers → Email (recommended), or confirm this user under Authentication → Users.',
          )
          return
        }
        setNotice(raw || 'Invalid credentials.')
        return
      }
      const matchedUser = latestUsers.find(
        (user) => String(user.email || '').trim().toLowerCase() === email,
      )
      if (!matchedUser?.role) {
        await supabase.auth.signOut()
        setNotice('Account not provisioned. Contact IT administrator.')
        return
      }
      login(matchedUser.role, matchedUser.id)
      navigate(useAppStore.getState().getRoleRoute(), { replace: true })
      return
    }

    const normalizedUsername = trimmedIdentifier.toLowerCase()
    const passwordHash = await hashPassword(password)
    const managerCandidates = latestUsers.filter(
      (user) =>
        user.role === 'staff' &&
        String(user.managerUsername || '').trim().toLowerCase() === normalizedUsername,
    )
    if (managerCandidates.length === 0) {
      setNotice('Manager username not found. Contact IT administrator.')
      return
    }
    const matchedByPassword = managerCandidates.filter(
      (user) => String(user.managerPasswordHash || '').trim() === passwordHash,
    )
    if (matchedByPassword.length === 0) {
      setNotice('Invalid manager password.')
      return
    }
    if (matchedByPassword.length > 1) {
      setNotice('Duplicate manager credentials detected. Contact IT administrator.')
      return
    }
    const matchedStaff = matchedByPassword[0]
    login('staff', matchedStaff.id)
    navigate('/staff/report', { replace: true })
  }

  const handleSignIn = async (event) => {
    event.preventDefault()
    await performSignIn({ identifierValue: identifier, passwordValue: form.password })
  }

  const fillDemoInspector = () => {
    setForm({
      identifier: DEMO_INSPECTOR.email,
      password: DEMO_INSPECTOR.password,
    })
    setNotice('')
  }

  const loginDemoInspector = async () => {
    setForm({
      identifier: DEMO_INSPECTOR.email,
      password: DEMO_INSPECTOR.password,
    })
    await performSignIn({
      identifierValue: DEMO_INSPECTOR.email,
      passwordValue: DEMO_INSPECTOR.password,
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#a9cd39]/90 px-4 py-8 dark:bg-[#a9cd39]/90">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="w-full">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Mainland Oil control system</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Sign in here</p>
          <form onSubmit={handleSignIn} className="mt-6 space-y-4">
            {notice && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="whitespace-pre-wrap">{notice}</p>
              </div>
            )}
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Email or Manager Username</span>
              <input
                required
                value={form.identifier}
                onChange={(event) => setForm((prev) => ({ ...prev, identifier: event.target.value }))}
                placeholder="name@mainlandoil.com or manager username"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Password</span>
              <input
                required
                type="password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Enter password"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <button type="submit" className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white">
              Login
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
            Contact your administrator for account provisioning.
          </p>
        </Card>

        <Card className="h-fit w-full border-dashed border-blue-300 bg-blue-50/80 dark:border-blue-500/40 dark:bg-blue-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Demo access</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Station Inspector</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Use this account to test the inspector visit form before go-live.
          </p>
          <dl className="mt-4 space-y-2 rounded-lg border border-blue-200 bg-white/80 px-3 py-3 text-sm dark:border-blue-500/30 dark:bg-slate-900/60">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
              <dd className="font-mono text-slate-900 dark:text-white">{DEMO_INSPECTOR.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Password</dt>
              <dd className="font-mono text-slate-900 dark:text-white">{DEMO_INSPECTOR.password}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={fillDemoInspector}
              className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 dark:border-blue-500/40 dark:bg-slate-900 dark:text-blue-200"
            >
              Fill credentials
            </button>
            <button
              type="button"
              onClick={loginDemoInspector}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Login as demo inspector
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default SignInPage
