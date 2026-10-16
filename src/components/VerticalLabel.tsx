import type { ReactNode } from 'react'

type Props = {
  text: string
  note?: string
  children?: ReactNode
}

/** 縦書きラベル（「お品書き」「お呼び出し番号」など）。右側に中身を並べる。 */
export function VerticalLabel({ text, note, children }: Props) {
  return (
    <div className="vlabel">
      <span className="vlabel-text">{text}</span>
      {note && <span className="vlabel-note">{note}</span>}
      {children && <div style={{ flex: 1, minWidth: 0 }}>{children}</div>}
    </div>
  )
}
