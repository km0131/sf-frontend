import { useState } from 'react'
import { ApiError, errorMessage } from '../lib/api'
import { adjustReasons, type AdjustReason } from '../lib/stock'
import type { StockLevel } from '../lib/types'

type Props = {
  /** 画面に出している残り数と販売済み数 */
  remaining: number
  sold: number
  /** 1回に変えられる数（スタッフ）。null なら上限なし（店長） */
  maxChange: number | null
  /** 修正を送る（POST .../stock）。修正したあとの在庫を返す */
  submit: (body: unknown) => Promise<StockLevel>
  onDone: (level: StockLevel) => void
}

type Mode = 'delta' | 'set'

/** 限定数（残り数）の修正。増減か「実数に合わせる」を選び、理由を付けて、変更前 → 変更後を確かめてから直す。 */
export function StockAdjust({ remaining, sold, maxChange, submit, onDone }: Props) {
  const [mode, setMode] = useState<Mode>('delta')
  // 増減は入力のまま持つ（「-」だけを打った途中でも消えないように）
  const [deltaText, setDeltaText] = useState('')
  const [count, setCount] = useState('')
  const [reason, setReason] = useState<AdjustReason | null>(null)
  const [memo, setMemo] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const delta = Number.parseInt(deltaText.replace('+', ''), 10) || 0
  const step = (d: number) => {
    const n = delta + d
    setDeltaText(n > 0 ? `+${n}` : n === 0 ? '' : String(n))
    setConfirming(false)
  }
  const after = mode === 'delta' ? remaining + delta : count === '' ? null : Number(count)
  const change = after == null ? 0 : after - remaining
  const overLimit = maxChange != null && Math.abs(change) > maxChange
  const valid =
    after != null && after >= 0 && reason != null && (reason !== 'other' || memo.trim() !== '') && !overLimit && (mode === 'set' || delta !== 0)

  const send = async () => {
    if (after == null || reason == null) return
    setSending(true)
    setError(null)
    try {
      const body =
        mode === 'delta'
          ? { mode, delta, reason, memo: memo.trim() || undefined }
          : { mode, value: after, expected: remaining, reason, memo: memo.trim() || undefined }
      onDone(await submit(body))
    } catch (e) {
      if (e instanceof ApiError && e.code === 'stock_conflict') {
        setError(`その間に注文が入りました。現在の残りは${Number(e.details?.remaining)}個です。もう一度入力してください。`)
        setCount('')
      } else if (e instanceof ApiError && e.code === 'adjust_limit_exceeded') {
        setError(`一度に変えられるのは ${Number(e.details?.limit)}個までです。`)
      } else {
        setError(errorMessage(e))
      }
      setConfirming(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="stack">
      <p className="stock-now">
        販売済み <span className="mono">{sold}</span>個 ／ 残り <span className="mono">{remaining}</span>個
      </p>

      <div className="swatches" role="group" aria-label="直し方">
        {(['delta', 'set'] as const).map((m) => (
          <button key={m} type="button" className="swatch" aria-pressed={mode === m} onClick={() => { setMode(m); setConfirming(false) }}>
            {m === 'delta' ? '増やす・減らす' : '実数に合わせる'}
          </button>
        ))}
      </div>

      {mode === 'delta' ? (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="qty" aria-label="1つ減らす" onClick={() => step(-1)}>
            −
          </button>
          <input
            className="input mono"
            style={{ width: 96, textAlign: 'center' }}
            inputMode="text"
            placeholder="+5 / -3"
            aria-label="増減する数（例: +5、-3）"
            value={deltaText}
            onChange={(e) => {
              // 先頭の + / - と数字だけ
              const m = /^[+\-−]?\d{0,4}/.exec(e.target.value.replace('−', '-'))
              setDeltaText(m ? m[0] : '')
              setConfirming(false)
            }}
          />
          <button type="button" className="qty" aria-label="1つ増やす" onClick={() => step(1)}>
            +
          </button>
        </div>
      ) : (
        <label className="field">
          <span className="field-label">数え直した残りの個数</span>
          <input
            className="input mono"
            style={{ maxWidth: 140 }}
            inputMode="numeric"
            value={count}
            onChange={(e) => { setCount(e.target.value.replace(/\D/g, '')); setConfirming(false) }}
          />
        </label>
      )}

      <fieldset className="opt-group">
        <legend className="field-label">理由（必須）</legend>
        {adjustReasons.map((r) => (
          <button
            key={r.value}
            type="button"
            className={`opt ${reason === r.value ? 'is-on' : ''}`}
            aria-pressed={reason === r.value}
            onClick={() => { setReason(r.value); setConfirming(false) }}
          >
            <span className="opt-mark" aria-hidden="true" />
            <span className="opt-name">{r.label}</span>
          </button>
        ))}
      </fieldset>
      <label className="field">
        <span className="field-label">メモ{reason === 'other' ? '（必須）' : '（任意）'}</span>
        <input className="input" value={memo} maxLength={200} onChange={(e) => setMemo(e.target.value)} />
      </label>

      {after != null && after < 0 && <p className="error-text">残りが 0 より少なくなります。</p>}
      {overLimit && <p className="error-text">一度に変えられるのは {maxChange}個までです（店長は上限なし）。</p>}
      {error && <p className="error-text">{error}</p>}

      {confirming && after != null ? (
        <div className="stack" style={{ gap: 10 }}>
          <p className="stock-preview">
            残り <span className="mono">{remaining}</span>個 → <span className="mono">{after}</span>個
            <span className="sub">（{change > 0 ? `+${change}` : change}）</span>
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={sending} onClick={send}>
              {sending ? '直しています' : 'この内容で直す'}
            </button>
            <button type="button" className="btn btn-text" onClick={() => setConfirming(false)}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary btn-block" disabled={!valid} onClick={() => setConfirming(true)}>
          {after != null && valid ? `残り ${remaining}個 → ${after}個 を確かめる` : '確かめる'}
        </button>
      )}
    </div>
  )
}
