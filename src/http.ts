/**
 * HTTP layer: Basic auth, redirect refusal, timeout, bounded retries, auth
 * circuit breaker, rate-limit tracking, envelope unwrapping and error mapping.
 */

import type { ResolvedConfig } from './config.js';
import { API_PATH_PREFIX } from './config.js';
import {
  KaseyaVsaxAuthCircuitOpenError,
  KaseyaVsaxAuthenticationError,
  KaseyaVsaxError,
  KaseyaVsaxForbiddenError,
  KaseyaVsaxNetworkError,
  KaseyaVsaxNotFoundError,
  KaseyaVsaxPaginationError,
  KaseyaVsaxRateLimitError,
  KaseyaVsaxRedirectError,
  KaseyaVsaxServerError,
  KaseyaVsaxTimeoutError,
  KaseyaVsaxValidationError,
  sanitizeBody,
  scrubSecrets,
  type KaseyaVsaxErrorOptions,
} from './errors.js';

export type QueryValue = string | number | boolean | undefined;
export type QueryParams = Record<string, QueryValue>;

/** Response envelope metadata. */
export interface ResponseMeta {
  TotalCount?: number;
  NextQueryLink?: string;
  ResponseCode?: number;
  [key: string]: unknown;
}

export interface Envelope<T> {
  Data: T;
  Meta: ResponseMeta;
}

/** Parsed `X-RateLimit-*` headers from the most recent response that had them. */
export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  /** Seconds until the window resets, as reported by the server. */
  resetSeconds?: number;
  failedRequestLimit?: number;
  failedRequestRemaining?: number;
  failedRequestResetSeconds?: number;
  /** Local timestamp (ms) at which the headers were received. */
  receivedAt: number;
}

export interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
}

const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 10_000;

/**
 * Validate and encode a single path parameter. Rejects empty values, `.`/`..`
 * and anything containing a path separator.
 */
export function pathParam(value: string | number, name = 'id'): string {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new KaseyaVsaxValidationError(`Invalid path parameter "${name}"`, { code: 'INVALID_PATH_PARAM' });
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new KaseyaVsaxValidationError(`Invalid path parameter "${name}"`, { code: 'INVALID_PATH_PARAM' });
  }
  const s = String(value);
  if (s.length === 0 || s === '.' || s === '..' || s.includes('/') || s.includes('\\')) {
    throw new KaseyaVsaxValidationError(`Invalid path parameter "${name}"`, { code: 'INVALID_PATH_PARAM' });
  }
  return encodeURIComponent(s);
}

/** Serialize query params (undefined skipped), keeping a literal `$` in OData keys. */
export function buildQueryString(query?: QueryParams): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    parts.push(`${encodeURIComponent(k).replace(/%24/g, '$')}=${encodeURIComponent(String(v))}`);
  }
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

/**
 * Validate a server-supplied `NextQueryLink`. Only https URLs on exactly the
 * configured host (no userinfo, no port) under `/api/v3/` are accepted.
 */
export function validateNextQueryLink(link: unknown, host: string): URL {
  if (typeof link !== 'string' || link.length === 0 || link.length > 8192) {
    throw new KaseyaVsaxPaginationError('NextQueryLink is missing or malformed');
  }
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new KaseyaVsaxPaginationError('NextQueryLink is not an absolute URL');
  }
  if (url.protocol !== 'https:') throw new KaseyaVsaxPaginationError('NextQueryLink must use https');
  if (url.username !== '' || url.password !== '') {
    throw new KaseyaVsaxPaginationError('NextQueryLink must not contain userinfo');
  }
  if (url.port !== '') throw new KaseyaVsaxPaginationError('NextQueryLink must not specify a port');
  if (url.hostname !== host) {
    throw new KaseyaVsaxPaginationError('NextQueryLink host does not match the configured server');
  }
  if (!url.pathname.startsWith(`${API_PATH_PREFIX}/`)) {
    throw new KaseyaVsaxPaginationError(`NextQueryLink path must be under ${API_PATH_PREFIX}/`);
  }
  url.hash = '';
  return url;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function headerInt(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name);
  if (raw === null) return undefined;
  const n = Number(raw.trim());
  return raw.trim() !== '' && Number.isFinite(n) ? n : undefined;
}

/** HTTP client bound to one tenant. Secrets live only in `#` fields. */
export class HttpClient {
  readonly host: string;
  readonly #baseUrl: string;
  readonly #authHeader: string;
  readonly #secrets: readonly string[];
  readonly #cfg: Omit<ResolvedConfig, 'tokenId' | 'tokenSecret'>;

  #authFailures = 0;
  #trippedAt: number | undefined;
  #lastRateLimit: RateLimitInfo | undefined;

  constructor(config: ResolvedConfig) {
    const { tokenId, tokenSecret, ...rest } = config;
    const credential = Buffer.from(`${tokenId}:${tokenSecret}`, 'utf8').toString('base64');
    this.#authHeader = `Basic ${credential}`;
    this.#secrets = [this.#authHeader, credential, tokenSecret, tokenId];
    this.#cfg = rest;
    this.#baseUrl = rest.baseUrl;
    this.host = rest.host;
  }

  /** Most recent rate-limit headers observed. */
  get lastRateLimit(): RateLimitInfo | undefined {
    return this.#lastRateLimit === undefined ? undefined : { ...this.#lastRateLimit };
  }

  get maxPages(): number {
    return this.#cfg.maxPages;
  }

  /** Whether the auth circuit breaker is currently open. */
  get authCircuitOpen(): boolean {
    return this.#circuitRemainingMs() > 0;
  }

  resetAuthCircuit(): void {
    this.#authFailures = 0;
    this.#trippedAt = undefined;
  }

  /** Returns remaining open time in ms (0 when closed). Moves to half-open after cooldown. */
  #circuitRemainingMs(): number {
    if (this.#trippedAt === undefined) return 0;
    const remaining = this.#trippedAt + this.#cfg.authCooldownMs - this.#cfg.now();
    if (remaining > 0) return remaining;
    // Cooldown elapsed: half-open. A single further auth failure re-trips.
    this.#trippedAt = undefined;
    this.#authFailures = Math.max(0, this.#cfg.authFailureThreshold - 1);
    return 0;
  }

  #recordAuthFailure(): void {
    this.#authFailures += 1;
    if (this.#authFailures >= this.#cfg.authFailureThreshold) this.#trippedAt = this.#cfg.now();
  }

  /** Perform a request and return the unwrapped `Data`. */
  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const env = await this.requestEnvelope<T>(method, path, options);
    return env.Data;
  }

  /** Perform a request and return `{ Data, Meta }`. */
  async requestEnvelope<T>(method: string, path: string, options: RequestOptions = {}): Promise<Envelope<T>> {
    if (!path.startsWith('/')) {
      throw new KaseyaVsaxValidationError('Request path must start with "/"', { code: 'INVALID_PATH' });
    }
    const url = `${this.#baseUrl}${path}${buildQueryString(options.query)}`;
    return this.#execute<T>(method, url, path, options.body);
  }

  /** Follow a (validated) `NextQueryLink`. */
  async requestNextLink<T>(link: string): Promise<Envelope<T>> {
    const url = validateNextQueryLink(link, this.host);
    const path = url.pathname.slice(API_PATH_PREFIX.length);
    return this.#execute<T>('GET', url.href, path, undefined);
  }

  async #execute<T>(method: string, url: string, path: string, body: unknown): Promise<Envelope<T>> {
    const base: KaseyaVsaxErrorOptions = { method, path };
    for (let attempt = 0; ; attempt++) {
      const remaining = this.#circuitRemainingMs();
      if (remaining > 0) throw new KaseyaVsaxAuthCircuitOpenError(remaining);

      const { response, text } = await this.#fetchOnce(method, url, body, base);
      this.#captureRateLimit(response.headers);
      const status = response.status;

      if (status >= 200 && status < 300) {
        this.#authFailures = 0;
        return this.#parseSuccess<T>(text, base);
      }

      const errBase: KaseyaVsaxErrorOptions = { ...base, body: sanitizeBody(text, this.#secrets) };
      const detail = this.#describe(text);

      if (status === 401 || status === 403) {
        this.#recordAuthFailure();
        throw status === 401
          ? new KaseyaVsaxAuthenticationError(`Authentication failed (401)${detail}`, errBase)
          : new KaseyaVsaxForbiddenError(`Forbidden (403)${detail}`, errBase);
      }

      if (status === 429) {
        const retryAfter = this.#parseRetryAfter(response.headers);
        if (retryAfter !== undefined && retryAfter > this.#cfg.maxRetryAfterSeconds) {
          throw new KaseyaVsaxRateLimitError(
            `Rate limited (429); Retry-After ${retryAfter}s exceeds the ${this.#cfg.maxRetryAfterSeconds}s cap`,
            retryAfter,
            errBase,
          );
        }
        if (attempt >= this.#cfg.maxRetries) {
          throw new KaseyaVsaxRateLimitError(`Rate limited (429)${detail}`, retryAfter, errBase);
        }
        const waitMs = retryAfter !== undefined ? Math.max(retryAfter, 1) * 1000 : this.#backoffMs(attempt);
        await this.#cfg.sleep(waitMs);
        continue;
      }

      if (status === 502 || status === 503 || status === 504) {
        if (attempt >= this.#cfg.maxRetries) {
          throw new KaseyaVsaxServerError(`Server error (${status})${detail}`, { ...errBase, status });
        }
        await this.#cfg.sleep(this.#backoffMs(attempt));
        continue;
      }

      throw this.#mapError(status, detail, errBase);
    }
  }

  #mapError(status: number, detail: string, opts: KaseyaVsaxErrorOptions): KaseyaVsaxError {
    if (status === 400) return new KaseyaVsaxValidationError(`Bad request (400)${detail}`, { ...opts, status });
    if (status === 404) return new KaseyaVsaxNotFoundError(`Not found (404)${detail}`, opts);
    if (status >= 500) return new KaseyaVsaxServerError(`Server error (${status})${detail}`, { ...opts, status });
    return new KaseyaVsaxError(`Unexpected response (${status})${detail}`, { ...opts, status, code: 'HTTP_ERROR' });
  }

  async #fetchOnce(
    method: string,
    url: string,
    body: unknown,
    base: KaseyaVsaxErrorOptions,
  ): Promise<{ response: Response; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#cfg.timeoutMs);
    try {
      const headers: Record<string, string> = {
        Authorization: this.#authHeader,
        Accept: 'application/json',
      };
      const init: RequestInit = { method, headers, redirect: 'manual', signal: controller.signal };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      const response = await this.#cfg.fetch(url, init);
      if (
        response.type === 'opaqueredirect' ||
        response.status === 0 ||
        (response.status >= 300 && response.status < 400)
      ) {
        throw new KaseyaVsaxRedirectError(
          `Refusing to follow redirect (status ${response.status}); credentials are never sent to a redirect target`,
          { ...base, status: response.status === 0 ? undefined : response.status },
        );
      }
      const text = await response.text();
      return { response, text };
    } catch (err) {
      if (err instanceof KaseyaVsaxError) throw err;
      if (controller.signal.aborted) {
        throw new KaseyaVsaxTimeoutError(`Request timed out after ${this.#cfg.timeoutMs}ms`, base);
      }
      const msg = err instanceof Error ? err.message : 'unknown error';
      throw new KaseyaVsaxNetworkError(
        `Network error: ${sanitizeBody(msg, this.#secrets)}`,
        base,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  #parseSuccess<T>(text: string, base: KaseyaVsaxErrorOptions): Envelope<T> {
    if (text.trim() === '') return { Data: undefined as T, Meta: {} };
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new KaseyaVsaxServerError('Response was not valid JSON', {
        ...base,
        body: sanitizeBody(text, this.#secrets),
      });
    }
    if (isRecord(json) && 'Data' in json) {
      return { Data: json['Data'] as T, Meta: isRecord(json['Meta']) ? json['Meta'] : {} };
    }
    return { Data: json as T, Meta: {} };
  }

  /** Best-effort, scrubbed, truncated message from an error body. */
  #describe(text: string): string {
    if (text.trim() === '') return '';
    let msg = text;
    try {
      const json: unknown = JSON.parse(text);
      if (isRecord(json)) {
        const candidates = [json['Message'], json['message'], json['error'], json['Error'], json['title']];
        const meta = isRecord(json['Meta']) ? json['Meta'] : undefined;
        candidates.push(meta?.['Message'], meta?.['Error']);
        const found = candidates.find((c): c is string => typeof c === 'string' && c.length > 0);
        if (found !== undefined) msg = found;
      }
    } catch {
      // keep raw text
    }
    return `: ${sanitizeBody(msg, this.#secrets)}`;
  }

  #parseRetryAfter(headers: Headers): number | undefined {
    const raw = headers.get('retry-after')?.trim();
    if (raw === undefined || raw === '') return undefined;
    if (/^\d+$/.test(raw)) return Number(raw);
    const date = Date.parse(raw);
    if (Number.isNaN(date)) return undefined;
    return Math.max(0, Math.ceil((date - this.#cfg.now()) / 1000));
  }

  #backoffMs(attempt: number): number {
    const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
    return Math.round(exp * (0.5 + this.#cfg.random() * 0.5));
  }

  #captureRateLimit(headers: Headers): void {
    const info: RateLimitInfo = { receivedAt: this.#cfg.now() };
    const limit = headerInt(headers, 'x-ratelimit-limit');
    const remaining = headerInt(headers, 'x-ratelimit-remaining');
    const reset = headerInt(headers, 'x-ratelimit-reset');
    const fLimit = headerInt(headers, 'x-ratelimit-failedrequest-limit');
    const fRemaining = headerInt(headers, 'x-ratelimit-failedrequest-remaining');
    const fReset = headerInt(headers, 'x-ratelimit-failedrequest-reset');
    if (limit !== undefined) info.limit = limit;
    if (remaining !== undefined) info.remaining = remaining;
    if (reset !== undefined) info.resetSeconds = reset;
    if (fLimit !== undefined) info.failedRequestLimit = fLimit;
    if (fRemaining !== undefined) info.failedRequestRemaining = fRemaining;
    if (fReset !== undefined) info.failedRequestResetSeconds = fReset;
    if (Object.keys(info).length > 1) this.#lastRateLimit = info;
  }

  /** Scrub arbitrary text of credential material (exposed for tests/diagnostics). */
  scrub(text: string): string {
    return scrubSecrets(text, this.#secrets);
  }
}
