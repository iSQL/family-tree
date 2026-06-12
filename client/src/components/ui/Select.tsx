import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', children, ...rest }, ref) {
    return (
      <span className={`relative block ${className}`}>
        <select
          ref={ref}
          className="w-full appearance-none rounded-lg border border-stone-300 bg-white px-3 py-2 pr-8 text-sm text-stone-800 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/30 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-stone-400"
        />
      </span>
    );
  },
);
