/** 整理番号の並び順（A-2 < A-10）。 */
export const byNumber = (a: string, b: string) => a.localeCompare(b, 'ja', { numeric: true })

let audio: AudioContext | null = null

/** できあがりの合図。やわらかい2音（ブラウザの決まりで、最初の1回は画面を押したときに鳴らす）。 */
export function chime() {
  try {
    audio ??= new AudioContext()
    const now = audio.currentTime
    ;[660, 880].forEach((freq, i) => {
      const osc = audio!.createOscillator()
      const gain = audio!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + i * 0.25)
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.25 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.25 + 0.8)
      osc.connect(gain).connect(audio!.destination)
      osc.start(now + i * 0.25)
      osc.stop(now + i * 0.25 + 0.8)
    })
  } catch {
    // 音が出せない端末では何もしない
  }
}
