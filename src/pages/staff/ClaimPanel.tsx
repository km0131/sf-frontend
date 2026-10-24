import { useQuery } from '@tanstack/react-query'
import { QrCode } from '../../components/QrCode'
import { Sheet } from '../../components/Sheet'
import { apiFetch, errorMessage } from '../../lib/api'
import type { OrderClaim } from '../../lib/types'

/** レジの注文を、お客様のスマホに登録してもらうための QR と確認コード。QR を読むと、その注文の状況ページが開く。 */
export function ClaimPanel({ orderNo, claim }: { orderNo: string; claim: OrderClaim }) {
  return (
    <div className="claim-panel">
      <QrCode value={`${location.origin}/o/${claim.token}`} size={168} label={`${orderNo} をスマホに登録する QR コード`} />
      <div className="claim-panel-body">
        <p className="field-label">スマホでお知らせを受け取る</p>
        <p className="claim-code">
          <span className="sub">確認コード</span>
          <span className="mono">{claim.code}</span>
        </p>
        <p className="field-hint">
          QR をスマホのカメラで読んでもらうと、できあがりをスマホでお知らせします。
          読めないときは、お店の一覧の「レジの注文を登録」から、番号 <span className="mono">{orderNo}</span> と確認コードを入れてもらいます。
        </p>
      </div>
    </div>
  )
}

/** 注文帳から、レジの注文の QR と確認コードをもう一度出す。 */
export function ClaimSheet({ orderId, orderNo, token, onClose }: { orderId: string; orderNo: string; token: string; onClose: () => void }) {
  const { data, error } = useQuery({
    queryKey: ['staff', 'claim', orderId],
    queryFn: () => apiFetch<{ claim: OrderClaim }>(`/api/staff/orders/${orderId}/claim`, { token }),
    staleTime: Infinity,
  })
  return (
    <Sheet title={`${orderNo} をスマホに登録`} onClose={onClose}>
      {error ? (
        <p className="error-text">{errorMessage(error)}</p>
      ) : data ? (
        <ClaimPanel orderNo={orderNo} claim={data.claim} />
      ) : (
        <p className="empty">読み込んでいます…</p>
      )}
    </Sheet>
  )
}
