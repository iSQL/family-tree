import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900 ${className}`}
      {...rest}
    />
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-700">
      <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-200">{title}</h2>
      {action}
    </div>
  );
}
