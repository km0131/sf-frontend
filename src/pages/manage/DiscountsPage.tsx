import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Sheet } from '../../components/Sheet'
import { apiFetch, errorMessage } from '../../lib/api'
import { kindLabel } from '../../lib/discount'
import type { DiscountKind, DiscountPreset, DiscountScope, List } from '../../lib/types'
import { Notice, PageHead, Panel } from './common'
import { useManage } from './context'

const key = ['manage', 'discounts'] as const

const kinds: { value: DiscountKind; label: string; hint: string }[] = [
  { value: 'amount', label: '円引き', hint: '商品ごとなら1個あたり、注文全体なら1回だけ引きます' },
  { value: 'percent', label: '％引き', hint: '1円未満は切り捨てます（1〜100）' },
  { value: 'fixed_price', label: '価格指定', hint: '商品ごとなら1個をこの値段に、注文全体ならお支払いをこの値段にします' },
]
const scopes: { value: DiscountScope; label: string }[] = [
  { value: 'item', label: '商品ごと' },
  { value: 'order', label: '注文全体' },
]

/** 店長: 値引きのプリセット（レジで選べる値引き）。過去の注文が使っているので消さずに「無効」にする。 */
export function DiscountsPage() {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<DiscountPreset | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { data, error: loadError } = useQuery({
    queryKey: key,
    queryFn: () => apiFetch<List<DiscountPreset>>('/api/manage/discounts', { token }).then((r) => r.items),
  })

  // 自動で適用する・やめる（閉店前のセールなど。Web・レジの新しい注文すべてに付く）
  const toggleAuto = async (p: DiscountPreset) => {
    setError(null)
    if (!p.auto_apply && !window.confirm(`「${p.name}」をこれからの注文（Web・レジとも）に自動で付けますか？`)) return
    try {
      await apiFetch(`/api/manage/discounts/${p.id}`, { method: 'PUT', token, body: { ...p, auto_apply: !p.auto_apply } })
      void queryClient.invalidateQueries({ queryKey: key })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const toggle = async (p: DiscountPreset) => {
    setError(null)
    try {
      if (p.active) await apiFetch(`/api/manage/discounts/${p.id}`, { method: 'DELETE', token })
      else await apiFetch(`/api/manage/discounts/${p.id}`, { method: 'PUT', token, body: { ...p, active: true } })
      void queryClient.invalidateQueries({ queryKey: key })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="mpage">
      <PageHead title="値引き">
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          値引きを追加
        </button>
      </PageHead>
      <Panel title="レジで選べる値引き">
        <p className="field-hint" style={{ marginBottom: 12 }}>
          スタッフはここで登録した値引きから選びます。金額を自由に入れる値引きは、店舗設定で上限額を決めたときだけ使えます。
          1つの商品・1つの注文に付けられる値引きは1つまでです。
        </p>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          <strong>自動で適用</strong>にした値引きは、Web 注文・レジのこれからの注文すべてに付きます（閉店前のセールなど）。商品ごとの値引きはすべての商品に、注文全体の値引きはお会計に付き、お客さんの画面には「値引き中」と値引き後の値段が出ます。商品ごと・注文全体それぞれ1つまでです。
        </p>
        {data?.some((p) => p.auto_apply) && (
          <div className="sale-notice" style={{ marginBottom: 12 }}>
            <p className="sale-notice-title">自動で適用中</p>
            <p className="sale-notice-body">
              {data.filter((p) => p.auto_apply).map((p) => `${p.name}（${scopes.find((s) => s.value === p.scope)?.label}・${kindLabel(p.kind, p.value, p.scope)}）`).join('　')}
            </p>
          </div>
        )}
        <Notice error={error ?? (loadError ? errorMessage(loadError) : null)} />
        <div className="table-wrap">
          <table className="table table-cards">
            <thead>
              <tr>
                <th>名前</th>
                <th>範囲</th>
                <th>内容</th>
                <th>状態</th>
                <th>自動で適用</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => setEditing(p)} style={{ opacity: p.active ? 1 : 0.55 }}>
                  <td className="mincho cell-title">{p.name}</td>
                  <td data-label="範囲">{scopes.find((s) => s.value === p.scope)?.label}</td>
                  <td className="mono" data-label="内容">
                    {kindLabel(p.kind, p.value, p.scope)}
                  </td>
                  <td data-label="状態">{p.active ? <span className="tag">使える</span> : <span className="tag">無効</span>}</td>
                  <td data-label="自動で適用">
                    {p.active && (
                      <button
                        type="button"
                        className={`btn ${p.auto_apply ? 'btn-secondary' : 'btn-text'}`}
                        aria-pressed={p.auto_apply}
                        onClick={(e) => {
                          e.stopPropagation()
                          void toggleAuto(p)
                        }}
                      >
                        {p.auto_apply ? '適用中（やめる）' : '自動で適用する'}
                      </button>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-text"
                      onClick={(e) => {
                        e.stopPropagation()
                        void toggle(p)
                      }}
                    >
                      {p.active ? '無効にする' : '有効に戻す'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.length === 0 && <p className="empty">まだ値引きがありません。「値引きを追加」から登録してください。</p>}
        </div>
      </Panel>
      {editing && <PresetEditor preset={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function PresetEditor({ preset, onClose }: { preset: DiscountPreset | null; onClose: () => void }) {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: preset?.name ?? '',
    kind: preset?.kind ?? ('amount' as DiscountKind),
    value: preset ? String(preset.value) : '',
    scope: preset?.scope ?? ('item' as DiscountScope),
    active: preset?.active ?? true,
    auto_apply: preset?.auto_apply ?? false,
  })
  const [error, setError] = useState<string | null>(null)
  const value = Number(form.value)
  const valueError =
    form.value === ''
      ? null
      : form.kind === 'percent' && (value < 1 || value > 100)
        ? '％は 1〜100 で入れてください。'
        : form.kind === 'amount' && value < 1
          ? '1円以上で入れてください。'
          : null

  const save = async () => {
    setError(null)
    try {
      const body = { name: form.name.trim(), kind: form.kind, value, scope: form.scope, active: form.active, auto_apply: form.active && form.auto_apply }
      if (preset) await apiFetch(`/api/manage/discounts/${preset.id}`, { method: 'PUT', token, body })
      else await apiFetch('/api/manage/discounts', { method: 'POST', token, body })
      void queryClient.invalidateQueries({ queryKey: key })
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Sheet title={preset ? `${preset.name} の編集` : '値引きを追加'} onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span className="field-label">名前（レジに出ます）</span>
          <input className="input" value={form.name} maxLength={50} placeholder="例: 学生割・焼き崩れ" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <div className="field">
          <span className="field-label">範囲</span>
          <div className="swatches" role="group" aria-label="範囲">
            {scopes.map((s) => (
              <button key={s.value} type="button" className="swatch" aria-pressed={form.scope === s.value} onClick={() => setForm({ ...form, scope: s.value })}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">種類</span>
          <div className="swatches" role="group" aria-label="種類">
            {kinds.map((k) => (
              <button key={k.value} type="button" className="swatch" aria-pressed={form.kind === k.value} onClick={() => setForm({ ...form, kind: k.value })}>
                {k.label}
              </button>
            ))}
          </div>
          <span className="field-hint">{kinds.find((k) => k.value === form.kind)?.hint}</span>
        </div>
        <label className="field">
          <span className="field-label">{form.kind === 'percent' ? '割合（％）' : '金額（円）'}</span>
          <span className="price-input" style={{ maxWidth: 180 }}>
            <input className="input mono" inputMode="numeric" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value.replace(/\D/g, '') })} />
            <span aria-hidden="true">{form.kind === 'percent' ? '％' : '円'}</span>
          </span>
          {form.value !== '' && !valueError && (
            <span className="field-hint">{kindLabel(form.kind, value, form.scope)}</span>
          )}
        </label>
        <label className="check">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          レジで使える（外すと無効。過去の注文の値引きはそのまま）
        </label>
        <label className="check">
          <input type="checkbox" checked={form.auto_apply} disabled={!form.active} onChange={(e) => setForm({ ...form, auto_apply: e.target.checked })} />
          自動で適用する（Web 注文・レジのこれからの注文すべてに付ける）
        </label>
        {preset && <p className="field-hint">内容を変えても、すでに付けた値引きの額は変わりません。</p>}
        <Notice error={error ?? valueError} />
        <button type="button" className="btn btn-primary" disabled={!form.name.trim() || form.value === '' || !!valueError} onClick={save}>
          保存する
        </button>
      </div>
    </Sheet>
  )
}
