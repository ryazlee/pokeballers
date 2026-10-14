import { getPokemon } from '../domain/pokemon'
import {
  BENCH_SLOTS,
  STARTER_SLOTS,
  slotLabel,
  type Lineup,
  type RosterSlot,
  type TeamRatings,
} from '../domain/types'
import PokemonHoverCard from './PokemonHoverCard'

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
  const fitLabel = fit != null ? Math.round(fit) : null

  const body = pokemon ? (
    <>
      <img src={pokemon.sprite} alt="" width={64} height={64} className="court-slot__sprite" />
      <span className="court-slot__tag">
        <span className="court-slot__pos-chip">{slotLabel(slot)}</span>
        <span className="court-slot__name">{pokemon.name}</span>
        {fitLabel != null ? <span className="court-slot__fit">{fitLabel}</span> : null}
      </span>
    </>
  ) : (
    <>
      <span className="court-slot__empty-mark" aria-hidden="true">
        +
      </span>
      <span className="court-slot__tag">
        <span className="court-slot__pos-chip">{slotLabel(slot)}</span>
        <span className="court-slot__hint">Empty</span>
      </span>
    </>
  )

  return (
    <button
      type="button"
      className={`court-slot ${className}${selected ? ' court-slot--selected' : ''}${pokemon ? ' court-slot--filled' : ''}`}
      onClick={() => onSelect(slot)}
      aria-pressed={selected}
      aria-label={`${slotLabel(slot)}${pokemon ? `: ${pokemon.name}` : ' empty'}`}
    >
      {pokemon ? (
        <PokemonHoverCard pokemon={pokemon} className="court-slot__hover">
          {body}
        </PokemonHoverCard>
      ) : (
        body
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
        <div className="half-court__frame" aria-hidden="true">
          <div className="half-court__wood" />
          <div className="half-court__vignette" />
          <div className="half-court__sideline half-court__sideline--left" />
          <div className="half-court__sideline half-court__sideline--right" />
          <div className="half-court__baseline" />
          <div className="half-court__paint" />
          <div className="half-court__lane-hash half-court__lane-hash--l" />
          <div className="half-court__lane-hash half-court__lane-hash--r" />
          <div className="half-court__ft" />
          <div className="half-court__key" />
          <div className="half-court__arc" />
          <div className="half-court__corner half-court__corner--l" />
          <div className="half-court__corner half-court__corner--r" />
          <div className="half-court__backboard" />
          <div className="half-court__hoop" />
          <div className="half-court__net" />
        </div>
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
