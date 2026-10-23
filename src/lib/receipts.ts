// レシート（収支の証憑）の型と、アップロードの前の画像の縮小・ログインが要る画像の表示。
import { useEffect, useState } from 'react'
import { API_BASE_URL } from './api'

export type ReceiptStatus = 'uploaded' | 'ocr_done' | 'ocr_failed' | 'llm_done' | 'confirmed'

/** その場の読み取りの結果（アップロードの応答） */
export type OCRState = 'read' | 'unreadable' | 'pending' | 'disabled'

export type OCRResult = {
  total: number | null
  purchase_date: string | null
  store_name: string | null
  tax_rates: number[]
  lines: string[]
  elapsed_ms: number
  model: string
}

export type ReceiptItem = { name: string; amount: number }

export type Receipt = {
  id: number
  session_id: number
  session_name: string
  event_id: number
  status: ReceiptStatus
  ocr: OCRResult | null
  ocr_attempts: number
  ocr_error: string | null
  /** 確定した内容（確定前は null） */
  store_name: string | null
  purchase_date: string | null
  total: number | null
  category: string | null
  items: ReceiptItem[]
  ledger_entry_id: number | null
  confirmed_at: string | null
  uploaded_by_role: 'system_admin' | 'shop_manager' | 'staff'
  uploaded_by_name: string | null
  created_at: string
}

export type UploadResult = { receipt: Receipt; ocr_state: OCRState; duplicates: number[] }

export const statusLabels: Record<ReceiptStatus, string> = {
  uploaded: '読み取り待ち',
  ocr_done: '要確認',
  ocr_failed: '読み取れず',
  llm_done: '要確認（AI）',
  confirmed: '確定済み',
}

/** レシート番号の表示（例: R-0012） */
export const receiptNo = (id: number) => `R-${String(id).padStart(4, '0')}`

/** アップロードの前の縮小（長辺 2000px、JPEG 品質 85）。EXIF の向きは画像を読むときに直す。
 *  HEIC はブラウザが読める場合（iPhone の Safari など）だけ JPEG にする。読めない形式は Error。 */
export async function shrinkForUpload(file: File, maxEdge = 2000, quality = 0.85): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('この画像は読み込めませんでした。カメラで撮り直すか、JPEG の画像を選んでください。')
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画像を縮められませんでした。')
  ctx.fillStyle = '#fff' // 透明な部分は白にする
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('画像を縮められませんでした。')
  return blob
}

/** ログインが要る画像（レシートの画像・サムネイル）を表示するための URL。使い終わったら自動で解放する。 */
export function useAuthImage(path: string | null, token: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!path) return
    let alive = true
    let objectUrl: string | null = null
    fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!alive || !b) return
        objectUrl = URL.createObjectURL(b)
        setUrl(objectUrl)
      })
      .catch(() => {})
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, token])
  return path ? url : null
}
