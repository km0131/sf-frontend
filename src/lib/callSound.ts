// お客様の呼び出し音。ブラウザは操作なしに音を出させないので、画面を最初にタップしたときに unlockCallSound() で解除しておき、
// 呼び出しになったら playCallSound() で鳴らす。鳴らせないとき（解除前・非対応の端末など）は何もしない。
// オン・オフはブラウザに保存し、ページを移っても読み込み直しても変わらない（既定はオン）。

/** 呼び出し音のファイル（public/sounds/ に置く短いチャイム）。無い・読めないときは Web Audio で作った音を鳴らす。 */
const SOUND_URL = '/sounds/call.mp3'

let audio: HTMLAudioElement | null = null
/** ファイルが読めなかった（置いていない・形式が違う）ら true。以後は Web Audio で鳴らす */
let fileFailed = false
let ctx: AudioContext | null = null
/** このページを開いてから音の制限を解除したか（読み込み直すと、またタップが必要） */
let unlocked = false

const prefKey = 'sf.callSound'
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

function readOn(): boolean {
  try {
    return localStorage.getItem(prefKey) !== 'off'
  } catch {
    return true
  }
}
let on = readOn()

/** 呼び出し音の設定。useSyncExternalStore で読む。 */
export const callSound = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  /** オンか（既定はオン） */
  isOn: () => on,
  /** 鳴らせる状態か（オンで、かつ制限を解除済み） */
  isReady: () => on && unlocked,
  /** オン・オフを切り替える。オンにするときはボタンを押した処理の中で呼ぶ（そのまま制限を解除する） */
  setOn(next: boolean) {
    on = next
    try {
      localStorage.setItem(prefKey, next ? 'on' : 'off')
    } catch {
      // 保存できなくても、このページを開いている間は切り替わる
    }
    if (next) unlockCallSound()
    notify()
  },
}

/** 画面のどこかを最初にタップ（またはキー操作）したときに、音の制限を解除する。オフのときは解除しない。 */
export function installCallSoundUnlock(): () => void {
  const events = ['click', 'touchend', 'keydown'] as const
  const handler = () => {
    if (!on || unlocked) return
    unlockCallSound()
    remove()
  }
  const remove = () => events.forEach((e) => document.removeEventListener(e, handler, true))
  events.forEach((e) => document.addEventListener(e, handler, true))
  return remove
}

/** iPhone のマナーモードでも鳴らせるよう、音声の種類を「再生」にする（対応している Safari だけ）。 */
function setPlaybackSession() {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'playback'
  } catch {
    // 対応していない端末では何もしない
  }
}

/** 呼び出し音を鳴らせるようにする。ボタンを押したときの処理の中で（await をはさまずに）呼ぶこと。 */
export function unlockCallSound() {
  setPlaybackSession()

  try {
    if (!audio) {
      audio = new Audio(SOUND_URL)
      audio.preload = 'auto'
      audio.addEventListener('error', () => {
        fileFailed = true
      })
    }
    // 無音で一度再生して止めると、あとから操作なしで鳴らせるようになる
    const a = audio
    a.muted = true
    a.play().then(
      () => {
        a.pause()
        a.currentTime = 0
        a.muted = false
      },
      () => {
        // ファイルが無い（index.html が返る）・形式が違うときもここに来る
        a.muted = false
        fileFailed = true
      },
    )
  } catch {
    fileFailed = true
  }

  try {
    ctx ??= new AudioContext()
    void ctx.resume().catch(() => {})
    // 無音を一瞬だけ鳴らして、Web Audio 側も解除しておく
    const src = ctx.createBufferSource()
    src.buffer = ctx.createBuffer(1, 1, 22050)
    src.connect(ctx.destination)
    src.start(0)
  } catch {
    ctx = null
  }
  if (!unlocked) {
    unlocked = true
    notify()
  }
}

/** 呼び出し音を1回鳴らす。失敗しても例外は出さない。 */
export function playCallSound() {
  if (!on) return
  if (audio && !fileFailed) {
    try {
      audio.currentTime = 0
      audio.play().catch(() => {
        fileFailed = true
        synthChime()
      })
      return
    } catch {
      fileFailed = true
    }
  }
  synthChime()
}

/** ファイルが無いときのチャイム（高めの3音で約1.5秒）。 */
function synthChime() {
  if (!ctx) return
  try {
    const now = ctx.currentTime
    ;[784, 988, 1319].forEach((freq, i) => {
      const at = now + i * 0.22
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.3, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, at + 1)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(at)
      osc.stop(at + 1)
    })
  } catch {
    // 音が出せない端末では何もしない
  }
}
