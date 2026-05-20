export const isChatMessageUnread = (message, currentUserId) =>
  Boolean(
    message &&
      currentUserId &&
      message.toUserId === currentUserId &&
      message.fromUserId !== currentUserId &&
      message.status !== 'seen',
  )

/** Prefer seen/read state when merging local optimistic rows with Supabase rows. */
export const mergeChatMessages = (localMessages = [], remoteMessages = []) => {
  const byId = new Map()

  for (const message of remoteMessages) {
    if (message?.id) {
      byId.set(message.id, message)
    }
  }

  for (const message of localMessages) {
    if (!message?.id) {
      continue
    }
    const remote = byId.get(message.id)
    if (!remote) {
      if (['sent', 'delivered', 'failed', 'seen'].includes(String(message.status || ''))) {
        byId.set(message.id, message)
      }
      continue
    }

    const seen =
      message.status === 'seen' || remote.status === 'seen' || message.seenAt || remote.seenAt
    byId.set(message.id, {
      ...remote,
      ...message,
      status: seen ? 'seen' : remote.status || message.status || 'delivered',
      seenAt: message.seenAt || remote.seenAt || null,
      deliveredAt: message.deliveredAt || remote.deliveredAt || null,
    })
  }

  return [...byId.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
}
