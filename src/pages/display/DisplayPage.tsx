import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { Header } from '../../components/Header'
import { TerminalLine } from '../../components/Terminal'
import { VerticalLabel } from '../../components/VerticalLabel'
import { API_BASE_URL } from '../../lib/api'
import { storeStyle } from '../../lib/colors'
import type { BusinessType, DisplaySnapshot, OrderStatus, ShopColor } from '../../lib/types'
import { wording } from '../../lib/wording'
import { byNumber, chime, useWakeLock } from './screen'

type State = { shop: string; color?: ShopColor; businessType?: BusinessType; preparing: string[]; ready: string[] }

/** 出来上がり番号の大画面（ログイン不要）。番号と状態だけを表示し、個人情報は出さない。
 *  飲食以外の店は「お呼び出し中の番号」と「待ち組数」の2つだけを出す。 */
export function DisplayPage() {
  const { slug = '' } = useParams()
  const [state, setState] = useState<State | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [connected, setConnected] = useState(false)
  const [sound, setSound] = useState(false)
  const soundRef = useRef(sound)
  useEffect(() => {
    soundRef.current = sound
  }, [sound])

  useEffect(() => {
    const es = new EventSource(`${API_BASE_URL}/api/shops/${encodeURIComponent(slug)}/display/events`)
    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false) // EventSource は自動でつなぎ直す
    es.addEventListener('snapshot', (e) => {
      const s = JSON.parse((e as MessageEvent).data) as DisplaySnapshot
      setState({ shop: s.shop, color: s.color, businessType: s.business_type, preparing: s.preparing, ready: s.ready })
    })
    es.addEventListener('order', (e) => {
      const { order_no: no, status } = JSON.parse((e as MessageEvent).data) as { order_no: string; status: OrderStatus }
      setState((prev) => {
        if (!prev) return prev
        const preparing = prev.preparing.filter((x) => x !== no)
        const ready = prev.ready.filter((x) => x !== no)
        if (status === 'waiting' || status === 'cooking') preparing.push(no)
        if (status === 'ready') ready.push(no)
        return { ...prev, preparing: preparing.sort(byNumber), ready: ready.sort(byNumber) }
      })
      if (status === 'ready') {
        setFresh((prev) => new Set(prev).add(no))
        setTimeout(() => setFresh((prev) => { const n = new Set(prev); n.delete(no); return n }), 8000)
        if (soundRef.current) chime()
      }
    })
    return () => es.close()
  }, [slug])

  useWakeLock()
  const w = wording(state?.businessType)

  return (
    <div className="display" style={storeStyle(state?.color)}>
      <Header
        name={state?.shop ?? slug}
        aside={
          <div className="row" style={{ gap: 16 }}>
            <span className="conn">{connected ? '● 接続中' : '○ 再接続中'}</span>
            <button type="button" className="btn btn-text" aria-pressed={sound} onClick={() => { setSound((s) => !s); if (!sound) chime() }}>
              {sound ? '音：入' : '音：切'}
            </button>
          </div>
        }
      />
      <TerminalLine command={w.displayCommand} aside={state ? w.displayCounts(state.ready.length, state.preparing.length) : undefined} />

      <main className="display-main">
        <VerticalLabel text={w.readyLabel} note={w.readyNote}>
          <div className="ready-grid" aria-live="polite">
            {state?.ready.length === 0 && <p className="empty">いまはありません</p>}
            {state?.ready.map((no) => (
              <div key={no} className={`ready-no ${fresh.has(no) ? 'just-ready' : ''}`}>
                {no}
                <div className="call-line" aria-hidden="true" />
              </div>
            ))}
          </div>
        </VerticalLabel>
        <VerticalLabel text={w.preparingLabel}>
          {w.usesCooking ? (
            <div className="prep-grid">
              {state?.preparing.map((no) => <span key={no}>{no}</span>)}
            </div>
          ) : (
            <p className="wait-count" aria-live="polite">
              {state?.preparing.length ?? 0}
              <span className="wait-count-unit">組</span>
            </p>
          )}
        </VerticalLabel>
      </main>
    </div>
  )
}
