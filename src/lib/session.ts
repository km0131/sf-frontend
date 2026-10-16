import type { LoginResponse } from './types'

// ログイン情報はブラウザに保存する（タブを閉じても営業中はログインしたままにするため）。
// 保存できない環境（プライベートブラウズなど）でも動くよう、失敗は無視する。

const userKey = 'sf.user'
const staffKey = (slug: string) => `sf.staff.${slug}`
const ordersKey = 'sf.orders'

export type Session = LoginResponse

function read(key: string): Session | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    if (new Date(s.expires_at).getTime() <= Date.now()) {
      localStorage.removeItem(key)
      return null
    }
    return s
  } catch {
    return null
  }
}

function write(key: string, s: Session | null) {
  try {
    if (s) localStorage.setItem(key, JSON.stringify(s))
    else localStorage.removeItem(key)
  } catch {
    // 保存できなくても、この画面を開いている間は使える
  }
}

export const userSession = {
  get: () => read(userKey),
  set: (s: Session | null) => write(userKey, s),
}

export const staffSession = {
  get: (slug: string) => read(staffKey(slug)),
  set: (slug: string, s: Session | null) => write(staffKey(slug), s),
}

export type RememberedOrder = { token: string; order_no: string; shop: string; created_at: string }

/** お客様が注文した控え（注文状況ページに戻れるように）。新しい順に最大10件。 */
export const myOrders = {
  list(): RememberedOrder[] {
    try {
      const list = JSON.parse(localStorage.getItem(ordersKey) ?? '[]') as RememberedOrder[]
      const today = new Date().toDateString()
      return list.filter((o) => new Date(o.created_at).toDateString() === today)
    } catch {
      return []
    }
  },
  add(o: RememberedOrder) {
    try {
      const list = [o, ...myOrders.list().filter((x) => x.token !== o.token)].slice(0, 10)
      localStorage.setItem(ordersKey, JSON.stringify(list))
    } catch {
      // 保存できなくても注文自体は完了している
    }
  },
}
