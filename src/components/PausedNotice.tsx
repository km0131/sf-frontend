/** 学園祭が中止中のお知らせ（お客様・レジの画面の上部に出す）。 */
export function PausedNotice({ message, staff = false }: { message?: string; staff?: boolean }) {
  return (
    <div className="paused-notice fade-in" role="status">
      <p className="paused-notice-title">{staff ? '学園祭は中止中です。新しい注文は受け付けられません' : 'ただいま注文の受け付けを中止しています'}</p>
      {message && <p className="paused-notice-body">{message}</p>}
      {staff && <p className="paused-notice-body">受け付け済みの注文の調理・お渡しは続けられます。</p>}
    </div>
  )
}
