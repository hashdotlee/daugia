import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import styles from './page.module.css'

// Revalidate this page every 10 seconds to keep auctions relatively fresh
export const revalidate = 10;

export default async function HomePage() {
  const supabase = await createClient()
  
  // Fetch active auctions
  const { data: auctions, error } = await supabase
    .from('auctions')
    .select(`
      *,
      creator:profiles(display_name)
    `)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  return (
    <main className="page-container">
      <div className={styles.heroSection}>
        <h1 className={styles.heroTitle}>Discover & Bid on Exclusive Items</h1>
        <p className={styles.heroSubtitle}>Join the most trusted community of verified buyers and sellers.</p>
        <Link href="/auctions/create" className="btn-primary">
          Start Selling
        </Link>
      </div>

      <h2 className={styles.sectionTitle}>Live Auctions</h2>

      {error ? (
        <div className={styles.errorState}>Failed to load auctions.</div>
      ) : auctions?.length === 0 ? (
        <div className={styles.emptyState}>No active auctions right now. Be the first to create one!</div>
      ) : (
        <div className={styles.grid}>
          {auctions?.map((auction) => (
            <Link href={`/auctions/${auction.id}`} key={auction.id} className={`${styles.card} glass-panel`}>
              <div className={styles.cardContent}>
                <h3 className={styles.cardTitle}>{auction.title}</h3>
                <p className={styles.cardCreator}>By {(auction.creator as any)?.display_name || 'Unknown'}</p>
                <div className={styles.cardDetails}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Starting Price</span>
                    <span className={styles.detailValue}>${auction.start_price.toFixed(2)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Ends At</span>
                    <span className={styles.detailValue}>
                      {new Date(auction.end_time).toLocaleDateString()} {new Date(auction.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                
                <div className={styles.requirements}>
                  {!auction.allow_unverified && (
                    <span className={styles.badge}>Verified Only</span>
                  )}
                  {auction.min_reputation > 0 && (
                    <span className={styles.badge}>Reputation {'>'} {auction.min_reputation}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
