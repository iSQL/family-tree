import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

export const FIELD_CLASSES =
  'w-full rounded-[9px] border border-line bg-bg px-3 py-2 text-base text-ink placeholder:text-faint outline-none focus:border-gold focus:ring-2 focus:ring-gold/30 disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...rest }, ref) {
    return <input ref={ref} className={`${FIELD_CLASSES} ${className}`} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', ...rest }, ref) {
    return <textarea ref={ref} className={`${FIELD_CLASSES} min-h-24 ${className}`} {...rest} />;
  },
);

/** Labela + kontrola + poruka greške — standardni raspored polja u formama. */
export function Field({
  label,
  error,
  children,
  className = '',
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="zb-label mb-1 block text-[11px] tracking-[.16em] text-faint">
        {label}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}
