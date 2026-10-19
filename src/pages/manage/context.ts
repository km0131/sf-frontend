import { useQuery } from '@tanstack/react-query'
import { useOutletContext } from 'react-router'
import { apiFetch } from '../../lib/api'
import type { Session } from '../../lib/session'
import type { BusinessType } from '../../lib/types'
import { wording, type Wording } from '../../lib/wording'

export type ManageContext = {
  token: string
  session: Session
  /** 店舗名・店舗色を変えたときに、ヘッダーへ反映する */
  updateShop: (patch: Partial<NonNullable<Session['shop']>>) => void
}

/** 管理画面で使うログイン情報。 */
export function useManage(): ManageContext {
  return useOutletContext<ManageContext>()
}

/** 店長の店舗の種類に合った画面の言葉。店舗設定（GET /api/manage/shop）と同じデータを使い回す。 */
export function useShopWording(): Wording {
  const { token, session } = useManage()
  const { data } = useQuery({
    queryKey: ['manage', 'shop'],
    queryFn: () => apiFetch<{ business_type: BusinessType }>('/api/manage/shop', { token }),
    enabled: !!session.shop,
  })
  return wording(data?.business_type)
}
