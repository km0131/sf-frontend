// 収支管理（開催回・収支・現金照合）の型と表示名。

/** 開催回（1日ごと。学園祭の回の下に、練習運用・本番の日ごとに作る） */
export type EventSession = {
  id: number
  event_id: number
  event_name: string
  name: string
  /** 開催日（YYYY-MM-DD） */
  date: string
  kind: 'practice' | 'production'
  /** レシート・収支の登録を受け付けるか */
  receipt_open: boolean
  /** 選択肢に出すか */
  is_active: boolean
  sort_order: number
}

export type EntryKind = 'income' | 'expense'

export type LedgerEntry = {
  id: number
  session_id: number
  kind: EntryKind
  category: string
  /** 円（整数） */
  amount: number
  /** 購入日・受取日（YYYY-MM-DD）。開催回の日とは別 */
  entry_date: string
  memo: string
  receipt_id: number | null
  created_by_role: 'system_admin' | 'shop_manager' | 'staff'
  created_by_name: string | null
  confirmed: boolean
  created_at: string
  updated_at: string
}

export type LedgerSummary = {
  /** 注文から自動で集計した売上（支払い済み・取り消しと未受取を除く） */
  sales: number
  sales_orders: number
  income: number
  expense: number
  balance: number
  by_category: { kind: EntryKind; category: string; label: string; amount: number }[]
  cash: { counted_amount: number; float_amount: number; note: string; updated_at: string; difference: number } | null
}

export const kindLabels: Record<EventSession['kind'], string> = { practice: '練習', production: '本番' }
export const entryKindLabels: Record<EntryKind, string> = { income: '収入', expense: '支出' }

/** 科目（科目マスタ。システム管理者が追加・変更する） */
export type LedgerCategory = {
  kind: EntryKind
  code: string
  label: string
  sort_order: number
  is_active: boolean
  /** 負の金額（減らす補正）を入れられるか */
  allow_negative: boolean
}

/** 科目の表示名（科目マスタにない・読み込み前ならコードのまま） */
export function categoryLabel(cats: LedgerCategory[] | undefined, kind: EntryKind, code: string): string {
  return cats?.find((c) => c.kind === kind && c.code === code)?.label ?? code
}

/** 回の本番の開催回をすべて合わせた収支（収支報告・損益分岐・Excel に使う。練習は含めない） */
export type EventReport = {
  event_id: number
  event_name: string
  /** 合計に含めた本番の開催回 */
  sessions: EventSession[]
  summary: LedgerSummary
}

/** 開催回の表示名（例: 「本番1日目（本番・10/26）」） */
export function sessionLabel(s: EventSession): string {
  const [, m, d] = s.date.split('-')
  return `${s.name}（${kindLabels[s.kind]}・${Number(m)}/${Number(d)}）`
}
