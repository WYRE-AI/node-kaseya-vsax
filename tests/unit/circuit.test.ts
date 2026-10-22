import { describe, expect, it } from 'vitest';
import {
  KaseyaVsaxAuthCircuitOpenError,
  KaseyaVsaxAuthenticationError,
  KaseyaVsaxForbiddenError,
} from '../../src/index.js';
import { createAuthCircuitStore, type AuthCircuitState } from '../../src/index.js';
import { createHash } from 'node:crypto';
import { makeClient, newFetch, ok, res, TOKEN_ID, TOKEN_SECRET } from '../helpers.js';

describe('auth circuit breaker', () => {
  it('trips after 2 consecutive 401s and blocks further calls without fetching', async () => {
    const f = newFetch().mockImplementation(() => Promise.resolve(res(401, { Message: 'bad token' })));
    const { client, sleep } = makeClient(f);
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthenticationError);
    expect(client.authCircuitOpen).toBe(false);
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthenticationError);
    expect(client.authCircuitOpen).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);

    for (let i = 0; i < 5; i++) {
      await expect(client.devices.get('x')).rejects.toBeInstanceOf(KaseyaVsaxAuthCircuitOpenError);
    }
    expect(f).toHaveBeenCalledTimes(2); // no new fetches
    expect(sleep).not.toHaveBeenCalled(); // 401 never retried
  });

  it('403 never trips the circuit, is never retried, and later calls still hit fetch', async () => {
    const f = newFetch().mockImplementation(() => Promise.resolve(res(403, { Message: 'no access' })));
    const { client, sleep } = makeClient(f);
    await expect(client.devices.get('a')).rejects.toBeInstanceOf(KaseyaVsaxForbiddenError);
    await expect(client.sites.get(5)).rejects.toBeInstanceOf(KaseyaVsaxForbiddenError);
    expect(client.authCircuitOpen).toBe(false);
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxForbiddenError);
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('403 does not count toward the 401 threshold', async () => {
    const f = newFetch().mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(403)).mockResolvedValueOnce(res(401));
    const { client } = makeClient(f);
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthenticationError);
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxForbiddenError);
    expect(client.authCircuitOpen).toBe(false);
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthenticationError);
    expect(client.authCircuitOpen).toBe(true);
  });

  it('a success resets the counter', async () => {
    const f = newFetch()
      .mockResolvedValueOnce(res(401))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(res(401))
      .mockResolvedValueOnce(ok([]));
    const { client } = makeClient(f);
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthenticationError);
    await client.devices.list();
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthenticationError);
    await client.devices.list();
    expect(client.authCircuitOpen).toBe(false);
    expect(f).toHaveBeenCalledTimes(4);
  });

  it('resetAuthCircuit() closes the breaker', async () => {
    const f = newFetch().mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(401)).mockResolvedValue(ok([]));
    const { client } = makeClient(f);
    await client.devices.list().catch(() => undefined);
    await client.devices.list().catch(() => undefined);
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthCircuitOpenError);
    client.resetAuthCircuit();
    await expect(client.devices.list()).resolves.toEqual([]);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('closes after the cooldown elapses (injectable clock), then re-trips on one more failure', async () => {
    let now = 1_000_000;
    const f = newFetch().mockImplementation(() => Promise.resolve(res(401)));
    const { client } = makeClient(f, { now: () => now, authCooldownMs: 300_000 });
    await client.devices.list().catch(() => undefined);
    await client.devices.list().catch(() => undefined);

    now += 299_999;
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthCircuitOpenError);
    expect(f).toHaveBeenCalledTimes(2);

    now += 2;
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthenticationError);
    expect(f).toHaveBeenCalledTimes(3);
    // half-open probe failed -> tripped again immediately
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthCircuitOpenError);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('honors a custom threshold', async () => {
    const f = newFetch().mockImplementation(() => Promise.resolve(res(401)));
    const { client } = makeClient(f, { authFailureThreshold: 3 });
    for (let i = 0; i < 3; i++) await client.devices.list().catch(() => undefined);
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthCircuitOpenError);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('is per client instance', async () => {
    const f = newFetch().mockImplementation(() => Promise.resolve(res(401)));
    const { client: a } = makeClient(f);
    const g = newFetch().mockResolvedValue(ok([]));
    const { client: b } = makeClient(g);
    await a.devices.list().catch(() => undefined);
    await a.devices.list().catch(() => undefined);
    await expect(b.devices.list()).resolves.toEqual([]);
  });

  it('circuit-open error carries no secrets and has no status', async () => {
    const f = newFetch().mockImplementation(() => Promise.resolve(res(401)));
    const { client } = makeClient(f);
    await client.devices.list().catch(() => undefined);
    await client.devices.list().catch(() => undefined);
    const err = (await client.devices.list().catch((e: unknown) => e)) as KaseyaVsaxAuthCircuitOpenError;
    expect(err.code).toBe('AUTH_CIRCUIT_OPEN');
    expect(err.retryAfterMs).toBeGreaterThan(0);
  });

  describe('shared store', () => {
    const fail = (): ReturnType<typeof newFetch> =>
      newFetch().mockImplementation(() => Promise.resolve(res(401)));

    it('a second client with the same host+tokenId sees the open circuit without fetching', async () => {
      const store = createAuthCircuitStore();
      const f1 = fail();
      const { client: a } = makeClient(f1, { authCircuitStore: store });
      await a.devices.list().catch(() => undefined);
      await a.devices.list().catch(() => undefined);
      const f2 = newFetch().mockResolvedValue(ok([]));
      const { client: b } = makeClient(f2, { authCircuitStore: store });
      expect(b.authCircuitOpen).toBe(true);
      const err = (await b.devices.list().catch((e: unknown) => e)) as KaseyaVsaxAuthCircuitOpenError;
      expect(err).toBeInstanceOf(KaseyaVsaxAuthCircuitOpenError);
      expect(err.retryAfterMs).toBeGreaterThan(0);
      expect(f2).not.toHaveBeenCalled();
      a.resetAuthCircuit();
      expect(b.authCircuitOpen).toBe(false);
    });

    it('a different tokenId is independent', async () => {
      const store = createAuthCircuitStore();
      const { client: a } = makeClient(fail(), { authCircuitStore: store });
      await a.devices.list().catch(() => undefined);
      await a.devices.list().catch(() => undefined);
      const f2 = newFetch().mockResolvedValue(ok([]));
      const { client: b } = makeClient(f2, { authCircuitStore: store, tokenId: 'other-token' });
      await expect(b.devices.list()).resolves.toEqual([]);
    });

    it('keys are host:sha256(tokenId) and never contain the token id or secret', async () => {
      const keys: string[] = [];
      const inner = createAuthCircuitStore();
      const store = {
        get: (k: string): AuthCircuitState | undefined => (keys.push(k), inner.get(k)),
        set: (k: string, v: AuthCircuitState): void => (keys.push(k), inner.set(k, v)),
        delete: (k: string): void => (keys.push(k), inner.delete(k)),
      };
      const { client } = makeClient(fail(), { authCircuitStore: store });
      await client.devices.list().catch(() => undefined);
      expect(keys.length).toBeGreaterThan(0);
      const expected = `acme.vsax.net:${createHash('sha256').update(TOKEN_ID).digest('hex')}`;
      for (const k of keys) {
        expect(k).toBe(expected);
        expect(k).not.toContain(TOKEN_ID);
        expect(k).not.toContain(TOKEN_SECRET);
      }
    });

    it('evicts the oldest entries beyond 10k', () => {
      const store = createAuthCircuitStore();
      for (let i = 0; i <= 10_000; i++) store.set(`k${i}`, { failures: 1 });
      expect(store.get('k0')).toBeUndefined();
      expect(store.get('k1')).toEqual({ failures: 1 });
      expect(store.get('k10000')).toEqual({ failures: 1 });
    });
  });
});
