import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Sheet } from '../../../components/Sheet'
import { ApiError, apiFetch, errorMessage } from '../../../lib/api'
import { shopColors } from '../../../lib/colors'
import type { BusinessType, List, ShopColor } from '../../../lib/types'
import { businessTypeLabels } from '../../../lib/wording'
import { BusinessTypePicker, ColorPicker, Notice, PageHead, Panel } from '../common'
import { useManage } from '../context'

export type AdminShop = {
  id: number
  slug: string
  name: string
  description: string
  email_enabled: boolean
  color: ShopColor
  business_type: BusinessType
  is_active: boolean
}

/** 店舗の種類の変更が、進行中の注文のために断られたときの説明（どの注文かを添える）。 */
function shopSaveError(e: unknown): string {
  if (e instanceof ApiError && e.code === 'active_orders_exist') {
    const orders = (e.details?.orders as { business_date: string; order_no: string }[] | undefined) ?? []
    const count = Number(e.details?.count ?? orders.length)
    const list = orders.map((o) => `${o.business_date} ${o.order_no}`).join('、')
    return `${errorMessage(e)}（${list}${count > orders.length ? ` ほか、全${count}件` : ''}）`
  }
  return errorMessage(e)
}

/** システム管理者: 店舗の一覧・追加・編集。 */
export function ShopsPage() {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const { data, error } = useQuery({
    queryKey: ['admin', 'shops'],
    queryFn: () => apiFetch<List<AdminShop>>('/api/admin/shops', { token }).then((r) => r.items),
  })
  const [form, setForm] = useState({ slug: '', name: '', color: 'yamabuki' as ShopColor, business_type: 'food' as BusinessType })
  const [createError, setCreateError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminShop | null>(null)

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setCreateError(null)
    try {
      await apiFetch('/api/admin/shops', { method: 'POST', token, body: form })
      setForm({ slug: '', name: '', color: 'yamabuki', business_type: 'food' })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'shops'] })
    } catch (err) {
      setCreateError(errorMessage(err))
    }
  }

  return (
    <div className="mpage">
      <PageHead title="店舗" />
      <Panel title="店舗の一覧">
        {error && <p className="error-text">{errorMessage(error)}</p>}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>色</th>
                <th>店名</th>
                <th>URL 名</th>
                <th>種類</th>
                <th>メール</th>
                <th>状態</th>
                <th>画面</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => setEditing(s)}>
                  <td>
                    <span className="dot dot-lg" style={{ background: shopColors[s.color].hex }} title={shopColors[s.color].label} />
                  </td>
                  <td className="mincho">{s.name}</td>
                  <td className="mono">{s.slug}</td>
                  <td>{businessTypeLabels[s.business_type] ?? s.business_type}</td>
                  <td>{s.email_enabled ? '送る' : '送らない'}</td>
                  <td>{s.is_active ? '有効' : <span className="tag tag-strong">停止中</span>}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row" style={{ gap: 12 }}>
                      <a href={`/s/${s.slug}/pos`} target="_blank" rel="noopener">
                        レジ ↗
                      </a>
                      <a href={`/s/${s.slug}/display`} target="_blank" rel="noopener">
                        大画面 ↗
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.length === 0 && <p className="empty">まだ店舗がありません</p>}
        </div>
      </Panel>

      <Panel title="店舗を追加">
        <form className="stack" onSubmit={create}>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">店名</span>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">URL 名（英小文字・数字・-）</span>
              <input
                className="input mono"
                value={form.slug}
                placeholder="class-2a"
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
              />
            </label>
          </div>
          <div className="field">
            <span className="field-label">店舗の種類</span>
            <BusinessTypePicker value={form.business_type} onChange={(t) => setForm({ ...form, business_type: t })} />
            <span className="field-hint">飲食以外（アトラクション・物販・展示など）は「調理中」がなく、待ち → 呼び出し → 完了で進めます。</span>
          </div>
          <div className="field">
            <span className="field-label">店舗色</span>
            <ColorPicker value={form.color} onChange={(c) => setForm({ ...form, color: c })} />
          </div>
          <Notice error={createError} />
          <div>
            <button type="submit" className="btn btn-primary" disabled={!form.name.trim() || form.slug.length < 2}>
              追加する
            </button>
          </div>
        </form>
      </Panel>

      {editing && <ShopEditor shop={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ShopEditor({ shop, onClose }: { shop: AdminShop; onClose: () => void }) {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(shop)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)
    try {
      await apiFetch(`/api/admin/shops/${shop.id}`, {
        method: 'PATCH',
        token,
        body: {
          slug: form.slug,
          name: form.name,
          description: form.description,
          email_enabled: form.email_enabled,
          color: form.color,
          // 種類は変えたときだけ送る（変えないなら、進行中の注文があっても他の項目は保存できる）
          business_type: form.business_type !== shop.business_type ? form.business_type : undefined,
          is_active: form.is_active,
        },
      })
      void queryClient.invalidateQueries({ queryKey: ['admin'] })
      onClose()
    } catch (e) {
      setError(shopSaveError(e))
    }
  }

  return (
    <Sheet title={`${shop.name} の編集`} onClose={onClose} wide>
      <div className="stack">
        <div className="form-grid">
          <label className="field">
            <span className="field-label">店名</span>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">URL 名</span>
            <input className="input mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} />
          </label>
        </div>
        <label className="field">
          <span className="field-label">添え書き</span>
          <textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <div className="field">
          <span className="field-label">店舗の種類</span>
          <BusinessTypePicker value={form.business_type} onChange={(t) => setForm({ ...form, business_type: t })} />
          <span className="field-hint">進行中（受付・調理中）の注文があるあいだは変えられません。</span>
        </div>
        <div className="field">
          <span className="field-label">店舗色</span>
          <ColorPicker value={form.color} onChange={(c) => setForm({ ...form, color: c })} />
        </div>
        <label className="check">
          <input type="checkbox" checked={form.email_enabled} onChange={(e) => setForm({ ...form, email_enabled: e.target.checked })} />
          お客様にメールを送る
        </label>
        <label className="check">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          有効（外すと、注文・ログインができなくなります）
        </label>
        <Notice error={error} />
        <div>
          <button type="button" className="btn btn-primary" onClick={save}>
            保存する
          </button>
        </div>
      </div>
    </Sheet>
  )
}
