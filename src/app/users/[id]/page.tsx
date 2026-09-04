'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from './user.module.css'

export default function PublicProfilePage({ params }: { params: { id: string } }) {
  const [profile, setProfile] = useState<any>(null)
  const [auctions, setAuctions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setCurrentUser(user)

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', params.id)
          .single()

        if (profileError) throw profileError
        setProfile(profileData)

        const { data: auctionsData } = await supabase
          .from('auctions')
          .select('*')
          .eq('creator_id', params.id)
          .order('created_at', { ascending: false })

        setAuctions(auctionsData || [])
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [params.id, supabase])

  const handleVote = async (score: number) => {
    if (!currentUser) {
      router.push('/login')
      return
    }
    if (currentUser.id === params.id) {
      alert("Bạn không thể tự vote cho chính mình.")
      return
    }

    setVoting(true)
    try {
      const { error: voteError } = await supabase
        .from('reputation_votes')
        .upsert({
          voter_id: currentUser.id,
          target_id: params.id,
          score
        }, { onConflict: 'voter_id,target_id' })

      if (voteError) throw voteError
      
      alert('Đã ghi nhận! (Điểm số có thể cập nhật trễ)')
    } catch (err: any) {
      alert(err.message)
    } finally {
      setVoting(false)
    }
  }

  if (loading) return <div className="page-container">Đang tải...</div>
  if (!profile) return <div className="page-container">Không tìm thấy người dùng.</div>

  return (
    <div className="page-container">
      <div className={styles.profileHeader}>
        <h1 className={styles.title}>{profile.display_name}</h1>
        <div className={styles.meta}>
          Uy tín: {profile.reputation_score} | 
          Trạng thái: {profile.is_verified ? 'Đã xác minh' : 'Chưa xác minh'}
        </div>
        
        {currentUser && currentUser.id !== params.id && (
          <div className={styles.actions}>
            <button className="btn-secondary" onClick={() => handleVote(1)} disabled={voting}>Thích (+1)</button>
            <button className="btn-secondary" onClick={() => handleVote(-1)} disabled={voting}>Không thích (-1)</button>
            <Link href={`/messages?to=${profile.id}`} className="btn-primary" style={{marginLeft: '10px'}}>Nhắn Tin</Link>
          </div>
        )}
      </div>

      <div className={styles.auctionsList}>
        <h3>Các cuộc đấu giá của {profile.display_name}</h3>
        {auctions.length === 0 ? (
          <p>Không có cuộc đấu giá nào.</p>
        ) : (
          <ul>
            {auctions.map(a => (
              <li key={a.id}>
                <Link href={`/auctions/${a.id}`}>{a.title}</Link> - {a.start_price.toLocaleString('vi-VN')} VNĐ ({a.status})
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
