import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../../lib/api'

type Status = {
  temperature_c: number | null
  current_mhz: number | null
  max_mhz: number | null
  hot: boolean
  below_max: boolean
  hot_celsius: number
  checked_at: string
}

const UNAVAILABLE = '取得できません'

/** システム管理者: サーバー（ラズパイ）の CPU 温度とクロック。管理メニューの下にいつも出し、30 秒ごとに読み直す */
export function ServerStatus({ token }: { token: string }) {
  const q = useQuery({
    queryKey: ['admin', 'server-status'],
    queryFn: () => apiFetch<Status>('/api/admin/server-status', { token }),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: false,
  })
  // 読めなかったとき（API が失敗したときも）は、その項目だけ「取得できません」
  const s = q.data
  const temp = s?.temperature_c != null ? `${s.temperature_c.toFixed(1)}℃` : UNAVAILABLE
  const cur = s?.current_mhz != null ? `${s.current_mhz.toLocaleString()} MHz` : UNAVAILABLE
  const max = s?.max_mhz != null ? `${s.max_mhz.toLocaleString()} MHz` : UNAVAILABLE
  const time = s ? new Date(s.checked_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null
  return (
    <section className={`server-status${s?.hot || s?.below_max ? ' server-status-alert' : ''}`} aria-label="サーバーの状態" aria-live="polite">
      <h2 className="server-status-title">サーバー</h2>
      <dl>
        <dt>CPU 温度</dt>
        <dd className={s?.hot ? 'server-status-warn' : s?.temperature_c == null ? 'server-status-na' : ''}>
          {temp}
          {s?.hot && <span className="server-status-note">{s.hot_celsius}℃ 以上</span>}
        </dd>
        <dt>クロック</dt>
        <dd className={s?.below_max ? 'server-status-warn' : s?.current_mhz == null ? 'server-status-na' : ''}>
          {cur}
          {s?.below_max && <span className="server-status-note">最大より低い</span>}
        </dd>
        <dt>最大</dt>
        <dd className={s?.max_mhz == null ? 'server-status-na' : ''}>{max}</dd>
      </dl>
      <p className="server-status-time">{q.isLoading ? '読み込んでいます…' : time ? `${time} 時点・30秒ごと` : '30秒ごとに読み直します'}</p>
    </section>
  )
}
