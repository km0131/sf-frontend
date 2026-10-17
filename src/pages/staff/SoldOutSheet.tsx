import { useState } from 'react'
import { apiFetch, errorMessage } from '../../lib/api'
import type { MenuItem } from '../../lib/types'

type Props = {
  item: MenuItem
  token: string
  /** 切り替えたあとの商品（サーバーが返したもの）を渡す */
  onChanged: (item: MenuItem) => void
}

/** レジの売り切れ設定：商品ごと、または選択肢ごとに売り切れ／販売中を切り替える。押すとすぐ反映する。 */
export function SoldOutSheet({ item, token, onChanged }: Props) {
  const [sending, setSending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggle = async (key: string, path: string, available: boolean) => {
    setSending(key)
    setError(null)
    try {
      onChanged(await apiFetch<MenuItem>(path, { method: 'PATCH', token, body: { is_available: !available } }))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSending(null)
    }
  }

  const row = (key: string, name: string, available: boolean, path: string) => (
    <button
      key={key}
      type="button"
      className="opt"
      aria-pressed={!available}
      disabled={sending !== null}
      onClick={() => void toggle(key, path, available)}
    >
      <span className="opt-name">{name}</span>
      {sending === key ? (
        <span className="sub" style={{ fontSize: 12 }}>
          切り替えています
        </span>
      ) : (
        <span className={`tag ${available ? '' : 'tag-strong'}`}>{available ? '販売中' : '売り切れ'}</span>
      )}
    </button>
  )

  return (
    <div className="stack">
      <p className="field-hint">押すと、売り切れ／販売中が切り替わります。お客様の画面にもすぐ反映されます。</p>
      <fieldset className="opt-group">
        <legend className="field-label">商品ごと</legend>
        {row('item', item.name, item.is_available, `/api/staff/menu-items/${item.id}/availability`)}
      </fieldset>
      {item.option_groups.map((g) => (
        <fieldset key={g.id} className="opt-group">
          <legend className="field-label">{g.name}</legend>
          {g.options.map((o) => row(`option-${o.id}`, o.name, o.is_available, `/api/staff/options/${o.id}/availability`))}
        </fieldset>
      ))}
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}
