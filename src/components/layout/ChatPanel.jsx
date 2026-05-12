import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useAppStore } from '../../store/useAppStore'

const toTimestamp = (value) => new Date(value || 0).getTime()

const getChatRoleLabel = (role) => {
  if (role === 'staff') return 'Manager'
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'admin') return 'Admin'
  return role || 'User'
}

const AVATAR_COLORS = [
  '#25D366', '#128C7E', '#075E54', '#34B7F1',
  '#00A884', '#5B61B9', '#D4A03C', '#E06C75',
  '#56B6C2', '#C678DD',
]

const getAvatarColor = (id) => {
  let hash = 0
  for (let i = 0; i < (id || '').length; i++) {
    hash = ((hash << 5) - hash + (id || '').charCodeAt(i)) | 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

const getInitials = (name) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name[0].toUpperCase()
}

const Avatar = ({ user, size = 36 }) => {
  const bg = getAvatarColor(user?.id)
  const initials = getInitials(user?.name)
  const fontSize = size < 30 ? 10 : size < 40 ? 12 : 14
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center rounded-full font-bold text-white select-none"
      style={{ width: size, height: size, backgroundColor: bg, fontSize }}
    >
      {initials}
    </div>
  )
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢']

const SingleTick = ({ color = '#8696a0' }) => (
  <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
    <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L5.294 7.063 3.614 5.15a.458.458 0 0 0-.356-.153.514.514 0 0 0-.356.144.477.477 0 0 0-.025.68l2.026 2.297a.464.464 0 0 0 .356.17h.026a.464.464 0 0 0 .356-.178L11.12 1.36a.477.477 0 0 0-.05-.706Z" fill={color} />
  </svg>
)

const DoubleTick = ({ color = '#8696a0' }) => (
  <svg width="18" height="11" viewBox="0 0 18 11" fill="none">
    <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L5.294 7.063 3.614 5.15a.458.458 0 0 0-.356-.153.514.514 0 0 0-.356.144.477.477 0 0 0-.025.68l2.026 2.297a.464.464 0 0 0 .356.17h.026a.464.464 0 0 0 .356-.178L11.12 1.36a.477.477 0 0 0-.05-.706Z" fill={color} />
    <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L9.294 7.063 8.39 6.028l-.718.804 1.233 1.398a.464.464 0 0 0 .356.17h.026a.464.464 0 0 0 .356-.178L15.12 1.36a.477.477 0 0 0-.05-.706Z" fill={color} />
  </svg>
)

const FailedIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="6" stroke="#ef4444" strokeWidth="1.5" />
    <path d="M7 4v3.5M7 9.5v.01" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

const StatusIcon = ({ message }) => {
  if (message.status === 'failed') return <FailedIcon />
  if (message.status === 'seen' || message.seenAt) return <DoubleTick color="#53bdeb" />
  if (message.status === 'delivered' || message.deliveredAt) return <DoubleTick />
  return <SingleTick />
}

const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)

const formatDateLabel = (dateStr) => {
  const today = new Date()
  const d = new Date(dateStr + 'T00:00:00')
  const todayStr = today.toISOString().split('T')[0]
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]
  if (dateStr === todayStr) return 'Today'
  if (dateStr === yesterdayStr) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const BouncingDots = () => (
  <div className="flex items-center gap-[3px] px-3 py-2">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="inline-block h-[6px] w-[6px] rounded-full bg-[#25D366]"
        style={{
          animation: 'chatBounce 1.4s infinite ease-in-out both',
          animationDelay: `${i * 0.16}s`,
        }}
      />
    ))}
  </div>
)

const chatWallpaperBg = 'bg-[#efeae2] dark:bg-[#0b141a]'
const chatWallpaperPattern = {
  backgroundImage:
    'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'p\' width=\'40\' height=\'40\' patternUnits=\'userSpaceOnUse\'%3E%3Ccircle cx=\'20\' cy=\'20\' r=\'1.2\' fill=\'%23d1cdc7\' opacity=\'.35\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width=\'200\' height=\'200\' fill=\'url(%23p)\'/%3E%3C/svg%3E")',
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
  const [reactionsMap, setReactionsMap] = useState({})
  const [hoveredMessageId, setHoveredMessageId] = useState(null)
  const [panelVisible, setPanelVisible] = useState(false)

  const searchInputRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const knownMessageIdsRef = useRef(new Set())
  const chatNotificationCtxRef = useRef(null)
  const hasBootstrappedMessagesRef = useRef(false)
  const notificationPermissionRequestedRef = useRef(false)
  const messagesEndRef = useRef(null)

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
    if (!currentUser?.id) return []
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
        return { user, conversation, lastMessage, hasUnreplied, unreadCount, isPinned, lastTimestamp: toTimestamp(lastMessage?.createdAt) }
      })
      .filter((item) => {
        if (!searchTerm.trim()) return true
        return item.user.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
        if (a.hasUnreplied !== b.hasUnreplied) return a.hasUnreplied ? -1 : 1
        return b.lastTimestamp - a.lastTimestamp
      })
  }, [chatTargets, currentUser?.id, messages, pinnedChatUserIds, searchTerm])

  const selectedSummary = conversationSummaries.find((item) => item.user.id === activeChatUserId) || conversationSummaries[0]
  const selectedUser = selectedSummary?.user || null
  const activeTargetId = selectedUser?.id || ''
  const conversation = selectedSummary?.conversation || []
  const typingKey = `${activeTargetId}:${currentUser?.id || ''}`
  const isActiveTargetTyping = Boolean(activeTargetId && chatTypingMap[typingKey])

  const messagesWithDates = useMemo(() => {
    const items = []
    let lastDate = null
    for (const msg of conversation) {
      const msgDate = msg.createdAt ? new Date(msg.createdAt).toISOString().split('T')[0] : null
      if (msgDate && msgDate !== lastDate) {
        items.push({ type: 'date', date: msgDate, key: `date-${msgDate}` })
        lastDate = msgDate
      }
      items.push({ type: 'message', message: msg, key: msg.id })
    }
    return items
  }, [conversation])

  const formatTimestamp = (value) => {
    if (!value) return ''
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setPanelVisible(true))
    } else {
      setPanelVisible(false)
    }
  }, [isOpen])

  useEffect(() => {
    scrollToBottom()
  }, [conversation.length, scrollToBottom])

  if (!currentUser) return null

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
        setTimeout(() => searchInputRef.current?.focus(), 0)
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
    if (!activeTargetId) setShowMobileConversation(false)
  }, [activeTargetId, isMobileViewport])

  const requestBrowserNotificationPermission = async () => {
    if (notificationPermissionRequestedRef.current) return
    notificationPermissionRequestedRef.current = true
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) return
      if (Notification.permission === 'default') await Notification.requestPermission()
    } catch { /* ignore */ }
  }

  const playIncomingMessageTone = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      if (!chatNotificationCtxRef.current) chatNotificationCtxRef.current = new AudioCtx()
      const ctx = chatNotificationCtxRef.current
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
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
    } catch { /* sound is best-effort */ }
  }

  const showIncomingMessageNotification = (message) => {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) return
      if (Notification.permission !== 'granted') return
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
    } catch { /* best-effort */ }
  }

  useEffect(() => {
    if (!currentUser?.id) return
    const knownIds = knownMessageIdsRef.current
    const newlyArrivedIncoming = []
    for (const message of messages) {
      if (!message?.id || knownIds.has(message.id)) continue
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
    if (!activeTargetId || !draft.trim()) return
    sendChatMessage({ toUserId: activeTargetId, text: draft })
    setTypingStatus({ toUserId: activeTargetId, isTyping: false })
    setDraft('')
  }

  const toggleReaction = (messageId, emoji) => {
    setReactionsMap((prev) => {
      const current = prev[messageId] || []
      if (current.includes(emoji)) {
        const next = current.filter((e) => e !== emoji)
        return { ...prev, [messageId]: next }
      }
      return { ...prev, [messageId]: [...current, emoji] }
    })
    setHoveredMessageId(null)
  }

  const openConversation = (userId) => {
    setActiveChatUserId(userId)
    if (isMobileViewport) setShowMobileConversation(true)
  }

  const closeChatPanel = () => {
    setPanelVisible(false)
    setTimeout(() => {
      setChatOpen(false)
      setShowMobileConversation(false)
    }, 250)
  }

  const showListPane = !isMobileViewport || !showMobileConversation
  const showConversationPane = !isMobileViewport || showMobileConversation

  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      <style>{`
        @keyframes chatBounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes chatMsgIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes chatPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        .chat-panel-enter {
          animation: chatSlideUp 0.25s ease-out forwards;
        }
        .chat-panel-exit {
          opacity: 0;
          transform: translateY(20px) scale(0.97);
          transition: opacity 0.2s, transform 0.2s;
        }
        .chat-msg-in {
          animation: chatMsgIn 0.25s ease-out forwards;
        }
        .chat-unread-pulse {
          animation: chatPulse 2s infinite;
        }
        .chat-bubble-tail-right::after {
          content: '';
          position: absolute;
          bottom: 6px;
          right: -6px;
          width: 0;
          height: 0;
          border: 6px solid transparent;
          border-left-color: #075E54;
          border-bottom: 0;
        }
        .chat-bubble-tail-left::after {
          content: '';
          position: absolute;
          bottom: 6px;
          left: -6px;
          width: 0;
          height: 0;
          border: 6px solid transparent;
          border-right-color: #ffffff;
          border-bottom: 0;
        }
        .dark .chat-bubble-tail-left::after {
          border-right-color: #1e293b;
        }
      `}</style>

      {isOpen && (
        <div
          className={`mb-3 overflow-hidden border shadow-2xl ${
            panelVisible ? 'chat-panel-enter' : 'chat-panel-exit'
          } ${
            isMobileViewport
              ? 'fixed inset-0 z-[70] h-screen w-screen rounded-none border-transparent'
              : 'flex h-[580px] w-[880px] max-w-[calc(100vw-2rem)] rounded-2xl border-[#00A884]/30'
          } bg-white dark:bg-[#111b21]`}
        >
          {/* ───── Contact List Pane ───── */}
          {showListPane && (
            <div
              className={`flex flex-col ${
                isMobileViewport ? 'h-full w-full' : 'w-[320px] border-r border-slate-200 dark:border-slate-700/50'
              }`}
            >
              <div className="bg-[#008069] px-4 py-3 dark:bg-[#202c33]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar user={currentUser} size={32} />
                    <p className="text-sm font-semibold text-white">Chats</p>
                  </div>
                  {isMobileViewport && (
                    <button
                      type="button"
                      onClick={closeChatPanel}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-white/80 transition hover:text-white hover:bg-white/10"
                    >
                      Close
                    </button>
                  )}
                </div>
                <div className="relative mt-3">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search or start new chat"
                    className="w-full rounded-lg border-0 bg-[#005c4b] py-2 pl-10 pr-3 text-sm text-white placeholder-white/50 outline-none transition focus:bg-[#004d40] dark:bg-[#2a3942] dark:focus:bg-[#323f49]"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-white dark:bg-[#111b21]">
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
                      className={`flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left transition-colors dark:border-slate-800/50 ${
                        isActive
                          ? 'bg-[#f0f2f5] dark:bg-[#2a3942]'
                          : 'hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]'
                      }`}
                    >
                      <Avatar user={item.user} size={42} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1">
                            <p className="truncate text-[14px] font-medium text-slate-900 dark:text-slate-100">{item.user.name}</p>
                            {item.isPinned && <span className="text-[10px]">📌</span>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <p className={`text-[11px] ${item.unreadCount > 0 ? 'text-[#25D366] font-medium' : 'text-slate-500'}`}>
                              {formatTimestamp(item.lastMessage?.createdAt)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <p className="truncate text-[12.5px] text-slate-500 dark:text-slate-400">
                            {item.lastMessage ? item.lastMessage.text : `Start chat with ${item.user.name}`}
                          </p>
                          <div className="flex items-center gap-1.5">
                            {item.unreadCount > 0 && (
                              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25D366] px-1 text-[10px] font-bold text-white">
                                {item.unreadCount}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                togglePinnedChatUser(item.user.id)
                              }}
                              className="rounded px-1 py-0.5 text-[10px] text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
                              title={pinnedChatUserIds.includes(item.user.id) ? 'Unpin' : 'Pin'}
                            >
                              {pinnedChatUserIds.includes(item.user.id) ? 'Unpin' : 'Pin'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ───── Conversation Pane ───── */}
          {showConversationPane && (
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Header */}
              <div className="flex items-center justify-between bg-[#008069] px-4 py-2.5 dark:bg-[#202c33]">
                <div className="flex items-center gap-3">
                  {isMobileViewport && (
                    <button
                      type="button"
                      onClick={() => setShowMobileConversation(false)}
                      className="mr-1 text-white/80 transition hover:text-white"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </button>
                  )}
                  {selectedUser && <Avatar user={selectedUser} size={36} />}
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {selectedUser ? selectedUser.name : 'Select a user to chat'}
                    </p>
                    {selectedUser && (
                      <p className="text-[11px] text-white/60">{getChatRoleLabel(selectedUser.role)}</p>
                    )}
                  </div>
                </div>
                {!isMobileViewport && (
                  <button
                    type="button"
                    onClick={closeChatPanel}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium text-white/80 transition hover:text-white hover:bg-white/10"
                  >
                    Close
                  </button>
                )}
              </div>

              {/* Messages area */}
              <div
                className={`flex-1 overflow-y-auto px-4 py-3 ${chatWallpaperBg}`}
                style={chatWallpaperPattern}
              >
                {!conversation.length && (
                  <div className="flex h-full items-center justify-center">
                    <p className="rounded-lg bg-white/80 px-4 py-2 text-xs text-slate-500 shadow-sm dark:bg-slate-800/80">
                      No messages yet. Say hello!
                    </p>
                  </div>
                )}

                {messagesWithDates.map((item) => {
                  if (item.type === 'date') {
                    return (
                      <div key={item.key} className="my-3 flex justify-center">
                        <span className="rounded-lg bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm dark:bg-[#1e2b32] dark:text-slate-300">
                          {formatDateLabel(item.date)}
                        </span>
                      </div>
                    )
                  }

                  const message = item.message
                  const mine = message.fromUserId === currentUser.id
                  const sender = !mine ? users.find((u) => u.id === message.fromUserId) : null
                  const reactions = reactionsMap[message.id] || []
                  const isHovered = hoveredMessageId === message.id

                  return (
                    <div
                      key={item.key}
                      className={`chat-msg-in mb-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}
                      onMouseEnter={() => setHoveredMessageId(message.id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
                    >
                      {!mine && sender && (
                        <div className="mr-1.5 mt-auto mb-1">
                          <Avatar user={sender} size={24} />
                        </div>
                      )}
                      <div className="relative max-w-[75%]">
                        <div
                          className={`relative rounded-lg px-3 py-1.5 text-[13px] leading-[1.35] shadow-sm ${
                            mine
                              ? 'bg-[#005c4b] text-white chat-bubble-tail-right dark:bg-[#005c4b]'
                              : 'bg-white text-slate-900 chat-bubble-tail-left dark:bg-[#1e293b] dark:text-slate-100'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{message.text}</p>
                          <div className={`mt-0.5 flex items-center justify-end gap-1 ${mine ? 'text-[10px] text-emerald-200/70' : 'text-[10px] text-slate-400'}`}>
                            <span>{formatTimestamp(message.createdAt)}</span>
                            {mine && <StatusIcon message={message} />}
                          </div>
                        </div>

                        {/* Reactions display */}
                        {reactions.length > 0 && (
                          <div className={`mt-0.5 flex gap-0.5 ${mine ? 'justify-end' : 'justify-start'}`}>
                            {reactions.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => toggleReaction(message.id, emoji)}
                                className="rounded-full bg-white px-1.5 py-0.5 text-[12px] shadow-sm transition hover:scale-110 dark:bg-slate-700"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Reaction picker */}
                        {isHovered && (
                          <div
                            className={`absolute -top-8 z-10 flex gap-0.5 rounded-full bg-white px-1.5 py-1 shadow-lg transition-opacity dark:bg-slate-700 ${
                              mine ? 'right-0' : 'left-0'
                            }`}
                          >
                            {REACTION_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => toggleReaction(message.id, emoji)}
                                className="rounded-full px-1 text-[14px] transition hover:scale-125 hover:bg-slate-100 dark:hover:bg-slate-600"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {isActiveTargetTyping && (
                  <div className="mb-1.5 flex justify-start">
                    <div className="mr-1.5 mt-auto mb-1">
                      {selectedUser && <Avatar user={selectedUser} size={24} />}
                    </div>
                    <div className="rounded-lg bg-white px-1 py-0.5 shadow-sm dark:bg-[#1e293b]">
                      <BouncingDots />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              <div className="flex items-center gap-2 bg-[#f0f2f5] px-4 py-3 dark:bg-[#202c33]">
                <input
                  disabled={!activeTargetId}
                  value={draft}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setDraft(nextValue)
                    if (activeTargetId) {
                      setTypingStatus({ toUserId: activeTargetId, isTyping: nextValue.trim().length > 0 })
                      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
                      typingTimeoutRef.current = setTimeout(() => {
                        setTypingStatus({ toUserId: activeTargetId, isTyping: false })
                      }, 1200)
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleSend()
                  }}
                  placeholder={activeTargetId ? 'Type a message' : 'Select a user to start chatting'}
                  className="flex-1 rounded-lg border-0 bg-white px-4 py-2.5 text-sm outline-none transition dark:bg-[#2a3942] dark:text-white dark:placeholder-slate-400"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!activeTargetId || !draft.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00A884] text-white shadow-sm transition hover:bg-[#008069] disabled:opacity-40"
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───── FAB Button ───── */}
      <button
        type="button"
        onClick={() => {
          requestBrowserNotificationPermission()
          if (isOpen) {
            closeChatPanel()
          } else {
            setChatOpen(true)
          }
        }}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl transition hover:bg-[#128C7E]"
        aria-label={chatUnreadTotal > 0 ? `Chat, ${chatUnreadTotal} unread` : 'Open chat'}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.077 4.928C17.191 3.041 14.683 2.001 12.011 2c-5.506 0-9.987 4.479-9.989 9.985a9.964 9.964 0 0 0 1.333 4.993L2 22l5.233-1.237a9.963 9.963 0 0 0 4.773 1.216h.004c5.505 0 9.986-4.48 9.988-9.985a9.93 9.93 0 0 0-2.921-7.066ZM12.012 20.015h-.003a8.273 8.273 0 0 1-4.222-1.156l-.303-.18-3.143.824.839-3.064-.197-.314a8.275 8.275 0 0 1-1.268-4.14c.002-4.577 3.729-8.303 8.308-8.303a8.25 8.25 0 0 1 5.868 2.432 8.248 8.248 0 0 1 2.429 5.874c-.002 4.577-3.729 8.303-8.308 8.303v-.276.276Zm4.558-6.22c-.25-.125-1.478-.729-1.708-.812-.229-.083-.396-.125-.563.125-.167.25-.646.812-.792.979-.146.166-.292.187-.541.062-.25-.125-1.054-.388-2.008-1.237-.742-.662-1.243-1.479-1.388-1.729-.146-.25-.016-.385.109-.51.112-.112.25-.291.375-.437.125-.146.166-.25.25-.416.083-.167.041-.312-.021-.437-.063-.125-.563-1.354-.771-1.854-.203-.487-.41-.421-.563-.429l-.479-.008a.919.919 0 0 0-.667.312c-.229.25-.875.854-.875 2.083s.896 2.416 1.021 2.583c.125.167 1.763 2.692 4.271 3.775.596.258 1.063.412 1.426.527.599.19 1.144.163 1.575.099.48-.072 1.478-.604 1.687-1.187.208-.583.208-1.083.146-1.187-.063-.104-.229-.167-.479-.292Z" />
        </svg>
        {!isOpen && chatUnreadTotal > 0 && (
          <span className="chat-unread-pulse absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
            {chatUnreadTotal > 99 ? '99+' : chatUnreadTotal}
          </span>
        )}
      </button>
    </div>
  )
}

export default ChatPanel
