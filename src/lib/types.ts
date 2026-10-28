// API の型（バックエンドのレスポンスに合わせる）

export type ShopColor = 'yamabuki' | 'seiji' | 'sakuranezumi' | 'sabiasagi'

export type OrderStatus = 'waiting' | 'cooking' | 'ready' | 'done' | 'cancelled' | 'unclaimed'

/** 店舗の種類。food（飲食）は調理の段階を使い、non_food（飲食以外）は使わない（待ち → 呼び出し → 完了） */
export type BusinessType = 'food' | 'non_food'

export type Role = 'system_admin' | 'shop_manager' | 'staff'

export type PublicShop = {
  slug: string
  name: string
  description: string
  color: ShopColor
  business_type: BusinessType
  order_prefix: string
  waiting_count: number
  estimated_wait_minutes: number | null
}

export type PublicShopList = {
  /** paused は学園祭が中止中か（新しい注文は受け付けない）。pause_message はそのお知らせ */
  event: { id: number; name: string; paused: boolean; pause_message: string } | null
  items: PublicShop[]
}

export type Category = {
  id: number
  name: string
  sort_order: number
}

export type MenuOption = {
  id: number
  name: string
  price_delta: number
  is_available: boolean
  sort_order: number
}

export type OptionGroup = {
  id: number
  name: string
  required: boolean
  max_select: number
  /** まとめ値段（bundle_count 個選ぶと追加料金が合わせて bundle_price 円）。なければ null */
  bundle_count: number | null
  bundle_price: number | null
  sort_order: number
  options: MenuOption[]
}

export type MenuItem = {
  id: number
  category_id: number | null
  name: string
  description: string
  price: number
  image_url: string | null
  is_available: boolean
  is_archived: boolean
  sort_order: number
  option_groups: OptionGroup[]
  updated_at: string
  /** 限定商品（営業日ごとの限定数の範囲で売る）か */
  is_limited: boolean
  /** 1注文あたりの購入上限（なければ null） */
  purchase_limit_per_order: number | null
  /** 今日の残り数（限定商品だけ。限定でなければ null） */
  remaining: number | null
  /** 今日の販売済み数（レジ・管理画面だけ） */
  sold?: number
  /** 今注文できるか（手動の売り切れでなく、限定商品なら残りが 1 以上） */
  orderable: boolean
}

/** 限定商品の在庫（SSE の stock イベント・在庫の修正の結果）。お客様向けには sold がなく in_stock がある */
export type StockLevel = {
  menu_item_id: number
  business_date: string
  remaining: number
  sold?: number
  in_stock?: boolean
}

/** 在庫切れで受け付けなかった商品（409 out_of_stock の details.items） */
export type Shortage = {
  menu_item_id: number
  name: string
  requested: number
  remaining: number
}

export type DiscountKind = 'amount' | 'percent' | 'fixed_price'
export type DiscountScope = 'item' | 'order'

export type DiscountPreset = {
  id: number
  name: string
  kind: DiscountKind
  value: number
  scope: DiscountScope
  active: boolean
}

/** レジで選べる値引き（GET /api/staff/discounts）。free_limit は自由入力の上限額（0 なら使えない、null なら上限なし＝店長） */
export type StaffDiscounts = {
  items: DiscountPreset[]
  free_limit: number | null
  allow_zero_price: boolean
}

export type PublicMenu = {
  shop: {
    slug: string
    name: string
    description: string
    color: ShopColor
    business_type: BusinessType
    /** 呼び出し後の取り置き時間（分） */
    pickup_hold_minutes: number
    /** 開催回の終了から、お名前・メールアドレス・ご希望を消すまでの日数（バックエンドの PII_RETENTION_DAYS） */
    pii_retention_days: number
    /** Web 注文1回あたりの合計数量の上限（実際に使われる値） */
    web_order_max_quantity: number
    order_prefix: string
    event_name: string
    waiting_count: number
    estimated_wait_minutes: number | null
    paused: boolean
    pause_message: string
    /** 限定商品で「残りわずか」と出す残り数（以下） */
    low_stock_threshold: number
  }
  categories: Category[]
  items: MenuItem[]
}

export type OptionSnapshot = {
  group: string
  name: string
  price_delta: number
}

export type OrderItem = {
  id: number
  menu_item_id: number | null
  name: string
  unit_price: number
  quantity: number
  options: OptionSnapshot[]
  subtotal: number
  /** この商品へのご希望（例: ネギ抜き） */
  note: string | null
  /** この明細の値引き額（数量分の合計）。値引き後は subtotal - discount_amount */
  discount_amount: number
  discount_preset_id: number | null
  /** プリセットの名前（自由入力なら null） */
  discount_name: string | null
  /** 自由入力の理由（お客様向けには出ない） */
  discount_reason?: string | null
  discounted_by?: 'staff' | 'manager' | null
  discounted_at?: string | null
}

/** 注文全体の値引き */
export type OrderDiscount = {
  amount: number
  preset_id: number | null
  name: string | null
  reason?: string | null
  by?: 'staff' | 'manager'
  at: string
}

export type Order = {
  id: string
  order_no: string
  channel: 'web' | 'pos'
  status: OrderStatus
  customer_name: string | null
  /** お客様・レジで入力したご希望（例: 〇〇抜き） */
  note: string | null
  /** 支払額（値引き後） */
  total: number
  /** 定価の合計 */
  list_total: number
  /** 値引きの合計（明細＋注文全体） */
  discount_total: number
  order_discount: OrderDiscount | null
  paid: boolean
  cancel_reason: string | null
  created_at: string
  paid_at: string | null
  cooking_at: string | null
  ready_at: string | null
  done_at: string | null
  cancelled_at: string | null
  /** 未受取にした日時 */
  unclaimed_at: string | null
  /** 受け取りの期限（呼び出し + 店舗の取り置き時間）。お渡し可能のときだけ */
  pickup_deadline: string | null
  items: OrderItem[]
}

export type CustomerOrder = Order & {
  shop: { slug: string; name: string; color: ShopColor; business_type: BusinessType }
  waiting_ahead: number
  estimated_wait_minutes: number | null
  /** お客様が自分でキャンセルできるか（調理前・未払いの Web 注文だけ） */
  cancellable: boolean
  /** 「できあがりをメールで受け取る」欄。店舗がメールを使わない・終わった注文では null。email は伏せ字（例: t***@example.com） */
  email_notify: { email: string | null; retention_days: number } | null
}

/** レジの注文を、お客様のスマホに登録してもらうための QR（注文状況ページのトークン）と確認コード（4桁） */
export type OrderClaim = {
  token: string
  code: string
}

export type ManagerOrder = Order & {
  email: string | null
  /** その注文の開催回 */
  event_id: number
}

/** 店舗が出店した開催回（GET /api/manage/events。新しい順） */
export type ShopEvent = {
  id: number
  name: string
  starts_on: string
  ends_on: string
  is_current: boolean
  /** その開催回での整理番号の頭文字 */
  order_prefix: string
}

export type ShopInfo = {
  id: number
  slug: string
  name: string
  color: ShopColor
}

export type LoginResponse = {
  token: string
  expires_at: string
  role: Role
  user?: { id: number; email: string; display_name: string }
  shop?: ShopInfo
}

export type StaffShop = ShopInfo & {
  business_type: BusinessType
  paused: boolean
  pause_message: string
  order_prefix: string
  event_name: string
  low_stock_threshold: number
  /** スタッフが1回に増減できる限定数 */
  staff_stock_adjust_limit: number
}

export type DisplaySnapshot = {
  shop: string
  color: ShopColor
  business_type: BusinessType
  preparing: string[]
  ready: string[]
}

export type List<T> = { items: T[] }

/** 全店舗の大画面（GET /api/display）。店ごとの番号一覧で、頭文字の順。 */
export type AllDisplaySnapshot = {
  shops: {
    slug: string
    name: string
    color: ShopColor
    business_type: BusinessType
    order_prefix: string
    preparing: string[]
    ready: string[]
  }[]
}
