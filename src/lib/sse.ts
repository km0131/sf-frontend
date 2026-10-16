import { API_BASE_URL } from './api'

export type SSEMessage = { type: string; data: unknown }

/**
 * SSE を fetch のストリームで受ける（Authorization ヘッダーを付けるため。ブラウザの EventSource では付けられない）。
 * 切れたら3秒後につなぎ直す。stop() で終わる。
 */
export function streamEvents(
  path: string,
  token: string | undefined,
  onMessage: (m: SSEMessage) => void,
  onStatus?: (connected: boolean) => void,
): { stop: () => void } {
  let stopped = false
  let controller: AbortController | null = null

  const run = async () => {
    while (!stopped) {
      controller = new AbortController()
      try {
        const res = await fetch(`${API_BASE_URL}${path}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        })
        if (res.status === 401) {
          onMessage({ type: 'session_expired', data: {} })
          return
        }
        if (!res.ok || !res.body) throw new Error(`status ${res.status}`)
        onStatus?.(true)

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += value
          let sep: number
          while ((sep = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, sep)
            buffer = buffer.slice(sep + 2)
            const msg = parseBlock(block)
            if (msg) {
              onMessage(msg)
              if (msg.type === 'session_expired') return
            }
          }
        }
      } catch {
        // つなぎ直す
      }
      onStatus?.(false)
      if (!stopped) await new Promise((r) => setTimeout(r, 3000))
    }
  }
  void run()

  return {
    stop() {
      stopped = true
      controller?.abort()
    },
  }
}

function parseBlock(block: string): SSEMessage | null {
  let type = 'message'
  const data: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) type = line.slice(7)
    else if (line.startsWith('data: ')) data.push(line.slice(6))
  }
  if (data.length === 0) return null
  try {
    return { type, data: JSON.parse(data.join('\n')) }
  } catch {
    return null
  }
}
