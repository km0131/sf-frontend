import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { ReceiptUploader } from '../../components/ReceiptUploader'
import { Sheet } from '../../components/Sheet'
import { ApiError, apiFetch, errorMessage } from '../../lib/api'
import { mdhm, yen } from '../../lib/format'
import { sessionLabel, type EventSession, type LedgerCategory } from '../../lib/ledger'
import { receiptNo, statusLabels, useAuthImage, type Receipt, type ReceiptItem, type ReceiptStatus } from '../../lib/receipts'
import type { List } from '../../lib/types'
import { Notice, PageHead, Panel } from './common'
import { useManage } from './context'

/** 店長: レシートの登録・一覧・確認と確定（確定すると収支の支出に登録する）。 */
export function ReceiptsPage() {
  const { token } = useManage()
  const sessions = useQuery({
    queryKey: ['manage', 'ledger', 'sessions'],
    queryFn: () => apiFetch<{ items: EventSession[] }>('/api/manage/ledger/sessions', { token }).then((r) => r.items),
  })
  const [sessionId, setSessionId] = useState('')
  const [status, setStatus] = useState<'' | ReceiptStatus>('')
  const [selected, setSelected] = useState<number | null>(null)
  const params = new URLSearchParams()
  if (sessionId) params.set('session_id', sessionId)
  if (status) params.set('status', status)
  const list = useQuery({
    queryKey: ['receipts', 'list', params.toString()],
    queryFn: () => apiFetch<List<Receipt>>(`/api/manage/receipts?${params}`, { token }).then((r) => r.items),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="mpage">
      <PageHead title="レシート" />
      <Panel title="レシートを登録">
        <ReceiptUploader token={token} base="/api/manage" />
      </Panel>

      <Panel title="レシートの一覧">
        <div className="form-grid">
          <label className="field">
            <span className="field-label">開催回</span>
            <select className="select" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">すべて</option>
              {sessions.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {sessionLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">状態</span>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as '' | ReceiptStatus)}>
              <option value="">すべて</option>
              {Object.entries(statusLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        {list.error && <p className="error-text">{errorMessage(list.error)}</p>}
        <div className="receipt-cards" style={{ marginTop: 16 }}>
          {list.data?.map((r) => <ReceiptCard key={r.id} receipt={r} token={token} onOpen={() => setSelected(r.id)} />)}
        </div>
        {list.data?.length === 0 && <p className="empty">レシートはありません</p>}
      </Panel>

      {selected && <ReceiptDetail id={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function ReceiptCard({ receipt: r, token, onOpen }: { receipt: Receipt; token: string; onOpen: () => void }) {
  const thumb = useAuthImage(`/api/manage/receipts/${r.id}/thumb`, token)
  const total = r.total ?? r.ocr?.total ?? null
  const store = r.store_name ?? r.ocr?.store_name ?? null
  return (
    <button type="button" className="receipt-card receipt-card-button" onClick={onOpen}>
      {thumb ? <img src={thumb} alt="" /> : <span className="receipt-thumb-empty" aria-hidden="true" />}
      <span className="stack" style={{ gap: 2, textAlign: 'left' }}>
        <span className="mono">{receiptNo(r.id)}</span>
        <strong className="receipt-card-session">{r.session_name}</strong>
        <span>{store ?? '店名 —'}</span>
        <span className="mono">{total != null ? yen(total) : '—'}</span>
        <span className={`tag ${r.status === 'confirmed' ? '' : 'tag-strong'}`}>{statusLabels[r.status]}</span>
      </span>
    </button>
  )
}

type Draft = { store_name: string; purchase_date: string; total: string; category: string; memo: string; items: { name: string; amount: string }[] }

/** レシートの確認と確定。画像と読み取りの結果を並べ、店長が直して確定する（AI・OCR の結果だけでは確定しない）。 */
function ReceiptDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { token } = useManage()
  const queryClient = useQueryClient()
  const detail = useQuery({
    queryKey: ['receipts', 'detail', id],
    queryFn: () => apiFetch<{ receipt: Receipt; duplicates: number[] }>(`/api/manage/receipts/${id}`, { token }),
  })
  const categories = useQuery({
    queryKey: ['manage', 'ledger', 'categories'],
    queryFn: () => apiFetch<{ items: LedgerCategory[] }>('/api/manage/ledger/categories?all=1', { token }).then((r) => r.items),
  })
  const image = useAuthImage(`/api/manage/receipts/${id}/image`, token)
  const r = detail.data?.receipt

  return (
    <Sheet title={`レシート ${receiptNo(id)}`} onClose={onClose} wide>
      {!r ? (
        <p className="empty">{detail.error ? errorMessage(detail.error) : '読み込んでいます…'}</p>
      ) : (
        <div className="receipt-detail">
          <div className="receipt-image">{image ? <img src={image} alt={`${receiptNo(id)} の写真`} /> : <span className="receipt-thumb-empty" />}</div>
          <div className="stack" style={{ gap: 16 }}>
            <p className="receipt-session">
              開催回：<strong>{r.session_name}</strong>　<span className="sub">登録 {mdhm(r.created_at)}・{r.uploaded_by_name ?? (r.uploaded_by_role === 'staff' ? 'スタッフ' : '—')}</span>
            </p>
            {detail.data!.duplicates.length > 0 && (
              <p className="receipt-dup">同じレシートかもしれないものがあります：{detail.data!.duplicates.map(receiptNo).join('、')}</p>
            )}
            {r.status === 'confirmed' ? (
              <Confirmed receipt={r} categories={categories.data ?? []} />
            ) : (
              <ConfirmForm
                key={`${r.id}-${r.ocr_attempts}`}
                receipt={r}
                categories={(categories.data ?? []).filter((c) => c.kind === 'expense' && c.is_active)}
                onDone={() => {
                  void queryClient.invalidateQueries({ queryKey: ['receipts'] })
                  void queryClient.invalidateQueries({ queryKey: ['manage', 'ledger'] })
                }}
                onDeleted={() => {
                  void queryClient.invalidateQueries({ queryKey: ['receipts'] })
                  onClose()
                }}
              />
            )}
            {r.ocr && r.ocr.lines.length > 0 && (
              <details>
                <summary className="field-label">読み取った文字（{r.ocr.lines.length}行）</summary>
                <pre className="receipt-ocr-text">{r.ocr.lines.join('\n')}</pre>
              </details>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}

function Confirmed({ receipt: r, categories }: { receipt: Receipt; categories: LedgerCategory[] }) {
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
        <dt>科目</dt>
        <dd>{categories.find((c) => c.kind === 'expense' && c.code === r.category)?.label ?? r.category}</dd>
      </dl>
      {r.items.length > 0 && (
        <ul className="receipt-items">
          {r.items.map((it, i) => (
            <li key={i}>
              {it.name} <span className="mono">{yen(it.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="field-hint">収支の支出に登録しました。直すときは「収支」の明細から直してください。</p>
    </div>
  )
}

function ConfirmForm({
  receipt: r,
  categories,
  onDone,
  onDeleted,
}: {
  receipt: Receipt
  categories: LedgerCategory[]
  onDone: () => void
  onDeleted: () => void
}) {
  const { token } = useManage()
  // 読み取った内容を下書きにする（必ず人が確かめて直してから確定する）
  const [draft, setDraft] = useState<Draft>(() => ({
    store_name: r.ocr?.store_name ?? '',
    purchase_date: r.ocr?.purchase_date ?? '',
    total: r.ocr?.total != null ? String(r.ocr.total) : '',
    category: '',
    memo: '',
    items: [],
  }))
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const category = draft.category || categories[0]?.code || ''
  const total = Number(draft.total)
  const valid = draft.store_name.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(draft.purchase_date) && Number.isInteger(total) && total >= 1 && total <= 10_000_000 && category !== ''

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
    const items: ReceiptItem[] = draft.items.filter((it) => it.name.trim()).map((it) => ({ name: it.name.trim(), amount: Number(it.amount) || 0 }))
    void run(
      () =>
        apiFetch(`/api/manage/receipts/${r.id}/confirm`, {
          method: 'POST',
          token,
          body: { store_name: draft.store_name.trim(), purchase_date: draft.purchase_date, total, category, memo: draft.memo.trim(), items },
        }),
      '確定し、収支の支出に登録しました。',
    )
  }

  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={confirm}>
      <p className={r.status === 'ocr_failed' ? 'receipt-dup' : 'field-hint'}>
        {r.status === 'ocr_failed' && '合計を読み取れませんでした。写真を見ながら入力するか、撮り直してください。'}
        {r.status === 'uploaded' && (r.ocr_error ? '読み取りは後で行います（まだ読み取れていません）。手で入力して確定もできます。' : '読み取りをしていません。写真を見ながら入力してください。')}
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
          <input className="input" inputMode="numeric" value={draft.total} onChange={(e) => setDraft({ ...draft, total: e.target.value.replace(/\D/g, '') })} />
        </label>
        <label className="field">
          <span className="field-label">科目</span>
          <select className="select" value={category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="field-label">摘要（任意）</span>
          <input className="input" value={draft.memo} maxLength={100} placeholder="例: お好み焼きの材料" onChange={(e) => setDraft({ ...draft, memo: e.target.value })} />
        </label>
      </div>

      <details>
        <summary className="field-label">品目（任意・{draft.items.length}件）</summary>
        <div className="stack" style={{ gap: 8, marginTop: 8 }}>
          {draft.items.map((it, i) => (
            <div key={i} className="row" style={{ gap: 8 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                value={it.name}
                placeholder="品名"
                aria-label={`品目${i + 1}の品名`}
                onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
              />
              <input
                className="input"
                style={{ width: 110 }}
                inputMode="numeric"
                value={it.amount}
                placeholder="金額"
                aria-label={`品目${i + 1}の金額`}
                onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/[^\d-]/g, '') } : x)) })}
              />
              <button type="button" className="btn btn-text" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}>
                外す
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-text" style={{ alignSelf: 'flex-start' }} onClick={() => setDraft({ ...draft, items: [...draft.items, { name: '', amount: '' }] })}>
            ＋ 品目を足す
          </button>
        </div>
      </details>

      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
          確定して収支に登録
        </button>
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
      </div>
      <Notice error={error ?? (draft.total && !valid ? '店名・購入日・合計（1〜10,000,000円）・科目を入れてください。' : null)} ok={ok} />
    </form>
  )
}
