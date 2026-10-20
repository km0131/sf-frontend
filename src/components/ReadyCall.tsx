import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react'
import { callSound } from '../lib/callSound'

/** 呼び出し音のオン・オフ。既定はオンで、設定はページを移っても変わらない。
 *  ブラウザの決まりで、ページを開いてから一度画面をタップするまでは鳴らせないので、そのときは案内を出す。 */
export function CallSoundButton() {
  const on = useSyncExternalStore(callSound.subscribe, callSound.isOn)
  const ready = useSyncExternalStore(callSound.subscribe, callSound.isReady)
  return (
    <div className="call-sound">
      <button
        type="button"
        className="btn btn-secondary btn-block"
        aria-pressed={on}
        // まだ鳴らせない状態でのタップは、画面全体のタップと同じく「有効にする」だけ（オフにはしない）
        onClick={() => (on && !ready ? undefined : callSound.setOn(!on))}
      >
        {on ? (ready ? '呼び出し音：オン' : '呼び出し音：オン（タップで有効にする）') : '呼び出し音：オフ'}
      </button>
      <p className="field-hint">
        呼び出しのときに音と画面でお知らせします。この画面かお店の一覧を開いたままお待ちください。
        iPhone はマナーモード（消音）だと鳴らないことがあります。
      </p>
    </div>
  )
}

/** 呼び出しの全画面表示。遠目でも分かるよう、店舗の色で点滅する。どこをタップしても閉じる。 */
export function ReadyCallOverlay({
  shopName,
  orderNo,
  heading,
  message,
  style,
  onClose,
}: {
  shopName: string
  orderNo: string
  heading: string
  message: string
  style?: CSSProperties
  onClose: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <button ref={ref} type="button" className="call-alert" role="alert" style={style} onClick={onClose}>
      <span className="call-alert-shop">{shopName}</span>
      <span className="call-alert-heading">{heading}！</span>
      <span className="call-alert-no">{orderNo}</span>
      <span className="call-alert-message">{message}</span>
      <span className="call-alert-close">タップで閉じる</span>
    </button>
  )
}
