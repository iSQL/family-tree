import type { ApiErrorBody, GedcomImportResult } from '@shared/types';
import { STR } from '../lib/strings';

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | undefined;

  constructor(status: number, message: string, body?: ApiErrorBody) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON telo (uzajamno isključivo sa formData). */
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
}

/**
 * Tanki fetch wrapper za /api/*:
 *  - credentials: 'include'
 *  - JSON (de)serijalizacija + ApiErrorBody parsiranje
 *  - globalni 401 → redirect na /login (osim za /api/auth/session i kad smo već tamo)
 */
export async function apiFetch<T = void>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const init: RequestInit = {
    method: opts.method ?? 'GET',
    credentials: 'include',
    signal: opts.signal ?? null,
  };
  if (opts.formData) {
    init.body = opts.formData;
  } else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'Content-Type': 'application/json' };
  }

  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, STR.errors.generic);
  }

  if (res.status === 401 && path !== '/api/auth/session') {
    if (window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
    throw new ApiError(401, STR.errors.unauthorized);
  }

  if (!res.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      body = undefined;
    }
    throw new ApiError(res.status, body?.message ?? body?.error ?? `${STR.errors.generic} (${res.status})`, body);
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return undefined as T;
  return (await res.json()) as T;
}

/** Upload isečene slike (JPEG blob) za osobu. */
export function uploadPhoto(personId: number, blob: Blob): Promise<{ photo_id: string }> {
  const fd = new FormData();
  fd.append('photo', blob, 'photo.jpg');
  return apiFetch<{ photo_id: string }>(`/api/persons/${personId}/photo`, {
    method: 'POST',
    formData: fd,
  });
}

/** GEDCOM import (multipart); dryRun = probni prolaz bez upisa. */
export function gedcomImport(
  file: File,
  mode: 'replace' | 'merge',
  dryRun: boolean,
): Promise<GedcomImportResult> {
  const fd = new FormData();
  fd.append('file', file);
  const qs = `mode=${mode}${dryRun ? '&dry_run=1' : ''}`;
  return apiFetch<GedcomImportResult>(`/api/gedcom/import?${qs}`, {
    method: 'POST',
    formData: fd,
  });
}
