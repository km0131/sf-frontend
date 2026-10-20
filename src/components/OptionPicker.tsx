import { useState } from 'react'
import { unitPrice } from '../lib/cart'
import { yen } from '../lib/format'
import type { MenuItem } from '../lib/types'

type Props = {
  item: MenuItem
  onAdd: (optionIds: number[], quantity: number) => void
  submitLabel?: string
  /** 選べる数量の上限（Web 注文ではカートの残り） */
  maxQuantity?: number
}

/** オプション（サイズ・トッピングなど）を選んで数量を決める。必須の組が未選択なら追加できない。 */
export function OptionPicker({ item, onAdd, submitLabel = '加える', maxQuantity = 20 }: Props) {
  const [chosen, setChosen] = useState<Record<number, number[]>>(() => {
    // 必須で1つだけ選ぶ組は、選べる最初の選択肢を選んでおく
    const init: Record<number, number[]> = {}
    for (const g of item.option_groups) {
      const first = g.options.find((o) => o.is_available)
      init[g.id] = g.required && g.max_select === 1 && first ? [first.id] : []
    }
    return init
  })
  const [qty, setQty] = useState(1)

  const toggle = (groupId: number, optionId: number, max: number) => {
    setChosen((prev) => {
      const cur = prev[groupId] ?? []
      if (cur.includes(optionId)) return { ...prev, [groupId]: cur.filter((id) => id !== optionId) }
      if (max === 1) return { ...prev, [groupId]: [optionId] }
      if (cur.length >= max) return prev
      return { ...prev, [groupId]: [...cur, optionId] }
    })
  }

  const ids = Object.values(chosen).flat()
  const missing = item.option_groups.filter((g) => g.required && (chosen[g.id] ?? []).length === 0)
  const unit = unitPrice(item, ids)

  return (
    <div className="stack">
      {item.description && <p className="sub" style={{ fontSize: 13 }}>{item.description}</p>}
      {item.option_groups.map((g) => (
        <fieldset key={g.id} className="opt-group">
          <legend className="field-label">
            {g.name}
            <span className="sub" style={{ marginLeft: 10, fontSize: 11, letterSpacing: '.05em' }}>
              {g.required ? '必須' : '任意'}
              {g.max_select > 1 ? `・${g.max_select}つまで` : ''}
              {g.bundle_count != null && g.bundle_price != null ? `・${g.bundle_count}つで${yen(g.bundle_price)}` : ''}
            </span>
          </legend>
          {g.options.map((o) => {
            const on = (chosen[g.id] ?? []).includes(o.id)
            return (
              <button
                key={o.id}
                type="button"
                className={`opt ${on ? 'is-on' : ''}`}
                disabled={!o.is_available}
                aria-pressed={on}
                onClick={() => toggle(g.id, o.id, g.max_select)}
              >
                <span className="opt-mark" aria-hidden="true" />
                <span className="opt-name">{o.name}</span>
                <span className="mono sub">
                  {!o.is_available ? '売り切れ' : o.price_delta ? `${o.price_delta > 0 ? '+' : ''}${yen(o.price_delta)}` : ''}
                </span>
              </button>
            )
          })}
        </fieldset>
      ))}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="field-label">数量</span>
        <div className="row">
          <button type="button" className="qty" aria-label="減らす" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>
            −
          </button>
          <span className="mono" style={{ minWidth: 28, textAlign: 'center', fontSize: 17 }}>
            {qty}
          </span>
          <button type="button" className="qty" aria-label="増やす" disabled={qty >= maxQuantity} onClick={() => setQty(qty + 1)}>
            +
          </button>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={missing.length > 0}
        onClick={() => onAdd(ids, qty)}
      >
        {missing.length > 0 ? `${missing[0].name}を選んでください` : `${submitLabel}　${yen(unit * qty)}`}
      </button>
    </div>
  )
}
