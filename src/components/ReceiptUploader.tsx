import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ApiError, apiFetch, errorMessage } from '../lib/api'
import { yen } from '../lib/format'
import { sessionLabel, type EventSession } from '../lib/ledger'
import { receiptNo, shrinkForUpload, type UploadResult } from '../lib/receipts'

type Sessions = { items: EventSession[]; default_session_id: number | null }

/** 読み取りの結果を待つ間隔と、待つのをやめるまでの時間（サーバーは 25 秒で区切り、あとで読み取る） */
const POLL_MS = 2000
const WAIT_MS = 40_000

/** レシートの登録（スタッフ・店長で共通）。開催回を選び、撮影または画像を選んで送る。
 *  画像はブラウザで縮めてから送る（長辺 2000px・JPEG）。保存できたら、裏の読み取りの結果を待って出す。
 *  「あとで確認する」で待つのをやめても、読み取りはサーバーで続き、一覧に結果が出る。 */
export function ReceiptUploader({ token, base }: { token: string; base: '/api/staff' | '/api/manage' }) {
  const queryClient = useQueryClient()
  // 開催回の選択肢は、受付中のものだけ
  const sessions = useQuery({
    queryKey: ['receipts', 'sessions', base],
    queryFn: () => apiFetch<Sessions>(base === '/api/staff' ? '/api/staff/receipts/sessions' : '/api/manage/ledger/sessions', { token }),
  })
  const open = sessions.data?.items.filter((s) => s.receipt_open) ?? []
  const [picked, setPicked] = useState<number | null>(null)
  const sessionId = picked ?? (open.some((s) => s.id === sessions.data?.default_session_id) ? sessions.data!.default_session_id : open[0]?.id) ?? null
  const session = open.find((s) => s.id === sessionId)

  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [later, setLater] = useState(false)
  // 待っている読み取りの番号。変えると、待つのをやめる（「あとで確認する」・別の画像を送る・画面を離れる）
  const waiting = useRef(0)
  useEffect(() => () => void waiting.current++, [])

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['receipts'] })

  /** 裏の読み取りが終わるまで、状態を読み直す */
  const waitForRead = async (first: UploadResult) => {
    const mine = ++waiting.current
    const deadline = Date.now() + WAIT_MS
    let r = first
    while (r.ocr_state === 'reading' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
      if (waiting.current !== mine) return
      try {
        r = await apiFetch<UploadResult>(`${base}/receipts/${r.receipt.id}/status`, { token })
      } catch {
        continue // 電波が途切れたときなどは、次の回にもう一度
      }
      if (waiting.current !== mine) return
    }
    // 時間内に終わらなければ「後で読み取る」として出す（サーバーで読み取りは続く）
    setResult(r.ocr_state === 'reading' ? { ...r, ocr_state: 'pending' } : r)
    refresh()
  }

  const send = async (file: File) => {
    if (!sessionId) return
    waiting.current++
    setBusy(true)
    setError(null)
    setResult(null)
    setLater(false)
    try {
      const blob = await shrinkForUpload(file)
      const form = new FormData()
      form.append('session_id', String(sessionId))
      form.append('image', blob, 'receipt.jpg')
      const r = await apiFetch<UploadResult>(`${base}/receipts`, { method: 'POST', token, body: form })
      setResult(r)
      refresh()
      if (r.ocr_state === 'reading') void waitForRead(r)
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.code === 'session_closed'
            ? 'この開催回は、レシートの受け付けを締め切りました。'
            : e.code === 'payload_too_large'
              ? '画像が大きすぎます。もう一度撮影してください。'
              : errorMessage(e)
          : e instanceof Error
            ? e.message
            : String(e),
      )
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  if (sessions.data && open.length === 0) {
    return <p className="empty">レシートを受け付けている開催回がありません（運営が開きます）。</p>
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <label className="field">
        <span className="field-label">開催回</span>
        <select className="select" value={sessionId ?? ''} onChange={(e) => setPicked(Number(e.target.value))}>
          {open.map((s) => (
            <option key={s.id} value={s.id}>
              {sessionLabel(s)}
            </option>
          ))}
        </select>
      </label>
      {session && (
        <p className="receipt-session">
          登録先：<strong>{session.name}</strong>（{session.kind === 'production' ? '本番' : '練習'}）
        </p>
      )}

      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void send(f)
        }}
      />
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!sessionId || busy || result?.ocr_state === 'reading'}
        onClick={() => input.current?.click()}
      >
        {busy ? '送っています…' : 'レシートを撮る・選ぶ'}
      </button>
      <p className="field-hint">レシート全体が入るように、明るい場所で真上から撮ってください。画像は縮めてから送ります。</p>

      {error && <p className="error-text">{error}</p>}
      {result && (
        <UploadMessage
          result={result}
          onLater={() => {
            waiting.current++
            setResult(null)
            setLater(true)
            refresh()
          }}
        />
      )}
      {later && (
        <p className="receipt-result" role="status">
          保存しました。読み取りは続けています。終わると、レシートの一覧に結果が出ます。
        </p>
      )}
    </div>
  )
}

function UploadMessage({ result, onLater }: { result: UploadResult; onLater: () => void }) {
  const r = result.receipt
  const ocr = r.ocr
  if (result.ocr_state === 'reading') {
    return (
      <div className="receipt-result receipt-result-reading" role="status">
        <p className="receipt-result-title">
          <span className="spinner" aria-hidden="true" />
          読み取り中…（15秒ほどかかります）
        </p>
        <p className="field-hint">{receiptNo(r.id)} として保存しました。画面を離れても、読み取りは続きます。</p>
        <button type="button" className="btn btn-secondary btn-block" onClick={onLater}>
          あとで確認する
        </button>
      </div>
    )
  }
  return (
    <div className={`receipt-result receipt-result-${result.ocr_state}`} role="status">
      <p className="receipt-result-title">
        {result.ocr_state === 'read' && `読み取りました（${receiptNo(r.id)}）`}
        {result.ocr_state === 'unreadable' && '読み取れませんでした。撮り直してください'}
        {result.ocr_state === 'pending' && `保存しました（${receiptNo(r.id)}）。読み取りは後で行います`}
        {result.ocr_state === 'disabled' && `保存しました（${receiptNo(r.id)}）。内容は店長が入力します`}
      </p>
      {result.ocr_state === 'read' && ocr && (
        <dl className="receipt-result-fields">
          <dt>合計</dt>
          <dd className="mono">{ocr.total != null ? yen(ocr.total) : '—'}</dd>
          <dt>日付</dt>
          <dd className="mono">{ocr.purchase_date ?? '—'}</dd>
          <dt>店名</dt>
          <dd>{ocr.store_name ?? '—'}</dd>
          <dt>税率</dt>
          <dd>{ocr.tax_rates.length ? ocr.tax_rates.map((t) => `${t}%`).join('・') : '—'}</dd>
        </dl>
      )}
      {result.ocr_state === 'read' && <p className="field-hint">内容は、店長が確かめてから収支に登録します。</p>}
      {result.duplicates.length > 0 && (
        <p className="receipt-dup">
          同じレシートがもう登録されているかもしれません（{result.duplicates.map(receiptNo).join('、')}）。二重に登録していないか確かめてください。
        </p>
      )}
    </div>
  )
}
