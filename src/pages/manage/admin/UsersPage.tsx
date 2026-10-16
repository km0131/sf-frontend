import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Sheet } from '../../../components/Sheet'
import { apiFetch, errorMessage } from '../../../lib/api'
import { mdhm } from '../../../lib/format'
import type { List, Role } from '../../../lib/types'
import { Notice, PageHead, Panel } from '../common'
import { useManage } from '../context'
import type { AdminShop } from './ShopsPage'

type User = {
  id: number
  email: string
  display_name: string
  role: Role
  shop_id: number | null
  is_active: boolean
  last_login_at: string | null
}

/** システム管理者: 店長・管理者アカウントの作成・停止・パスワード再設定。 */
export function UsersPage() {
  const { token, session } = useManage()
  const queryClient = useQueryClient()
  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiFetch<List<User>>('/api/admin/users', { token }).then((r) => r.items),
  })
  const shops = useQuery({
    queryKey: ['admin', 'shops'],
    queryFn: () => apiFetch<List<AdminShop>>('/api/admin/shops', { token }).then((r) => r.items),
  })
  const shopName = (id: number | null) => shops.data?.find((s) => s.id === id)?.name ?? '—'

  const [form, setForm] = useState({ email: '', password: '', display_name: '', role: 'shop_manager' as Role, shop_id: '' })
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<User | null>(null)

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        token,
        body: { ...form, shop_id: form.role === 'shop_manager' ? Number(form.shop_id) : undefined },
      })
      setForm({ email: '', password: '', display_name: '', role: 'shop_manager', shop_id: '' })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="mpage">
      <PageHead title="店長・管理者" />
      <Panel title="アカウントの一覧">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>名前</th>
                <th>メールアドレス</th>
                <th>権限</th>
                <th>店舗</th>
                <th>状態</th>
                <th>最終ログイン</th>
              </tr>
            </thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.id} className="clickable" onClick={() => setEditing(u)}>
                  <td>{u.display_name || '—'}</td>
                  <td className="mono" style={{ fontSize: 13 }}>
                    {u.email}
                  </td>
                  <td>{u.role === 'system_admin' ? 'システム管理者' : '店長'}</td>
                  <td>{shopName(u.shop_id)}</td>
                  <td>{u.is_active ? '有効' : <span className="tag tag-strong">停止中</span>}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {mdhm(u.last_login_at) || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="アカウントを追加">
        <form className="stack" onSubmit={create}>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">権限</span>
              <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="shop_manager">店長</option>
                <option value="system_admin">システム管理者</option>
              </select>
            </label>
            {form.role === 'shop_manager' && (
              <label className="field">
                <span className="field-label">店舗</span>
                <select className="select" value={form.shop_id} onChange={(e) => setForm({ ...form, shop_id: e.target.value })}>
                  <option value="">選んでください</option>
                  {shops.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span className="field-label">名前</span>
              <input className="input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">メールアドレス</span>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">初期パスワード（10文字以上）</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
          </div>
          <Notice error={error} />
          <div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!form.email || form.password.length < 10 || (form.role === 'shop_manager' && !form.shop_id)}
            >
              追加する
            </button>
          </div>
        </form>
      </Panel>

      {editing && (
        <UserEditor user={editing} shops={shops.data ?? []} self={editing.id === session.user?.id} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

function UserEditor({ user, shops, self, onClose }: { user: User; shops: AdminShop[]; self: boolean; onClose: () => void }) {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const [name, setName] = useState(user.display_name)
  const [active, setActive] = useState(user.is_active)
  const [shopId, setShopId] = useState(String(user.shop_id ?? ''))
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        token,
        body: {
          display_name: name,
          is_active: active,
          ...(user.role === 'shop_manager' && shopId ? { shop_id: Number(shopId) } : {}),
          ...(password ? { password } : {}),
        },
      })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Sheet title={user.email} onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span className="field-label">名前</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {user.role === 'shop_manager' && (
          <label className="field">
            <span className="field-label">店舗</span>
            <select className="select" value={shopId} onChange={(e) => setShopId(e.target.value)}>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={active} disabled={self} onChange={(e) => setActive(e.target.checked)} />
          有効（外すとすぐにログインできなくなります）
        </label>
        <label className="field">
          <span className="field-label">パスワードの再設定（空なら変えない）</span>
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <Notice error={error} />
        <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={password !== '' && password.length < 10}>
          保存する
        </button>
      </div>
    </Sheet>
  )
}
