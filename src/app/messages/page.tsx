'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import styles from './messages.module.css'

function MessagesContent() {
  const [messages, setMessages] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  
  const searchParams = useSearchParams()
  const activeUserId = searchParams.get('to')
  const isSupport = searchParams.get('support') === 'true'
  
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const supabase = createClient()
  const router = useRouter()

  const fetchContacts = useCallback(async (userId: string) => {
    try {
      const { data: allMessages } = await supabase
        .from('messages')
        .select('sender_id, receiver_id')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)

      const contactIds = new Set<string>()
      allMessages?.forEach(m => {
        if (m.sender_id !== userId) contactIds.add(m.sender_id)
        if (m.receiver_id && m.receiver_id !== userId) contactIds.add(m.receiver_id)
      })

      if (activeUserId && !contactIds.has(activeUserId)) {
        contactIds.add(activeUserId)
      }

      if (contactIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', Array.from(contactIds))
        setContacts(profiles || [])
      }
    } catch (err) {
      console.error('Error fetching contacts:', err)
    }
  }, [activeUserId, supabase])

  const fetchMessages = useCallback(async () => {
    if (!currentUser || !activeUserId || isSupport) return
    try {
      let query = supabase
        .from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(display_name)')
      
      query = query.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeUserId}),and(sender_id.eq.${activeUserId},receiver_id.eq.${currentUser.id})`)

      const { data, error } = await query.order('created_at', { ascending: true })
      if (!error && data) {
        setMessages(data)
      }
    } catch (err) {
      console.error('Error fetching messages:', err)
    }
  }, [currentUser, activeUserId, isSupport, supabase])

  useEffect(() => {
    const fetchInitial = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setCurrentUser(user)

      if (isSupport) {
        const { data: adminProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'admin')
          .limit(1)
          .single()
        
        if (adminProfile) {
           router.replace('/messages?to=' + adminProfile.id)
           return
        } else {
           alert("Hệ thống chưa thiết lập tài khoản Admin!")
           router.replace('/messages')
           return
        }
      }

      await fetchContacts(user.id)
      setLoading(false)
    }

    fetchInitial()
  }, [supabase, router, activeUserId, isSupport, fetchContacts])

  useEffect(() => {
    if (!currentUser || !activeUserId || isSupport) return

    fetchMessages()

    const channelName = `messages_${currentUser.id}_${activeUserId}_${Date.now()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => {
          fetchMessages()
        }
      )
      .subscribe()

    const interval = setInterval(() => {
      fetchMessages()
    }, 4000)

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [currentUser, activeUserId, isSupport, fetchMessages, supabase])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const content = newMessage.trim()
    if (!content || !currentUser || !activeUserId) return
    
    setSending(true)
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: currentUser.id,
          receiver_id: activeUserId,
          content: content
        })
        .select('*, sender:profiles!messages_sender_id_fkey(display_name)')
        .single()

      if (error) throw error
      setNewMessage('')

      // Optimistic update so message shows immediately
      if (data) {
        setMessages(prev => {
          if (prev.some(m => m.id === data.id)) return prev
          return [...prev, data]
        })
      }

      // Invalidate and fetch latest data
      await fetchMessages()
      if (currentUser?.id) {
        await fetchContacts(currentUser.id)
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSending(false)
    }
  }

  if (loading) return <div>Đang tải...</div>

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <h3>Cuộc trò chuyện</h3>
        <ul className={styles.contactList}>
          <li>
            <Link href="/messages?support=true" className={isSupport ? styles.activeContact : ''}>
              [Kênh Hỗ Trợ]
            </Link>
          </li>
          {contacts.map(c => (
            <li key={c.id}>
              <Link href={`/messages?to=${c.id}`} className={activeUserId === c.id ? styles.activeContact : ''}>
                {c.display_name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.chatArea}>
        {(!activeUserId && !isSupport) ? (
          <div className={styles.emptyState}>Chọn một cuộc trò chuyện hoặc Hỗ Trợ</div>
        ) : (
          <>
            <div className={styles.messagesList}>
              {messages.length === 0 ? <p>Chưa có tin nhắn nào.</p> : null}
              {messages.map(m => {
                const isMe = m.sender_id === currentUser.id
                return (
                  <div key={m.id} className={isMe ? styles.msgRight : styles.msgLeft}>
                    <strong>{isMe ? 'Bạn' : m.sender?.display_name || 'Hệ thống'}: </strong>
                    <span>{m.content}</span>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
            
            <form onSubmit={handleSend} className={styles.composeForm}>
              <input
                type="text"
                className="input-field"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Nhập tin nhắn..."
              />
              <button type="submit" className="btn-primary" disabled={sending}>Gửi</button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default function MessagesPage() {
  return (
    <div className="page-container">
      <h1 style={{ fontSize: '14pt', marginBottom: '10px' }}>Tin Nhắn</h1>
      <Suspense fallback={<div>Đang tải...</div>}>
        <MessagesContent />
      </Suspense>
    </div>
  )
}
