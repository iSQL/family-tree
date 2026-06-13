import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { STR } from '../../lib/strings';
import { Button } from './Button';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Red dugmadi na dnu (opciono). */
  footer?: ReactNode;
  maxWidthClass?: string;
}

/** Modal preko portala: overlay + Escape + klik van zatvaraju.
 *  Na mobilnom je bottom-sheet (klizi odozdo, pun širine); na ≥640px centriran modal. */
export function Dialog({ open, onClose, title, children, footer, maxWidthClass = 'sm:max-w-md' }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative max-h-[90dvh] w-full ${maxWidthClass} overflow-y-auto rounded-t-2xl border-t border-stone-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-xl sm:border sm:pb-4 dark:border-stone-700 dark:bg-stone-900`}
      >
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={STR.common.close}
            className="-mr-1 cursor-pointer rounded-md p-2 text-stone-500 hover:bg-stone-200/70 dark:hover:bg-stone-700/70"
          >
            <X size={20} />
          </button>
        </div>
        {children}
        {footer ? <div className="mt-4 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  text: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}

/** Potvrda destruktivne radnje. */
export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = STR.common.delete,
  onConfirm,
  onClose,
  busy = false,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {STR.common.cancel}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-stone-600 dark:text-stone-300">{text}</p>
    </Dialog>
  );
}
