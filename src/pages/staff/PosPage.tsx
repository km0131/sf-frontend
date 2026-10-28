import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { DiscountPicker } from '../../components/DiscountPicker'
import { DiscountTotals } from '../../components/OrderDiscountEditor'
import { OptionPicker } from '../../components/OptionPicker'
import { PausedNotice } from '../../components/PausedNotice'
import { Sheet } from '../../components/Sheet'
import { StockAdjust } from '../../components/StockAdjust'
import { TerminalLine } from '../../components/Terminal'
import { VerticalLabel } from '../../components/VerticalLabel'
import { ApiError, apiFetch, errorMessage } from '../../lib/api'
import { LineNoteInput } from '../../components/LineNote'
import { addLine, cartCount, itemLimit, optionNames, quantityOf, setLineNote, toOrderItems, unitPrice, type CartLine } from '../../lib/cart'
import { autoOf, choiceName, lineDiscount, lineDiscountBody, orderDiscount, orderDiscountBody, withAuto, type DiscountChoice } from '../../lib/discount'
import { yen } from '../../lib/format'
import { applyStock, isLowStock } from '../../lib/stock'
import type { Category, MenuItem, Order, OrderClaim, Shortage, StaffDiscounts, StaffShop, StockLevel } from '../../lib/types'
import { wording } from '../../lib/wording'
import { ClaimPanel } from './ClaimPanel'
import { staffKeys } from './keys'
import { SoldOutSheet } from './SoldOutSheet'

type StaffMenu = { categories: Category[]; items: MenuItem[] }

/** 値引きを選んでいる対象（カートの行か、注文全体） */
type DiscountTarget = { kind: 'item'; key: string } | { kind: 'order' }

/** レジ：対面の注文を入力し、会計して整理番号を出す。売り切れの切り替え・限定数の修正・値引きもここで行う。 */
export function PosPage({ slug, token, shop }: { slug: string; token: string; shop?: StaffShop }) {
  const queryClient = useQueryClient()
  const menu = useQuery({
    queryKey: staffKeys.menu(slug),
    queryFn: () => apiFetch<StaffMenu>('/api/staff/menu', { token }),
  })
  const discounts = useQuery({
    queryKey: staffKeys.discounts(slug),
    queryFn: () => apiFetch<StaffDiscounts>('/api/staff/discounts', { token }),
  })
  const presets = discounts.data?.items ?? []
  // 店長が自動で適用している値引き（値引きを選んでいない明細・注文に付く）
  const auto = autoOf(presets)
  const [lines, setLines] = useState<CartLine[]>([])
  const [orderChoice, setOrderChoice] = useState<DiscountChoice | undefined>()
  const [picking, setPicking] = useState<MenuItem | null>(null)
  const [discountTarget, setDiscountTarget] = useState<DiscountTarget | null>(null)
  const [soldOutMode, setSoldOutMode] = useState(false)
  // 売り切れ設定で開いている商品（選択肢のある商品は、選択肢ごとに切り替える画面を出す）
  const [soldOutItemId, setSoldOutItemId] = useState<number | null>(null)
  // 限定数を直している商品
  const [stockItemId, setStockItemId] = useState<number | null>(null)
  const [received, setReceived] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shortages, setShortages] = useState<Shortage[] | null>(null)
  const [result, setResult] = useState<{ order: Order; ahead: number; change: number; claim: OrderClaim } | null>(null)

  const items = useMemo(() => new Map((menu.data?.items ?? []).map((i) => [i.id, i])), [menu.data])

  // 金額の目安（会計のあとはサーバーが計算した額を使う）
  const priced = lines.map((l) => {
    const item = items.get(l.itemId)
    const unit = item ? unitPrice(item, l.optionIds) : 0
    const list = unit * l.quantity
    const d = lineDiscount(withAuto(l.discount, auto.item), presets, unit, l.quantity)
    return { line: l, item, list, discount: d }
  })
  const listTotal = priced.reduce((s, p) => s + p.list, 0)
  const base = priced.reduce((s, p) => s + p.list - p.discount, 0)
  const wholeDiscount = orderDiscount(withAuto(orderChoice, auto.order), presets, base)
  const total = base - wholeDiscount
  const zeroBlocked = total === 0 && listTotal > total && discounts.data?.allow_zero_price === false
  const receivedNum = received === '' ? total : Number(received)
  const change = receivedNum - total

  // その商品をあと何個入れられるか（限定商品の残り数・1注文あたりの購入上限）
  const roomFor = (item: MenuItem) => {
    const lim = itemLimit(item)
    return lim == null ? Infinity : lim - quantityOf(lines, item.id)
  }

  const tapItem = async (item: MenuItem) => {
    setError(null)
    if (soldOutMode) {
      if (item.option_groups.length > 0) {
        setSoldOutItemId(item.id)
        return
      }
      try {
        applyItem(
          await apiFetch<MenuItem>(`/api/staff/menu-items/${item.id}/availability`, {
            method: 'PATCH',
            token,
            body: { is_available: !item.is_available },
          }),
        )
      } catch (e) {
        setError(errorMessage(e))
      }
      return
    }
    if (!item.orderable) return
    if (roomFor(item) <= 0) {
      setError(item.is_limited && item.remaining != null && quantityOf(lines, item.id) >= item.remaining ? `${item.name}は残り${item.remaining}個です。` : `${item.name}は1回の注文で${item.purchase_limit_per_order}個までです。`)
      return
    }
    if (item.option_groups.length > 0) setPicking(item)
    else setLines((prev) => addLine(prev, item.id, [], 1))
  }

  // 切り替えた商品をすぐ画面に反映し、念のためメニューを取り直す
  const applyItem = (updated: MenuItem) => {
    queryClient.setQueryData<StaffMenu>(staffKeys.menu(slug), (old) =>
      old ? { ...old, items: old.items.map((i) => (i.id === updated.id ? updated : i)) } : old,
    )
    void queryClient.invalidateQueries({ queryKey: staffKeys.menu(slug) })
  }
  const applyLevel = (lv: StockLevel) => queryClient.setQueryData<StaffMenu>(staffKeys.menu(slug), (old) => applyStock(old, lv))
  const soldOutItem = soldOutItemId != null ? items.get(soldOutItemId) : undefined
  const stockItem = stockItemId != null ? items.get(stockItemId) : undefined

  const changeQty = (key: string, delta: number) =>
    setLines((prev) =>
      prev.flatMap((l) => {
        if (l.key !== key) return [l]
        const item = items.get(l.itemId)
        if (delta > 0 && item && roomFor(item) <= 0) return [l]
        return l.quantity + delta <= 0 ? [] : [{ ...l, quantity: l.quantity + delta }]
      }),
    )

  const setLineDiscount = (key: string, discount: DiscountChoice | undefined) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, discount } : l)))

  const submit = async () => {
    setSending(true)
    setError(null)
    try {
      const body = {
        items: toOrderItems(lines).map((it, i) => ({ ...it, ...lineDiscountBody(lines[i].discount) })),
        customer_name: name.trim() || undefined,
        note: note.trim() || undefined,
        ...orderDiscountBody(orderChoice),
      }
      const res = await apiFetch<{ order: Order; waiting_ahead: number; claim: OrderClaim }>('/api/staff/orders', { method: 'POST', token, body })
      // お釣りはサーバーが計算した支払額で出す
      const paid = received === '' ? res.order.total : Number(received)
      setResult({ order: res.order, ahead: res.waiting_ahead, change: paid - res.order.total, claim: res.claim })
      setLines([])
      setOrderChoice(undefined)
      setReceived('')
      setName('')
      setNote('')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'out_of_stock') {
        // 入力はそのまま残し、足りない品を知らせる
        const list = (e.details?.items ?? []) as Shortage[]
        for (const sh of list) applyLevel({ menu_item_id: sh.menu_item_id, business_date: '', remaining: sh.remaining })
        setShortages(list)
      } else {
        setError(errorMessage(e))
      }
      void queryClient.invalidateQueries({ queryKey: staffKeys.menu(slug) })
      void queryClient.invalidateQueries({ queryKey: staffKeys.discounts(slug) })
      // 中止になっていたら、上部のお知らせをすぐ出す
      void queryClient.invalidateQueries({ queryKey: ['staff', slug, 'shop'] })
    } finally {
      setSending(false)
    }
  }

  const data = menu.data
  const groups = data
    ? [
        ...data.categories.map((c) => ({ name: c.name, items: data.items.filter((i) => i.category_id === c.id) })),
        { name: 'そのほか', items: data.items.filter((i) => !data.categories.some((c) => c.id === i.category_id)) },
      ].filter((g) => g.items.length > 0)
    : []
  const threshold = shop?.low_stock_threshold ?? 5
  const targetLine = discountTarget?.kind === 'item' ? priced.find((p) => p.line.key === discountTarget.key) : undefined

  return (
    <>
      <TerminalLine
        command={soldOutMode ? '売り切れを設定しています' : '会計を待っています'}
        aside={shop?.event_name}
      />
      {shop?.paused && <PausedNotice message={shop.pause_message} staff />}
      <div className="pos">
        <section aria-label="商品">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="field-hint">
              {soldOutMode
                ? '商品を押すと、売り切れ／販売中が切り替わります。選択肢のある商品は、選択肢ごとに切り替えられます。'
                : '商品を押すとカートに入ります。限定の品は「残り」を押すと数を直せます。'}
            </span>
            <button
              type="button"
              className={`btn ${soldOutMode ? 'btn-secondary' : 'btn-text'}`}
              aria-pressed={soldOutMode}
              onClick={() => setSoldOutMode((v) => !v)}
            >
              {soldOutMode ? '売り切れ設定を終える' : '売り切れを設定する'}
            </button>
          </div>
          {menu.error && <p className="error-text">{errorMessage(menu.error)}</p>}
          {groups.map((g) => (
            <div key={g.name} style={{ marginBottom: 24 }}>
              <h2 className="cat-title" style={{ marginTop: 0 }}>
                {g.name}
              </h2>
              <div className="pos-grid">
                {g.items.map((item) => {
                  const low = isLowStock(item, threshold)
                  return (
                    <div key={item.id} className="pos-cell">
                      <button
                        type="button"
                        className={`pos-item ${item.orderable ? '' : 'is-soldout'}`}
                        disabled={!soldOutMode && !item.orderable}
                        onClick={() => void tapItem(item)}
                      >
                        <span className="pos-item-name">{item.name}</span>
                        <span className="mono sub" style={{ fontSize: 13 }}>
                          {!item.is_available ? '売り切れ' : !item.orderable ? '本日分は売り切れ' : yen(item.price)}
                        </span>
                        {item.option_groups.length > 0 && (
                          <span className="sub" style={{ fontSize: 11 }}>
                            {item.option_groups.some((g) => g.options.some((o) => !o.is_available)) ? '一部の選択肢が売り切れ' : '選択肢あり'}
                          </span>
                        )}
                        {item.is_limited && <span className="tag tag-limited">限定</span>}
                      </button>
                      {item.is_limited && (
                        <button
                          type="button"
                          className={`stock-chip ${low || item.remaining === 0 ? 'is-low' : ''}`}
                          aria-label={`${item.name}の残り ${item.remaining ?? 0}個（押すと数を直せます）`}
                          onClick={() => setStockItemId(item.id)}
                        >
                          <span>残り {item.remaining ?? 0}個</span>
                          <span className="sub">販売済み {item.sold ?? 0}</span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </section>

        <aside id="pos-cart" className="card pos-cart stack" aria-label="会計">
          <h2 className="panel-title" style={{ marginBottom: 0 }}>
            お会計
          </h2>
          <div>
            <div className="lines">
              {lines.length === 0 && <p className="empty">商品を選んでください</p>}
              {priced.map(({ line: l, item, list, discount }) => {
                if (!item) return null
                const opts = optionNames(item, l.optionIds)
                return (
                  <div key={l.key} className="lines-row" style={{ alignItems: 'center' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="mincho">{item.name}</span>
                      {opts.length > 0 && <span className="sub" style={{ fontSize: 12 }}>（{opts.join('、')}）</span>}
                      <br />
                      <span className="price-stack" style={{ alignItems: 'flex-start' }}>
                        {discount > 0 && <s className="mono sub">{yen(list)}</s>}
                        <span className="mono sub" style={{ fontSize: 12 }}>
                          {yen(list - discount)}
                        </span>
                      </span>
                      {(l.discount || auto.item) && discount > 0 && (
                        <span className="discount-note">
                          {l.discount ? choiceName(l.discount, presets) : `${auto.item?.name}（自動）`}　−{yen(discount)}
                        </span>
                      )}
                      <span className="row" style={{ gap: 4 }}>
                        <LineNoteInput value={l.note} label={item.name} onChange={(note) => setLines((prev) => setLineNote(prev, l.key, note))} />
                        <button type="button" className="btn btn-text line-note-add" onClick={() => setDiscountTarget({ kind: 'item', key: l.key })}>
                          {l.discount ? '値引きを変える' : '＋ 値引き'}
                        </button>
                      </span>
                    </span>
                    <span className="row" style={{ gap: 6 }}>
                      <button type="button" className="qty" aria-label="減らす" onClick={() => changeQty(l.key, -1)}>
                        −
                      </button>
                      <span className="item-qty">{l.quantity}</span>
                      <button type="button" className="qty" aria-label="増やす" disabled={roomFor(item) <= 0} onClick={() => changeQty(l.key, 1)}>
                        +
                      </button>
                    </span>
                  </div>
                )
              })}
              {lines.length > 0 && (
                <div className="lines-row" style={{ alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>
                    注文全体の値引き
                    {(orderChoice || auto.order) && (
                      <span className="discount-note">
                        {orderChoice ? choiceName(orderChoice, presets) : `${auto.order?.name}（自動）`}　−{yen(wholeDiscount)}
                      </span>
                    )}
                  </span>
                  <button type="button" className="btn btn-text" onClick={() => setDiscountTarget({ kind: 'order' })}>
                    {orderChoice || auto.order ? '変える' : '＋ 値引き'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="field-label">合計 {cartCount(lines)}点</span>
            <span className="money">{yen(total)}</span>
          </div>
          {listTotal > total && <DiscountTotals list={listTotal} total={total} />}
          {zeroBlocked && <p className="error-text">この店舗では、値引きで 0 円にはできません。</p>}

          <label className="field">
            <span className="field-label">お預かり</span>
            <input
              className="input mono"
              inputMode="numeric"
              placeholder="ちょうど"
              value={received}
              onChange={(e) => setReceived(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <div className="keys">
            {[0, 1000, 5000, 10000].map((v) => (
              <button
                key={v}
                type="button"
                className="btn"
                onClick={() => setReceived(v === 0 ? '' : String(v))}
              >
                {v === 0 ? 'ちょうど' : yen(v)}
              </button>
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="field-label">お釣り</span>
            <span className="money" style={{ color: change < 0 ? 'var(--c-shion-deep)' : undefined }}>
              {change < 0 ? `${yen(-change)} 不足` : yen(change)}
            </span>
          </div>

          <label className="field">
            <span className="field-label">お名前（任意）</span>
            <input className="input" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />
          </label>

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
          </label>

          {error && <p className="error-text">{error}</p>}
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={lines.length === 0 || change < 0 || sending || soldOutMode || shop?.paused || zeroBlocked}
            onClick={submit}
          >
            {shop?.paused ? '中止中のため会計できません' : '会計を確定'}
          </button>
        </aside>
      </div>

      {picking && (
        <Sheet title={picking.name} onClose={() => setPicking(null)}>
          <OptionPicker
            item={picking}
            maxQuantity={Math.min(20, roomFor(picking))}
            onAdd={(ids, qty) => {
              setLines((prev) => addLine(prev, picking.id, ids, Math.min(qty, roomFor(picking))))
              setPicking(null)
            }}
          />
        </Sheet>
      )}

      {discountTarget && (discountTarget.kind === 'order' || targetLine) && (
        <Sheet
          title={targetLine?.item ? `値引き：${targetLine.item.name} × ${targetLine.line.quantity}` : '値引き：注文全体'}
          onClose={() => setDiscountTarget(null)}
        >
          <DiscountPicker
            scope={discountTarget.kind}
            presets={presets}
            freeLimit={discounts.data?.free_limit ?? 0}
            auto={discountTarget.kind === 'item' ? auto.item : auto.order}
            value={targetLine ? targetLine.line.discount : orderChoice}
            base={targetLine ? targetLine.list : base}
            onChoose={(c) => {
              if (targetLine) setLineDiscount(targetLine.line.key, c)
              else setOrderChoice(c)
              setDiscountTarget(null)
            }}
          />
        </Sheet>
      )}

      {/* スマホだけ：画面の下に合計を出し、押すとお会計の欄まで移動する（タブレット・PCでは表示しない） */}
      {lines.length > 0 && !soldOutMode && (
        <button
          type="button"
          className="pos-cartbar"
          onClick={() => document.getElementById('pos-cart')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <span>お会計へ</span>
          <span className="mono">
            {cartCount(lines)}点　{yen(total)}
          </span>
        </button>
      )}

      {soldOutItem && (
        <Sheet title={`売り切れの設定：${soldOutItem.name}`} onClose={() => setSoldOutItemId(null)}>
          <SoldOutSheet item={soldOutItem} token={token} onChanged={applyItem} />
        </Sheet>
      )}

      {stockItem && (
        <Sheet title={`限定数を直す：${stockItem.name}`} onClose={() => setStockItemId(null)}>
          <StockAdjust
            key={stockItem.id}
            remaining={stockItem.remaining ?? 0}
            sold={stockItem.sold ?? 0}
            maxChange={shop?.staff_stock_adjust_limit ?? 10}
            submit={(body) => apiFetch<StockLevel>(`/api/staff/menu-items/${stockItem.id}/stock`, { method: 'POST', token, body })}
            onDone={(lv) => {
              applyLevel(lv)
              setStockItemId(null)
            }}
          />
          <p className="field-hint" style={{ marginTop: 16 }}>
            レジで直せるのは今日の分だけです。手動の売り切れ（売り切れを設定する）とは別で、残りを 1 以上に戻すと、自動の売り切れは解除されます。
          </p>
        </Sheet>
      )}

      {shortages && (
        <Sheet title="売り切れた品があります" onClose={() => setShortages(null)}>
          <div className="stack">
            <p>会計はまだ確定していません。入力はそのまま残っています。</p>
            <div className="lines">
              {shortages.map((sh) => (
                <div key={sh.menu_item_id} className="lines-row">
                  <span className="mincho">{sh.name}</span>
                  <span className="mono">
                    注文 {sh.requested}個 ／ 残り {sh.remaining}個
                  </span>
                </div>
              ))}
            </div>
            <p className="sub" style={{ fontSize: 13 }}>
              数を減らすか外してから、もう一度「会計を確定」を押してください。
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={() => setShortages(null)}>
              入力に戻る
            </button>
          </div>
        </Sheet>
      )}

      {result && (
        <Sheet title="会計が終わりました" onClose={() => setResult(null)}>
          <div className="stack" style={{ gap: 24 }}>
            <VerticalLabel text="お呼び出し番号">
              <div className="call-no">{result.order.order_no}</div>
              <div className="call-line" aria-hidden="true" />
              <p className="sub" style={{ marginTop: 12 }}>
                {result.ahead > 0 ? `前に${result.ahead}組お待ちです` : wording(shop?.business_type).posSoon}
              </p>
            </VerticalLabel>
            <ClaimPanel orderNo={result.order.order_no} claim={result.claim} />
            {result.order.discount_total > 0 && <DiscountTotals list={result.order.list_total} total={result.order.total} />}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="field-label">お釣り</span>
              <span className="money">{yen(result.change)}</span>
            </div>
            <button type="button" className="btn btn-primary btn-block" onClick={() => setResult(null)}>
              次のお客様へ
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}
