import { useEffect } from 'react'
import { hasSupabaseEnv } from '../lib/supabaseClient'
import { startSupabaseRealtime, stopSupabaseRealtime } from '../services/supabaseRealtime'
import { useAppStore } from '../store/useAppStore'

/** Keeps chat, reports, and users in sync via Supabase Realtime (+ refetch when app returns to foreground). */
export const useSupabaseRealtime = () => {
  const role = useAppStore((state) => state.role)
  const hydratedFromSupabase = useAppStore((state) => state.hydratedFromSupabase)
  const applyRemoteChatMessage = useAppStore((state) => state.applyRemoteChatMessage)
  const applyRemoteChatUpdate = useAppStore((state) => state.applyRemoteChatUpdate)
  const applyRemoteReport = useAppStore((state) => state.applyRemoteReport)
  const applyRemoteUser = useAppStore((state) => state.applyRemoteUser)
  const applyRemoteProductRequest = useAppStore((state) => state.applyRemoteProductRequest)
  const refreshFromSupabase = useAppStore((state) => state.refreshFromSupabase)

  useEffect(() => {
    if (!role || !hasSupabaseEnv || !hydratedFromSupabase) {
      return undefined
    }

    startSupabaseRealtime({
      onChatMessage: applyRemoteChatMessage,
      onChatMessageUpdate: applyRemoteChatUpdate,
      onReport: applyRemoteReport,
      onUser: applyRemoteUser,
      onProductRequest: applyRemoteProductRequest,
    })

    return () => {
      stopSupabaseRealtime()
    }
  }, [role, hydratedFromSupabase, applyRemoteChatMessage, applyRemoteChatUpdate, applyRemoteReport, applyRemoteUser, applyRemoteProductRequest])

  useEffect(() => {
    if (!role || !hasSupabaseEnv) {
      return undefined
    }

    const syncOnVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshFromSupabase()
      }
    }

    document.addEventListener('visibilitychange', syncOnVisible)
    window.addEventListener('focus', syncOnVisible)

    return () => {
      document.removeEventListener('visibilitychange', syncOnVisible)
      window.removeEventListener('focus', syncOnVisible)
    }
  }, [role, refreshFromSupabase])
}
