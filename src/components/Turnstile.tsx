import { useEffect, useRef } from 'react'

const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

/** Web 注文の画面で付ける action（バックエンドの turnstile.ActionWebOrder と同じ値） */
export const TURNSTILE_ACTION_WEB_ORDER = 'web_order'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      remove: (id: string) => void
    }
  }
}

let scriptPromise: Promise<void> | null = null
function loadScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Turnstile を読み込めませんでした'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

/** Cloudflare Turnstile（ボット対策）。通ったらトークンを onToken に渡す。
 *  action はバックエンドの siteverify で照合されるので、画面ごとに決まった値を渡す。
 *  サイトキーが未設定（開発環境）なら何も表示せず、すぐに仮のトークンを渡す。 */
export function Turnstile({ action, onToken }: { action: string; onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!siteKey) {
      onToken('dev')
      return
    }
    let id: string | undefined
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return
        id = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          action,
          language: 'ja',
          callback: (t: string) => onToken(t),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        })
      })
      .catch(() => onToken(null))
    return () => {
      cancelled = true
      if (id && window.turnstile) window.turnstile.remove(id)
    }
  }, [action, onToken])

  return siteKey ? <div ref={ref} /> : null
}
