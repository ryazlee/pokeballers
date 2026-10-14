/**
 * One-shot: pull national-dex Pokémon base stats from PokeAPI into src/data/pokemon.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../src/data/pokemon.json')
const MAX_ID = 1025
const CONCURRENCY = 20

function genFromId(id) {
  if (id <= 151) return 1
  if (id <= 251) return 2
  if (id <= 386) return 3
  if (id <= 493) return 4
  if (id <= 649) return 5
  if (id <= 721) return 6
  if (id <= 809) return 7
  if (id <= 905) return 8
  return 9
}

function titleCase(slug) {
  return slug
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

async function fetchPokemon(id) {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
  if (!res.ok) throw new Error(`pokemon ${id}: ${res.status}`)
  const data = await res.json()

  const byName = Object.fromEntries(data.stats.map((s) => [s.stat.name, s.base_stat]))
  const stats = {
    hp: byName.hp ?? 0,
    atk: byName.attack ?? 0,
    def: byName.defense ?? 0,
    spa: byName['special-attack'] ?? 0,
    spd: byName['special-defense'] ?? 0,
    spe: byName.speed ?? 0,
  }
  const bst = stats.hp + stats.atk + stats.def + stats.spa + stats.spd + stats.spe

  return {
    id: data.id,
    name: titleCase(data.name),
    types: data.types.map((t) => t.type.name),
    gen: genFromId(data.id),
    height: data.height,
    weight: data.weight,
    stats,
    bst,
    sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${data.id}.png`,
  }
}

async function mapPool(ids, limit, fn) {
  const results = new Array(ids.length)
  let next = 0

  async function worker() {
    while (next < ids.length) {
      const i = next++
      results[i] = await fn(ids[i])
      if ((i + 1) % 50 === 0 || i + 1 === ids.length) {
        console.log(`Fetched ${i + 1}/${ids.length}`)
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()))
  return results
}

const ids = Array.from({ length: MAX_ID }, (_, i) => i + 1)
console.log(`Fetching ${MAX_ID} Pokémon…`)
const pokemon = await mapPool(ids, CONCURRENCY, fetchPokemon)
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(pokemon))
console.log(`Wrote ${pokemon.length} entries → ${OUT}`)
