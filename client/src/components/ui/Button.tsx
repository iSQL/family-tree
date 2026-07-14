import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'gold' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-navy text-onnav hover:bg-navy2 disabled:hover:bg-navy shadow-[0_8px_20px_-8px_rgba(20,30,50,.5)]',
  gold:
    'bg-gold text-ongold hover:bg-goldd disabled:hover:bg-gold shadow-[0_8px_20px_-8px_rgba(194,155,71,.7)]',
  secondary:
    'border border-line bg-bg text-ink hover:bg-surface2',
  danger:
    'bg-[#a23b32] text-white hover:bg-[#8c322a] disabled:hover:bg-[#a23b32]',
  ghost: 'text-muted hover:bg-surface2',
};

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-[11px] gap-1.5',
  md: 'px-4 py-2 text-xs gap-2',
};

export function Button({ variant = 'primary', size = 'md', className = '', type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={`zb-label inline-flex cursor-pointer items-center justify-center rounded-[9px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
}
