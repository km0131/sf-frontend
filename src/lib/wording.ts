import type { BusinessType, CustomerOrder, OrderStatus } from './types'

/** 画面の言葉（店舗の種類ごと）。飲食以外の店は「お品書き」「ご注文」「お渡し」などを汎用の言葉にする。
 *  状態の流れも種類で変わる（飲食: 受付 → 調理中 → お渡し待ち、飲食以外: 待ち → 呼び出し中）。 */
export type Wording = {
  /** 調理の段階（cooking）を使うか */
  usesCooking: boolean
  /** 状態の表示名 */
  status: Partial<Record<OrderStatus, string>>

  // ---- お客様：お品書き・注文 ----
  menuTitle: string
  menuCommand: string
  menuEmpty: string
  menuLimitNote: (max: number) => string
  /** 合計数量が上限に達したとき（サーバーが上限超過を返したときも） */
  limitReached: (max: number) => string
  /** 選んだ数の単位（「3品を選択中」） */
  countUnit: string
  notOpen: string
  orderButton: string
  orderPausedButton: string
  confirmTitle: string
  confirmSubmit: string
  totalUnpaid: string
  noteHint: string
  emailHint: string

  // ---- お客様：注文状況 ----
  steps: string[]
  stepIndex: Record<OrderStatus, number>
  waitingText: Partial<Record<OrderStatus, string>>
  logCreated: string
  logCooking: string
  logReady: string
  logDone: string
  logCancelled: string
  headingReceived: string
  soon: string
  headingReady: string
  readyMessage: string
  headingDone: string
  headingCancelled: string
  cancelledLookup: string
  doneLookup: string
  notFound: string
  backToMenu: string
  /** 確認画面の注意書き（お支払いの時機） */
  payNote: string
  /** 確認画面の注意書き（キャンセルできる期限） */
  cancelLimitNote: string
  cancelButton: string
  cancelConfirm: string
  /** 調理（呼び出し）が始まってキャンセルできないときの案内 */
  cancelUnavailable: string
  /** キャンセルを押したのと同時に調理（呼び出し）が始まったとき */
  cancelRace: string
  /** 呼び出し中の受け取り期限（「12:30までにお受け取りください」） */
  pickupBy: (time: string) => string
  /** 確認画面の注意書き（取り置き時間） */
  holdNote: (minutes: number) => string
  headingUnclaimed: string
  unclaimedMessage: string
  logUnclaimed: string

  // ---- スタッフ ----
  boardTab: string
  boardCommand: string
  /** 注文帳の列（表示する状態だけ） */
  columns: { status: OrderStatus; num: string; title: string }[]
  /** 注文帳のボタン（その状態から次へ進める） */
  advance: Partial<Record<OrderStatus, string>>
  /** 注文帳のボタンで進める先 */
  nextStatus: Partial<Record<OrderStatus, OrderStatus>>
  doneLog: string
  finishTitle: string
  finishButton: string
  unpaidNotice: string
  cancelNotice: string
  cancelPaidNotice: string
  cancelPlaceholder: string
  posSoon: string

  // ---- 大画面 ----
  displayCommand: string
  allDisplayCommand: string
  readyLabel: string
  readyNote: string
  /** 大画面の「準備中」欄の見出し（飲食以外は番号を出さず「待ち ○組」だけ） */
  preparingLabel: string
  /** 上部の件数表示 */
  displayCounts: (ready: number, preparing: number) => string

  // ---- 店長 ----
  descriptionHint: string
  emailOption: string
  timeCooking: string
  timeReady: string
  timeDone: string
  correctionHint: string
  waitPanelTitle: string
  unclaimedLabel: string
  unclaimedNote: string
}

const food: Wording = {
  usesCooking: true,
  status: { waiting: '受付', cooking: '調理中', ready: 'お渡し待ち', done: 'お渡し済み', cancelled: '取り消し', unclaimed: '未受取' },

  menuTitle: 'お品書き',
  menuCommand: 'お品書きを表示',
  menuEmpty: 'お品書きを準備しています',
  menuLimitNote: (max) => `ご注文はおひとり様 ${max}点まで`,
  limitReached: (max) => `1回のご注文は合計${max}個までです`,
  countUnit: '品',
  notOpen: 'このお店は、いま注文を受け付けていません。',
  orderButton: '注文する',
  orderPausedButton: '注文の受け付けを中止しています',
  confirmTitle: 'ご注文の確認',
  confirmSubmit: '注文を確定する',
  totalUnpaid: '合計（お受け取りの際にお支払い）',
  noteHint: '抜いてほしいものなどがあれば書いてください（200文字まで）。ご希望はお作りするときにだけ使い、学園祭の終了から30日後に消去します。',
  emailHint:
    '入力すると、整理番号の控えと、できあがりのお知らせを送ります。お名前・メールアドレスはこの目的にだけ使い、学園祭の終了から30日後に消去します。',

  steps: ['受付', '調理', '仕上げ', 'お渡し'],
  stepIndex: { waiting: 0, cooking: 1, ready: 2, done: 3, cancelled: -1, unclaimed: -1 },
  waitingText: {
    waiting: '調理の順番を待っています',
    cooking: 'できあがりを待っています',
    ready: 'お受け取りをお待ちしています',
  },
  logCreated: 'ご注文を受け付けました',
  logCooking: '調理をはじめました',
  logReady: 'できあがりました',
  logDone: 'お渡ししました。ありがとうございました',
  logCancelled: 'ご注文を取り消しました',
  headingReceived: 'ご注文を承りました',
  soon: 'まもなくお作りします',
  headingReady: 'できあがりました',
  readyMessage: 'お店でこの番号をお見せください',
  headingDone: 'お受け取りありがとうございました',
  headingCancelled: 'ご注文は取り消されました',
  cancelledLookup: 'ご注文は取り消されました。くわしくはお店のスタッフにおたずねください',
  doneLookup: 'お渡し済みです',
  notFound: 'ご注文が見つかりません。URL をお確かめください。',
  backToMenu: 'のお品書きに戻る',
  payNote: 'お支払いは受け取り時です。',
  cancelLimitNote: '調理開始後はキャンセルできません。',
  cancelButton: '注文をキャンセルする',
  cancelConfirm: 'この注文をキャンセルしますか？（取り消しはできません）',
  cancelUnavailable: '調理を開始したためキャンセルできません。お困りの場合は店頭でお声がけください',
  cancelRace: 'ちょうど調理が始まったためキャンセルできませんでした',
  pickupBy: (time) => `${time}までにお受け取りください`,
  holdNote: (minutes) => `呼び出しから${minutes}分以内にお受け取りください。`,
  headingUnclaimed: 'ご注文の取り置きを終了しました',
  unclaimedMessage: '受け取り期限を過ぎたため、ご注文の取り置きを終了しました。店頭でお声がけください',
  logUnclaimed: '受け取り期限を過ぎたため、取り置きを終了しました',

  boardTab: '注文帳',
  boardCommand: '注文を見守っています',
  columns: [
    { status: 'waiting', num: '壱', title: '受付' },
    { status: 'cooking', num: '弐', title: '調理中' },
    { status: 'ready', num: '参', title: 'お渡し待ち' },
  ],
  advance: { waiting: '調理をはじめる', cooking: 'できあがり', ready: 'お渡し済み' },
  nextStatus: { waiting: 'cooking', cooking: 'ready', ready: 'done' },
  doneLog: 'お渡し済み',
  finishTitle: 'のお渡し',
  finishButton: '受け取って、お渡し済みにする',
  unpaidNotice: 'まだお代金を受け取っていない注文です。',
  cancelNotice: '取り消した注文は元に戻せません（店長の管理画面からは直せます）。',
  cancelPaidNotice: ' 支払い済みの注文です。返金を忘れずに。',
  cancelPlaceholder: '受け取りに来ない、など',
  posSoon: 'すぐにお作りします',

  displayCommand: 'できあがりをお知らせしています',
  allDisplayCommand: '全店のできあがりをお知らせしています',
  readyLabel: 'お渡しできます',
  readyNote: '番号をお店でお見せください',
  preparingLabel: '調理中',
  displayCounts: (ready, preparing) => `お渡し ${ready} ／ 調理中 ${preparing}`,

  descriptionHint: 'お品書きの横に縦書きで出ます。短めに（例: ひとつずつ、心をこめてお作りします）。',
  emailOption: 'お客様にメール（注文の控え・できあがりのお知らせ）を送る',
  timeCooking: '調理',
  timeReady: 'できあがり',
  timeDone: 'お渡し',
  correctionHint: '状態を戻すこともできます（例: 間違えてお渡し済みにした注文を、お渡し待ちに戻す）。',
  waitPanelTitle: '待ち時間（注文 → できあがり）',
  unclaimedLabel: '受け取りなし',
  unclaimedNote: '（営業日が終わってもお渡し待ちのまま）',
}

const nonFood: Wording = {
  usesCooking: false,
  status: { waiting: '待ち', ready: '呼び出し中', done: '完了', cancelled: '取り消し', unclaimed: '未受取' },

  menuTitle: 'メニュー',
  menuCommand: 'メニューを表示',
  menuEmpty: 'メニューを準備しています',
  menuLimitNote: (max) => `受付はおひとり様 ${max}点まで`,
  limitReached: (max) => `1回の受付は合計${max}点までです`,
  countUnit: '点',
  notOpen: 'このお店は、いま受付をしていません。',
  orderButton: '受付する',
  orderPausedButton: '受付を中止しています',
  confirmTitle: '受付内容の確認',
  confirmSubmit: '受付を確定する',
  totalUnpaid: '合計（ご来店時にお支払い）',
  noteHint: 'ご要望などがあれば書いてください（200文字まで）。ご希望はご案内のときにだけ使い、学園祭の終了から30日後に消去します。',
  emailHint:
    '入力すると、整理番号の控えと、順番のお知らせを送ります。お名前・メールアドレスはこの目的にだけ使い、学園祭の終了から30日後に消去します。',

  steps: ['受付', 'お呼び出し', '完了'],
  stepIndex: { waiting: 0, cooking: 0, ready: 1, done: 2, cancelled: -1, unclaimed: -1 },
  waitingText: {
    waiting: '順番をお待ちください',
    ready: '受付までお越しください',
  },
  logCreated: '受付が完了しました',
  logCooking: '準備をはじめました',
  logReady: '順番になりました',
  logDone: 'ご利用ありがとうございました',
  logCancelled: '受付を取り消しました',
  headingReceived: '受付が完了しました',
  soon: 'まもなくお呼びします',
  headingReady: '順番になりました',
  readyMessage: '受付でこの番号をお見せください',
  headingDone: 'ご利用ありがとうございました',
  headingCancelled: '受付は取り消されました',
  cancelledLookup: '受付は取り消されました。くわしくはお店のスタッフにおたずねください',
  doneLookup: '完了しています',
  notFound: '受付が見つかりません。URL をお確かめください。',
  backToMenu: 'のメニューに戻る',
  payNote: 'お支払いはご来店時です。',
  cancelLimitNote: 'お呼び出しの後はキャンセルできません。',
  cancelButton: '受付をキャンセルする',
  cancelConfirm: 'この受付をキャンセルしますか？（取り消しはできません）',
  cancelUnavailable: 'お呼び出しが始まったためキャンセルできません。お困りの場合は受付でお声がけください',
  cancelRace: 'ちょうどお呼び出しが始まったためキャンセルできませんでした',
  pickupBy: (time) => `${time}までに受付へお越しください`,
  holdNote: (minutes) => `お呼び出しから${minutes}分以内に受付へお越しください。`,
  headingUnclaimed: '受付を終了しました',
  unclaimedMessage: 'お越しの期限を過ぎたため、受付を終了しました。受付でお声がけください',
  logUnclaimed: 'お越しの期限を過ぎたため、受付を終了しました',

  boardTab: '受付・進行一覧',
  boardCommand: '受付を見守っています',
  columns: [
    { status: 'waiting', num: '壱', title: '待ち' },
    { status: 'ready', num: '弐', title: '呼び出し中' },
  ],
  // 調理中は使わない（種類を変える前の注文が残っていても、呼び出しへ進められるようにしておく）
  advance: { waiting: '呼び出す', cooking: '呼び出す', ready: '完了' },
  nextStatus: { waiting: 'ready', cooking: 'ready', ready: 'done' },
  doneLog: '完了',
  finishTitle: 'の完了',
  finishButton: '受け取って、完了にする',
  unpaidNotice: 'まだお代金を受け取っていない受付です。',
  cancelNotice: '取り消した受付は元に戻せません（店長の管理画面からは直せます）。',
  cancelPaidNotice: ' 支払い済みの受付です。返金を忘れずに。',
  cancelPlaceholder: '来られなかった、など',
  posSoon: 'まもなくお呼びします',

  displayCommand: 'お呼び出し中の番号をお知らせしています',
  allDisplayCommand: '全店のお呼び出しをお知らせしています',
  readyLabel: 'お呼び出し中',
  readyNote: '番号を受付でお見せください',
  preparingLabel: '待ち',
  displayCounts: (ready, preparing) => `呼び出し中 ${ready} ／ 待ち ${preparing}組`,

  descriptionHint: 'メニューの横に縦書きで出ます。短めに（例: 毎回10名さまずつご案内します）。',
  emailOption: 'お客様にメール（受付の控え・順番のお知らせ）を送る',
  timeCooking: '準備',
  timeReady: '呼び出し',
  timeDone: '完了',
  correctionHint: '状態を戻すこともできます（例: 間違えて完了にした受付を、呼び出し中に戻す）。',
  waitPanelTitle: '待ち時間（受付 → 呼び出し）',
  unclaimedLabel: '来場なし',
  unclaimedNote: '（営業日が終わっても呼び出し中のまま）',
}

/** 店舗の種類の表示名。 */
export const businessTypeLabels: Record<BusinessType, string> = { food: '飲食', non_food: '飲食以外' }

/** 店舗の種類に合った画面の言葉を返す。種類が分からないとき（読み込み中など）は飲食の言葉。 */
export function wording(type: BusinessType | undefined): Wording {
  return type === 'non_food' ? nonFood : food
}

/** 状態ごとの案内（注文状況ページと同じ言い回し。店舗の種類で言葉を変える）。 */
export function orderStatusText(s: Pick<CustomerOrder, 'status' | 'shop' | 'waiting_ahead' | 'estimated_wait_minutes'>): string {
  const w = wording(s.shop.business_type)
  switch (s.status) {
    case 'waiting':
    case 'cooking':
      return s.waiting_ahead > 0
        ? `前に${s.waiting_ahead}組お待ちです${s.estimated_wait_minutes != null ? `（あと約${s.estimated_wait_minutes}分）` : ''}`
        : w.soon
    case 'ready':
      return `${w.headingReady}。${w.readyMessage}`
    case 'done':
      return w.doneLookup
    case 'cancelled':
      return w.cancelledLookup
    case 'unclaimed':
      return w.unclaimedMessage
  }
}
