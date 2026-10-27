import '@fontsource/zen-old-mincho/700.css'
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/500.css'
import '@fontsource/noto-sans-jp/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './ticket.css'
import pageCssUrl from './ticket-page.css?url'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiFetch, errorMessage } from '../../../lib/api'
import type { List } from '../../../lib/types'
import { PageHead, Panel } from '../common'
import { useManage } from '../context'
import { TicketSheet, type TicketShop } from './TicketSheet'

/** シート（A4 1枚・8面）の枚数の上限 */
const MAX_SHEETS = 20

/** 開催回（店長: GET /api/manage/events、管理者: GET /api/admin/events。新しい順） */
type TicketEvent = { id: number; name: string; is_current: boolean; order_prefix?: string }
/** 開催回に出店する店舗（GET /api/admin/events/:id/shops） */
type EventShop = { shop_id: number; name: string; order_prefix: string; is_active: boolean }

/** 引換票の印刷（/manage/tickets/print）。店長は自分の店、システム管理者は出店している全店舗。
 *  開催回を選べる（既定は今の開催回。頭文字は開催回ごとに決まるため）。
 *  店舗名と頭文字はシステムのデータから入れ、注文番号の数字と確認コードは手書き用に空けておく。 */
export function TicketPrintPage() {
  const { token, session } = useManage()
  const isAdmin = session.role === 'system_admin'
  const [eventId, setEventId] = useState<number | null>(null)
  const [sheets, setSheets] = useState(1)
  // 印刷しない店舗（管理者）。開催回ごとに頭文字が変わるので「開催回ID:頭文字」で持つ
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const [printing, setPrinting] = useState(false)
  usePageStylesheet(pageCssUrl)

  // 開催回の一覧。店長は自分の店が出店した開催回だけ（API がトークンの店舗だけを返す）
  const events = useQuery({
    queryKey: isAdmin ? ['admin', 'events'] : ['manage', 'events'],
    queryFn: () => apiFetch<List<TicketEvent>>(isAdmin ? '/api/admin/events' : '/api/manage/events', { token }).then((r) => r.items),
  })
  const event = events.data?.find((e) => e.id === eventId) ?? events.data?.find((e) => e.is_current) ?? events.data?.[0]

  // 店長: 自分の店の名前
  const manage = useQuery({
    queryKey: ['manage', 'shop'],
    queryFn: () => apiFetch<{ name: string }>('/api/manage/shop', { token }),
    enabled: !isAdmin,
  })
  // 管理者: 選んだ開催回に出店している店舗（頭文字の順）
  const eventShops = useQuery({
    queryKey: ['admin', 'events', event?.id, 'shops'],
    queryFn: () => apiFetch<List<EventShop>>(`/api/admin/events/${event?.id}/shops`, { token }).then((r) => r.items),
    enabled: isAdmin && event != null,
  })

  const { shops, reason } = ticketShops(isAdmin, events, event, manage, eventShops)
  const excludeKey = (s: TicketShop) => `${event?.id}:${s.prefix}`
  const targets = shops.filter((s) => !excluded.has(excludeKey(s)))
  const disabled = reason != null || targets.length === 0 || printing

  const print = async () => {
    setPrinting(true)
    try {
      await loadFonts(targets)
      window.print()
    } finally {
      setPrinting(false)
    }
  }

  const pages = targets.flatMap((shop) => Array.from({ length: sheets }, (_, i) => ({ key: `${shop.prefix}-${i}`, shop })))

  return (
    <div className="mpage">
      <PageHead title="引換票を印刷" />
      <Panel>
        <div className="tp-controls">
          {events.data && events.data.length > 0 && (
            <label className="row" style={{ gap: 8 }}>
              <span className="field-label" style={{ whiteSpace: 'nowrap' }}>
                開催回
              </span>
              <select
                className="select"
                style={{ width: 'auto', maxWidth: '100%' }}
                value={event?.id ?? ''}
                onChange={(e) => setEventId(Number(e.target.value))}
              >
                {events.data.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.is_current ? '（今の開催回）' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {isAdmin && shops.length > 0 && (
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label">印刷する店舗</legend>
              <div className="tp-shop-list">
                {shops.map((s) => (
                  <label key={s.prefix} className="row" style={{ gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={!excluded.has(excludeKey(s))}
                      onChange={(e) =>
                        setExcluded((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.delete(excludeKey(s))
                          else next.add(excludeKey(s))
                          return next
                        })
                      }
                    />
                    <span>
                      <span className="mono">{s.prefix}</span> {s.name}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <label className="row" style={{ gap: 8 }}>
              <span className="field-label" style={{ whiteSpace: 'nowrap' }}>
                枚数{isAdmin ? '（1店舗あたり）' : ''}
              </span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_SHEETS}
                value={sheets}
                style={{ width: 88 }}
                onChange={(e) => setSheets(clampSheets(e.target.valueAsNumber))}
              />
              <span className="sub">シート（1シート8面）</span>
            </label>
            <button type="button" className="btn btn-primary" disabled={disabled} onClick={() => void print()}>
              {printing ? '準備しています' : '印刷する'}
            </button>
          </div>
          <p className="field-hint">
            A4・倍率100%・余白なし（または最小）で印刷してください。
            {targets.length > 0 && !reason && `（${pages.length}ページ）`}
          </p>
          {reason && <p className="error-text">{reason}</p>}
        </div>
      </Panel>

      {/* 画面での見本（印刷では隠し、下の .tp-print を印刷する） */}
      {!reason && targets.length > 0 && (
        <div className="tp-preview" aria-label="印刷の見本">
          {targets.map((shop) => (
            <div key={shop.prefix}>
              {isAdmin && (
                <p className="tp-shop-head">
                  <span className="mono">{shop.prefix}</span> {shop.name}（{sheets}シート）
                </p>
              )}
              <TicketSheet shop={shop} />
            </div>
          ))}
        </div>
      )}

      {!reason &&
        createPortal(
          <div className="tp-print">
            {pages.map((p) => (
              <TicketSheet key={p.key} shop={p.shop} />
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}

/** 枚数を 1〜MAX_SHEETS に収める（空欄・数字でない入力は1） */
function clampSheets(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.min(MAX_SHEETS, Math.max(1, Math.trunc(n)))
}

type QueryState<T> = { data?: T; error: unknown; isLoading: boolean }

/** 印刷する店舗と、印刷できないときの理由。 */
function ticketShops(
  isAdmin: boolean,
  events: QueryState<TicketEvent[]>,
  event: TicketEvent | undefined,
  manage: QueryState<{ name: string }>,
  eventShops: QueryState<EventShop[]>,
): { shops: TicketShop[]; reason: string | null } {
  for (const q of isAdmin ? [events, eventShops] : [events, manage]) {
    if (q.isLoading) return { shops: [], reason: '店舗の情報を読み込んでいます…' }
    if (q.error) return { shops: [], reason: `店舗の情報を読み込めませんでした（${errorMessage(q.error)}）` }
  }
  if (!event) {
    return {
      shops: [],
      reason: isAdmin
        ? '開催回がないため、印刷できません。開催回の画面で作ってください。'
        : 'この店舗が出店した開催回がないため、注文番号の頭文字がありません。システム管理者にお問い合わせください。',
    }
  }

  if (isAdmin) {
    const shops = (eventShops.data ?? []).flatMap((s) =>
      s.is_active && validPrefix(s.order_prefix) ? [{ name: s.name, prefix: s.order_prefix.toUpperCase() }] : [],
    )
    return shops.length > 0 ? { shops, reason: null } : { shops, reason: `「${event.name}」に出店している店舗がないため、印刷できません。` }
  }

  if (!manage.data || !validPrefix(event.order_prefix)) {
    return { shops: [], reason: `「${event.name}」での注文番号の頭文字が分かりません。システム管理者にお問い合わせください。` }
  }
  return { shops: [{ name: manage.data.name, prefix: event.order_prefix.toUpperCase() }], reason: null }
}

function validPrefix(p: string | null | undefined): p is string {
  return !!p && /^[A-Za-z]{1,2}$/.test(p)
}

/** 印刷に使う字を先に読み込む（フォントは使う字の範囲ごとのファイルなので、印刷の前に読み込みを待つ）。 */
async function loadFonts(shops: TicketShop[]) {
  const names = shops.map((s) => s.name).join('')
  const prefixes = shops.map((s) => s.prefix).join('')
  const notes = '学園祭 注文システム店舗名注文番号確認コードできあがりは番号でお呼びします。お受け取りの際にこの紙をご提示ください。スマホからの呼び出し'
  try {
    await Promise.all([
      document.fonts.load('700 16.5pt "Zen Old Mincho"', 'お引換票'),
      document.fonts.load('400 9pt "Noto Sans JP"', notes),
      document.fonts.load('500 9pt "Noto Sans JP"', '店舗名'),
      document.fonts.load('700 11pt "Noto Sans JP"', names + '注文番号確認コード'),
      document.fonts.load('400 9pt "JetBrains Mono"', '> sf / order_ticket_ No. CODE sf.a-kiis.com'),
      document.fonts.load('600 18pt "JetBrains Mono"', prefixes + '-'),
    ])
  } catch {
    // 読み込めなくても、代わりのフォントで印刷できる
  }
  await document.fonts.ready
}

/** このページを開いているあいだだけ、スタイルシート（@page など、ほかの画面の印刷に効かせたくないもの）を足す。 */
function usePageStylesheet(href: string) {
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
    return () => link.remove()
  }, [href])
}
