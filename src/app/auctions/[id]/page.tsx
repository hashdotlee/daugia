'use client'

import { useEffect, useState, useCallback, useRef, use } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { User } from '@supabase/supabase-js'
import styles from './detail.module.css'

function deduplicateBids(rawBids: any[]): any[] {
  if (!Array.isArray(rawBids)) return []
  const seenIds = new Set<string>()
  const seenAmountUser = new Set<string>()
  const result: any[] = []

  for (const bid of rawBids) {
    if (!bid || seenIds.has(bid.id)) continue
    seenIds.add(bid.id)

    // Filter duplicate bid by same bidder for same amount
    const duplicateKey = `${bid.bidder_id}_${bid.amount}`
    if (seenAmountUser.has(duplicateKey)) {
      continue
    }
    seenAmountUser.add(duplicateKey)
    result.push(bid)
  }

  return result.sort((a, b) => b.amount - a.amount)
}

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
  const isSubmittingRef = useRef(false)
  
  // Penalty state
  const [penalties, setPenalties] = useState<any[]>([])
  const [penalizing, setPenalizing] = useState(false)

  const supabase = createClient()
  const router = useRouter()

  const fetchBids = useCallback(async () => {
    try {
      const { data: bidsData, error: bidsError } = await supabase
        .from('bids')
        .select('*, bidder:profiles(id, display_name, reputation_score, is_verified)')
        .eq('auction_id', id)
        .order('amount', { ascending: false })

      if (!bidsError && bidsData) {
        setBids(deduplicateBids(bidsData))
      }
    } catch {
      // background polling quiet fail
    }
  }, [id, supabase])

  const fetchAuction = useCallback(async () => {
    try {
      const { data: auctionData, error: auctionError } = await supabase
        .from('auctions')
        .select('*, creator:profiles(id, display_name, reputation_score, is_verified, facebook_link)')
        .eq('id', id)
        .single()

      if (!auctionError && auctionData) {
        setAuction(auctionData)
      }
    } catch {
      // background polling quiet fail
    }
  }, [id, supabase])

  useEffect(() => {
    let isMounted = true

    const initData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!isMounted) return
        setUser(user)

        if (user) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single()
          if (isMounted) setProfile(profileData)
        }

        // Fetch auction
        const { data: auctionData, error: auctionError } = await supabase
          .from('auctions')
          .select('*, creator:profiles(id, display_name, reputation_score, is_verified, facebook_link)')
          .eq('id', id)
          .single()

        if (auctionError) throw auctionError
        if (isMounted) setAuction(auctionData)

        // Fetch bids
        await fetchBids()

        // Fetch penalties
        const { data: penaltiesData } = await supabase
          .from('penalties')
          .select('*')
          .eq('auction_id', id)
        if (isMounted) setPenalties(penaltiesData || [])

      } catch (err: any) {
        if (isMounted) setError(err.message)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    initData()

    // Realtime subscription for bids
    const channelName = `bids_${id}_${Date.now()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `auction_id=eq.${id}` },
        () => {
          fetchBids()
        }
      )
      .subscribe()

    // Continuous polling every 2.5 seconds to guarantee latest price updates
    let pollCount = 0
    const interval = setInterval(() => {
      fetchBids()
      pollCount++
      // Periodically refresh auction status every ~10s
      if (pollCount % 4 === 0) {
        fetchAuction()
      }
    }, 2500)

    return () => {
      isMounted = false
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [id, supabase, fetchBids, fetchAuction])

  const handleBid = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmittingRef.current || bidLoading) return
    isSubmittingRef.current = true
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

      if (isNaN(amount) || amount <= currentHighest) {
        throw new Error(`Mức giá phải cao hơn ${currentHighest.toLocaleString('vi-VN')} VNĐ`)
      }

      const { data: insertedBid, error: insertError } = await supabase
        .from('bids')
        .insert({
          auction_id: auction.id,
          bidder_id: user.id,
          amount
        })
        .select('*, bidder:profiles(id, display_name, reputation_score, is_verified)')
        .single()

      if (insertError) throw insertError

      setBidAmount('')

      // Optimistic update with deduplication
      if (insertedBid) {
        setBids(prev => deduplicateBids([insertedBid, ...prev]))
      }

      // Immediately re-fetch latest bids
      await fetchBids()
    } catch (err: any) {
      setError(err.message)
    } finally {
      isSubmittingRef.current = false
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

  // Real-time countdown timer state (ticks every second)
  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const getTimeLeft = (endTimeStr: string) => {
    const diff = new Date(endTimeStr).getTime() - now
    if (diff <= 0) {
      return { isEnded: true, text: 'Đã kết thúc', isUrgent: false }
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
    const minutes = Math.floor((diff / (1000 * 60)) % 60)
    const seconds = Math.floor((diff / 1000) % 60)

    const pad = (n: number) => n.toString().padStart(2, '0')
    const timeFormatted = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    const text = days > 0 ? `${days} ngày ${timeFormatted}` : timeFormatted

    return {
      isEnded: false,
      text,
      isUrgent: diff < 5 * 60 * 1000 // urgent when under 5 minutes
    }
  }

  if (loading) return <div className="page-container" style={{ textAlign: 'center', marginTop: '100px' }}>Đang tải cuộc đấu giá...</div>
  if (!auction) return <div className="page-container" style={{ textAlign: 'center', marginTop: '100px' }}>Không tìm thấy cuộc đấu giá.</div>

  const timeLeft = getTimeLeft(auction.end_time)
  const isEnded = timeLeft.isEnded || auction.status !== 'active'
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
          
          <div className={styles.sellerBox}>
            <div className={styles.sellerInfo}>
              <span className={styles.sellerLabel}>Người bán:</span>
              <Link href={`/users/${auction.creator_id}`} className={styles.sellerName} title="Xem trang cá nhân người bán">
                {(auction.creator as any)?.display_name || 'Ẩn danh'}
              </Link>
              <span className={styles.sellerReputation}>
                ⭐ Uy tín: <strong>{(auction.creator as any)?.reputation_score ?? 0}</strong>
              </span>
              {(auction.creator as any)?.is_verified && (
                <span className={styles.verifiedBadge}>✓ Đã xác minh</span>
              )}
            </div>

            <div className={styles.sellerActions}>
              <Link href={`/users/${auction.creator_id}`} className={styles.sellerBtnSecondary}>
                Xem Thông Tin
              </Link>
              {user?.id !== auction.creator_id && (
                <Link href={`/messages?to=${auction.creator_id}`} className={styles.sellerBtnPrimary}>
                  💬 Nhắn Tin
                </Link>
              )}
            </div>
          </div>
          
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
              {!timeLeft.isEnded ? (
                <span style={{ marginLeft: '8px', color: timeLeft.isUrgent ? '#D50000' : '#2e7d32', fontWeight: 'bold' }}>
                  (Còn {timeLeft.text})
                </span>
              ) : (
                <span style={{ marginLeft: '8px', color: '#D50000', fontWeight: 'bold' }}>
                  (Đã kết thúc)
                </span>
              )}
            </div>
            <div>
              <strong>Uy Tín Tối Thiểu:</strong> {auction.min_reputation}
            </div>
          </div>
        </div>

        {/* Right Col: Bidding */}
        <div className={styles.sidebar}>
          <div className={`${styles.biddingPanel} glass-panel`}>
            {/* Countdown Clock */}
            <div className={`${styles.timerBox} ${timeLeft.isUrgent ? styles.timerUrgent : ''} ${timeLeft.isEnded ? styles.timerEnded : ''}`}>
              <span className={styles.timerLabel}>
                {timeLeft.isEnded ? 'Trạng Thái:' : '⏱️ Thời Gian Còn Lại:'}
              </span>
              <span className={styles.timerValue}>
                {timeLeft.text}
              </span>
            </div>

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
                {bids.map((bid) => {
                  const bidderId = bid.bidder_id || (bid.bidder as any)?.id
                  const bidderName = (bid.bidder as any)?.display_name || 'Ẩn danh'
                  const repScore = (bid.bidder as any)?.reputation_score
                  const isMe = user?.id === bidderId

                  return (
                    <li key={bid.id} className={styles.bidItem}>
                      <div className={styles.bidLeft}>
                        <div className={styles.bidderWrapper}>
                          {bidderId ? (
                            <Link 
                              href={`/users/${bidderId}`} 
                              className={styles.bidderLink} 
                              title="Bấm để xem trang cá nhân"
                            >
                              {bidderName}
                            </Link>
                          ) : (
                            <span className={styles.bidderName}>{bidderName}</span>
                          )}

                          {/* Chỉ hiển thị điểm uy tín và nút nhắn tin khi hover vào tên */}
                          <div className={styles.bidderHoverInfo}>
                            {repScore !== undefined && repScore !== null && (
                              <span className={styles.bidderRep} title="Điểm uy tín">
                                ⭐ Uy tín: {repScore}
                              </span>
                            )}
                            {isMe && (
                              <span className={styles.bidMeBadge}>Bạn</span>
                            )}
                            {!isMe && bidderId && (
                              <Link 
                                href={`/messages?to=${bidderId}`} 
                                className={styles.bidMsgBtn}
                                title={`Nhắn tin cho ${bidderName}`}
                              >
                                💬 Nhắn tin
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className={styles.bidRight}>
                        <span className={styles.bidAmount}>{bid.amount.toLocaleString('vi-VN')} VNĐ</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
