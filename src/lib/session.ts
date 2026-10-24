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

export type RememberedOrder = {
  token: string
  order_no: string
  shop: string
  created_at: string
  /** 終わった時刻（お渡し済み・取り消し・未受取になった時刻。サーバーの done_at・cancelled_at・unclaimed_at）。
   *  分かったときに記録し、ここから3分で控えから消す */
  finished_at?: string
}

/** 控えに残す注文の上限 */
const MAX_ORDERS = 10
/** 終わって（お渡し済み・取り消し・未受取）から控えに残しておく時間（直後の確認用） */
export const FINISHED_KEEP_MS = 3 * 60 * 1000

/** 終わってから3分たったか。 */
export function finishedExpired(finishedAt: string | null | undefined, now = Date.now()): boolean {
  return !!finishedAt && Date.parse(finishedAt) + FINISHED_KEEP_MS <= now
}

function readOrders(): RememberedOrder[] {
  try {
    const list = JSON.parse(localStorage.getItem(ordersKey) ?? '[]')
    return Array.isArray(list) ? (list as RememberedOrder[]) : []
  } catch {
    return []
  }
}

function writeOrders(list: RememberedOrder[]) {
  try {
    localStorage.setItem(ordersKey, JSON.stringify(list))
  } catch {
    // 保存できなくても注文自体は完了している
  }
}

/** 上限を超えたら、終わった注文の古いものから外し、それでも多ければ古いものから外す（受付中の注文はできるだけ残す）。 */
function trim(list: RememberedOrder[]): RememberedOrder[] {
  const kept = [...list]
  while (kept.length > MAX_ORDERS) {
    const finishedIdx = kept.findLastIndex((o) => o.finished_at)
    kept.splice(finishedIdx >= 0 ? finishedIdx : kept.length - 1, 1)
  }
  return kept
}

/** お客様が注文した控え（注文状況ページに戻れるように）。今日の注文を新しい順に最大10件。
 *  終わって（お渡し済み・取り消し・未受取）3分たった注文は、読むときに控えから消す（画面を開き直したときも）。 */
export const myOrders = {
  list(now = Date.now()): RememberedOrder[] {
    const all = readOrders()
    const today = new Date(now).toDateString()
    const kept = all.filter((o) => new Date(o.created_at).toDateString() === today && !finishedExpired(o.finished_at, now))
    if (kept.length !== all.length) writeOrders(kept)
    return kept
  },
  has(token: string): boolean {
    return myOrders.list().some((o) => o.token === token)
  },
  add(o: RememberedOrder) {
    writeOrders(trim([o, ...myOrders.list().filter((x) => x.token !== o.token)]))
  },
  /** 終わった時刻を記録する（すでに3分たっていれば、その場で控えから消す）。
   *  null なら記録を消す（店長が状態を直して、受付中などに戻したとき）。 */
  markFinished(token: string, finishedAt: string | null) {
    const list = myOrders.list()
    const target = list.find((o) => o.token === token)
    if (!target || (target.finished_at ?? null) === finishedAt) return
    if (finishedAt && finishedExpired(finishedAt)) {
      writeOrders(list.filter((o) => o.token !== token))
      return
    }
    writeOrders(list.map((o) => (o.token === token ? { ...o, finished_at: finishedAt ?? undefined } : o)))
  },
}
