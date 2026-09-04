'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import styles from './create.module.css'

export default function CreateAuctionPage() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startPrice, setStartPrice] = useState('')
  const [durationHours, setDurationHours] = useState('24')
  const [allowUnverified, setAllowUnverified] = useState(true)
  const [minReputation, setMinReputation] = useState('0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
      }
    }
    checkAuth()
  }, [router, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Chưa xác thực')

      const startTime = new Date()
      const endTime = new Date(startTime.getTime() + parseInt(durationHours) * 60 * 60 * 1000)

      const { data, error } = await supabase
        .from('auctions')
        .insert({
          title,
          description,
          creator_id: user.id,
          start_price: parseFloat(startPrice),
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          allow_unverified: allowUnverified,
          min_reputation: parseInt(minReputation)
        })
        .select()
        .single()

      if (error) throw error

      router.push(`/auctions/${data.id}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-container">
      <div className={`${styles.createContainer} glass-panel`}>
        <h1 className={styles.title}>Tạo Cuộc Đấu Giá Mới</h1>
        <p className={styles.subtitle}>Thiết lập vật phẩm đấu giá của bạn kèm các yêu cầu tùy chỉnh.</p>

        {error && <div className={styles.errorAlert}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label>Tiêu đề</label>
            <input
              type="text"
              className="input-field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Ví dụ: Đồng hồ Rolex Cổ"
            />
          </div>
          
          <div className={styles.inputGroup}>
            <label>Mô tả</label>
            <textarea
              className="input-field"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              required
              placeholder="Mô tả chi tiết vật phẩm..."
            />
          </div>

          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label>Giá Khởi Điểm ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input-field"
                value={startPrice}
                onChange={(e) => setStartPrice(e.target.value)}
                required
                placeholder="100.00"
              />
            </div>
            
            <div className={styles.inputGroup}>
              <label>Thời Gian (Giờ)</label>
              <select
                className="input-field"
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
              >
                <option value="1">1 Giờ</option>
                <option value="12">12 Giờ</option>
                <option value="24">24 Giờ</option>
                <option value="48">48 Giờ</option>
                <option value="72">3 Ngày</option>
                <option value="168">1 Tuần</option>
              </select>
            </div>
          </div>

          <div className={styles.sectionDivider}>Yêu Cầu Đối Với Người Mua</div>

          <div className={styles.checkboxGroup}>
            <input
              type="checkbox"
              id="allowUnverified"
              checked={allowUnverified}
              onChange={(e) => setAllowUnverified(e.target.checked)}
            />
            <label htmlFor="allowUnverified">Cho phép người dùng chưa xác minh tham gia</label>
          </div>

          <div className={styles.inputGroup}>
            <label>Điểm uy tín tối thiểu yêu cầu</label>
            <input
              type="number"
              className="input-field"
              value={minReputation}
              onChange={(e) => setMinReputation(e.target.value)}
              min="-100"
              max="100"
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '24px' }}>
            {loading ? 'Đang tạo...' : 'Bắt Đầu Đấu Giá'}
          </button>
        </form>
      </div>
    </div>
  )
}
