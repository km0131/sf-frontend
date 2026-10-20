import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Header } from '../../components/Header'
import { TerminalLine } from '../../components/Terminal'
import { API_BASE_URL, apiFetch } from '../../lib/api'
import { storeStyle } from '../../lib/colors'
import type { AllDisplaySnapshot, OrderStatus } from '../../lib/types'
import { wording } from '../../lib/wording'
import { settingSpecs, useDisplaySettings, type DisplaySettings } from './displaySettings'
import { byNumber, chime, useWakeLock } from './screen'

type Shops = AllDisplaySnapshot['shops']
type Shop = Shops[number]

/** 操作がないまま、この時間が過ぎたら歯車を隠す。 */
const GEAR_HIDE_MS = 4000

/** 番号の頭文字（A-12 → A）。頭文字は開催回の中で店ごとに1つなので、これで店を見分ける。 */
const prefixOf = (no: string) => no.split('-')[0]

/** n 店舗を幅 width・高さ height に並べるときの列数・行数。1店舗の枠ができるだけ大きく（縦横の短い方が長く）なるものを選ぶ。 */
function gridShape(n: number, width: number, height: number): { cols: number; rows: number } {
  let best = { cols: 1, rows: n, score: -1 }
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    // 番号は横に並ぶので、枠は少し横長でもよい（高さを 1.2 倍に見て比べる）
    const score = Math.min(width / cols, (height / rows) * 1.2)
    if (score > best.score) best = { cols, rows, score }
  }
  return { cols: best.cols, rows: best.rows }
}

/** 要素の大きさ（幅・高さ）を見張る。 */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/** マウス・タップ・キー操作のあと、ms のあいだだけ true。 */
function useRecentActivity(ms: number): boolean {
  const [active, setActive] = useState(true)
  useEffect(() => {
    let timer = setTimeout(() => setActive(false), ms)
    const wake = () => {
      setActive(true)
      clearTimeout(timer)
      timer = setTimeout(() => setActive(false), ms)
    }
    const events = ['mousemove', 'pointerdown', 'touchstart', 'keydown'] as const
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }))
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, wake))
    }
  }, [ms])
  return active
}

/** 全店舗の呼び出し番号の大画面（ログイン不要）。番号と状態だけを表示し、個人情報は出さない。 */
export function AllDisplayPage() {
  const [shops, setShops] = useState<Shops | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [connected, setConnected] = useState(false)
  const [sound, setSound] = useState(false)
  const soundRef = useRef(sound)
  useEffect(() => {
    soundRef.current = sound
  }, [sound])
  const shopsRef = useRef(shops)
  useEffect(() => {
    shopsRef.current = shops
  }, [shops])

  useEffect(() => {
    const es = new EventSource(`${API_BASE_URL}/api/display/events`)
    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false) // EventSource は自動でつなぎ直す
    es.addEventListener('snapshot', (e) => {
      setShops((JSON.parse((e as MessageEvent).data) as AllDisplaySnapshot).shops)
    })
    es.addEventListener('order', (e) => {
      const { order_no: no, status } = JSON.parse((e as MessageEvent).data) as { order_no: string; status: OrderStatus }
      const prefix = prefixOf(no)
      // あとから営業を始めた店の番号なら、一覧を取り直す
      if (shopsRef.current && !shopsRef.current.some((s) => s.order_prefix === prefix)) {
        apiFetch<AllDisplaySnapshot>('/api/display').then((s) => setShops(s.shops), () => {})
      }
      setShops((prev) => {
        if (!prev) return prev
        return prev.map((s) => {
          if (s.order_prefix !== prefix) return s
          const preparing = s.preparing.filter((x) => x !== no)
          const ready = s.ready.filter((x) => x !== no)
          if (status === 'waiting' || status === 'cooking') preparing.push(no)
          if (status === 'ready') ready.push(no)
          return { ...s, preparing: preparing.sort(byNumber), ready: ready.sort(byNumber) }
        })
      })
      if (status === 'ready') {
        setFresh((prev) => new Set(prev).add(no))
        setTimeout(() => setFresh((prev) => { const n = new Set(prev); n.delete(no); return n }), 8000)
        if (soundRef.current) chime()
      }
    })
    return () => es.close()
  }, [])

  useWakeLock()

  const { settings, update, reset } = useDisplaySettings()
  const { perPage, interval } = settings
  const count = shops?.length ?? 0
  const pageCount = Math.max(1, Math.ceil(count / perPage))
  // 店舗が1ページに収まるときは切り替えない
  const paging = pageCount > 1
  // 設定を変えたら1ページ目から（切り替えのタイマーもやり直す）
  const [page, setPage] = useState(0)
  const [settingsKey, setSettingsKey] = useState(`${perPage}/${interval}`)
  if (settingsKey !== `${perPage}/${interval}`) {
    setSettingsKey(`${perPage}/${interval}`)
    setPage(0)
  }
  useEffect(() => {
    if (!paging) return
    const id = setInterval(() => setPage((p) => p + 1), interval * 1000)
    return () => clearInterval(id)
  }, [paging, interval, settingsKey])
  // 店舗が減ってページが範囲の外になっても、回り続けるように割った余りで出す
  const shown = page % pageCount
  const pageShops = shops?.slice(shown * perPage, shown * perPage + perPage) ?? []

  const [mainRef, mainSize] = useSize<HTMLElement>()
  // 枠の大きさは、そのページの店舗数ではなく「1ページの数」で決める（最後のページだけ大きくならないように）
  // 測れていないあいだ（最初の描画など）は画面の大きさで代わりに計算する
  const shape = gridShape(
    Math.min(perPage, Math.max(count, 1)),
    mainSize.width || window.innerWidth,
    mainSize.height || window.innerHeight * 0.8,
  )

  const [panelOpen, setPanelOpen] = useState(false)
  const recentlyActive = useRecentActivity(GEAR_HIDE_MS)
  const gearVisible = recentlyActive || panelOpen

  const readyCount = shops?.reduce((n, s) => n + s.ready.length, 0) ?? 0
  const prepCount = shops?.reduce((n, s) => n + s.preparing.length, 0) ?? 0

  return (
    <div className="display display-fixed">
      <Header
        name="呼び出し番号"
        seal="祭"
        aside={
          <div className="row" style={{ gap: 16 }}>
            <span className="conn">{connected ? '● 接続中' : '○ 再接続中'}</span>
            <button type="button" className="btn btn-text" aria-pressed={sound} onClick={() => { setSound((s) => !s); if (!sound) chime() }}>
              {sound ? '音：入' : '音：切'}
            </button>
          </div>
        }
      />
      {/* 飲食と飲食以外の店が混ざるので、どちらにも合う言葉にする */}
      <TerminalLine command="全店の呼び出し番号をお知らせしています" aside={shops ? `呼び出し中 ${readyCount} ／ 待ち ${prepCount}` : undefined} />

      <main
        ref={mainRef}
        className="all-display"
        style={{ '--cols': shape.cols, '--rows': shape.rows } as CSSProperties}
      >
        {shops?.length === 0 && <p className="empty">いま営業しているお店はありません</p>}
        {pageShops.map((s) => (
          <ShopColumn key={s.slug} shop={s} fresh={fresh} />
        ))}
      </main>

      {paging && (
        <div className="all-display-pager" aria-label={`${shown + 1} / ${pageCount} ページ`}>
          <span className="all-display-page">
            {shown + 1} / {pageCount}
          </span>
          <div className="all-display-progress" aria-hidden="true">
            {/* key を変えて、ページが変わるたびにバーを最初から伸ばし直す */}
            <div key={`${page}-${settingsKey}`} className="all-display-progress-bar" style={{ animationDuration: `${interval}s` }} />
          </div>
        </div>
      )}

      <button
        type="button"
        className={`display-gear ${gearVisible ? '' : 'is-hidden'}`}
        aria-label="表示の設定"
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen((o) => !o)}
      >
        ⚙
      </button>
      {panelOpen && <SettingsPanel settings={settings} onChange={update} onReset={reset} onClose={() => setPanelOpen(false)} />}
    </div>
  )
}

/** 表示の設定（1ページの店舗数・切り替えの秒数）。変えたらすぐ反映する。 */
function SettingsPanel({
  settings,
  onChange,
  onReset,
  onClose,
}: {
  settings: DisplaySettings
  onChange: (patch: Partial<DisplaySettings>) => void
  onReset: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="display-panel" role="dialog" aria-label="表示の設定">
      <h2 className="display-panel-title">表示の設定</h2>
      <SettingStepper
        label="1ページの店舗数"
        unit="店"
        value={settings.perPage}
        min={settingSpecs.perPage.min}
        max={settingSpecs.perPage.max}
        onChange={(v) => onChange({ perPage: v })}
      />
      <SettingStepper
        label="切り替えの間隔"
        unit="秒"
        value={settings.interval}
        min={settingSpecs.interval.min}
        max={settingSpecs.interval.max}
        onChange={(v) => onChange({ interval: v })}
      />
      <p className="field-hint">この端末だけに保存します。</p>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="btn btn-text" onClick={onReset}>
          既定値に戻す
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  )
}

/** −／＋ と数字の入力欄。範囲内の整数になったときだけ反映する。 */
function SettingStepper({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  // 入力途中（空欄・範囲外）の文字はここで持ち、確定した値だけを反映する
  const [text, setText] = useState(String(value))
  const [shownValue, setShownValue] = useState(value)
  if (shownValue !== value) {
    setShownValue(value)
    setText(String(value))
  }
  const set = (v: number) => {
    const n = Math.min(max, Math.max(min, v))
    setText(String(n))
    if (n !== value) onChange(n)
  }
  return (
    <label className="field">
      <span className="field-label">
        {label}（{min}〜{max}）
      </span>
      <span className="row" style={{ gap: 8 }}>
        <button type="button" className="qty" aria-label={`${label}を減らす`} disabled={value <= min} onClick={() => set(value - 1)}>
          −
        </button>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          style={{ width: 88, textAlign: 'center' }}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            const n = Number(e.target.value)
            if (e.target.value !== '' && Number.isInteger(n) && n >= min && n <= max && n !== value) onChange(n)
          }}
          onBlur={() => setText(String(value))}
        />
        <button type="button" className="qty" aria-label={`${label}を増やす`} disabled={value >= max} onClick={() => set(value + 1)}>
          +
        </button>
        <span className="sub">{unit}</span>
      </span>
    </label>
  )
}

/** 1店舗の枠。 */
function ShopColumn({ shop: s, fresh }: { shop: Shop; fresh: Set<string> }) {
  const w = wording(s.business_type)
  return (
    <section className="all-display-shop" style={storeStyle(s.color)}>
      <h2 className="all-display-name">
        <span className="dot dot-lg" aria-hidden="true" />
        {s.name}
      </h2>
      <p className="all-display-label">{w.readyLabel}</p>
      <div className="ready-grid all-display-ready" aria-live="polite">
        {s.ready.length === 0 && <p className="empty">いまはありません</p>}
        {s.ready.map((no) => (
          <div key={no} className={`ready-no ${fresh.has(no) ? 'just-ready' : ''}`}>
            {no}
            <div className="call-line" aria-hidden="true" />
          </div>
        ))}
      </div>
      {/* 飲食は調理中の番号、飲食以外は番号を出さずに待ち組数だけ */}
      {w.usesCooking && s.preparing.length > 0 && (
        <>
          <p className="all-display-label">{w.preparingLabel}</p>
          <div className="prep-grid">
            {s.preparing.map((no) => <span key={no}>{no}</span>)}
          </div>
        </>
      )}
      {!w.usesCooking && (
        <>
          <p className="all-display-label">{w.preparingLabel}</p>
          <p className="wait-count wait-count-sm">
            {s.preparing.length}
            <span className="wait-count-unit">組</span>
          </p>
        </>
      )}
    </section>
  )
}
