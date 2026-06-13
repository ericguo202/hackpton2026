/**
 * Primary CTA used on the landing page. Pill-shaped per DESIGN.md (buttons
 * echo the round pie mark); the chevron chip slides out on hover to reveal
 * the arrow across the button surface. Colors come from the accent tokens
 * (cherry fill, white text, identical in both themes).
 *
 * Forwards props to the underlying Button so callers pass onClick directly.
 */

import type { ComponentProps } from 'react'
import { ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type GetStartedButtonProps = ComponentProps<typeof Button>

export function GetStartedButton({
  className,
  size = 'lg',
  children = 'Start practicing free',
  ...props
}: GetStartedButtonProps) {
  return (
    <Button
      size={size}
      className={cn('group relative overflow-hidden rounded-full px-7', className)}
      {...props}
    >
      <span className="mr-8 transition-opacity duration-500 group-hover:opacity-0">
        {children}
      </span>
      <i className="absolute right-1 top-1 bottom-1 rounded-full z-10 grid w-1/4 place-items-center transition-all duration-500 bg-accent-fg/15 text-accent-fg group-hover:w-[calc(100%-0.5rem)] group-active:scale-95">
        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
      </i>
    </Button>
  )
}
