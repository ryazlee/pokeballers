import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { enduranceGrade } from '../domain/endurance'
import type { Pokemon } from '../domain/types'

type PokemonHoverCardProps = {
  pokemon: Pokemon
  className?: string
  children: ReactNode
}

type Pos = { top: number; left: number; placement: 'above' | 'below' }

const CARD_W = 236
const CARD_H = 140

function placeRect(anchor: DOMRect): Pos {
  let left = anchor.left + anchor.width / 2 - CARD_W / 2
  left = Math.max(8, Math.min(left, window.innerWidth - CARD_W - 8))
  const above = anchor.top - CARD_H - 10
  if (above >= 8) {
    return { top: above, left, placement: 'above' }
  }
  return {
    top: Math.min(anchor.bottom + 10, window.innerHeight - CARD_H - 8),
    left,
    placement: 'below',
  }
}

export default function PokemonHoverCard({
  pokemon,
  className,
  children,
}: PokemonHoverCardProps) {
  const s = pokemon.stats
  const endurance = enduranceGrade(pokemon)
  const tipId = useId()
  const rootRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Pos | null>(null)

  const update = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    setPos(placeRect(el.getBoundingClientRect()))
  }, [])

  useEffect(() => {
    if (!open) return
    update()
    const onMove = () => update()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, update])

  const card = open && pos
    ? createPortal(
        <div
          id={tipId}
          className={`poke-hover__card poke-hover__card--portal poke-hover__card--${pos.placement}`}
          role="tooltip"
          style={{ top: pos.top, left: pos.left, width: CARD_W }}
        >
          <div className="poke-hover__title">
            <img src={pokemon.sprite} alt="" width={44} height={44} />
            <div>
              <strong>{pokemon.name}</strong>
              <span className="poke-hover__meta">
                #{pokemon.id} · Gen {pokemon.gen} · {pokemon.types.join('/')} · BST{' '}
                {pokemon.bst}
              </span>
            </div>
          </div>
          <div className="poke-hover__stats">
            <span>
              <em>HP</em> {s.hp}
            </span>
            <span>
              <em>Atk</em> {s.atk}
            </span>
            <span>
              <em>Def</em> {s.def}
            </span>
            <span>
              <em>SpA</em> {s.spa}
            </span>
            <span>
              <em>SpD</em> {s.spd}
            </span>
            <span>
              <em>Spe</em> {s.spe}
            </span>
            <span>
              <em>End</em> {endurance}
            </span>
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <span
      ref={rootRef}
      className={`poke-hover${className ? ` ${className}` : ''}`}
      onMouseEnter={() => {
        setOpen(true)
        requestAnimationFrame(update)
      }}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => {
        setOpen(true)
        requestAnimationFrame(update)
      }}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? tipId : undefined}
    >
      {children}
      {card}
    </span>
  )
}
