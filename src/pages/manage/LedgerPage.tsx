import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError, apiFetch, errorMessage } from '../../lib/api'
import { yen } from '../../lib/format'
import {
  categoryLabels,
  entryKindLabels,
  sessionLabel,
  type EntryKind,
  type EventSession,
  type LedgerEntry,
  type LedgerSummary,
} from '../../lib/ledger'
import { Notice, PageHead, Panel } from './common'
import { useManage } from './context'

type Sessions = { items: EventSession[]; default_session_id: number | null }
type Ledger = { session: EventSession; summary: LedgerSummary; entries: LedgerEntry[] }

/** 今日の日付（YYYY-MM-DD、端末の時刻） */
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  )
}

function ledgerError(e: unknown): string {
  if (e instanceof ApiError && e.code === 'session_closed') return 'この開催回は、収支の受け付けを締め切りました。'
  return errorMessage(e)
}

/** 店長: 開催回ごとの収支（売上は注文から自動で集計、補助金・支出などは手入力）と現金照合。 */
export function LedgerPage() {
  const { token } = useManage()
  const [params, setParams] = useSearchParams()
  const sessions = useQuery({
    queryKey: ['manage', 'ledger', 'sessions'],
    queryFn: () => apiFetch<Sessions>('/api/manage/ledger/sessions', { token }),
  })
  // 開催回は URL の ?session= に持つ。なければ既定（今日に最も近い受付中の回）
  const sessionId = Number(params.get('session')) || sessions.data?.default_session_id || null
  const ledger = useQuery({
    queryKey: ['manage', 'ledger', sessionId],
    queryFn: () => apiFetch<Ledger>(`/api/manage/ledger?session_id=${sessionId}`, { token }),
    enabled: sessionId != null,
    placeholderData: keepPreviousData,
  })
  const session = ledger.data?.session
  const writable = !!session && session.is_active && session.receipt_open
  const s = ledger.data?.summary

  return (
    <div className="mpage">
      <PageHead title="収支" />
      <label className="field" style={{ maxWidth: 420 }}>
        <span className="field-label">開催回</span>
        <select
          className="select"
          value={sessionId ?? ''}
          onChange={(e) => setParams((p) => ({ ...Object.fromEntries(p), session: e.target.value }), { replace: true })}
        >
          {sessions.data?.items.map((x) => (
            <option key={x.id} value={x.id}>
              {sessionLabel(x)}
              {x.receipt_open ? '' : '　締め切り'}
            </option>
          ))}
        </select>
      </label>
      {sessions.data?.items.length === 0 && <p className="empty">開催回がまだありません（運営が作ります）。</p>}
      <Notice error={sessions.error ? errorMessage(sessions.error) : ledger.error ? errorMessage(ledger.error) : null} />

      {s && session && (
        <div className="stack" style={{ gap: 32, opacity: ledger.isFetching ? 0.6 : 1, transition: 'opacity var(--dur-hover)' }}>
          <div className="stats">
            <Stat label="収入計" value={yen(s.income)} note={`うち売上 ${yen(s.sales)}（注文から自動）`} />
            <Stat label="支出計" value={yen(s.expense)} />
            <Stat label="差引" value={`${s.balance < 0 ? '−' : ''}${yen(Math.abs(s.balance))}`} note={s.balance < 0 ? '赤字' : s.balance > 0 ? '黒字' : ''} />
          </div>

          <Panel title="科目別の内訳">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>種別</th>
                    <th>科目</th>
                    <th className="num">金額</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>収入</td>
                    <td>
                      売上<span className="sub">（注文から自動・{s.sales_orders}件。支払い済み、取り消し・未受取を除く）</span>
                    </td>
                    <td className="num">{yen(s.sales)}</td>
                  </tr>
                  {s.by_category.map((c) => (
                    <tr key={`${c.kind}/${c.category}`}>
                      <td>{entryKindLabels[c.kind]}</td>
                      <td>{categoryLabels[c.kind][c.category] ?? c.category}</td>
                      <td className="num">{c.amount < 0 ? `−${yen(-c.amount)}` : yen(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {!writable && (
            <p className="field-hint">この開催回は、収支の受け付けを締め切りました（見ることはできます）。直したいときは運営に連絡してください。</p>
          )}
          {/* 開催回を切り替えたら、入力欄を空にする */}
          <Entries key={`e${session.id}`} sessionId={session.id} entries={ledger.data!.entries} writable={writable} />
          <CashCount key={`c${session.id}`} sessionId={session.id} summary={s} writable={writable} />
        </div>
      )}
    </div>
  )
}

type Draft = { kind: EntryKind; category: string; amount: string; entry_date: string; memo: string }
const emptyDraft = (): Draft => ({ kind: 'expense', category: 'food', amount: '', entry_date: todayStr(), memo: '' })

/** 収支の入力欄と明細。 */
function Entries({ sessionId, entries, writable }: { sessionId: number; entries: LedgerEntry[]; writable: boolean }) {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editing, setEditing] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['manage', 'ledger'] })
  const amount = Number(draft.amount)
  // 金額は整数（円）。売上の補正だけは負の金額（減らす補正）を入れられる
  const amountOk = draft.amount.trim() !== '' && Number.isInteger(amount) && amount !== 0 && Math.abs(amount) <= 10_000_000 && (amount > 0 || draft.category === 'sales_adjust')

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!amountOk || busy) return
    setBusy(true)
    setError(null)
    setOk(null)
    const body = { session_id: sessionId, kind: draft.kind, category: draft.category, amount, entry_date: draft.entry_date, memo: draft.memo }
    try {
      if (editing) {
        await apiFetch(`/api/manage/ledger/entries/${editing}`, { method: 'PUT', token, body })
        setOk('保存しました。')
      } else {
        await apiFetch('/api/manage/ledger/entries', { method: 'POST', token, body })
        setOk('追加しました。')
      }
      setDraft(emptyDraft())
      setEditing(null)
      void refresh()
    } catch (err) {
      setError(ledgerError(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (entry: LedgerEntry) => {
    const label = `${entry.entry_date} ${categoryLabels[entry.kind][entry.category] ?? entry.category} ${yen(entry.amount)}`
    if (!window.confirm(`「${label}」を削除しますか？`)) return
    setError(null)
    setOk(null)
    try {
      await apiFetch(`/api/manage/ledger/entries/${entry.id}`, { method: 'DELETE', token })
      if (editing === entry.id) {
        setEditing(null)
        setDraft(emptyDraft())
      }
      void refresh()
    } catch (err) {
      setError(ledgerError(err))
    }
  }

  const edit = (entry: LedgerEntry) => {
    setEditing(entry.id)
    setDraft({ kind: entry.kind, category: entry.category, amount: String(entry.amount), entry_date: entry.entry_date, memo: entry.memo })
    setOk(null)
    setError(null)
  }

  return (
    <>
      {writable && (
        <Panel title={editing ? '収支を直す' : '収支を入力'}>
          <form className="form-grid" onSubmit={save}>
            <label className="field">
              <span className="field-label">種別</span>
              <select
                className="select"
                value={draft.kind}
                onChange={(e) => {
                  const kind = e.target.value as EntryKind
                  setDraft({ ...draft, kind, category: Object.keys(categoryLabels[kind])[0] })
                }}
              >
                <option value="expense">支出</option>
                <option value="income">収入</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">科目</span>
              <select className="select" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                {Object.entries(categoryLabels[draft.kind]).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">金額（円）</span>
              <input
                className="input"
                inputMode="numeric"
                value={draft.amount}
                placeholder="例: 3000"
                onChange={(e) => setDraft({ ...draft, amount: e.target.value.replace(/[^\d-]/g, '') })}
              />
            </label>
            <label className="field">
              <span className="field-label">日付（購入日・受取日）</span>
              <input className="input" type="date" value={draft.entry_date} onChange={(e) => setDraft({ ...draft, entry_date: e.target.value })} />
            </label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span className="field-label">摘要（任意）</span>
              <input className="input" value={draft.memo} maxLength={200} placeholder="例: キャベツ 3玉（〇〇スーパー）" onChange={(e) => setDraft({ ...draft, memo: e.target.value })} />
            </label>
            <div className="row" style={{ gap: 12 }}>
              <button type="submit" className="btn btn-primary" disabled={!amountOk || !draft.entry_date || busy}>
                {editing ? '保存する' : '追加する'}
              </button>
              {editing && (
                <button
                  type="button"
                  className="btn btn-text"
                  onClick={() => {
                    setEditing(null)
                    setDraft(emptyDraft())
                  }}
                >
                  やめる
                </button>
              )}
            </div>
          </form>
          <p className="field-hint" style={{ marginTop: 12 }}>
            売上は注文から自動で数えるので、入力しないでください。「売上（補正）」は、注文に入らなかった売上や間違いを直すときだけ使います（減らすときは −500 のように入れます）。日付は、開催日ではなく、買った日・受け取った日です。
          </p>
          <Notice error={draft.amount && !amountOk ? '金額は 1〜10,000,000 円の整数で入れてください（売上の補正だけは負の金額も可）。' : error} ok={ok} />
        </Panel>
      )}

      <Panel title={`明細（${entries.length}件）`}>
        {!writable && <Notice error={error} />}
        <div className="table-wrap">
          <table className="table table-cards">
            <thead>
              <tr>
                <th>日付</th>
                <th>種別</th>
                <th>科目</th>
                <th>摘要</th>
                <th>入力者</th>
                <th className="num">金額</th>
                {writable && <th />}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={editing === e.id ? { background: 'rgba(134,123,169,.08)' } : undefined}>
                  <td className="mono cell-title">{e.entry_date}</td>
                  <td data-label="種別">{entryKindLabels[e.kind]}</td>
                  <td data-label="科目">{categoryLabels[e.kind][e.category] ?? e.category}</td>
                  <td data-label="摘要">{e.memo || '—'}</td>
                  <td data-label="入力者">{e.created_by_name ?? (e.created_by_role === 'staff' ? 'スタッフ' : '—')}</td>
                  <td className="num" data-label="金額">
                    {e.kind === 'expense' ? '−' : ''}
                    {e.amount < 0 ? `−${yen(-e.amount)}` : yen(e.amount)}
                  </td>
                  {writable && (
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button type="button" className="btn btn-text" onClick={() => edit(e)}>
                        直す
                      </button>
                      <button type="button" className="btn btn-text" onClick={() => void remove(e)}>
                        削除
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 && <p className="empty">まだ入力がありません</p>}
        </div>
      </Panel>
    </>
  )
}

/** 現金照合（レジ締め）。数えた現金から釣り銭準備金を引いた額と、注文の売上を比べる。 */
function CashCount({ sessionId, summary, writable }: { sessionId: number; summary: LedgerSummary; writable: boolean }) {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const cash = summary.cash
  const [form, setForm] = useState({
    counted: cash ? String(cash.counted_amount) : '',
    float: cash ? String(cash.float_amount) : '',
    note: cash?.note ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const counted = Number(form.counted)
  const float = Number(form.float || 0)
  const valid = form.counted !== '' && Number.isInteger(counted) && counted >= 0 && Number.isInteger(float) && float >= 0
  // 入力中の値での差額（保存前の目安）
  const diff = valid ? counted - float - summary.sales : null

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setError(null)
    setOk(null)
    try {
      await apiFetch('/api/manage/ledger/cash', {
        method: 'PUT',
        token,
        body: { session_id: sessionId, counted_amount: counted, float_amount: float, note: form.note },
      })
      setOk('保存しました。')
      void queryClient.invalidateQueries({ queryKey: ['manage', 'ledger', sessionId] })
    } catch (err) {
      setError(ledgerError(err))
    }
  }

  const diffText = (d: number) => (d === 0 ? '±0 円（合っています）' : `${d > 0 ? '+' : '−'}${yen(Math.abs(d))}（${d > 0 ? '多い' : '足りない'}）`)

  return (
    <Panel title="現金照合（レジ締め）">
      <p className="sub" style={{ fontSize: 13, marginBottom: 12 }}>
        数えた現金から釣り銭準備金を引いた額と、注文の売上 {yen(summary.sales)} を比べます。
      </p>
      <form className="form-grid" onSubmit={save}>
        <label className="field">
          <span className="field-label">数えた現金（円）</span>
          <input className="input" inputMode="numeric" value={form.counted} disabled={!writable} onChange={(e) => setForm({ ...form, counted: e.target.value.replace(/\D/g, '') })} />
        </label>
        <label className="field">
          <span className="field-label">釣り銭準備金（円）</span>
          <input className="input" inputMode="numeric" value={form.float} placeholder="0" disabled={!writable} onChange={(e) => setForm({ ...form, float: e.target.value.replace(/\D/g, '') })} />
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="field-label">メモ（任意）</span>
          <input className="input" value={form.note} maxLength={200} disabled={!writable} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
        {writable && (
          <button type="submit" className="btn btn-primary" disabled={!valid}>
            記録する
          </button>
        )}
      </form>
      <p style={{ marginTop: 16 }}>
        差額：<strong className="mono">{diff == null ? '—' : diffText(diff)}</strong>
        {cash && <span className="sub">（記録済み: {diffText(cash.difference)}）</span>}
      </p>
      <Notice error={error} ok={ok} />
    </Panel>
  )
}
