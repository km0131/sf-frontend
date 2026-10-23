// ログインが要るファイル（Excel・ZIP など）のダウンロード。
import { API_BASE_URL } from './api'

/** ファイルを取ってきて保存する。名前は name（API が別のオリジンだと Content-Disposition が読めないため）。
 *  読めるとき（同じオリジン）は、サーバーの付けた名前（日本語は filename*）を使う。 */
export async function downloadFile(path: string, token: string, name: string) {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`ファイルを作れませんでした（${res.status}）`)
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = encoded ? decodeURIComponent(encoded) : name
  a.click()
  URL.revokeObjectURL(url)
}
