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
      <div className="absolute inset-0 bg-[rgba(15,25,45,.5)]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative max-h-[90dvh] w-full ${maxWidthClass} overflow-y-auto rounded-t-[22px] border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_24px_60px_-30px_rgba(20,30,50,.6)] sm:rounded-2xl sm:border sm:pb-4`}
      >
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="font-display text-xl font-normal text-heading">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={STR.common.close}
            className="-mr-1 cursor-pointer rounded-md p-2 text-muted hover:bg-surface2"
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
      <p className="text-base text-muted">{text}</p>
    </Dialog>
  );
}
