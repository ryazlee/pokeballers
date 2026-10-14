import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../AppHeader'
import Button from '../Button'
import CourtBoard from '../CourtBoard'
import PokemonPicker from '../PokemonPicker'
import RatingBars from '../RatingBars'
import SimView from '../SimView'
import { useLineup } from '../../hooks/useLineup'
import { simulateGame, lineupSeed } from '../../domain/sim'
import { buildDailyBoss, todayKey } from '../../domain/daily'
import type { RosterSlot, SimResult } from '../../domain/types'

type BuilderScreenProps = {
  mode: 'sandbox' | 'daily'
}

export default function BuilderScreen({ mode }: BuilderScreenProps) {
  const navigate = useNavigate()
  const storageKey =
    mode === 'daily' ? `pokeballers-daily-lineup` : 'pokeballers-sandbox-lineup'
  const { lineup, assign, clear, usedIds, bst, ratings, overCap, playable, cap } =
    useLineup(storageKey)

  const [selectedSlot, setSelectedSlot] = useState<RosterSlot | null>('PG')
  const [result, setResult] = useState<SimResult | null>(null)

  const daily = useMemo(() => {
    if (mode !== 'daily') return null
    const key = todayKey()
    return { key, ...buildDailyBoss(key) }
  }, [mode])

  function tipOff() {
    if (!playable) return
    const away =
      mode === 'daily' && daily
        ? daily.lineup
        : buildDailyBoss(`sandbox-${lineupSeed(lineup)}`).lineup

    const sim = simulateGame(lineup, away, {
      homeName: 'You',
      awayName: mode === 'daily' ? 'Daily Boss' : 'CPU',
      seed:
        mode === 'daily' && daily
          ? daily.seed ^ lineupSeed(lineup, daily.key)
          : (Date.now() >>> 0),
      awayDefenseMult: daily?.modifier.awayDefenseMult ?? 1,
    })
    setResult(sim)

    if (mode === 'daily' && daily) {
      try {
        localStorage.setItem(
          `pokeballers-daily-result-${daily.key}`,
          JSON.stringify({
            homeScore: sim.homeScore,
            awayScore: sim.awayScore,
            won: sim.homeWon,
            tied: sim.tied,
            offense: sim.homeRatings.offense,
            defense: sim.homeRatings.defense,
          }),
        )
      } catch {
        // ignore
      }
    }
  }

  if (result) {
    const shareText =
      mode === 'daily' && daily
        ? [
            `Pokeballers ${daily.key}`,
            `${result.homeScore}-${result.awayScore} ${result.tied ? 'T' : result.homeWon ? 'W' : 'L'}`,
            `OFF ${result.homeRatings.offense} DEF ${result.homeRatings.defense}`,
            `🏀${result.homeWon ? '🟩🟩🟩' : result.tied ? '🟨🟨⬜' : '🟥⬜⬜'}`,
            daily.modifier.label,
          ].join('\n')
        : undefined

    return (
      <div className="app-shell">
        <AppHeader
          title="Pokeballers"
          subtitle={mode === 'daily' ? 'Daily result' : 'Sandbox result'}
        />
        <main className="app-main">
          <div className="shell-inner">
            <SimView
              result={result}
              awayLabel={mode === 'daily' ? 'Daily Boss' : 'CPU'}
              shareText={shareText}
              onRematch={() => {
                setResult(null)
                tipOff()
              }}
              onBack={() => setResult(null)}
            />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <AppHeader
        title="Pokeballers"
        subtitle={
          mode === 'daily'
            ? daily
              ? `Daily · ${daily.modifier.label}`
              : 'Daily challenge'
            : 'Sandbox builder'
        }
        extra={
          <Button label="Home" to="/" variant="ghost" size="sm" />
        }
      />
      <main className="app-main">
        <div className="shell-inner builder">
          {mode === 'daily' && daily ? (
            <p className="notice">{daily.modifier.description}</p>
          ) : null}

          <RatingBars ratings={ratings} bst={bst} cap={cap} overCap={overCap} />

          <CourtBoard
            lineup={lineup}
            ratings={ratings}
            selectedSlot={selectedSlot}
            onSelectSlot={setSelectedSlot}
          />

          <PokemonPicker
            slot={selectedSlot}
            usedIds={usedIds}
            onPick={(id) => {
              if (selectedSlot) assign(selectedSlot, id)
            }}
            onClear={() => {
              if (selectedSlot) assign(selectedSlot, null)
            }}
            onClose={() => setSelectedSlot(null)}
          />

          <div className="builder-footer">
            <Button
              label="Clear roster"
              variant="ghost"
              onClick={() => {
                clear()
                setSelectedSlot('PG')
              }}
            />
            <Button
              label={playable ? 'Tip off' : overCap ? 'Over BST cap' : 'Fill starters'}
              disabled={!playable}
              onClick={tipOff}
            />
          </div>

          {mode === 'sandbox' ? (
            <button
              type="button"
              className="linkish"
              onClick={() => {
                clear()
                navigate('/daily')
              }}
            >
              Or try the daily challenge
            </button>
          ) : (
            <button type="button" className="linkish" onClick={() => navigate('/build')}>
              Open sandbox builder
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
