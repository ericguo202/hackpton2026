/**
 * shadcn-style Button. Variants map to the earth-tone semantic tokens
 * defined in src/index.css — raw shadcn tokens (bg-primary, ring-ring,
 * bg-destructive) do not exist in this Tailwind v4 codebase. Keep the
 * shadcn API (variants, sizes, asChild) so future components drop in cleanly.
 */

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-fg hover:bg-accent-hover',
        destructive: 'bg-accent text-accent-fg hover:bg-accent-hover',
        outline:
          'border border-border-strong bg-surface text-text hover:bg-surface-raised',
        secondary:
          'bg-surface-raised text-text hover:bg-surface-sunken',
        ghost: 'text-text hover:bg-surface-raised',
        link: 'text-text underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
