import type { TeamRatings } from '../domain/types'

type RatingBarsProps = {
  ratings: TeamRatings
  bst: number
  cap: number
  overCap: boolean
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="rating-bar">
      <div className="rating-bar__meta">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="rating-bar__track" aria-hidden="true">
        <div className="rating-bar__fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export default function RatingBars({ ratings, bst, cap, overCap }: RatingBarsProps) {
  const bstPct = Math.min(100, Math.round((bst / cap) * 100))

  return (
    <section className="rating-panel surface-card">
      <div className="bst-meter">
        <div className="rating-bar__meta">
          <span className="section-label">Team grades</span>
          <span className={overCap ? 'bst-over' : undefined}>
            BST {bst}/{cap}
          </span>
        </div>
        <div className="rating-bar__track" aria-hidden="true">
          <div
            className={`rating-bar__fill${overCap ? ' rating-bar__fill--danger' : ''}`}
            style={{ width: `${bstPct}%` }}
          />
        </div>
      </div>
      <div className="rating-grid">
        <Bar label="Offense" value={ratings.offense} />
        <Bar label="Defense" value={ratings.defense} />
        <Bar label="Perimeter" value={ratings.perimeter} />
        <Bar label="Paint" value={ratings.paint} />
        <Bar label="Passing" value={ratings.playmaking} />
        <Bar label="Depth" value={ratings.depth} />
      </div>
    </section>
  )
}
