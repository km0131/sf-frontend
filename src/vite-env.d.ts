/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API サーバーの URL（例: http://localhost:18080、本番は https://api.example.com） */
  readonly VITE_API_BASE_URL: string
  /** Cloudflare Turnstile のサイトキー。空なら検証しない（開発用） */
  readonly VITE_TURNSTILE_SITE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
