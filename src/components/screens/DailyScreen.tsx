import { useMemo, useState } from 'react'
import { Check, Copy, Pencil } from 'lucide-react'
import AppHeader from '../AppHeader'
import Button from '../Button'
import CourtBoard from '../CourtBoard'
import PokemonHoverCard from '../PokemonHoverCard'
import PokemonPicker from '../PokemonPicker'
import RatingBars from '../RatingBars'
import ShareImageCard from '../ShareImageCard'
import { useLineup } from '../../hooks/useLineup'
import {
  aggregateHomeBox,
  buildDailyChallenge,
  formatGauntletShare,
  formatSlotLabel,
  runGauntlet,
  todayKey,
  type GauntletResult,
} from '../../domain/daily'
import { stadiumSummary } from '../../domain/terrains'
import { stadiumHurtHint } from '../../domain/typeChart'
import { getPokemon } from '../../domain/pokemon'
import { BENCH_SLOTS, STARTER_SLOTS, type RosterSlot } from '../../domain/types'

export default function DailyScreen() {
  const dateKey = todayKey()
  const challenge = useMemo(() => buildDailyChallenge(dateKey), [dateKey])
  const storageKey = `pokeballers-daily-lineup-${dateKey}`
  const {
    lineup,
    assign,
    clear,
    slotByPokemonId,
    bst,
    ratings,
    overCap,
    playable,
    cap,
  } = useLineup(storageKey)

  const [pickingSlot, setPickingSlot] = useState<RosterSlot | null>(null)
  const [gauntlet, setGauntlet] = useState<GauntletResult | null>(() => {
    try {
      const raw = localStorage.getItem(`pokeballers-daily-gauntlet-${dateKey}`)
      return raw ? (JSON.parse(raw) as GauntletResult) : null
    } catch {
      return null
    }
  })
  const [copied, setCopied] = useState(false)
  const [shareShowTeam, setShareShowTeam] = useState(false)

  const boostTypes = useMemo(
    () => challenge.terrains.map((t) => t.type),
    [challenge.terrains],
  )

  const filledStarters = (['PG', 'SG', 'SF', 'PF', 'C'] as const).filter(
    (s) => lineup[s],
  ).length

  function runTour() {
    if (!playable) return
    const result = runGauntlet(dateKey, lineup, challenge)
    setGauntlet(result)
    try {
      localStorage.setItem(
        `pokeballers-daily-gauntlet-${dateKey}`,
        JSON.stringify(result),
      )
    } catch {
      // ignore
    }
  }

  async function copyShare() {
    if (!gauntlet) return
    try {
      await navigator.clipboard.writeText(
        formatGauntletShare(gauntlet, {
          showTeam: shareShowTeam,
          lineup,
        }),
      )
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const playLabel = playable
    ? 'Play 7 stadiums'
    : overCap
      ? 'Over BST cap'
      : `Fill starters (${filledStarters}/5)`

  if (gauntlet) {
    const share = formatGauntletShare(gauntlet, {
      showTeam: shareShowTeam,
      lineup,
    })
    const slateBox = aggregateHomeBox(gauntlet.games, lineup)
    return (
      <div className="app-shell">
        <AppHeader
          title="Pokeballers"
          subtitle={`Results · ${dateKey}`}
          extra={<Button label="Home" to="/" variant="ghost" size="sm" />}
        />
        <main className="app-main">
          <div className="shell-inner shell-inner--wide results-layout">
            <aside className="results-layout__aside">
              <section className="scoreboard">
                <div className="scoreboard__head">
                  <p className="eyebrow">Daily score</p>
                  <button
                    type="button"
                    className="scoreboard__edit"
                    onClick={() => setGauntlet(null)}
                  >
                    <Pencil size={14} strokeWidth={2.25} aria-hidden="true" />
                    Edit roster
                  </button>
                </div>
                <p className="scoreboard__big">{gauntlet.score}</p>
                <div className="scoreboard__meta-row">
                  <div>
                    <span className="scoreboard__name">Record</span>
                    <span className="scoreboard__value">
                      {gauntlet.wins}-{gauntlet.losses}
                      {gauntlet.ties ? `-${gauntlet.ties}` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="scoreboard__name">Point diff</span>
                    <span className="scoreboard__value">
                      {gauntlet.pointDiff >= 0 ? '+' : ''}
                      {gauntlet.pointDiff}
                    </span>
                  </div>
                </div>
                {gauntlet.slateMvp ? (
                  <p className="scoreboard__mvp">
                    <span className="scoreboard__mvp-label">Slate MVP</span>
                    <span className="scoreboard__mvp-name">
                      {gauntlet.slateMvp.name}
                    </span>
                    <span className="scoreboard__mvp-blurb">
                      {gauntlet.slateMvp.blurb}
                    </span>
                  </p>
                ) : null}
              </section>

              <section className="share-card">
                <div className="share-card__bar">
                  <button
                    type="button"
                    className={`share-card__team${shareShowTeam ? ' share-card__team--on' : ''}`}
                    role="switch"
                    aria-checked={shareShowTeam}
                    aria-label="Include team in share"
                    onClick={() => setShareShowTeam((v) => !v)}
                  >
                    <span className="share-card__team-label">Show team</span>
                    <span className="share-card__switch" aria-hidden="true">
                      <span className="share-card__switch-thumb" />
                    </span>
                  </button>
                  <div className="share-card__actions">
                    <button
                      type="button"
                      className={`share-card__copy${copied ? ' share-card__copy--done' : ''}`}
                      onClick={() => void copyShare()}
                    >
                      {copied ? (
                        <Check size={15} strokeWidth={2.25} aria-hidden="true" />
                      ) : (
                        <Copy size={15} strokeWidth={2} aria-hidden="true" />
                      )}
                      {copied ? 'Copied' : 'Copy text'}
                    </button>
                  </div>
                </div>
                <pre className="share-card__text">{share}</pre>
                <ShareImageCard
                  result={gauntlet}
                  lineup={lineup}
                  showTeam={shareShowTeam}
                />
              </section>

              {slateBox.length > 0 ? (
                <section className="slate-box">
                  <p className="section-label">Your slate stats</p>
                  <div className="slate-box__table-wrap">
                    <table className="slate-box__table">
                      <thead>
                        <tr>
                          <th scope="col">Pos</th>
                          <th scope="col">Player</th>
                          <th scope="col">PTS</th>
                          <th scope="col">REB</th>
                          <th scope="col">AST</th>
                          <th scope="col">BLK</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slateBox.map((row) => {
                          const p = getPokemon(row.pokemonId)
                          return (
                            <tr key={row.pokemonId}>
                              <td className="slate-box__pos">
                                {formatSlotLabel(row.slot)}
                              </td>
                              <td>
                                <span className="slate-box__player">
                                  {p ? (
                                    <img
                                      src={p.sprite}
                                      alt=""
                                      width={28}
                                      height={28}
                                    />
                                  ) : null}
                                  {row.name}
                                </span>
                              </td>
                              <td>{row.points}</td>
                              <td>{row.rebounds}</td>
                              <td>{row.assists}</td>
                              <td>{row.blocks}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
            </aside>

            <section className="gauntlet-list results-layout__main">
              <div className="panel-head">
                <p className="section-label">Game log</p>
                <p className="panel-head__hint">Open a game for stadium mods.</p>
              </div>
              <div className="gauntlet-accordion">
                {gauntlet.games.map((g, i) => (
                  <details key={g.stadium.id} className="game-summary">
                    <summary>
                      <span
                        className={`gauntlet-outcome gauntlet-outcome--${g.outcome.toLowerCase()}`}
                      >
                        {g.outcome}
                      </span>
                      <span className="game-summary__title">
                        <strong>
                          G{i + 1} · {g.stadium.name}
                        </strong>
                        <span className="game-summary__score">
                          {g.result.homeScore}–{g.result.awayScore}
                          <span className="gauntlet-margin">
                            {g.margin >= 0 ? ` +${g.margin}` : ` ${g.margin}`}
                          </span>
                        </span>
                      </span>
                    </summary>
                    <div className="game-summary__body">
                      {g.mvp ? (
                        <p className="game-summary__mvp">
                          <span className="game-summary__mvp-label">MVP</span>
                          <span
                            className={`play-team play-team--${g.mvp.side === 'home' ? 'you' : 'cpu'}`}
                          >
                            {g.mvp.side === 'home' ? 'You' : 'CPU'}
                          </span>
                          <span>
                            {g.mvp.name} · {g.mvp.blurb}
                          </span>
                        </p>
                      ) : null}
                      <p className="game-summary__mods">
                        {stadiumSummary(g.stadium)}
                        {stadiumHurtHint(g.stadium.type)}
                      </p>
                      <p className="game-summary__grades">
                        You Off {g.result.homeRatings.offense} / Def{' '}
                        {g.result.homeRatings.defense} · CPU Off{' '}
                        {g.result.awayRatings.offense} / Def{' '}
                        {g.result.awayRatings.defense}
                      </p>
                      <ul className="game-summary__plays">
                        {(g.highlights?.length
                          ? g.highlights
                          : ['No play-by-play saved — re-run for highlights.']
                        ).map((line) => (
                          <li key={line}>
                            <HighlightLine text={line} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <AppHeader
        title="Pokeballers"
        subtitle={`Daily · ${dateKey}`}
        extra={<Button label="Home" to="/" variant="ghost" size="sm" />}
      />
      <main className="app-main">
        <div className="shell-inner shell-inner--wide builder">
          <div className="builder-grid builder-grid--field-first">
            <aside className="builder-sidebar">
              <section className="daily-brief">
                <p className="eyebrow">Lineup builder</p>
                <h2 className="daily-brief__title">Build your lineup</h2>
                <p className="notice">
                  Cap {cap} BST · pool avg {challenge.playerPoolAvgBst}
                </p>
              </section>

              <RatingBars ratings={ratings} bst={bst} cap={cap} overCap={overCap} />

              <section className="cpu-lineup">
                <p className="section-label">CPU lineup</p>
                <div className="cpu-lineup__scroller">
                  <ul className="cpu-lineup__list">
                    {[...STARTER_SLOTS, ...BENCH_SLOTS].map((slot) => {
                      const entry = challenge.cpuLineup[slot]
                      const p = entry ? getPokemon(entry.pokemonId) : null
                      const label =
                        slot === 'BENCH1' ? 'B1' : slot === 'BENCH2' ? 'B2' : slot
                      return (
                        <li key={slot}>
                          <span className="cpu-lineup__slot">{label}</span>
                          {p ? (
                            <PokemonHoverCard pokemon={p} className="cpu-lineup__hover">
                              <img src={p.sprite} alt="" width={28} height={28} />
                              <span className="cpu-lineup__name">{p.name}</span>
                            </PokemonHoverCard>
                          ) : (
                            <span className="cpu-lineup__empty">—</span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </section>

              <details className="stadium-fold">
                <summary>
                  <span className="section-label">Stadium slate</span>
                  <span className="stadium-fold__count">7 courts</span>
                </summary>
                <ul className="terrain-slate__list terrain-slate__list--compact">
                  {challenge.terrains.map((t, i) => (
                    <li key={t.id} className="terrain-slate__item">
                      <span className={`type-dot type-dot--${t.type}`} aria-hidden="true" />
                      <span className="terrain-chip">
                        {i + 1}. {t.name}
                      </span>
                      <span className="terrain-chip__boost">
                        {stadiumSummary(t)}
                        {stadiumHurtHint(t.type)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>

              <div className="builder-footer builder-footer--desktop">
                <Button
                  label="Clear"
                  variant="ghost"
                  onClick={() => {
                    clear()
                    setPickingSlot(null)
                  }}
                />
                <Button label={playLabel} disabled={!playable} onClick={runTour} />
              </div>
            </aside>

            <div className="builder-field">
              <CourtBoard
                lineup={lineup}
                ratings={ratings}
                selectedSlot={pickingSlot}
                onSelectSlot={setPickingSlot}
              />
            </div>
          </div>

          <div className="builder-footer builder-footer--mobile">
            <Button
              label="Clear"
              variant="ghost"
              onClick={() => {
                clear()
                setPickingSlot(null)
              }}
            />
            <Button label={playLabel} disabled={!playable} onClick={runTour} />
          </div>
        </div>
      </main>

      <PokemonPicker
        slot={pickingSlot}
        slotByPokemonId={slotByPokemonId}
        currentBst={bst}
        cap={cap}
        currentPokemonId={
          pickingSlot ? (lineup[pickingSlot]?.pokemonId ?? null) : null
        }
        pool={challenge.playerPool}
        boostTypes={boostTypes}
        subtitle={`${challenge.playerPool.length} in pool · ${bst}/${cap} BST`}
        onPick={(id) => {
          if (pickingSlot) assign(pickingSlot, id)
        }}
        onClear={() => {
          if (pickingSlot) assign(pickingSlot, null)
        }}
        onClose={() => setPickingSlot(null)}
      />
    </div>
  )
}

/** Color You / CPU labels inside play-by-play lines. */
function HighlightLine({ text }: { text: string }) {
  const parts = text.split(/\b(You|CPU)\b/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part === 'You') {
          return (
            <span key={i} className="play-team play-team--you">
              You
            </span>
          )
        }
        if (part === 'CPU') {
          return (
            <span key={i} className="play-team play-team--cpu">
              CPU
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
