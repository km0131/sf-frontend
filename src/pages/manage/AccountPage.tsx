import { useState, type FormEvent } from 'react'
import { apiFetch, errorMessage } from '../../lib/api'
import { Notice, PageHead, Panel } from './common'
import { useManage } from './context'

/** 自分のパスワードの変更。 */
export function AccountPage() {
  const { token, session } = useManage()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [ok, setOk] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setOk(null)
    setError(null)
    if (next !== confirm) {
      setError('新しいパスワードが一致しません。')
      return
    }
    try {
      await apiFetch('/api/account/password', { method: 'PUT', token, body: { current_password: current, new_password: next } })
      setCurrent('')
      setNext('')
      setConfirm('')
      setOk('パスワードを変更しました。')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="mpage">
      <PageHead title="アカウント" />
      <Panel title="ログイン中のアカウント">
        <p>
          {session.user?.display_name && <>{session.user.display_name}　</>}
          <span className="mono">{session.user?.email}</span>
          <br />
          <span className="sub">{session.role === 'system_admin' ? 'システム管理者' : `店長（${session.shop?.name}）`}</span>
        </p>
      </Panel>
      <Panel title="パスワードの変更">
        <form className="stack" style={{ maxWidth: 420 }} onSubmit={submit}>
          <label className="field">
            <span className="field-label">今のパスワード</span>
            <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">新しいパスワード（10文字以上）</span>
            <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">新しいパスワード（確認）</span>
            <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <Notice error={error} ok={ok} />
          <div>
            <button type="submit" className="btn btn-primary" disabled={!current || next.length < 10}>
              変更する
            </button>
          </div>
        </form>
      </Panel>
    </div>
  )
}
