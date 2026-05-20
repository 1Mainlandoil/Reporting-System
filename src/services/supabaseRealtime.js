import { hasSupabaseEnv, supabase } from '../lib/supabaseClient'
import { mapChatMessageRow, mapReportRow, mapUserRow } from './supabaseData'

let activeUnsubscribe = null

const attachPostgresListener = (channel, config, handler) => {
  channel.on('postgres_changes', config, (payload) => {
    const row = payload.new
    if (!row || typeof row !== 'object') {
      return
    }
    handler(row)
  })
}

export const subscribeToLiveData = ({ onChatMessage, onChatMessageUpdate, onReport, onUser }) => {
  if (!hasSupabaseEnv || !supabase) {
    return () => {}
  }

  const channel = supabase.channel('app-live-sync', {
    config: {
      broadcast: { self: false },
    },
  })

  if (onChatMessage) {
    attachPostgresListener(
      channel,
      { event: 'INSERT', schema: 'public', table: 'chat_messages' },
      (row) => onChatMessage(mapChatMessageRow(row)),
    )
  }

  if (onChatMessageUpdate) {
    attachPostgresListener(
      channel,
      { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
      (row) => onChatMessageUpdate(mapChatMessageRow(row)),
    )
  }

  if (onReport) {
    attachPostgresListener(
      channel,
      { event: 'INSERT', schema: 'public', table: 'daily_reports' },
      (row) => onReport(mapReportRow(row)),
    )
    attachPostgresListener(
      channel,
      { event: 'UPDATE', schema: 'public', table: 'daily_reports' },
      (row) => onReport(mapReportRow(row)),
    )
  }

  if (onUser) {
    attachPostgresListener(
      channel,
      { event: 'INSERT', schema: 'public', table: 'users' },
      (row) => onUser(mapUserRow(row)),
    )
    attachPostgresListener(
      channel,
      { event: 'UPDATE', schema: 'public', table: 'users' },
      (row) => onUser(mapUserRow(row)),
    )
  }

  channel.subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export const startSupabaseRealtime = (handlers) => {
  stopSupabaseRealtime()
  activeUnsubscribe = subscribeToLiveData(handlers)
}

export const stopSupabaseRealtime = () => {
  activeUnsubscribe?.()
  activeUnsubscribe = null
}
