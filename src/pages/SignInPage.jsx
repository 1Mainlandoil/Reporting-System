import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Card from '../components/ui/Card'
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

  const handleSignIn = async (event) => {
    event.preventDefault()
    setNotice('')
    if (!identifier) {
      setNotice('Enter your email or manager username.')
      return
    }
    const password = String(form.password || '')
    if (!password) {
      setNotice('Enter your password.')
      return
    }

    await refreshFromSupabase()
    const latestUsers = useAppStore.getState().users

    if (isEmailLogin) {
      if (!hasSupabaseEnv || !supabase) {
        setNotice('Supabase auth is not configured in this environment.')
        return
      }
      const email = identifier.toLowerCase()
      await supabase.auth.signOut()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
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

    const normalizedUsername = identifier.toLowerCase()
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#a9cd39]/90 px-4 dark:bg-[#a9cd39]/90">
      <Card className="w-full max-w-md">
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
    </div>
  )
}

export default SignInPage
