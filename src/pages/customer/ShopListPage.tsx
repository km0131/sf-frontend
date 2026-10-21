import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Header } from '../../components/Header'
import { CallSoundButton } from '../../components/ReadyCall'
import { TerminalLine } from '../../components/Terminal'
import { VerticalLabel } from '../../components/VerticalLabel'
import { apiFetch, errorMessage } from '../../lib/api'
import { storeStyle } from '../../lib/colors'
import { waitLabel } from '../../lib/format'
import { DONE_KEEP_MS, doneExpired, myOrders, type RememberedOrder } from '../../lib/session'
import { orderQuery } from '../../lib/orderQuery'
import type { CustomerOrder, OrderStatus, PublicShopList } from '../../lib/types'
import { orderStatusText, wording } from '../../lib/wording'
import { PausedNotice } from '../../components/PausedNotice'
import { OrderNumberLookup } from './OrderNumberLookup'

/** お客様: 出店している店の一覧と、それぞれの待ち状況。 */
export function ShopListPage() {
  const { data, error, isLoading } = useQuery({
    queryKey: ['shops'],
    queryFn: () => apiFetch<PublicShopList>('/api/shops'),
    refetchInterval: 15000,
  })
  const remembered = useMyOrders()
  const title = data?.event?.name ?? '学園祭'

  return (
    <div className="page-sp">
      <Header name={title} seal="祭" />
      <TerminalLine command="お店を表示" aside={data ? `${data.items.length}店` : undefined} />
      {data?.event?.paused && <PausedNotice message={data.event.pause_message} />}
      <OrderNumberLookup />

      {remembered.length > 0 && (
        <section className="section fade-in">
          <VerticalLabel text="受付中の番号">
            {remembered.map(({ order, data }) => <MyOrderRow key={order.token} order={order} data={data} />)}
            <div style={{ paddingTop: 16 }}>
              <CallSoundButton />
            </div>
          </VerticalLabel>
        </section>
      )}

      <section className="section fade-in">
        <VerticalLabel text="お店" note="お店を選んでください">
          {isLoading && <p className="empty">読み込んでいます…</p>}
          {error && <p className="error-text">{errorMessage(error)}</p>}
          {data && data.items.length === 0 && <p className="empty">いま受付をしているお店はありません</p>}
          {data?.items.map((s) => (
            <Link key={s.slug} to={`/s/${s.slug}`} className="shop-row" style={storeStyle(s.color)}>
              <span className="dot dot-lg" aria-hidden="true" />
              <span>
                <span className="shop-row-name">{s.name}</span>
                {s.description && (
                  <span className="sub" style={{ display: 'block', fontSize: 12, lineHeight: 1.7 }}>
                    {s.description}
                  </span>
                )}
              </span>
              <span className="shop-row-wait">
                待ち {s.waiting_count}組
                <br />
                {waitLabel(s.estimated_wait_minutes)}
              </span>
            </Link>
          ))}
        </VerticalLabel>
      </section>
    </div>
  )
}

/** 並べる順（小さいほど上）: 呼び出し中 → 受付中・調理中 → 取り消し・未受取 → お渡し済み。状態が分かる前は受付中と同じ */
const statusRank: Record<OrderStatus, number> = { ready: 0, waiting: 1, cooking: 1, cancelled: 2, unclaimed: 2, done: 3 }

/** 受付中の番号の控えと、それぞれの今の状態（新しい順を、状態の順に並べ直したもの）。
 *  お渡し済みになって3分たった注文は、控え（localStorage）からも一覧からも消す。 */
function useMyOrders(): { order: RememberedOrder; data: CustomerOrder | undefined }[] {
  // お渡し済みの注文が3分たったときに並べ直すための時計
  const [now, setNow] = useState(() => Date.now())
  const list = myOrders.list(now)
  // 取り直し（7秒ごと）は、お客様の画面の共通部分で呼び出しを見張るついでに行う。ここではキャッシュを読む
  const results = useQueries({ queries: list.map((o) => orderQuery(o.token)) })
  const rows = list.map((order, i) => ({ order, data: results[i]?.data }))
  const doneAt = (r: (typeof rows)[number]) => (r.data ? (r.data.status === 'done' ? r.data.done_at : null) : r.order.done_at)

  // お渡し済みになった時刻を控えに記録する（画面を開き直したときも、取り直さずに3分を数えられるように）
  // 「トークン=時刻」をつないだ文字列（状態が分かった注文だけ。お渡し済みでなければ時刻は空）。変わったときだけ書き込む
  const doneKey = rows
    .filter((r) => r.data)
    .map((r) => `${r.order.token}=${doneAt(r) ?? ''}`)
    .join(',')
  useEffect(() => {
    if (!doneKey) return
    for (const pair of doneKey.split(',')) {
      const [token, at] = pair.split('=')
      myOrders.markDone(token, at || null)
    }
  }, [doneKey])

  // いちばん早く3分になる注文に合わせて、時計を進める
  const nextExpiry = Math.min(...rows.map((r) => doneAt(r)).filter((d): d is string => !!d).map((d) => Date.parse(d) + DONE_KEEP_MS))
  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return
    const id = setTimeout(() => setNow(Date.now()), Math.max(0, nextExpiry - Date.now()) + 50)
    return () => clearTimeout(id)
  }, [nextExpiry])

  return rows
    .filter((r) => !doneExpired(doneAt(r), now))
    .map((r, i) => ({ ...r, i }))
    .sort((a, b) => statusRank[a.data?.status ?? 'waiting'] - statusRank[b.data?.status ?? 'waiting'] || a.i - b.i)
    .map(({ order, data }) => ({ order, data }))
}

/** 受付中の番号の1行。今の状態を出す。お渡し済みは薄く表示する（3分で消える）。 */
function MyOrderRow({ order, data }: { order: RememberedOrder; data: CustomerOrder | undefined }) {
  const ready = data?.status === 'ready'
  const done = data?.status === 'done'

  return (
    <Link to={`/o/${order.token}`} className={`shop-row ${done ? 'my-order-done' : ''}`} style={storeStyle(data?.shop.color)}>
      <span className="dot dot-lg" aria-hidden="true" />
      <span>
        <span className="shop-row-name">{order.shop}</span>
        {data && (
          <span className="sub" style={{ display: 'block', fontSize: 12, lineHeight: 1.7 }} aria-live="polite">
            {orderStatusText(data)}
          </span>
        )}
      </span>
      <span className="shop-row-wait">
        <span className="mono" style={{ fontSize: 15, color: 'var(--c-ink)' }}>{order.order_no}</span>
        <br />
        {data && (
          <span className={ready ? 'my-order-ready' : undefined}>{wording(data.shop.business_type).status[data.status]}</span>
        )}
      </span>
    </Link>
  )
}
