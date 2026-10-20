import { useEffect, useState } from 'react'

/** サーバーの時刻と端末の時刻の差（ミリ秒。サーバー − 端末）。server_time を受け取った時刻（receivedAt）と比べる。
 *  受け取れていなければ 0（端末の時計をそのまま使う）。 */
export function clockOffset(serverTime: string | undefined, receivedAt: number): number {
  if (!serverTime || !receivedAt) return 0
  const t = Date.parse(serverTime)
  return Number.isNaN(t) ? 0 : t - receivedAt
}

/** 今の時刻（ミリ秒）を intervalMs ごとに更新して返す。intervalMs が null なら更新しない。 */
export function useNow(intervalMs: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (intervalMs == null) return
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
