import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router'

// 全店舗の大画面（/display）の表示設定。端末（ブラウザ）ごとに localStorage へ保存し、URL でも指定できる。
// 優先順位: URL パラメータ ＞ localStorage ＞ 既定値。範囲外・不正な値は既定値として扱う。

export type DisplaySettings = {
  /** 1ページに表示する店舗数 */
  perPage: number
  /** ページを切り替える間隔（秒） */
  interval: number
}

type Key = keyof DisplaySettings

/** 項目ごとの既定値・範囲・URL パラメータ名・保存先のキー。既定値は設定を作る前の表示（3列・15秒）と同じ。 */
export const settingSpecs: Record<Key, { def: number; min: number; max: number; param: string; storage: string }> = {
  perPage: { def: 3, min: 1, max: 12, param: 'per_page', storage: 'sf.display.perPage' },
  interval: { def: 15, min: 3, max: 120, param: 'interval', storage: 'sf.display.interval' },
}
const keys = Object.keys(settingSpecs) as Key[]

/** 範囲内の整数なら数にし、そうでなければ null。 */
export function parseSetting(key: Key, raw: string | null | undefined): number | null {
  if (raw == null || !/^\s*\d+\s*$/.test(raw)) return null
  const n = Number(raw)
  const s = settingSpecs[key]
  return n >= s.min && n <= s.max ? n : null
}

function readStored(key: Key): number | null {
  try {
    return parseSetting(key, localStorage.getItem(settingSpecs[key].storage))
  } catch {
    return null
  }
}

function writeStored(key: Key, value: number | null) {
  try {
    if (value == null) localStorage.removeItem(settingSpecs[key].storage)
    else localStorage.setItem(settingSpecs[key].storage, String(value))
  } catch {
    // 保存できない環境では、この画面を開いている間だけ効く
  }
}

/** 表示設定を読み、変更・既定値に戻す関数を返す。URL で指定されている項目は、変更したら URL も書き換える。 */
export function useDisplaySettings() {
  const [params, setParams] = useSearchParams()
  // localStorage の値は最初に一度だけ読み、以後はこの state を正とする
  const [stored, setStored] = useState(() => Object.fromEntries(keys.map((k) => [k, readStored(k)])) as Record<Key, number | null>)

  const value = (k: Key): number => {
    const spec = settingSpecs[k]
    // URL に項目があればそれを使う（不正・範囲外なら既定値）
    if (params.has(spec.param)) return parseSetting(k, params.get(spec.param)) ?? spec.def
    return stored[k] ?? spec.def
  }
  const settings: DisplaySettings = { perPage: value('perPage'), interval: value('interval') }

  const update = useCallback(
    (patch: Partial<DisplaySettings>) => {
      const entries = Object.entries(patch) as [Key, number][]
      setStored((prev) => ({ ...prev, ...patch }))
      entries.forEach(([k, v]) => writeStored(k, v))
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of entries) if (next.has(settingSpecs[k].param)) next.set(settingSpecs[k].param, String(v))
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  /** 既定値に戻す（保存した値と URL の指定を消す）。 */
  const reset = useCallback(() => {
    setStored(Object.fromEntries(keys.map((k) => [k, null])) as Record<Key, number | null>)
    keys.forEach((k) => writeStored(k, null))
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        keys.forEach((k) => next.delete(settingSpecs[k].param))
        return next
      },
      { replace: true },
    )
  }, [setParams])

  return { settings, update, reset }
}
