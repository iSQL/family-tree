import type { IronSession } from 'iron-session';

export interface SessionData {
  authenticated?: boolean;
  /** true kad je prijava obavljena read-only lozinkom — sve mutacije su zabranjene. */
  readonly?: boolean;
  /** Režim predloga: izmene idu u granu pozivnog linka, a ne u glavno stablo. */
  branch?: { token_id: number; author: string };
}

declare global {
  namespace Express {
    interface Request {
      session: IronSession<SessionData>;
    }
  }
}
