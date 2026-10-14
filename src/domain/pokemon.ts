import raw from '../data/pokemon.json'
import type { Pokemon } from './types'

export const POKEMON: Pokemon[] = raw as Pokemon[]

const byId = new Map(POKEMON.map((p) => [p.id, p]))

export function getPokemon(id: number): Pokemon | undefined {
  return byId.get(id)
}

export function requirePokemon(id: number): Pokemon {
  const p = byId.get(id)
  if (!p) throw new Error(`Unknown Pokémon id ${id}`)
  return p
}
