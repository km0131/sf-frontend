import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Sheet } from '../../components/Sheet'
import { apiFetch, errorMessage, mediaUrl } from '../../lib/api'
import { yen } from '../../lib/format'
import type { Category, List, MenuItem } from '../../lib/types'
import { Notice, PageHead, Panel } from './common'
import { useManage } from './context'

const keys = {
  categories: ['manage', 'categories'] as const,
  items: (archived: boolean) => ['manage', 'items', archived] as const,
}

/** 店長: 商品（カテゴリ・商品・オプション・写真）の管理。 */
export function ProductsPage() {
  const { token } = useManage()
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null)

  const categories = useQuery({
    queryKey: keys.categories,
    queryFn: () => apiFetch<List<Category>>('/api/manage/categories', { token }).then((r) => r.items),
  })
  const items = useQuery({
    queryKey: keys.items(showArchived),
    queryFn: () =>
      apiFetch<List<MenuItem>>(`/api/manage/menu-items${showArchived ? '?include_archived=true' : ''}`, { token }).then((r) => r.items),
  })
  const catName = (id: number | null) => categories.data?.find((c) => c.id === id)?.name ?? '—'

  return (
    <div className="mpage">
      <PageHead title="商品">
        <label className="check" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          削除した商品も表示
        </label>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          商品を追加
        </button>
      </PageHead>

      <Panel title="お品書き">
        {items.error && <p className="error-text">{errorMessage(items.error)}</p>}
        <div className="table-wrap">
          <table className="table table-cards table-cards-products">
            <thead>
              <tr>
                <th>写真</th>
                <th>品名</th>
                <th>カテゴリ</th>
                <th className="num">価格</th>
                <th>選択肢</th>
                <th>状態</th>
                <th className="num">並び</th>
              </tr>
            </thead>
            <tbody>
              {items.data?.map((it) => (
                <tr key={it.id} className="clickable" onClick={() => setEditing(it)}>
                  <td className="cell-thumb">
                    {it.image_url ? <img className="thumb" src={mediaUrl(it.image_url)} alt="" /> : <span className="thumb" style={{ display: 'block' }} />}
                  </td>
                  <td className="mincho cell-title" style={{ fontSize: 15 }}>
                    {it.name}
                  </td>
                  <td data-label="カテゴリ">{catName(it.category_id)}</td>
                  <td className="num" data-label="価格">{yen(it.price)}</td>
                  <td className="sub" style={{ fontSize: 12 }} data-label="選択肢">
                    {it.option_groups.map((g) => g.name).join('・') || '—'}
                  </td>
                  <td data-label="状態">
                    {it.is_archived ? (
                      <span className="tag">削除済み</span>
                    ) : it.is_available ? (
                      <>
                        <span className="tag">販売中</span>
                        {it.option_groups.some((g) => g.options.some((o) => !o.is_available)) && (
                          <span className="sub" style={{ display: 'block', fontSize: 11 }}>
                            一部の選択肢が売り切れ
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="tag tag-strong">売り切れ</span>
                    )}
                  </td>
                  <td className="num" data-label="並び">{it.sort_order}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.data?.length === 0 && <p className="empty">まだ商品がありません。「商品を追加」から登録してください。</p>}
        </div>
      </Panel>

      <CategoriesPanel categories={categories.data ?? []} />

      {editing && (
        <ItemEditor
          item={editing === 'new' ? null : editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function CategoriesPanel({ categories }: { categories: Category[] }) {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['manage'] })
  }
  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      refresh()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Panel title="カテゴリ">
      <div className="stack">
        <p className="field-hint">お品書きはカテゴリごとに、並び順の小さい順に表示されます。カテゴリを消すと、その商品は「そのほか」になります。</p>
        {categories.map((c) => (
          <CategoryRow
            key={`${c.id}-${c.name}-${c.sort_order}`}
            category={c}
            onSave={(n, s) => act(() => apiFetch(`/api/manage/categories/${c.id}`, { method: 'PATCH', token, body: { name: n, sort_order: s } }))}
            onDelete={() => act(() => apiFetch(`/api/manage/categories/${c.id}`, { method: 'DELETE', token }))}
          />
        ))}
        <form
          className="row cat-row"
          onSubmit={(e) => {
            e.preventDefault()
            void act(() =>
              apiFetch('/api/manage/categories', {
                method: 'POST',
                token,
                body: { name, sort_order: (categories.at(-1)?.sort_order ?? 0) + 10 },
              }),
            ).then(() => setName(''))
          }}
        >
          <input className="input" placeholder="新しいカテゴリ（例: フード）" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn btn-secondary" disabled={!name.trim()}>
            追加
          </button>
        </form>
        <Notice error={error} />
      </div>
    </Panel>
  )
}

function CategoryRow({
  category,
  onSave,
  onDelete,
}: {
  category: Category
  onSave: (name: string, sort: number) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(category.name)
  const [sort, setSort] = useState(String(category.sort_order))
  const dirty = name !== category.name || sort !== String(category.sort_order)
  return (
    <div className="row cat-row">
      <input className="input" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} aria-label="カテゴリ名" />
      <input
        className="input mono"
        style={{ width: 90 }}
        inputMode="numeric"
        value={sort}
        onChange={(e) => setSort(e.target.value.replace(/[^\d-]/g, ''))}
        aria-label="並び順"
      />
      <button type="button" className="btn btn-secondary" disabled={!dirty || !name.trim()} onClick={() => onSave(name.trim(), Number(sort) || 0)}>
        保存
      </button>
      <button
        type="button"
        className="btn btn-text"
        onClick={() => window.confirm(`カテゴリ「${category.name}」を消しますか？`) && onDelete()}
      >
        削除
      </button>
    </div>
  )
}

type OptionDraft = { name: string; price_delta: string; is_available: boolean }
type GroupDraft = {
  name: string
  required: boolean
  max_select: string
  /** まとめ値段。どちらも空ならなし */
  bundle_count: string
  bundle_price: string
  options: OptionDraft[]
}

function toDraft(item: MenuItem | null): GroupDraft[] {
  return (item?.option_groups ?? []).map((g) => ({
    name: g.name,
    required: g.required,
    max_select: String(g.max_select),
    bundle_count: g.bundle_count == null ? '' : String(g.bundle_count),
    bundle_price: g.bundle_price == null ? '' : String(g.bundle_price),
    options: g.options.map((o) => ({ name: o.name, price_delta: String(o.price_delta), is_available: o.is_available })),
  }))
}

/** まとめ値段の入力を確かめる。問題があれば画面に出す文を返す。 */
function checkBundle(g: GroupDraft): string | null {
  if (!g.bundle_count && !g.bundle_price) return null
  const label = g.name.trim() || '選択肢の組'
  if (!g.bundle_count || !g.bundle_price) return `${label}のまとめ値段は、数と金額の両方を入れてください。`
  const n = Number(g.bundle_count)
  if (n < 2) return `${label}のまとめ値段は、2つ以上で設定してください。`
  if (n > (Number(g.max_select) || 1)) return `${label}のまとめ値段の数（${n}つ）は、選べる数以下にしてください。`
  return null
}

function ItemEditor({ item, categories, onClose }: { item: MenuItem | null; categories: Category[]; onClose: () => void }) {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const [current, setCurrent] = useState<MenuItem | null>(item)
  const [form, setForm] = useState({
    name: item?.name ?? '',
    description: item?.description ?? '',
    price: item ? String(item.price) : '',
    category_id: item?.category_id ?? null,
    is_available: item?.is_available ?? true,
    sort_order: String(item?.sort_order ?? 0),
  })
  const [groups, setGroups] = useState<GroupDraft[]>(() => toDraft(item))
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['manage', 'items'] })

  const setGroup = (i: number, patch: Partial<GroupDraft>) => setGroups(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)))
  const setOption = (gi: number, oi: number, patch: Partial<OptionDraft>) =>
    setGroup(gi, { options: groups[gi].options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) })

  const save = async () => {
    setError(null)
    setOk(null)
    const bundleError = groups.map(checkBundle).find((m) => m)
    if (bundleError) {
      setError(bundleError)
      return
    }
    setBusy(true)
    try {
      const body = {
        name: form.name.trim(),
        description: form.description,
        price: Number(form.price),
        category_id: form.category_id,
        is_available: form.is_available,
        sort_order: Number(form.sort_order) || 0,
        option_groups: groups.map((g) => ({
          name: g.name.trim(),
          required: g.required,
          max_select: Number(g.max_select) || 1,
          ...(g.bundle_count && g.bundle_price ? { bundle_count: Number(g.bundle_count), bundle_price: Number(g.bundle_price) } : {}),
          options: g.options.map((o) => ({ name: o.name.trim(), price_delta: Number(o.price_delta) || 0, is_available: o.is_available })),
        })),
      }
      const saved = current
        ? await apiFetch<MenuItem>(`/api/manage/menu-items/${current.id}`, { method: 'PATCH', token, body })
        : await apiFetch<MenuItem>('/api/manage/menu-items', { method: 'POST', token, body })
      setCurrent(saved)
      setGroups(toDraft(saved))
      setOk('保存しました。')
      refresh()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const upload = async (file: File) => {
    if (!current) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('image', file)
      setCurrent(await apiFetch<MenuItem>(`/api/manage/menu-items/${current.id}/image`, { method: 'POST', token, body: fd }))
      refresh()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const removeImage = async () => {
    if (!current) return
    try {
      setCurrent(await apiFetch<MenuItem>(`/api/manage/menu-items/${current.id}/image`, { method: 'DELETE', token }))
      refresh()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const archive = async (archived: boolean) => {
    if (!current) return
    try {
      const saved = archived
        ? await apiFetch<MenuItem>(`/api/manage/menu-items/${current.id}`, { method: 'DELETE', token })
        : await apiFetch<MenuItem>(`/api/manage/menu-items/${current.id}`, { method: 'PATCH', token, body: { is_archived: false } })
      setCurrent(saved)
      refresh()
      if (archived) onClose()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Sheet title={current ? `${current.name} の編集` : '商品を追加'} onClose={onClose} wide>
      <div className="stack">
        <div className="form-grid">
          <label className="field">
            <span className="field-label">品名</span>
            <input className="input" value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">価格（円）</span>
            <input
              className="input mono"
              inputMode="numeric"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value.replace(/\D/g, '') })}
            />
          </label>
          <label className="field">
            <span className="field-label">カテゴリ</span>
            <select
              className="select"
              value={form.category_id ?? ''}
              onChange={(e) => setForm({ ...form, category_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">（なし）</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">並び順</span>
            <input
              className="input mono"
              inputMode="numeric"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: e.target.value.replace(/[^\d-]/g, '') })}
            />
          </label>
        </div>
        <label className="field">
          <span className="field-label">説明</span>
          <textarea className="textarea" value={form.description} maxLength={500} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.is_available} onChange={(e) => setForm({ ...form, is_available: e.target.checked })} />
          販売中（外すと売り切れ）
        </label>

        <div className="field">
          <span className="field-label">選択肢（サイズ・トッピングなど）</span>
          {groups.map((g, gi) => (
            <div key={gi} className="og-edit">
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 160 }}
                  placeholder="組の名前（例: サイズ）"
                  value={g.name}
                  onChange={(e) => setGroup(gi, { name: e.target.value })}
                />
                <label className="check" style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={g.required} onChange={(e) => setGroup(gi, { required: e.target.checked })} />
                  必須
                </label>
                <label className="row" style={{ gap: 6, fontSize: 13 }}>
                  選べる数
                  <input
                    className="input mono"
                    style={{ width: 64 }}
                    inputMode="numeric"
                    value={g.max_select}
                    onChange={(e) => setGroup(gi, { max_select: e.target.value.replace(/\D/g, '') })}
                  />
                </label>
                <button type="button" className="btn btn-text" onClick={() => setGroups(groups.filter((_, j) => j !== gi))}>
                  組を外す
                </button>
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6, fontSize: 13 }}>
                <span>まとめ値段</span>
                <input
                  className="input mono"
                  style={{ width: 56 }}
                  inputMode="numeric"
                  value={g.bundle_count}
                  aria-label="まとめる数"
                  onChange={(e) => setGroup(gi, { bundle_count: e.target.value.replace(/\D/g, '') })}
                />
                <span>つで</span>
                <span className="price-input" style={{ width: 120 }}>
                  <input
                    className="input mono"
                    inputMode="numeric"
                    value={g.bundle_price}
                    aria-label="まとめ値段（円）"
                    onChange={(e) => setGroup(gi, { bundle_price: e.target.value.replace(/\D/g, '') })}
                  />
                  <span aria-hidden="true">円</span>
                </span>
                <span className="sub" style={{ fontSize: 12 }}>（例: 3つで100円。使わないときは空欄）</span>
              </div>
              {g.options.map((o, oi) => (
                <div key={oi} className="og-opt">
                  <input className="input" placeholder="選択肢（例: 大盛り）" value={o.name} onChange={(e) => setOption(gi, oi, { name: e.target.value })} />
                  <span className="price-input">
                    <input
                      className="input mono"
                      inputMode="numeric"
                      placeholder="追加料金"
                      value={o.price_delta}
                      onChange={(e) => setOption(gi, oi, { price_delta: e.target.value.replace(/[^\d-]/g, '') })}
                      aria-label="追加料金（円）"
                    />
                    <span aria-hidden="true">円</span>
                  </span>
                  <label className="check" style={{ fontSize: 12 }}>
                    <input type="checkbox" checked={o.is_available} onChange={(e) => setOption(gi, oi, { is_available: e.target.checked })} />
                    販売中
                  </label>
                  <button
                    type="button"
                    className="btn btn-text"
                    onClick={() => setGroup(gi, { options: g.options.filter((_, j) => j !== oi) })}
                  >
                    外す
                  </button>
                </div>
              ))}
              <div>
                <button
                  type="button"
                  className="btn btn-text"
                  onClick={() => setGroup(gi, { options: [...g.options, { name: '', price_delta: '0', is_available: true }] })}
                >
                  ＋ 選択肢を足す
                </button>
              </div>
            </div>
          ))}
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                setGroups([...groups, { name: '', required: false, max_select: '1', bundle_count: '', bundle_price: '', options: [{ name: '', price_delta: '0', is_available: true }] }])
              }
            >
              選択肢の組を足す
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field-label">写真</span>
          {current ? (
            <div className="row" style={{ alignItems: 'flex-start' }}>
              {current.image_url ? (
                <img className="photo" src={mediaUrl(current.image_url)} alt="" />
              ) : (
                <span className="photo" style={{ display: 'block' }} />
              )}
              <div className="stack" style={{ gap: 8 }}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void upload(f)
                    e.target.value = ''
                  }}
                />
                <span className="field-hint">JPEG・PNG・WebP、5MBまで。長い辺 800px に縮めて保存します。</span>
                {current.image_url && (
                  <button type="button" className="btn btn-text" style={{ alignSelf: 'flex-start' }} onClick={removeImage}>
                    写真を外す
                  </button>
                )}
              </div>
            </div>
          ) : (
            <span className="field-hint">保存すると写真を登録できます。</span>
          )}
        </div>

        <Notice error={error} ok={ok} />
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" style={{ minWidth: 200 }} disabled={busy || !form.name.trim() || form.price === ''} onClick={save}>
            保存する
          </button>
          <span className="spacer" />
          {current &&
            (current.is_archived ? (
              <button type="button" className="btn btn-secondary" onClick={() => archive(false)}>
                お品書きに戻す
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-text"
                onClick={() => window.confirm(`「${current.name}」をお品書きから削除しますか？（売上の記録は残ります）`) && archive(true)}
              >
                この商品を削除
              </button>
            ))}
        </div>
      </div>
    </Sheet>
  )
}
