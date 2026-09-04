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
        <Link href="/">BidMaster</Link>
      </div>
      <div className={styles.links}>
        {user ? (
          <>
            <Link href="/auctions/create" className={styles.navLink}>Create Auction</Link>
            <Link href="/messages" className={styles.navLink}>Messages</Link>
            <Link href="/profile" className={styles.navLink}>Profile</Link>
            <button onClick={handleSignOut} className="btn-secondary" style={{ padding: '2px 4px' }}>
              Sign Out
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="btn-secondary" style={{ padding: '8px 16px' }}>Log In</Link>
          </>
        )}
      </div>
    </nav>
  )
}
