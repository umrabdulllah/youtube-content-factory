import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-accent text-white shadow',
        secondary:
          'border-transparent bg-bg-elevated text-text-secondary',
        destructive:
          'border-transparent bg-error text-white shadow',
        outline: 'text-text-secondary border-border',
        success:
          'border-transparent bg-success/20 text-success',
        warning:
          'border-transparent bg-warning/20 text-warning',
        info:
          'border-transparent bg-accent/20 text-accent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
