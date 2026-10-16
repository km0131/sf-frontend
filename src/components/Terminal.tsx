import type { CSSProperties, ReactNode } from 'react'

type LineProps = {
  /** 「＞ 」に続くコマンド（日本語） */
  command: string
  /** 右側の補足（待ち時間・件数など） */
  aside?: ReactNode
}

/** ターミナル1行：紫苑の罫線2本の間に、等幅の文字を1行走らせる。1画面に1つまで。 */
export function TerminalLine({ command, aside }: LineProps) {
  const text = `＞ ${command}`
  return (
    <div className="term" role="status">
      <span className="term-cmd">
        {/* key でコマンドが変わるたびにタイピングをやり直す */}
        <span key={text} className="typing" style={{ '--chars': Array.from(text).length } as CSSProperties}>
          {text}
        </span>
        <span className="cursor" aria-hidden="true" />
      </span>
      {aside && <span className="term-aside">{aside}</span>}
    </div>
  )
}

export type LogEntry = { time: string; text: string }

type LogProps = {
  entries: LogEntry[]
  /** 最後の行（待機中の表示。濃紫苑＋カーソル） */
  waiting?: string
  title?: string
}

/** 記録：時刻付きのログを 0.8s 間隔で1行ずつ表示する。 */
export function Log({ entries, waiting, title = '記録' }: LogProps) {
  return (
    <section className="log" aria-label={title}>
      <h2 className="log-title">{title}</h2>
      {entries.map((e, i) => (
        <div key={`${e.time}-${e.text}`} className="log-row" style={{ animationDelay: `${i * 0.8}s` }}>
          <span className="log-time">{e.time}</span>
          <span>{e.text}</span>
        </div>
      ))}
      {waiting && (
        <div className="log-row log-wait" style={{ animationDelay: `${entries.length * 0.8}s` }}>
          <span>＞ {waiting}</span>
          <span className="cursor" aria-hidden="true" />
        </div>
      )}
    </section>
  )
}
