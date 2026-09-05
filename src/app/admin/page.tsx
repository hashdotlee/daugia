'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from './admin.module.css'

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'users' | 'auctions' | 'support'>('users')
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<any[]>([])
  const [auctions, setAuctions] = useState<any[]>([])
  const [supportMessages, setSupportMessages] = useState<any[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    checkAdmin()
  }, [])

  const checkAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        router.push('/')
        return
      }

      setIsAdmin(true)
      fetchData()
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch users
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (usersError) throw usersError
      setUsers(usersData || [])

      // Fetch auctions
      const { data: auctionsData, error: auctionsError } = await supabase
        .from('auctions')
        .select('*, creator:profiles(display_name)')
        .order('created_at', { ascending: false })
      if (auctionsError) throw auctionsError
      setAuctions(auctionsData || [])

      // Fetch support messages
      const { data: supportData, error: supportError } = await supabase
        .from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(display_name)')
        .is('receiver_id', null)
        .order('created_at', { ascending: false })
      if (!supportError) {
        setSupportMessages(supportData || [])
      }

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const verifyUser = async (userId: string, currentStatus: boolean) => {
    if (!confirm(`Bạn có chắc muốn ${currentStatus ? 'bỏ ' : ''}xác minh người dùng này?`)) return
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_verified: !currentStatus })
        .eq('id', userId)

      if (error) throw error
      alert('Cập nhật thành công!')
      fetchData()
    } catch (err: any) {
      alert('Lỗi: ' + err.message)
    }
  }

  const cancelAuction = async (auctionId: string) => {
    if (!confirm('Bạn có chắc muốn HỦY cuộc đấu giá này? Hành động không thể hoàn tác.')) return

    try {
      const { error } = await supabase
        .from('auctions')
        .update({ status: 'cancelled' })
        .eq('id', auctionId)

      if (error) throw error
      alert('Đã hủy đấu giá!')
      fetchData()
    } catch (err: any) {
      alert('Lỗi: ' + err.message)
    }
  }

  if (loading) return <div className="page-container" style={{ textAlign: 'center', marginTop: '50px' }}>Đang tải bảng điều khiển Admin...</div>
  if (!isAdmin) return null

  return (
    <div className="page-container">
      <div className={`${styles.container} glass-panel`}>
        <div className={styles.header}>
          <h1 className={styles.title}>Quản Trị Hệ Thống (Admin)</h1>
          {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>

        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${activeTab === 'users' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Quản Lý Người Dùng
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'auctions' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('auctions')}
          >
            Quản Lý Đấu Giá
          </button>
        </div>

        {activeTab === 'users' && (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Tên Hiển Thị</th>
                  <th>SĐT</th>
                  <th>Uy Tín</th>
                  <th>Vai Trò</th>
                  <th>Trạng Thái</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.display_name}</td>
                    <td>{u.phone || 'N/A'}</td>
                    <td>{u.reputation_score}</td>
                    <td>{u.role}</td>
                    <td>
                      {u.is_verified ? (
                        <span style={{ color: 'green', fontWeight: 'bold' }}>Đã xác minh</span>
                      ) : (
                        <span style={{ color: 'gray' }}>Chưa xác minh</span>
                      )}
                    </td>
                    <td>
                      <button 
                        className={`${styles.actionBtn} ${styles.safeBtn}`}
                        onClick={() => verifyUser(u.id, u.is_verified)}
                      >
                        {u.is_verified ? 'Bỏ Xác Minh' : 'Duyệt Xác Minh'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'auctions' && (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Tiêu Đề</th>
                  <th>Người Bán</th>
                  <th>Giá Khởi Điểm</th>
                  <th>Trạng Thái</th>
                  <th>Kết Thúc</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {auctions.map(a => {
                  const isEnded = new Date() > new Date(a.end_time)
                  return (
                    <tr key={a.id}>
                      <td>{a.title}</td>
                      <td>{(a.creator as any)?.display_name}</td>
                      <td>{a.start_price.toLocaleString('vi-VN')}đ</td>
                      <td>
                        {a.status === 'active' && !isEnded ? 'Đang diễn ra' : 
                         a.status === 'cancelled' ? 'Đã hủy' : 'Kết thúc'}
                      </td>
                      <td>{new Date(a.end_time).toLocaleString()}</td>
                      <td>
                        {a.status === 'active' && (
                          <button 
                            className={`${styles.actionBtn} ${styles.dangerBtn}`}
                            onClick={() => cancelAuction(a.id)}
                          >
                            Hủy Bỏ
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
