import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { BarChart, InlineBar } from '../../components/BarChart'
import { PieChart } from '../../components/PieChart'
import { API_BASE_URL, apiFetch, errorMessage } from '../../lib/api'
import { yen } from '../../lib/format'
import { Notice, PageHead, Panel } from './common'
import { useManage, useShopWording } from './context'

type Summary = {
  revenue: number
  orders: number
  average_order_value: number
  items_sold: number
  by_day: { date: string; revenue: number; orders: number }[]
  by_channel: { channel: string; revenue: number; orders: number }[]
}
type Items = {
  items: { menu_item_id: number | null; name: string; quantity: number; revenue: number }[]
  options: { group: string; name: string; quantity: number }[]
}
type Hourly = { date: string; start: string; orders: number; revenue: number }
type WaitTimes = {
  count: number
  avg_seconds: number | null
  p50_seconds: number | null
  p90_seconds: number | null
  max_seconds: number | null
  avg_cook_seconds: number | null
}
type Losses = {
  cancelled_orders: number
  cancelled_amount: number
  cancel_reasons: { reason: string; count: number }[]
  unclaimed_orders: number
  unclaimed_amount: number
}
type EventRow = { event_id: number; name: string; starts_on: string; revenue: number; orders: number; average_order_value: number }

const minutes = (s: number | null) => (s == null ? '—' : `${Math.round(s / 60)}分`)

/** 店長: 売上分析。上の1行の条件（開催回・時間の区切り・日）がすべてのグラフに効く。 */
export function SalesPage() {
  const { token } = useManage()
  const w = useShopWording()
  const [eventId, setEventId] = useState<string>('') // '' = 今の開催回
  const [interval, setInterval] = useState(30)
  const [day, setDay] = useState<string>('')
  const [csvError, setCsvError] = useState<string | null>(null)

  const scope = eventId ? `event_id=${eventId}` : ''
  const get = <T,>(path: string, extra = '') => {
    const q = [scope, extra].filter(Boolean).join('&')
    return apiFetch<T>(`/api/manage/analytics/${path}${q ? `?${q}` : ''}`, { token })
  }
  const opts = { placeholderData: keepPreviousData }

  const events = useQuery({ queryKey: ['sales', 'events'], queryFn: () => apiFetch<{ items: EventRow[] }>('/api/manage/analytics/events', { token }) })
  const summary = useQuery({ queryKey: ['sales', 'summary', scope], queryFn: () => get<Summary>('summary'), ...opts })
  const items = useQuery({ queryKey: ['sales', 'items', scope], queryFn: () => get<Items>('items'), ...opts })
  const hourly = useQuery({
    queryKey: ['sales', 'hourly', scope, interval],
    queryFn: () => get<{ items: Hourly[] }>('hourly', `interval=${interval}`),
    ...opts,
  })
  const waits = useQuery({ queryKey: ['sales', 'waits', scope], queryFn: () => get<WaitTimes>('wait-times'), ...opts })
  const losses = useQuery({ queryKey: ['sales', 'losses', scope], queryFn: () => get<Losses>('losses'), ...opts })

  const days = summary.data?.by_day.map((d) => d.date) ?? []
  const selectedDay = day && days.includes(day) ? day : days.at(-1) ?? ''
  const hourlyRows = (hourly.data?.items ?? []).filter((h) => h.date === selectedDay)
  const fetching = summary.isFetching || hourly.isFetching
  const error = summary.error ?? items.error ?? hourly.error

  const downloadCsv = async () => {
    setCsvError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/manage/analytics/export.csv${scope ? `?${scope}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`CSV を作れませんでした（${res.status}）`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'orders.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setCsvError(errorMessage(e))
    }
  }

  const s = summary.data
  const maxItem = Math.max(0, ...(items.data?.items.map((i) => i.revenue) ?? []))
  const maxEvent = Math.max(0, ...(events.data?.items.map((e) => e.revenue) ?? []))
  const channelTotal = s?.by_channel.reduce((a, c) => a + c.revenue, 0) ?? 0
  // 選択肢は組ごとに円グラフにする（組の中での選ばれ方の割合）。選択肢が1つしかない組は円にしない
  const optionGroups = groupOptions(items.data?.options ?? []).filter((g) => g.options.length >= 2)

  return (
    <div className="mpage">
      <PageHead title="売上">
        <button type="button" className="btn btn-secondary" onClick={downloadCsv}>
          CSV を書き出す
        </button>
      </PageHead>

      {/* 条件はこの1行だけ。下のすべてに効く */}
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <label className="field">
          <span className="field-label">開催回</span>
          <select className="select" value={eventId} onChange={(e) => { setEventId(e.target.value); setDay('') }}>
            <option value="">今の開催回</option>
            {events.data?.items.map((e) => (
              <option key={e.event_id} value={e.event_id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">時間帯の区切り</span>
          <select className="select" value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
            <option value={15}>15分</option>
            <option value={30}>30分</option>
            <option value={60}>1時間</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">時間帯を見る日</span>
          <select className="select" value={selectedDay} onChange={(e) => setDay(e.target.value)} disabled={days.length === 0}>
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Notice error={csvError ?? (error ? errorMessage(error) : null)} />

      <div className="stack" style={{ gap: 32, opacity: fetching ? 0.6 : 1, transition: 'opacity var(--dur-hover)' }}>
        <div className="stats">
          <Stat label="売上" value={s ? yen(s.revenue) : '—'} note="支払い済み・取り消しを除く" />
          <Stat label="注文" value={s ? `${s.orders}件` : '—'} />
          <Stat label="客単価" value={s ? yen(s.average_order_value) : '—'} />
          <Stat label="販売個数" value={s ? `${s.items_sold}個` : '—'} />
        </div>

        <Panel title="日別の売上">
          {s && s.by_day.length > 0 ? (
            <BarChart data={s.by_day} x={(d) => d.date.slice(5).replace('-', '/')} title={(d) => d.date} y={(d) => d.revenue} format={yen} label="売上" />
          ) : (
            <p className="empty">まだ売上がありません</p>
          )}
        </Panel>

        <Panel title={`時間帯別の注文数（${selectedDay || '—'}）`}>
          {hourlyRows.length > 0 ? (
            <BarChart
              data={hourlyRows}
              x={(h) => h.start}
              title={(h) => `${h.date} ${h.start}〜`}
              y={(h) => h.orders}
              format={(v) => `${v}件`}
              label="注文"
            />
          ) : (
            <p className="empty">この日の注文はありません</p>
          )}
        </Panel>

        <Panel title="商品別">
          {items.data && items.data.items.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 className="field-label" style={{ margin: '0 0 8px' }}>
                売上の内訳
              </h4>
              <PieChart data={items.data.items} name={(it) => it.name} value={(it) => it.revenue} format={yen} label="売上" />
            </div>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>品名</th>
                  <th className="num">個数</th>
                  <th className="num">売上</th>
                  <th style={{ width: '30%' }} />
                </tr>
              </thead>
              <tbody>
                {items.data?.items.map((it) => (
                  <tr key={`${it.menu_item_id}-${it.name}`}>
                    <td className="mincho">{it.name}</td>
                    <td className="num">{it.quantity}</td>
                    <td className="num">{yen(it.revenue)}</td>
                    <td style={{ verticalAlign: 'middle' }}>
                      <InlineBar value={it.revenue} max={maxItem} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.data?.items.length === 0 && <p className="empty">まだありません</p>}
          </div>
          {items.data && items.data.options.length > 0 && (
            <>
              <h4 className="field-label" style={{ margin: '20px 0 8px' }}>
                選択肢の選ばれ方
              </h4>
              {optionGroups.length > 0 && (
                <div className="pie-grid" style={{ marginBottom: 16 }}>
                  {optionGroups.map((g) => (
                    <div key={g.group} style={{ minWidth: 0 }}>
                      <h5 className="pie-grid-title">{g.group}</h5>
                      <PieChart data={g.options} name={(o) => o.name} value={(o) => o.quantity} format={(v) => `${v}個`} label="個数" size={132} />
                    </div>
                  ))}
                </div>
              )}
              <table className="table">
                <tbody>
                  {items.data.options.map((o) => (
                    <tr key={`${o.group}-${o.name}`}>
                      <td className="sub">{o.group}</td>
                      <td>{o.name}</td>
                      <td className="num">{o.quantity}個</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Panel>

        <Panel title="注文の経路">
          <table className="table">
            <tbody>
              {s?.by_channel.map((c) => (
                <tr key={c.channel}>
                  <td>{c.channel === 'web' ? 'Web 注文' : 'レジ'}</td>
                  <td className="num">{c.orders}件</td>
                  <td className="num">{yen(c.revenue)}</td>
                  <td className="num">{channelTotal ? Math.round((c.revenue / channelTotal) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title={w.waitPanelTitle}>
          <div className="stats">
            <Stat label="平均" value={minutes(waits.data?.avg_seconds ?? null)} note={`${waits.data?.count ?? 0}件`} />
            <Stat label="ふつう（中央値）" value={minutes(waits.data?.p50_seconds ?? null)} />
            <Stat label="遅いほうの1割" value={minutes(waits.data?.p90_seconds ?? null)} note="これより長く待った注文が1割" />
            <Stat label="いちばん長い" value={minutes(waits.data?.max_seconds ?? null)} />
            {/* 飲食以外の店は調理の段階がないので出さない */}
            {w.usesCooking && <Stat label="調理時間の平均" value={minutes(waits.data?.avg_cook_seconds ?? null)} note="調理中 → できあがり" />}
          </div>
        </Panel>

        <Panel title="ロス">
          <div className="stats">
            <Stat label="取り消し" value={`${losses.data?.cancelled_orders ?? 0}件`} note={yen(losses.data?.cancelled_amount ?? 0)} />
            <Stat label={w.unclaimedLabel} value={`${losses.data?.unclaimed_orders ?? 0}件`} note={`${yen(losses.data?.unclaimed_amount ?? 0)}${w.unclaimedNote}`} />
          </div>
          {losses.data && losses.data.cancel_reasons.length > 0 && (
            <table className="table" style={{ marginTop: 16 }}>
              <tbody>
                {losses.data.cancel_reasons.map((r) => (
                  <tr key={r.reason}>
                    <td>{r.reason}</td>
                    <td className="num">{r.count}件</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="開催回の比較">
          <table className="table">
            <thead>
              <tr>
                <th>開催回</th>
                <th className="num">注文</th>
                <th className="num">客単価</th>
                <th className="num">売上</th>
                <th style={{ width: '30%' }} />
              </tr>
            </thead>
            <tbody>
              {events.data?.items.map((e) => (
                <tr key={e.event_id}>
                  <td className="mincho">
                    {e.name}
                    <span className="mono sub" style={{ fontSize: 11, marginLeft: 8 }}>
                      {e.starts_on}
                    </span>
                  </td>
                  <td className="num">{e.orders}件</td>
                  <td className="num">{yen(e.average_order_value)}</td>
                  <td className="num">{yen(e.revenue)}</td>
                  <td style={{ verticalAlign: 'middle' }}>
                    <InlineBar value={e.revenue} max={maxEvent} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  )
}

/** 選択肢の集計を組ごとにまとめる（組は最初に出てきた順）。 */
function groupOptions(options: Items['options']): { group: string; options: Items['options'] }[] {
  const byGroup = new Map<string, Items['options']>()
  for (const o of options) {
    const list = byGroup.get(o.group)
    if (list) list.push(o)
    else byGroup.set(o.group, [o])
  }
  return [...byGroup].map(([group, opts]) => ({ group, options: opts }))
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  )
}
