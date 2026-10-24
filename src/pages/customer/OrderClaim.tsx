import { useCallback, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Sheet } from '../../components/Sheet'
import { Turnstile, TURNSTILE_ACTION_WEB_ORDER } from '../../components/Turnstile'
import { ApiError, apiFetch, errorMessage } from '../../lib/api'
import type { PublicShop } from '../../lib/types'

function claimError(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'claim_invalid':
        return '番号か確認コードが違います。レジで受け取った番号と、4桁の確認コードをお確かめください。'
      case 'claim_locked': {
        const minutes = Math.max(1, Math.ceil(Number(e.details?.retry_after ?? 900) / 60))
        return `確認コードを続けて間違えたため、${minutes}分ほど登録できません。お困りの場合はお店のスタッフにお声がけください。`
      }
      case 'order_finished':
        return 'この注文はお渡し済み、または取り消されているため、登録できません。'
      case 'turnstile_failed':
        return '確認が通りませんでした。ページを読み込み直して、もう一度お試しください。'
    }
    if (e.status === 400) return '番号は「12」や「A-12」のように、確認コードは4桁の数字で入力してください。'
  }
  return errorMessage(e)
}

/** お客様: レジで注文した人が、店舗・番号・確認コードで注文を自分のスマホに登録する（QR を読めないとき）。
 *  登録できたら注文状況ページへ移る（そこで控えに入り、Web 注文と同じように呼び出しを受け取れる）。 */
export function OrderClaim({ shops }: { shops: PublicShop[] }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  if (shops.length === 0) return null
  return (
    <>
      <button type="button" className="btn btn-text" onClick={() => setOpen(true)}>
        レジの注文を登録
      </button>
      {open && (
        <Sheet title="レジの注文をスマホに登録" onClose={close}>
          <ClaimForm shops={shops} />
        </Sheet>
      )}
    </>
  )
}

function ClaimForm({ shops }: { shops: PublicShop[] }) {
  const navigate = useNavigate()
  const [shop, setShop] = useState(shops.length === 1 ? shops[0].slug : '')
  const [no, setNo] = useState('')
  const [code, setCode] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const onToken = useCallback((t: string | null) => setToken(t), [])
  const prefix = shops.find((s) => s.slug === shop)?.order_prefix

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!shop || !no.trim() || !code.trim() || !token || sending) return
    setSending(true)
    setError('')
    try {
      const r = await apiFetch<{ public_token: string }>('/api/order-claim', {
        method: 'POST',
        body: { shop, order_no: no.trim(), code: code.trim(), turnstile_token: token },
      })
      navigate(`/o/${r.public_token}`)
    } catch (err) {
      setError(claimError(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
      <p className="sub" style={{ fontSize: 13 }}>
        レジで表示された QR をスマホのカメラで読むと、そのまま登録できます。QR を読めないときは、ここで番号と4桁の確認コードを入れてください。
        登録すると、できあがりをこのスマホの画面と音でお知らせします。
      </p>
      <label className="field">
        <span className="field-label">お店</span>
        <select className="select" value={shop} onChange={(e) => setShop(e.target.value)} required>
          <option value="">選んでください</option>
          {shops.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <label className="field" style={{ flex: 1 }}>
          <span className="field-label">お呼び出し番号</span>
          <input
            className="input"
            value={no}
            maxLength={10}
            placeholder={prefix ? `例: ${prefix}-12` : '例: 12'}
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(e) => setNo(e.target.value)}
          />
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span className="field-label">確認コード</span>
          <input
            className="input mono"
            value={code}
            inputMode="numeric"
            pattern="[0-9０-９]{4}"
            maxLength={4}
            placeholder="4桁"
            autoComplete="one-time-code"
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
      </div>
      <Turnstile action={TURNSTILE_ACTION_WEB_ORDER} onToken={onToken} />
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={!shop || !no.trim() || code.trim().length !== 4 || !token || sending}>
        {sending ? '登録しています' : '登録する'}
      </button>
    </form>
  )
}
