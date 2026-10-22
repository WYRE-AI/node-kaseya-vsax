/**
 * Error hierarchy for the Kaseya VSA X SDK.
 *
 * Errors never carry credential material: messages and bodies are scrubbed by
 * the HTTP layer (see {@link scrubSecrets}) before an error is constructed, and
 * errors never hold a reference to the config, request headers, or `cause`.
 */

/** Maximum number of upstream body characters retained on an error. */
export const MAX_ERROR_BODY_LENGTH = 500;

const REDACTED = '[REDACTED]';

/**
 * Remove every occurrence of the given secret strings from `text`.
 * Longest secrets are replaced first so a secret that contains another is
 * fully removed.
 */
export function scrubSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  const sorted = [...secrets].filter((s) => s.length > 0).sort((a, b) => b.length - a.length);
  for (const secret of sorted) out = out.split(secret).join(REDACTED);
  // Also drop any echoed Authorization header line, whatever its value.
  return out.replace(/authorization["']?\s*[:=]\s*(?:basic\s+|bearer\s+)?[^\s"',}]*/gi, REDACTED);
}

/** Scrub then truncate an upstream body to {@link MAX_ERROR_BODY_LENGTH}. */
export function sanitizeBody(text: string, secrets: readonly string[]): string {
  const scrubbed = scrubSecrets(text, secrets);
  return scrubbed.length > MAX_ERROR_BODY_LENGTH
    ? `${scrubbed.slice(0, MAX_ERROR_BODY_LENGTH)}…[truncated]`
    : scrubbed;
}

export interface KaseyaVsaxErrorOptions {
  status?: number;
  code?: string;
  method?: string;
  /** Request path WITHOUT query string. */
  path?: string;
  /** Already-scrubbed upstream body excerpt. */
  body?: string;
  /** Already-scrubbed, truncated upstream error text (no status prefix). */
  detail?: string;
}

/** Base class for all SDK errors. */
export class KaseyaVsaxError extends Error {
  readonly status?: number;
  readonly code: string;
  readonly method?: string;
  readonly path?: string;
  readonly body?: string;
  /** Scrubbed, truncated upstream error text without the "Bad request (400):" style prefix. */
  readonly detail?: string;

  constructor(message: string, options: KaseyaVsaxErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.code = options.code ?? 'VSAX_ERROR';
    if (options.status !== undefined) this.status = options.status;
    if (options.method !== undefined) this.method = options.method;
    if (options.path !== undefined) this.path = stripQuery(options.path);
    if (options.body !== undefined) this.body = options.body.slice(0, MAX_ERROR_BODY_LENGTH + 20);
    if (options.detail !== undefined && options.detail !== '') this.detail = options.detail;
  }
}

function stripQuery(path: string): string {
  const i = path.search(/[?#]/);
  return i === -1 ? path : path.slice(0, i);
}

/** Invalid SDK configuration. Never contains secret material. */
export class KaseyaVsaxConfigError extends KaseyaVsaxError {
  constructor(message: string) {
    super(message, { code: 'CONFIG_ERROR' });
  }
}

/** HTTP 401. */
export class KaseyaVsaxAuthenticationError extends KaseyaVsaxError {
  constructor(message: string, options: KaseyaVsaxErrorOptions = {}) {
    super(message, { ...options, status: 401, code: 'AUTHENTICATION_ERROR' });
  }
}

/** HTTP 403. */
export class KaseyaVsaxForbiddenError extends KaseyaVsaxError {
  constructor(message: string, options: KaseyaVsaxErrorOptions = {}) {
    super(message, { ...options, status: 403, code: 'FORBIDDEN' });
  }
}

/** HTTP 404. */
export class KaseyaVsaxNotFoundError extends KaseyaVsaxError {
  constructor(message: string, options: KaseyaVsaxErrorOptions = {}) {
    super(message, { ...options, status: 404, code: 'NOT_FOUND' });
  }
}

/** HTTP 400, or invalid caller-supplied input rejected locally (no status). */
export class KaseyaVsaxValidationError extends KaseyaVsaxError {
  constructor(message: string, options: KaseyaVsaxErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? 'VALIDATION_ERROR' });
  }
}

/** HTTP 429, or a Retry-After above the configured cap. */
export class KaseyaVsaxRateLimitError extends KaseyaVsaxError {
  readonly retryAfterSeconds?: number;

  constructor(message: string, retryAfterSeconds?: number, options: KaseyaVsaxErrorOptions = {}) {
    super(message, { ...options, status: 429, code: 'RATE_LIMITED' });
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** HTTP 5xx. */
export class KaseyaVsaxServerError extends KaseyaVsaxError {
  constructor(message: string, options: KaseyaVsaxErrorOptions = {}) {
    super(message, { ...options, code: 'SERVER_ERROR' });
  }
}

/** A 3xx / opaque redirect response. Redirects are never followed. */
export class KaseyaVsaxRedirectError extends KaseyaVsaxError {
  constructor(message: string, options: KaseyaVsaxErrorOptions = {}) {
    super(message, { ...options, code: 'REDIRECT_REFUSED' });
  }
}

/** Unsafe or malformed pagination state (bad NextQueryLink, loops, page cap). */
export class KaseyaVsaxPaginationError extends KaseyaVsaxError {
  constructor(message: string, options: KaseyaVsaxErrorOptions = {}) {
    super(message, { ...options, code: 'PAGINATION_ERROR' });
  }
}

/** The auth circuit breaker is open; no request was sent. */
export class KaseyaVsaxAuthCircuitOpenError extends KaseyaVsaxError {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(
      'Authentication circuit breaker is open after repeated 401 responses; ' +
        'no request was sent. Check the token, then call resetAuthCircuit() or wait for the cooldown.',
      { code: 'AUTH_CIRCUIT_OPEN' },
    );
    this.retryAfterMs = retryAfterMs;
  }
}

/** The request exceeded `timeoutMs`. */
export class KaseyaVsaxTimeoutError extends KaseyaVsaxError {
  constructor(message: string, options: KaseyaVsaxErrorOptions = {}) {
    super(message, { ...options, code: 'TIMEOUT' });
  }
}

/** Transport-level failure (DNS, TLS, connection reset...). */
export class KaseyaVsaxNetworkError extends KaseyaVsaxError {
  constructor(message: string, options: KaseyaVsaxErrorOptions = {}) {
    super(message, { ...options, code: 'NETWORK_ERROR' });
  }
}
