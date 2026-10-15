import { useMemo } from 'react'
import AppHeader from '../AppHeader'
import Button from '../Button'
import MakerCredit from '../MakerCredit'
import PokemonHoverCard from '../PokemonHoverCard'
import { buildDailyChallenge, todayKey } from '../../domain/daily'
import { getPokemon } from '../../domain/pokemon'
import { BENCH_SLOTS, STARTER_SLOTS } from '../../domain/types'

export default function HomeScreen() {
  const dateKey = todayKey()
  const challenge = useMemo(() => buildDailyChallenge(dateKey), [dateKey])

  return (
    <div className="app-shell">
      <AppHeader title="Pokeballers" quiet />
      <main className="app-main">
        <div className="shell-inner shell-inner--wide landing">
          <header className="landing__intro">
            <div className="landing__copy">
              <p className="landing__kicker">All-5 Pokémon hoops</p>
              <h1 className="landing__title">Pokeballers</h1>
              <p className="landing__tagline">
                Draft a roster from today’s pool and run it through seven type
                stadiums.
              </p>
            </div>
            <div className="landing__cta">
              <Button
                label={`Play daily · ${dateKey}`}
                to="/daily"
                className="landing__play"
                block
              />
              <MakerCredit />
            </div>
          </header>

          <section className="landing-opponent" aria-label="Today’s CPU opponent">
            <div className="landing-opponent__head">
              <h2 className="landing-opponent__title">Today’s opponent</h2>
              <p className="landing-opponent__meta">
                CPU · avg {challenge.cpuPoolAvgBst} BST
              </p>
            </div>
            <div className="landing-opponent__scroller">
              <ul className="landing-opponent__list">
                {[...STARTER_SLOTS, ...BENCH_SLOTS].map((slot) => {
                  const entry = challenge.cpuLineup[slot]
                  const p = entry ? getPokemon(entry.pokemonId) : null
                  const label =
                    slot === 'BENCH1' ? 'B1' : slot === 'BENCH2' ? 'B2' : slot
                  return (
                    <li key={slot}>
                      <span className="landing-opponent__slot">{label}</span>
                      {p ? (
                        <PokemonHoverCard
                          pokemon={p}
                          className="landing-opponent__hover"
                        >
                          <img src={p.sprite} alt="" width={48} height={48} />
                          <span className="landing-opponent__name">{p.name}</span>
                        </PokemonHoverCard>
                      ) : (
                        <span className="landing-opponent__empty">—</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          </section>

          <section className="how-it-works">
            <h2 className="how-it-works__title">How it works</h2>
            <ol className="how-it-works__list">
              <li>
                <span className="how-it-works__num" aria-hidden="true">
                  01
                </span>
                <span className="how-it-works__text">
                  Draft 5 starters + 2 bench from a pool of 25.
                </span>
              </li>
              <li>
                <span className="how-it-works__num" aria-hidden="true">
                  02
                </span>
                <span className="how-it-works__text">
                  Stay under the 3000 BST cap.
                </span>
              </li>
              <li>
                <span className="how-it-works__num" aria-hidden="true">
                  03
                </span>
                <span className="how-it-works__text">
                  Play 7 stadiums with type boosts and shot twists.
                </span>
              </li>
            </ol>
          </section>

          <div className="landing__guides">
            <section className="scout-block">
              <h2 className="scout-block__title">Stats</h2>
              <dl className="scout-stats">
                <div>
                  <dt>Sp. Atk</dt>
                  <dd>Threes / jumpers</dd>
                </div>
                <div>
                  <dt>Attack</dt>
                  <dd>Drives, paint &amp; passing</dd>
                </div>
                <div>
                  <dt>Speed</dt>
                  <dd>Transition &amp; chase</dd>
                </div>
                <div>
                  <dt>Sp. Def</dt>
                  <dd>Contesting shots</dd>
                </div>
                <div>
                  <dt>Defense</dt>
                  <dd>Interior D &amp; boards</dd>
                </div>
                <div>
                  <dt>HP</dt>
                  <dd>Endurance — one-bench max builds tire late</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>Rim protection</dd>
                </div>
              </dl>
            </section>

            <section className="scout-block">
              <h2 className="scout-block__title">Positions</h2>
              <ul className="scout-positions">
                <li>
                  <strong>PG</strong>
                  <span>Speed, Attack, Sp. Atk — run the offense.</span>
                </li>
                <li>
                  <strong>SG</strong>
                  <span>Sp. Atk, Speed, Attack — scoring wing.</span>
                </li>
                <li>
                  <strong>SF</strong>
                  <span>Balanced two-way.</span>
                </li>
                <li>
                  <strong>PF</strong>
                  <span>Attack, Defense, HP — physical scorer.</span>
                </li>
                <li>
                  <strong>C</strong>
                  <span>Defense, Sp. Def, HP, size — paint anchor.</span>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
