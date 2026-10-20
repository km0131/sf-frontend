import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/** Turnstile（ボット対策）のスクリプトと iframe の配信元 */
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'
/** Cloudflare Web Analytics の計測スクリプトの配信元と送信先（スクリプトは Cloudflare が自動挿入する） */
const CF_INSIGHTS_SCRIPT_ORIGIN = 'https://static.cloudflareinsights.com'
const CF_INSIGHTS_BEACON_ORIGIN = 'https://cloudflareinsights.com'

/** 本番で付けるセキュリティヘッダー。API の配信元は CSP の接続先・画像の読み込み元に加える。 */
function securityHeaders(apiBaseUrl: string): Record<string, string> {
  const api = apiBaseUrl ? new URL(apiBaseUrl).origin : ''
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${TURNSTILE_ORIGIN} ${CF_INSIGHTS_SCRIPT_ORIGIN}`,
    "style-src 'self'",
    "font-src 'self'",
    `img-src 'self' data: blob: ${api}`,
    `connect-src 'self' ${api} ${CF_INSIGHTS_BEACON_ORIGIN}`,
    `frame-src ${TURNSTILE_ORIGIN}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
  return {
    'Content-Security-Policy': csp.map((d) => d.trim()).join('; '),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }
}

/** Cloudflare Workers 用の _headers を dist/ に書き出す（nginx のプレビューもこれを読み込む）。 */
function headersFile(apiBaseUrl: string): Plugin {
  return {
    name: 'sf-headers-file',
    apply: 'build',
    generateBundle() {
      const lines = Object.entries(securityHeaders(apiBaseUrl)).map(([k, v]) => `  ${k}: ${v}`)
      const source = [
        '/*',
        ...lines,
        '',
        // ビルド済みの JS・CSS・フォントはファイル名にハッシュが入るので長くキャッシュしてよい
        '/assets/*',
        '  Cache-Control: public, max-age=31536000, immutable',
        '',
      ].join('\n')
      this.emitFile({ type: 'asset', fileName: '_headers', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), headersFile(env.VITE_API_BASE_URL ?? '')],
    build: {
      // 小さいフォントも data: URL にせずファイルで配信する（CSP の font-src を 'self' に保つ）
      assetsInlineLimit: (file: string) => (/\.woff2?$/.test(file) ? false : undefined),
    },
    server: {
      // Docker コンテナの外（ホストのブラウザ）から開けるようにする
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      strictPort: true,
    },
  }
})
