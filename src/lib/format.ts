// 表示用の整形

/** 金額を「¥1,234」の形にする。 */
export function yen(n: number): string {
  return `¥${n.toLocaleString('ja-JP')}`
}

/** 時刻を「12:03」の形にする。 */
export function hhmm(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** 日時を「10/16 12:03」の形にする。 */
export function mdhm(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${hhmm(iso)}`
}

/** 通し番号を「01」の形にする。 */
export function seq2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 経過分（from から now まで）。 */
export function minutesSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0
  return Math.floor((now - new Date(iso).getTime()) / 60000)
}

/** 待ち時間の目安を「約12分」の形にする。見積もれなければ「—」。 */
export function waitLabel(minutes: number | null | undefined): string {
  if (minutes == null) return '—'
  return `約${minutes}分`
}

/** 落款の1文字（店名の最初の文字）。 */
export function sealChar(name: string | undefined): string {
  return name ? Array.from(name.trim())[0] ?? '祭' : '祭'
}

// 状態の表示名は店舗の種類で変わるので lib/wording.ts（wording(type).status）にある
