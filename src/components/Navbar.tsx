'use client'

import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import styles from './Navbar.module.css'
import NotificationManager from './NotificationManager'

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const supabase = createClient()
  const router = useRouter()

  const checkUserRole = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      setIsAdmin(false)
      return
    }
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser.id)
        .single()
      
      setIsAdmin(profile?.role === 'admin')
    } catch {
      setIsAdmin(false)
    }
  }, [supabase])

  useEffect(() => {
    // Initial fetch
    supabase.auth.getUser().then(({ data: { user: initialUser } }) => {
      setUser(initialUser)
      checkUserRole(initialUser)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user || null
        setUser(currentUser)
        await checkUserRole(currentUser)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase, checkUserRole])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className={`${styles.navbar} glass-panel`}>
      <div className={styles.logo}>
        <Link href="/">Sàn Đấu Giá</Link>
      </div>
      <div className={styles.links}>
        {user ? (
          <>
            {isAdmin && (
              <Link href="/admin" className={styles.navLink} style={{ color: '#FFEB3B', fontWeight: 'bold' }}>
                Quản Lý
              </Link>
            )}
            <Link href="/auctions/create" className={styles.navLink}>Tạo Đấu Giá</Link>
            <Link href="/messages" className={styles.navLink}>
              Tin Nhắn
              {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
            </Link>
            <Link href="/profile" className={styles.navLink}>Hồ Sơ</Link>
            <button 
              onClick={handleSignOut} 
              style={{ 
                padding: '4px 10px', 
                fontSize: '9pt', 
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: 'white',
                border: '1px solid white',
                borderRadius: '3px'
              }}
            >
              Đăng Xuất
            </button>
          </>
        ) : (
          <>
            <Link 
              href="/login" 
              style={{ 
                padding: '4px 10px', 
                fontSize: '9pt',
                backgroundColor: 'transparent',
                color: 'white',
                border: '1px solid white',
                borderRadius: '3px',
                textDecoration: 'none'
              }}
            >
              Đăng Nhập
            </Link>
          </>
        )}
      </div>
      <NotificationManager 
        currentUser={user} 
        isAdmin={isAdmin} 
        onUnreadChange={setUnreadCount} 
      />
    </nav>
  )
}
