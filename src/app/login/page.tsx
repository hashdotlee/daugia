'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import styles from './login.module.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (isSignUp) {
        if (!displayName) {
          throw new Error('Tên hiển thị là bắt buộc.')
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName,
            },
          },
        })
        if (error) throw error
        alert('Đăng ký thành công! Bạn có thể đăng nhập ngay.')
        setIsSignUp(false)
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        router.push('/')
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-container">
      <div className={`${styles.authContainer} glass-panel`}>
        <h1 className={styles.title}>{isSignUp ? 'Tạo Tài Khoản' : 'Chào Mừng Trở Lại'}</h1>
        <p className={styles.subtitle}>
          {isSignUp ? 'Tham gia Sàn Đấu Giá ngay!' : 'Đăng nhập để xem các phiên đấu giá của bạn.'}
        </p>

        {error && <div className={styles.errorAlert}>{error}</div>}

        <form onSubmit={handleAuth} className={styles.form}>
          {isSignUp && (
            <div className={styles.inputGroup}>
              <label>Tên hiển thị</label>
              <input
                type="text"
                className="input-field"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required={isSignUp}
                placeholder="AwesomeBidder99"
              />
            </div>
          )}
          <div className={styles.inputGroup}>
            <label>Email</label>
            <input
              type="email"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>
          <div className={styles.inputGroup}>
            <label>Mật khẩu</label>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
          
          <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', marginTop: '16px' }}>
            {loading ? 'Đang xử lý...' : (isSignUp ? 'Đăng Ký' : 'Đăng Nhập')}
          </button>
        </form>

        <div className={styles.toggleText}>
          {isSignUp ? 'Đã có tài khoản?' : "Chưa có tài khoản?"}{' '}
          <button onClick={() => setIsSignUp(!isSignUp)} className={styles.toggleBtn}>
            {isSignUp ? 'Đăng Nhập' : 'Đăng Ký'}
          </button>
        </div>
      </div>
    </div>
  )
}
