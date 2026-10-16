import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { apiFetch, errorMessage } from '../../../lib/api'
import type { List } from '../../../lib/types'
import { Notice, PageHead, Panel } from '../common'
import { useManage } from '../context'
import type { AdminShop } from './ShopsPage'

type Event = { id: number; name: string; starts_on: string; ends_on: string; is_current: boolean }
type EventShop = { shop_id: number; slug: string; name: string; order_prefix: string; is_active: boolean }

/** システム管理者: 開催回の作成・「今の開催回」の切り替え・出店する店舗と整理番号の頭文字。 */
export function EventsPage() {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const events = useQuery({
    queryKey: ['admin', 'events'],
    queryFn: () => apiFetch<List<Event>>('/api/admin/events', { token }).then((r) => r.items),
  })
  const [picked, setSelected] = useState<number | null>(null)
  // 選んでいなければ、今の開催回（なければ最新）を表示する
  const selected = picked ?? (events.data?.find((e) => e.is_current) ?? events.data?.[0])?.id ?? null

  const [form, setForm] = useState({ name: '', starts_on: '', ends_on: '' })
  const [error, setError] = useState<string | null>(null)

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const ev = await apiFetch<Event>('/api/admin/events', { method: 'POST', token, body: form })
      setForm({ name: '', starts_on: '', ends_on: '' })
      setSelected(ev.id)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'events'] })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const activate = async (id: number) => {
    setError(null)
    try {
      await apiFetch(`/api/admin/events/${id}/activate`, { method: 'POST', token })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'events'] })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="mpage">
      <PageHead title="開催回" />
      <Panel title="開催回の一覧">
        <Notice error={error} />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>名前</th>
                <th>期間</th>
                <th>今の開催回</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {events.data?.map((ev) => (
                <tr
                  key={ev.id}
                  className="clickable"
                  onClick={() => setSelected(ev.id)}
                  style={selected === ev.id ? { background: 'rgba(134,123,169,.08)' } : undefined}
                >
                  <td className="mincho">{ev.name}</td>
                  <td className="mono">
                    {ev.starts_on} 〜 {ev.ends_on}
                  </td>
                  <td>{ev.is_current ? <span className="tag tag-strong">開催中</span> : ''}</td>
                  <td style={{ textAlign: 'right' }}>
                    {!ev.is_current && (
                      <button
                        type="button"
                        className="btn btn-text"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (window.confirm(`「${ev.name}」を今の開催回にしますか？お客様の画面に出る店舗が切り替わります。`)) void activate(ev.id)
                        }}
                      >
                        今の開催回にする
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {events.data?.length === 0 && <p className="empty">まだ開催回がありません</p>}
        </div>
      </Panel>

      {selected !== null && <EventShops eventId={selected} name={events.data?.find((e) => e.id === selected)?.name ?? ''} />}

      <Panel title="開催回を追加">
        <form className="form-grid" onSubmit={create}>
          <label className="field">
            <span className="field-label">名前</span>
            <input className="input" value={form.name} placeholder="第60回 学園祭" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">初日</span>
            <input className="input" type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">最終日</span>
            <input className="input" type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={!form.name || !form.starts_on || !form.ends_on}>
            追加する
          </button>
        </form>
      </Panel>
    </div>
  )
}

function EventShops({ eventId, name }: { eventId: number; name: string }) {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const shops = useQuery({
    queryKey: ['admin', 'shops'],
    queryFn: () => apiFetch<List<AdminShop>>('/api/admin/shops', { token }).then((r) => r.items),
  })
  const joined = useQuery({
    queryKey: ['admin', 'events', eventId, 'shops'],
    queryFn: () => apiFetch<List<EventShop>>(`/api/admin/events/${eventId}/shops`, { token }).then((r) => r.items),
  })
  const [error, setError] = useState<string | null>(null)

  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      void queryClient.invalidateQueries({ queryKey: ['admin', 'events', eventId, 'shops'] })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Panel title={`「${name}」に出店する店舗`}>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        出店する店舗に、整理番号の頭文字（A〜Z、1〜2文字）を割り当てます。同じ開催回の中で頭文字は重ねられません。
      </p>
      <Notice error={error} />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>店名</th>
              <th>頭文字</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shops.data?.map((s) => {
              const j = joined.data?.find((x) => x.shop_id === s.id)
              return (
                <PrefixRow
                  key={`${s.id}-${j?.order_prefix ?? ''}`}
                  name={s.name}
                  prefix={j?.order_prefix ?? ''}
                  joined={Boolean(j)}
                  onSave={(p) => act(() => apiFetch(`/api/admin/events/${eventId}/shops/${s.id}`, { method: 'PUT', token, body: { order_prefix: p } }))}
                  onRemove={() => act(() => apiFetch(`/api/admin/events/${eventId}/shops/${s.id}`, { method: 'DELETE', token }))}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function PrefixRow({
  name,
  prefix,
  joined,
  onSave,
  onRemove,
}: {
  name: string
  prefix: string
  joined: boolean
  onSave: (p: string) => void
  onRemove: () => void
}) {
  const [value, setValue] = useState(prefix)
  return (
    <tr>
      <td className="mincho">{name}</td>
      <td>
        <input
          className="input mono"
          style={{ width: 80 }}
          value={value}
          maxLength={2}
          onChange={(e) => setValue(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          aria-label={`${name}の頭文字`}
        />
      </td>
      <td style={{ textAlign: 'right' }}>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" disabled={!value || value === prefix} onClick={() => onSave(value)}>
            {joined ? '頭文字を変える' : '出店させる'}
          </button>
          {joined && (
            <button type="button" className="btn btn-text" onClick={onRemove}>
              出店を取り消す
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
