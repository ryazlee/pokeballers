import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'

type AppHeaderProps = {
  title: string
  subtitle?: ReactNode
  quiet?: boolean
  extra?: ReactNode
}

export default function AppHeader({ title, subtitle, quiet, extra }: AppHeaderProps) {
  return (
    <header className={`app-header${quiet ? ' app-header--quiet' : ''}`}>
      <div className="app-header-inner">
        <div className="brand-block">
          <div className="brand-row">
            <h1 className="brand">
              <Link to="/">
                <img
                  className="brand__mark"
                  src={`${import.meta.env.BASE_URL}favicon.png`}
                  alt=""
                  width={28}
                  height={28}
                />
                <span>{title}</span>
              </Link>
            </h1>
          </div>
          {subtitle ? <div className="subtitle">{subtitle}</div> : null}
        </div>
        <div className="header-actions">
          {extra}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
