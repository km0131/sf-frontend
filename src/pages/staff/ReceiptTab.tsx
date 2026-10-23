import { useQuery } from '@tanstack/react-query'
import { ReceiptUploader } from '../../components/ReceiptUploader'
import { apiFetch } from '../../lib/api'
import { yen } from '../../lib/format'
import { receiptNo, refetchWhileReading, statusLabels, useAuthImage, type Receipt } from '../../lib/receipts'
import type { List } from '../../lib/types'

/** スタッフ: レシートの登録（アップロードだけ）と、最近登録したレシート。確定は店長が管理画面で行う。 */
export function ReceiptTab({ token }: { token: string }) {
  const recent = useQuery({
    queryKey: ['receipts', 'recent'],
    queryFn: () => apiFetch<List<Receipt>>('/api/staff/receipts/recent', { token }).then((r) => r.items),
    // 読み取りの途中のものがあれば、終わるまで読み直す
    refetchInterval: (q) => refetchWhileReading(q.state.data),
  })
  return (
    <div className="receipt-tab">
      <section className="card stack" style={{ gap: 16 }}>
        <h2 className="panel-title">レシートを登録</h2>
        <ReceiptUploader token={token} base="/api/staff" />
      </section>
      <section className="stack" style={{ gap: 12 }}>
        <h2 className="panel-title">最近のレシート</h2>
        {recent.data?.length === 0 && <p className="empty">まだありません</p>}
        <div className="receipt-cards">
          {recent.data?.map((r) => <RecentCard key={r.id} receipt={r} token={token} />)}
        </div>
      </section>
    </div>
  )
}

function RecentCard({ receipt: r, token }: { receipt: Receipt; token: string }) {
  const thumb = useAuthImage(`/api/staff/receipts/${r.id}/thumb`, token)
  const total = r.total ?? r.ocr?.total ?? null
  return (
    <article className="receipt-card">
      {thumb ? <img src={thumb} alt={`${receiptNo(r.id)} の写真`} /> : <span className="receipt-thumb-empty" aria-hidden="true" />}
      <div>
        <p className="mono">{receiptNo(r.id)}</p>
        <p className="sub">{r.session_name}</p>
        <p>{total != null ? yen(total) : '—'}</p>
        <span className={`tag ${r.status === 'ocr_failed' ? 'tag-strong' : ''}`}>{statusLabels[r.status]}</span>
      </div>
    </article>
  )
}
