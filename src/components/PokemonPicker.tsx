import { useDeferredValue, useMemo, useState } from 'react'
import { POKEMON } from '../domain/pokemon'
import type { Pokemon, RosterSlot } from '../domain/types'
import { slotLabel } from '../domain/types'

type PokemonPickerProps = {
  slot: RosterSlot | null
  usedIds: Set<number>
  onPick: (pokemonId: number) => void
  onClear: () => void
  onClose: () => void
}

export default function PokemonPicker({
  slot,
  usedIds,
  onPick,
  onClear,
  onClose,
}: PokemonPickerProps) {
  const [query, setQuery] = useState('')
  const [gen, setGen] = useState<number | 'all'>('all')
  const [sort, setSort] = useState<'bst' | 'name' | 'spe'>('bst')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())

  const list = useMemo(() => {
    let rows: Pokemon[] = POKEMON
    if (gen !== 'all') rows = rows.filter((p) => p.gen === gen)
    if (deferredQuery) {
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(deferredQuery) ||
          p.types.some((t) => t.includes(deferredQuery)) ||
          String(p.id) === deferredQuery,
      )
    }
    rows = [...rows].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'spe') return b.stats.spe - a.stats.spe
      return b.bst - a.bst
    })
    return rows.slice(0, 80)
  }, [deferredQuery, gen, sort])

  if (!slot) return null

  return (
    <div className="picker-sheet surface-card">
      <div className="picker-sheet__head">
        <div>
          <p className="section-label">Pick for {slotLabel(slot)}</p>
          <p className="picker-sheet__hint">Search by name, type, or dex #</p>
        </div>
        <div className="picker-sheet__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClear}>
            Clear slot
          </button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>

      <div className="picker-filters">
        <label className="field">
          <span className="field__label">Search</span>
          <input
            className="field__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Charizard, fire, 6…"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span className="field__label">Gen</span>
          <select
            className="field__input"
            value={gen}
            onChange={(e) =>
              setGen(e.target.value === 'all' ? 'all' : Number(e.target.value))
            }
          >
            <option value="all">All</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => (
              <option key={g} value={g}>
                Gen {g}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Sort</span>
          <select
            className="field__input"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
          >
            <option value="bst">BST</option>
            <option value="spe">Speed</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      <ul className="picker-list">
        {list.map((p) => {
          const used = usedIds.has(p.id)
          return (
            <li key={p.id}>
              <button
                type="button"
                className={`picker-row${used ? ' picker-row--used' : ''}`}
                onClick={() => onPick(p.id)}
                disabled={used}
              >
                <img src={p.sprite} alt="" width={40} height={40} />
                <span className="picker-row__main">
                  <span className="picker-row__name">{p.name}</span>
                  <span className="picker-row__meta">
                    #{p.id} · Gen {p.gen} · {p.types.join('/')}
                  </span>
                </span>
                <span className="picker-row__bst">{p.bst}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
