import { useState } from 'react'
import { choiceName, kindLabel, type DiscountChoice } from '../lib/discount'
import { yen } from '../lib/format'
import type { DiscountPreset, DiscountScope } from '../lib/types'

type Props = {
  scope: DiscountScope
  presets: DiscountPreset[]
  /** 自由入力の上限額（0 なら自由入力は出さない、null なら上限なし＝店長） */
  freeLimit: number | null
  value: DiscountChoice | undefined
  /** 店長が自動で適用している値引き（選ばなければこれが付く。外すことはできない） */
  auto?: DiscountPreset | null
  /** 値引き前の金額（自由入力の目安に出す） */
  base: number
  onChoose: (choice: DiscountChoice | undefined) => void
}

/** 値引きを選ぶ：店長が登録したプリセットから選ぶ。自由入力は上限額が設定されているときだけ。 */
export function DiscountPicker({ scope, presets, freeLimit, value, auto, base, onChoose }: Props) {
  const usable = presets.filter((p) => p.scope === scope && p.active && p.id !== auto?.id)
  const current = value && 'presetId' in value ? value.presetId : null
  const [amount, setAmount] = useState(value && !('presetId' in value) ? String(value.amount) : '')
  const [reason, setReason] = useState(value && !('presetId' in value) ? value.reason : '')
  const amountNum = Number(amount)
  const overLimit = freeLimit != null && amountNum > freeLimit
  const canFree = amount !== '' && amountNum >= 1 && !overLimit && reason.trim() !== ''

  return (
    <div className="stack">
      <p className="field-hint">
        {scope === 'item' ? 'この商品（数量分）に付ける値引きを選んでください。' : '注文全体（商品の値引きのあとの合計）に付ける値引きを選んでください。'}
        値引きは1つまでです。
        {auto && ' 店長が自動で付けている値引きがあります。別の値引きを選ぶと、そちらに置き換わります。'}
      </p>
      <fieldset className="opt-group">
        <legend className="field-label">値引き</legend>
        <button type="button" className={`opt ${value == null ? 'is-on' : ''}`} aria-pressed={value == null} onClick={() => onChoose(undefined)}>
          <span className="opt-mark" aria-hidden="true" />
          <span className="opt-name">{auto ? `自動の値引き（${auto.name}）` : '値引きなし'}</span>
          {auto && (
            <span className="mono sub" style={{ fontSize: 12 }}>
              {kindLabel(auto.kind, auto.value, auto.scope)}
            </span>
          )}
        </button>
        {usable.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`opt ${current === p.id ? 'is-on' : ''}`}
            aria-pressed={current === p.id}
            onClick={() => onChoose({ presetId: p.id })}
          >
            <span className="opt-mark" aria-hidden="true" />
            <span className="opt-name">{p.name}</span>
            <span className="mono sub" style={{ fontSize: 12 }}>
              {kindLabel(p.kind, p.value, p.scope)}
            </span>
          </button>
        ))}
        {usable.length === 0 && <p className="empty">使える値引きがありません（店長の画面で登録します）</p>}
      </fieldset>

      {freeLimit !== 0 && (
        <fieldset className="opt-group stack" style={{ gap: 10 }}>
          <legend className="field-label">
            自由入力
            <span className="sub" style={{ marginLeft: 10, fontSize: 11 }}>
              {freeLimit == null ? '上限なし（店長）' : `${yen(freeLimit)}まで`}
            </span>
          </legend>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="price-input" style={{ width: 140 }}>
              <input
                className="input mono"
                inputMode="numeric"
                placeholder="値引き額"
                aria-label="値引き額（円）"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
              />
              <span aria-hidden="true">円</span>
            </span>
            <input
              className="input"
              style={{ flex: 1, minWidth: 160 }}
              placeholder="理由（必須。例: 焼きすぎ）"
              maxLength={100}
              aria-label="値引きの理由"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {overLimit && <p className="error-text">自由入力は {yen(freeLimit ?? 0)} までです。</p>}
          {amountNum > base && !overLimit && <p className="field-hint">金額（{yen(base)}）より多い分は値引きされません。</p>}
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!canFree}
              onClick={() => onChoose({ amount: amountNum, reason: reason.trim() })}
            >
              この金額で値引き
            </button>
          </div>
        </fieldset>
      )}
      {value && (
        <p className="sub" style={{ fontSize: 13 }}>
          選択中: {choiceName(value, presets)}
        </p>
      )}
    </div>
  )
}
