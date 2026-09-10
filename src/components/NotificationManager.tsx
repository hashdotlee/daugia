'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import styles from './Notification.module.css'

interface ToastItem {
  id: string
  senderId: string
  senderName: string
  content: string
}

interface MessageRecord {
  id: string
  sender_id: string
  receiver_id?: string | null
  content: string
  created_at?: string
  sender?: {
    display_name?: string
  }
}

interface NotificationManagerProps {
  currentUser: User | null
  isAdmin: boolean
  onUnreadChange?: (updater: number | ((prev: number) => number)) => void
}

function playNotificationSound() {
  if (typeof window === 'undefined') return
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    // Two-tone pleasant chime: D5 (587Hz) then A5 (880Hz)
    osc.frequency.setValueAtTime(587.33, ctx.currentTime)
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch {
    // Audio context may be restricted before first user interaction
  }
}

export default function NotificationManager({
  currentUser,
  isAdmin,
  onUnreadChange
}: NotificationManagerProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  
  const seenMessageIds = useRef<Set<string>>(new Set())
  const lastCheckedTimeRef = useRef<string>(new Date().toISOString())

  // Request browser notification permission once
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  // Clear unread badge when user visits /messages
  useEffect(() => {
    if (pathname === '/messages') {
      onUnreadChange?.(0)
    }
  }, [pathname, onUnreadChange])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const handleOpenChat = useCallback((senderId: string, toastId: string) => {
    dismissToast(toastId)
    router.push(`/messages?to=${senderId}`)
  }, [dismissToast, router])

  const notifyMessage = useCallback(async (msg: MessageRecord) => {
    if (!msg || !currentUser) return
    if (msg.sender_id === currentUser.id) return
    if (seenMessageIds.current.has(msg.id)) return

    seenMessageIds.current.add(msg.id)

    // Check if user is already in this chat
    const currentParamTo = typeof window !== 'undefined' 
      ? new URLSearchParams(window.location.search).get('to') 
      : null

    const isCurrentChat = pathname === '/messages' && currentParamTo === msg.sender_id

    // Fetch sender profile name if not present
    let senderName = msg.sender?.display_name
    if (!senderName) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', msg.sender_id)
        .single()
      senderName = profile?.display_name || 'Người dùng'
    }

    if (!isCurrentChat) {
      // Increment unread count badge
      onUnreadChange?.((prev: number) => prev + 1)

      // Play audio notification
      playNotificationSound()

      // Desktop notification if permitted
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(`Tin nhắn mới từ ${senderName}`, {
            body: msg.content,
            icon: '/favicon.ico'
          })
        } catch {
          // ignore notification error
        }
      }

      // Show toast
      const newToast: ToastItem = {
        id: msg.id,
        senderId: msg.sender_id,
        senderName,
        content: msg.content
      }

      setToasts(prev => [...prev.slice(-2), newToast])

      // Auto dismiss after 6s
      setTimeout(() => {
        dismissToast(msg.id)
      }, 6000)
    }
  }, [currentUser, pathname, supabase, onUnreadChange, dismissToast])

  useEffect(() => {
    if (!currentUser) {
      return
    }

    lastCheckedTimeRef.current = new Date(Date.now() - 5000).toISOString()

    // Realtime channel
    const channel = supabase
      .channel(`user_notifications_${currentUser.id}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        async (payload) => {
          const newMsg = payload.new as MessageRecord
          if (!newMsg) return
          if (newMsg.receiver_id === currentUser.id || (isAdmin && !newMsg.receiver_id)) {
            await notifyMessage(newMsg)
          }
        }
      )
      .subscribe()

    // Periodic check backup (every 5 seconds)
    const interval = setInterval(async () => {
      try {
        let query = supabase
          .from('messages')
          .select('id, sender_id, receiver_id, content, created_at, sender:profiles!messages_sender_id_fkey(display_name)')
          .gt('created_at', lastCheckedTimeRef.current)
          .order('created_at', { ascending: true })

        if (isAdmin) {
          query = query.or(`receiver_id.eq.${currentUser.id},receiver_id.is.null`)
        } else {
          query = query.eq('receiver_id', currentUser.id)
        }

        const { data, error } = await query
        if (!error && data && data.length > 0) {
          lastCheckedTimeRef.current = data[data.length - 1].created_at
          for (const msg of data) {
            await notifyMessage(msg as MessageRecord)
          }
        }
      } catch {
        // ignore polling error
      }
    }, 5000)

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [currentUser, isAdmin, supabase, notifyMessage])

  if (!currentUser || toasts.length === 0) return null

  return (
    <div className={styles.toastContainer}>
      {toasts.map(t => (
        <div 
          key={t.id} 
          className={styles.toast}
          onClick={() => handleOpenChat(t.senderId, t.id)}
        >
          <div className={styles.toastIcon}>💬</div>
          <div className={styles.toastBody}>
            <div className={styles.toastHeader}>
              <span className={styles.toastSender}>{t.senderName}</span>
              <button 
                className={styles.toastClose}
                onClick={(e) => {
                  e.stopPropagation()
                  dismissToast(t.id)
                }}
                title="Đóng"
              >
                ×
              </button>
            </div>
            <div className={styles.toastContent}>{t.content}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
