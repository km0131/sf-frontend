import { useEffect, useState, type FormEvent } from 'react'
import { yen } from '../lib/format'
import { sessionLabel, type EventSession, type LedgerCategory } from '../lib/ledger'
import { emptyQuery, highlight, type ReceiptQuery } from '../lib/receiptSearch'
import { receiptNo, statusLabels, useAuthImage, type Receipt } from '../lib/receipts'

/** レシートの検索の条件。よく使う条件だけ出し、ほかは「詳しい条件」にしまう。「探す」で決める */
export function ReceiptSearchForm({
  sessions,
  events,
  currentEventId,
  categories,
  shops,
  onSearch,
}: {
  sessions: EventSession[]
  /** 開催（event）の選択肢。既定は「今回の開催」（currentEventId） */
  events: { id: number; name: string }[]
  currentEventId: number | null | undefined
  categories: LedgerCategory[]
  /** システム管理者だけ（店舗で絞る） */
  shops?: { id: number; name: string }[]
  onSearch: (q: ReceiptQuery) => void
}) {
  const [q, setQ] = useState<ReceiptQuery>(emptyQuery)
  const set = (k: keyof ReceiptQuery) => (e: { target: { value: string } }) => setQ({ ...q, [k]: e.target.value })
  const digits = (k: keyof ReceiptQuery) => (e: { target: { value: string } }) => setQ({ ...q, [k]: e.target.value.replace(/\D/g, '') })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSearch(q)
  }
  const currentName = events.find((ev) => ev.id === currentEventId)?.name
  // 開催回は、選んだ開催のものだけ出す
  const eventOf = q.event_id === 'current' ? currentEventId : q.event_id === 'all' ? null : Number(q.event_id)
  const shownSessions = eventOf ? sessions.filter((s) => s.event_id === eventOf) : sessions
  const pickEvent = (e: { target: { value: string } }) => {
    // 開催を変えたら、すぐ探す（開催回の選択は外す）
    const next = { ...q, event_id: e.target.value, session_id: '' }
    setQ(next)
    onSearch(next)
  }
  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={submit}>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">開催</span>
          <select className="select" value={q.event_id} onChange={pickEvent}>
            <option value="current">今回の開催{currentName ? `（${currentName}）` : ''}</option>
            <option value="all">すべての開催</option>
            {events
              .filter((ev) => ev.id !== currentEventId)
              .map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">キーワード（店名・品目・読み取った文字）</span>
          <input className="input" type="search" value={q.q} maxLength={100} placeholder="例: キャベツ 業務" onChange={set('q')} />
        </label>
        <label className="field">
          <span className="field-label">状態</span>
          <select className="select" value={q.status} onChange={set('status')}>
            <option value="">すべて</option>
            {Object.entries(statusLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {shops ? (
          <label className="field">
            <span className="field-label">店舗</span>
            <select className="select" value={q.shop_id} onChange={set('shop_id')}>
              <option value="">すべて</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field">
            <span className="field-label">開催回</span>
            <select className="select" value={q.session_id} onChange={set('session_id')}>
              <option value="">すべて</option>
              {shownSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {sessionLabel(s)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <details>
        <summary className="field-label">詳しい条件（金額・購入日・科目・番号・登録者）</summary>
        <div className="form-grid" style={{ marginTop: 8 }}>
          <label className="field">
            <span className="field-label">金額（ちょうど）</span>
            <input className="input mono" inputMode="numeric" value={q.amount} onChange={digits('amount')} />
          </label>
          <label className="field">
            <span className="field-label">金額（から）</span>
            <input className="input mono" inputMode="numeric" value={q.amount_min} onChange={digits('amount_min')} />
          </label>
          <label className="field">
            <span className="field-label">金額（まで）</span>
            <input className="input mono" inputMode="numeric" value={q.amount_max} onChange={digits('amount_max')} />
          </label>
          <label className="field">
            <span className="field-label">購入日（から）</span>
            <input className="input" type="date" value={q.date_from} onChange={set('date_from')} />
          </label>
          <label className="field">
            <span className="field-label">購入日（まで）</span>
            <input className="input" type="date" value={q.date_to} onChange={set('date_to')} />
          </label>
          <label className="field">
            <span className="field-label">科目（確定したもの）</span>
            <select className="select" value={q.category} onChange={set('category')}>
              <option value="">すべて</option>
              {categories
                .filter((c) => c.kind === 'expense')
                .map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">レシート番号</span>
            <input className="input mono" value={q.no} maxLength={10} placeholder="R-0012" onChange={set('no')} />
          </label>
          <label className="field">
            <span className="field-label">登録者</span>
            <select className="select" value={q.uploader} onChange={set('uploader')}>
              <option value="">すべて</option>
              <option value="staff">スタッフの画面から</option>
            </select>
          </label>
          {shops && (
            <label className="field">
              <span className="field-label">開催回</span>
              <select className="select" value={q.session_id} onChange={set('session_id')}>
                <option value="">すべて</option>
                {shownSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.event_name}：{sessionLabel(s)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </details>
      <div className="row" style={{ gap: 12 }}>
        <button type="submit" className="btn btn-primary">
          探す
        </button>
        <button
          type="button"
          className="btn btn-text"
          onClick={() => {
            setQ(emptyQuery)
            onSearch(emptyQuery)
          }}
        >
          条件を消す
        </button>
      </div>
    </form>
  )
}

/** 一覧のカード（サムネイルつき）。base は '/api/manage' か '/api/admin' */
export function ReceiptCard({ receipt: r, token, base, showShop, onOpen }: { receipt: Receipt; token: string; base: string; showShop?: boolean; onOpen: () => void }) {
  const thumb = useAuthImage(`${base}/receipts/${r.id}/thumb`, token)
  const total = r.total ?? r.ocr?.total ?? null
  const store = r.store_name ?? r.ocr?.store_name ?? null
  const date = r.purchase_date ?? r.ocr?.purchase_date ?? null
  return (
    <button type="button" className="receipt-card receipt-card-button" onClick={onOpen}>
      {thumb ? <img src={thumb} alt="" /> : <span className="receipt-thumb-empty" aria-hidden="true" />}
      <span className="stack" style={{ gap: 2, textAlign: 'left' }}>
        <span className="mono">{receiptNo(r.id)}</span>
        {date && <span className="mono sub">購入 {date}</span>}
        {showShop && <strong>{r.shop_name}</strong>}
        <strong className="receipt-card-session">{r.session_name}</strong>
        <span>{store ?? '店名 —'}</span>
        <span className="mono">{total != null ? yen(total) : '—'}</span>
        <span className={`tag ${r.status === 'confirmed' ? '' : 'tag-strong'}`}>{statusLabels[r.status]}</span>
      </span>
    </button>
  )
}

/** 原寸の画像。拡大（1〜3倍）と回転（90°ずつ）ができる。回転は画像を描き直して、拡大しても欠けないようにする */
export function ReceiptImage({ src, alt }: { src: string | null; alt: string }) {
  const [zoom, setZoom] = useState(1)
  const [turn, setTurn] = useState(0) // 90° の回数
  const [rotated, setRotated] = useState<{ key: string; url: string } | null>(null)
  const key = `${src}-${turn}`
  useEffect(() => {
    if (!src || turn % 4 === 0) return
    let alive = true
    const img = new Image()
    img.onload = () => {
      const side = turn % 2 === 1
      const canvas = document.createElement('canvas')
      canvas.width = side ? img.naturalHeight : img.naturalWidth
      canvas.height = side ? img.naturalWidth : img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx || !alive) return
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate(((turn % 4) * Math.PI) / 2)
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
      canvas.toBlob((b) => alive && b && setRotated({ key: `${src}-${turn}`, url: URL.createObjectURL(b) }), 'image/jpeg', 0.92)
    }
    img.src = src
    return () => {
      alive = false
    }
  }, [src, turn])
  useEffect(() => () => void (rotated && URL.revokeObjectURL(rotated.url)), [rotated])
  const shown = turn % 4 === 0 ? src : rotated?.key === key ? rotated.url : null
  return (
    <div className="receipt-viewer">
      <div className="receipt-viewer-tools">
        <button type="button" className="btn btn-text" onClick={() => setTurn((t) => t + 1)}>
          右に回す
        </button>
        <button type="button" className="btn btn-text" disabled={zoom <= 1} onClick={() => setZoom((z) => z - 1)}>
          縮小
        </button>
        <button type="button" className="btn btn-text" disabled={zoom >= 3} onClick={() => setZoom((z) => z + 1)}>
          拡大
        </button>
        <span className="sub mono">×{zoom}</span>
      </div>
      <div className="receipt-viewer-frame">
        {shown ? <img src={shown} alt={alt} style={{ width: `${zoom * 100}%`, maxHeight: zoom === 1 ? '70vh' : 'none' }} /> : <span className="receipt-thumb-empty" />}
      </div>
    </div>
  )
}

/** 読み取った文字。検索語を強調する（全角半角・大文字小文字の違いは無視） */
export function OcrText({ lines, keywords }: { lines: string[]; keywords: string[] }) {
  return (
    <pre className="receipt-ocr-text">
      {lines.map((raw, i) => (
        <span key={i}>
          {highlight(raw.normalize('NFKC'), keywords)}
          {'\n'}
        </span>
      ))}
    </pre>
  )
}
