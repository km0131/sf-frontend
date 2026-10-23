import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { apiFetch } from '../../lib/api'
import { projectionText, signedYen, toGoalText, type Outlook } from '../../lib/outlook'
import { useManage } from './context'

/** 店長の商品画面の上に出す、今の回の本番の合計の損益・あと何点で黒字（目標）・イベント終了時の見込み（2行まで）。
 *  平均単価・目標額・見込みの前提は収支の画面に出す。出店している今の回がなければ何も出さない。1分ごとに読み直す。 */
export function OutlookBar() {
  const { token } = useManage()
  const q = useQuery({
    queryKey: ['manage', 'ledger', 'outlook'],
    queryFn: () => apiFetch<{ outlook: Outlook | null }>('/api/manage/ledger/outlook', { token }).then((r) => r.outlook),
    refetchInterval: 60_000,
  })
  const o = q.data
  if (!o) return null
  return (
    <Link to="/manage/ledger" className="outlook-bar" aria-label={`収支（${o.event_name}の本番の合計）を開く`}>
      <p className="outlook-now">
        <span className="outlook-label">損益</span>
        <strong className={`mono ${o.balance < 0 ? 'outlook-minus' : ''}`}>{signedYen(o.balance)}</strong>
        <span className="outlook-goal">{toGoalText(o)}</span>
      </p>
      <p className={`outlook-forecast ${o.final ? 'outlook-final' : ''}`}>{projectionText(o)}</p>
    </Link>
  )
}
