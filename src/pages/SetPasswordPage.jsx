import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../components/ui/Card'
import { hasSupabaseEnv, supabase } from '../lib/supabaseClient'
import { PENDING_AUTH_EMAIL_KEY, PENDING_AUTH_ROLE_KEY } from '../constants/authStorage'

const SetPasswordPage = () => {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [notice, setNotice] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setNotice('')

    if (!hasSupabaseEnv || !supabase) {
      setNotice('Supabase auth is not configured in this environment.')
      return
    }
    if (!password || password.length < 8) {
      setNotice('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setNotice('Passwords do not match.')
      return
    }

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setNotice(error.message || 'Unable to set password.')
      return
    }

    await supabase.auth.signOut()
    localStorage.removeItem(PENDING_AUTH_ROLE_KEY)
    localStorage.removeItem(PENDING_AUTH_EMAIL_KEY)
    navigate('/sign-in', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#a9cd39]/90 px-4 dark:bg-[#a9cd39]/90">
      <Card className="w-full max-w-md">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Set Password</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Create your password for future logins.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {notice && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              {notice}
            </div>
          )}
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Password</span>
            <input
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Confirm Password</span>
            <input
              required
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter password"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <button className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white">Save Password</button>
        </form>
      </Card>
    </div>
  )
}

export default SetPasswordPage
