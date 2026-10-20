import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { apiFetch, errorMessage } from '../../lib/api'
import { mdhm } from '../../lib/format'
import type { BusinessType, ShopColor } from '../../lib/types'
import { businessTypeLabels, wording } from '../../lib/wording'
import { ColorPicker, Notice, PageHead, Panel } from './common'
import { useManage } from './context'

type Settings = {
  id: number
  slug: string
  name: string
  description: string
  email_enabled: boolean
  color: ShopColor
  business_type: BusinessType
  /** 呼び出し後の取り置き時間（分、1〜120） */
  pickup_hold_minutes: number
  /** Web 注文1回あたりの合計数量の上限。null なら既定値を使う */
  web_order_max_quantity: number | null
  web_order_max_quantity_effective: number
  web_order_max_quantity_default: number
  web_order_max_quantity_limit: number
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
        <p className="field-hint" style={{ marginBottom: 16 }}>
          店舗の種類：<strong>{businessTypeLabels[data.business_type] ?? data.business_type}</strong>
          （変更はシステム管理者に依頼してください）
        </p>
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
    pickup_hold_minutes: String(initial.pickup_hold_minutes ?? 15),
    // 空欄なら店舗では設定しない（既定値を使う）
    web_order_max_quantity: initial.web_order_max_quantity == null ? '' : String(initial.web_order_max_quantity),
  })
  const [maxQtySaved, setMaxQtySaved] = useState(initial.web_order_max_quantity)
  const limit = initial.web_order_max_quantity_limit
  const defaultQty = initial.web_order_max_quantity_default

  const applySaved = (s: Settings) => {
    queryClient.setQueryData(['manage', 'shop'], s)
    setMaxQtySaved(s.web_order_max_quantity)
    setForm((f) => ({ ...f, web_order_max_quantity: s.web_order_max_quantity == null ? '' : String(s.web_order_max_quantity) }))
  }

  const resetMaxQty = async () => {
    setSaved(null)
    setSaveError(null)
    try {
      const s = await apiFetch<Settings>('/api/manage/shop', { method: 'PATCH', token, body: { web_order_max_quantity: null } })
      applySaved(s)
      setSaved(`数量の上限をデフォルト（${s.web_order_max_quantity_effective}個）に戻しました。`)
    } catch (err) {
      setSaveError(errorMessage(err))
    }
  }
  const [saved, setSaved] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaved(null)
    setSaveError(null)
    const hold = Number(form.pickup_hold_minutes)
    if (!Number.isInteger(hold) || hold < 1 || hold > 120) {
      setSaveError('取り置き時間は 1〜120 分の整数で入力してください。')
      return
    }
    const maxQtyText = form.web_order_max_quantity.trim()
    const maxQty = Number(maxQtyText)
    if (maxQtyText !== '' && (!Number.isInteger(maxQty) || maxQty < 1 || maxQty > limit)) {
      setSaveError(`数量の上限は 1〜${limit} の整数で入力してください。`)
      return
    }
    const { web_order_max_quantity: _, ...rest } = form
    // 空欄のときは送らない（今の設定のまま。既定値に戻すのは「デフォルトに戻す」で）
    const body = { ...rest, pickup_hold_minutes: hold, ...(maxQtyText !== '' ? { web_order_max_quantity: maxQty } : {}) }
    try {
      const s = await apiFetch<Settings>('/api/manage/shop', { method: 'PATCH', token, body })
      applySaved(s)
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
        <span className="field-hint">{wording(initial.business_type).descriptionHint}</span>
      </label>
      <div className="field">
        <span className="field-label">店舗色</span>
        <ColorPicker value={form.color} onChange={(c) => setForm({ ...form, color: c })} />
        <span className="field-hint">選んでいる品の印や、呼び出し番号の下の線などに使います。</span>
      </div>
      <label className="field">
        <span className="field-label">呼び出し後の取り置き時間（分）</span>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={1}
          max={120}
          step={1}
          style={{ maxWidth: 140 }}
          value={form.pickup_hold_minutes}
          onChange={(e) => setForm({ ...form, pickup_hold_minutes: e.target.value })}
        />
        <span className="field-hint">
          呼び出してからこの時間を過ぎた注文は、注文帳で「期限切れ」と表示されます。スタッフの判断で「未受取」にでき、自動では変わりません（1〜120分）。
        </span>
      </label>
      <div className="field">
        <label className="field-label" htmlFor="web-order-max-quantity">
          1回の注文で頼める合計数量の上限
        </label>
        <div className="row" style={{ gap: 12 }}>
          <input
            id="web-order-max-quantity"
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={limit}
            step={1}
            style={{ maxWidth: 140 }}
            placeholder={String(defaultQty)}
            value={form.web_order_max_quantity}
            onChange={(e) => setForm({ ...form, web_order_max_quantity: e.target.value })}
          />
          {maxQtySaved != null && (
            <button type="button" className="btn btn-text" onClick={resetMaxQty}>
              デフォルトに戻す
            </button>
          )}
        </div>
        <span className="field-hint">
          {maxQtySaved == null ? `デフォルト（${defaultQty}個）を使用中。` : `この店舗では ${maxQtySaved}個（デフォルトは ${defaultQty}個）。`}
          Web 注文だけに効きます（レジの注文には関係しません）。1〜{limit}個。
        </span>
      </div>
      <label className="check">
        <input type="checkbox" checked={form.email_enabled} onChange={(e) => setForm({ ...form, email_enabled: e.target.checked })} />
        {wording(initial.business_type).emailOption}
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
