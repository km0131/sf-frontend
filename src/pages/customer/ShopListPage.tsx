import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Header } from '../../components/Header'
import { TerminalLine } from '../../components/Terminal'
import { VerticalLabel } from '../../components/VerticalLabel'
import { apiFetch, errorMessage } from '../../lib/api'
import { storeStyle } from '../../lib/colors'
import { waitLabel } from '../../lib/format'
import { myOrders } from '../../lib/session'
import type { PublicShopList } from '../../lib/types'
import { PausedNotice } from '../../components/PausedNotice'
import { OrderNumberLookup } from './OrderNumberLookup'

/** お客様: 出店している店の一覧と、それぞれの待ち状況。 */
export function ShopListPage() {
  const { data, error, isLoading } = useQuery({
    queryKey: ['shops'],
    queryFn: () => apiFetch<PublicShopList>('/api/shops'),
    refetchInterval: 15000,
  })
  const remembered = myOrders.list()
  const title = data?.event?.name ?? '学園祭'

  return (
    <div className="page-sp">
      <Header name={title} seal="祭" />
      <TerminalLine command="お店を表示" aside={data ? `${data.items.length}店` : undefined} />
      {data?.event?.paused && <PausedNotice message={data.event.pause_message} />}
      <OrderNumberLookup />

      {remembered.length > 0 && (
        <section className="section fade-in">
          <VerticalLabel text="受付中の番号">
            {remembered.map((o) => (
              <Link key={o.token} to={`/o/${o.token}`} className="shop-row" style={{ gridTemplateColumns: '1fr auto' }}>
                <span className="shop-row-name">{o.shop}</span>
                <span className="mono">{o.order_no}</span>
              </Link>
            ))}
          </VerticalLabel>
        </section>
      )}

      <section className="section fade-in">
        <VerticalLabel text="お店" note="お店を選んでください">
          {isLoading && <p className="empty">読み込んでいます…</p>}
          {error && <p className="error-text">{errorMessage(error)}</p>}
          {data && data.items.length === 0 && <p className="empty">いま受付をしているお店はありません</p>}
          {data?.items.map((s) => (
            <Link key={s.slug} to={`/s/${s.slug}`} className="shop-row" style={storeStyle(s.color)}>
              <span className="dot dot-lg" aria-hidden="true" />
              <span>
                <span className="shop-row-name">{s.name}</span>
                {s.description && (
                  <span className="sub" style={{ display: 'block', fontSize: 12, lineHeight: 1.7 }}>
                    {s.description}
                  </span>
                )}
              </span>
              <span className="shop-row-wait">
                待ち {s.waiting_count}組
                <br />
                {waitLabel(s.estimated_wait_minutes)}
              </span>
            </Link>
          ))}
        </VerticalLabel>
      </section>
    </div>
  )
}
