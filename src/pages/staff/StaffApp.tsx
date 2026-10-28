import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Header } from '../../components/Header'
import { apiFetch, setUnauthorizedHandler } from '../../lib/api'
import { storeStyle } from '../../lib/colors'
import { installOrderSoundUnlock, orderSound, playOrderSound } from '../../lib/orderSound'
import { staffSession, type Session } from '../../lib/session'
import { streamEvents } from '../../lib/sse'
import { applyStock } from '../../lib/stock'
import type { Category, List, MenuItem, Order, StaffShop, StockLevel } from '../../lib/types'
import { MANUAL_URL } from '../../lib/manual'
import { wording } from '../../lib/wording'
import { staffKeys } from './keys'
import { OrderBoard } from './OrderBoard'
import { PosPage } from './PosPage'
import { ReceiptTab } from './ReceiptTab'
import { StaffLogin } from './StaffLogin'

/** スタッフ画面（/s/:slug/pos）。PIN でログインし、「注文帳」と「レジ」を切り替える。 */
export function StaffApp() {
  const { slug = '' } = useParams()
  const [session, setSession] = useState<Session | null>(() => staffSession.get(slug))

  const logout = useCallback(() => {
    staffSession.set(slug, null)
    setSession(null)
  }, [slug])

  // API が 401 を返したら（PIN の変更・期限切れ）ログイン画面に戻す
  useEffect(() => {
    if (!session) return
    setUnauthorizedHandler((token) => token === session.token && logout())
    return () => setUnauthorizedHandler(null)
  }, [session, logout])

  if (!session) {
    return (
      <StaffLogin
        slug={slug}
        onLogin={(s) => {
          staffSession.set(slug, s)
          setSession(s)
        }}
      />
    )
  }
  return <StaffShell slug={slug} token={session.token} onLogout={logout} />
}

function StaffShell({ slug, token, onLogout }: { slug: string; token: string; onLogout: () => void }) {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'register' ? 'register' : params.get('tab') === 'receipt' ? 'receipt' : 'board'
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)
  const soundOn = useSyncExternalStore(orderSound.subscribe, orderSound.isOn)
  const soundReady = useSyncExternalStore(orderSound.subscribe, orderSound.isReady)

  // PIN の入力などで最初にタップしたときに、注文の音を鳴らせるようにする
  useEffect(() => installOrderSoundUnlock(), [])

  const { data: shop } = useQuery({
    queryKey: ['staff', slug, 'shop'],
    queryFn: () => apiFetch<StaffShop>('/api/staff/shop', { token }),
    // 学園祭の中止・再開をすぐ画面に出す
    refetchInterval: 15000,
  })

  // リアルタイム配信：注文の変化を一覧に反映する
  useEffect(() => {
    const s = streamEvents(
      '/api/staff/events',
      token,
      (m) => {
        if (m.type === 'session_expired') {
          onLogout()
        } else if (m.type === 'hello') {
          void queryClient.invalidateQueries({ queryKey: ['staff', slug] })
        } else if (m.type === 'menu') {
          // 自動で適用する値引きが変わったときも届くので、値引きの一覧も取り直す
          void queryClient.invalidateQueries({ queryKey: staffKeys.menu(slug) })
          void queryClient.invalidateQueries({ queryKey: staffKeys.discounts(slug) })
        } else if (m.type === 'stock') {
          // 限定商品の残り数（注文・取り消し・修正のたびに届く）
          queryClient.setQueryData<{ categories: Category[]; items: MenuItem[] }>(staffKeys.menu(slug), (old) => applyStock(old, m.data as StockLevel))
        } else if (m.type === 'order') {
          // 一覧になかった注文が届いたら、新しい注文として音で知らせる（つなぎ直したときの取り直しでは鳴らさない）
          if (applyOrder(queryClient, slug, m.data as Order)) playOrderSound()
        }
      },
      setConnected,
    )
    return () => s.stop()
  }, [token, slug, queryClient, onLogout])

  const title = shop ? shop.name : slug
  const w = wording(shop?.business_type)
  return (
    <div className="page-pc" style={storeStyle(shop?.color)}>
      <Header
        name={`${title}　${tab === 'board' ? w.boardTab : tab === 'register' ? 'レジ' : 'レシート'}`}
        aside={
          <div className="row" style={{ gap: 16 }}>
            <nav className="staff-tabs" aria-label="画面の切り替え">
              <button
                type="button"
                className="staff-tab"
                aria-current={tab === 'board' ? 'page' : undefined}
                onClick={() => setParams({})}
              >
                {w.boardTab}
              </button>
              <button
                type="button"
                className="staff-tab"
                aria-current={tab === 'register' ? 'page' : undefined}
                onClick={() => setParams({ tab: 'register' })}
              >
                レジ
              </button>
              <button
                type="button"
                className="staff-tab"
                aria-current={tab === 'receipt' ? 'page' : undefined}
                onClick={() => setParams({ tab: 'receipt' })}
              >
                レシート
              </button>
            </nav>
            <span className="conn">{connected ? '● 接続中' : '○ 再接続中'}</span>
            <button
              type="button"
              className="btn btn-text"
              aria-pressed={soundOn}
              title="注文が入ったときの音"
              // まだ鳴らせない状態でのタップは「有効にする」だけ（画面全体のタップで解除される。オフにはしない）
              onClick={() => (soundOn && !soundReady ? undefined : orderSound.setOn(!soundOn))}
            >
              {soundOn ? (soundReady ? '音：入' : '音：入（タップで有効）') : '音：切'}
            </button>
            {/* マニュアルは public/manual/ の静的ページ。別のタブで開く */}
            <a className="btn btn-text" href={MANUAL_URL} target="_blank" rel="noopener">
              マニュアル ↗
            </a>
            <button type="button" className="btn btn-text" onClick={onLogout}>
              ログアウト
            </button>
          </div>
        }
      />
      {tab === 'board' ? (
        <OrderBoard slug={slug} token={token} businessType={shop?.business_type} />
      ) : tab === 'register' ? (
        <PosPage slug={slug} token={token} shop={shop} />
      ) : (
        <ReceiptTab token={token} />
      )}
    </div>
  )
}

/** 配信で届いた注文を、進行中・完了の一覧に反映する。進行中の一覧に初めて入った受付の注文なら true（一覧を読み込む前は false）。 */
function applyOrder(queryClient: ReturnType<typeof useQueryClient>, slug: string, o: Order): boolean {
  const active = o.status === 'waiting' || o.status === 'cooking' || o.status === 'ready'
  const before = queryClient.getQueryData<List<Order>>(staffKeys.active(slug))
  const isNew = !!before && o.status === 'waiting' && !before.items.some((x) => x.id === o.id)
  queryClient.setQueryData<List<Order>>(staffKeys.active(slug), (prev) => {
    if (!prev) return prev
    const rest = prev.items.filter((x) => x.id !== o.id)
    const items = active ? [...rest, o].sort((a, b) => a.order_no.localeCompare(b.order_no, 'ja', { numeric: true })) : rest
    return { items }
  })
  if (o.status === 'done') {
    queryClient.setQueryData<List<Order>>(staffKeys.done(slug), (prev) =>
      prev ? { items: [...prev.items.filter((x) => x.id !== o.id), o] } : prev,
    )
  }
  return isNew
}
