import { useState } from 'react'
import { errorMessage } from '../lib/api'
import { downloadFile } from '../lib/download'

/** 収支報告の Excel（収支報告書・支出明細・売上明細）と、レシートの画像の ZIP のダウンロード。
 *  店長は自分の店舗、システム管理者は shopId の店舗。回の本番の開催回を合わせたもの（練習は含めない）。 */
export function LedgerExport({
  token,
  eventId,
  shopId,
  name,
  compact,
}: {
  token: string
  eventId: number
  shopId?: number
  /** ファイル名に入れる名前（例: 第60回 学園祭_広島焼き） */
  name: string
  compact?: boolean
}) {
  const [busy, setBusy] = useState<'xlsx' | 'zip' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const query = `event_id=${eventId}${shopId ? `&shop_id=${shopId}` : ''}`
  const base = shopId ? '/api/admin/ledger' : '/api/manage/ledger'

  const get = async (kind: 'xlsx' | 'zip') => {
    setBusy(kind)
    setError(null)
    try {
      const file = name.replace(/[/\\:*?"<>|]/g, '_')
      if (kind === 'xlsx') await downloadFile(`${base}/export.xlsx?${query}`, token, `収支報告_${file}.xlsx`)
      else await downloadFile(`${base}/receipts.zip?${query}`, token, `レシート_${file}.zip`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const cls = compact ? 'btn-text' : 'btn btn-secondary'
  return (
    <div className="ledger-export">
      <div className="ledger-export-buttons">
        <button type="button" className={cls} disabled={busy !== null} onClick={() => void get('xlsx')}>
          {busy === 'xlsx' ? '作っています…' : 'Excel'}
        </button>
        <button type="button" className={cls} disabled={busy !== null} onClick={() => void get('zip')}>
          {busy === 'zip' ? '作っています…' : 'レシート画像（ZIP）'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}
