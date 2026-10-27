import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { ApiError, apiFetch, errorMessage } from '../../lib/api'
import type { CustomerOrder } from '../../lib/types'
import { wording } from '../../lib/wording'

function notifyError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return '短い時間に何度も変更されたため、しばらくしてからお試しください。'
    if (e.status === 400) return 'メールアドレスの形をお確かめください。'
    if (e.code === 'order_finished') return 'この注文は終わっているため、登録できません。'
  }
  return errorMessage(e)
}

/** お客様: できあがり（順番）のお知らせを受け取るメールアドレスを、注文のあとで登録・変更・削除する。
 *  Web 注文・レジの注文のどちらでも使う。店舗がメールを使わない・終わった注文では出さない。
 *  登録したアドレスは伏せ字でだけ表示する（この画面は QR や確認コードで登録した人も見るため）。 */
export function NotifyEmail({ token, order }: { token: string; order: CustomerOrder }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const notify = order.email_notify
  if (!notify) return null

  const w = wording(order.shop.business_type)
  const what = w.usesCooking ? 'できあがり' : '順番'
  const registered = notify.email

  const send = async (method: 'PUT' | 'DELETE') => {
    setSending(true)
    setError('')
    setNotice('')
    try {
      const r = await apiFetch<{ order: CustomerOrder }>(`/api/orders/${encodeURIComponent(token)}/email`, {
        method,
        body: method === 'PUT' ? { email: email.trim() } : undefined,
      })
      queryClient.setQueryData(['order', token], r.order)
      setEditing(false)
      setEmail('')
      setNotice(
        method === 'DELETE'
          ? 'メールアドレスを削除しました'
          : r.order.status === 'ready'
            ? `登録しました。${what === 'できあがり' ? 'できあがっている' : '順番になっている'}ので、すぐにお送りします`
            : `登録しました。${what}のときにお送りします`,
      )
    } catch (e) {
      setError(notifyError(e))
    } finally {
      setSending(false)
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (email.trim() && !sending) void send('PUT')
  }

  return (
    <section className="notify-email" aria-labelledby="notify-email-title">
      <h3 id="notify-email-title" className="field-label">
        {what}をメールで受け取る
      </h3>
      {registered && !editing ? (
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span>
            <span className="mono">{registered}</span> に送ります
          </span>
          <span className="row" style={{ gap: 4 }}>
            <button type="button" className="btn btn-text" disabled={sending} onClick={() => setEditing(true)}>
              変更
            </button>
            <button type="button" className="btn btn-text" disabled={sending} onClick={() => void send('DELETE')}>
              削除
            </button>
          </span>
        </div>
      ) : (
        <form className="row notify-email-form" onSubmit={submit}>
          <input
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            maxLength={254}
            placeholder="例: name@example.com"
            aria-label="メールアドレス"
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary" disabled={!email.trim() || sending}>
            {sending ? '登録中' : registered ? '変更する' : '登録する'}
          </button>
        </form>
      )}
      <p className="field-hint">
        {what}のお知らせにだけ使い、学園祭の終了から{notify.retention_days}日後に削除します。
      </p>
      {notice && (
        <p className="notice-text" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
