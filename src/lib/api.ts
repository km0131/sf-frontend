/** API サーバーの URL。末尾の / は取り除く。 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

/** API のエラー（{"error": {"code", "message", "details"}} の形）。 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: Record<string, unknown>

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

/** ログインが切れた（401）ときに呼ぶ処理。画面ごとに登録する。 */
let onUnauthorized: ((token: string) => void) | null = null
export function setUnauthorizedHandler(fn: ((token: string) => void) | null) {
  onUnauthorized = fn
}

type FetchInit = Omit<RequestInit, 'body'> & { token?: string; body?: unknown }

/** API を呼び、JSON を返す。エラーレスポンスは ApiError にする。 */
export async function apiFetch<T>(path: string, init: FetchInit = {}): Promise<T> {
  const { token, headers, body, ...rest } = init
  const isForm = body instanceof FormData
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    headers: {
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })
  if (res.status === 204) {
    return undefined as T
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = data?.error ?? {}
    if (res.status === 401 && token && onUnauthorized) onUnauthorized(token)
    throw new ApiError(res.status, err.code ?? 'unknown', err.message ?? res.statusText, err.details)
  }
  return data as T
}

/** 画像などのパス（/media/...）を API サーバーの URL にする。 */
export function mediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  return path.startsWith('http') ? path : `${API_BASE_URL}${path}`
}

/** エラーを画面に出す文にする。 */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    return messages[e.code] ?? e.message
  }
  if (e instanceof TypeError) return '通信できませんでした。電波の状態を確かめて、もう一度お試しください。'
  return e instanceof Error ? e.message : String(e)
}

const messages: Record<string, string> = {
  invalid_credentials: 'ログイン情報が違います。',
  rate_limited: '試行が多すぎます。少し時間をおいてお試しください。',
  session_revoked: 'ログインの期限が切れました。もう一度ログインしてください。',
  invalid_token: 'ログインの期限が切れました。もう一度ログインしてください。',
  unauthorized: 'ログインしてください。',
  forbidden: 'この操作はできません。',
  shop_not_open: 'このお店は、いま注文を受け付けていません。',
  item_unavailable: '売り切れになった品があります。お品書きを確かめてください。',
  option_unavailable: '売り切れになった選択肢があります。選び直してください。',
  invalid_options: '選択肢の選び方を確かめてください。',
  too_many_items: '一度に注文できる数を超えています。',
  turnstile_failed: '確認に失敗しました。画面を読み込み直してお試しください。',
  status_conflict: 'ほかの端末で操作されました。最新の状態を表示します。',
  payment_required: 'お代金を受け取ってから完了にしてください。',
  already_paid: 'すでに支払い済みです。',
  slug_taken: 'その URL 名はすでに使われています。',
  order_prefix_taken: 'その頭文字は、この開催回でほかの店が使っています。',
  email_taken: 'そのメールアドレスはすでに使われています。',
  shop_has_orders: '注文がある出店は取り消せません。',
  payload_too_large: 'ファイルが大きすぎます（5MBまで）。',
  unsupported_image: 'JPEG・PNG・WebP の画像を選んでください。',
}
