// レシート（収支の証憑）の型と、アップロードの前の画像の縮小・ログインが要る画像の表示。
import { useEffect, useState } from 'react'
import { API_BASE_URL } from './api'

export type ReceiptStatus = 'uploaded' | 'ocr_done' | 'ocr_failed' | 'llm_done' | 'confirmed'

/** 読み取りの状態（アップロード・status の応答）。reading は裏で読み取っている（画面を離れても続く） */
export type OCRState = 'reading' | 'read' | 'unreadable' | 'pending' | 'disabled'

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

/** 一覧の読み直しの間隔: 登録したばかり（2分以内）で読み取り待ちのものがあれば 5 秒ごと、なければ読み直さない */
export function refetchWhileReading(items: Receipt[] | undefined): number | false {
  const since = Date.now() - 2 * 60_000
  return items?.some((r) => r.status === 'uploaded' && Date.parse(r.created_at) > since) ? 5000 : false
}

/** レシート番号の表示（例: R-0012） */
export const receiptNo = (id: number) => `R-${String(id).padStart(4, '0')}`

/** 縮小に失敗したとき（元の画像は送らない） */
export const SHRINK_FAILED = '画像を処理できませんでした。もう一度撮影してください。'

/** iOS Safari の canvas の大きさの上限（画素数）。これを超える canvas は何も描かれないので、段階的に縮めるときに超えないようにする */
const CANVAS_MAX_PIXELS = 16_000_000

const heicMessage = (file: File) =>
  /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
    ? 'この形式（HEIC）は読み込めません。カメラの設定を「互換性優先（JPEG）」にするか、スクリーンショットで送ってください。'
    : 'この画像は読み込めません。カメラで撮り直すか、JPEG・PNG の画像を選んでください。'

/** 画像を読み込む（EXIF の向きを直した大きさになる）。読めない形式は、対処のしかたを書いた Error */
async function loadImage(file: File): Promise<{ img: HTMLImageElement; release: () => void }> {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  try {
    await img.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new Error(heicMessage(file))
  }
  if (!img.naturalWidth || !img.naturalHeight) {
    URL.revokeObjectURL(url)
    throw new Error(heicMessage(file))
  }
  return { img, release: () => URL.revokeObjectURL(url) }
}

/** 白地の canvas に描く（透明な部分は白にする） */
function drawTo(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(SHRINK_FAILED)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, h)
  return canvas
}

/** 1. ブラウザに縮めながら読み込ませる（createImageBitmap の resize。大きな canvas を作らない） */
async function resizeWithBitmap(img: HTMLImageElement, w: number, h: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(img, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })
  try {
    if (bitmap.width !== w || bitmap.height !== h) throw new Error('resize is not supported')
    return drawTo(bitmap, w, h)
  } finally {
    bitmap.close()
  }
}

/** 2. 段階的に縮める（どの canvas も CANVAS_MAX_PIXELS を超えないように、半分ずつ） */
function resizeStepwise(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  let src: CanvasImageSource = img
  let cw = img.naturalWidth
  let ch = img.naturalHeight
  while (cw > w * 2 || ch > h * 2 || cw * ch > CANVAS_MAX_PIXELS) {
    // 半分にする。それでも上限を超えるなら、上限に収まるまで縮める
    let s = 0.5
    if (cw * ch * s * s > CANVAS_MAX_PIXELS) s = Math.sqrt(CANVAS_MAX_PIXELS / (cw * ch)) * 0.99
    const nw = Math.max(w, Math.floor(cw * s))
    const nh = Math.max(h, Math.floor(ch * s))
    src = drawTo(src, nw, nh)
    cw = nw
    ch = nh
  }
  return drawTo(src, w, h)
}

/** canvas が白一色でないか（iOS で上限を超えると、何も描かれずに白いままになる）。真ん中の帯を見る */
function looksBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return true
  const y = Math.floor(canvas.height / 2)
  const data = ctx.getImageData(0, Math.max(0, y - 2), canvas.width, Math.min(4, canvas.height)).data
  for (let i = 0; i < data.length; i += 4) if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) return false
  return true
}

/** アップロードの前の縮小（長辺 maxEdge px、JPEG 品質 quality）。EXIF の向きは画像を読むときに直す。
 *  高画素のカメラ（長辺 8000px など）でも、iOS Safari の canvas の上限を超えないように縮める:
 *  まず createImageBitmap の resize、できなければ半分ずつ段階的に。どちらも失敗したら Error（元の画像は送らない）。
 *  HEIC はブラウザが読める場合（iPhone の Safari など）だけ JPEG にする。読めない形式は、対処のしかたを書いた Error。 */
export async function shrinkForUpload(file: File, maxEdge = 2000, quality = 0.85): Promise<Blob> {
  const { img, release } = await loadImage(file)
  try {
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    let canvas: HTMLCanvasElement | null = null
    try {
      canvas = await resizeWithBitmap(img, w, h)
      if (looksBlank(canvas)) canvas = null
    } catch {
      canvas = null
    }
    if (!canvas) {
      try {
        canvas = resizeStepwise(img, w, h)
      } catch {
        throw new Error(SHRINK_FAILED)
      }
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size === 0) throw new Error(SHRINK_FAILED)
    return blob
  } finally {
    release()
  }
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
