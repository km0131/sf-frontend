import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { apiFetch } from '../../lib/api'
import { yen } from '../../lib/format'
import { useManage } from './context'

type Outlook = {
  event_id: number
  event_name: string
  balance: number
  target_profit: number
  shortfall: number
  average_order: number | null
  orders_to_target: number | null
  projection: number | null
  projection_note?: 'hours_missing' | 'no_sales'
  final: boolean
}

const signed = (n: number) => (n < 0 ? `−${yen(-n)}` : n > 0 ? `＋${yen(n)}` : yen(0))

/** 店長の商品画面の上に出す、今の回の本番の合計の損益・あと何件で黒字（目標）・イベント終了時の見込み（2行まで）。
 *  出店している今の回がなければ何も出さない。1分ごとに読み直す。 */
export function OutlookBar() {
  const { token } = useManage()
  const q = useQuery({
    queryKey: ['manage', 'ledger', 'outlook'],
    queryFn: () => apiFetch<{ outlook: Outlook | null }>('/api/manage/ledger/outlook', { token }).then((r) => r.outlook),
    refetchInterval: 60_000,
  })
  const o = q.data
  if (!o) return null
  // 狭い画面でも1行に入るよう短く書き、平均客単価と目標の額は title に入れる
  const goal = o.target_profit > 0 ? '目標' : '黒字'
  let toGoal: string
  if (o.shortfall === 0) toGoal = o.target_profit > 0 ? '目標に届きました' : o.balance > 0 ? '黒字です' : '収支はゼロです'
  else if (o.orders_to_target != null) toGoal = `${goal}まであと約${o.orders_to_target.toLocaleString('ja-JP')}件`
  else toGoal = `${goal}まであと ${yen(o.shortfall)}`
  const detail = [
    o.target_profit > 0 ? `目標利益 ${yen(o.target_profit)}` : '目標: 黒字',
    o.shortfall > 0 ? `足りない額 ${yen(o.shortfall)}` : '',
    o.average_order != null ? `平均客単価 ${yen(o.average_order)}` : '',
  ]
    .filter(Boolean)
    .join('・')

  let outlook: string
  if (o.projection != null) outlook = o.final ? `イベント終了時 ${signed(o.projection)}（確定）` : `イベント終了時の見込み ${signed(o.projection)}`
  else outlook = o.projection_note === 'hours_missing' ? 'イベント終了時の見込み：営業時間が未設定です' : 'イベント終了時の見込み：売上が出てから計算します'

  return (
    <Link to="/manage/ledger" className="outlook-bar" aria-label={`収支（${o.event_name}の本番の合計）を開く`}>
      <p className="outlook-now">
        <span className="outlook-label">損益</span>
        <strong className={`mono ${o.balance < 0 ? 'outlook-minus' : ''}`}>{signed(o.balance)}</strong>
        <span className="outlook-goal" title={detail}>
          {toGoal}
        </span>
      </p>
      <p className={`outlook-forecast ${o.final ? 'outlook-final' : ''}`}>{outlook}</p>
    </Link>
  )
}
