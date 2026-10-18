import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Header } from '../../components/Header'
import { OptionPicker } from '../../components/OptionPicker'
import { Sheet } from '../../components/Sheet'
import { PausedNotice } from '../../components/PausedNotice'
import { TerminalLine } from '../../components/Terminal'
import { Turnstile } from '../../components/Turnstile'
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
  type CartLine,
} from '../../lib/cart'
import { storeStyle } from '../../lib/colors'
import { seq2, waitLabel, yen } from '../../lib/format'
import { myOrders } from '../../lib/session'
import type { CustomerOrder, MenuItem, PublicMenu } from '../../lib/types'
import { NotFoundPage } from '../NotFoundPage'

const webMaxQuantity = 5

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
    return <NotFoundPage message="このお店は、いま注文を受け付けていません。" />
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

  const plus = (item: MenuItem) => {
    if (count >= webMaxQuantity || shop.paused) return
    if (item.option_groups.length > 0) setPicking(item)
    else setLines((prev) => addLine(pruneLines(prev, items), item.id, [], 1))
  }

  return (
    <div className="page-sp" style={storeStyle(shop.color)}>
      <Header name={shop.name} aside={shop.event_name} />
      <TerminalLine
        command="お品書きを表示"
        aside={`待ち ${shop.waiting_count}組 ${waitLabel(shop.estimated_wait_minutes)}`}
      />
      <div className="row" style={{ paddingTop: 12 }}>
        <Link to="/" className="btn btn-text">
          ‹ お店の一覧に戻る
        </Link>
      </div>
      {shop.paused && <PausedNotice message={shop.pause_message} />}

      <section className="intro fade-in">
        <VerticalLabel text="お品書き" note={shop.description || 'ご注文はおひとり様 5点まで'} />
      </section>

      <section className="fade-in" aria-label="お品書き">
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
                            disabled={count >= webMaxQuantity || shop.paused}
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
          {data.items.length === 0 && <p className="empty">お品書きを準備しています</p>}
        </div>
      </section>

      <div className="spacer" />
      <footer className="order-bar">
        <div className="term">
          <span className="term-cmd">＞ {count}品を選択中</span>
          <span className="term-aside">合計 {yen(total)}</span>
        </div>
        <button type="button" className="btn btn-primary btn-block" disabled={count === 0 || shop.paused} onClick={() => setCheckout(true)}>
          {shop.paused ? '注文の受け付けを中止しています' : '注文する'}
        </button>
      </footer>

      {picking && (
        <Sheet title={picking.name} onClose={() => setPicking(null)}>
          <OptionPicker
            item={picking}
            onAdd={(ids, qty) => {
              setLines((prev) => addLine(pruneLines(prev, items), picking.id, ids, Math.min(qty, webMaxQuantity - count)))
              setPicking(null)
            }}
          />
        </Sheet>
      )}

      {checkout && (
        <CheckoutSheet
          slug={slug}
          shopName={shop.name}
          lines={validLines}
          items={items}
          onRemove={(key) => setLines((prev) => prev.filter((l) => l.key !== key))}
          onClose={() => setCheckout(false)}
        />
      )}
    </div>
  )
}

type CheckoutProps = {
  slug: string
  shopName: string
  lines: CartLine[]
  items: Map<number, MenuItem>
  onRemove: (key: string) => void
  onClose: () => void
}

function CheckoutSheet({ slug, shopName, lines, items, onRemove, onClose }: CheckoutProps) {
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
      setError(errorMessage(e))
      if (e instanceof ApiError && (e.code === 'item_unavailable' || e.code === 'option_unavailable' || e.code === 'event_paused')) {
        void queryClient.invalidateQueries({ queryKey: ['menu', slug] })
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet title="ご注文の確認" onClose={onClose}>
      <div className="stack">
        <div className="lines">
          {lines.map((l) => {
            const item = items.get(l.itemId)
            if (!item) return null
            const opts = optionNames(item, l.optionIds)
            return (
              <div key={l.key} className="lines-row">
                <span>
                  <span className="mincho">{item.name}</span>
                  {opts.length > 0 && <span className="sub">（{opts.join('、')}）</span>}
                  <span className="mono sub"> × {l.quantity}</span>
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
            <span>合計（お受け取りの際にお支払い）</span>
            <span className="mono">{yen(cartTotal(lines, items))}</span>
          </div>
        </div>

        <label className="field">
          <span className="field-label">ご希望（任意）</span>
          <textarea
            className="textarea"
            rows={2}
            value={note}
            maxLength={200}
            placeholder="例: 〇〇抜き、氷少なめ"
            onChange={(e) => setNote(e.target.value)}
          />
          <span className="field-hint">抜いてほしいものなどがあれば書いてください（200文字まで）。ご希望はお作りするときにだけ使い、学園祭の終了から30日後に消去します。</span>
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
            入力すると、整理番号の控えと、できあがりのお知らせを送ります。お名前・メールアドレスはこの目的にだけ使い、学園祭の終了から30日後に消去します。
          </span>
        </label>

        <Turnstile onToken={onToken} />
        {error && <p className="error-text">{error}</p>}

        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={lines.length === 0 || !token || sending}
          onClick={submit}
        >
          {sending ? '送信しています' : '注文を確定する'}
        </button>
      </div>
    </Sheet>
  )
}
