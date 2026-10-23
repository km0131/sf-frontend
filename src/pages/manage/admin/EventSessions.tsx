import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { apiFetch, errorMessage } from '../../../lib/api'
import { kindLabels, type EventSession } from '../../../lib/ledger'
import type { List } from '../../../lib/types'
import { Notice, Panel } from '../common'
import { useManage } from '../context'

/** システム管理者: 回の下の開催回（練習運用・本番の日ごと）の作成と、収支の受付の開け閉め。
 *  注文は回と営業日で開催回に対応づくので、1つの回の1日に開催回は1つ。 */
export function EventSessions({ eventId, name }: { eventId: number; name: string }) {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const sessions = useQuery({
    queryKey: ['admin', 'event-sessions', eventId],
    queryFn: () => apiFetch<List<EventSession>>(`/api/admin/event-sessions?event_id=${eventId}`, { token }).then((r) => r.items),
  })
  const [form, setForm] = useState({ name: '', date: '', kind: 'production' as EventSession['kind'], opens_at: '', closes_at: '' })
  const [error, setError] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'event-sessions', eventId] })

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const { opens_at, closes_at, ...rest } = form
      const hours = opens_at && closes_at ? { opens_at, closes_at } : {}
      await apiFetch('/api/admin/event-sessions', { method: 'POST', token, body: { event_id: eventId, ...rest, ...hours, name: form.name.trim() } })
      setForm({ ...form, name: '', date: '' })
      void refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const patch = async (
    s: EventSession,
    body: Partial<Pick<EventSession, 'receipt_open' | 'is_active' | 'name' | 'kind' | 'sort_order'>> | { opens_at: string; closes_at: string },
  ) => {
    setError(null)
    try {
      await apiFetch(`/api/admin/event-sessions/${s.id}`, { method: 'PATCH', token, body })
      void refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Panel title={`開催回（日ごと）：${name}`}>
      <p className="sub" style={{ fontSize: 13, marginBottom: 12 }}>
        練習運用・本番の日ごとに作ります。その日の注文は、この開催回の売上として数えます。学校に出す Excel は、ふだん「本番」だけを数えます。本番の営業時間を入れると、店長の商品画面に「イベント終了時の見込み」が出ます。
      </p>
      <div className="table-wrap">
        <table className="table table-cards">
          <thead>
            <tr>
              <th>開催日</th>
              <th>名前</th>
              <th>種類</th>
              <th>営業時間</th>
              <th>収支の受付</th>
              <th>選択肢に出す</th>
            </tr>
          </thead>
          <tbody>
            {sessions.data?.map((s) => (
              <tr key={s.id} style={s.is_active ? undefined : { opacity: 0.55 }}>
                <td className="mono cell-title">{s.date}</td>
                <td data-label="名前">{s.name}</td>
                <td data-label="種類">
                  <select className="select" value={s.kind} onChange={(e) => void patch(s, { kind: e.target.value as EventSession['kind'] })}>
                    <option value="production">{kindLabels.production}</option>
                    <option value="practice">{kindLabels.practice}</option>
                  </select>
                </td>
                <td data-label="営業時間">
                  <Hours key={`${s.opens_at}-${s.closes_at}`} session={s} onSave={(opens_at, closes_at) => void patch(s, { opens_at, closes_at })} />
                </td>
                <td data-label="収支の受付">
                  <button type="button" className="btn btn-text" onClick={() => void patch(s, { receipt_open: !s.receipt_open })}>
                    {s.receipt_open ? '受付中（締め切る）' : '締め切り（再開する）'}
                  </button>
                </td>
                <td data-label="選択肢に出す">
                  <label className="check">
                    <input type="checkbox" checked={s.is_active} onChange={(e) => void patch(s, { is_active: e.target.checked })} />
                    出す
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sessions.data?.length === 0 && <p className="empty">まだ開催回がありません</p>}
      </div>

      <form className="form-grid" style={{ marginTop: 16 }} onSubmit={create}>
        <label className="field">
          <span className="field-label">名前</span>
          <input className="input" value={form.name} maxLength={50} placeholder="本番1日目 / 練習運用1" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">開催日</span>
          <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">種類</span>
          <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as EventSession['kind'] })}>
            <option value="production">{kindLabels.production}</option>
            <option value="practice">{kindLabels.practice}</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">開店（任意）</span>
          <input className="input" type="time" value={form.opens_at} onChange={(e) => setForm({ ...form, opens_at: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">閉店（任意）</span>
          <input className="input" type="time" value={form.closes_at} onChange={(e) => setForm({ ...form, closes_at: e.target.value })} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={!form.name.trim() || !form.date || !form.opens_at !== !form.closes_at}>
          開催回を追加
        </button>
      </form>
      <Notice error={error ?? (sessions.error ? errorMessage(sessions.error) : null)} />
    </Panel>
  )
}

/** 営業時間の欄（開店・閉店を入れて保存。両方消して保存すると未設定） */
function Hours({ session: s, onSave }: { session: EventSession; onSave: (opens: string, closes: string) => void }) {
  const [opens, setOpens] = useState(s.opens_at ?? '')
  const [closes, setCloses] = useState(s.closes_at ?? '')
  const changed = opens !== (s.opens_at ?? '') || closes !== (s.closes_at ?? '')
  const valid = (!opens && !closes) || (opens && closes && opens < closes)
  return (
    <div className="session-hours">
      <input className="input" type="time" aria-label="開店" value={opens} onChange={(e) => setOpens(e.target.value)} />
      <span aria-hidden="true">〜</span>
      <input className="input" type="time" aria-label="閉店" value={closes} onChange={(e) => setCloses(e.target.value)} />
      {changed && (
        <button type="button" className="btn btn-text" disabled={!valid} onClick={() => onSave(opens, closes)}>
          保存
        </button>
      )}
    </div>
  )
}
