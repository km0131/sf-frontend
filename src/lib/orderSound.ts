// 注文帳の「注文が入った」音。お客様の呼び出し音（callSound.ts）とは別の音で、設定も別に保存する。
// ブラウザは操作なしに音を出させないので、画面を最初にタップしたとき（PIN の入力など）に鳴らせるようにする。

const prefKey = 'sf.orderSound'
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

let ctx: AudioContext | null = null
/** このページを開いてから音の制限を解除したか */
let unlocked = false

function readOn(): boolean {
  try {
    return localStorage.getItem(prefKey) !== 'off'
  } catch {
    return true
  }
}
let on = readOn()

function unlock() {
  try {
    ctx ??= new AudioContext()
    void ctx.resume().catch(() => {})
    // 無音を一瞬だけ鳴らして解除する
    const src = ctx.createBufferSource()
    src.buffer = ctx.createBuffer(1, 1, 22050)
    src.connect(ctx.destination)
    src.start(0)
  } catch {
    ctx = null
    return
  }
  if (!unlocked) {
    unlocked = true
    notify()
  }
}

/** 注文の音の設定（既定はオン）。useSyncExternalStore で読む。 */
export const orderSound = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  isOn: () => on,
  /** 鳴らせる状態か（オンで、かつ制限を解除済み） */
  isReady: () => on && unlocked,
  /** オン・オフを切り替える。ボタンを押した処理の中で呼ぶ */
  setOn(next: boolean) {
    on = next
    try {
      localStorage.setItem(prefKey, next ? 'on' : 'off')
    } catch {
      // 保存できなくても、このページを開いている間は切り替わる
    }
    if (next) {
      unlock()
      playOrderSound()
    }
    notify()
  },
}

/** 画面のどこかを最初にタップ（またはキー操作）したときに、音の制限を解除する。 */
export function installOrderSoundUnlock(): () => void {
  const events = ['click', 'touchend', 'keydown'] as const
  const handler = () => {
    if (unlocked) return remove()
    if (!on) return
    unlock()
    remove()
  }
  const remove = () => events.forEach((e) => document.removeEventListener(e, handler, true))
  events.forEach((e) => document.addEventListener(e, handler, true))
  return remove
}

/** 「ピンポン」と2回鳴らす（厨房の音に負けないよう、はっきりした音にする）。失敗しても例外は出さない。 */
export function playOrderSound() {
  if (!on || !ctx) return
  try {
    const now = ctx.currentTime
    ;[0, 0.7].forEach((start) => {
      ;[1047, 784].forEach((freq, i) => {
        const at = now + start + i * 0.18
        const osc = ctx!.createOscillator()
        const gain = ctx!.createGain()
        osc.type = 'triangle'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0, at)
        gain.gain.linearRampToValueAtTime(0.35, at + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.5)
        osc.connect(gain).connect(ctx!.destination)
        osc.start(at)
        osc.stop(at + 0.5)
      })
    })
  } catch {
    // 音が出せない端末では何もしない
  }
}
