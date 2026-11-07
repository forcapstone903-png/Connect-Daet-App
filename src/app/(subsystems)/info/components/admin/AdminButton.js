// Admin button with the console's variants and sizes. Renders a <button> by
// default and a <Link> when `href` is provided, so navigation and actions look
// identical across the admin area.
import Link from 'next/link'
import { Icon } from '@/app/components/Icon'

const VARIANT_CLASSES = {
  primary: 'admin-btn-primary',
  secondary: 'admin-btn-secondary',
  ghost: 'admin-btn-ghost',
  success: 'admin-btn-success',
  danger: 'admin-btn-danger',
  'outline-danger': 'admin-btn-outline-danger',
}

const SIZE_CLASSES = {
  sm: 'admin-btn-sm',
  md: '',
  lg: 'admin-btn-lg',
  icon: 'admin-btn-icon',
}

export default function AdminButton({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  children,
  className = '',
  href,
  type = 'button',
  ...rest
}) {
  const classes = [
    'admin-btn',
    VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.secondary,
    SIZE_CLASSES[size] ?? '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const body = (
    <>
      {icon ? <Icon name={icon} className="h-4 w-4" /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} className="h-4 w-4" /> : null}
    </>
  )

  if (href) {
    return (
      <Link href={href} className={classes} {...rest}>
        {body}
      </Link>
    )
  }

  return (
    <button type={type} className={classes} {...rest}>
      {body}
    </button>
  )
}