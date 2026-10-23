import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { LedgerExport } from '../../components/LedgerExport'
import { ApiError, apiFetch, errorMessage } from '../../lib/api'
import { yen } from '../../lib/format'
import {
  categoryLabel,
  entryKindLabels,
  sessionLabel,
  type EntryKind,
  type EventReport,
  type EventSession,
  type LedgerCategory,
  type LedgerEntry,
  type LedgerSummary,
} from '../../lib/ledger'
import { projectionText, toGoalText, type Outlook } from '../../lib/outlook'
import type { Receipt } from '../../lib/receipts'
import type { List } from '../../lib/types'
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
  // 収支報告は、回の本番の開催回をすべて合わせて出す（練習は含めない）
  const report = useQuery({
    queryKey: ['manage', 'ledger', 'report', session?.event_id],
    queryFn: () => apiFetch<EventReport>(`/api/manage/ledger/report?event_id=${session!.event_id}`, { token }),
    enabled: session != null,
    placeholderData: keepPreviousData,
  })
  // 表示名のため、無効な科目も読む（入力の選択肢は有効なものだけ）
  const categories = useQuery({
    queryKey: ['manage', 'ledger', 'categories'],
    queryFn: () => apiFetch<{ items: LedgerCategory[] }>('/api/manage/ledger/categories?all=1', { token }).then((r) => r.items),
  })
  const r = report.data?.summary

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
          {r && report.data && (
            <section className="stack" style={{ gap: 16 }}>
              <h2 className="panel-title" style={{ marginBottom: 0 }}>
                収支報告：{report.data.event_name}（本番の合計）
              </h2>
              <p className="sub" style={{ fontSize: 13 }}>
                本番の開催回（{report.data.sessions.map((x) => x.name).join('・') || 'まだありません'}）をすべて合わせた収支です。練習の開催回は含めません。どの日の開催回に登録した収支も、ここで合計されます。
              </p>
              <div className="stats">
                <Stat label="収入計" value={yen(r.income)} note={`うち売上 ${yen(r.sales)}（注文から自動）`} />
                <Stat label="支出計" value={yen(r.expense)} />
                <Stat label="差引" value={`${r.balance < 0 ? '−' : ''}${yen(Math.abs(r.balance))}`} note={r.balance < 0 ? '赤字' : r.balance > 0 ? '黒字' : ''} />
              </div>
              <Panel title="科目別の内訳（本番の合計）">
                <CategoryTable summary={r} />
              </Panel>
              <Panel title="目標と見込み（商品画面の上の表示）">
                <OutlookPanel eventId={report.data.event_id} />
              </Panel>
              <Panel title="学校に出す書類">
                <ExportPanel eventId={report.data.event_id} eventName={report.data.event_name} productionSessions={report.data.sessions.map((x) => x.id)} />
              </Panel>
            </section>
          )}

          <section className="stack" style={{ gap: 16 }}>
            <h2 className="panel-title" style={{ marginBottom: 0 }}>
              この開催回：{sessionLabel(session)}
            </h2>
            {session.kind === 'practice' && <p className="field-hint">練習の開催回です。本番の合計（収支報告）には含まれません。</p>}
            <div className="stats">
              <Stat label="売上（この日の注文）" value={yen(s.sales)} note={`${s.sales_orders}件`} />
              <Stat label="収入（この開催回）" value={yen(s.income)} />
              <Stat label="支出（この開催回）" value={yen(s.expense)} />
            </div>
          </section>

          {!writable && (
            <p className="field-hint">この開催回は、収支の受け付けを締め切りました（見ることはできます）。直したいときは運営に連絡してください。</p>
          )}
          {/* 開催回を切り替えたら、入力欄を空にする */}
          <Entries key={`e${session.id}`} sessionId={session.id} entries={ledger.data!.entries} writable={writable} categories={categories.data ?? []} />
          <CashCount key={`c${session.id}`} sessionId={session.id} summary={s} writable={writable} />
          <WasteRecord key={`w${session.id}`} session={session} writable={writable} />
        </div>
      )}
    </div>
  )
}

/** 科目別の内訳の表（売上の自動集計の行を先頭に）。 */
function CategoryTable({ summary: s }: { summary: LedgerSummary }) {
  return (
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
              <td>{c.label}</td>
              <td className="num">{c.amount < 0 ? `−${yen(-c.amount)}` : yen(c.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type Draft = { kind: EntryKind; category: string; amount: string; entry_date: string; memo: string }
const emptyDraft = (category = ''): Draft => ({ kind: 'expense', category, amount: '', entry_date: todayStr(), memo: '' })

/** 収支の入力欄と明細。 */
function Entries({
  sessionId,
  entries,
  writable,
  categories,
}: {
  sessionId: number
  entries: LedgerEntry[]
  writable: boolean
  categories: LedgerCategory[]
}) {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>(() => emptyDraft())
  // 入力に使える科目（有効なもの）。直している行の科目は、無効になっていても選べるように残す
  const choices = (kind: EntryKind) =>
    categories.filter((c) => c.kind === kind && (c.is_active || (editing != null && c.code === draft.category && kind === draft.kind)))
  // 科目が未選択（読み込み前など）なら、その種別の最初の科目
  const category = draft.category || choices(draft.kind)[0]?.code || ''
  const negativeOk = categories.find((c) => c.kind === draft.kind && c.code === category)?.allow_negative ?? false
  const [editing, setEditing] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['manage', 'ledger'] })
  const amount = Number(draft.amount)
  // 金額は整数（円）。負の金額（減らす補正）は、許した科目（売上の補正）だけ
  const amountOk = draft.amount.trim() !== '' && Number.isInteger(amount) && amount !== 0 && Math.abs(amount) <= 10_000_000 && (amount > 0 || negativeOk)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!amountOk || busy) return
    setBusy(true)
    setError(null)
    setOk(null)
    const body = { session_id: sessionId, kind: draft.kind, category, amount, entry_date: draft.entry_date, memo: draft.memo }
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
    const label = `${entry.entry_date} ${categoryLabel(categories, entry.kind, entry.category)} ${yen(entry.amount)}`
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
                  setDraft({ ...draft, kind, category: '' })
                }}
              >
                <option value="expense">支出</option>
                <option value="income">収入</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">科目</span>
              <select className="select" value={category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                {choices(draft.kind).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                    {c.is_active ? '' : '（無効）'}
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
          <Notice error={draft.amount && !amountOk ? '金額は 1〜10,000,000 円の整数で入れてください（負の金額は、売上の補正などの科目だけ）。' : error} ok={ok} />
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
                  <td data-label="科目">{categoryLabel(categories, e.kind, e.category)}</td>
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

/** 収支報告の Excel とレシートの画像の ZIP。確定していないレシートは入らないので、件数を知らせる。 */
function ExportPanel({ eventId, eventName, productionSessions }: { eventId: number; eventName: string; productionSessions: number[] }) {
  const { token } = useManage()
  const receipts = useQuery({
    queryKey: ['receipts', 'list', ''],
    queryFn: () => apiFetch<List<Receipt>>('/api/manage/receipts', { token }).then((r) => r.items),
  })
  const unconfirmed = (receipts.data ?? []).filter((x) => productionSessions.includes(x.session_id) && x.status !== 'confirmed').length
  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="sub" style={{ fontSize: 13 }}>
        Excel には、収支報告書・支出明細・売上明細（商品別・営業日別）が入ります。合計は数式なので、開いたあとに直しても計算し直されます。ZIP のレシートの画像は、支出明細のレシート番号の名前です。
      </p>
      {unconfirmed > 0 && <p className="receipt-dup">確定していないレシートが {unconfirmed} 件あります。確定するまで、Excel と ZIP には入りません。</p>}
      <LedgerExport token={token} eventId={eventId} name={eventName} />
    </div>
  )
}

/** 商品画面の上の表示（損益・あと何点・イベント終了時の見込み）の中身と、その前提。スマホでも読めるよう、ここにはっきり出す */
function OutlookPanel({ eventId }: { eventId: number }) {
  const { token } = useManage()
  const q = useQuery({
    queryKey: ['manage', 'ledger', 'outlook', eventId],
    queryFn: () => apiFetch<{ outlook: Outlook | null }>(`/api/manage/ledger/outlook?event_id=${eventId}`, { token }).then((r) => r.outlook),
  })
  const o = q.data
  return (
    <div className="stack" style={{ gap: 16 }}>
      {o && (
        <>
          <div className="stats">
            <Stat label="目標利益" value={o.target_profit > 0 ? yen(o.target_profit) : '¥0（黒字）'} note={o.shortfall > 0 ? `あと ${yen(o.shortfall)}` : '届いています'} />
            <Stat
              label="平均単価（1点あたり）"
              value={o.average_unit_price != null ? yen(o.average_unit_price) : '—'}
              note="本番の売上 ÷ 販売数量（ハーフ・トッピングも実績のまま）"
            />
            <Stat
              label="目標まであと"
              value={o.units_to_target != null ? `約${o.units_to_target.toLocaleString('ja-JP')}点` : o.shortfall === 0 ? '0点' : '—'}
              note={toGoalText(o)}
            />
          </div>
          <p className={`outlook-forecast ${o.final ? 'outlook-final' : ''}`} style={{ fontSize: 14 }}>
            {projectionText(o)}
          </p>
          <p className="field-hint">
            見込みは、今後の支出がない前提で計算しています。今日の残りは直近1時間の売上のペース、これからの日は前の日の時間帯ごとの売上から見積もります（本番の開催回の営業時間が必要です）。
          </p>
        </>
      )}
      <TargetProfit />
    </div>
  )
}

/** 目標利益（商品画面の「あと何点」に使う。0 円なら黒字が目標） */
function TargetProfit() {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const settings = useQuery({
    queryKey: ['manage', 'ledger', 'settings'],
    queryFn: () => apiFetch<{ target_profit: number }>('/api/manage/ledger/settings', { token }),
  })
  const [draft, setDraft] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({})
  const value = draft ?? String(settings.data?.target_profit ?? '')
  const n = Number(value)
  const valid = value !== '' && Number.isInteger(n) && n >= 0 && n <= 10_000_000

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setMsg({})
    try {
      await apiFetch('/api/manage/ledger/settings', { method: 'PUT', token, body: { target_profit: n } })
      setDraft(null)
      void queryClient.invalidateQueries({ queryKey: ['manage', 'ledger'] })
      setMsg({ ok: '保存しました。' })
    } catch (err) {
      setMsg({ error: errorMessage(err) })
    }
  }

  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={save}>
      <p className="sub" style={{ fontSize: 13 }}>商品画面の上の「あと何点」は、この金額の利益（本番の合計）に届くまでの販売数量です。0 円なら黒字が目標です。</p>
      <div className="row">
        <label className="field">
          <span className="field-label">目標利益（円）</span>
          <input className="input mono" inputMode="numeric" value={value} onChange={(e) => setDraft(e.target.value.trim())} />
        </label>
        <button type="submit" className="btn btn-secondary" disabled={!valid || draft === null}>
          保存
        </button>
      </div>
      <Notice error={msg.error} ok={msg.ok} />
    </form>
  )
}

type Waste = { session_id: number; amount: number | null; memo: string }

/** 廃棄（その開催回で余った食材の金額）。支出はもう計上しているので収支には足さず、売上の画面のロスに出す */
function WasteRecord({ session, writable }: { session: EventSession; writable: boolean }) {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const list = useQuery({
    queryKey: ['manage', 'ledger', 'waste', session.event_id],
    queryFn: () => apiFetch<List<Waste>>(`/api/manage/ledger/waste?event_id=${session.event_id}`, { token }).then((r) => r.items),
  })
  const saved = list.data?.find((w) => w.session_id === session.id)
  const [draft, setDraft] = useState<{ amount: string; memo: string } | null>(null)
  const form = draft ?? { amount: saved?.amount != null ? String(saved.amount) : '', memo: saved?.memo ?? '' }
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({})
  const amount = Number(form.amount)
  const valid = form.amount !== '' && Number.isInteger(amount) && amount >= 0 && amount <= 10_000_000

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setMsg({})
    try {
      await apiFetch('/api/manage/ledger/waste', { method: 'PUT', token, body: { session_id: session.id, amount, memo: form.memo.trim() } })
      setDraft(null)
      setMsg({ ok: '保存しました。' })
      void queryClient.invalidateQueries({ queryKey: ['manage', 'ledger', 'waste'] })
      void queryClient.invalidateQueries({ queryKey: ['sales'] })
    } catch (err) {
      setMsg({ error: ledgerError(err) })
    }
  }

  return (
    <Panel title="廃棄（余った食材）">
      <p className="sub" style={{ fontSize: 13, marginBottom: 12 }}>
        この開催回で余って使えなかった食材の金額（買ったときの値段）を入れます。支出はもう計上しているので収支には足さず、売上の画面の「ロス」に出します。
      </p>
      <form className="form-grid" onSubmit={save}>
        <label className="field">
          <span className="field-label">金額（円）</span>
          <input className="input mono" inputMode="numeric" value={form.amount} disabled={!writable} onChange={(e) => setDraft({ ...form, amount: e.target.value.replace(/\D/g, '') })} />
        </label>
        <label className="field">
          <span className="field-label">メモ（任意）</span>
          <input className="input" value={form.memo} maxLength={200} placeholder="例: キャベツ半玉・麺 3玉" disabled={!writable} onChange={(e) => setDraft({ ...form, memo: e.target.value })} />
        </label>
        {writable && (
          <button type="submit" className="btn btn-secondary" disabled={!valid || draft === null}>
            記録する
          </button>
        )}
      </form>
      <Notice error={msg.error} ok={msg.ok} />
    </Panel>
  )
}
