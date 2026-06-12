import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import type { ApiErrorBody } from '@shared/types';
import type { AppConfig } from '../config';

/** Operativna greška sa HTTP statusom i mašinskim kodom za telo odgovora. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

export function parseId(raw: unknown): number {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw new AppError(400, 'validation', 'Neispravan ID u putanji');
  }
  return Number(raw);
}

export function createErrorHandler(cfg: AppConfig): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof ZodError) {
      const body: ApiErrorBody = { error: 'validation', issues: err.issues };
      res.status(400).json(body);
      return;
    }
    if (err instanceof AppError) {
      const body: ApiErrorBody = { error: err.code };
      if (err.message !== err.code) body.message = err.message;
      res.status(err.status).json(body);
      return;
    }
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: 'upload_error', message: err.message } satisfies ApiErrorBody);
      return;
    }
    // npr. body-parser greška za neispravan JSON
    if (
      typeof err === 'object' && err !== null &&
      'status' in err && typeof (err as { status: unknown }).status === 'number' &&
      (err as { status: number }).status >= 400 && (err as { status: number }).status < 500
    ) {
      res.status((err as { status: number }).status).json({ error: 'bad_request' } satisfies ApiErrorBody);
      return;
    }
    if (cfg.nodeEnv !== 'test') {
      const log = (req as unknown as { log?: { error: (e: unknown) => void } }).log;
      if (log) log.error(err);
      else console.error(err);
    }
    res.status(500).json({ error: 'internal' } satisfies ApiErrorBody);
  };
}
