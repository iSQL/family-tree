import type { IronSession } from 'iron-session';

export interface SessionData {
  authenticated?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      session: IronSession<SessionData>;
    }
  }
}
