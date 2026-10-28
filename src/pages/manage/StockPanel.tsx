import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { StockAdjust } from '../../components/StockAdjust'
import { apiFetch, errorMessage } from '../../lib/api'
import { mdhm } from '../../lib/format'
import { reasonLabel } from '../../lib/stock'
import type { List, StockLevel } from '../../lib/types'
import { Notice } from './common'
import { useManage } from './context'

type StockDay = {
  business_date: string
  /** 限定数（販売済み＋残り）。未設定なら null（その日は販売できない） */
  limit: number | null
  remaining: number
  sold: number
  waste: number
}

type Adjustment = {
  id: number
  menu_item_id: number
  item_name: string
  business_date: string
  before_remaining: number
  after_remaining: number
  delta: number
  mode: 'delta' | 'set' | 'limit'
  reason: string | null
  memo: string | null
  actor_type: 'staff' | 'manager'
  actor_name: string | null
  created_at: string
}

const stockKeys = {
  days: (id: number) => ['manage', 'stock', id] as const,
  history: (id: number | null) => ['manage', 'stock-adjustments', id] as const,
}

const md = (date: string) => date.slice(5).replace('-', '/')

/** 店長: 限定商品の営業日ごとの限定数・販売済み・残り。限定数の設定と、残りの修正（上限なし・すべての営業日）。 */
export function LimitedStockPanel({ itemId }: { itemId: number }) {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const { data, error } = useQuery({
    queryKey: stockKeys.days(itemId),
    queryFn: () => apiFetch<List<StockDay> & { today: string }>(`/api/manage/menu-items/${itemId}/stock`, { token }),
  })
  const [limits, setLimits] = useState<Record<string, string>>({})
  const [adjusting, setAdjusting] = useState<StockDay | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: stockKeys.days(itemId) })
    void queryClient.invalidateQueries({ queryKey: ['manage', 'stock-adjustments'] })
    void queryClient.invalidateQueries({ queryKey: ['manage', 'items'] })
  }
  const value = (d: StockDay) => limits[d.business_date] ?? (d.limit == null ? '' : String(d.limit))
  const changed = (data?.items ?? []).filter((d) => value(d) !== '' && Number(value(d)) !== d.limit)

  const save = async () => {
    setMsg(null)
    setSaveError(null)
    const below = changed.find((d) => Number(value(d)) < d.sold)
    if (below) {
      setSaveError(`${md(below.business_date)} は販売済みが ${below.sold}個なので、それより少なくはできません。`)
      return
    }
    try {
      await apiFetch(`/api/manage/menu-items/${itemId}/stock`, {
        method: 'PUT',
        token,
        body: { days: changed.map((d) => ({ business_date: d.business_date, limit: Number(value(d)) })) },
      })
      setLimits({})
      setMsg('限定数を保存しました。')
      refresh()
    } catch (e) {
      setSaveError(errorMessage(e))
    }
  }

  return (
    <div className="stack">
      <p className="field-hint">
        営業日ごとに作れる数を入れてください。限定数を入れていない日は、限定の品は売り切れになります。販売済みより少なくはできません。
      </p>
      {error && <p className="error-text">{errorMessage(error)}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>営業日</th>
              <th>限定数</th>
              <th className="num">販売済み</th>
              <th className="num">残り</th>
              <th className="num">失敗・廃棄</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.items.map((d) => (
              <tr key={d.business_date}>
                <td className="mono">
                  {md(d.business_date)}
                  {d.business_date === data.today && <span className="tag" style={{ marginLeft: 6 }}>今日</span>}
                </td>
                <td>
                  <input
                    className="input mono"
                    style={{ width: 88 }}
                    inputMode="numeric"
                    placeholder="未設定"
                    aria-label={`${d.business_date} の限定数`}
                    value={value(d)}
                    onChange={(e) => setLimits({ ...limits, [d.business_date]: e.target.value.replace(/\D/g, '') })}
                  />
                </td>
                <td className="num">{d.sold}</td>
                <td className="num">{d.limit == null ? '—' : d.remaining}</td>
                <td className="num">{d.waste}</td>
                <td>
                  {d.limit != null && (
                    <button type="button" className="btn btn-text" onClick={() => setAdjusting(d)}>
                      残りを直す
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Notice error={saveError} ok={msg} />
      <div>
        <button type="button" className="btn btn-secondary" disabled={changed.length === 0} onClick={save}>
          限定数を保存
        </button>
      </div>

      {adjusting && (
        <div className="og-edit">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="field-label">{md(adjusting.business_date)} の残りを直す</span>
            <button type="button" className="btn btn-text" onClick={() => setAdjusting(null)}>
              閉じる
            </button>
          </div>
          <StockAdjust
            key={adjusting.business_date}
            remaining={adjusting.remaining}
            sold={adjusting.sold}
            maxChange={null}
            submit={(body) =>
              apiFetch<StockLevel>(`/api/manage/menu-items/${itemId}/stock/adjust`, {
                method: 'POST',
                token,
                body: { ...(body as object), business_date: adjusting.business_date },
              })
            }
            onDone={() => {
              setAdjusting(null)
              setMsg('残りを直しました。')
              refresh()
            }}
          />
        </div>
      )}

      <h4 className="field-label" style={{ margin: '8px 0 0' }}>
        修正の記録
      </h4>
      <AdjustmentsTable itemId={itemId} />
    </div>
  )
}

/** 限定数の修正の記録（日時・商品・増減・理由・操作者）。itemId があればその商品だけ。 */
export function AdjustmentsTable({ itemId = null }: { itemId?: number | null }) {
  const { token } = useManage()
  const { data, error } = useQuery({
    queryKey: stockKeys.history(itemId),
    queryFn: () =>
      apiFetch<List<Adjustment>>(`/api/manage/stock-adjustments${itemId != null ? `?menu_item_id=${itemId}` : ''}`, { token }).then((r) => r.items),
  })
  if (error) return <p className="error-text">{errorMessage(error)}</p>
  if (data?.length === 0) return <p className="empty">まだ記録はありません</p>
  return (
    <div className="table-wrap">
      <table className="table table-cards">
        <thead>
          <tr>
            <th>日時</th>
            {itemId == null && <th>商品</th>}
            <th>営業日</th>
            <th className="num">残り</th>
            <th>理由</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((a) => (
            <tr key={a.id}>
              <td className="mono cell-title" style={{ fontSize: 12 }}>
                {mdhm(a.created_at)}
              </td>
              {itemId == null && <td data-label="商品">{a.item_name}</td>}
              <td className="mono" data-label="営業日">
                {md(a.business_date)}
              </td>
              <td className="num" data-label="残り">
                {a.before_remaining} → {a.after_remaining}
                <span className="sub">（{a.delta > 0 ? `+${a.delta}` : a.delta}）</span>
              </td>
              <td data-label="理由">
                {a.mode === 'set' ? '実数に合わせる・' : ''}
                {reasonLabel(a.reason)}
                {a.memo && <span className="sub">（{a.memo}）</span>}
              </td>
              <td data-label="操作">{a.actor_type === 'manager' ? `店長${a.actor_name ? `（${a.actor_name}）` : ''}` : 'スタッフ（レジ）'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
