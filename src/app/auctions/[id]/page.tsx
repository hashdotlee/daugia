'use client'

import { useEffect, useState, use } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import styles from './detail.module.css'

export default function AuctionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [auction, setAuction] = useState<any>(null)
  const [bids, setBids] = useState<any[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [bidAmount, setBidAmount] = useState('')
  const [bidLoading, setBidLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Penalty state
  const [penalties, setPenalties] = useState<any[]>([])
  const [penalizing, setPenalizing] = useState(false)

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)

        if (user) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single()
          setProfile(profileData)
        }

        // Fetch auction
        const { data: auctionData, error: auctionError } = await supabase
          .from('auctions')
          .select('*, creator:profiles(display_name)')
          .eq('id', id)
          .single()

        if (auctionError) throw auctionError
        setAuction(auctionData)

        // Fetch bids
        const { data: bidsData, error: bidsError } = await supabase
          .from('bids')
          .select('*, bidder:profiles(display_name)')
          .eq('auction_id', id)
          .order('amount', { ascending: false })

        if (bidsError) throw bidsError
        setBids(bidsData || [])

        // Fetch penalties
        const { data: penaltiesData } = await supabase
          .from('penalties')
          .select('*')
          .eq('auction_id', id)
        setPenalties(penaltiesData || [])

        // Set up realtime subscription for bids
        const channelName = `bids_${id}_${Date.now()}`
        const channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'bids', filter: `auction_id=eq.${id}` },
            async (payload) => {
              // Fetch the bidder profile to display their name
              const { data: bidderProfile } = await supabase
                .from('profiles')
                .select('display_name')
                .eq('id', payload.new.bidder_id)
                .single()
              
              const newBid = {
                ...payload.new,
                bidder: bidderProfile
              }
              
              setBids((currentBids) => {
                const updatedBids = [newBid, ...currentBids]
                return updatedBids.sort((a: any, b: any) => b.amount - a.amount)
              })
            }
          )
          .subscribe()

        return () => {
          supabase.removeChannel(channel)
        }
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id, supabase])

  const handleBid = async (e: React.FormEvent) => {
    e.preventDefault()
    setBidLoading(true)
    setError(null)

    try {
      if (!user) {
        router.push('/login')
        return
      }

      if (!profile) throw new Error('Không tìm thấy hồ sơ.')

      // Check verification
      if (!auction.allow_unverified && !profile.is_verified) {
        throw new Error('Bạn phải xác minh tài khoản (SĐT/Facebook) để đấu giá.')
      }

      // Check reputation
      if (profile.reputation_score < auction.min_reputation) {
        throw new Error(`Bạn cần điểm uy tín ít nhất là ${auction.min_reputation} để tham gia.`)
      }

      const amount = parseFloat(bidAmount)
      const currentHighest = bids.length > 0 ? bids[0].amount : auction.start_price

      if (amount <= currentHighest) {
        throw new Error(`Mức giá phải cao hơn ${currentHighest.toLocaleString('vi-VN')} VNĐ`)
      }

      const { error: insertError } = await supabase
        .from('bids')
        .insert({
          auction_id: auction.id,
          bidder_id: user.id,
          amount
        })

      if (insertError) throw insertError

      setBidAmount('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBidLoading(false)
    }
  }

  const handlePenalty = async (targetUserId: string) => {
    if (!user) return
    if (!confirm('Bạn có chắc chắn muốn phạt người này -5 điểm uy tín? Hành động này không thể hoàn tác!')) return

    setPenalizing(true)
    try {
      const { error: penaltyError } = await supabase
        .from('penalties')
        .insert({
          auction_id: id,
          penalized_by: user.id,
          penalized_user: targetUserId
        })

      if (penaltyError) throw new Error(penaltyError.message)

      alert('Đã ghi nhận điểm phạt -5 uy tín!')
      setPenalties([...penalties, { auction_id: id, penalized_by: user.id, penalized_user: targetUserId }])
    } catch (err: any) {
      alert('Lỗi: ' + err.message)
    } finally {
      setPenalizing(false)
    }
  }

  if (loading) return <div className="page-container" style={{ textAlign: 'center', marginTop: '100px' }}>Đang tải cuộc đấu giá...</div>
  if (!auction) return <div className="page-container" style={{ textAlign: 'center', marginTop: '100px' }}>Không tìm thấy cuộc đấu giá.</div>

  const isEnded = new Date() > new Date(auction.end_time) || auction.status !== 'active'
  const currentHighest = bids.length > 0 ? bids[0].amount : auction.start_price
  const winner = bids.length > 0 ? bids[0].bidder_id : null
  const isCreator = user?.id === auction.creator_id
  const isWinner = user?.id === winner

  const hasPenalizedWinner = penalties.some(p => p.penalized_by === auction.creator_id && p.penalized_user === winner)
  const hasPenalizedCreator = penalties.some(p => p.penalized_by === winner && p.penalized_user === auction.creator_id)

  return (
    <div className="page-container">
      <div className={styles.grid}>
        {/* Left Col: Details */}
        <div className={`${styles.mainContent} glass-panel`}>
          <div className={styles.header}>
            <h1 className={styles.title}>{auction.title}</h1>
            <div className={styles.badges}>
              {auction.status === 'active' && !isEnded ? (
                <span className={styles.badgeActive}>Đang diễn ra</span>
              ) : (
                <span className={styles.badgeEnded}>Đã kết thúc</span>
              )}
              {!auction.allow_unverified && <span className={styles.badgeInfo}>Chỉ Đã Xác Minh</span>}
            </div>
          </div>
          
          <p className={styles.creator}>Tổ chức bởi {(auction.creator as any)?.display_name}</p>
          
          {(() => {
            if (!auction.image_url) return null;
            let urls: string[] = [];
            try {
              const arr = JSON.parse(auction.image_url);
              urls = Array.isArray(arr) ? arr : [auction.image_url];
            } catch {
              urls = [auction.image_url];
            }
            
            return (
              <div style={{ margin: '16px 0', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
                {urls.map((url, idx) => (
                  <img 
                    key={idx}
                    src={url} 
                    alt={`${auction.title} - Ảnh ${idx + 1}`} 
                    style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', border: '1px solid #ccc', borderRadius: '4px' }} 
                  />
                ))}
              </div>
            )
          })()}

          <div className={styles.description}>
            <p>{auction.description}</p>
          </div>
          
          <div className={styles.metaInfo}>
            <div>
              <strong>Kết Thúc:</strong> {new Date(auction.end_time).toLocaleString()}
            </div>
            <div>
              <strong>Uy Tín Tối Thiểu:</strong> {auction.min_reputation}
            </div>
          </div>
        </div>

        {/* Right Col: Bidding */}
        <div className={styles.sidebar}>
          <div className={`${styles.biddingPanel} glass-panel`}>
            <div className={styles.currentPrice}>
              <span className={styles.priceLabel}>Giá Cao Nhất Hiện Tại</span>
              <span className={styles.priceValue}>{currentHighest.toLocaleString('vi-VN')} VNĐ</span>
            </div>

            {error && <div className={styles.errorAlert}>{error}</div>}

            {!isEnded ? (
              <form onSubmit={handleBid} className={styles.bidForm}>
                <div className={styles.inputGroup}>
                  <input
                    type="number"
                    min={currentHighest + 1000}
                    step="1000"
                    className="input-field"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder={`> ${currentHighest.toLocaleString('vi-VN')} VNĐ`}
                    required
                  />
                </div>
                <button type="submit" className="btn-primary" disabled={bidLoading}>
                  {bidLoading ? 'Đang đặt giá...' : 'Đặt Giá'}
                </button>
              </form>
            ) : (
              <div className={styles.endedMessage}>
                Cuộc đấu giá này đã kết thúc.
                {winner && (
                  <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#fff', border: '1px solid #ffcccc', borderRadius: '4px' }}>
                    <h4 style={{ color: '#D50000', marginBottom: '8px' }}>Xử Lý Vi Phạm</h4>
                    {isCreator && (
                      <div>
                        <p style={{ fontSize: '12px', marginBottom: '8px' }}>Nếu người thắng không chịu thanh toán, bạn có thể phạt họ.</p>
                        <button 
                          onClick={() => handlePenalty(winner)} 
                          className="btn-secondary" 
                          disabled={penalizing || hasPenalizedWinner}
                          style={{ borderColor: '#D50000', color: '#D50000' }}
                        >
                          {hasPenalizedWinner ? 'Đã phạt người thắng' : 'Phạt Người Thắng (-5 điểm)'}
                        </button>
                      </div>
                    )}
                    {isWinner && (
                      <div style={{ marginTop: isCreator ? '16px' : '0' }}>
                        <p style={{ fontSize: '12px', marginBottom: '8px' }}>Nếu người bán không giao hàng, bạn có thể phạt họ.</p>
                        <button 
                          onClick={() => handlePenalty(auction.creator_id)} 
                          className="btn-secondary" 
                          disabled={penalizing || hasPenalizedCreator}
                          style={{ borderColor: '#D50000', color: '#D50000' }}
                        >
                          {hasPenalizedCreator ? 'Đã phạt người bán' : 'Phạt Người Bán (-5 điểm)'}
                        </button>
                      </div>
                    )}
                    {!isCreator && !isWinner && (
                      <p style={{ fontSize: '12px', fontStyle: 'italic' }}>Chỉ Người bán và Người thắng mới có quyền phạt lẫn nhau.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={`${styles.historyPanel} glass-panel`}>
            <h3 className={styles.historyTitle}>Lịch Sử Đấu Giá</h3>
            {bids.length === 0 ? (
              <p className={styles.noBids}>Chưa có lượt đặt giá. Hãy là người đầu tiên!</p>
            ) : (
              <ul className={styles.bidList}>
                {bids.map((bid) => (
                  <li key={bid.id} className={styles.bidItem}>
                    <span className={styles.bidderName}>{(bid.bidder as any)?.display_name || 'Ẩn danh'}</span>
                    <span className={styles.bidAmount}>{bid.amount.toLocaleString('vi-VN')} VNĐ</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
