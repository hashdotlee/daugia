'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import styles from './detail.module.css'

export default function AuctionDetailPage({ params }: { params: { id: string } }) {
  const [auction, setAuction] = useState<any>(null)
  const [bids, setBids] = useState<any[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [bidAmount, setBidAmount] = useState('')
  const [bidLoading, setBidLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          .eq('id', params.id)
          .single()

        if (auctionError) throw auctionError
        setAuction(auctionData)

        // Fetch bids
        const { data: bidsData, error: bidsError } = await supabase
          .from('bids')
          .select('*, bidder:profiles(display_name)')
          .eq('auction_id', params.id)
          .order('amount', { ascending: false })

        if (bidsError) throw bidsError
        setBids(bidsData || [])

        // Set up realtime subscription for bids
        const channel = supabase
          .channel(`public:bids:auction_id=eq.${params.id}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'bids', filter: `auction_id=eq.${params.id}` },
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
  }, [params.id, supabase])

  const handleBid = async (e: React.FormEvent) => {
    e.preventDefault()
    setBidLoading(true)
    setError(null)

    try {
      if (!user) {
        router.push('/login')
        return
      }

      if (!profile) throw new Error('Profile not found.')

      // Check verification
      if (!auction.allow_unverified && !profile.is_verified) {
        throw new Error('You must verify your account (Phone/Facebook) to bid on this auction.')
      }

      // Check reputation
      if (profile.reputation_score < auction.min_reputation) {
        throw new Error(`You need a reputation score of at least ${auction.min_reputation} to bid here.`)
      }

      const amount = parseFloat(bidAmount)
      const currentHighest = bids.length > 0 ? bids[0].amount : auction.start_price

      if (amount <= currentHighest) {
        throw new Error(`Bid must be higher than $${currentHighest}`)
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

  if (loading) return <div className="page-container" style={{ textAlign: 'center', marginTop: '100px' }}>Loading auction...</div>
  if (!auction) return <div className="page-container" style={{ textAlign: 'center', marginTop: '100px' }}>Auction not found.</div>

  const isEnded = new Date() > new Date(auction.end_time) || auction.status !== 'active'
  const currentHighest = bids.length > 0 ? bids[0].amount : auction.start_price

  return (
    <div className="page-container">
      <div className={styles.grid}>
        {/* Left Col: Details */}
        <div className={`${styles.mainContent} glass-panel`}>
          <div className={styles.header}>
            <h1 className={styles.title}>{auction.title}</h1>
            <div className={styles.badges}>
              {auction.status === 'active' && !isEnded ? (
                <span className={styles.badgeActive}>Live</span>
              ) : (
                <span className={styles.badgeEnded}>Ended</span>
              )}
              {!auction.allow_unverified && <span className={styles.badgeInfo}>Verified Only</span>}
            </div>
          </div>
          
          <p className={styles.creator}>Hosted by {(auction.creator as any)?.display_name}</p>
          
          <div className={styles.description}>
            <p>{auction.description}</p>
          </div>
          
          <div className={styles.metaInfo}>
            <div>
              <strong>Ends At:</strong> {new Date(auction.end_time).toLocaleString()}
            </div>
            <div>
              <strong>Min. Reputation:</strong> {auction.min_reputation}
            </div>
          </div>
        </div>

        {/* Right Col: Bidding */}
        <div className={styles.sidebar}>
          <div className={`${styles.biddingPanel} glass-panel`}>
            <div className={styles.currentPrice}>
              <span className={styles.priceLabel}>Current Highest Bid</span>
              <span className={styles.priceValue}>${currentHighest.toFixed(2)}</span>
            </div>

            {error && <div className={styles.errorAlert}>{error}</div>}

            {!isEnded ? (
              <form onSubmit={handleBid} className={styles.bidForm}>
                <div className={styles.inputGroup}>
                  <input
                    type="number"
                    min={currentHighest + 0.01}
                    step="0.01"
                    className="input-field"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder={`> $${currentHighest}`}
                    required
                  />
                </div>
                <button type="submit" className="btn-primary" disabled={bidLoading}>
                  {bidLoading ? 'Placing Bid...' : 'Place Bid'}
                </button>
              </form>
            ) : (
              <div className={styles.endedMessage}>This auction has ended.</div>
            )}
          </div>

          <div className={`${styles.historyPanel} glass-panel`}>
            <h3 className={styles.historyTitle}>Bid History</h3>
            {bids.length === 0 ? (
              <p className={styles.noBids}>No bids yet. Be the first!</p>
            ) : (
              <ul className={styles.bidList}>
                {bids.map((bid) => (
                  <li key={bid.id} className={styles.bidItem}>
                    <span className={styles.bidderName}>{(bid.bidder as any)?.display_name || 'Anonymous'}</span>
                    <span className={styles.bidAmount}>${bid.amount.toFixed(2)}</span>
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
