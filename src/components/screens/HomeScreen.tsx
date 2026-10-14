import { CircleDot } from 'lucide-react'
import AppHeader from '../AppHeader'
import Button from '../Button'
import MakerCredit from '../MakerCredit'
import { todayKey } from '../../domain/daily'

export default function HomeScreen() {
  const dateKey = todayKey()

  return (
    <div className="app-shell">
      <AppHeader title="Pokeballers" quiet />
      <main className="app-main">
        <div className="shell-inner landing">
          <div className="landing__hero">
            <CircleDot size={36} strokeWidth={1.75} aria-hidden="true" />
            <h1 className="landing__title">Pokeballers</h1>
            <p className="landing__tagline">
              Draft a 5-on-5 Pokémon hoops squad under a BST cap. Tip off against a
              sandbox CPU or today’s daily boss.
            </p>
            <MakerCredit />
          </div>

          <div className="landing__actions">
            <Button label="Build team" to="/build" block icon={<CircleDot size={16} />} />
            <Button
              label={`Daily challenge · ${dateKey}`}
              to="/daily"
              variant="secondary"
              block
            />
          </div>

          <section className="landing__how surface-card">
            <p className="section-label">How it works</p>
            <ul>
              <li>Fill PG, SG, SF, PF, C plus two bench spots.</li>
              <li>Stay under the 3600 BST salary cap across all seven.</li>
              <li>
                Special Attack fuels threes; Attack drives the paint; Speed and
                defenses shape matchups.
              </li>
              <li>Autobattle resolves possessions with weighted chance.</li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  )
}
