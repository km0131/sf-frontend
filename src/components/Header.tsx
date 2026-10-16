import type { ReactNode } from 'react'
import { sealChar } from '../lib/format'

type Props = {
  /** 店名（落款の1文字にも使う） */
  name: string
  /** 落款の文字を変えたいとき（例: システム管理は「祭」） */
  seal?: string
  /** 右側（大学名・学園祭名、タブなど） */
  aside?: ReactNode
}

/** ヘッダー：落款＋店名（左）／大学名 学園祭（右）。下に紫苑の罫線。 */
export function Header({ name, seal, aside }: Props) {
  return (
    <header className="hdr">
      <div className="hdr-title">
        <span className="seal" aria-hidden="true">
          {seal ?? sealChar(name)}
        </span>
        <h1 className="hdr-name">{name}</h1>
      </div>
      {aside && <div className="hdr-aside">{aside}</div>}
    </header>
  )
}
