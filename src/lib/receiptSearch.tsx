// レシートの検索の条件（API の名前のまま）と、検索語の強調。
import type { ReactNode } from 'react'
import type { ReceiptStatus } from './receipts'

/** 検索の条件（API の名前のまま。空は絞り込まない） */
export type ReceiptQuery = {
  q: string
  no: string
  amount: string
  amount_min: string
  amount_max: string
  date_from: string
  date_to: string
  category: string
  status: '' | ReceiptStatus
  uploader: '' | 'staff'
  session_id: string
  shop_id: string
}

export const emptyQuery: ReceiptQuery = {
  q: '',
  no: '',
  amount: '',
  amount_min: '',
  amount_max: '',
  date_from: '',
  date_to: '',
  category: '',
  status: '',
  uploader: '',
  session_id: '',
  shop_id: '',
}

export const toParams = (q: ReceiptQuery) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v.trim()) p.set(k, v.trim())
  return p
}

/** 検索語（表示の強調に使う。サーバーと同じく NFKC・小文字・空白区切り） */
export const keywordsOf = (q: string) => q.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean)


/** 文字の中の検索語を <mark> で囲む（text は NFKC 済み。大文字小文字は無視） */
export function highlight(text: string, keywords: string[]) {
  if (keywords.length === 0) return text
  const lower = text.toLowerCase()
  const marks: boolean[] = new Array(text.length).fill(false)
  for (const k of keywords) {
    for (let at = lower.indexOf(k); at >= 0; at = lower.indexOf(k, at + 1)) marks.fill(true, at, at + k.length)
  }
  const out: ReactNode[] = []
  let start = 0
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marks[i] !== marks[start]) {
      const part = text.slice(start, i)
      out.push(marks[start] ? <mark key={start}>{part}</mark> : part)
      start = i
    }
  }
  return out
}
