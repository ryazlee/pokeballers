import type { Position, PokemonStats } from './types'

/** Position fit weights for base stats (higher = more important). */
export const POSITION_WEIGHTS: Record<
  Position,
  Partial<Record<keyof PokemonStats | 'height' | 'weight', number>>
> = {
  PG: { spe: 1.4, spa: 1.2, spd: 1.0, atk: 0.7, hp: 0.5, def: 0.3 },
  SG: { spa: 1.4, spe: 1.2, atk: 1.1, spd: 0.8, hp: 0.5, def: 0.3 },
  SF: { atk: 1.0, spa: 1.0, spe: 1.0, spd: 1.0, def: 0.8, hp: 0.6 },
  PF: { atk: 1.3, def: 1.2, hp: 1.0, weight: 0.8, spa: 0.4, spe: 0.5, spd: 0.6 },
  C: { def: 1.4, spd: 1.1, hp: 1.2, height: 1.0, weight: 0.9, atk: 0.8, spe: 0.3 },
}

export const SIM = {
  possessions: 92,
  subEvery: 10,
  makeClamp: { min: 0.08, max: 0.75 } as const,
  threeBase: 0.32,
  midBase: 0.42,
  paintBase: 0.52,
  transitionBase: 0.48,
  /** Noise std used as ± fraction of the gap. */
  noiseScale: 12,
  staminaDrain: 6,
  leftoversHeal: 0, // items v2
  reboundSpeWeight: 0.35,
  reboundBulkWeight: 0.65,
}

export const RATING = {
  /** Normalize raw fit into ~0–100. */
  fitScale: 1.15,
  benchDepthHpWeight: 0.35,
}
