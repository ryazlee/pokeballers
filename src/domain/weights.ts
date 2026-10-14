import type { Position, PokemonStats } from './types'

/** Position fit weights for base stats (higher = more important). */
export const POSITION_WEIGHTS: Record<
  Position,
  Partial<Record<keyof PokemonStats | 'height' | 'weight', number>>
> = {
  PG: { spe: 1.4, atk: 1.2, spa: 1.0, spd: 0.9, hp: 0.5, def: 0.3 },
  SG: { spa: 1.4, spe: 1.2, atk: 1.1, spd: 0.8, hp: 0.5, def: 0.3 },
  SF: { atk: 1.0, spa: 1.0, spe: 1.0, spd: 1.0, def: 0.8, hp: 0.6 },
  PF: { atk: 1.3, def: 1.2, hp: 1.0, weight: 0.8, spa: 0.4, spe: 0.5, spd: 0.6 },
  C: { def: 1.4, spd: 1.1, hp: 1.2, height: 1.0, weight: 0.9, atk: 0.8, spe: 0.3 },
}

/** How often each position looks for each shot type. */
export const POSITION_SHOT_BIAS: Record<
  Position,
  Record<'three' | 'mid' | 'paint' | 'transition', number>
> = {
  PG: { three: 1.1, mid: 0.9, paint: 0.55, transition: 1.35 },
  SG: { three: 1.4, mid: 1.15, paint: 0.7, transition: 1.1 },
  SF: { three: 1.0, mid: 1.0, paint: 1.0, transition: 1.0 },
  PF: { three: 0.55, mid: 0.85, paint: 1.4, transition: 0.7 },
  C: { three: 0.35, mid: 0.7, paint: 1.55, transition: 0.5 },
}

export const SIM = {
  possessions: 92,
  subEvery: 10,
  makeClamp: { min: 0.08, max: 0.75 } as const,
  threeBase: 0.32,
  midBase: 0.42,
  paintBase: 0.52,
  transitionBase: 0.48,
  /** Half-court / logo heaves — intentionally rare makes. */
  heaveBase: 0.055,
  /** Base steal look before Spe/SpD gap (perimeter pressure). */
  stealBase: 0.07,
  /** Noise std used as ± fraction of the gap. */
  noiseScale: 12,
  /** Base stamina lost per possession before endurance multiplier. */
  staminaDrain: 5.5,
  leftoversHeal: 0, // items v2
  reboundSpeWeight: 0.35,
  reboundBulkWeight: 0.65,
  /** Fresh stamina when checking in from a full (2-man) bench. */
  subInStamina: 90,
  /** Check-in stamina with only one bench seat — incomplete rest. */
  subInStaminaThin: 68,
  /**
   * Position fit scales live play. Fit 50 ≈ 1.0; bad fits get punished,
   * good fits get a bump — so slotting matters, not just raw BST.
   */
  fitMultMin: 0.72,
  fitMultMax: 1.18,
  /**
   * Dex size baselines (PokéAPI: height dm, weight hg).
   * ~15 dm / 600 hg ≈ average starter body.
   */
  heightBaseline: 15,
  weightBaseline: 600,
}

export const RATING = {
  /** Normalize raw fit into ~0–100. */
  fitScale: 1.15,
  benchDepthHpWeight: 0.35,
}
