/**
 * Direct password set for Auth email users (supervisors/admins) — no reset email.
 *
 * Deploy:
 *   cd supabase && supabase secrets set IT_PORTAL_SECRET="your-long-random-string"
 *   supabase functions deploy set-auth-password --no-verify-jwt
 *
 * Dashboard: Edge Functions → set-auth-password → turn OFF "Enforce JWT verification"
 *   (or use supabase/config.toml [functions.set-auth-password] verify_jwt = false).
 *
 * IT portal .env: VITE_IT_PORTAL_SECRET=same value as IT_PORTAL_SECRET
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-it-portal-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    const secret = req.headers.get('x-it-portal-secret')
    const expected = Deno.env.get('IT_PORTAL_SECRET')
    if (!expected || secret !== expected) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const body = (await req.json()) as { email?: string; password?: string }
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    if (!email.includes('@') || password.length < 8) {
      return new Response(JSON.stringify({ error: 'Invalid email or password (min 8 characters).' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let authUser: { id: string } | null = null
    let page = 1
    const perPage = 200
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
      authUser = data.users.find((u) => String(u.email || '').toLowerCase() === email) ?? null
      if (authUser || data.users.length < perPage) break
      page += 1
      if (page > 50) break
    }

    if (!authUser) {
      return new Response(
        JSON.stringify({
          error:
            'No Supabase Auth user for this email. Create the account from the IT portal first (supervisor/admin form).',
        }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    const { error: upErr } = await admin.auth.admin.updateUserById(authUser.id, { password })
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
