/**
 * shadcn-style Button. Variants map to the semantic tokens defined in
 * src/index.css — raw shadcn tokens (bg-primary, ring-ring, bg-destructive)
 * do not exist in this Tailwind v4 codebase. Keep the shadcn API (variants,
 * sizes, asChild) so future components drop in cleanly.
 *
 * Shape is the full pill (DESIGN.md §5: buttons echo the round pie mark).
 * `default` is the cherry action button — one per surface (the Ten-Percent
 * Cherry Rule). `destructive` reuses cherry deliberately; the label, not a
 * new color, carries the meaning ("Delete session", never bare "Delete").
 */

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-fg hover:bg-accent-hover',
        destructive: 'bg-accent text-accent-fg hover:bg-accent-hover',
        outline:
          'border border-border bg-surface-raised text-text hover:border-border-strong hover:bg-surface-sunken',
        secondary:
          'bg-surface-raised text-text hover:bg-surface-sunken',
        ghost: 'text-text hover:bg-surface-raised',
        link: 'text-text underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-9 px-4',
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

// `buttonVariants` is a non-component export, which trips the Fast Refresh
// rule. Keeping it here preserves the standard shadcn single-file layout;
// the cost is only that an HMR edit to this file does a full reload.
// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants }
