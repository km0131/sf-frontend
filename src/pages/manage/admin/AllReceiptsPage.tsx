import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { OcrText, ReceiptCard, ReceiptImage, ReceiptSearchForm } from '../../../components/ReceiptSearch'
import { Sheet } from '../../../components/Sheet'
import { apiFetch, errorMessage } from '../../../lib/api'
import { mdhm, yen } from '../../../lib/format'
import { categoryLabel, type EventSession, type LedgerCategory } from '../../../lib/ledger'
import { emptyQuery, keywordsOf, toParams, type ReceiptQuery } from '../../../lib/receiptSearch'
import { receiptNo, statusLabels, useAuthImage, type Receipt } from '../../../lib/receipts'
import type { List } from '../../../lib/types'
import { PageHead, Panel } from '../common'
import { useManage } from '../context'
import type { AdminShop } from './ShopsPage'

type Event = { id: number; name: string; is_current: boolean }
type UnlinkedExpense = { id: number; shop_name: string; session_name: string; category_label: string; amount: number; entry_date: string; memo: string }

/** システム管理者: 全店舗のレシートの検索（見るだけ。確定は店長）と、回ごとの照合チェック。 */
export function AllReceiptsPage() {
  const { token } = useManage()
  const shops = useQuery({ queryKey: ['admin', 'shops'], queryFn: () => apiFetch<List<AdminShop>>('/api/admin/shops', { token }).then((r) => r.items) })
  const sessions = useQuery({
    queryKey: ['admin', 'event-sessions', 'all'],
    queryFn: () => apiFetch<List<EventSession>>('/api/admin/event-sessions', { token }).then((r) => r.items),
  })
  const categories = useQuery({
    queryKey: ['admin', 'ledger', 'categories'],
    queryFn: () => apiFetch<List<LedgerCategory>>('/api/admin/ledger/categories', { token }).then((r) => r.items),
  })
  const [query, setQuery] = useState<ReceiptQuery>(emptyQuery)
  const [selected, setSelected] = useState<number | null>(null)
  const params = toParams(query)
  const list = useQuery({
    queryKey: ['admin', 'receipts', params.toString()],
    queryFn: () => apiFetch<List<Receipt>>(`/api/admin/receipts?${params}`, { token }).then((r) => r.items),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="mpage">
      <PageHead title="全店のレシート" />
      <Panel title="レシートを探す">
        <ReceiptSearchForm sessions={sessions.data ?? []} categories={categories.data ?? []} shops={shops.data ?? []} onSearch={setQuery} />
        {list.error && <p className="error-text">{errorMessage(list.error)}</p>}
        <p className="sub" style={{ fontSize: 13, marginTop: 16 }}>
          {list.data ? `${list.data.length}${list.data.length >= 100 ? '件以上（新しい100件）' : '件'}` : ''}
        </p>
        <div className="receipt-cards" style={{ marginTop: 8 }}>
          {list.data?.map((r) => <ReceiptCard key={r.id} receipt={r} token={token} base="/api/admin" showShop onOpen={() => setSelected(r.id)} />)}
        </div>
        {list.data?.length === 0 && <p className="empty">見つかりませんでした</p>}
      </Panel>
      <AdminChecks onOpen={setSelected} />
      {selected && <AdminReceipt id={selected} keywords={keywordsOf(query.q)} categories={categories.data ?? []} onClose={() => setSelected(null)} />}
    </div>
  )
}

/** 回ごとの照合チェック（全店舗） */
function AdminChecks({ onOpen }: { onOpen: (id: number) => void }) {
  const { token } = useManage()
  const events = useQuery({ queryKey: ['admin', 'events'], queryFn: () => apiFetch<List<Event>>('/api/admin/events', { token }).then((r) => r.items) })
  const [picked, setPicked] = useState<number | null>(null)
  const eventId = picked ?? (events.data?.find((e) => e.is_current) ?? events.data?.[0])?.id ?? null
  const checks = useQuery({
    queryKey: ['admin', 'checks', eventId],
    queryFn: () => apiFetch<{ unconfirmed_receipts: Receipt[]; unlinked_expenses: UnlinkedExpense[] }>(`/api/admin/ledger/checks?event_id=${eventId}`, { token }),
    enabled: eventId != null,
  })
  const c = checks.data
  return (
    <Panel title="照合チェック（全店舗）">
      <label className="field" style={{ maxWidth: 360 }}>
        <span className="field-label">回</span>
        <select className="select" value={eventId ?? ''} onChange={(e) => setPicked(Number(e.target.value))}>
          {events.data?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      {checks.error && <p className="error-text">{errorMessage(checks.error)}</p>}
      {c && (
        <div className="stack" style={{ gap: 20, marginTop: 16 }}>
          <section className="stack" style={{ gap: 8 }}>
            <h4 className="field-label">確定していないレシート（{c.unconfirmed_receipts.length}件）</h4>
            <div className="receipt-cards">
              {c.unconfirmed_receipts.map((r) => (
                <ReceiptCard key={r.id} receipt={r} token={token} base="/api/admin" showShop onOpen={() => onOpen(r.id)} />
              ))}
            </div>
          </section>
          <section className="stack" style={{ gap: 8 }}>
            <h4 className="field-label">レシートを結んでいない支出（{c.unlinked_expenses.length}件）</h4>
            {c.unlinked_expenses.length > 0 && (
              <div className="table-wrap">
                <table className="table table-cards">
                  <thead>
                    <tr>
                      <th>店舗</th>
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
                        <td className="cell-title">{e.shop_name}</td>
                        <td className="mono" data-label="日付">
                          {e.entry_date}
                        </td>
                        <td data-label="開催回">{e.session_name}</td>
                        <td data-label="科目">{e.category_label}</td>
                        <td className="num mono" data-label="金額">
                          {yen(e.amount)}
                        </td>
                        <td data-label="摘要">{e.memo || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </Panel>
  )
}

/** レシートの中身（見るだけ） */
function AdminReceipt({ id, keywords, categories, onClose }: { id: number; keywords: string[]; categories: LedgerCategory[]; onClose: () => void }) {
  const { token } = useManage()
  const detail = useQuery({ queryKey: ['admin', 'receipt', id], queryFn: () => apiFetch<{ receipt: Receipt }>(`/api/admin/receipts/${id}`, { token }) })
  const image = useAuthImage(`/api/admin/receipts/${id}/image`, token)
  const r = detail.data?.receipt
  return (
    <Sheet title={`レシート ${receiptNo(id)}`} onClose={onClose} wide>
      {!r ? (
        <p className="empty">{detail.error ? errorMessage(detail.error) : '読み込んでいます…'}</p>
      ) : (
        <div className="receipt-detail">
          <ReceiptImage src={image} alt={`${receiptNo(id)} の写真`} />
          <div className="stack" style={{ gap: 16 }}>
            <p className="receipt-session">
              <strong>{r.shop_name}</strong>・開催回：<strong>{r.session_name}</strong>　<span className="sub">登録 {mdhm(r.created_at)}</span>
            </p>
            <p>
              <span className={`tag ${r.status === 'confirmed' ? '' : 'tag-strong'}`}>{statusLabels[r.status]}</span>
            </p>
            <dl className="receipt-result-fields">
              <dt>店名</dt>
              <dd>{r.store_name ?? r.ocr?.store_name ?? '—'}</dd>
              <dt>購入日</dt>
              <dd className="mono">{r.purchase_date ?? r.ocr?.purchase_date ?? '—'}</dd>
              <dt>合計</dt>
              <dd className="mono">{(r.total ?? r.ocr?.total) != null ? yen((r.total ?? r.ocr?.total)!) : '—'}</dd>
              <dt>科目</dt>
              <dd>{r.category ? categoryLabel(categories, 'expense', r.category) : '—'}</dd>
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
            {r.status !== 'confirmed' && <p className="field-hint">確定前は、読み取った内容です。確定はその店の店長が行います。</p>}
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
