import { useCallback, useEffect, useMemo, useState } from 'react'
import { canPlay, isOverCap, lineupBst, rateTeam } from '../domain/ratings'
import {
  ALL_SLOTS,
  BST_CAP,
  emptyLineup,
  type Lineup,
  type RosterSlot,
} from '../domain/types'

const STORAGE_KEY = 'pokeballers-sandbox-lineup'

function loadLineup(storageKey: string): Lineup {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return emptyLineup()
    const parsed = JSON.parse(raw) as Partial<Lineup>
    const base = emptyLineup()
    for (const slot of ALL_SLOTS) {
      const entry = parsed[slot]
      if (entry && typeof entry.pokemonId === 'number') {
        base[slot] = { pokemonId: entry.pokemonId }
      }
    }
    return base
  } catch {
    return emptyLineup()
  }
}

export function useLineup(storageKey = STORAGE_KEY) {
  const [lineup, setLineup] = useState<Lineup>(() => loadLineup(storageKey))

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(lineup))
    } catch {
      // ignore
    }
  }, [lineup, storageKey])

  const usedIds = useMemo(() => {
    const ids = new Set<number>()
    for (const slot of ALL_SLOTS) {
      const e = lineup[slot]
      if (e) ids.add(e.pokemonId)
    }
    return ids
  }, [lineup])

  const assign = useCallback((slot: RosterSlot, pokemonId: number | null) => {
    setLineup((prev) => {
      const next = { ...prev }
      if (pokemonId == null) {
        next[slot] = null
        return next
      }
      // Remove from any other slot first
      for (const s of ALL_SLOTS) {
        if (next[s]?.pokemonId === pokemonId) next[s] = null
      }
      next[slot] = { pokemonId }
      return next
    })
  }, [])

  const clear = useCallback(() => setLineup(emptyLineup()), [])

  const bst = lineupBst(lineup)
  const ratings = useMemo(() => rateTeam(lineup), [lineup])
  const overCap = isOverCap(lineup, BST_CAP)
  const playable = canPlay(lineup, BST_CAP)

  return {
    lineup,
    setLineup,
    assign,
    clear,
    usedIds,
    bst,
    ratings,
    overCap,
    playable,
    cap: BST_CAP,
  }
}
