import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Sheet } from '../../components/Sheet'
import { apiFetch, errorMessage } from '../../lib/api'
import { mdhm, yen } from '../../lib/format'
import type { ManagerOrder, OrderStatus } from '../../lib/types'
import { Notice, PageHead, Panel } from './common'
import { useManage, useShopWording } from './context'

type SearchResult = { items: ManagerOrder[]; total: number }
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

  const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) })
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

  return (
    <div className="mpage">
      <PageHead title="注文" />
      <Panel title="検索">
        <form className="form-grid" onSubmit={search}>
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
        <p className="field-hint" style={{ marginTop: 12 }}>
          お客様の個人情報を扱います。検索・閲覧は記録に残ります。
        </p>
      </Panel>

      <Panel title={data ? `結果 ${data.total}件` : '結果'}>
        {error && <p className="error-text">{errorMessage(error)}</p>}
        <div className="table-wrap">
          <table className="table table-cards table-cards-orders">
            <thead>
              <tr>
                <th>番号</th>
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
                <th>ご希望</th>
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
                </span>
                <span className="mono">{yen(it.subtotal)}</span>
              </div>
            ))}
            <div className="lines-total">
              <span>合計</span>
              <span className="mono">{yen(o.total)}</span>
            </div>
          </div>

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
