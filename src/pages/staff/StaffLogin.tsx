import { useState, type FormEvent } from 'react'
import { Header } from '../../components/Header'
import { TerminalLine } from '../../components/Terminal'
import { apiFetch, errorMessage } from '../../lib/api'
import type { LoginResponse } from '../../lib/types'

/** スタッフのログイン（店舗の PIN）。 */
export function StaffLogin({ slug, onLogin }: { slug: string; onLogin: (s: LoginResponse) => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      onLogin(
        await apiFetch<LoginResponse>('/api/auth/staff/login', { method: 'POST', body: { shop_slug: slug, pin } }),
      )
    } catch (err) {
      setError(errorMessage(err))
      setPin('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page-sp">
      <Header name="スタッフ" seal="帳" aside={slug} />
      <TerminalLine command="PIN を入力してください" />
      <form className="section stack fade-in" onSubmit={submit}>
        <label className="field">
          <span className="field-label">スタッフ用 PIN</span>
          <input
            className="input mono"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            maxLength={12}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            autoFocus
            style={{ fontSize: 24, letterSpacing: '.3em' }}
          />
          <span className="field-hint">店長から伝えられた6〜12桁の数字です。ログインはその日の営業終了まで続きます。</span>
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={pin.length < 6 || sending}>
          ログイン
        </button>
      </form>
    </div>
  )
}
