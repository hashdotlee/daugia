'use client'

import { useEffect, useState, Suspense } from 'react'
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

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const fetchInitial = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setCurrentUser(user)

      // Fetch contacts (people who we sent messages to or received from)
      // This is a complex query for a simple MVP, so we'll just fetch all unique users from messages
      const { data: allMessages } = await supabase
        .from('messages')
        .select('sender_id, receiver_id')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)

      const contactIds = new Set<string>()
      allMessages?.forEach(m => {
        if (m.sender_id !== user.id) contactIds.add(m.sender_id)
        if (m.receiver_id && m.receiver_id !== user.id) contactIds.add(m.receiver_id)
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

      setLoading(false)
    }

    fetchInitial()
  }, [supabase, router, activeUserId])

  useEffect(() => {
    if (!currentUser) return

    const fetchMessages = async () => {
      let query = supabase.from('messages').select('*, sender:profiles!messages_sender_id_fkey(display_name)')
      
      if (isSupport) {
        // Support messages have receiver_id = null
        query = query.is('receiver_id', null)
      } else if (activeUserId) {
        query = query.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeUserId}),and(sender_id.eq.${activeUserId},receiver_id.eq.${currentUser.id})`)
      } else {
        return // no active conversation
      }

      const { data } = await query.order('created_at', { ascending: true })
      setMessages(data || [])
    }

    fetchMessages()

    const channel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          // In a real app, verify the message belongs to the current active chat
          fetchMessages()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUser, activeUserId, isSupport, supabase])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !currentUser) return
    
    setSending(true)
    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          sender_id: currentUser.id,
          receiver_id: isSupport ? null : activeUserId,
          content: newMessage
        })

      if (error) throw error
      setNewMessage('')
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
