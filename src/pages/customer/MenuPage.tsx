import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Header } from '../../components/Header'
import { OptionPicker } from '../../components/OptionPicker'
import { Sheet } from '../../components/Sheet'
import { PausedNotice } from '../../components/PausedNotice'
import { TerminalLine } from '../../components/Terminal'
import { Turnstile, TURNSTILE_ACTION_WEB_ORDER } from '../../components/Turnstile'
import { VerticalLabel } from '../../components/VerticalLabel'
import { ApiError, apiFetch, errorMessage, mediaUrl } from '../../lib/api'
import {
  addLine,
  cartCount,
  cartTotal,
  optionNames,
  pruneLines,
  quantityOf,
  removeOne,
  toOrderItems,
  unitPrice,
  setLineNote,
  type CartLine,
} from '../../lib/cart'
import { LineNoteInput } from '../../components/LineNote'
import { storeStyle } from '../../lib/colors'
import { seq2, waitLabel, yen } from '../../lib/format'
import { myOrders } from '../../lib/session'
import type { BusinessType, CustomerOrder, MenuItem, PublicMenu } from '../../lib/types'
import { wording } from '../../lib/wording'
import { NotFoundPage } from '../NotFoundPage'

/** お客様: お品書き・注文。 */
export function MenuPage() {
  const { slug = '' } = useParams()
  const { data, error, isLoading } = useQuery({
    queryKey: ['menu', slug],
    queryFn: () => apiFetch<PublicMenu>(`/api/shops/${encodeURIComponent(slug)}/menu`),
    refetchInterval: 30000,
  })
  const [lines, setLines] = useState<CartLine[]>([])
  const [picking, setPicking] = useState<MenuItem | null>(null)
  const [checkout, setCheckout] = useState(false)

  const items = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data])
  // メニューが更新されたら、売り切れになった品をカートから外す
  const validLines = useMemo(() => (data ? pruneLines(lines, items) : lines), [data, lines, items])
  const count = cartCount(validLines)
  const total = cartTotal(validLines, items)

  if (error instanceof ApiError && error.code === 'shop_not_open') {
    return <NotFoundPage message="このお店は、いま受付をしていません。" />
  }
  if (isLoading || !data) {
    return (
      <div className="page-sp">
        {error ? <p className="error-text" style={{ marginTop: 40 }}>{errorMessage(error)}</p> : <p className="empty">読み込んでいます…</p>}
      </div>
    )
  }

  const { shop } = data
  const groups = [
    ...data.categories.map((c) => ({ name: c.name, items: data.items.filter((i) => i.category_id === c.id) })),
    { name: data.categories.length ? 'そのほか' : '', items: data.items.filter((i) => !data.categories.some((c) => c.id === i.category_id)) },
  ].filter((g) => g.items.length > 0)
  let seq = 0

  // 1回の注文の合計数量の上限（店舗の設定。なければ既定値。サーバーが決めた値を使う）
  const maxQty = shop.web_order_max_quantity
  const atLimit = count >= maxQty

  const plus = (item: MenuItem) => {
    if (atLimit || shop.paused) return
    if (item.option_groups.length > 0) setPicking(item)
    else setLines((prev) => addLine(pruneLines(prev, items), item.id, [], 1))
  }

  const w = wording(shop.business_type)
  return (
    <div className="page-sp" style={storeStyle(shop.color)}>
      <Header name={shop.name} aside={shop.event_name} />
      <TerminalLine
        command={w.menuCommand}
        aside={`待ち ${shop.waiting_count}組 ${waitLabel(shop.estimated_wait_minutes)}`}
      />
      <div className="row" style={{ paddingTop: 12 }}>
        <Link to="/" className="btn btn-text">
          ‹ お店の一覧に戻る
        </Link>
      </div>
      {shop.paused && <PausedNotice message={shop.pause_message} />}

      <section className="intro fade-in">
        <VerticalLabel text={w.menuTitle} note={shop.description || w.menuLimitNote(maxQty)} />
      </section>

      <section className="fade-in" aria-label={w.menuTitle}>
        <div>
          {groups.map((g) => (
            <div key={g.name}>
              {g.name && <h2 className="cat-title">{g.name}</h2>}
              {g.items.map((item) => {
                seq += 1
                const q = quantityOf(validLines, item.id)
                const soldOut = !item.is_available
                return (
                  <div key={item.id} className={`item ${q > 0 ? 'is-selected' : ''} ${soldOut ? 'is-soldout' : ''}`}>
                    <span className="item-seq">{seq2(seq)}</span>
                    {item.image_url ? (
                      <img className="photo" src={mediaUrl(item.image_url)} alt="" loading="lazy" />
                    ) : (
                      <span className="photo" aria-hidden="true" />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div className="item-name">
                        <span>{item.name}</span>
                        <span className="dot" aria-hidden="true" />
                      </div>
                      <div className="item-price">{soldOut ? '売り切れ' : yen(item.price)}</div>
                      {item.option_groups.length > 0 && !soldOut && (
                        <div className="item-opts">{item.option_groups.map((g) => g.name).join('・')}を選べます</div>
                      )}
                    </div>
                    <div className="item-ctrl">
                      {!soldOut && (
                        <>
                          <button
                            type="button"
                            className="qty"
                            aria-label={`${item.name}を減らす`}
                            disabled={q === 0}
                            onClick={() => setLines((prev) => removeOne(prev, item.id))}
                          >
                            −
                          </button>
                          <span className="item-qty" aria-label="数量">
                            {q}
                          </span>
                          <button
                            type="button"
                            className="qty"
                            aria-label={`${item.name}を増やす`}
                            disabled={atLimit || shop.paused}
                            onClick={() => plus(item)}
                          >
                            +
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          {data.items.length === 0 && <p className="empty">{w.menuEmpty}</p>}
        </div>
      </section>

      <div className="spacer" />
      <footer className="order-bar">
        {atLimit && (
          <p className="field-hint" role="status" style={{ marginBottom: 8 }}>
            {w.limitReached(maxQty)}
          </p>
        )}
        <div className="term">
          <span className="term-cmd">
            ＞ {count}
            {w.countUnit}を選択中
          </span>
          <span className="term-aside">合計 {yen(total)}</span>
        </div>
        <button type="button" className="btn btn-primary btn-block" disabled={count === 0 || count > maxQty || shop.paused} onClick={() => setCheckout(true)}>
          {shop.paused ? w.orderPausedButton : w.orderButton}
        </button>
      </footer>

      {picking && (
        <Sheet title={picking.name} onClose={() => setPicking(null)}>
          <OptionPicker
            item={picking}
            maxQuantity={Math.max(1, maxQty - count)}
            onAdd={(ids, qty) => {
              setLines((prev) => addLine(pruneLines(prev, items), picking.id, ids, Math.min(qty, maxQty - count)))
              setPicking(null)
            }}
          />
        </Sheet>
      )}

      {checkout && (
        <CheckoutSheet
          slug={slug}
          shopName={shop.name}
          businessType={shop.business_type}
          pickupHoldMinutes={shop.pickup_hold_minutes}
          lines={validLines}
          items={items}
          onRemove={(key) => setLines((prev) => prev.filter((l) => l.key !== key))}
          onNote={(key, note) => setLines((prev) => setLineNote(prev, key, note))}
          onClose={() => setCheckout(false)}
        />
      )}
    </div>
  )
}

type CheckoutProps = {
  slug: string
  shopName: string
  businessType: BusinessType
  /** 呼び出し後の取り置き時間（分） */
  pickupHoldMinutes: number
  lines: CartLine[]
  items: Map<number, MenuItem>
  onRemove: (key: string) => void
  onNote: (key: string, note: string) => void
  onClose: () => void
}

function CheckoutSheet({ slug, shopName, businessType, pickupHoldMinutes, lines, items, onRemove, onNote, onClose }: CheckoutProps) {
  const w = wording(businessType)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onToken = useCallback((t: string | null) => setToken(t), [])

  const submit = async () => {
    setSending(true)
    setError(null)
    try {
      const res = await apiFetch<{ order: CustomerOrder; public_token: string }>(
        `/api/shops/${encodeURIComponent(slug)}/orders`,
        {
          method: 'POST',
          body: {
            items: toOrderItems(lines),
            customer_name: name.trim() || undefined,
            email: email.trim() || undefined,
            note: note.trim() || undefined,
            turnstile_token: token ?? '',
          },
        },
      )
      myOrders.add({ token: res.public_token, order_no: res.order.order_no, shop: shopName, created_at: res.order.created_at })
      navigate(`/o/${res.public_token}`, { replace: true })
    } catch (e) {
      const max = e instanceof ApiError && e.code === 'too_many_items' ? Number(e.details?.max_quantity) : NaN
      setError(Number.isFinite(max) ? w.limitReached(max) : errorMessage(e))
      if (e instanceof ApiError && (e.code === 'too_many_items' || e.code === 'item_unavailable' || e.code === 'option_unavailable' || e.code === 'event_paused')) {
        void queryClient.invalidateQueries({ queryKey: ['menu', slug] })
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet title={w.confirmTitle} onClose={onClose}>
      <div className="stack">
        <div className="lines">
          {lines.map((l) => {
            const item = items.get(l.itemId)
            if (!item) return null
            const opts = optionNames(item, l.optionIds)
            return (
              <div key={l.key} className="lines-row">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="mincho">{item.name}</span>
                  {opts.length > 0 && <span className="sub">（{opts.join('、')}）</span>}
                  <span className="mono sub"> × {l.quantity}</span>
                  <LineNoteInput value={l.note} label={item.name} onChange={(note) => onNote(l.key, note)} />
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <span className="mono">{yen(unitPrice(item, l.optionIds) * l.quantity)}</span>
                  <button type="button" className="btn btn-text" onClick={() => onRemove(l.key)}>
                    外す
                  </button>
                </span>
              </div>
            )
          })}
          <div className="lines-total">
            {cartTotal(lines, items) === 0 ? (
              <span>料金はかかりません</span>
            ) : (
              <>
                <span>{w.totalUnpaid}</span>
                <span className="mono">{yen(cartTotal(lines, items))}</span>
              </>
            )}
          </div>
        </div>

        <label className="field">
          <span className="field-label">全体へのご希望（任意）</span>
          <textarea
            className="textarea"
            rows={2}
            value={note}
            maxLength={200}
            placeholder="例: 〇〇抜き、氷少なめ"
            onChange={(e) => setNote(e.target.value)}
          />
          <span className="field-hint">{w.noteHint}</span>
        </label>
        <label className="field">
          <span className="field-label">お名前（任意）</span>
          <input className="input" value={name} maxLength={50} autoComplete="name" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">メールアドレス（任意）</span>
          <input
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            maxLength={254}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className="field-hint">
            {w.emailHint}
          </span>
        </label>

        <p className="field-hint">
          {cartTotal(lines, items) > 0 && w.payNote}
          {w.cancelLimitNote}
          {pickupHoldMinutes > 0 && w.holdNote(pickupHoldMinutes)}
        </p>

        <Turnstile action={TURNSTILE_ACTION_WEB_ORDER} onToken={onToken} />
        {error && <p className="error-text">{error}</p>}

        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={lines.length === 0 || !token || sending}
          onClick={submit}
        >
          {sending ? '送信しています' : w.confirmSubmit}
        </button>
      </div>
    </Sheet>
  )
}
