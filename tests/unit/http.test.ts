import { describe, expect, it, vi } from 'vitest';
import {
  KaseyaVsaxAuthenticationError,
  KaseyaVsaxForbiddenError,
  KaseyaVsaxNetworkError,
  KaseyaVsaxNotFoundError,
  KaseyaVsaxRateLimitError,
  KaseyaVsaxRedirectError,
  KaseyaVsaxServerError,
  KaseyaVsaxTimeoutError,
  KaseyaVsaxValidationError,
} from '../../src/index.js';
import { BASE, CREDENTIAL_B64, TOKEN_ID, TOKEN_SECRET, call, makeClient, newFetch, ok, res } from '../helpers.js';

describe('request basics', () => {
  it('sends a correct Basic header, JSON headers and redirect: manual', async () => {
    const f = newFetch().mockResolvedValue(ok({ Identifier: 'x' }));
    const { client } = makeClient(f);
    await client.devices.get('x');
    const { url, init } = call(f);
    const headers = init.headers as Record<string, string>;
    expect(url).toBe(`${BASE}/devices/x`);
    expect(headers['Authorization']).toBe(`Basic ${CREDENTIAL_B64}`);
    expect(Buffer.from(CREDENTIAL_B64, 'base64').toString()).toBe(`${TOKEN_ID}:${TOKEN_SECRET}`);
    expect(headers['Accept']).toBe('application/json');
    expect(init.redirect).toBe('manual');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('unwraps the Data envelope', async () => {
    const f = newFetch().mockResolvedValue(ok({ Identifier: 'abc', Name: 'PC' }));
    const { client } = makeClient(f);
    await expect(client.devices.get('abc')).resolves.toEqual({ Identifier: 'abc', Name: 'PC' });
  });

  it('returns undefined for empty 2xx bodies and raw JSON when no envelope', async () => {
    const f = newFetch().mockResolvedValueOnce(res(204)).mockResolvedValueOnce(res(200, { a: 1 }));
    const { client } = makeClient(f);
    await expect(client.notifications.delete(1)).resolves.toBeUndefined();
    await expect(client.environment.get()).resolves.toEqual({ a: 1 });
  });

  it('sends JSON bodies with Content-Type', async () => {
    const f = newFetch().mockResolvedValue(ok({ NotificationId: 1 }));
    const { client } = makeClient(f);
    await client.notifications.notify({ InstanceId: 'i', Title: 't' });
    const { init } = call(f);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ InstanceId: 'i', Title: 't' }));
  });

  it('parses X-RateLimit-* headers into lastRateLimit', async () => {
    const f = newFetch().mockResolvedValue(
      res(200, { Data: [], Meta: {} }, {
        'X-RateLimit-Limit': '3600',
        'X-RateLimit-Remaining': '3599',
        'X-RateLimit-Reset': '120',
      }),
    );
    const { client } = makeClient(f);
    expect(client.lastRateLimit).toBeUndefined();
    await client.devices.list();
    expect(client.lastRateLimit).toMatchObject({ limit: 3600, remaining: 3599, resetSeconds: 120 });
  });
});

describe('path parameters', () => {
  it('encodes path params', async () => {
    const f = newFetch().mockResolvedValue(ok({}));
    const { client } = makeClient(f);
    await client.devices.get('a b?c#d%e');
    expect(call(f).url).toBe(`${BASE}/devices/a%20b%3Fc%23d%25e`);
  });

  it.each(['', '.', '..', 'a/b', '../x', 'a\\b', '/'])('rejects %j without calling fetch', async (id) => {
    const f = newFetch();
    const { client } = makeClient(f);
    await expect(client.devices.get(id)).rejects.toBeInstanceOf(KaseyaVsaxValidationError);
    expect(f).not.toHaveBeenCalled();
  });

  it('rejects non-finite numeric ids', async () => {
    const f = newFetch();
    const { client } = makeClient(f);
    await expect(client.organizations.get(Number.NaN)).rejects.toBeInstanceOf(KaseyaVsaxValidationError);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('redirects', () => {
  it.each([301, 302, 303, 307, 308, 304])('refuses %i and calls fetch once', async (status) => {
    const f = newFetch().mockResolvedValue(res(status, undefined, { Location: 'https://evil.example/' }));
    const { client } = makeClient(f);
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxRedirectError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('refuses opaqueredirect responses', async () => {
    const f = newFetch().mockResolvedValue({
      type: 'opaqueredirect',
      status: 0,
      headers: new Headers(),
      text: () => Promise.resolve(''),
    } as unknown as Response);
    const { client } = makeClient(f);
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxRedirectError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('refuses status 0 responses', async () => {
    const f = newFetch().mockResolvedValue({
      type: 'basic',
      status: 0,
      headers: new Headers(),
      text: () => Promise.resolve(''),
    } as unknown as Response);
    const { client } = makeClient(f);
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxRedirectError);
  });

  it('does not leak the Location target into the error', async () => {
    const f = newFetch().mockResolvedValue(res(302, undefined, { Location: 'https://evil.example/steal' }));
    const { client } = makeClient(f);
    const err = await client.devices.list().catch((e: unknown) => e as Error);
    expect(JSON.stringify(err)).not.toContain('evil.example');
    expect(err.message).not.toContain('evil.example');
  });
});

describe('timeout and network errors', () => {
  it('throws KaseyaVsaxTimeoutError when the request exceeds timeoutMs', async () => {
    const f = newFetch().mockImplementation(
      (_u, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const { client } = makeClient(f, { timeoutMs: 20 });
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxTimeoutError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('wraps transport failures in NetworkError without retrying', async () => {
    const f = newFetch().mockRejectedValue(new TypeError('fetch failed'));
    const { client } = makeClient(f);
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxNetworkError);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('error mapping and retry policy', () => {
  it.each([
    [400, KaseyaVsaxValidationError],
    [401, KaseyaVsaxAuthenticationError],
    [403, KaseyaVsaxForbiddenError],
    [404, KaseyaVsaxNotFoundError],
    [500, KaseyaVsaxServerError],
  ])('%i is not retried and maps to the right class', async (status, cls) => {
    const f = newFetch().mockImplementation(() => Promise.resolve(res(status, { Message: 'nope' })));
    const { client, sleep } = makeClient(f);
    const err = await client.devices.list({ top: 5 }).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(cls);
    expect((err as KaseyaVsaxServerError).status).toBe(status);
    expect(f).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('error path excludes the query string and exposes method', async () => {
    const f = newFetch().mockResolvedValue(res(400, { Message: 'bad' }));
    const { client } = makeClient(f);
    const err = (await client.devices.list({ filter: "Name eq 'x'", top: 5 }).catch((e: unknown) => e)) as KaseyaVsaxValidationError;
    expect(err.path).toBe('/devices');
    expect(err.method).toBe('GET');
    expect(err.message).toContain('bad');
  });

  it('retries 503 with exponential backoff then succeeds', async () => {
    const f = newFetch()
      .mockResolvedValueOnce(res(503))
      .mockResolvedValueOnce(res(502))
      .mockResolvedValueOnce(ok([]));
    const { client, sleep } = makeClient(f); // random() === 1 -> full backoff
    await expect(client.devices.list()).resolves.toEqual([]);
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([500, 1000]);
  });

  it.each([502, 503, 504])('gives up on %i after maxRetries', async (status) => {
    const f = newFetch().mockImplementation(() => Promise.resolve(res(status)));
    const { client } = makeClient(f, { maxRetries: 2 });
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxServerError);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('maxRetries: 0 disables retries', async () => {
    const f = newFetch().mockImplementation(() => Promise.resolve(res(503)));
    const { client } = makeClient(f, { maxRetries: 0 });
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxServerError);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('429 handling', () => {
  it('honors Retry-After seconds and retries', async () => {
    const f = newFetch().mockResolvedValueOnce(res(429, undefined, { 'Retry-After': '7' })).mockResolvedValueOnce(ok([]));
    const { client, sleep } = makeClient(f);
    await client.devices.list();
    expect(sleep).toHaveBeenCalledWith(7000);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('honors an HTTP-date Retry-After', async () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    const f = newFetch()
      .mockResolvedValueOnce(res(429, undefined, { 'Retry-After': new Date(now + 12_000).toUTCString() }))
      .mockResolvedValueOnce(ok([]));
    const { client, sleep } = makeClient(f, { now: () => now });
    await client.devices.list();
    expect(sleep).toHaveBeenCalledWith(12_000);
  });

  it('throws RateLimitError instead of sleeping when Retry-After exceeds the cap', async () => {
    const f = newFetch().mockResolvedValue(res(429, undefined, { 'Retry-After': '3600' }));
    const { client, sleep } = makeClient(f);
    const err = (await client.devices.list().catch((e: unknown) => e)) as KaseyaVsaxRateLimitError;
    expect(err).toBeInstanceOf(KaseyaVsaxRateLimitError);
    expect(err.retryAfterSeconds).toBe(3600);
    expect(err.status).toBe(429);
    expect(sleep).not.toHaveBeenCalled();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('respects a custom maxRetryAfterSeconds', async () => {
    const f = newFetch().mockResolvedValue(res(429, undefined, { 'Retry-After': '10' }));
    const { client, sleep } = makeClient(f, { maxRetryAfterSeconds: 5 });
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxRateLimitError);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('stops after maxRetries and reports retryAfterSeconds', async () => {
    const f = newFetch().mockImplementation(() => Promise.resolve(res(429, undefined, { 'Retry-After': '1' })));
    const { client, sleep } = makeClient(f, { maxRetries: 2 });
    const err = (await client.devices.list().catch((e: unknown) => e)) as KaseyaVsaxRateLimitError;
    expect(err).toBeInstanceOf(KaseyaVsaxRateLimitError);
    expect(err.retryAfterSeconds).toBe(1);
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('falls back to backoff when Retry-After is absent or invalid, and never sleeps 0', async () => {
    const f = newFetch()
      .mockResolvedValueOnce(res(429))
      .mockResolvedValueOnce(res(429, undefined, { 'Retry-After': 'garbage' }))
      .mockResolvedValueOnce(ok([]));
    const { client, sleep } = makeClient(f);
    await client.devices.list();
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([500, 1000]);

    const g = newFetch().mockResolvedValueOnce(res(429, undefined, { 'Retry-After': '0' })).mockResolvedValueOnce(ok([]));
    const { client: c2, sleep: s2 } = makeClient(g);
    await c2.devices.list();
    expect(s2).toHaveBeenCalledWith(1000);
  });

  it('applies jitter via the injected random', async () => {
    const f = newFetch().mockResolvedValueOnce(res(503)).mockResolvedValueOnce(ok([]));
    const { client, sleep } = makeClient(f, { random: () => 0 });
    await client.devices.list();
    expect(sleep).toHaveBeenCalledWith(250);
  });
});

describe('uses fetch exactly as injected', () => {
  it('does not touch global fetch', async () => {
    const globalSpy = vi.spyOn(globalThis, 'fetch');
    const f = newFetch().mockResolvedValue(ok([]));
    const { client } = makeClient(f);
    await client.devices.list();
    expect(globalSpy).not.toHaveBeenCalled();
  });
});
