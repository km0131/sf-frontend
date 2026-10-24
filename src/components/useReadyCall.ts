import { useQueries } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useMatch } from 'react-router'
import { ApiError } from '../lib/api'
import { playCallSound } from '../lib/callSound'
import { orderQuery } from '../lib/orderQuery'
import { myOrders } from '../lib/session'
import type { CustomerOrder } from '../lib/types'

/** 取り直す間隔。お渡し済み・取り消し・未受取・見つからない注文は取り直さない。 */
const POLL_MS = 7000

/** お客様の今日の注文（受付中の番号と、開いている注文状況ページ）を見張り、
 *  「お渡し可能（ready）」に変わった瞬間に呼び出し音を1回鳴らし（振動できる端末では振動も）、呼び出しの一覧（calls）に加える。
 *  読み込んだ時点ですでに ready の注文は知らせない。dismiss で先頭の呼び出しを閉じる。 */
export function useReadyCalls() {
  const location = useLocation()
  const current = useMatch('/o/:token')?.params.token
  // 画面を移ったとき（注文した直後など）に控えを読み直す
  const [tokens, setTokens] = useState<string[]>([])
  const [seenKey, setSeenKey] = useState('')
  if (seenKey !== location.key) {
    setSeenKey(location.key)
    const list = myOrders.list().map((o) => o.token)
    if (current && !list.includes(current)) list.push(current)
    setTokens(list)
  }

  const orders = useQueries({
    queries: tokens.map((token) => ({
      ...orderQuery(token),
      refetchInterval: (q: { state: { data?: CustomerOrder; error: unknown } }) => {
        const st = q.state.data?.status
        if (q.state.error instanceof ApiError && q.state.error.status === 404) return false
        return st === 'done' || st === 'cancelled' || st === 'unclaimed' ? false : POLL_MS
      },
    })),
  })

  const [prev, setPrev] = useState<Record<string, string>>({})
  const [calls, setCalls] = useState<{ token: string; order: CustomerOrder }[]>([])
  const [rings, setRings] = useState(0)
  const loaded = orders.flatMap((q, i) => (q.data ? [{ token: tokens[i], order: q.data }] : []))
  const now = Object.fromEntries(loaded.map((x) => [x.token, x.order.status]))
  // 前の表示から状態が変わった注文だけを見る（初めて読み込んだ注文は「前」がないので知らせない）
  if (JSON.stringify(now) !== JSON.stringify(prev)) {
    setPrev(now)
    const fresh = loaded.filter((x) => x.order.status === 'ready' && prev[x.token] && prev[x.token] !== 'ready')
    setCalls((list) => [...list.filter((c) => now[c.token] === 'ready'), ...fresh])
    if (fresh.length > 0) setRings((n) => n + 1)
  }

  useEffect(() => {
    if (rings > 0) {
      playCallSound()
      vibrate()
    }
  }, [rings])

  const dismiss = useCallback(() => setCalls((list) => list.slice(1)), [])
  // 待っている注文（受付・調理中・お渡し待ち）があるか。あるあいだは画面が暗くならないようにする
  const waiting = loaded.some((x) => x.order.status === 'waiting' || x.order.status === 'cooking' || x.order.status === 'ready')
  return { call: calls[0]?.order, dismiss, waiting }
}

/** 呼び出しの振動（対応している端末だけ。iPhone の Safari は対応していない）。 */
function vibrate() {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 600])
  } catch {
    // 振動できなくても、音と画面で知らせている
  }
}
