// 損益・あと何点・イベント終了時の見込み（GET /api/manage/ledger/outlook）と、その言い方。
import { yen } from './format'

export type Outlook = {
  event_id: number
  event_name: string
  balance: number
  target_profit: number
  /** 目標まで足りない額（届いていれば 0） */
  shortfall: number
  /** 1点あたりの平均単価（本番の売上 ÷ 販売数量）。売れていなければ null */
  average_unit_price: number | null
  /** 目標まであと何点（切り上げ） */
  units_to_target: number | null
  projection: number | null
  projection_note?: 'hours_missing' | 'no_sales'
  final: boolean
}

export const signedYen = (n: number) => (n < 0 ? `−${yen(-n)}` : n > 0 ? `＋${yen(n)}` : yen(0))

/** 目標（0 円なら黒字）まであと何点か */
export function toGoalText(o: Outlook): string {
  const goal = o.target_profit > 0 ? '目標' : '黒字'
  if (o.shortfall === 0) return o.target_profit > 0 ? '目標に届きました' : o.balance > 0 ? '黒字です' : '収支はゼロです'
  if (o.units_to_target != null) return `${goal}まであと約${o.units_to_target.toLocaleString('ja-JP')}点`
  return `${goal}まであと ${yen(o.shortfall)}`
}

/** イベント終了時の見込み（終わっていれば確定の値） */
export function projectionText(o: Outlook): string {
  if (o.projection != null) return o.final ? `イベント終了時 ${signedYen(o.projection)}（確定）` : `イベント終了時の見込み ${signedYen(o.projection)}`
  return o.projection_note === 'hours_missing' ? 'イベント終了時の見込み：営業時間が未設定です' : 'イベント終了時の見込み：売上が出てから計算します'
}
