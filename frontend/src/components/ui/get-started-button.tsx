/**
 * Primary CTA used on the hero. The chevron chip slides out on hover to
 * reveal the arrow across the button surface. Tokens remapped to the
 * earth-tone palette: bg-primary-foreground/15 → bg-accent-fg/15.
 *
 * Forwards props to the underlying Button so it composes with Clerk's
 * <SignInButton mode="modal">, which injects onClick via cloneElement.
 */

import type { ComponentProps } from 'react'
import { ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type GetStartedButtonProps = ComponentProps<typeof Button>

export function GetStartedButton({
  className,
  size = 'lg',
  children = 'Start Cooking',
  ...props
}: GetStartedButtonProps) {
  return (
    <Button
      size={size}
      className={cn('group relative overflow-hidden', className)}
      {...props}
    >
      <span className="mr-8 transition-opacity duration-500 group-hover:opacity-0">
        {children}
      </span>
      <i className="absolute right-1 top-1 bottom-1 rounded-sm z-10 grid w-1/4 place-items-center transition-all duration-500 bg-accent-fg/15 text-accent-fg group-hover:w-[calc(100%-0.5rem)] group-active:scale-95">
        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
      </i>
    </Button>
  )
}
