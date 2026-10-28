import { yen } from './format'
import type { DiscountKind, DiscountPreset, OrderDiscount, OrderItem } from './types'

// 値引きの選択と、画面に出す目安の計算。金額はサーバーが計算し直す（ここの計算は表示用。バックエンドの discount パッケージと同じ式）

/** 明細・注文全体に付ける値引き（プリセットか自由入力） */
export type DiscountChoice = { presetId: number } | { amount: number; reason: string }

const clamp = (d: number, upper: number) => Math.max(0, Math.min(d, upper))

/** 明細（単価 unit × 数量 qty）の値引き額。％は1円未満を切り捨て。 */
export function lineDiscount(choice: DiscountChoice | undefined, presets: DiscountPreset[], unit: number, qty: number): number {
  if (!choice) return 0
  const list = unit * qty
  if (!('presetId' in choice)) return clamp(choice.amount, list)
  const p = presets.find((x) => x.id === choice.presetId)
  if (!p) return 0
  if (p.kind === 'amount') return clamp(p.value * qty, list)
  if (p.kind === 'percent') return clamp(Math.floor((list * p.value) / 100), list)
  return clamp((unit - p.value) * qty, list)
}

/** 明細の値引き後の合計 base に対する、注文全体の値引き額。 */
export function orderDiscount(choice: DiscountChoice | undefined, presets: DiscountPreset[], base: number): number {
  if (!choice) return 0
  if (!('presetId' in choice)) return clamp(choice.amount, base)
  const p = presets.find((x) => x.id === choice.presetId)
  if (!p) return 0
  if (p.kind === 'amount') return clamp(p.value, base)
  if (p.kind === 'percent') return clamp(Math.floor((base * p.value) / 100), base)
  return clamp(base - p.value, base)
}

/** プリセットの中身の短い説明（例: 50円引き・10%引き・200円に）。 */
export function kindLabel(kind: DiscountKind, value: number, scope: 'item' | 'order'): string {
  if (kind === 'amount') return `${yen(value)}引き${scope === 'item' ? '（1個あたり）' : ''}`
  if (kind === 'percent') return `${value}%引き`
  return `${yen(value)}に${scope === 'item' ? '（1個あたり）' : ''}`
}

/** 選んだ値引きの名前（プリセット名、自由入力なら「自由入力」）。 */
export function choiceName(choice: DiscountChoice, presets: DiscountPreset[]): string {
  if ('presetId' in choice) return presets.find((p) => p.id === choice.presetId)?.name ?? '値引き'
  return `自由入力（${choice.reason}）`
}

/** 明細の値引きを API の本文の形にする。 */
export function lineDiscountBody(choice: DiscountChoice | undefined) {
  if (!choice) return {}
  return 'presetId' in choice ? { discount_preset_id: choice.presetId } : { discount_free: { amount: choice.amount, reason: choice.reason } }
}

/** 注文全体の値引きを API の本文の形にする。 */
export function orderDiscountBody(choice: DiscountChoice | undefined) {
  if (!choice) return {}
  return 'presetId' in choice
    ? { order_discount_preset_id: choice.presetId }
    : { order_discount_free: { amount: choice.amount, reason: choice.reason } }
}

/** 保存済みの明細の値引きを、選択の形に戻す（付け直すときに、変えない値引きをそのまま送るため）。 */
export function choiceOfItem(it: OrderItem): DiscountChoice | undefined {
  if (!it.discounted_at) return undefined
  if (it.discount_preset_id != null) return { presetId: it.discount_preset_id }
  return { amount: it.discount_amount, reason: it.discount_reason ?? '' }
}

/** 保存済みの注文全体の値引きを、選択の形に戻す。 */
export function choiceOfOrder(od: OrderDiscount | null): DiscountChoice | undefined {
  if (!od) return undefined
  if (od.preset_id != null) return { presetId: od.preset_id }
  return { amount: od.amount, reason: od.reason ?? '' }
}
