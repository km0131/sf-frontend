import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Sheet } from '../../components/Sheet'
import { Log, TerminalLine } from '../../components/Terminal'
import { ApiError, apiFetch, errorMessage } from '../../lib/api'
import { hhmm, minutesSince, yen } from '../../lib/format'
import type { List, Order, OrderStatus } from '../../lib/types'
import { staffKeys } from './keys'

/** お渡し待ちのままこの分数を過ぎたら目立たせる（受け取りに来ていない注文） */
const unclaimedMinutes = 15

const columns: { status: OrderStatus; num: string; title: string }[] = [
  { status: 'waiting', num: '壱', title: '受付' },
  { status: 'cooking', num: '弐', title: '調理中' },
  { status: 'ready', num: '参', title: 'お渡し待ち' },
]

/** 注文帳：受付／調理中／お渡し待ちの3列。ワンタッチで次に進める。 */
export function OrderBoard({ slug, token }: { slug: string; token: string }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<Order | null>(null)
  const [cancelling, setCancelling] = useState<Order | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [, setTick] = useState(0)

  // 経過時間の表示を更新する
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const active = useQuery({
    queryKey: staffKeys.active(slug),
    queryFn: () => apiFetch<List<Order>>('/api/staff/orders', { token }),
    refetchInterval: 60000, // 配信が届かなかったときの保険
  })
  const done = useQuery({
    queryKey: staffKeys.done(slug),
    queryFn: () => apiFetch<List<Order>>('/api/staff/orders?status=done', { token }),
  })

  const orders = active.data?.items ?? []
  const byStatus = (s: OrderStatus) => orders.filter((o) => o.status === s)

  const run = async (o: Order, path: string, body?: unknown) => {
    setBusy(o.id)
    setError(null)
    try {
      await apiFetch<Order>(`/api/staff/orders/${o.id}${path}`, { method: path === '/status' ? 'PATCH' : 'POST', token, body })
    } catch (e) {
      setError(errorMessage(e))
      if (e instanceof ApiError && e.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['staff', slug] })
      }
    } finally {
      setBusy(null)
    }
  }

  const advance = (o: Order, status: OrderStatus, markPaid = false) =>
    run(o, '/status', { status, expected_status: o.status, mark_paid: markPaid })

  const counts = columns.map((c) => `${c.title} ${byStatus(c.status).length}`).join(' ／ ')
  const doneLog = [...(done.data?.items ?? [])]
    .sort((a, b) => (a.done_at ?? '').localeCompare(b.done_at ?? ''))
    .slice(-8)
    .map((o) => ({ time: hhmm(o.done_at), text: `${o.order_no}　お渡し済み` }))

  return (
    <>
      <TerminalLine command="注文を見守っています" aside={counts} />
      {error && (
        <p className="error-text" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}
      {active.error && (
        <p className="error-text" style={{ marginTop: 16 }}>
          {errorMessage(active.error)}
        </p>
      )}

      <div className="board">
        {columns.map((col) => {
          const list = byStatus(col.status)
          return (
            <section key={col.status} aria-label={col.title}>
              <div className="col-head">
                <span className="col-num">{col.num}</span>
                <h2 className="col-title">{col.title}</h2>
                <span className="col-count">{list.length}件</span>
              </div>
              <div className="col-cards">
                {list.length === 0 && <p className="empty">ありません</p>}
                {list.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    busy={busy === o.id}
                    onAdvance={() => {
                      if (o.status === 'waiting') void advance(o, 'cooking')
                      else if (o.status === 'cooking') void advance(o, 'ready')
                      else if (o.paid) void advance(o, 'done')
                      else setConfirming(o)
                    }}
                    onCancel={() => setCancelling(o)}
                  />
                ))}
              </div>
              {col.status === 'ready' && doneLog.length > 0 && (
                <div style={{ marginTop: 32 }}>
                  <Log entries={doneLog} />
                </div>
              )}
            </section>
          )
        })}
      </div>

      {confirming && (
        <Sheet title={`${confirming.order_no} のお渡し`} onClose={() => setConfirming(null)}>
          <div className="stack">
            <p>
              まだお代金を受け取っていない注文です。
              <br />
              <span className="money">{yen(confirming.total)}</span> を受け取りましたか？
            </p>
            <button
              type="button"
              className="btn btn-done btn-block"
              onClick={() => {
                void advance(confirming, 'done', true)
                setConfirming(null)
              }}
            >
              受け取って、お渡し済みにする
            </button>
          </div>
        </Sheet>
      )}

      {cancelling && (
        <CancelSheet
          order={cancelling}
          onClose={() => setCancelling(null)}
          onCancel={(reason) => {
            void run(cancelling, '/cancel', { reason: reason || undefined })
            setCancelling(null)
          }}
        />
      )}
    </>
  )
}

const actionLabel: Partial<Record<OrderStatus, string>> = {
  waiting: '調理をはじめる',
  cooking: 'できあがり',
  ready: 'お渡し済み',
}

function OrderCard({
  order: o,
  busy,
  onAdvance,
  onCancel,
}: {
  order: Order
  busy: boolean
  onAdvance: () => void
  onCancel: () => void
}) {
  const sinceReady = minutesSince(o.ready_at)
  return (
    <article className="card fade-in" style={{ animationDuration: '.8s' }}>
      <div className="ocard-head">
        {o.status === 'cooking' && <span className="dot dot-lg" aria-label="調理中" />}
        <span className="order-no">{o.order_no}</span>
        <div className="ocard-meta">
          {o.channel === 'web' ? 'Web' : 'レジ'}　{hhmm(o.created_at)}
          <br />
          {minutesSince(o.created_at)}分経過
        </div>
      </div>
      {o.customer_name && (
        <p className="sub" style={{ fontSize: 13 }}>
          {o.customer_name} 様
        </p>
      )}
      <div className="ocard-items">
        {o.items.map((it, i) => (
          <div key={i}>
            <span className="mincho">{it.name}</span>
            {it.options.length > 0 && <span className="sub">（{it.options.map((x) => x.name).join('、')}）</span>}
            <span className="mono"> × {it.quantity}</span>
          </div>
        ))}
      </div>
      {o.note && (
        <p className="order-note" style={{ marginBottom: 14 }}>
          <span className="order-note-label">ご希望</span>
          {o.note}
        </p>
      )}
      <div className="ocard-foot">
        {o.paid ? (
          <span className="tag">支払済</span>
        ) : (
          <span className="tag tag-strong">未払い {yen(o.total)}</span>
        )}
        {o.status === 'ready' && sinceReady >= unclaimedMinutes && (
          <span className="tag tag-strong">{sinceReady}分お待ち</span>
        )}
        <span className="spacer" />
        <button type="button" className="btn btn-text" onClick={onCancel} disabled={busy}>
          取り消し
        </button>
      </div>
      <button
        type="button"
        className={`btn btn-block ${o.status === 'ready' ? 'btn-done' : 'btn-secondary'}`}
        style={{ marginTop: 12 }}
        disabled={busy}
        onClick={onAdvance}
      >
        {actionLabel[o.status]}
      </button>
    </article>
  )
}

function CancelSheet({ order, onClose, onCancel }: { order: Order; onClose: () => void; onCancel: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <Sheet title={`${order.order_no} を取り消す`} onClose={onClose}>
      <div className="stack">
        <p className="sub">
          取り消した注文は元に戻せません（店長の管理画面からは直せます）。
          {order.paid && ' 支払い済みの注文です。返金を忘れずに。'}
        </p>
        <label className="field">
          <span className="field-label">理由（任意）</span>
          <input className="input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="受け取りに来ない、など" />
        </label>
        <button type="button" className="btn btn-done btn-block" onClick={() => onCancel(reason.trim())}>
          取り消す
        </button>
      </div>
    </Sheet>
  )
}
