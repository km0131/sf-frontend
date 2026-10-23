import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { apiFetch, errorMessage } from '../../../lib/api'
import { yen } from '../../../lib/format'
import { entryKindLabels, sessionLabel, type EntryKind, type EventSession, type LedgerCategory } from '../../../lib/ledger'
import type { List } from '../../../lib/types'
import { Notice, PageHead, Panel } from '../common'
import { useManage } from '../context'

type ShopTotal = { shop_id: number; shop_name: string; sales: number; income: number; expense: number; balance: number; cash_difference?: number | null }
type Event = { id: number; name: string; is_current: boolean }

const signed = (n: number) => (n < 0 ? `−${yen(-n)}` : yen(n))

/** システム管理者: 全店舗の収支（回ごとの本番の合計、または開催回ごと）と、科目マスタ。 */
export function AllLedgerPage() {
  const { token } = useManage()
  const [mode, setMode] = useState<'event' | 'session'>('event')
  const events = useQuery({
    queryKey: ['admin', 'events'],
    queryFn: () => apiFetch<List<Event>>('/api/admin/events', { token }).then((r) => r.items),
  })
  const sessions = useQuery({
    queryKey: ['admin', 'event-sessions', 'all'],
    queryFn: () => apiFetch<List<EventSession>>('/api/admin/event-sessions', { token }).then((r) => r.items),
  })
  const [pickedEvent, setPickedEvent] = useState<number | null>(null)
  const [pickedSession, setPickedSession] = useState<number | null>(null)
  // 選んでいなければ、今の回・今日に最も近い開催回
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const eventId = pickedEvent ?? (events.data?.find((e) => e.is_current) ?? events.data?.[0])?.id ?? null
  const nearest = [...(sessions.data ?? [])].sort(
    (a, b) => Math.abs(Date.parse(a.date) - Date.parse(today)) - Math.abs(Date.parse(b.date) - Date.parse(today)),
  )[0]
  const sessionId = pickedSession ?? nearest?.id ?? null

  const totals = useQuery({
    queryKey: ['admin', 'ledger', mode, mode === 'event' ? eventId : sessionId],
    queryFn: () =>
      apiFetch<{ items: ShopTotal[]; sessions?: EventSession[] }>(
        mode === 'event' ? `/api/admin/ledger/report?event_id=${eventId}` : `/api/admin/ledger?session_id=${sessionId}`,
        { token },
      ),
    enabled: mode === 'event' ? eventId != null : sessionId != null,
    placeholderData: keepPreviousData,
  })
  const items = totals.data?.items
  const sum = (k: 'sales' | 'income' | 'expense' | 'balance') => (items ?? []).reduce((n, t) => n + t[k], 0)

  return (
    <div className="mpage">
      <PageHead title="全店の収支" />
      <div className="form-grid" style={{ maxWidth: 720 }}>
        <label className="field">
          <span className="field-label">集計の単位</span>
          <select className="select" value={mode} onChange={(e) => setMode(e.target.value as 'event' | 'session')}>
            <option value="event">回ごと（本番の合計・収支報告）</option>
            <option value="session">開催回ごと（練習も見られる）</option>
          </select>
        </label>
        {mode === 'event' ? (
          <label className="field">
            <span className="field-label">回</span>
            <select className="select" value={eventId ?? ''} onChange={(e) => setPickedEvent(Number(e.target.value))}>
              {events.data?.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                  {ev.is_current ? '（今の回）' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field">
            <span className="field-label">開催回</span>
            <select className="select" value={sessionId ?? ''} onChange={(e) => setPickedSession(Number(e.target.value))}>
              {sessions.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.event_name}　{sessionLabel(s)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {mode === 'event' && totals.data?.sessions && (
        <p className="sub" style={{ fontSize: 13 }}>
          本番の開催回（{totals.data.sessions.map((s) => s.name).join('・') || 'まだありません'}）を合わせた収支です。練習は含めません。
        </p>
      )}
      {mode === 'session' && sessions.data?.length === 0 && <p className="empty">開催回がまだありません（「開催回」の画面で作ります）。</p>}
      {(events.error || sessions.error || totals.error) && <p className="error-text">{errorMessage(events.error ?? sessions.error ?? totals.error)}</p>}

      {items && (
        <Panel title="店舗ごと">
          <div className="table-wrap">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>店舗</th>
                  <th className="num">売上（自動）</th>
                  <th className="num">収入計</th>
                  <th className="num">支出計</th>
                  <th className="num">差引</th>
                  {mode === 'session' && <th className="num">現金の差額</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.shop_id}>
                    <td className="cell-title">{t.shop_name}</td>
                    <td className="num" data-label="売上（自動）">{yen(t.sales)}</td>
                    <td className="num" data-label="収入計">{yen(t.income)}</td>
                    <td className="num" data-label="支出計">{yen(t.expense)}</td>
                    <td className="num" data-label="差引">{signed(t.balance)}</td>
                    {mode === 'session' && (
                      <td className="num" data-label="現金の差額">{t.cash_difference == null ? '未入力' : signed(t.cash_difference)}</td>
                    )}
                  </tr>
                ))}
                {items.length > 0 && (
                  <tr>
                    <td className="cell-title">合計</td>
                    <td className="num" data-label="売上（自動）">{yen(sum('sales'))}</td>
                    <td className="num" data-label="収入計">{yen(sum('income'))}</td>
                    <td className="num" data-label="支出計">{yen(sum('expense'))}</td>
                    <td className="num" data-label="差引">{signed(sum('balance'))}</td>
                    {mode === 'session' && <td />}
                  </tr>
                )}
              </tbody>
            </table>
            {items.length === 0 && <p className="empty">この回に出店している店舗がありません</p>}
          </div>
        </Panel>
      )}

      <Categories />
    </div>
  )
}

/** 科目マスタ（追加・名前と表示順の変更・無効化・使っていない科目の削除）。 */
function Categories() {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const cats = useQuery({
    queryKey: ['admin', 'ledger', 'categories'],
    queryFn: () => apiFetch<List<LedgerCategory>>('/api/admin/ledger/categories', { token }).then((r) => r.items),
  })
  const [form, setForm] = useState({ kind: 'expense' as EntryKind, label: '' })
  const [error, setError] = useState<string | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'ledger', 'categories'] })

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      void refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  const path = (c: LedgerCategory) => `/api/admin/ledger/categories/${c.kind}/${c.code}`

  const add = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await apiFetch('/api/admin/ledger/categories', { method: 'POST', token, body: { kind: form.kind, label: form.label.trim() } })
      setForm({ ...form, label: '' })
    })
  }

  return (
    <Panel title="科目">
      <p className="sub" style={{ fontSize: 13, marginBottom: 12 }}>
        店長が収支を入力するときの科目です。使っている科目は削除できないので、使わなくなったら「無効」にします（入力済みの収支はそのまま集計されます）。
      </p>
      <div className="table-wrap">
        <table className="table table-cards">
          <thead>
            <tr>
              <th>種別</th>
              <th>科目名</th>
              <th>表示順</th>
              <th>状態</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cats.data?.map((c) => (
              <tr key={`${c.kind}/${c.code}`} style={c.is_active ? undefined : { opacity: 0.55 }}>
                <td className="cell-title">{entryKindLabels[c.kind]}</td>
                <td data-label="科目名">
                  <input
                    className="input"
                    defaultValue={c.label}
                    maxLength={30}
                    aria-label={`${c.label} の名前`}
                    onBlur={(e) => {
                      const label = e.target.value.trim()
                      if (label && label !== c.label) void run(() => apiFetch(path(c), { method: 'PATCH', token, body: { label } }))
                    }}
                  />
                </td>
                <td data-label="表示順">
                  <input
                    className="input"
                    inputMode="numeric"
                    style={{ maxWidth: 90 }}
                    defaultValue={c.sort_order}
                    aria-label={`${c.label} の表示順`}
                    onBlur={(e) => {
                      const n = Number(e.target.value)
                      if (Number.isInteger(n) && n !== c.sort_order) void run(() => apiFetch(path(c), { method: 'PATCH', token, body: { sort_order: n } }))
                    }}
                  />
                </td>
                <td data-label="状態">
                  <button type="button" className="btn btn-text" onClick={() => void run(() => apiFetch(path(c), { method: 'PATCH', token, body: { is_active: !c.is_active } }))}>
                    {c.is_active ? '有効（無効にする）' : '無効（有効にする）'}
                  </button>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="btn btn-text"
                    onClick={() => window.confirm(`科目「${c.label}」を削除しますか？（使っている科目は削除できません）`) && void run(() => apiFetch(path(c), { method: 'DELETE', token }))}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="form-grid" style={{ marginTop: 16 }} onSubmit={add}>
        <label className="field">
          <span className="field-label">種別</span>
          <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as EntryKind })}>
            <option value="expense">支出</option>
            <option value="income">収入</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">科目名</span>
          <input className="input" value={form.label} maxLength={30} placeholder="例: 装飾費" onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={!form.label.trim()}>
          科目を追加
        </button>
      </form>
      <Notice error={error ?? (cats.error ? errorMessage(cats.error) : null)} />
    </Panel>
  )
}
