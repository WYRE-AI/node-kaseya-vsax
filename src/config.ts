/**
 * Configuration, server URL normalization and host validation.
 *
 * The host check is the SDK's SSRF / credential-exfiltration guard: Basic
 * credentials are only ever sent to `<one-label>.vsax.net` (or a caller
 * supplied suffix) over HTTPS on port 443.
 */

import { KaseyaVsaxConfigError } from './errors.js';

export const DEFAULT_ALLOWED_HOST_SUFFIX = '.vsax.net';
export const API_PATH_PREFIX = '/api/v3';

const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface KaseyaVsaxConfig {
  /** Tenant host or URL, e.g. `acme.vsax.net` or `https://acme.vsax.net/api/v3`. */
  serverUrl: string;
  /** API token ID (Basic auth username). */
  tokenId: string;
  /** API token secret (Basic auth password). */
  tokenSecret: string;
  /** Per-request timeout in ms (default 30000). */
  timeoutMs?: number;
  /**
   * Max retries (default 2). 429 is retried for every method; 502/503/504 only for idempotent
   * methods (GET, HEAD, PUT, DELETE, OPTIONS). POST fails on the first 5xx.
   */
  maxRetries?: number;
  /** Injectable fetch (default global fetch). */
  fetch?: FetchLike;
  /** Injectable sleep, for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock (ms since epoch), for tests. */
  now?: () => number;
  /** Injectable RNG in [0,1) used for backoff jitter. */
  random?: () => number;
  /** Required host suffix (default `.vsax.net`). */
  allowedHostSuffix?: string;
  /** Largest Retry-After (seconds) the client will sleep for (default 60). */
  maxRetryAfterSeconds?: number;
  /** Consecutive 401/403 responses that trip the circuit breaker (default 2). */
  authFailureThreshold?: number;
  /** Circuit breaker cooldown in ms (default 300000). */
  authCooldownMs?: number;
  /** Maximum pages an iterator will fetch (default 1000). */
  maxPages?: number;
}

/** Fully-resolved, validated configuration. Holds secrets: never expose it. */
export interface ResolvedConfig {
  host: string;
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  timeoutMs: number;
  maxRetries: number;
  fetch: FetchLike;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  random: () => number;
  maxRetryAfterSeconds: number;
  authFailureThreshold: number;
  authCooldownMs: number;
  maxPages: number;
}

function normalizeSuffix(suffix: string): string {
  if (typeof suffix !== 'string') throw new KaseyaVsaxConfigError('allowedHostSuffix must be a string');
  const s = suffix.trim().toLowerCase();
  const dotted = s.startsWith('.') ? s : `.${s}`;
  const labels = dotted.slice(1).split('.');
  if (labels.length < 1 || !labels.every((l) => LABEL_RE.test(l))) {
    throw new KaseyaVsaxConfigError('allowedHostSuffix is not a valid domain suffix');
  }
  return dotted;
}

/**
 * Validate a bare hostname against the allowed suffix and return it lowercased.
 * Requires exactly one valid DNS label before the suffix.
 */
export function validateVsaxHost(host: string, allowedHostSuffix: string = DEFAULT_ALLOWED_HOST_SUFFIX): string {
  const suffix = normalizeSuffix(allowedHostSuffix);
  if (typeof host !== 'string' || host.length === 0) {
    throw new KaseyaVsaxConfigError('Server host must be a non-empty string');
  }
  if (host.includes(':') || host.startsWith('[')) {
    throw new KaseyaVsaxConfigError('Server host must not be an IPv6 literal or contain a port');
  }
  const lower = host.toLowerCase();
  if (lower.endsWith('.')) throw new KaseyaVsaxConfigError('Server host must not have a trailing dot');
  if (lower.split('.').some((l) => l.length === 0)) {
    throw new KaseyaVsaxConfigError('Server host contains an empty label');
  }
  if (IPV4_RE.test(lower) || /^[\d.]+$/.test(lower) || /^0x[0-9a-f]+$/.test(lower)) {
    throw new KaseyaVsaxConfigError('Server host must not be an IP address');
  }
  if (!lower.endsWith(suffix)) {
    throw new KaseyaVsaxConfigError(`Server host must be a single label under ${suffix}`);
  }
  const label = lower.slice(0, -suffix.length);
  if (!LABEL_RE.test(label)) {
    throw new KaseyaVsaxConfigError(`Server host must be exactly one valid DNS label under ${suffix}`);
  }
  return lower;
}

/**
 * Normalize a user-supplied server URL to `https://<host>/api/v3`.
 * Error messages never echo the input (it may contain credentials).
 */
export function normalizeServerUrl(
  serverUrl: string,
  allowedHostSuffix: string = DEFAULT_ALLOWED_HOST_SUFFIX,
): string {
  return `https://${parseServerUrl(serverUrl, allowedHostSuffix)}${API_PATH_PREFIX}`;
}

function parseServerUrl(serverUrl: string, allowedHostSuffix: string): string {
  if (typeof serverUrl !== 'string' || serverUrl.trim().length === 0) {
    throw new KaseyaVsaxConfigError('serverUrl is required');
  }
  const input = serverUrl.trim();
  if (/[^\x21-\x5b\x5d-\x7e]/.test(input)) {
    throw new KaseyaVsaxConfigError('serverUrl contains whitespace, control characters, backslashes or non-ASCII characters');
  }
  let rest = input;
  const schemeIdx = input.indexOf('://');
  if (schemeIdx !== -1) {
    if (input.slice(0, schemeIdx).toLowerCase() !== 'https') {
      throw new KaseyaVsaxConfigError('serverUrl must use https');
    }
    rest = input.slice(schemeIdx + 3);
  }
  // A scheme without "//" (e.g. "http:host", "javascript:x") falls through and
  // is rejected below because the authority would contain ':' + non-numeric.
  const end = rest.search(/[/?#]/);
  const authority = end === -1 ? rest : rest.slice(0, end);
  const tail = end === -1 ? '' : rest.slice(end);

  if (authority.includes('@')) throw new KaseyaVsaxConfigError('serverUrl must not contain userinfo');
  if (tail.includes('?') || tail.includes('#')) {
    throw new KaseyaVsaxConfigError('serverUrl must not contain a query string or fragment');
  }
  if (tail !== '' && tail !== '/' && tail !== API_PATH_PREFIX && tail !== `${API_PATH_PREFIX}/`) {
    throw new KaseyaVsaxConfigError(`serverUrl path must be empty or ${API_PATH_PREFIX}`);
  }
  if (authority.startsWith('[')) throw new KaseyaVsaxConfigError('serverUrl must not be an IPv6 literal');

  let hostname = authority;
  const colon = authority.indexOf(':');
  if (colon !== -1) {
    const port = authority.slice(colon + 1);
    if (port !== '443') throw new KaseyaVsaxConfigError('serverUrl must not specify a port other than 443');
    hostname = authority.slice(0, colon);
  }
  return validateVsaxHost(hostname, allowedHostSuffix);
}

function requireCredential(value: unknown, name: string, forbidColon: boolean): string {
  if (typeof value !== 'string') throw new KaseyaVsaxConfigError(`${name} is required`);
  if (/[\r\n]/.test(value)) throw new KaseyaVsaxConfigError(`${name} must not contain CR or LF`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new KaseyaVsaxConfigError(`${name} is required`);
  if (forbidColon && trimmed.includes(':')) throw new KaseyaVsaxConfigError(`${name} must not contain ':'`);
  return trimmed;
}

function positiveInt(value: number | undefined, def: number, name: string, min = 1): number {
  if (value === undefined) return def;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < min) {
    throw new KaseyaVsaxConfigError(`${name} must be an integer >= ${min}`);
  }
  return value;
}

const defaultSleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Validate and resolve a user config. */
export function resolveConfig(config: KaseyaVsaxConfig): ResolvedConfig {
  if (typeof config !== 'object' || config === null) throw new KaseyaVsaxConfigError('config is required');
  const suffix = config.allowedHostSuffix ?? DEFAULT_ALLOWED_HOST_SUFFIX;
  const host = parseServerUrl(config.serverUrl, suffix);
  const tokenId = requireCredential(config.tokenId, 'tokenId', true);
  const tokenSecret = requireCredential(config.tokenSecret, 'tokenSecret', false);
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new KaseyaVsaxConfigError('No fetch implementation available');

  return {
    host,
    baseUrl: `https://${host}${API_PATH_PREFIX}`,
    tokenId,
    tokenSecret,
    timeoutMs: positiveInt(config.timeoutMs, 30_000, 'timeoutMs'),
    maxRetries: positiveInt(config.maxRetries, 2, 'maxRetries', 0),
    fetch: fetchImpl,
    sleep: config.sleep ?? defaultSleep,
    now: config.now ?? Date.now,
    random: config.random ?? Math.random,
    maxRetryAfterSeconds: positiveInt(config.maxRetryAfterSeconds, 60, 'maxRetryAfterSeconds', 0),
    authFailureThreshold: positiveInt(config.authFailureThreshold, 2, 'authFailureThreshold'),
    authCooldownMs: positiveInt(config.authCooldownMs, 300_000, 'authCooldownMs', 0),
    maxPages: positiveInt(config.maxPages, 1000, 'maxPages'),
  };
}
