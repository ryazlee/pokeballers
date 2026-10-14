import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { enduranceGrade } from '../domain/endurance'
import { getPokemon, POKEMON } from '../domain/pokemon'
import type { Pokemon, RosterSlot } from '../domain/types'
import { slotLabel } from '../domain/types'

type SortKey = 'bst' | 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'end'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'bst', label: 'BST' },
  { value: 'hp', label: 'HP' },
  { value: 'atk', label: 'Atk' },
  { value: 'def', label: 'Def' },
  { value: 'spa', label: 'SpA' },
  { value: 'spd', label: 'SpD' },
  { value: 'spe', label: 'Spe' },
  { value: 'end', label: 'End' },
]

function sortValue(p: Pokemon, key: SortKey): number {
  if (key === 'bst') return p.bst
  if (key === 'end') return enduranceGrade(p)
  return p.stats[key]
}

type PokemonPickerProps = {
  slot: RosterSlot | null
  slotByPokemonId: Map<number, RosterSlot>
  currentBst: number
  cap: number
  /** Pokémon currently in the slot being edited (if any). */
  currentPokemonId: number | null
  onPick: (pokemonId: number) => void
  onClear: () => void
  onClose: () => void
  pool?: Pokemon[]
  boostTypes?: string[]
  subtitle?: string
}

export default function PokemonPicker({
  slot,
  slotByPokemonId,
  currentBst,
  cap,
  currentPokemonId,
  onPick,
  onClear,
  onClose,
  pool,
  boostTypes = [],
  subtitle,
}: PokemonPickerProps) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('bst')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const inputRef = useRef<HTMLInputElement>(null)
  const source = pool ?? POKEMON

  const currentSlotBst = currentPokemonId
    ? (getPokemon(currentPokemonId)?.bst ?? 0)
    : 0
  const bstHeadroom = cap - (currentBst - currentSlotBst)

  useEffect(() => {
    if (!slot) return
    setQuery('')
    const t = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [slot])

  useEffect(() => {
    if (!slot) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slot, onClose])

  const list = useMemo(() => {
    let rows = [...source]
    if (deferredQuery) {
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(deferredQuery) ||
          p.types.some((t) => t.includes(deferredQuery)) ||
          String(p.id) === deferredQuery,
      )
    }
    return rows.sort((a, b) => {
      const diff = sortValue(b, sortKey) - sortValue(a, sortKey)
      if (diff !== 0) return diff
      return b.bst - a.bst || a.name.localeCompare(b.name)
    })
  }, [deferredQuery, source, sortKey])

  function clearAndClose() {
    onClear()
    onClose()
  }

  if (!slot) return null

  return (
    <div
      className="pick-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Pick a Pokémon for ${slotLabel(slot)}`}
    >
      <button type="button" className="pick-modal__backdrop" aria-label="Close" onClick={onClose} />
      <div className="pick-modal__panel surface-card">
        <div className="pick-modal__head">
          <div>
            <p className="eyebrow">Draft pick</p>
            <h2 className="pick-modal__title">{slotLabel(slot)}</h2>
            {subtitle ? <p className="pick-modal__sub">{subtitle}</p> : null}
            <p className="pick-modal__hint">
              Up to {bstHeadroom} BST here · swap keeps your total
            </p>
          </div>
          <div className="pick-modal__actions">
            <button type="button" className="btn btn--secondary btn--sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="pick-modal__tools">
          <label className="field pick-modal__search">
            <span className="field__label">Search</span>
            <input
              ref={inputRef}
              className="field__input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or #…"
              autoComplete="off"
            />
          </label>
          <label className="field pick-modal__sort">
            <span className="field__label">Sort</span>
            <select
              className="field__input field__select"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="Sort pool by"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ul className="pick-grid">
          <li>
            <button
              type="button"
              className={`pick-card pick-card--empty${currentPokemonId == null ? ' pick-card--here' : ''}`}
              onClick={clearAndClose}
            >
              <span className="pick-card__empty-mark" aria-hidden="true">
                —
              </span>
              <span className="pick-card__id">Empty</span>
              <span className="pick-card__foot">Leave this spot open</span>
            </button>
          </li>
          {list.map((p) => {
            const onSlot = slotByPokemonId.get(p.id)
            const here = onSlot === slot
            const elsewhere = onSlot != null && onSlot !== slot
            const overCap = !elsewhere && !here && p.bst > bstHeadroom
            const boosted = p.types.some((t) => boostTypes.includes(t))
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={[
                    'pick-card',
                    here ? 'pick-card--here' : '',
                    elsewhere ? 'pick-card--swap' : '',
                    overCap ? 'pick-card--over' : '',
                    boosted && !overCap ? 'pick-card--boost' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={overCap}
                  title={overCap ? `Needs ${p.bst} BST · ${bstHeadroom} left for this slot` : undefined}
                  onClick={() => {
                    onPick(p.id)
                    onClose()
                  }}
                >
                  <img src={p.sprite} alt="" width={56} height={56} />
                  <span className="pick-card__id">
                    #{String(p.id).padStart(3, '0')} {p.name}
                  </span>
                  <StatGrid pokemon={p} />
                  <span className="pick-card__foot">
                    {overCap
                      ? `Over cap · BST ${p.bst}`
                      : elsewhere
                        ? `Swap · ${slotLabel(onSlot)}`
                        : here
                          ? `Current · ${slotLabel(slot)}`
                          : `${p.types.join(' / ')} · BST ${p.bst} · End ${enduranceGrade(p)}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function StatGrid({ pokemon }: { pokemon: Pokemon }) {
  const s = pokemon.stats
  const rows: [string, number][] = [
    ['HP', s.hp],
    ['Atk', s.atk],
    ['Def', s.def],
    ['SpA', s.spa],
    ['SpD', s.spd],
    ['Spe', s.spe],
  ]
  return (
    <span className="pick-card__stats">
      {rows.map(([label, value]) => (
        <span key={label}>
          <em>{label}</em>
          {value}
        </span>
      ))}
    </span>
  )
}
