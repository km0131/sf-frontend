import { apiFetch } from './api'
import type { CustomerOrder } from './types'

/** お客様の注文（GET /api/orders/:token）。注文状況ページ・お店一覧・呼び出しの見張りで同じキャッシュを使う。 */
export const orderQuery = (token: string) => ({
  queryKey: ['order', token],
  queryFn: () => apiFetch<{ order: CustomerOrder }>(`/api/orders/${encodeURIComponent(token)}`).then((r) => r.order),
})
