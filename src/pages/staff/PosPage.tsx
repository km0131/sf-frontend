import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { OptionPicker } from '../../components/OptionPicker'
import { PausedNotice } from '../../components/PausedNotice'
import { Sheet } from '../../components/Sheet'
import { TerminalLine } from '../../components/Terminal'
import { VerticalLabel } from '../../components/VerticalLabel'
import { apiFetch, errorMessage } from '../../lib/api'
import { LineNoteInput } from '../../components/LineNote'
import { addLine, cartCount, cartTotal, optionNames, setLineNote, toOrderItems, unitPrice, type CartLine } from '../../lib/cart'
import { yen } from '../../lib/format'
import type { Category, MenuItem, Order, OrderClaim, StaffShop } from '../../lib/types'
import { wording } from '../../lib/wording'
import { ClaimPanel } from './ClaimPanel'
import { staffKeys } from './keys'
import { SoldOutSheet } from './SoldOutSheet'

type StaffMenu = { categories: Category[]; items: MenuItem[] }

/** レジ：対面の注文を入力し、会計して整理番号を出す。売り切れの切り替えもここで行う。 */
export function PosPage({ slug, token, shop }: { slug: string; token: string; shop?: StaffShop }) {
  const queryClient = useQueryClient()
  const menu = useQuery({
    queryKey: staffKeys.menu(slug),
    queryFn: () => apiFetch<StaffMenu>('/api/staff/menu', { token }),
  })
  const [lines, setLines] = useState<CartLine[]>([])
  const [picking, setPicking] = useState<MenuItem | null>(null)
  const [soldOutMode, setSoldOutMode] = useState(false)
  // 売り切れ設定で開いている商品（選択肢のある商品は、選択肢ごとに切り替える画面を出す）
  const [soldOutItemId, setSoldOutItemId] = useState<number | null>(null)
  const [received, setReceived] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ order: Order; ahead: number; change: number; claim: OrderClaim } | null>(null)

  const items = useMemo(() => new Map((menu.data?.items ?? []).map((i) => [i.id, i])), [menu.data])
  const total = cartTotal(lines, items)
  const receivedNum = received === '' ? total : Number(received)
  const change = receivedNum - total

  const tapItem = async (item: MenuItem) => {
    setError(null)
    if (soldOutMode) {
      if (item.option_groups.length > 0) {
        setSoldOutItemId(item.id)
        return
      }
      try {
        await apiFetch(`/api/staff/menu-items/${item.id}/availability`, {
          method: 'PATCH',
          token,
          body: { is_available: !item.is_available },
        })
        void queryClient.invalidateQueries({ queryKey: staffKeys.menu(slug) })
      } catch (e) {
        setError(errorMessage(e))
      }
      return
    }
    if (!item.is_available) return
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
  const soldOutItem = soldOutItemId != null ? items.get(soldOutItemId) : undefined

  const changeQty = (key: string, delta: number) =>
    setLines((prev) =>
      prev.flatMap((l) => (l.key !== key ? [l] : l.quantity + delta <= 0 ? [] : [{ ...l, quantity: l.quantity + delta }])),
    )

  const submit = async () => {
    setSending(true)
    setError(null)
    try {
      const res = await apiFetch<{ order: Order; waiting_ahead: number; claim: OrderClaim }>('/api/staff/orders', {
        method: 'POST',
        token,
        body: { items: toOrderItems(lines), customer_name: name.trim() || undefined, note: note.trim() || undefined },
      })
      setResult({ order: res.order, ahead: res.waiting_ahead, change, claim: res.claim })
      setLines([])
      setReceived('')
      setName('')
      setNote('')
    } catch (e) {
      setError(errorMessage(e))
      void queryClient.invalidateQueries({ queryKey: staffKeys.menu(slug) })
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
                : '商品を押すとカートに入ります。'}
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
                {g.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`pos-item ${item.is_available ? '' : 'is-soldout'}`}
                    disabled={!soldOutMode && !item.is_available}
                    onClick={() => void tapItem(item)}
                  >
                    <span className="pos-item-name">{item.name}</span>
                    <span className="mono sub" style={{ fontSize: 13 }}>
                      {item.is_available ? yen(item.price) : '売り切れ'}
                    </span>
                    {item.option_groups.length > 0 && (
                      <span className="sub" style={{ fontSize: 11 }}>
                        {item.option_groups.some((g) => g.options.some((o) => !o.is_available)) ? '一部の選択肢が売り切れ' : '選択肢あり'}
                      </span>
                    )}
                  </button>
                ))}
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
              {lines.map((l) => {
                const item = items.get(l.itemId)
                if (!item) return null
                const opts = optionNames(item, l.optionIds)
                return (
                  <div key={l.key} className="lines-row" style={{ alignItems: 'center' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="mincho">{item.name}</span>
                      {opts.length > 0 && <span className="sub" style={{ fontSize: 12 }}>（{opts.join('、')}）</span>}
                      <br />
                      <span className="mono sub" style={{ fontSize: 12 }}>
                        {yen(unitPrice(item, l.optionIds) * l.quantity)}
                      </span>
                      <LineNoteInput value={l.note} label={item.name} onChange={(note) => setLines((prev) => setLineNote(prev, l.key, note))} />
                    </span>
                    <span className="row" style={{ gap: 6 }}>
                      <button type="button" className="qty" aria-label="減らす" onClick={() => changeQty(l.key, -1)}>
                        −
                      </button>
                      <span className="item-qty">{l.quantity}</span>
                      <button type="button" className="qty" aria-label="増やす" onClick={() => changeQty(l.key, 1)}>
                        +
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="field-label">合計 {cartCount(lines)}点</span>
            <span className="money">{yen(total)}</span>
          </div>

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
            disabled={lines.length === 0 || change < 0 || sending || soldOutMode || shop?.paused}
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
            onAdd={(ids, qty) => {
              setLines((prev) => addLine(prev, picking.id, ids, qty))
              setPicking(null)
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
