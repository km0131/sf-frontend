import type { MenuItem, StockLevel } from './types'

// 限定商品の在庫の表示と、SSE で届いた在庫の反映

/** 配信で届いた在庫を、メニューの商品に反映する（残り数・注文できるか）。 */
export function applyStock<T extends { items: MenuItem[] }>(menu: T | undefined, lv: StockLevel): T | undefined {
  if (!menu) return menu
  return {
    ...menu,
    items: menu.items.map((it) =>
      it.id === lv.menu_item_id && it.is_limited
        ? { ...it, remaining: lv.remaining, sold: lv.sold ?? it.sold, orderable: it.is_available && lv.remaining > 0 }
        : it,
    ),
  }
}

/** 残り数の表示（例: 残り3個）。限定商品でなければ null。 */
export function remainingLabel(item: MenuItem): string | null {
  if (!item.is_limited) return null
  const n = item.remaining ?? 0
  return n > 0 ? `残り${n}個` : '本日分は売り切れ'
}

/** 「残りわずか」か（限定商品で、残りが 1 以上・しきい値以下）。 */
export function isLowStock(item: MenuItem, threshold: number): boolean {
  return item.is_limited && (item.remaining ?? 0) > 0 && (item.remaining ?? 0) <= threshold
}

/** 在庫の修正の理由 */
export const adjustReasons = [
  { value: 'additional', label: '追加で焼けた' },
  { value: 'waste', label: '失敗・廃棄' },
  { value: 'recount', label: '数え直し' },
  { value: 'other', label: 'その他' },
] as const

export type AdjustReason = (typeof adjustReasons)[number]['value']

export function reasonLabel(r: string | null): string {
  if (r == null) return '限定数の設定'
  return adjustReasons.find((x) => x.value === r)?.label ?? r
}
