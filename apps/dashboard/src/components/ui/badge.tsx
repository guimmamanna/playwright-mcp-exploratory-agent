import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'bg-primary/15 text-primary',
      secondary: 'bg-secondary text-secondary-foreground',
      critical: 'bg-red-500/15 text-red-400',
      high: 'bg-orange-500/15 text-orange-400',
      medium: 'bg-yellow-500/15 text-yellow-300',
      low: 'bg-blue-500/15 text-blue-300',
      outline: 'border border-border text-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const variant =
    severity === 'critical' ? 'critical' : severity === 'high' ? 'high' : severity === 'low' ? 'low' : 'medium';
  return <Badge variant={variant}>{severity}</Badge>;
}
