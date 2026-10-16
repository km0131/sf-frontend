import { Link } from 'react-router'
import { Header } from '../components/Header'
import { TerminalLine } from '../components/Terminal'

export function NotFoundPage({ message = 'ページが見つかりません。' }: { message?: string }) {
  return (
    <div className="page-sp">
      <Header name="学園祭" seal="祭" />
      <TerminalLine command="ページを探しています" />
      <section className="section fade-in stack">
        <p>{message}</p>
        <Link to="/" className="btn btn-secondary">
          お店の一覧へ
        </Link>
      </section>
    </div>
  )
}
