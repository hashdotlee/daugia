'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import styles from './profile.module.css'
import { User } from '@supabase/supabase-js'

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [phone, setPhone] = useState('')
  const [facebookLink, setFacebookLink] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }
        setUser(user)

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (error) throw error

        setProfile(data)
        setPhone(data.phone || '')
        setFacebookLink(data.facebook_link || '')
      } catch (err) {
        console.error('Error fetching profile:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [router, supabase])

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setUpdating(true)
    setMessage(null)

    try {
      if (!user) throw new Error('Not authenticated')

      // Simple verification logic: if they provide either, mark as verified
      const isVerified = (phone.length > 5 || facebookLink.length > 5)

      const { error } = await supabase
        .from('profiles')
        .update({
          phone,
          facebook_link: facebookLink,
          is_verified: isVerified
        })
        .eq('id', user.id)

      if (error) throw error

      setProfile({ ...profile, phone, facebook_link: facebookLink, is_verified: isVerified })
      setMessage({ type: 'success', text: 'Profile updated successfully!' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return <div className="page-container" style={{ textAlign: 'center', marginTop: '100px' }}>Loading...</div>
  }

  return (
    <div className="page-container">
      <div className={`${styles.profileContainer} glass-panel`}>
        <h1 className={styles.title}>Your Profile</h1>
        
        <div className={styles.statusSection}>
          <div className={styles.statusBadge} style={{ background: profile?.is_verified ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: profile?.is_verified ? 'var(--success)' : 'var(--danger)' }}>
            {profile?.is_verified ? '✓ Verified Account' : '⚠ Unverified Account'}
          </div>
          <div className={styles.scoreBadge}>
            Reputation: <strong>{profile?.reputation_score}</strong>
          </div>
        </div>

        {message && (
          <div className={styles.alert} style={{ background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: message.type === 'success' ? 'var(--success)' : 'var(--danger)' }}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleUpdate} className={styles.form}>
          <div className={styles.inputGroup}>
            <label>Display Name (Public)</label>
            <input
              type="text"
              className="input-field"
              value={profile?.display_name || ''}
              disabled
              style={{ opacity: 0.7, cursor: 'not-allowed' }}
            />
          </div>
          <div className={styles.inputGroup}>
            <label>Phone Number</label>
            <input
              type="text"
              className="input-field"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+84 123 456 789"
            />
          </div>
          <div className={styles.inputGroup}>
            <label>Facebook Profile Link</label>
            <input
              type="url"
              className="input-field"
              value={facebookLink}
              onChange={(e) => setFacebookLink(e.target.value)}
              placeholder="https://facebook.com/username"
            />
            <small className={styles.helperText}>Provide phone or Facebook link to verify your account and start bidding everywhere.</small>
          </div>
          
          <button type="submit" className="btn-primary" disabled={updating}>
            {updating ? 'Saving...' : 'Save & Verify'}
          </button>
        </form>
      </div>
    </div>
  )
}
