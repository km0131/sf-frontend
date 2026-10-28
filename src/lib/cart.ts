import type { MenuItem, OptionGroup } from './types'

/** カートの1行。同じ商品でもオプションが違えば別の行。 */
export type CartLine = {
  key: string
  itemId: number
  optionIds: number[]
  quantity: number
  /** この行（数量の全部）へのご希望。確認・お会計の画面で入力する */
  note?: string
}

/** 商品ごとのご希望の上限（バックエンドと同じ） */
export const lineNoteMaxLength = 100

/** 行のご希望を変える。 */
export function setLineNote(lines: CartLine[], key: string, note: string): CartLine[] {
  return lines.map((l) => (l.key === key ? { ...l, note } : l))
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
  return lines.map((l) => ({ menu_item_id: l.itemId, quantity: l.quantity, option_ids: l.optionIds, note: l.note?.trim() || undefined }))
}

/** メニューが更新されて、消えた商品・売り切れの商品を含む行を取り除き、限定商品は残り数・購入上限までに減らす。 */
export function pruneLines(lines: CartLine[], items: Map<number, MenuItem>): CartLine[] {
  const kept = lines.filter((l) => {
    const item = items.get(l.itemId)
    if (!item || !item.orderable) return false
    const opts = item.option_groups.flatMap((g) => g.options)
    return l.optionIds.every((id) => opts.find((o) => o.id === id)?.is_available)
  })
  let out = kept
  for (const item of items.values()) {
    const max = itemLimit(item)
    if (max != null) out = clampItem(out, item.id, max)
  }
  return out
}

/** その商品をカートに入れられる最大数（限定商品の残り数と、1注文あたりの購入上限の小さいほう）。上限がなければ null。 */
export function itemLimit(item: MenuItem): number | null {
  const limits = [item.is_limited ? (item.remaining ?? 0) : null, item.purchase_limit_per_order].filter((v): v is number => v != null)
  return limits.length ? Math.min(...limits) : null
}

/** その商品の行の合計数量を max までに減らす（後ろの行から減らし、0 になった行は外す）。 */
export function clampItem(lines: CartLine[], itemId: number, max: number): CartLine[] {
  let over = quantityOf(lines, itemId) - Math.max(0, max)
  if (over <= 0) return lines
  const out = [...lines]
  for (let i = out.length - 1; i >= 0 && over > 0; i--) {
    if (out[i].itemId !== itemId) continue
    const cut = Math.min(over, out[i].quantity)
    over -= cut
    out[i] = { ...out[i], quantity: out[i].quantity - cut }
  }
  return out.filter((l) => l.quantity > 0)
}
