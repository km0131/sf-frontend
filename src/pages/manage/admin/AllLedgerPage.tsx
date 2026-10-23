import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { apiFetch, errorMessage } from '../../../lib/api'
import { yen } from '../../../lib/format'
import { sessionLabel, type EventSession } from '../../../lib/ledger'
import type { List } from '../../../lib/types'
import { PageHead, Panel } from '../common'
import { useManage } from '../context'

type ShopTotal = { shop_id: number; shop_name: string; sales: number; income: number; expense: number; balance: number; cash_difference: number | null }

const signed = (n: number) => (n < 0 ? `−${yen(-n)}` : yen(n))

/** システム管理者: 開催回ごとの全店舗の収支。 */
export function AllLedgerPage() {
  const { token } = useManage()
  const sessions = useQuery({
    queryKey: ['admin', 'event-sessions', 'all'],
    queryFn: () => apiFetch<List<EventSession>>('/api/admin/event-sessions', { token }).then((r) => r.items),
  })
  const [picked, setPicked] = useState<number | null>(null)
  // 選んでいなければ、今日に最も近い開催回
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const nearest = [...(sessions.data ?? [])].sort(
    (a, b) => Math.abs(Date.parse(a.date) - Date.parse(today)) - Math.abs(Date.parse(b.date) - Date.parse(today)),
  )[0]
  const sessionId = picked ?? nearest?.id ?? null
  const totals = useQuery({
    queryKey: ['admin', 'ledger', sessionId],
    queryFn: () => apiFetch<{ items: ShopTotal[] }>(`/api/admin/ledger?session_id=${sessionId}`, { token }).then((r) => r.items),
    enabled: sessionId != null,
    placeholderData: keepPreviousData,
  })
  const sum = (k: keyof Pick<ShopTotal, 'sales' | 'income' | 'expense' | 'balance'>) => (totals.data ?? []).reduce((n, t) => n + t[k], 0)

  return (
    <div className="mpage">
      <PageHead title="全店の収支" />
      <label className="field" style={{ maxWidth: 420 }}>
        <span className="field-label">開催回</span>
        <select className="select" value={sessionId ?? ''} onChange={(e) => setPicked(Number(e.target.value))}>
          {sessions.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.event_name}　{sessionLabel(s)}
            </option>
          ))}
        </select>
      </label>
      {sessions.data?.length === 0 && <p className="empty">開催回がまだありません（「開催回」の画面で作ります）。</p>}
      {(sessions.error || totals.error) && <p className="error-text">{errorMessage(sessions.error ?? totals.error)}</p>}

      {totals.data && (
        <Panel title="店舗ごと">
          <div className="table-wrap">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>店舗</th>
                  <th className="num">売上（自動）</th>
                  <th className="num">収入計</th>
                  <th className="num">支出計</th>
                  <th className="num">差引</th>
                  <th className="num">現金の差額</th>
                </tr>
              </thead>
              <tbody>
                {totals.data.map((t) => (
                  <tr key={t.shop_id}>
                    <td className="cell-title">{t.shop_name}</td>
                    <td className="num" data-label="売上（自動）">{yen(t.sales)}</td>
                    <td className="num" data-label="収入計">{yen(t.income)}</td>
                    <td className="num" data-label="支出計">{yen(t.expense)}</td>
                    <td className="num" data-label="差引">{signed(t.balance)}</td>
                    <td className="num" data-label="現金の差額">{t.cash_difference == null ? '未入力' : signed(t.cash_difference)}</td>
                  </tr>
                ))}
                {totals.data.length > 0 && (
                  <tr>
                    <td className="cell-title">合計</td>
                    <td className="num" data-label="売上（自動）">{yen(sum('sales'))}</td>
                    <td className="num" data-label="収入計">{yen(sum('income'))}</td>
                    <td className="num" data-label="支出計">{yen(sum('expense'))}</td>
                    <td className="num" data-label="差引">{signed(sum('balance'))}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
            {totals.data.length === 0 && <p className="empty">この回に出店している店舗がありません</p>}
          </div>
        </Panel>
      )}
    </div>
  )
}
