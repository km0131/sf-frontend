// 管理者の画面の「今回の開催」。店長の収支の画面の既定と同じ基準（今日に最も近い受付中の開催回の回）で、
// 開催回がなければ「開催中」の回（events.is_current）。
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../../lib/api'
import type { EventSession } from '../../../lib/ledger'
import type { List } from '../../../lib/types'
import { useManage } from '../context'

type Event = { id: number; name: string; is_current: boolean }

export function useCurrentEvent(): { id: number | null; ready: boolean } {
  const { token } = useManage()
  const sessions = useQuery({
    queryKey: ['admin', 'event-sessions', 'default'],
    queryFn: () => apiFetch<{ items: EventSession[]; default_event_id: number | null }>('/api/admin/event-sessions', { token }),
  })
  const events = useQuery({ queryKey: ['admin', 'events'], queryFn: () => apiFetch<List<Event>>('/api/admin/events', { token }).then((r) => r.items) })
  const id = sessions.data?.default_event_id ?? events.data?.find((e) => e.is_current)?.id ?? events.data?.[0]?.id ?? null
  return { id, ready: sessions.isSuccess && events.isSuccess }
}
