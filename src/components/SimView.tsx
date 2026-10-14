import { useMemo, useState } from 'react'
import type { SimResult } from '../domain/types'
import Button from './Button'

type SimViewProps = {
  result: SimResult
  homeLabel?: string
  awayLabel?: string
  shareText?: string
  onRematch?: () => void
  onBack?: () => void
}

export default function SimView({
  result,
  homeLabel = 'You',
  awayLabel = 'CPU',
  shareText,
  onRematch,
  onBack,
}: SimViewProps) {
  const [copied, setCopied] = useState(false)
  const headline = result.tied
    ? 'Tie game'
    : result.homeWon
      ? `${homeLabel} win`
      : `${awayLabel} win`

  const recent = useMemo(() => result.plays.slice(-24), [result.plays])

  async function copyShare() {
    if (!shareText) return
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="sim-view">
      <section className="scoreboard surface-card">
        <p className="section-label">{headline}</p>
        <div className="scoreboard__row">
          <div>
            <span className="scoreboard__name">{homeLabel}</span>
            <span className="scoreboard__pts">{result.homeScore}</span>
          </div>
          <span className="scoreboard__dash">–</span>
          <div>
            <span className="scoreboard__name">{awayLabel}</span>
            <span className="scoreboard__pts">{result.awayScore}</span>
          </div>
        </div>
        <div className="scoreboard__grades">
          <span>
            Off {result.homeRatings.offense} / Def {result.homeRatings.defense}
          </span>
          <span>
            Opp Off {result.awayRatings.offense} / Def {result.awayRatings.defense}
          </span>
        </div>
      </section>

      <section className="pbp surface-card">
        <p className="section-label">Late play-by-play</p>
        <ul className="pbp__list">
          {recent.map((play, i) => (
            <li key={`${play.quarter}-${i}-${play.text.slice(0, 24)}`}>
              <span className="pbp__score">
                {play.scoreHome}–{play.scoreAway}
              </span>
              <span>{play.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="sim-actions">
        {shareText ? (
          <Button
            label={copied ? 'Copied' : 'Copy result'}
            variant="secondary"
            onClick={() => void copyShare()}
          />
        ) : null}
        {onRematch ? <Button label="Tip off again" onClick={onRematch} /> : null}
        {onBack ? <Button label="Back to builder" variant="ghost" onClick={onBack} /> : null}
      </div>

      {shareText ? (
        <pre className="share-card surface-card">{shareText}</pre>
      ) : null}
    </div>
  )
}
