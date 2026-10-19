import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { Header } from '../../components/Header'
import { ItemNote } from '../../components/LineNote'
import { Log, type LogEntry } from '../../components/Terminal'
import { VerticalLabel } from '../../components/VerticalLabel'
import { ApiError, apiFetch, errorMessage } from '../../lib/api'
import { storeStyle } from '../../lib/colors'
import { hhmm, yen } from '../../lib/format'
import type { CustomerOrder } from '../../lib/types'
import { wording } from '../../lib/wording'
import { NotFoundPage } from '../NotFoundPage'

/** お客様: 注文完了・お呼び出し（注文状況は自動で更新する）。 */
export function OrderStatusPage() {
  const { token = '' } = useParams()
  const { data, error } = useQuery({
    queryKey: ['order', token],
    queryFn: () => apiFetch<{ order: CustomerOrder }>(`/api/orders/${encodeURIComponent(token)}`).then((r) => r.order),
    refetchInterval: (q) => {
      const st = q.state.data?.status
      return st === 'done' || st === 'cancelled' ? false : 7000
    },
  })

  if (error instanceof ApiError && error.status === 404) {
    return <NotFoundPage message="受付が見つかりません。URL をお確かめください。" />
  }
  if (!data) {
    return (
      <div className="page-sp">
        {error ? <p className="error-text" style={{ marginTop: 40 }}>{errorMessage(error)}</p> : <p className="empty">読み込んでいます…</p>}
      </div>
    )
  }

  const o = data
  const w = wording(o.shop.business_type)
  const steps = w.steps
  const step = w.stepIndex[o.status]
  const log: LogEntry[] = [
    { time: hhmm(o.created_at), text: w.logCreated },
    ...(o.cooking_at ? [{ time: hhmm(o.cooking_at), text: w.logCooking }] : []),
    ...(o.ready_at ? [{ time: hhmm(o.ready_at), text: w.logReady }] : []),
    ...(o.done_at ? [{ time: hhmm(o.done_at), text: w.logDone }] : []),
    ...(o.cancelled_at ? [{ time: hhmm(o.cancelled_at), text: w.logCancelled }] : []),
  ]

  let heading = w.headingReceived
  let message = ''
  if (o.status === 'waiting' || o.status === 'cooking') {
    message =
      o.waiting_ahead > 0
        ? `前に${o.waiting_ahead}組お待ちです${o.estimated_wait_minutes != null ? `（あと約${o.estimated_wait_minutes}分）` : ''}`
        : w.soon
  } else if (o.status === 'ready') {
    heading = w.headingReady
    message = w.readyMessage
  } else if (o.status === 'done') {
    heading = w.headingDone
  } else {
    heading = w.headingCancelled
    message = 'くわしくはお店のスタッフにおたずねください'
  }

  return (
    <div className="page-sp" style={storeStyle(o.shop.color)}>
      <Header name={o.shop.name} />

      <section className="section fade-in stack" style={{ gap: 28 }}>
        <h2 style={{ fontSize: 22 }}>{heading}</h2>

        <VerticalLabel text="お呼び出し番号">
          <div className="call-no" aria-live="polite">
            {o.order_no}
          </div>
          <div className="call-line" aria-hidden="true" />
          {message && (
            <p className="sub" style={{ marginTop: 14, fontSize: 14 }}>
              {message}
            </p>
          )}
        </VerticalLabel>

        {o.status !== 'cancelled' && (
          <div className="progress" aria-label={`進み具合: ${steps[step]}`}>
            <div className="progress-track" />
            <div key={o.status} className="progress-fill" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
            {/* 段階の数は店舗の種類で変わる（飲食4つ・飲食以外3つ） */}
            <div className="progress-steps" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
              {steps.map((s, i) => (
                <span key={s} className={i < step ? 'is-done' : i === step ? 'is-current' : ''}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="lines">
          {o.items.map((it, i) => (
            <div key={i} className="lines-row">
              <span>
                <span className="mincho">{it.name}</span>
                {it.options.length > 0 && <span className="sub">（{it.options.map((x) => x.name).join('、')}）</span>}
                <span className="mono sub"> × {it.quantity}</span>
                <ItemNote note={it.note} />
              </span>
              <span className="mono">{yen(it.subtotal)}</span>
            </div>
          ))}
          <div className="lines-total">
            {o.total === 0 ? (
              <span>料金はかかりません</span>
            ) : (
              <>
                <span>{o.paid ? '合計（お支払い済み）' : w.totalUnpaid}</span>
                <span className="mono">{yen(o.total)}</span>
              </>
            )}
          </div>
        </div>

        {o.note && (
          <p className="order-note">
            <span className="order-note-label">全体へのご希望</span>
            {o.note}
          </p>
        )}

        <Log entries={log} waiting={w.waitingText[o.status]} />

        <div className="stack" style={{ gap: 10 }}>
          <Link to={`/s/${o.shop.slug}`} className="btn btn-primary btn-block">
            {o.shop.name}
            {w.backToMenu}
          </Link>
          <Link to="/" className="btn btn-secondary btn-block">
            ほかのお店を見る
          </Link>
        </div>

        <p className="field-hint">
          このページは自動で更新されます。閉じてしまっても、
          <Link to="/">お店の一覧</Link>の「受付中の番号」から戻れます。
        </p>
      </section>
    </div>
  )
}
