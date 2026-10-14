import type { Pokemon } from './types'

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/**
 * Endurance / stamina grade (1–99), derived from HP.
 * High endurance = stays on the floor longer before a bench swap.
 */
export function enduranceGrade(pokemon: Pokemon): number {
  // Typical HP ~40–150; 150+ maps near max
  return clamp(Math.round((pokemon.stats.hp / 140) * 100), 1, 99)
}

/** Per-possession stamina drain multiplier (higher = tires faster). */
export function staminaDrainMult(pokemon: Pokemon): number {
  const end = enduranceGrade(pokemon)
  // end 99 → ~0.52×; end 50 → ~1.05×; end 30 → ~1.28×; end 20 → ~1.42×
  return clamp(1.55 - end / 105, 0.5, 1.55)
}

/** Stamina level at which a player becomes a strong sub candidate. */
export function subStaminaThreshold(pokemon: Pokemon): number {
  const end = enduranceGrade(pokemon)
  // Low endurance starts looking for a breather earlier (~54); high later (~36)
  return clamp(Math.round(60 - end * 0.24), 34, 56)
}
