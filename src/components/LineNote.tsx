import { useState } from 'react'
import { lineNoteMaxLength } from '../lib/cart'

/** 確認・お会計の商品の行に付ける「ご希望」の入力。ふだんはボタンだけを出し、押すと入力欄を開く。 */
export function LineNoteInput({ value, onChange, label }: { value: string | undefined; onChange: (note: string) => void; label: string }) {
  const [open, setOpen] = useState(!!value)
  if (!open) {
    return (
      <button type="button" className="btn btn-text line-note-add" onClick={() => setOpen(true)}>
        ＋ ご希望
      </button>
    )
  }
  return (
    <input
      className="input line-note-input"
      value={value ?? ''}
      maxLength={lineNoteMaxLength}
      placeholder="例: 〇〇抜き"
      aria-label={`${label}へのご希望`}
      autoFocus={!value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => !value?.trim() && setOpen(false)}
    />
  )
}

/** 注文の明細に出す、商品ごとのご希望（注文帳・注文状況・管理画面で共通）。 */
export function ItemNote({ note }: { note: string | null | undefined }) {
  if (!note) return null
  return <span className="item-note">ご希望: {note}</span>
}
