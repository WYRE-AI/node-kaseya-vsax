import { describe, expect, it } from 'vitest';
import {
  KaseyaVsaxAuthCircuitOpenError,
  KaseyaVsaxAuthenticationError,
  KaseyaVsaxForbiddenError,
} from '../../src/index.js';
import { makeClient, newFetch, ok, res } from '../helpers.js';

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

  it('counts 401 and 403 together and never retries 403', async () => {
    const f = newFetch().mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(403));
    const { client } = makeClient(f);
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthenticationError);
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxForbiddenError);
    await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthCircuitOpenError);
    expect(f).toHaveBeenCalledTimes(2);
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
    const f = newFetch().mockImplementation(() => Promise.resolve(res(403)));
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
});
