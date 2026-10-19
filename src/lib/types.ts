// API の型（バックエンドのレスポンスに合わせる）

export type ShopColor = 'yamabuki' | 'seiji' | 'sakuranezumi' | 'sabiasagi'

export type OrderStatus = 'waiting' | 'cooking' | 'ready' | 'done' | 'cancelled'

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
}

export type PublicMenu = {
  shop: {
    slug: string
    name: string
    description: string
    color: ShopColor
    business_type: BusinessType
    order_prefix: string
    event_name: string
    waiting_count: number
    estimated_wait_minutes: number | null
    paused: boolean
    pause_message: string
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
  menu_item_id: number | null
  name: string
  unit_price: number
  quantity: number
  options: OptionSnapshot[]
  subtotal: number
}

export type Order = {
  id: string
  order_no: string
  channel: 'web' | 'pos'
  status: OrderStatus
  customer_name: string | null
  /** お客様・レジで入力したご希望（例: 〇〇抜き） */
  note: string | null
  total: number
  paid: boolean
  cancel_reason: string | null
  created_at: string
  paid_at: string | null
  cooking_at: string | null
  ready_at: string | null
  done_at: string | null
  cancelled_at: string | null
  items: OrderItem[]
}

export type CustomerOrder = Order & {
  shop: { slug: string; name: string; color: ShopColor; business_type: BusinessType }
  waiting_ahead: number
  estimated_wait_minutes: number | null
}

export type ManagerOrder = Order & {
  email: string | null
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
}

export type DisplaySnapshot = {
  shop: string
  color: ShopColor
  business_type: BusinessType
  preparing: string[]
  ready: string[]
}

export type List<T> = { items: T[] }

/** 番号での状態確認（GET /api/order-status）。注文の中身やお名前は含まない。 */
export type NumberStatus = {
  order_no: string
  status: OrderStatus
  shop: { slug: string; name: string; color: ShopColor; business_type: BusinessType }
  waiting_ahead: number
  estimated_wait_minutes: number | null
}

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
