import { getPokemon } from '../domain/pokemon'
import {
  BENCH_SLOTS,
  STARTER_SLOTS,
  slotLabel,
  type Lineup,
  type RosterSlot,
  type TeamRatings,
} from '../domain/types'

type CourtBoardProps = {
  lineup: Lineup
  ratings: TeamRatings
  selectedSlot: RosterSlot | null
  onSelectSlot: (slot: RosterSlot) => void
}

function SlotButton({
  slot,
  lineup,
  fit,
  selected,
  onSelect,
  className,
}: {
  slot: RosterSlot
  lineup: Lineup
  fit?: number
  selected: boolean
  onSelect: (slot: RosterSlot) => void
  className: string
}) {
  const entry = lineup[slot]
  const pokemon = entry ? getPokemon(entry.pokemonId) : undefined

  return (
    <button
      type="button"
      className={`court-slot ${className}${selected ? ' court-slot--selected' : ''}${pokemon ? ' court-slot--filled' : ''}`}
      onClick={() => onSelect(slot)}
      aria-pressed={selected}
      aria-label={`${slotLabel(slot)}${pokemon ? `: ${pokemon.name}` : ' empty'}`}
    >
      {pokemon ? (
        <>
          <img src={pokemon.sprite} alt="" width={56} height={56} className="court-slot__sprite" />
          <span className="court-slot__name">{pokemon.name}</span>
          <span className="court-slot__meta">
            {slotLabel(slot)}
            {fit != null ? ` · ${fit}` : ''}
          </span>
        </>
      ) : (
        <>
          <span className="court-slot__pos">{slotLabel(slot)}</span>
          <span className="court-slot__hint">Tap to fill</span>
        </>
      )}
    </button>
  )
}

export default function CourtBoard({
  lineup,
  ratings,
  selectedSlot,
  onSelectSlot,
}: CourtBoardProps) {
  return (
    <div className="court-board">
      <div className="half-court" aria-label="Starting five">
        <div className="half-court__paint" aria-hidden="true" />
        <div className="half-court__key" aria-hidden="true" />
        <div className="half-court__arc" aria-hidden="true" />
        {STARTER_SLOTS.map((slot) => (
          <SlotButton
            key={slot}
            slot={slot}
            lineup={lineup}
            fit={ratings.slotFits[slot]}
            selected={selectedSlot === slot}
            onSelect={onSelectSlot}
            className={`court-slot--${slot.toLowerCase()}`}
          />
        ))}
      </div>
      <div className="bench-row">
        <p className="section-label">Bench</p>
        <div className="bench-slots">
          {BENCH_SLOTS.map((slot) => (
            <SlotButton
              key={slot}
              slot={slot}
              lineup={lineup}
              fit={ratings.slotFits[slot]}
              selected={selectedSlot === slot}
              onSelect={onSelectSlot}
              className="court-slot--bench"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
