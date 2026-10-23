import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { InlineBar } from '../../../components/BarChart'
import { apiFetch, errorMessage } from '../../../lib/api'
import { shopColors } from '../../../lib/colors'
import { yen } from '../../../lib/format'
import type { List } from '../../../lib/types'
import { PageHead, Panel } from '../common'
import { useManage } from '../context'
import type { AdminShop } from './ShopsPage'

type Totals = { event_id?: number; items: { shop_id: number; slug: string; name: string; revenue: number; orders: number }[]; revenue: number; orders: number }
type Event = { id: number; name: string; is_current: boolean }

/** システム管理者: 開催回の全店の売上（売上の多い順）。 */
export function AllSalesPage() {
  const { token } = useManage()
  const [eventId, setEventId] = useState('')
  const events = useQuery({
    queryKey: ['admin', 'events'],
    queryFn: () => apiFetch<List<Event>>('/api/admin/events', { token }).then((r) => r.items),
  })
  const shops = useQuery({
    queryKey: ['admin', 'shops'],
    queryFn: () => apiFetch<List<AdminShop>>('/api/admin/shops', { token }).then((r) => r.items),
  })
  const totals = useQuery({
    queryKey: ['admin', 'totals', eventId],
    queryFn: () => apiFetch<Totals>(`/api/admin/analytics/shops${eventId ? `?event_id=${eventId}` : ''}`, { token }),
    placeholderData: keepPreviousData,
  })
  const color = (id: number) => shopColors[shops.data?.find((s) => s.id === id)?.color ?? 'yamabuki'].hex
  const max = Math.max(0, ...(totals.data?.items.map((i) => i.revenue) ?? []))

  return (
    <div className="mpage">
      <PageHead title="全店の売上" />
      <label className="field" style={{ maxWidth: 320 }}>
        <span className="field-label">開催回</span>
        <select className="select" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">今の開催回</option>
          {events.data?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      {totals.error && <p className="error-text">{errorMessage(totals.error)}</p>}

      <div className="stats">
        <div className="stat">
          <div className="stat-label">全店の売上</div>
          <div className="stat-value">{yen(totals.data?.revenue ?? 0)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">注文</div>
          <div className="stat-value">{totals.data?.orders ?? 0}件</div>
        </div>
      </div>

      <Panel title="店舗ごと">
        <table className="table" style={{ opacity: totals.isFetching ? 0.6 : 1 }}>
          <thead>
            <tr>
              <th>店舗</th>
              <th className="num">注文</th>
              <th className="num">売上</th>
              <th style={{ width: '35%' }} />
            </tr>
          </thead>
          <tbody>
            {totals.data?.items.map((t) => (
              <tr key={t.shop_id}>
                <td>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="dot dot-lg" style={{ background: color(t.shop_id) }} aria-hidden="true" />
                    <span className="mincho">{t.name}</span>
                  </span>
                </td>
                <td className="num">{t.orders}件</td>
                <td className="num">{yen(t.revenue)}</td>
                <td style={{ verticalAlign: 'middle' }}>
                  <InlineBar value={t.revenue} max={max} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totals.data?.items.length === 0 && <p className="empty">出店している店舗がありません</p>}
      </Panel>

      {(eventId || totals.data?.event_id) && <Compare eventId={Number(eventId || totals.data?.event_id)} />}
    </div>
  )
}

type CompareRow = {
  shop_id: number
  name: string
  revenue: number
  orders: number
  items_sold: number
  average_order_value: number
  p50_wait_seconds: number | null
  sold_outs: number
  waste: number
}

const signed = (n: number) => (n < 0 ? `−${yen(-n)}` : yen(n))

/** 店舗間の比較（回の本番の日）。差引は収支（本番の合計）から */
function Compare({ eventId }: { eventId: number }) {
  const { token } = useManage()
  const rows = useQuery({
    queryKey: ['admin', 'compare', eventId],
    queryFn: () => apiFetch<List<CompareRow>>(`/api/admin/analytics/compare?event_id=${eventId}`, { token }).then((r) => r.items),
  })
  const ledger = useQuery({
    queryKey: ['admin', 'ledger', 'event', eventId],
    queryFn: () => apiFetch<{ items: { shop_id: number; balance: number }[] }>(`/api/admin/ledger/report?event_id=${eventId}`, { token }).then((r) => r.items),
  })
  const balance = (id: number) => ledger.data?.find((l) => l.shop_id === id)?.balance
  return (
    <Panel title="店舗間の比較（本番の日）">
      <p className="sub" style={{ fontSize: 13, marginBottom: 12 }}>
        本番の開催回の日の注文で比べます（練習の日は入りません）。差引は収支（収入 − 支出）、待ちは注文からお渡し可能までの中央値です。
      </p>
      {(rows.error || ledger.error) && <p className="error-text">{errorMessage(rows.error ?? ledger.error)}</p>}
      <div className="table-wrap">
        <table className="table table-cards">
          <thead>
            <tr>
              <th>店舗</th>
              <th className="num">売上</th>
              <th className="num">注文</th>
              <th className="num">販売数</th>
              <th className="num">客単価</th>
              <th className="num">待ち</th>
              <th className="num">売り切れ</th>
              <th className="num">廃棄</th>
              <th className="num">差引</th>
            </tr>
          </thead>
          <tbody>
            {rows.data?.map((r) => (
              <tr key={r.shop_id}>
                <td className="cell-title mincho">{r.name}</td>
                <td className="num" data-label="売上">{yen(r.revenue)}</td>
                <td className="num" data-label="注文">{r.orders}件</td>
                <td className="num" data-label="販売数">{r.items_sold}点</td>
                <td className="num" data-label="客単価">{yen(r.average_order_value)}</td>
                <td className="num" data-label="待ち">{r.p50_wait_seconds == null ? '—' : `${Math.round(r.p50_wait_seconds / 60)}分`}</td>
                <td className="num" data-label="売り切れ">{r.sold_outs}回</td>
                <td className="num" data-label="廃棄">{yen(r.waste)}</td>
                <td className="num" data-label="差引">{balance(r.shop_id) == null ? '—' : signed(balance(r.shop_id)!)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.data?.length === 0 && <p className="empty">出店している店舗がありません</p>}
      </div>
    </Panel>
  )
}
