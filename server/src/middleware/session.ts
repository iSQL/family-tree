import type { IronSession } from 'iron-session';

export interface SessionData {
  authenticated?: boolean;
  /** true kad je prijava obavljena read-only lozinkom — sve mutacije su zabranjene. */
  readonly?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      session: IronSession<SessionData>;
    }
  }
}
