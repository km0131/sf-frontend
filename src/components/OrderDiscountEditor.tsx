import { useState } from 'react'
import { errorMessage } from '../lib/api'
import { choiceName, choiceOfItem, choiceOfOrder, lineDiscount, lineDiscountBody, orderDiscount, orderDiscountBody, type DiscountChoice } from '../lib/discount'
import { yen } from '../lib/format'
import type { DiscountPreset, Order } from '../lib/types'
import { DiscountPicker } from './DiscountPicker'

type Props = {
  order: Order
  presets: DiscountPreset[]
  /** 自由入力の上限額（0 なら使えない、null なら上限なし） */
  freeLimit: number | null
  /** 値引きを保存する（PUT .../discounts）。保存したあとの注文を返す */
  save: (body: unknown) => Promise<Order>
  onSaved: (o: Order) => void
}

type Picking = { kind: 'item'; id: number } | { kind: 'order' } | null

const same = (a: DiscountChoice | undefined, b: DiscountChoice | undefined) => JSON.stringify(a) === JSON.stringify(b)

/** 受け付け済みの注文の値引きを付ける・外す（Web 注文の受け取り時の会計、店長の修正）。定価・値引き・支払額を並べて出す。 */
export function OrderDiscountEditor({ order, presets, freeLimit, save, onSaved }: Props) {
  const [items, setItems] = useState<Record<number, DiscountChoice | undefined>>(() =>
    Object.fromEntries(order.items.map((it) => [it.id, choiceOfItem(it)])),
  )
  const [whole, setWhole] = useState<DiscountChoice | undefined>(() => choiceOfOrder(order.order_discount))
  const [picking, setPicking] = useState<Picking>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 目安の金額（変えていない値引きは保存した額のまま）
  const lineAmount = (id: number) => {
    const it = order.items.find((x) => x.id === id)!
    return same(items[id], choiceOfItem(it)) ? it.discount_amount : lineDiscount(items[id], presets, it.unit_price, it.quantity)
  }
  const base = order.items.reduce((s, it) => s + it.subtotal - lineAmount(it.id), 0)
  const wholeAmount = same(whole, choiceOfOrder(order.order_discount)) && base === order.total + (order.order_discount?.amount ?? 0)
    ? (order.order_discount?.amount ?? 0)
    : orderDiscount(whole, presets, base)
  const total = base - wholeAmount
  const changed = !same(whole, choiceOfOrder(order.order_discount)) || order.items.some((it) => !same(items[it.id], choiceOfItem(it)))

  const submit = async () => {
    setSending(true)
    setError(null)
    try {
      const body = {
        items: order.items.filter((it) => items[it.id]).map((it) => ({ item_id: it.id, ...lineDiscountBody(items[it.id]) })),
        ...orderDiscountBody(whole),
      }
      onSaved(await save(body))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSending(false)
    }
  }

  if (picking) {
    const it = picking.kind === 'item' ? order.items.find((x) => x.id === picking.id) : undefined
    return (
      <div className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="field-label">{it ? `${it.name} × ${it.quantity}` : '注文全体'}</span>
          <button type="button" className="btn btn-text" onClick={() => setPicking(null)}>
            ‹ 戻る
          </button>
        </div>
        <DiscountPicker
          scope={picking.kind}
          presets={presets}
          freeLimit={freeLimit}
          value={it ? items[it.id] : whole}
          base={it ? it.subtotal : base}
          onChoose={(c) => {
            if (it) setItems((prev) => ({ ...prev, [it.id]: c }))
            else setWhole(c)
            setPicking(null)
          }}
        />
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="lines">
        {order.items.map((it) => {
          const d = lineAmount(it.id)
          const c = items[it.id]
          return (
            <div key={it.id} className="lines-row" style={{ alignItems: 'center' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="mincho">{it.name}</span>
                {it.options.length > 0 && <span className="sub">（{it.options.map((x) => x.name).join('、')}）</span>}
                <span className="mono sub"> × {it.quantity}</span>
                {c && (
                  <span className="discount-note">
                    {choiceName(c, presets)}　−{yen(d)}
                  </span>
                )}
              </span>
              <span className="price-stack">
                {d > 0 && <s className="mono sub">{yen(it.subtotal)}</s>}
                <span className="mono">{yen(it.subtotal - d)}</span>
              </span>
              <button type="button" className="btn btn-text" onClick={() => setPicking({ kind: 'item', id: it.id })}>
                値引き
              </button>
            </div>
          )
        })}
        <div className="lines-row" style={{ alignItems: 'center' }}>
          <span style={{ flex: 1 }}>
            注文全体の値引き
            {whole && <span className="discount-note">{choiceName(whole, presets)}　−{yen(wholeAmount)}</span>}
          </span>
          <button type="button" className="btn btn-text" onClick={() => setPicking({ kind: 'order' })}>
            {whole ? '変える' : '付ける'}
          </button>
        </div>
      </div>
      <DiscountTotals list={order.list_total} total={total} />
      {error && <p className="error-text">{error}</p>}
      <button type="button" className="btn btn-secondary btn-block" disabled={!changed || sending} onClick={submit}>
        {sending ? '保存しています' : '値引きを保存'}
      </button>
    </div>
  )
}

/** 定価・値引き・お支払いを並べて出す。 */
export function DiscountTotals({ list, total }: { list: number; total: number }) {
  return (
    <div className="discount-totals">
      <span>定価</span>
      <span className="mono">{yen(list)}</span>
      <span>値引き</span>
      <span className="mono">{list - total > 0 ? `−${yen(list - total)}` : yen(0)}</span>
      <span className="discount-totals-pay">お支払い</span>
      <span className="mono discount-totals-pay">{yen(total)}</span>
    </div>
  )
}
