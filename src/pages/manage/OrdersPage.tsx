import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { ItemNote } from '../../components/LineNote'
import { DiscountTotals, OrderDiscountEditor } from '../../components/OrderDiscountEditor'
import { discountedByLabel } from '../../lib/discount'
import { Sheet } from '../../components/Sheet'
import { apiFetch, errorMessage } from '../../lib/api'
import { mdhm, yen } from '../../lib/format'
import type { DiscountPreset, List, ManagerOrder, Order, OrderStatus, ShopEvent } from '../../lib/types'
import { Notice, PageHead, Panel } from './common'
import { useManage, useShopWording } from './context'

type SearchResult = {
  items: ManagerOrder[]
  total: number
  /** 実際に絞り込んだ開催回（すべての開催回なら null） */
  event: ShopEvent | null
  /** current（今の開催回）/ latest（出店した最新）/ none（出店した開催回なし）/ selected / all */
  event_scope: 'current' | 'latest' | 'none' | 'selected' | 'all'
}
type Filters = { q: string; date: string; status: string }

const pageSize = 50

/** 店長: 注文・お客様の検索と、注文の修正。検索と詳細の表示は記録に残る。 */
export function OrdersPage() {
  const { token } = useManage()
  const w = useShopWording()
  const [draft, setDraft] = useState<Filters>({ q: '', date: '', status: '' })
  const [filters, setFilters] = useState<Filters>(draft)
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  // 開催回は URL の ?event= に持つ（再読み込み・共有で同じ条件になる）。なければ今の開催回
  const [urlParams, setUrlParams] = useSearchParams()
  const eventParam = urlParams.get('event') ?? ''

  const { data: events } = useQuery({
    queryKey: ['manage', 'events'],
    queryFn: () => apiFetch<{ items: ShopEvent[] }>('/api/manage/events', { token }).then((r) => r.items),
  })
  const eventName = (id: number) => events?.find((e) => e.id === id)?.name ?? `#${id}`

  const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) })
  if (eventParam) params.set('event_id', eventParam)
  if (filters.q) params.set('q', filters.q)
  if (filters.date) params.set('date', filters.date)
  if (filters.status) params.set('status', filters.status)

  const { data, error, isFetching } = useQuery({
    queryKey: ['manage', 'orders', params.toString()],
    queryFn: () => apiFetch<SearchResult>(`/api/manage/orders?${params}`, { token }),
  })

  const search = (e: FormEvent) => {
    e.preventDefault()
    setOffset(0)
    setFilters(draft)
  }

  // 開催回は選んだらすぐ検索し直す
  const changeEvent = (value: string) => {
    setOffset(0)
    setUrlParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set('event', value)
        else next.delete('event')
        return next
      },
      { replace: true },
    )
  }
  // プルダウンの表示: URL の指定、なければ実際に使われた開催回
  const eventValue = eventParam || (data?.event ? String(data.event.id) : '')
  const showAll = data?.event_scope === 'all'
  // 過去の開催回（とすべての開催回）は、個人情報を消した注文が混ざる
  const mayBePurged = showAll || (data?.event != null && !data.event.is_current)

  return (
    <div className="mpage">
      <PageHead title="注文" />
      <Panel title="検索">
        <form className="form-grid" onSubmit={search}>
          <label className="field">
            <span className="field-label">開催回</span>
            <select className="select" value={eventValue} onChange={(e) => changeEvent(e.target.value)}>
              {!eventValue && <option value="">{events?.length === 0 ? '（出店した開催回はありません）' : '今の開催回'}</option>}
              {events?.map((ev) => (
                <option key={ev.id} value={String(ev.id)}>
                  {ev.name}
                  {ev.is_current ? '（開催中）' : ''}
                </option>
              ))}
              {/* URL で指定した開催回が一覧にないとき（出店していないなど）も、選ばれていることが分かるように */}
              {eventParam && eventParam !== 'all' && !events?.some((ev) => String(ev.id) === eventParam) && (
                <option value={eventParam}>指定の開催回（#{eventParam}）</option>
              )}
              <option value="all">すべての開催回</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">整理番号・お名前・メール</span>
            <input className="input" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder="A-12 / 山田 / taro@" />
          </label>
          <label className="field">
            <span className="field-label">営業日</span>
            <input className="input" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">状態</span>
            <select className="select" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              <option value="">すべて</option>
              {Object.entries(w.status).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary">
            検索
          </button>
        </form>
        {mayBePurged && (
          <p className="field-hint" style={{ marginTop: 12 }}>
            個人情報の保持期間を過ぎた注文は、名前・メールアドレスでは検索できません（整理番号では検索できます）。
          </p>
        )}
        <p className="field-hint" style={{ marginTop: 12 }}>
          お客様の個人情報を扱います。検索・閲覧は記録に残ります。
        </p>
      </Panel>

      <Panel title={data ? `結果 ${data.total}件` : '結果'}>
        {error && <p className="error-text">{errorMessage(error)}</p>}
        {data && (
          <p className="sub" style={{ marginBottom: 12 }}>
            {data.event
              ? `${data.event.name}の注文を表示中${data.event_scope === 'latest' ? '（今の開催回に出店していないため、出店した最新の開催回）' : ''}`
              : showAll
                ? 'すべての開催回の注文を表示中'
                : '出店した開催回がないため、表示する注文はありません'}
          </p>
        )}
        <div className="table-wrap">
          <table className="table table-cards table-cards-orders">
            <thead>
              <tr>
                <th>番号</th>
                {showAll && <th>開催回</th>}
                <th>日時</th>
                <th>経路</th>
                <th>状態</th>
                <th>支払い</th>
                <th>お名前</th>
                <th>メール</th>
                <th className="num">合計</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((o) => (
                <tr key={o.id} className="clickable" onClick={() => setSelected(o.id)}>
                  <td className="mono cell-title">{o.order_no}</td>
                  {showAll && <td data-label="開催回">{eventName(o.event_id)}</td>}
                  <td className="mono" data-label="日時">{mdhm(o.created_at)}</td>
                  <td data-label="経路">{o.channel === 'web' ? 'Web' : 'レジ'}</td>
                  <td data-label="状態">{w.status[o.status] ?? o.status}</td>
                  <td data-label="支払い">{o.paid ? '支払済' : <span className="tag tag-strong">未払い</span>}</td>
                  <td data-label="お名前">{o.customer_name ?? '—'}</td>
                  <td className="mono cell-wide" style={{ fontSize: 12 }} data-label="メール">
                    {o.email ?? '—'}
                  </td>
                  <td className="num" data-label="合計">{yen(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.items.length === 0 && <p className="empty">見つかりませんでした</p>}
        </div>
        {data && data.total > pageSize && (
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button type="button" className="btn btn-text" disabled={offset === 0 || isFetching} onClick={() => setOffset(Math.max(0, offset - pageSize))}>
              前へ
            </button>
            <span className="mono sub">
              {offset + 1}–{Math.min(offset + pageSize, data.total)} / {data.total}
            </span>
            <button
              type="button"
              className="btn btn-text"
              disabled={offset + pageSize >= data.total || isFetching}
              onClick={() => setOffset(offset + pageSize)}
            >
              次へ
            </button>
          </div>
        )}
      </Panel>

      {selected && <OrderDetail id={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function OrderDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { token } = useManage()
  const w = useShopWording()
  const queryClient = useQueryClient()
  const { data: o, error } = useQuery({
    queryKey: ['manage', 'order', id],
    queryFn: () => apiFetch<ManagerOrder>(`/api/manage/orders/${id}`, { token }),
  })
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [paid, setPaid] = useState<boolean | null>(null)
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [discounting, setDiscounting] = useState(false)
  const presets = useQuery({
    queryKey: ['manage', 'discounts'],
    queryFn: () => apiFetch<List<DiscountPreset>>('/api/manage/discounts', { token }).then((r) => r.items),
    enabled: discounting,
  })

  const save = async () => {
    if (!o) return
    setMsg(null)
    setSaveError(null)
    try {
      const body: Record<string, unknown> = {}
      if (status && status !== o.status) body.status = status
      if (paid !== null && paid !== o.paid) body.paid = paid
      if (status === 'cancelled' && reason.trim()) body.cancel_reason = reason.trim()
      if (Object.keys(body).length === 0) return
      const updated = await apiFetch<ManagerOrder>(`/api/manage/orders/${id}`, { method: 'PATCH', token, body })
      queryClient.setQueryData(['manage', 'order', id], updated)
      void queryClient.invalidateQueries({ queryKey: ['manage', 'orders'] })
      setStatus('')
      setPaid(null)
      setMsg('修正しました。')
    } catch (e) {
      setSaveError(errorMessage(e))
    }
  }

  return (
    <Sheet title={o ? `注文 ${o.order_no}` : '注文'} onClose={onClose} wide>
      {error && <p className="error-text">{errorMessage(error)}</p>}
      {o && (
        <div className="stack">
          <table className="table">
            <tbody>
              <tr>
                <th>状態</th>
                <td>
                  {w.status[o.status] ?? o.status}
                  {o.cancel_reason && <span className="sub">（{o.cancel_reason}）</span>}
                </td>
              </tr>
              <tr>
                <th>経路・支払い</th>
                <td>
                  {o.channel === 'web' ? 'Web' : 'レジ'}・{o.paid ? `支払済（${mdhm(o.paid_at)}）` : '未払い'}
                </td>
              </tr>
              <tr>
                <th>お客様</th>
                <td>
                  {o.customer_name ?? '—'}　<span className="mono">{o.email ?? ''}</span>
                </td>
              </tr>
              <tr>
                <th>全体へのご希望</th>
                <td style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{o.note ?? '—'}</td>
              </tr>
              <tr>
                <th>時刻</th>
                <td className="mono" style={{ fontSize: 12 }}>
                  受付 {mdhm(o.created_at)}
                  {o.cooking_at && ` ／ ${w.timeCooking} ${mdhm(o.cooking_at)}`}
                  {o.ready_at && ` ／ ${w.timeReady} ${mdhm(o.ready_at)}`}
                  {o.done_at && ` ／ ${w.timeDone} ${mdhm(o.done_at)}`}
                  {o.cancelled_at && ` ／ 取り消し ${mdhm(o.cancelled_at)}`}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="lines">
            {o.items.map((it, i) => (
              <div key={i} className="lines-row">
                <span>
                  <span className="mincho">{it.name}</span>
                  {it.options.length > 0 && <span className="sub">（{it.options.map((x) => x.name).join('、')}）</span>}
                  <span className="mono sub">
                    {' '}
                    {yen(it.unit_price)} × {it.quantity}
                  </span>
                  <ItemNote note={it.note} />
                  {it.discounted_at && (
                    <span className="discount-note">
                      {it.discount_name ?? `自由入力（${it.discount_reason ?? ''}）`}　−{yen(it.discount_amount)}
                      <span className="sub" style={{ marginLeft: 12 }}>
                        {discountedByLabel(it.discounted_by)} {mdhm(it.discounted_at)}
                      </span>
                    </span>
                  )}
                </span>
                <span className="price-stack">
                  {it.discount_amount > 0 && <s className="mono sub">{yen(it.subtotal)}</s>}
                  <span className="mono">{yen(it.subtotal - it.discount_amount)}</span>
                </span>
              </div>
            ))}
            {o.order_discount && (
              <div className="lines-row">
                <span>
                  注文全体の値引き
                  <span className="discount-note">
                    {o.order_discount.name ?? `自由入力（${o.order_discount.reason ?? ''}）`}
                    <span className="sub" style={{ marginLeft: 12 }}>
                      {discountedByLabel(o.order_discount.by)} {mdhm(o.order_discount.at)}
                    </span>
                  </span>
                </span>
                <span className="mono">−{yen(o.order_discount.amount)}</span>
              </div>
            )}
            {o.discount_total > 0 ? (
              <DiscountTotals list={o.list_total} total={o.total} />
            ) : (
              <div className="lines-total">
                <span>合計</span>
                <span className="mono">{yen(o.total)}</span>
              </div>
            )}
          </div>

          {o.status !== 'cancelled' && o.status !== 'unclaimed' && (
            <div className="panel" style={{ background: 'transparent' }}>
              <h3 className="panel-title">値引き</h3>
              {discounting ? (
                <>
                  <OrderDiscountEditor
                    order={o}
                    presets={presets.data ?? []}
                    freeLimit={null}
                    save={(body) => apiFetch<Order>(`/api/manage/orders/${id}/discounts`, { method: 'PUT', token, body })}
                    onSaved={(updated) => {
                      queryClient.setQueryData(['manage', 'order', id], { ...o, ...updated })
                      void queryClient.invalidateQueries({ queryKey: ['manage', 'orders'] })
                      setDiscounting(false)
                      setMsg('値引きを直しました。')
                    }}
                  />
                  <button type="button" className="btn btn-text" onClick={() => setDiscounting(false)}>
                    やめる
                  </button>
                </>
              ) : (
                <>
                  <p className="field-hint" style={{ marginBottom: 10 }}>
                    {o.paid
                      ? '会計済みの注文です。値引きを変えると支払額が変わります（返金・追加の受け取りは店頭で行ってください）。'
                      : '会計前の注文です。レジ（注文帳の受け取り）でも値引きを付けられます。'}
                  </p>
                  <button type="button" className="btn btn-secondary" onClick={() => setDiscounting(true)}>
                    値引きを直す
                  </button>
                </>
              )}
            </div>
          )}

          <div className="panel" style={{ background: 'transparent' }}>
            <h3 className="panel-title">修正</h3>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">状態</span>
                <select className="select" value={status || o.status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
                  {Object.entries(w.status).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              {o.channel === 'web' && (
                <label className="check">
                  <input type="checkbox" checked={paid ?? o.paid} onChange={(e) => setPaid(e.target.checked)} />
                  支払い済み
                </label>
              )}
              {(status || o.status) === 'cancelled' && (
                <label className="field">
                  <span className="field-label">取り消しの理由</span>
                  <input className="input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
                </label>
              )}
            </div>
            <p className="field-hint" style={{ margin: '10px 0' }}>
              {w.correctionHint}
            </p>
            <Notice error={saveError} ok={msg} />
            <button type="button" className="btn btn-secondary" onClick={save}>
              修正を保存
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
