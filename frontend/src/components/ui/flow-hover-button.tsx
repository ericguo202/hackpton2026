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
  }

const variantClasses: Record<NonNullable<FlowHoverButtonProps['variant']>, string> = {
  light:
    'border-border-strong bg-surface-raised text-text before:bg-accent hover:text-accent-fg',
  dark:
    'border-accent bg-accent text-accent-fg before:bg-surface-raised hover:text-text',
}

export const FlowHoverButton: React.FC<FlowHoverButtonProps> = ({
  icon,
  children,
  className,
  variant = 'light',
  ...props
}) => (
  <button
    className={cn(
      'relative z-0 inline-flex cursor-pointer items-center justify-center gap-2 overflow-hidden rounded border',
      'px-4 py-2 text-sm font-medium',
      'transition-all duration-500',
      'before:absolute before:inset-0 before:-z-10',
      'before:translate-x-[150%] before:translate-y-[150%] before:scale-[2.5]',
      'before:rounded-full',
      'before:transition-transform before:duration-700 before:content-[""]',
      'hover:scale-[1.02]',
      'hover:before:translate-x-[0%] hover:before:translate-y-[0%]',
      'active:scale-[0.98]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
      'disabled:pointer-events-none disabled:opacity-50',
      variantClasses[variant],
      className,
    )}
    {...props}
  >
    {icon}
    <span>{children}</span>
  </button>
)
