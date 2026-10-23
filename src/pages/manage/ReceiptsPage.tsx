import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { OcrText, ReceiptCard, ReceiptImage, ReceiptSearchForm } from '../../components/ReceiptSearch'
import { ReceiptUploader } from '../../components/ReceiptUploader'
import { Sheet } from '../../components/Sheet'
import { ApiError, apiFetch, errorMessage } from '../../lib/api'
import { mdhm, yen } from '../../lib/format'
import { categoryLabel, type EventSession, type LedgerCategory } from '../../lib/ledger'
import { emptyQuery, keywordsOf, toParams, type ReceiptQuery } from '../../lib/receiptSearch'
import {
  receiptNo,
  refetchWhileReading,
  useAuthImage,
  type Receipt,
  type ReceiptItem,
  type UploadResult,
} from '../../lib/receipts'
import type { List } from '../../lib/types'
import { Notice, PageHead, Panel } from './common'
import { useManage } from './context'

/** 店長: レシートの登録・検索・確認と確定（確定すると収支の支出に登録する）と、照合チェック。 */
export function ReceiptsPage() {
  const { token } = useManage()
  const sessions = useQuery({
    queryKey: ['manage', 'ledger', 'sessions'],
    queryFn: () => apiFetch<{ items: EventSession[]; default_session_id: number | null; default_event_id: number | null }>('/api/manage/ledger/sessions', { token }),
  })
  const categories = useQuery({
    queryKey: ['manage', 'ledger', 'categories'],
    queryFn: () => apiFetch<{ items: LedgerCategory[] }>('/api/manage/ledger/categories?all=1', { token }).then((r) => r.items),
  })
  const [query, setQuery] = useState<ReceiptQuery>(emptyQuery)
  const [selected, setSelected] = useState<number | null>(null)
  // 今回の開催（収支の画面の既定と同じ: 今日に最も近い受付中の開催回の回）
  const currentEventId = sessions.data?.default_event_id
  const params = toParams(query, currentEventId)
  const list = useQuery({
    queryKey: ['receipts', 'list', params.toString()],
    queryFn: () => apiFetch<List<Receipt>>(`/api/manage/receipts?${params}`, { token }).then((r) => r.items),
    enabled: sessions.isSuccess, // 今回の開催がわかってから探す
    placeholderData: keepPreviousData,
    // 読み取りの途中のものがあれば、終わるまで読み直す
    refetchInterval: (q) => refetchWhileReading(q.state.data),
  })
  const keywords = keywordsOf(query.q)
  // 照合チェックも今回の開催
  const items = sessions.data?.items ?? []
  const eventId = currentEventId ?? items[0]?.event_id
  const events = [...new Map(items.map((s) => [s.event_id, { id: s.event_id, name: s.event_name }])).values()]

  return (
    <div className="mpage">
      <PageHead title="レシート" />
      <Panel title="レシートを登録">
        <ReceiptUploader token={token} base="/api/manage" />
      </Panel>

      <Panel title="レシートを探す">
        <ReceiptSearchForm sessions={items} events={events} currentEventId={currentEventId} categories={categories.data ?? []} onSearch={setQuery} />
        {list.error && <p className="error-text">{errorMessage(list.error)}</p>}
        <p className="sub" style={{ fontSize: 13, marginTop: 16 }}>
          {list.data ? `${list.data.length}${list.data.length >= 100 ? '件以上（新しい100件）' : '件'}` : ''}
        </p>
        <div className="receipt-cards" style={{ marginTop: 8 }}>
          {list.data?.map((r) => <ReceiptCard key={r.id} receipt={r} token={token} base="/api/manage" onOpen={() => setSelected(r.id)} />)}
        </div>
        {list.data?.length === 0 && <p className="empty">見つかりませんでした</p>}
      </Panel>

      {eventId != null && <Checks eventId={eventId} categories={categories.data ?? []} onOpen={setSelected} />}

      {selected && <ReceiptDetail id={selected} keywords={keywords} onClose={() => setSelected(null)} />}
    </div>
  )
}

type UnlinkedExpense = {
  id: number
  session_name: string
  session_kind: 'practice' | 'production'
  category: string
  category_label: string
  amount: number
  entry_date: string
  memo: string
}

/** 照合チェック: 確定していないレシートと、レシートを結んでいない支出 */
function Checks({ eventId, categories, onOpen }: { eventId: number; categories: LedgerCategory[]; onOpen: (id: number) => void }) {
  const { token } = useManage()
  const checks = useQuery({
    queryKey: ['receipts', 'checks', eventId],
    queryFn: () =>
      apiFetch<{ unconfirmed_receipts: Receipt[]; unlinked_expenses: UnlinkedExpense[] }>(`/api/manage/ledger/checks?event_id=${eventId}`, { token }),
  })
  const c = checks.data
  return (
    <Panel title="照合チェック">
      {checks.error && <p className="error-text">{errorMessage(checks.error)}</p>}
      {c && (
        <div className="stack" style={{ gap: 20 }}>
          <section className="stack" style={{ gap: 8 }}>
            <h4 className="field-label">確定していないレシート（{c.unconfirmed_receipts.length}件）</h4>
            {c.unconfirmed_receipts.length === 0 ? (
              <p className="sub" style={{ fontSize: 13 }}>ありません。</p>
            ) : (
              <>
                <p className="sub" style={{ fontSize: 13 }}>確定するまで、収支にも学校に出す書類にも入りません。</p>
                <div className="receipt-cards">
                  {c.unconfirmed_receipts.map((r) => (
                    <ReceiptCard key={r.id} receipt={r} token={token} base="/api/manage" onOpen={() => onOpen(r.id)} />
                  ))}
                </div>
              </>
            )}
          </section>
          <section className="stack" style={{ gap: 8 }}>
            <h4 className="field-label">レシートを結んでいない支出（{c.unlinked_expenses.length}件）</h4>
            {c.unlinked_expenses.length === 0 ? (
              <p className="sub" style={{ fontSize: 13 }}>ありません。</p>
            ) : (
              <>
                <p className="sub" style={{ fontSize: 13 }}>
                  手で入力した支出です。レシートがあるときは、レシートを登録して確定し、手入力の分は「収支」で消してください（二重に数えないため）。
                </p>
                <div className="table-wrap">
                  <table className="table table-cards">
                    <thead>
                      <tr>
                        <th>日付</th>
                        <th>開催回</th>
                        <th>科目</th>
                        <th className="num">金額</th>
                        <th>摘要</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.unlinked_expenses.map((e) => (
                        <tr key={e.id}>
                          <td className="mono cell-title">{e.entry_date}</td>
                          <td data-label="開催回">
                            {e.session_name}
                            {e.session_kind === 'practice' && <span className="tag"> 練習</span>}
                          </td>
                          <td data-label="科目">{e.category_label || categoryLabel(categories, 'expense', e.category)}</td>
                          <td className="num mono" data-label="金額">
                            {yen(e.amount)}
                          </td>
                          <td data-label="摘要">{e.memo || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </Panel>
  )
}

type LineDraft = { tax_rate: number | null; category: string; amount: string; basis: string; suggested: string | null }
type ItemDraft = { name: string; quantity: string; amount: string; tax_rate: number | null; category: string | null }
type Draft = { store_name: string; purchase_date: string; total: string; memo: string; lines: LineDraft[]; items: ItemDraft[] }

const rateLabel = (rate: number | null) => (rate == null ? '税率不明' : `${rate}%`)

/** レシートの確認と確定。画像と読み取りの結果を並べ、店長が直して確定する（AI・OCR の結果だけでは確定しない）。 */
function ReceiptDetail({ id, keywords, onClose }: { id: number; keywords: string[]; onClose: () => void }) {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const detail = useQuery({
    queryKey: ['receipts', 'detail', id],
    queryFn: () => apiFetch<UploadResult>(`/api/manage/receipts/${id}/status`, { token }),
    // 裏で読み取っている間は、終わるまで読み直す
    refetchInterval: (q) => (q.state.data?.ocr_state === 'reading' ? 2000 : false),
  })
  const categories = useQuery({
    queryKey: ['manage', 'ledger', 'categories'],
    queryFn: () => apiFetch<{ items: LedgerCategory[] }>('/api/manage/ledger/categories?all=1', { token }).then((r) => r.items),
  })
  const image = useAuthImage(`/api/manage/receipts/${id}/image`, token)
  const r = detail.data?.receipt
  // 確定したレシートを直しているところか。saved は直したあとのお知らせ
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['receipts'] })
    void queryClient.invalidateQueries({ queryKey: ['manage', 'ledger'] })
  }
  // 消したレシートは読み直さない（404 になる）
  const deleted = () => {
    onClose()
    queryClient.removeQueries({ queryKey: ['receipts', 'detail', id] })
    refresh()
  }

  return (
    <Sheet title={`レシート ${receiptNo(id)}`} onClose={onClose} wide>
      {!r ? (
        <p className="empty">{detail.error ? errorMessage(detail.error) : '読み込んでいます…'}</p>
      ) : (
        <div className="receipt-detail">
          <ReceiptImage src={image} alt={`${receiptNo(id)} の写真`} />
          <div className="stack" style={{ gap: 16 }}>
            <p className="receipt-session">
              開催回：<strong>{r.session_name}</strong>　<span className="sub">登録 {mdhm(r.created_at)}・{r.uploaded_by_name ?? (r.uploaded_by_role === 'staff' ? 'スタッフ' : '—')}</span>
            </p>
            {detail.data!.duplicates.length > 0 && (
              <p className="receipt-dup">同じレシートかもしれないものがあります：{detail.data!.duplicates.map(receiptNo).join('、')}</p>
            )}
            {r.status === 'confirmed' && !editing ? (
              <Confirmed
                receipt={r}
                categories={categories.data ?? []}
                saved={saved}
                onEdit={() => {
                  setSaved(null)
                  setEditing(true)
                }}
                onDeleted={deleted}
              />
            ) : (
              <ConfirmForm
                key={`${r.id}-${r.ocr_attempts}-${r.status}`}
                receipt={r}
                editing={r.status === 'confirmed'}
                reading={detail.data?.ocr_state === 'reading'}
                categories={(categories.data ?? []).filter((c) => c.kind === 'expense' && c.is_active)}
                onDone={() => {
                  refresh()
                  if (r.status === 'confirmed') {
                    setEditing(false)
                    setSaved('直した内容で保存し、収支の支出を作り直しました。')
                  }
                }}
                onCancel={() => setEditing(false)}
                onDeleted={deleted}
              />
            )}
            {r.ocr && r.ocr.lines.length > 0 && (
              <details open={keywords.length > 0}>
                <summary className="field-label">読み取った文字（{r.ocr.lines.length}行）</summary>
                <OcrText lines={r.ocr.lines} keywords={keywords} />
              </details>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}

function Confirmed({
  receipt: r,
  categories,
  saved,
  onEdit,
  onDeleted,
}: {
  receipt: Receipt
  categories: LedgerCategory[]
  saved: string | null
  onEdit: () => void
  onDeleted: () => void
}) {
  const { token } = useManage()
  const label = (code: string) => categoryLabel(categories, 'expense', code)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const entries = Math.max(r.breakdown.length, 1)
  const remove = () => {
    if (!window.confirm(`${receiptNo(r.id)} を削除しますか？\n収支に登録した支出（${entries}件・${r.total != null ? yen(r.total) : ''}）も一緒に消えます。`)) return
    setBusy(true)
    setError(null)
    apiFetch(`/api/manage/receipts/${r.id}`, { method: 'DELETE', token })
      .then(onDeleted)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false))
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p>
        <span className="tag">確定済み</span> {r.confirmed_at && mdhm(r.confirmed_at)}
      </p>
      <dl className="receipt-result-fields">
        <dt>店名</dt>
        <dd>{r.store_name}</dd>
        <dt>購入日</dt>
        <dd className="mono">{r.purchase_date}</dd>
        <dt>合計</dt>
        <dd className="mono">{r.total != null ? yen(r.total) : '—'}</dd>
        {r.memo && (
          <>
            <dt>摘要</dt>
            <dd>{r.memo}</dd>
          </>
        )}
        <dt>科目</dt>
        <dd>
          {r.breakdown.length > 1
            ? r.breakdown.map((b) => `${label(b.category)} ${yen(b.amount)}（${rateLabel(b.tax_rate)}）`).join('、')
            : r.category && label(r.category)}
        </dd>
      </dl>
      {r.items.length > 0 && (
        <ul className="receipt-items">
          {r.items.map((it, i) => (
            <li key={i}>
              {it.name}
              {it.quantity != null && it.quantity > 1 && ` ×${it.quantity}`} <span className="mono">{yen(it.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="field-hint">収支の支出に登録しました。間違いに気づいたら、ここで直すか削除してください（収支の支出も一緒に変わります）。</p>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={busy} onClick={onEdit}>
          内容を直す
        </button>
        <button type="button" className="btn btn-text" disabled={busy} onClick={remove}>
          削除
        </button>
      </div>
      <Notice error={error} ok={saved} />
    </div>
  )
}

/** 下書き（読み取った行から作ったもの）を、画面の入力の形にする。科目マスタにない科目は未選択にする */
function initialDraft(r: Receipt, categories: LedgerCategory[]): Draft {
  const known = (code: string | null | undefined) => (code && categories.some((c) => c.code === code) ? code : '')
  const total = r.ocr?.total != null ? String(r.ocr.total) : ''
  const lines: LineDraft[] = (r.draft?.lines ?? []).map((l) => ({
    tax_rate: l.tax_rate,
    category: known(l.category),
    amount: String(l.amount),
    basis: l.basis,
    suggested: known(l.suggested) || null,
  }))
  return {
    store_name: r.ocr?.store_name ?? '',
    purchase_date: r.ocr?.purchase_date ?? '',
    total,
    memo: '',
    lines: lines.length > 0 ? lines : [{ tax_rate: null, category: '', amount: total, basis: '', suggested: null }],
    items: (r.draft?.items ?? []).map((it) => ({
      name: it.name,
      quantity: String(it.quantity),
      amount: String(it.amount),
      tax_rate: it.tax_rate ?? null,
      category: it.category ?? null,
    })),
  }
}

/** 確定した内容を、画面の入力の形にする（直すとき）。いま使えない科目は未選択にする */
function confirmedDraft(r: Receipt, categories: LedgerCategory[]): Draft {
  const known = (code: string | null | undefined) => (code && categories.some((c) => c.code === code) ? code : '')
  const total = r.total != null ? String(r.total) : ''
  const lines = r.breakdown.length > 0 ? r.breakdown : [{ tax_rate: null, category: r.category ?? '', amount: r.total ?? 0 }]
  return {
    store_name: r.store_name ?? '',
    purchase_date: r.purchase_date ?? '',
    total,
    memo: r.memo ?? '',
    lines: lines.map((l) => ({ tax_rate: l.tax_rate, category: known(l.category), amount: String(l.amount), basis: '', suggested: null })),
    items: r.items.map((it) => ({
      name: it.name,
      quantity: it.quantity != null ? String(it.quantity) : '',
      amount: String(it.amount),
      tax_rate: it.tax_rate ?? null,
      category: it.category ?? null,
    })),
  }
}

function ConfirmForm({
  receipt: r,
  editing,
  reading,
  categories,
  onDone,
  onCancel,
  onDeleted,
}: {
  receipt: Receipt
  /** 確定したレシートを直している（確定した内容から始め、保存すると収支の支出を作り直す） */
  editing: boolean
  /** 裏で読み取っている（終わると読み取った内容で作り直す） */
  reading: boolean
  categories: LedgerCategory[]
  onDone: () => void
  onCancel: () => void
  onDeleted: () => void
}) {
  const { token } = useManage()
  // 読み取った内容と、税率ごとの支出の下書きを入れておく（必ず人が確かめて直してから確定する）
  const [draft, setDraft] = useState<Draft>(() => (editing ? confirmedDraft(r, categories) : initialDraft(r, categories)))
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const total = Number(draft.total)
  const totalOk = draft.total !== '' && Number.isInteger(total) && total >= 1 && total <= 10_000_000
  const sum = draft.lines.reduce((a, l) => a + (Number(l.amount) || 0), 0)
  const linesOk = draft.lines.every((l) => l.category !== '' && /^\d+$/.test(l.amount) && Number(l.amount) >= 1)
  const valid = draft.store_name.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(draft.purchase_date) && totalOk && linesOk && sum === total
  const problem = !draft.total
    ? null
    : !totalOk
      ? '合計は 1〜10,000,000 円で入れてください。'
      : draft.lines.some((l) => l.category === '')
        ? '科目を選んでいない行があります（税率が読めなかった分など）。'
        : !linesOk
          ? '内訳の金額を入れてください。'
          : sum !== total
            ? `内訳の合計 ${yen(sum)} が、合計 ${yen(total)} と合いません。`
            : draft.store_name.trim() === '' || !/^\d{4}-\d{2}-\d{2}$/.test(draft.purchase_date)
              ? '店名と購入日を入れてください。'
              : null
  const setLine = (i: number, patch: Partial<LineDraft>) => setDraft({ ...draft, lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const setItem = (i: number, patch: Partial<ItemDraft>) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  const setTotal = (value: string) => {
    // 内訳が1行で、合計と同じ（か空）なら、合計に合わせる
    const only = draft.lines.length === 1 && (draft.lines[0].amount === draft.total || draft.lines[0].amount === '')
    setDraft({ ...draft, total: value, lines: only ? [{ ...draft.lines[0], amount: value }] : draft.lines })
  }

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      await fn()
      setOk(done)
      onDone()
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'session_closed' ? 'この開催回は、収支の受け付けを締め切りました。' : errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const confirm = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    // 品目は参考（名前のないものは送らない）
    const items: ReceiptItem[] = draft.items
      .filter((it) => it.name.trim())
      .map((it) => {
        const q = Number(it.quantity)
        return {
          name: it.name.trim().slice(0, 100),
          amount: Number(it.amount) || 0,
          ...(Number.isInteger(q) && q >= 1 && q <= 9999 ? { quantity: q } : {}),
          ...(it.tax_rate != null ? { tax_rate: it.tax_rate } : {}),
          ...(it.category ? { category: it.category } : {}),
        }
      })
    const lines = draft.lines.map((l) => ({ tax_rate: l.tax_rate, category: l.category, amount: Number(l.amount) }))
    const body = { store_name: draft.store_name.trim(), purchase_date: draft.purchase_date, total, lines, memo: draft.memo.trim(), items }
    void run(
      () =>
        editing
          ? apiFetch(`/api/manage/receipts/${r.id}`, { method: 'PUT', token, body })
          : apiFetch(`/api/manage/receipts/${r.id}/confirm`, { method: 'POST', token, body }),
      '確定し、収支の支出に登録しました。',
    )
  }

  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={confirm}>
      <p className={r.status === 'ocr_failed' ? 'receipt-dup' : 'field-hint'}>
        {editing && '確定した内容を直しています。保存すると、このレシートの収支の支出を、この内訳で作り直します（収支の明細で直した分も、この内容に置き換わります）。'}
        {r.status === 'ocr_failed' && '合計を読み取れませんでした。写真を見ながら入力するか、撮り直してください。'}
        {r.status === 'uploaded' && reading && '読み取り中です（15秒ほどかかります）。終わると、ここに読み取った内容が入ります。'}
        {r.status === 'uploaded' && !reading && (r.ocr_error ? '読み取りは後で行います（まだ読み取れていません）。手で入力して確定もできます。' : '読み取りをしていません。写真を見ながら入力してください。')}
        {(r.status === 'ocr_done' || r.status === 'llm_done') && '読み取った内容です。写真と見比べて、違うところを直してから確定してください。'}
      </p>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">店名（購入先）</span>
          <input className="input" value={draft.store_name} maxLength={100} onChange={(e) => setDraft({ ...draft, store_name: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">購入日</span>
          <input className="input" type="date" value={draft.purchase_date} onChange={(e) => setDraft({ ...draft, purchase_date: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">合計（円）</span>
          <input className="input" inputMode="numeric" value={draft.total} onChange={(e) => setTotal(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="field-label">摘要（任意）</span>
          <input className="input" value={draft.memo} maxLength={100} placeholder="例: お好み焼きの材料" onChange={(e) => setDraft({ ...draft, memo: e.target.value })} />
        </label>
      </div>

      <fieldset className="receipt-lines">
        <legend className="field-label">支出の内訳（税率ごと）</legend>
        <p className="field-hint">
          {editing
            ? '写真と見比べて、科目と金額を直してください（行ごとに収支の支出になります）。'
            : '8% の分は食材、10% の分は消耗品にしてあります。写真と見比べて、科目と金額を確かめてください（行ごとに収支の支出になります）。'}
        </p>
        {!editing && r.draft?.mismatch && <p className="receipt-dup">読み取った税率ごとの金額の和が、合計と合いません。写真と見比べて直してください。</p>}
        {draft.lines.map((l, i) => (
          <div key={i} className="receipt-line">
            <select className="select" value={l.tax_rate ?? ''} aria-label={`内訳${i + 1}の税率`} onChange={(e) => setLine(i, { tax_rate: e.target.value ? Number(e.target.value) : null })}>
              <option value="8">8%</option>
              <option value="10">10%</option>
              <option value="">不明</option>
            </select>
            <select className="select" value={l.category} aria-label={`内訳${i + 1}の科目`} onChange={(e) => setLine(i, { category: e.target.value })}>
              <option value="">未選択</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              className="input mono"
              inputMode="numeric"
              value={l.amount}
              placeholder="金額"
              aria-label={`内訳${i + 1}の金額`}
              onChange={(e) => setLine(i, { amount: e.target.value.replace(/\D/g, '') })}
            />
            {(l.basis || l.suggested || draft.lines.length > 1) && (
              <span className="receipt-line-basis">
                {l.basis}
                {l.suggested && l.category === '' && (
                  <button type="button" className="btn btn-text" onClick={() => setLine(i, { category: l.suggested! })}>
                    候補「{categoryLabel(categories, 'expense', l.suggested)}」にする
                  </button>
                )}
                {draft.lines.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-text receipt-line-remove"
                    onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, j) => j !== i) })}
                  >
                    この行を外す
                  </button>
                )}
              </span>
            )}
          </div>
        ))}
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-text"
            onClick={() =>
              setDraft({
                ...draft,
                lines: [...draft.lines, { tax_rate: null, category: '', amount: totalOk && total > sum ? String(total - sum) : '', basis: '', suggested: null }],
              })
            }
          >
            ＋ 行を足す（科目を分ける）
          </button>
          <span className={`mono ${totalOk && sum !== total ? 'error-text' : 'sub'}`}>内訳の合計 {yen(sum)}</span>
        </div>
      </fieldset>

      <details>
        <summary className="field-label">品目（参考・任意・{draft.items.length}件）</summary>
        <p className="field-hint" style={{ marginTop: 8 }}>
          読み取った品目です。間違っていても確定できます（直すと、あとで検索しやすくなります）。
        </p>
        <div className="stack" style={{ gap: 8, marginTop: 8 }}>
          {draft.items.map((it, i) => (
            <div key={i} className="row" style={{ gap: 8 }}>
              <input className="input" style={{ flex: 1 }} value={it.name} placeholder="品名" aria-label={`品目${i + 1}の品名`} onChange={(e) => setItem(i, { name: e.target.value })} />
              <input
                className="input mono"
                style={{ width: 56 }}
                inputMode="numeric"
                value={it.quantity}
                placeholder="数"
                aria-label={`品目${i + 1}の数量`}
                onChange={(e) => setItem(i, { quantity: e.target.value.replace(/\D/g, '') })}
              />
              <input
                className="input mono"
                style={{ width: 96 }}
                inputMode="numeric"
                value={it.amount}
                placeholder="金額"
                aria-label={`品目${i + 1}の金額`}
                onChange={(e) => setItem(i, { amount: e.target.value.replace(/[^\d-]/g, '') })}
              />
              <button type="button" className="btn btn-text" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}>
                外す
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-text"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setDraft({ ...draft, items: [...draft.items, { name: '', quantity: '1', amount: '', tax_rate: null, category: null }] })}
          >
            ＋ 品目を足す
          </button>
        </div>
      </details>

      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
          {editing ? '直した内容で保存' : '確定して収支に登録'}
        </button>
        {editing && (
          <button type="button" className="btn btn-text" disabled={busy} onClick={onCancel}>
            やめる
          </button>
        )}
        {!editing && (
          <>
            <button type="button" className="btn btn-text" disabled={busy} onClick={() => void run(() => apiFetch(`/api/manage/receipts/${r.id}/ocr`, { method: 'POST', token }), '読み取り直しました。')}>
              読み取り直す
            </button>
            <button
              type="button"
              className="btn btn-text"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(`${receiptNo(r.id)} を削除しますか？（撮り直すときなど）`)) return
                setBusy(true)
                apiFetch(`/api/manage/receipts/${r.id}`, { method: 'DELETE', token })
                  .then(onDeleted)
                  .catch((e) => setError(errorMessage(e)))
                  .finally(() => setBusy(false))
              }}
            >
              削除
            </button>
          </>
        )}
      </div>
      <Notice error={error ?? problem} ok={ok} />
    </form>
  )
}
