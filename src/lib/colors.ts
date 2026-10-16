import type { CSSProperties } from 'react'
import type { ShopColor } from './types'

/** 店舗色（デザイン仕様書 2章）。面では塗らず、点・短い線にだけ使う。 */
export const shopColors: Record<ShopColor, { hex: string; label: string }> = {
  yamabuki: { hex: '#B8863B', label: '山吹茶' },
  seiji: { hex: '#6B8E73', label: '青磁' },
  sakuranezumi: { hex: '#B07D84', label: '桜鼠' },
  sabiasagi: { hex: '#7A8C9E', label: '錆浅葱' },
}

/** 画面のいちばん外側に付けて、店舗色の CSS 変数を差し替える。 */
export function storeStyle(color: ShopColor | undefined): CSSProperties {
  return { '--c-store': shopColors[color ?? 'yamabuki']?.hex ?? shopColors.yamabuki.hex } as CSSProperties
}
