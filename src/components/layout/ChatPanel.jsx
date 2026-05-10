import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'

const toTimestamp = (value) => new Date(value || 0).getTime()
const getChatRoleLabel = (role) => {
  if (role === 'staff') {
    return 'Manager'
  }
  if (role === 'supervisor') {
    return 'Supervisor'
  }
  if (role === 'admin') {
    return 'Admin'
  }
  return role || 'User'
}

const ChatPanel = () => {
  const currentUser = useAppStore((state) => state.currentUser)
  const users = useAppStore((state) => state.users)
  const messages = useAppStore((state) => state.chatMessages)
  const sendChatMessage = useAppStore((state) => state.sendChatMessage)
  const isOpen = useAppStore((state) => state.isChatOpen)
  const setChatOpen = useAppStore((state) => state.setChatOpen)
  const activeChatUserId = useAppStore((state) => state.activeChatUserId)
  const setActiveChatUserId = useAppStore((state) => state.setActiveChatUserId)
  const pinnedChatUserIds = useAppStore((state) => state.pinnedChatUserIds)
  const togglePinnedChatUser = useAppStore((state) => state.togglePinnedChatUser)
  const chatTypingMap = useAppStore((state) => state.chatTypingMap)
  const setTypingStatus = useAppStore((state) => state.setTypingStatus)
  const markConversationSeen = useAppStore((state) => state.markConversationSeen)
  const chatUnreadTotal = useMemo(() => {
    const uid = currentUser?.id
    if (!uid) return 0
    return messages.filter(
      (m) => m.toUserId === uid && m.fromUserId !== uid && String(m.status || '') !== 'seen',
    ).length
  }, [currentUser?.id, messages])
  const [draft, setDraft] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  )
  const [showMobileConversation, setShowMobileConversation] = useState(false)
  const searchInputRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const knownMessageIdsRef = useRef(new Set())
  const chatNotificationCtxRef = useRef(null)
  const hasBootstrappedMessagesRef = useRef(false)
  const notificationPermissionRequestedRef = useRef(false)

  const chatTargets = useMemo(() => {
    const currentRole = currentUser?.role
    return users
      .filter((user) => user.id !== currentUser?.id)
      .filter((user) => {
        if (currentRole === 'staff') {
          return user.role === 'supervisor' || user.role === 'admin'
        }
        return true
      })
  }, [currentUser?.id, currentUser?.role, users])

  const conversationSummaries = useMemo(() => {
    if (!currentUser?.id) {
      return []
    }

    return chatTargets
      .map((user) => {
        const conversation = messages
          .filter(
            (message) =>
              (message.fromUserId === currentUser.id && message.toUserId === user.id) ||
              (message.fromUserId === user.id && message.toUserId === currentUser.id),
          )
          .sort((a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt))
        const lastMessage = conversation.at(-1)
        const hasUnreplied = Boolean(lastMessage && lastMessage.fromUserId === user.id)
        const unreadCount = conversation.filter(
          (message) => message.fromUserId === user.id && message.toUserId === currentUser.id && message.status !== 'seen',
        ).length
        const isPriorityRole = user.role === 'supervisor' || user.role === 'admin'
        const isPinned = isPriorityRole || pinnedChatUserIds.includes(user.id)
        return {
          user,
          conversation,
          lastMessage,
          hasUnreplied,
          unreadCount,
          isPinned,
          lastTimestamp: toTimestamp(lastMessage?.createdAt),
        }
      })
      .filter((item) => {
        if (!searchTerm.trim()) {
          return true
        }
        return item.user.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1
        }
        if (a.hasUnreplied !== b.hasUnreplied) {
          return a.hasUnreplied ? -1 : 1
        }
        return b.lastTimestamp - a.lastTimestamp
      })
  }, [chatTargets, currentUser?.id, messages, pinnedChatUserIds, searchTerm])

  const selectedSummary =
    conversationSummaries.find((item) => item.user.id === activeChatUserId) || conversationSummaries[0]
  const selectedUser = selectedSummary?.user || null
  const activeTargetId = selectedUser?.id || ''
  const conversation = selectedSummary?.conversation || []
  const typingKey = `${activeTargetId}:${currentUser?.id || ''}`
  const isActiveTargetTyping = Boolean(activeTargetId && chatTypingMap[typingKey])

  const formatTimestamp = (value) => {
    if (!value) {
      return ''
    }
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  if (!currentUser) {
    return null
  }

  useEffect(() => {
    if (isOpen && activeTargetId) {
      markConversationSeen(activeTargetId)
    }
  }, [activeTargetId, isOpen, markConversationSeen, messages.length])

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setChatOpen(true)
        setTimeout(() => {
          searchInputRef.current?.focus()
        }, 0)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setChatOpen])

  useEffect(() => {
    const onResize = () => setIsMobileViewport(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!isMobileViewport) {
      setShowMobileConversation(false)
      return
    }
    if (!activeTargetId) {
      setShowMobileConversation(false)
    }
  }, [activeTargetId, isMobileViewport])

  const requestBrowserNotificationPermission = async () => {
    if (notificationPermissionRequestedRef.current) {
      return
    }
    notificationPermissionRequestedRef.current = true
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        return
      }
      if (Notification.permission === 'default') {
        await Notification.requestPermission()
      }
    } catch {
      // Ignore permission request issues.
    }
  }

  const playIncomingMessageTone = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) {
        return
      }
      if (!chatNotificationCtxRef.current) {
        chatNotificationCtxRef.current = new AudioCtx()
      }
      const ctx = chatNotificationCtxRef.current
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {
          // Ignore resume failures caused by autoplay policy.
        })
      }
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.22)
    } catch {
      // Sound is best-effort only.
    }
  }

  const showIncomingMessageNotification = (message) => {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        return
      }
      if (Notification.permission !== 'granted') {
        return
      }
      const sender = users.find((user) => user.id === message.fromUserId)
      const senderName = sender?.name || 'New message'
      const notification = new Notification(`Message from ${senderName}`, {
        body: String(message.text || '').slice(0, 140) || 'Open chat to view message',
        tag: `chat-${message.id}`,
      })
      notification.onclick = () => {
        window.focus()
        setChatOpen(true)
        setActiveChatUserId(message.fromUserId || '')
        notification.close()
      }
    } catch {
      // Browser notifications are best-effort.
    }
  }

  useEffect(() => {
    if (!currentUser?.id) {
      return
    }
    const knownIds = knownMessageIdsRef.current
    const newlyArrivedIncoming = []
    for (const message of messages) {
      if (!message?.id || knownIds.has(message.id)) {
        continue
      }
      knownIds.add(message.id)
      if (
        hasBootstrappedMessagesRef.current &&
        message.toUserId === currentUser.id &&
        message.fromUserId !== currentUser.id
      ) {
        newlyArrivedIncoming.push(message)
      }
    }
    if (!hasBootstrappedMessagesRef.current) {
      hasBootstrappedMessagesRef.current = true
      return
    }
    if (newlyArrivedIncoming.length > 0) {
      playIncomingMessageTone()
      const shouldShowBrowserNotification =
        document.hidden || !isOpen || (activeTargetId && !newlyArrivedIncoming.every((msg) => msg.fromUserId === activeTargetId))
      if (shouldShowBrowserNotification) {
        showIncomingMessageNotification(newlyArrivedIncoming.at(-1))
      }
    }
  }, [activeTargetId, currentUser?.id, isOpen, messages, users])

  const handleSend = () => {
    if (!activeTargetId) {
      return
    }
    sendChatMessage({ toUserId: activeTargetId, text: draft })
    setTypingStatus({ toUserId: activeTargetId, isTyping: false })
    setDraft('')
  }

  const getMessageStatusLabel = (message) => {
    if (message.status === 'failed') {
      return 'failed to sync'
    }
    if (message.status === 'seen' || message.seenAt) {
      return 'seen'
    }
    if (message.status === 'delivered' || message.deliveredAt) {
      return 'delivered'
    }
    return 'sent'
  }

  const openConversation = (userId) => {
    setActiveChatUserId(userId)
    if (isMobileViewport) {
      setShowMobileConversation(true)
    }
  }

  const closeChatPanel = () => {
    setChatOpen(false)
    setShowMobileConversation(false)
  }

  const showListPane = !isMobileViewport || !showMobileConversation
  const showConversationPane = !isMobileViewport || showMobileConversation

  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      {isOpen && (
        <div
          className={`mb-3 overflow-hidden border border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 ${
            isMobileViewport
              ? 'fixed inset-0 z-[70] h-screen w-screen rounded-none'
              : 'flex h-[560px] w-[860px] max-w-[calc(100vw-2rem)] rounded-3xl'
          }`}
        >
          {showListPane && (
            <div
              className={`flex flex-col ${
                isMobileViewport ? 'h-full w-full' : 'w-[320px] border-r border-slate-200 dark:border-slate-800'
              }`}
            >
            <div className="border-b border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-100">Chats</p>
                {isMobileViewport && (
                  <button
                    type="button"
                    onClick={closeChatPanel}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Close
                  </button>
                )}
              </div>
              <input
                ref={searchInputRef}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search registered users..."
                className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {!conversationSummaries.length && (
                <p className="p-4 text-xs text-slate-500">No users matched your search.</p>
              )}
              {conversationSummaries.map((item) => {
                const isActive = item.user.id === activeTargetId
                return (
                  <button
                    key={item.user.id}
                    type="button"
                    onClick={() => openConversation(item.user.id)}
                    className={`w-full border-b border-slate-200 px-4 py-3 text-left transition dark:border-slate-800 ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-500/15 dark:to-indigo-500/10'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1">
                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{item.user.name}</p>
                        {item.isPinned && <span className="text-xs text-amber-500">📌</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] text-slate-500">{formatTimestamp(item.lastMessage?.createdAt)}</p>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            togglePinnedChatUser(item.user.id)
                          }}
                          className="rounded-md px-1.5 py-0.5 text-[11px] text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-800 dark:hover:bg-slate-700/70 dark:hover:text-slate-200"
                          title={pinnedChatUserIds.includes(item.user.id) ? 'Unpin chat' : 'Pin chat'}
                        >
                          {pinnedChatUserIds.includes(item.user.id) ? 'Unpin' : 'Pin'}
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-slate-500">
                        {item.lastMessage?.text || `Start chat with ${item.user.name}`}
                      </p>
                      {item.unreadCount > 0 && (
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                          {item.unreadCount}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
            </div>
          )}
          {showConversationPane && (
            <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              {isMobileViewport && (
                <button
                  type="button"
                  onClick={() => setShowMobileConversation(false)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Back
                </button>
              )}
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {selectedUser ? `${selectedUser.name} (${getChatRoleLabel(selectedUser.role)})` : 'Select a user to chat'}
              </p>
            </div>
            {!isMobileViewport && (
              <button
                type="button"
                onClick={closeChatPanel}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Close
              </button>
            )}
          </div>
          {isActiveTargetTyping && (
            <p className="px-4 pt-2 text-xs text-emerald-600">{selectedUser?.name} is typing...</p>
          )}
          <div className="mx-4 my-3 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/60 p-3 dark:border-slate-800 dark:from-slate-950 dark:to-slate-900/40">
            {!conversation.length && <p className="text-xs text-slate-500">No messages yet.</p>}
            {conversation.map((message) => {
              const mine = message.fromUserId === currentUser.id
              return (
                <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs shadow-sm ${
                      mine
                        ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <p>{message.text}</p>
                    <p className={`mt-1 text-[10px] ${mine ? 'text-blue-100' : 'text-slate-500 dark:text-slate-300'}`}>
                      {formatTimestamp(message.createdAt)}
                      {mine ? ` - ${getMessageStatusLabel(message)}` : ''}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mx-4 mb-4 flex gap-2">
            <input
              disabled={!activeTargetId}
              value={draft}
              onChange={(event) => {
                const nextValue = event.target.value
                setDraft(nextValue)
                if (activeTargetId) {
                  setTypingStatus({ toUserId: activeTargetId, isTyping: nextValue.trim().length > 0 })
                  if (typingTimeoutRef.current) {
                    clearTimeout(typingTimeoutRef.current)
                  }
                  typingTimeoutRef.current = setTimeout(() => {
                    setTypingStatus({ toUserId: activeTargetId, isTyping: false })
                  }, 1200)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleSend()
                }
              }}
              placeholder={activeTargetId ? 'Type message...' : 'Select a user to start chatting'}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!activeTargetId}
              className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50"
            >
              Send
            </button>
          </div>
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          requestBrowserNotificationPermission()
          setChatOpen(!isOpen)
        }}
        className="relative rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-xl transition hover:from-blue-500 hover:to-indigo-500"
        aria-label={chatUnreadTotal > 0 ? `Chat, ${chatUnreadTotal} unread` : 'Open chat'}
      >
        Chat
        {!isOpen && chatUnreadTotal > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-600 px-1 text-[11px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
            {chatUnreadTotal > 99 ? '99+' : chatUnreadTotal}
          </span>
        )}
      </button>
    </div>
  )
}

export default ChatPanel
