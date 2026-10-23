import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { Header } from '../../components/Header'
import { TerminalLine } from '../../components/Terminal'
import { apiFetch, errorMessage, setUnauthorizedHandler } from '../../lib/api'
import { storeStyle } from '../../lib/colors'
import { userSession, type Session } from '../../lib/session'
import type { LoginResponse } from '../../lib/types'
import type { ManageContext } from './context'

const managerNav = [
  { to: 'products', label: '商品' },
  { to: 'orders', label: '注文' },
  { to: 'sales', label: '売上' },
  { to: 'ledger', label: '収支' },
  { to: 'settings', label: '店舗設定' },
  { to: 'account', label: 'アカウント' },
]

const adminNav = [
  { to: 'shops', label: '店舗' },
  { to: 'events', label: '開催回' },
  { to: 'users', label: '店長・管理者' },
  { to: 'all-sales', label: '全店の売上' },
  { to: 'all-ledger', label: '全店の収支' },
  { to: 'account', label: 'アカウント' },
]

/** 管理画面（/manage）。店長とシステム管理者で、表示するメニューが変わる。 */
export function ManageApp() {
  const [session, setSession] = useState<Session | null>(() => userSession.get())
  const location = useLocation()

  const logout = useCallback(() => {
    userSession.set(null)
    setSession(null)
  }, [])

  useEffect(() => {
    if (!session) return
    setUnauthorizedHandler((token) => token === session.token && logout())
    return () => setUnauthorizedHandler(null)
  }, [session, logout])

  const updateShop = useCallback((patch: Partial<NonNullable<Session['shop']>>) => {
    setSession((prev) => {
      if (!prev?.shop) return prev
      const next = { ...prev, shop: { ...prev.shop, ...patch } }
      userSession.set(next)
      return next
    })
  }, [])

  if (!session) {
    return (
      <ManageLogin
        onLogin={(s) => {
          userSession.set(s)
          setSession(s)
        }}
      />
    )
  }

  const isAdmin = session.role === 'system_admin'
  const nav = isAdmin ? adminNav : managerNav
  // スタッフ用の画面（お客様の画面からはリンクしていない）。別のタブで開く
  const screens = isAdmin
    ? [{ href: '/display', label: '全店の大画面' }]
    : session.shop
      ? [
          { href: `/s/${session.shop.slug}/pos`, label: 'レジ' },
          { href: `/s/${session.shop.slug}/display`, label: '大画面' },
        ]
      : []
  if (location.pathname.replace(/\/$/, '') === '/manage') {
    return <Navigate to={nav[0].to} replace />
  }

  return (
    <div className="page-pc" style={storeStyle(session.shop?.color)}>
      <Header
        name={isAdmin ? 'システム管理' : `${session.shop?.name ?? ''}　管理`}
        seal={isAdmin ? '祭' : undefined}
        aside={
          <div className="row" style={{ gap: 16 }}>
            <span>{session.user?.display_name || session.user?.email}</span>
            <button type="button" className="btn btn-text" onClick={logout}>
              ログアウト
            </button>
          </div>
        }
      />
      <div className="manage">
        <nav className="mnav" aria-label="管理メニュー">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to}>
              {n.label}
            </NavLink>
          ))}
          {screens.length > 0 && <span className="mnav-sep">画面を開く</span>}
          {screens.map((n) => (
            <a key={n.href} href={n.href} target="_blank" rel="noopener">
              {n.label} ↗
            </a>
          ))}
        </nav>
        <Outlet context={{ token: session.token, session, updateShop } satisfies ManageContext} />
      </div>
    </div>
  )
}

function ManageLogin({ onLogin }: { onLogin: (s: LoginResponse) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      onLogin(await apiFetch<LoginResponse>('/api/auth/login', { method: 'POST', body: { email, password } }))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page-sp">
      <Header name="管理画面" seal="祭" />
      <TerminalLine command="ログインしてください" />
      <form className="section stack fade-in" onSubmit={submit}>
        <label className="field">
          <span className="field-label">メールアドレス</span>
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span className="field-label">パスワード</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={!email || !password || sending}>
          ログイン
        </button>
        <p className="field-hint">店長・システム管理者用です。スタッフ用のレジは、ログイン後の「画面を開く」から開けます。</p>
      </form>
    </div>
  )
}
