import { Bar, BarChart as RBarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Props<T> = {
  data: T[]
  /** 横軸の値 */
  x: (d: T) => string
  /** 棒の値 */
  y: (d: T) => number
  /** ツールチップ・表に出す値の書き方 */
  format: (v: number) => string
  /** ツールチップの見出し（既定は横軸の値） */
  title?: (d: T) => string
  /** 何の値か（表の見出しとツールチップ） */
  label: string
  height?: number
}

const axisTick = { fill: 'var(--c-ink-sub)', fontSize: 11, fontFamily: 'var(--f-mono)' }

/** 1系列の棒グラフ（濃紫苑）。凡例は不要（見出しが何の値かを示す）。数値は下の表でも読める。 */
export function BarChart<T>({ data, x, y, format, title, label, height = 220 }: Props<T>) {
  const rows = data.map((d) => ({ key: x(d), value: y(d), title: title ? title(d) : x(d) }))
  const ticks = niceTicks(Math.max(0, ...rows.map((r) => r.value)))
  return (
    <figure style={{ margin: 0 }}>
      {/* 高さには横軸の文字の分も含める */}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <RBarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--c-line)" />
            <XAxis dataKey="key" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--c-shion)' }} interval="preserveStartEnd" />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={compact}
              domain={[0, ticks.at(-1) ?? 1]}
              ticks={ticks}
            />
            <Tooltip
              cursor={{ fill: 'rgba(134,123,169,.10)' }}
              content={({ active, payload }) => {
                const p = active && payload?.[0]?.payload
                if (!p) return null
                return (
                  <div className="card" style={{ padding: '8px 12px', lineHeight: 1.6 }}>
                    <div className="mono sub" style={{ fontSize: 11 }}>
                      {p.title}
                    </div>
                    <div className="mono" style={{ fontSize: 14 }}>
                      {label} {format(p.value)}
                    </div>
                  </div>
                )
              }}
            />
            {/* 棒は24pxまで。角は丸めない（デザイン仕様：角丸なし） */}
            <Bar dataKey="value" fill="var(--c-shion-deep)" maxBarSize={24} isAnimationActive={false} />
          </RBarChart>
        </ResponsiveContainer>
      </div>
      <details style={{ marginTop: 8 }}>
        <summary className="btn btn-text" style={{ display: 'inline-flex' }}>
          数値で見る
        </summary>
        <table className="table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th />
              <th className="num">{label}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="mono">{r.title}</td>
                <td className="num">{format(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

/** 0 から max を覆う、きりのよい目盛り（1・2・5 × 10^n 刻み、4〜5本）。 */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow
  const top = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v))
  return out
}

/** 軸の目盛り：1,000 以上は 1K のように縮める。 */
function compact(v: number): string {
  if (Math.abs(v) >= 1000) return `${Math.round(v / 100) / 10}K`
  return String(v)
}

/** 表の中の横棒（最大値に対する割合）。 */
export function InlineBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <span style={{ display: 'block', height: 6, background: 'var(--c-shion-soft)' }} aria-hidden="true">
      <span style={{ display: 'block', height: 6, width: `${pct}%`, background: 'var(--c-shion-deep)' }} />
    </span>
  )
}
