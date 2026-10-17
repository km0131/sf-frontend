import { Cell, Pie, PieChart as RPieChart, ResponsiveContainer, Tooltip } from 'recharts'

/** 切れ目の色（カテゴリ用）。隣り合う色どうしが色覚の多様性でも見分けられるよう、この並び順で検証している。
 *  並び順を変えたり色を足したりしない。6つ目以降は「その他」にまとめる。 */
const SLICE_COLORS = ['#5B4BA8', '#D9622B', '#1E9A78', '#D99A00', '#D6698F']
/** 「その他」は目立たせない（どの色の隣に来ても見分けられる明るい灰色） */
const OTHER_COLOR = '#CEC6BB'

type Props<T> = {
  data: T[]
  /** 切れ目の名前（凡例・ツールチップ） */
  name: (d: T) => string
  /** 切れ目の値 */
  value: (d: T) => number
  /** 凡例・ツールチップに出す値の書き方 */
  format: (v: number) => string
  /** 何の値か（例: 売上） */
  label: string
  /** 円の直径（px） */
  size?: number
}

type Slice = { name: string; value: number; color: string; others?: number }

/** 内訳のドーナツ型の円グラフ。大きい順に5つまで色を付け、残りは「その他」にまとめる。
 *  凡例に名前・値・割合を並べるので、色だけに頼らずに読める。すべての数値は呼び出し側の表でも読める。 */
export function PieChart<T>({ data, name, value, format, label, size = 168 }: Props<T>) {
  const rows = data
    .map((d) => ({ name: name(d), value: value(d) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
  const total = rows.reduce((a, r) => a + r.value, 0)
  if (total === 0) return <p className="empty">まだありません</p>

  const slices: Slice[] = rows.slice(0, SLICE_COLORS.length).map((r, i) => ({ ...r, color: SLICE_COLORS[i] }))
  const rest = rows.slice(SLICE_COLORS.length)
  if (rest.length > 0) {
    slices.push({ name: 'その他', value: rest.reduce((a, r) => a + r.value, 0), color: OTHER_COLOR, others: rest.length })
  }
  const pct = (v: number) => `${Math.round((v / total) * 100)}%`

  return (
    <figure className="pie" aria-label={`${label}の内訳`}>
      <div className="pie-chart" style={{ width: size, height: size }}>
        <ResponsiveContainer>
          <RPieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--c-card)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                const p = active && (payload?.[0]?.payload as Slice | undefined)
                if (!p) return null
                return (
                  <div className="card" style={{ padding: '8px 12px', lineHeight: 1.6 }}>
                    <div className="sub" style={{ fontSize: 12 }}>
                      {p.name}
                      {p.others ? `（${p.others}件）` : ''}
                    </div>
                    <div className="mono" style={{ fontSize: 14 }}>
                      {label} {format(p.value)}（{pct(p.value)}）
                    </div>
                  </div>
                )
              }}
            />
          </RPieChart>
        </ResponsiveContainer>
        {/* 真ん中に合計 */}
        <div className="pie-total" aria-hidden="true">
          <span className="pie-total-label">合計</span>
          <span className="mono">{format(total)}</span>
        </div>
      </div>
      <ul className="pie-legend">
        {slices.map((s) => (
          <li key={s.name}>
            <span className="pie-swatch" style={{ background: s.color }} aria-hidden="true" />
            <span className="pie-name">
              {s.name}
              {s.others ? <span className="sub">（{s.others}件）</span> : null}
            </span>
            <span className="mono pie-value">{format(s.value)}</span>
            <span className="mono pie-pct">{pct(s.value)}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
