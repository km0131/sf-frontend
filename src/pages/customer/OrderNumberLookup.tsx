import { useCallback, useState, type FormEvent } from 'react'
import { Sheet } from '../../components/Sheet'
import { ApiError, apiFetch, errorMessage } from '../../lib/api'
import { storeStyle } from '../../lib/colors'
import type { NumberStatus } from '../../lib/types'
import { wording } from '../../lib/wording'

/** 状態ごとの案内（注文状況ページと同じ言い回し。店舗の種類で言葉を変える）。 */
function statusText(s: NumberStatus): string {
  const w = wording(s.shop.business_type)
  switch (s.status) {
    case 'waiting':
    case 'cooking':
      return s.waiting_ahead > 0
        ? `前に${s.waiting_ahead}組お待ちです${s.estimated_wait_minutes != null ? `（あと約${s.estimated_wait_minutes}分）` : ''}`
        : w.soon
    case 'ready':
      return `${w.headingReady}。${w.readyMessage}`
    case 'done':
      return w.doneLookup
    case 'cancelled':
      return w.cancelledLookup
  }
}

function lookupError(e: unknown): string {
  // 店舗一覧（飲食・飲食以外が混ざる）から使うので、どちらにも合う言葉にする
  if (e instanceof ApiError && e.status === 404) return 'その番号の今日の受付は見つかりませんでした。番号をお確かめください。'
  if (e instanceof ApiError && e.status === 400) return '番号は「A-12」のように入力してください。'
  return errorMessage(e)
}

/** お客様: 控えをなくしたときに、整理番号から状態だけを確かめる。ふだんはボタンだけを出し、押すと入力欄を開く。 */
export function OrderNumberLookup() {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end', paddingTop: 12 }}>
        <button type="button" className="btn btn-text" onClick={() => setOpen(true)}>
          番号で受付状況を確かめる
        </button>
      </div>
      {open && (
        <Sheet title="番号で確認" onClose={close}>
          <LookupForm />
        </Sheet>
      )}
    </>
  )
}

function LookupForm() {
  const [no, setNo] = useState('')
  const [result, setResult] = useState<NumberStatus | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!no.trim() || sending) return
    setSending(true)
    setError('')
    try {
      const r = await apiFetch<{ order: NumberStatus }>(`/api/order-status?no=${encodeURIComponent(no.trim())}`)
      setResult(r.order)
    } catch (err) {
      setResult(null)
      setError(lookupError(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={submit}>
      <p className="sub" style={{ fontSize: 13 }}>画面を閉じてしまったときは、お呼び出し番号から今の状態を確かめられます。</p>
      <div className="row">
        <input
          className="input"
          style={{ flex: 1 }}
          value={no}
          maxLength={10}
          placeholder="例: A-12"
          aria-label="お呼び出し番号"
          autoCapitalize="characters"
          autoComplete="off"
          autoFocus
          onChange={(e) => setNo(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={!no.trim() || sending}>
          {sending ? '確認中' : '確認する'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {result && (
        <div className="shop-row" style={{ ...storeStyle(result.shop.color), gridTemplateColumns: 'auto 1fr' }} aria-live="polite">
          <span className="dot dot-lg" aria-hidden="true" />
          <span>
            <span className="shop-row-name">
              {result.shop.name} <span className="mono">{result.order_no}</span>
            </span>
            <span className="sub" style={{ display: 'block', fontSize: 13, lineHeight: 1.7 }}>
              {statusText(result)}
            </span>
          </span>
        </div>
      )}
    </form>
  )
}
