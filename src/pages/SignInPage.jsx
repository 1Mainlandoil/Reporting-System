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
    if (window.crypto?.subtle) {
      const raw = new TextEncoder().encode(String(value || ''))
      const digest = await window.crypto.subtle.digest('SHA-256', raw)
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    }
    // Fallback for non-secure contexts (HTTP on local IP)
    const str = String(value || '')
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19
    const k = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
    ]
    const bytes = new TextEncoder().encode(str)
    const len = bytes.length
    const bitLen = len * 8
    const padLen = ((len + 9 + 63) & ~63)
    const msg = new Uint8Array(padLen)
    msg.set(bytes)
    msg[len] = 0x80
    const view = new DataView(msg.buffer)
    view.setUint32(padLen - 4, bitLen >>> 0, false)
    view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false)
    const rotr = (x, n) => (x >>> n) | (x << (32 - n))
    const add = (...args) => args.reduce((a, b) => (a + b) >>> 0)
    for (let i = 0; i < padLen; i += 64) {
      const w = new Uint32Array(64)
      for (let j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4, false)
      for (let j = 16; j < 64; j++) {
        const s0 = rotr(w[j-15],7) ^ rotr(w[j-15],18) ^ (w[j-15] >>> 3)
        const s1 = rotr(w[j-2],17) ^ rotr(w[j-2],19) ^ (w[j-2] >>> 10)
        w[j] = add(w[j-16], s0, w[j-7], s1)
      }
      let [a,b,c,d,e,f,g,h] = [h0,h1,h2,h3,h4,h5,h6,h7]
      for (let j = 0; j < 64; j++) {
        const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25)
        const ch = (e & f) ^ (~e & g)
        const temp1 = add(h, S1, ch, k[j], w[j])
        const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22)
        const maj = (a & b) ^ (a & c) ^ (b & c)
        const temp2 = add(S0, maj)
        ;[h,g,f,e,d,c,b,a] = [g,f,e,add(d,temp1),c,b,a,add(temp1,temp2)]
      }
      ;[h0,h1,h2,h3,h4,h5,h6,h7] = [add(h0,a),add(h1,b),add(h2,c),add(h3,d),add(h4,e),add(h5,f),add(h6,g),add(h7,h)]
    }
    return [h0,h1,h2,h3,h4,h5,h6,h7]
      .map((n) => n.toString(16).padStart(8, '0'))
      .join('')
  }

  const handleSignIn = async (event) => {
    event.preventDefault()
    setNotice('Signing in...')
    try {
      await handleSignInInner()
    } catch (err) {
      setNotice('Unexpected error: ' + String(err?.message || err))
    }
  }

  const handleSignInInner = async () => {
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
    <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-4">
      <Card className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#a9cd39]/15 border border-[#a9cd39]/25">
            <span className="text-2xl">⛽</span>
          </div>
          <h1 className="text-xl font-bold text-white">Mainland Oil</h1>
          <p className="text-xs uppercase tracking-widest text-[#a9cd39]">Control System</p>
        </div>
        <form onSubmit={handleSignIn} className="space-y-4">
          {notice && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <p className="whitespace-pre-wrap">{notice}</p>
            </div>
          )}
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Email or Manager Username</span>
            <input
              required
              value={form.identifier}
              onChange={(event) => setForm((prev) => ({ ...prev, identifier: event.target.value }))}
              placeholder="username or email@mainlandoil.com"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-[#a9cd39]/50 focus:outline-none focus:ring-1 focus:ring-[#a9cd39]/30"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Password</span>
            <input
              required
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Enter password"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-[#a9cd39]/50 focus:outline-none focus:ring-1 focus:ring-[#a9cd39]/30"
            />
          </label>
          <button type="submit" className="mt-2 w-full rounded-xl bg-[#a9cd39] py-3 text-sm font-bold text-black hover:bg-[#bcd94a] transition">
            Sign In
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-600">
          Contact your administrator for access.
        </p>
      </Card>
    </div>
  )
}

export default SignInPage
