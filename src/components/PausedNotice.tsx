/** 学園祭が中止中のお知らせ（お客様・レジの画面の上部に出す）。全店に出すので、飲食・飲食以外のどちらにも合う言葉にする。 */
export function PausedNotice({ message, staff = false }: { message?: string; staff?: boolean }) {
  return (
    <div className="paused-notice fade-in" role="status">
      <p className="paused-notice-title">{staff ? '学園祭は中止中です。新しい受付はできません' : 'ただいま受付を中止しています'}</p>
      {message && <p className="paused-notice-body">{message}</p>}
      {staff && <p className="paused-notice-body">受付済みの分の対応（調理・呼び出し・完了）は続けられます。</p>}
    </div>
  )
}
