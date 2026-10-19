import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Header } from '../../components/Header'
import { TerminalLine } from '../../components/Terminal'
import { API_BASE_URL, apiFetch } from '../../lib/api'
import { storeStyle } from '../../lib/colors'
import type { AllDisplaySnapshot, OrderStatus } from '../../lib/types'
import { wording } from '../../lib/wording'
import { byNumber, chime, useWakeLock } from './screen'

type Shops = AllDisplaySnapshot['shops']
type Shop = Shops[number]

/** この店舗数以上になったら、列を流して順に見せる。 */
const ROTATE_FROM = 4
/** 流す間隔。 */
const ROTATE_MS = 15000
/** 一度に見える列の最大数（つなぎ目で途切れないよう、先頭からこの数だけ末尾に複製する）。 */
const MAX_PER_VIEW = 3

/** 番号の頭文字（A-12 → A）。頭文字は開催回の中で店ごとに1つなので、これで店を見分ける。 */
const prefixOf = (no: string) => no.split('-')[0]

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

  // 店舗が多いときは、15秒ごとに1列ずつ左へ流す。末尾の複製まで流れたら、動きなしで先頭に戻す
  const count = shops?.length ?? 0
  const rotating = count >= ROTATE_FROM
  const [offset, setOffset] = useState(0)
  const [sliding, setSliding] = useState(false)
  // 店舗が減って位置が範囲の外になったら先頭から
  const shown = offset > count ? 0 : offset
  const atEnd = useRef(false)
  useEffect(() => {
    atEnd.current = shown >= count
  }, [shown, count])
  useEffect(() => {
    if (!rotating) return
    const id = setInterval(() => {
      // 裏に回っていて流れ終わりの合図（transitionend）が来なかったときは、ここで先頭に戻す
      if (atEnd.current) {
        setSliding(false)
        setOffset(0)
        return
      }
      setSliding(true)
      setOffset((o) => o + 1)
    }, ROTATE_MS)
    return () => clearInterval(id)
  }, [rotating])
  const onSlid = () => {
    if (shown >= count) {
      setSliding(false)
      setOffset(0)
    }
  }

  const readyCount = shops?.reduce((n, s) => n + s.ready.length, 0) ?? 0
  const prepCount = shops?.reduce((n, s) => n + s.preparing.length, 0) ?? 0

  return (
    <div className="display">
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

      {shops?.length === 0 && (
        <main className="all-display">
          <p className="empty">いま営業しているお店はありません</p>
        </main>
      )}
      {shops && shops.length > 0 && !rotating && (
        <main className="all-display">
          {shops.map((s) => <ShopColumn key={s.slug} shop={s} fresh={fresh} />)}
        </main>
      )}
      {shops && rotating && (
        <main className="all-display-viewport">
          <div
            className={`all-display-track ${sliding ? 'sliding' : ''}`}
            style={{ '--offset': shown } as CSSProperties}
            onTransitionEnd={(e) => e.target === e.currentTarget && onSlid()}
          >
            {shops.map((s) => <ShopColumn key={s.slug} shop={s} fresh={fresh} />)}
            {shops.slice(0, MAX_PER_VIEW).map((s) => <ShopColumn key={`clone-${s.slug}`} shop={s} fresh={fresh} clone />)}
          </div>
        </main>
      )}
    </div>
  )
}

/** 1店舗の列。clone はつなぎ目用の複製で、読み上げの対象から外す。 */
function ShopColumn({ shop: s, fresh, clone = false }: { shop: Shop; fresh: Set<string>; clone?: boolean }) {
  const w = wording(s.business_type)
  return (
    <section className="all-display-shop" style={storeStyle(s.color)} aria-hidden={clone || undefined}>
      <h2 className="all-display-name">
        <span className="dot dot-lg" aria-hidden="true" />
        {s.name}
      </h2>
      <p className="all-display-label">{w.readyLabel}</p>
      <div className="ready-grid all-display-ready" aria-live={clone ? undefined : 'polite'}>
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
