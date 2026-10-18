import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { Header } from '../../components/Header'
import { Log, type LogEntry } from '../../components/Terminal'
import { VerticalLabel } from '../../components/VerticalLabel'
import { ApiError, apiFetch, errorMessage } from '../../lib/api'
import { storeStyle } from '../../lib/colors'
import { hhmm, yen } from '../../lib/format'
import type { CustomerOrder, OrderStatus } from '../../lib/types'
import { NotFoundPage } from '../NotFoundPage'

const steps = ['受付', '調理', '仕上げ', 'お渡し']
const stepIndex: Record<OrderStatus, number> = { waiting: 0, cooking: 1, ready: 2, done: 3, cancelled: -1 }

const waitingText: Partial<Record<OrderStatus, string>> = {
  waiting: '調理の順番を待っています',
  cooking: 'できあがりを待っています',
  ready: 'お受け取りをお待ちしています',
}

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
    return <NotFoundPage message="ご注文が見つかりません。URL をお確かめください。" />
  }
  if (!data) {
    return (
      <div className="page-sp">
        {error ? <p className="error-text" style={{ marginTop: 40 }}>{errorMessage(error)}</p> : <p className="empty">読み込んでいます…</p>}
      </div>
    )
  }

  const o = data
  const step = stepIndex[o.status]
  const log: LogEntry[] = [
    { time: hhmm(o.created_at), text: 'ご注文を受け付けました' },
    ...(o.cooking_at ? [{ time: hhmm(o.cooking_at), text: '調理をはじめました' }] : []),
    ...(o.ready_at ? [{ time: hhmm(o.ready_at), text: 'できあがりました' }] : []),
    ...(o.done_at ? [{ time: hhmm(o.done_at), text: 'お渡ししました。ありがとうございました' }] : []),
    ...(o.cancelled_at ? [{ time: hhmm(o.cancelled_at), text: 'ご注文を取り消しました' }] : []),
  ]

  let heading = 'ご注文を承りました'
  let message = ''
  if (o.status === 'waiting' || o.status === 'cooking') {
    message =
      o.waiting_ahead > 0
        ? `前に${o.waiting_ahead}組お待ちです${o.estimated_wait_minutes != null ? `（あと約${o.estimated_wait_minutes}分）` : ''}`
        : 'まもなくお作りします'
  } else if (o.status === 'ready') {
    heading = 'できあがりました'
    message = 'お店でこの番号をお見せください'
  } else if (o.status === 'done') {
    heading = 'お受け取りありがとうございました'
  } else {
    heading = 'ご注文は取り消されました'
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
            <div className="progress-steps">
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
              </span>
              <span className="mono">{yen(it.subtotal)}</span>
            </div>
          ))}
          <div className="lines-total">
            <span>{o.paid ? '合計（お支払い済み）' : '合計（お受け取りの際にお支払い）'}</span>
            <span className="mono">{yen(o.total)}</span>
          </div>
        </div>

        {o.note && (
          <p className="order-note">
            <span className="order-note-label">ご希望</span>
            {o.note}
          </p>
        )}

        <Log entries={log} waiting={waitingText[o.status]} />

        <div className="stack" style={{ gap: 10 }}>
          <Link to={`/s/${o.shop.slug}`} className="btn btn-primary btn-block">
            {o.shop.name}のお品書きに戻る
          </Link>
          <Link to="/" className="btn btn-secondary btn-block">
            ほかのお店を見る
          </Link>
        </div>

        <p className="field-hint">
          このページは自動で更新されます。閉じてしまっても、
          <Link to="/">お店の一覧</Link>の「ご注文中」から戻れます。
        </p>
      </section>
    </div>
  )
}
