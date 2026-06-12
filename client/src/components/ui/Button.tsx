import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-amber-700 text-white hover:bg-amber-800 disabled:hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500 dark:disabled:hover:bg-amber-600',
  secondary:
    'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700',
  danger:
    'bg-red-700 text-white hover:bg-red-800 disabled:hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500',
  ghost:
    'text-stone-600 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-700/70',
};

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
};

export function Button({ variant = 'primary', size = 'md', className = '', type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={`inline-flex cursor-pointer items-center justify-center rounded-lg font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
}
