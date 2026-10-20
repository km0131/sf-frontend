import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Sheet } from '../../components/Sheet'
import { ApiError, apiFetch, errorMessage } from '../../lib/api'
import type { CustomerOrder } from '../../lib/types'
import { wording } from '../../lib/wording'

/** お客様: 注文のキャンセル。調理前（受付中）・未払いの Web 注文だけ押せる。
 *  押せないときは理由を出し、キャンセル済み・お渡し済み・未受取ならボタンは出さない。 */
export function CancelOrder({ token, order }: { token: string; order: CustomerOrder }) {
  const w = wording(order.shop.business_type)
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['order', token] })

  const cancel = async () => {
    if (sending) return
    setSending(true)
    setError('')
    try {
      const r = await apiFetch<{ order: CustomerOrder }>(`/api/orders/${encodeURIComponent(token)}/cancel`, { method: 'POST' })
      queryClient.setQueryData(['order', token], r.order)
      setNotice('キャンセルしました')
      setConfirming(false)
      void refetch()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'order_not_cancellable') {
        setError(w.cancelRace)
        setConfirming(false)
        void refetch()
      } else if (e instanceof ApiError) {
        setError(errorMessage(e))
      } else {
        setError('通信できませんでした。電波の状態を確かめて、もう一度お試しください。')
      }
    } finally {
      setSending(false)
    }
  }

  const finished = order.status === 'cancelled' || order.status === 'done' || order.status === 'unclaimed'
  if (finished) {
    return notice ? <p className="notice-text" role="status">{notice}</p> : null
  }

  // 受付中なのに押せないのは、支払い済み（レジの注文など）のとき
  const reason = order.cancellable
    ? ''
    : order.status === 'waiting'
      ? 'お支払い済みのため、この画面からはキャンセルできません。お困りの場合はお店のスタッフにお声がけください'
      : w.cancelUnavailable

  return (
    <div className="cancel-order">
      <button type="button" className="btn btn-text" disabled={!order.cancellable || sending} onClick={() => setConfirming(true)}>
        {w.cancelButton}
      </button>
      {reason && <p className="field-hint">{reason}</p>}
      {error && !confirming && <p className="error-text" role="alert">{error}</p>}

      {confirming && (
        <Sheet title={w.cancelButton} onClose={() => !sending && setConfirming(false)}>
          <div className="stack" style={{ gap: 16 }}>
            <p>{w.cancelConfirm}</p>
            <p className="sub" style={{ fontSize: 13 }}>
              お呼び出し番号 <span className="mono">{order.order_no}</span>
            </p>
            {error && <p className="error-text" role="alert">{error}</p>}
            {/* 誤って押さないよう、やめる方を目立たせる */}
            <button type="button" className="btn btn-primary btn-block" disabled={sending} onClick={() => setConfirming(false)}>
              やめる
            </button>
            <button type="button" className="btn btn-text" disabled={sending} onClick={cancel}>
              {sending ? 'キャンセルしています' : 'キャンセルする'}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
