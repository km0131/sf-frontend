import type { MenuItem, OptionGroup } from './types'

/** カートの1行。同じ商品でもオプションが違えば別の行。 */
export type CartLine = {
  key: string
  itemId: number
  optionIds: number[]
  quantity: number
}

export function lineKey(itemId: number, optionIds: number[]): string {
  return `${itemId}:${[...optionIds].sort((a, b) => a - b).join(',')}`
}

/** 行を足す（同じ組み合わせがあれば数量を足す）。 */
export function addLine(lines: CartLine[], itemId: number, optionIds: number[], quantity: number): CartLine[] {
  const key = lineKey(itemId, optionIds)
  const found = lines.find((l) => l.key === key)
  if (found) return lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l))
  return [...lines, { key, itemId, optionIds, quantity }]
}

/** その商品の最後の行を1つ減らす。 */
export function removeOne(lines: CartLine[], itemId: number): CartLine[] {
  const idx = lines.map((l) => l.itemId).lastIndexOf(itemId)
  if (idx < 0) return lines
  const l = lines[idx]
  if (l.quantity > 1) return lines.map((x, i) => (i === idx ? { ...x, quantity: x.quantity - 1 } : x))
  return lines.filter((_, i) => i !== idx)
}

export function quantityOf(lines: CartLine[], itemId: number): number {
  return lines.filter((l) => l.itemId === itemId).reduce((s, l) => s + l.quantity, 0)
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

/**
 * 組の中で選ばれたオプションの追加料金の合計（バックエンドの menu.OptionGroup.Delta と同じ計算）。
 * まとめ値段があれば、追加料金の高いものから bundle_count 個ずつを bundle_price 円にまとめる（高くなるならまとめない）。
 */
export function groupDelta(g: OptionGroup, optionIds: number[]): number {
  const deltas = g.options.filter((o) => optionIds.includes(o.id)).map((o) => o.price_delta)
  const n = g.bundle_count
  if (n == null || g.bundle_price == null || n < 2) return sum(deltas)
  deltas.sort((a, b) => b - a)
  let total = 0
  while (deltas.length >= n) {
    total += Math.min(sum(deltas.splice(0, n)), g.bundle_price)
  }
  return total + sum(deltas)
}

export function unitPrice(item: MenuItem, optionIds: number[]): number {
  return item.price + sum(item.option_groups.map((g) => groupDelta(g, optionIds)))
}

export function optionNames(item: MenuItem, optionIds: number[]): string[] {
  return item.option_groups.flatMap((g) => g.options).filter((o) => optionIds.includes(o.id)).map((o) => o.name)
}

export function cartTotal(lines: CartLine[], items: Map<number, MenuItem>): number {
  return lines.reduce((s, l) => {
    const item = items.get(l.itemId)
    return item ? s + unitPrice(item, l.optionIds) * l.quantity : s
  }, 0)
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.quantity, 0)
}

/** API に送る形にする。 */
export function toOrderItems(lines: CartLine[]) {
  return lines.map((l) => ({ menu_item_id: l.itemId, quantity: l.quantity, option_ids: l.optionIds }))
}

/** メニューが更新されて、消えた商品・売り切れの商品を含む行を取り除く。 */
export function pruneLines(lines: CartLine[], items: Map<number, MenuItem>): CartLine[] {
  return lines.filter((l) => {
    const item = items.get(l.itemId)
    if (!item || !item.is_available) return false
    const opts = item.option_groups.flatMap((g) => g.options)
    return l.optionIds.every((id) => opts.find((o) => o.id === id)?.is_available)
  })
}
