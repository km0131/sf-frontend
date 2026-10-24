import { useEffect } from 'react'

type WakeLockSentinel = { release: () => Promise<void> }

/** 画面が暗くならないようにする（Wake Lock が使える端末だけ。使えない・断られたときは何もしない）。
 *  enabled が false のあいだは解除する。タブを裏に回すと端末が自動で解除するので、表に戻ったときに取り直す。 */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    let lock: WakeLockSentinel | null = null
    let stopped = false
    const request = async () => {
      try {
        const next = (await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinel> } }).wakeLock?.request('screen')) ?? null
        if (stopped) void next?.release()
        else lock = next
      } catch {
        // 対応していない端末・省電力モードなどでは何もしない
      }
    }
    void request()
    const onVisible = () => document.visibilityState === 'visible' && void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => {})
    }
  }, [enabled])
}
