import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', children, ...rest }, ref) {
    return (
      <span className={`relative block ${className}`}>
        <select
          ref={ref}
          className="w-full appearance-none rounded-[9px] border border-line bg-bg px-3 py-2 pr-8 text-base text-ink outline-none focus:border-gold focus:ring-2 focus:ring-gold/30 disabled:opacity-50"
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-faint"
        />
      </span>
    );
  },
);
