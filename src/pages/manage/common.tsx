import type { ReactNode } from 'react'
import { shopColors } from '../../lib/colors'
import type { ShopColor } from '../../lib/types'

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mpage-head">
      <h2 className="mpage-title">{title}</h2>
      {children && <div className="row">{children}</div>}
    </div>
  )
}

export function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="panel">
      {title && <h3 className="panel-title">{title}</h3>}
      {children}
    </section>
  )
}

/** 保存結果の短いお知らせ。 */
export function Notice({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (error) return <p className="error-text">{error}</p>
  if (ok) return <p className="sub" style={{ fontSize: 13 }}>{ok}</p>
  return null
}

/** 店舗色を4色から選ぶ。 */
export function ColorPicker({ value, onChange }: { value: ShopColor; onChange: (c: ShopColor) => void }) {
  return (
    <div className="swatches" role="group" aria-label="店舗色">
      {(Object.keys(shopColors) as ShopColor[]).map((c) => (
        <button key={c} type="button" className="swatch" aria-pressed={value === c} onClick={() => onChange(c)}>
          <span className="dot dot-lg" style={{ background: shopColors[c].hex }} aria-hidden="true" />
          {shopColors[c].label}
        </button>
      ))}
    </div>
  )
}
