/**
 * FlowHoverButton — accent-ink sweep on hover.
 *
 * The cream surface fills with the brand ink (`bg-accent`) as a circular
 * mask scales in from the bottom-right; the label flips to `accent-fg`
 * for contrast. Uses the same focus-ring + disabled rules as the standard
 * `Button` so it slots in alongside it.
 *
 * Renamed from the upstream snippet (`Button`) so it doesn't collide with
 * the project's primary `Button` in `ui/button.tsx`. Token-mapped to the
 * earth-tone palette — no zinc, no dark variants.
 */

import * as React from 'react'

import { cn } from '@/lib/utils'

export type FlowHoverButtonProps =
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: React.ReactNode
    /**
     * `light` (default) — cream surface, ink sweeps in on hover.
     * `dark`            — ink surface, cream sweeps in on hover.
     */
    variant?: 'light' | 'dark'
    /**
     * `default` — compact, used inline (icon-sized sweep).
     * `lg`      — full-width / tall buttons. Pushes the sweep pill further
     *              off-screen at rest so it doesn't peek through the corner
     *              on wide aspect ratios (e.g., `w-full py-4` auth buttons).
     */
    size?: 'default' | 'lg'
  }

const variantClasses: Record<NonNullable<FlowHoverButtonProps['variant']>, string> = {
  light:
    'border-border-strong bg-surface-raised text-text before:bg-accent hover:text-accent-fg',
  dark:
    'border-accent bg-accent text-accent-fg before:bg-surface-raised hover:text-text',
}

const sizeClasses: Record<NonNullable<FlowHoverButtonProps['size']>, string> = {
  default: 'before:translate-x-[180%] before:translate-y-[180%]',
  lg: 'before:translate-x-[220%] before:translate-y-[220%]',
}

export const FlowHoverButton: React.FC<FlowHoverButtonProps> = ({
  icon,
  children,
  className,
  variant = 'light',
  size = 'default',
  ...props
}) => (
  <button
    className={cn(
      'relative z-0 inline-flex cursor-pointer items-center justify-center gap-2 overflow-hidden rounded border',
      'px-4 py-2 text-sm font-medium',
      'transition-all duration-500',
      'before:absolute before:inset-0 before:-z-10',
      'before:scale-[2.5]',
      'before:rounded-full',
      'before:transition-transform before:duration-700 before:content-[""]',
      'hover:scale-[1.02]',
      'hover:before:translate-x-[0%] hover:before:translate-y-[0%]',
      'active:scale-[0.98]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
      'disabled:pointer-events-none disabled:opacity-50',
      sizeClasses[size],
      variantClasses[variant],
      className,
    )}
    {...props}
  >
    {icon}
    <span>{children}</span>
  </button>
)
