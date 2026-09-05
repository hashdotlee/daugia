import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import styles from './page.module.css'

// Đảm bảo trang luôn lấy dữ liệu mới nhất, không bị cache
export const dynamic = 'force-dynamic';

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
        <h1 className={styles.heroTitle}>Khám Phá & Đấu Giá Trực Tuyến</h1>
        <p className={styles.heroSubtitle}>Tham gia cộng đồng mua bán uy tín và an toàn.</p>
        <Link href="/auctions/create" className="btn-primary">
          Bắt Đầu Bán
        </Link>
      </div>

      <h2 className={styles.sectionTitle}>Các Cuộc Đấu Giá Đang Diễn Ra</h2>

      {error ? (
        <div className={styles.errorState}>Không thể tải dữ liệu đấu giá.</div>
      ) : auctions?.length === 0 ? (
        <div className={styles.emptyState}>Hiện chưa có cuộc đấu giá nào. Hãy là người đầu tiên tạo đấu giá!</div>
      ) : (
        <div className={styles.grid}>
          {auctions?.map((auction) => {
            const firstImage = (() => {
              if (!auction.image_url) return null;
              try {
                const arr = JSON.parse(auction.image_url);
                return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
              } catch {
                return auction.image_url;
              }
            })();

            return (
            <Link href={`/auctions/${auction.id}`} key={auction.id} className={`${styles.card} glass-panel`}>
              <div className={styles.cardContent}>
                {firstImage && (
                  <img src={firstImage} alt={auction.title} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
                )}
                <div>
                  <h3 className={styles.cardTitle}>{auction.title}</h3>
                  <p className={styles.cardCreator}>Bởi {(auction.creator as any)?.display_name || 'Ẩn danh'}</p>
                  <div className={styles.cardDetails}>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Giá Khởi Điểm</span>
                      <span className={styles.detailValue}>{auction.start_price.toLocaleString('vi-VN')} VNĐ</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Kết Thúc Lúc</span>
                      <span className={styles.detailValue}>
                        {new Date(auction.end_time).toLocaleDateString()} {new Date(auction.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  
                  <div className={styles.requirements}>
                    {!auction.allow_unverified && (
                      <span className={styles.badge}>Chỉ Đã Xác Minh</span>
                    )}
                    {auction.min_reputation > 0 && (
                      <span className={styles.badge}>Uy tín {'>'} {auction.min_reputation}</span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
