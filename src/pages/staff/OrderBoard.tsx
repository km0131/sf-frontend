import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { ItemNote } from '../../components/LineNote'
import { Sheet } from '../../components/Sheet'
import { Log, TerminalLine } from '../../components/Terminal'
import { ApiError, apiFetch, errorMessage } from '../../lib/api'
import { hhmm, minutesSince, yen } from '../../lib/format'
import { clockOffset, useNow } from '../../lib/serverClock'
import type { BusinessType, List, Order, OrderStatus } from '../../lib/types'
import { wording } from '../../lib/wording'
import { ClaimSheet } from './ClaimPanel'
import { staffKeys } from './keys'

/** 注文帳：飲食は 受付／調理中／お渡し待ち の3列、飲食以外は 待ち／呼び出し中 の2列。ワンタッチで次に進める。 */
export function OrderBoard({ slug, token, businessType }: { slug: string; token: string; businessType?: BusinessType }) {
  const w = wording(businessType)
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<Order | null>(null)
  const [cancelling, setCancelling] = useState<Order | null>(null)
  const [unclaiming, setUnclaiming] = useState<Order | null>(null)
  const [claiming, setClaiming] = useState<Order | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [, setTick] = useState(0)

  // 経過時間の表示を更新する
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const active = useQuery({
    queryKey: staffKeys.active(slug),
    queryFn: () => apiFetch<List<Order> & { server_time?: string }>('/api/staff/orders', { token }),
    refetchInterval: 60000, // 配信が届かなかったときの保険
  })
  const done = useQuery({
    queryKey: staffKeys.done(slug),
    queryFn: () => apiFetch<List<Order>>('/api/staff/orders?status=done', { token }),
  })

  const orders = active.data?.items ?? []
  // 受け取り期限の残り時間は、サーバーの時刻に合わせて数える（端末の時計のずれ対策）
  const offset = clockOffset(active.data?.server_time, active.dataUpdatedAt)
  // 飲食以外の「待ち」の列には、種類を変える前の調理中が残っていても出す（見えなくならないように）
  const byStatus = (s: OrderStatus) => {
    const list = orders.filter((o) => o.status === s || (!w.usesCooking && s === 'waiting' && o.status === 'cooking'))
    // お渡し待ちは期限の早い順（期限切れが上に来る）
    return s === 'ready' ? [...list].sort((a, b) => (a.pickup_deadline ?? '').localeCompare(b.pickup_deadline ?? '')) : list
  }

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

  const counts = w.columns.map((c) => `${c.title} ${byStatus(c.status).length}`).join(' ／ ')
  const doneLog = [...(done.data?.items ?? [])]
    .sort((a, b) => (a.done_at ?? '').localeCompare(b.done_at ?? ''))
    .slice(-8)
    .map((o) => ({ time: hhmm(o.done_at), text: `${o.order_no}　${w.doneLog}` }))

  return (
    <>
      <TerminalLine command={w.boardCommand} aside={counts} />
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

      <div className={`board ${w.columns.length === 2 ? 'board-2' : ''}`}>
        {w.columns.map((col) => {
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
                    label={w.advance[o.status]}
                    busy={busy === o.id}
                    onAdvance={() => {
                      const next = w.nextStatus[o.status]
                      if (!next) return
                      if (next !== 'done') void advance(o, next)
                      else if (o.paid) void advance(o, 'done')
                      else setConfirming(o)
                    }}
                    onCancel={() => setCancelling(o)}
                    onUnclaim={() => setUnclaiming(o)}
                    onShowClaim={() => setClaiming(o)}
                    offset={offset}
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
        <Sheet title={`${confirming.order_no} ${w.finishTitle}`} onClose={() => setConfirming(null)}>
          <div className="stack">
            <p>
              {w.unpaidNotice}
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
              {w.finishButton}
            </button>
          </div>
        </Sheet>
      )}

      {claiming && <ClaimSheet orderId={claiming.id} orderNo={claiming.order_no} token={token} onClose={() => setClaiming(null)} />}

      {unclaiming && (
        <UnclaimSheet
          order={unclaiming}
          offset={offset}
          onClose={() => setUnclaiming(null)}
          onConfirm={() => {
            void run(unclaiming, '/unclaimed')
            setUnclaiming(null)
          }}
        />
      )}

      {cancelling && (
        <CancelSheet
          order={cancelling}
          businessType={businessType}
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

function OrderCard({
  order: o,
  label,
  busy,
  onAdvance,
  onCancel,
  onUnclaim,
  onShowClaim,
  offset,
}: {
  order: Order
  label: string | undefined
  busy: boolean
  onAdvance: () => void
  onCancel: () => void
  onUnclaim: () => void
  /** レジの注文の QR と確認コードを出す（お客様のスマホに登録してもらう） */
  onShowClaim: () => void
  /** サーバーの時刻 − 端末の時刻（ミリ秒） */
  offset: number
}) {
  // お渡し待ちのあいだは、受け取り期限までの残り時間を1秒ごとに数える
  const deadline = o.status === 'ready' && o.pickup_deadline ? Date.parse(o.pickup_deadline) : null
  const now = useNow(deadline != null ? 1000 : null) + offset
  const left = deadline != null ? deadline - now : null
  const overdue = left != null && left <= 0
  return (
    <article className={`card fade-in ${overdue ? 'is-overdue' : ''}`} style={{ animationDuration: '.8s' }}>
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
            <ItemNote note={it.note} />
          </div>
        ))}
      </div>
      {o.note && (
        <p className="order-note" style={{ marginBottom: 14 }}>
          <span className="order-note-label">全体へのご希望</span>
          {o.note}
        </p>
      )}
      <div className="ocard-foot">
        {o.paid ? (
          <span className="tag">支払済</span>
        ) : (
          <span className="tag tag-strong">未払い {yen(o.total)}</span>
        )}
        {left != null && (
          <span className={`tag pickup-timer ${overdue ? 'tag-strong' : ''}`} role="timer">
            {overdue ? `期限切れ（${Math.ceil(-left / 60000)}分超過）` : `期限まで ${countdown(left)}`}
          </span>
        )}
        <span className="spacer" />
        {o.channel === 'pos' && (
          <button type="button" className="btn btn-text" onClick={onShowClaim}>
            QR
          </button>
        )}
        {o.status === 'ready' && (
          <button type="button" className="btn btn-text" onClick={onUnclaim} disabled={busy}>
            未受取にする
          </button>
        )}
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
        {label}
      </button>
    </article>
  )
}

/** 残り時間を「12:34」（分:秒）の形にする。 */
function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** 未受取にする確認。期限前でもできるが、そのときは「まだ期限前です」と添える。 */
function UnclaimSheet({ order, offset, onClose, onConfirm }: { order: Order; offset: number; onClose: () => void; onConfirm: () => void }) {
  const deadline = order.pickup_deadline ? Date.parse(order.pickup_deadline) : null
  const now = useNow(1000) + offset
  const left = deadline != null ? deadline - now : null
  return (
    <Sheet title={`${order.order_no} を未受取にする`} onClose={onClose}>
      <div className="stack">
        {left != null && left > 0 && (
          <p className="error-text">まだ期限前です（残り {countdown(left)}、{hhmm(order.pickup_deadline)} まで）。</p>
        )}
        <p className="sub">
          取り置きをやめて、店頭販売に回します。お客様の画面には「取り置きを終了しました」と表示されます。
          元に戻すには、店長の管理画面で状態を直してください。
        </p>
        <button type="button" className="btn btn-done btn-block" onClick={onConfirm}>
          未受取にする
        </button>
      </div>
    </Sheet>
  )
}

function CancelSheet({
  order,
  businessType,
  onClose,
  onCancel,
}: {
  order: Order
  businessType?: BusinessType
  onClose: () => void
  onCancel: (reason: string) => void
}) {
  const w = wording(businessType)
  const [reason, setReason] = useState('')
  return (
    <Sheet title={`${order.order_no} を取り消す`} onClose={onClose}>
      <div className="stack">
        <p className="sub">
          {w.cancelNotice}
          {order.paid && w.cancelPaidNotice}
        </p>
        <label className="field">
          <span className="field-label">理由（任意）</span>
          <input className="input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={w.cancelPlaceholder} />
        </label>
        <button type="button" className="btn btn-done btn-block" onClick={() => onCancel(reason.trim())}>
          取り消す
        </button>
      </div>
    </Sheet>
  )
}
