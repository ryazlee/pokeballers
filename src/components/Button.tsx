import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type To } from 'react-router-dom'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm'

type BaseProps = {
  label: string
  icon?: ReactNode
  variant?: Variant
  size?: Size
  block?: boolean
  className?: string
}

type ButtonAsButton = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & {
    to?: undefined
  }

type ButtonAsLink = BaseProps & {
  to: To
}

function buttonClassName({
  variant = 'primary',
  size,
  block,
  className,
}: Pick<BaseProps, 'variant' | 'size' | 'block' | 'className'>) {
  return [
    'btn',
    `btn--${variant}`,
    size === 'sm' ? 'btn--sm' : null,
    block ? 'btn--block' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')
}

export default function Button(props: ButtonAsButton | ButtonAsLink) {
  const classes = buttonClassName(props)

  if ('to' in props && props.to != null) {
    const { label, icon, to } = props
    return (
      <Link to={to} className={classes}>
        {icon ? <span className="btn__icon">{icon}</span> : null}
        {label}
      </Link>
    )
  }

  const { label, icon, type = 'button', disabled, onClick, title } = props

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {icon ? <span className="btn__icon">{icon}</span> : null}
      {label}
    </button>
  )
}
