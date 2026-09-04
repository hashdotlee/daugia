'use client'

import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import styles from './Navbar.module.css'

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUser(data.user)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className={`${styles.navbar} glass-panel`}>
      <div className={styles.logo}>
        <Link href="/">Sàn Đấu Giá</Link>
      </div>
      <div className={styles.links}>
        {user ? (
          <>
            <Link href="/auctions/create" className={styles.navLink}>Tạo Đấu Giá</Link>
            <Link href="/messages" className={styles.navLink}>Tin Nhắn</Link>
            <Link href="/profile" className={styles.navLink}>Hồ Sơ</Link>
            <button onClick={handleSignOut} className="btn-secondary" style={{ padding: '2px 4px' }}>
              Đăng Xuất
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="btn-secondary" style={{ padding: '8px 16px' }}>Đăng Nhập</Link>
          </>
        )}
      </div>
    </nav>
  )
}
