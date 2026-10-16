import { useOutletContext } from 'react-router'
import type { Session } from '../../lib/session'

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
