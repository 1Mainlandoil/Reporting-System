import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../components/ui/Card'
import { useAppStore } from '../store/useAppStore'
import { hasSupabaseEnv, supabase } from '../lib/supabaseClient'
import { PENDING_AUTH_EMAIL_KEY, PENDING_AUTH_ROLE_KEY } from '../constants/authStorage'

const AuthCallbackPage = () => {
  const navigate = useNavigate()
  const isEmailAuthorizedForRole = useAppStore((state) => state.isEmailAuthorizedForRole)
  const [message, setMessage] = useState('Finishing secure sign-in...')
  const [recoveryPath, setRecoveryPath] = useState('/sign-in')
  const [recoveryLabel, setRecoveryLabel] = useState('Back to sign in')

  useEffect(() => {
    let cancelled = false
    const completeAuth = async () => {
      if (!hasSupabaseEnv || !supabase) {
        if (!cancelled) {
          setMessage('Supabase auth is not configured. Please return to login.')
        }
        return
      }

      const hashParams = new URLSearchParams(window.location.hash.slice(1))
      const searchParams = new URL(window.location.href).searchParams
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const authCode = searchParams.get('code')
      const pendingRole = localStorage.getItem(PENDING_AUTH_ROLE_KEY)
      const fallbackPath = '/sign-in'
      const fallbackLabel = 'Request a new magic link'

      if (!cancelled) {
        setRecoveryPath(fallbackPath)
        setRecoveryLabel(fallbackLabel)
      }

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error) {
          if (!cancelled) {
            setMessage(error.message || 'Unable to verify sign-in link. Request a new one.')
          }
          return
        }
      } else if (authCode) {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href)
        if (error) {
          if (!cancelled) {
            setMessage(error.message || 'Unable to verify sign-in link. Request a new one.')
          }
          return
        }
      } else {
        const authError = searchParams.get('error_description') || searchParams.get('error') || ''
        if (!cancelled) {
          setMessage(
            authError
              ? `${decodeURIComponent(authError)}. Request a new sign-in link.`
              : 'Invalid or expired sign-in link. Request a new one.',
          )
        }
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      const verifiedEmail = String(user?.email || '').toLowerCase()
      const pendingEmail = String(localStorage.getItem(PENDING_AUTH_EMAIL_KEY) || '').toLowerCase()
      const resolvedRole = pendingRole === 'admin' ? 'admin' : pendingRole === 'supervisor' ? 'supervisor' : ''

      if (!verifiedEmail || !resolvedRole) {
        if (!cancelled) {
          setMessage('Unable to determine your role after verification. Please login again.')
        }
        return
      }
      if (pendingEmail && pendingEmail !== verifiedEmail) {
        if (!cancelled) {
          setMessage('This magic link email does not match the email you entered.')
        }
        return
      }

      const isAuthorized = isEmailAuthorizedForRole({
        role: resolvedRole,
        email: verifiedEmail,
      })
      if (!isAuthorized) {
        await supabase.auth.signOut()
        if (!cancelled) {
          setMessage('Verified email is not authorized for this role. Contact your admin.')
        }
        return
      }

      if (!cancelled) {
        navigate('/set-password', { replace: true })
      }
    }

    completeAuth()
    return () => {
      cancelled = true
    }
  }, [isEmailAuthorizedForRole, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#a9cd39]/90 px-4 dark:bg-[#a9cd39]/90">
      <Card className="w-full max-w-md">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Authentication</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{message}</p>
        {(message.toLowerCase().includes('expired') ||
          message.toLowerCase().includes('invalid') ||
          message.toLowerCase().includes('unable')) && (
          <button
            type="button"
            onClick={() => navigate(recoveryPath, { replace: true })}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
          >
            {recoveryLabel}
          </button>
        )}
      </Card>
    </div>
  )
}

export default AuthCallbackPage
