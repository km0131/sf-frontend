import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { apiFetch, errorMessage } from '../../lib/api'
import { mdhm } from '../../lib/format'
import type { ShopColor } from '../../lib/types'
import { ColorPicker, Notice, PageHead, Panel } from './common'
import { useManage } from './context'

type Settings = {
  id: number
  slug: string
  name: string
  description: string
  email_enabled: boolean
  color: ShopColor
  pin_set: boolean
  pin_updated_at: string | null
  current_event: { id: number; name: string; starts_on: string; ends_on: string; order_prefix: string | null } | null
}

/** 店長: 店舗の設定（店名・説明・店舗色・メール）とスタッフ用 PIN。 */
export function SettingsPage() {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const { data, error } = useQuery({
    queryKey: ['manage', 'shop'],
    queryFn: () => apiFetch<Settings>('/api/manage/shop', { token }),
  })

  const [pin, setPin] = useState('')
  const [pinMsg, setPinMsg] = useState<string | null>(null)
  const [pinError, setPinError] = useState<string | null>(null)
  const savePin = async (e: FormEvent) => {
    e.preventDefault()
    setPinMsg(null)
    setPinError(null)
    try {
      await apiFetch('/api/manage/shop/pin', { method: 'PUT', token, body: { pin } })
      setPin('')
      setPinMsg('PIN を変更しました。ログイン中のスタッフは、新しい PIN でログインし直しになります。')
      void queryClient.invalidateQueries({ queryKey: ['manage', 'shop'] })
    } catch (err) {
      setPinError(errorMessage(err))
    }
  }

  if (error) return <p className="error-text">{errorMessage(error)}</p>
  if (!data) return <p className="empty">読み込んでいます…</p>

  const ev = data.current_event
  return (
    <div className="mpage">
      <PageHead title="店舗設定" />

      <Panel title="今の開催回">
        {ev ? (
          <p>
            {ev.name}（{ev.starts_on} 〜 {ev.ends_on}）
            <br />
            {ev.order_prefix ? (
              <>
                整理番号の頭文字は <span className="mono">{ev.order_prefix}</span> です。
              </>
            ) : (
              <span className="sub">この店舗は今の開催回に出店していません。システム管理者に依頼してください。</span>
            )}
          </p>
        ) : (
          <p className="sub">今の開催回が設定されていません。</p>
        )}
        <p className="field-hint" style={{ marginTop: 8 }}>
          お客様の注文画面: <span className="mono">/s/{data.slug}</span>　レジ: <span className="mono">/s/{data.slug}/pos</span>　大画面:{' '}
          <span className="mono">/s/{data.slug}/display</span>
        </p>
      </Panel>

      <Panel title="店舗の情報">
        <ShopInfoForm initial={data} />
      </Panel>

      <Panel title="スタッフ用 PIN">
        <form className="stack" onSubmit={savePin}>
          <p className="sub" style={{ fontSize: 13 }}>
            {data.pin_set ? `設定済み（最終変更 ${mdhm(data.pin_updated_at)}）` : 'まだ設定されていません。スタッフがレジにログインするには PIN が必要です。'}
          </p>
          <label className="field" style={{ maxWidth: 320 }}>
            <span className="field-label">新しい PIN（6〜12桁の数字）</span>
            <input
              className="input mono"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              maxLength={12}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <Notice error={pinError} ok={pinMsg} />
          <div>
            <button type="submit" className="btn btn-secondary" disabled={pin.length < 6}>
              PIN を変更する
            </button>
          </div>
        </form>
      </Panel>
    </div>
  )
}

/** 店舗の情報の入力欄。読み込んだ値を初期値にする。 */
function ShopInfoForm({ initial }: { initial: Settings }) {
  const { token, updateShop } = useManage()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: initial.name,
    description: initial.description,
    email_enabled: initial.email_enabled,
    color: initial.color as ShopColor,
  })
  const [saved, setSaved] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaved(null)
    setSaveError(null)
    try {
      const s = await apiFetch<Settings>('/api/manage/shop', { method: 'PATCH', token, body: form })
      queryClient.setQueryData(['manage', 'shop'], s)
      updateShop({ name: s.name, color: s.color })
      setSaved('保存しました。')
    } catch (err) {
      setSaveError(errorMessage(err))
    }
  }

  return (
    <form className="stack" onSubmit={save}>
      <label className="field">
        <span className="field-label">店名</span>
        <input className="input" value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label className="field">
        <span className="field-label">添え書き</span>
        <textarea
          className="textarea"
          value={form.description}
          maxLength={500}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <span className="field-hint">お品書きの横に縦書きで出ます。短めに（例: ひとつずつ、心をこめてお作りします）。</span>
      </label>
      <div className="field">
        <span className="field-label">店舗色</span>
        <ColorPicker value={form.color} onChange={(c) => setForm({ ...form, color: c })} />
        <span className="field-hint">選んでいる品の印や、呼び出し番号の下の線などに使います。</span>
      </div>
      <label className="check">
        <input type="checkbox" checked={form.email_enabled} onChange={(e) => setForm({ ...form, email_enabled: e.target.checked })} />
        お客様にメール（注文の控え・できあがりのお知らせ）を送る
      </label>
      <Notice error={saveError} ok={saved} />
      <div>
        <button type="submit" className="btn btn-primary" style={{ minWidth: 200 }}>
          保存する
        </button>
      </div>
    </form>
  )
}
