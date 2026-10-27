import { describe, expect, it } from 'vitest';
import {
  KaseyaVsaxAuthCircuitOpenError,
  KaseyaVsaxAuthenticationError,
  KaseyaVsaxError,
  KaseyaVsaxForbiddenError,
  KaseyaVsaxTimeoutError,
  type KaseyaVsaxClient,
  type KaseyaVsaxConfig,
} from '../../src/index.js';
import { createAuthCircuitStore, type AuthCircuitState } from '../../src/index.js';
import { createHash } from 'node:crypto';
import { assertClean, makeClient, newFetch, ok, res, TOKEN_ID, TOKEN_SECRET, type FetchMock } from '../helpers.js';

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
    expect(err.status).toBeUndefined();
    assertClean(err);
  });

  describe('half-open single probe', () => {
    const COOLDOWN = 300_000;
    const setup = async (
      overrides: Partial<KaseyaVsaxConfig> = {},
    ): Promise<{ f: FetchMock; client: KaseyaVsaxClient; advance: (ms: number) => void }> => {
      let now = 1_000_000;
      const f = newFetch().mockImplementation(() => Promise.resolve(res(401)));
      const { client } = makeClient(f, { now: () => now, authCooldownMs: COOLDOWN, ...overrides });
      await client.devices.list().catch(() => undefined);
      await client.devices.list().catch(() => undefined);
      expect(f).toHaveBeenCalledTimes(2);
      return { f, client, advance: (ms: number): void => void (now += ms) };
    };

    it('admits only one of two concurrent calls after the cooldown', async () => {
      const { f, client, advance } = await setup();
      advance(COOLDOWN + 1);
      f.mockImplementation(() => Promise.resolve(ok([])));
      const [a, b] = await Promise.allSettled([client.devices.list(), client.devices.list()]);
      expect(f).toHaveBeenCalledTimes(3);
      expect(a.status).toBe('fulfilled');
      expect(b.status).toBe('rejected');
      const reason = (b as PromiseRejectedResult).reason as KaseyaVsaxAuthCircuitOpenError;
      expect(reason).toBeInstanceOf(KaseyaVsaxAuthCircuitOpenError);
      expect(reason.retryAfterMs).toBeGreaterThan(0);
    });

    it('reports open while a probe is live and does not claim it itself', async () => {
      const { f, client, advance } = await setup();
      advance(COOLDOWN + 1);
      expect(client.authCircuitOpen).toBe(false);
      expect(client.authCircuitOpen).toBe(false);
      f.mockImplementation(() => new Promise<Response>(() => undefined));
      void client.devices.list().catch(() => undefined);
      await Promise.resolve();
      expect(client.authCircuitOpen).toBe(true);
    });

    it('a 401 probe re-trips the circuit', async () => {
      const { f, client, advance } = await setup();
      advance(COOLDOWN + 1);
      await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthenticationError);
      expect(f).toHaveBeenCalledTimes(3);
      expect(client.authCircuitOpen).toBe(true);
      await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthCircuitOpenError);
      expect(f).toHaveBeenCalledTimes(3);
      advance(COOLDOWN + 1);
      await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthenticationError);
      expect(f).toHaveBeenCalledTimes(4);
    });

    it.each([
      ['500', (): Promise<Response> => Promise.resolve(res(500))],
      ['network error', (): Promise<Response> => Promise.reject(new Error('boom'))],
    ])('a %s probe is released so the next caller can probe', async (_name, impl) => {
      const { f, client, advance } = await setup();
      advance(COOLDOWN + 1);
      f.mockImplementationOnce(impl);
      await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxError);
      expect(client.authCircuitOpen).toBe(false);
      f.mockImplementation(() => Promise.resolve(ok([])));
      await expect(client.devices.list()).resolves.toEqual([]);
      expect(f).toHaveBeenCalledTimes(4);
      // closed fully after the successful probe
      await expect(client.devices.list()).resolves.toEqual([]);
    });

    it('a timed-out probe is released', async () => {
      const { f, client, advance } = await setup({ timeoutMs: 10 });
      advance(COOLDOWN + 1);
      f.mockImplementationOnce(
        (_url, init) =>
          new Promise<Response>((_resolve, reject): void => {
            init?.signal?.addEventListener('abort', (): void => reject(new DOMException('aborted', 'AbortError')));
          }),
      );
      await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxTimeoutError);
      f.mockImplementation(() => Promise.resolve(ok([])));
      await expect(client.devices.list()).resolves.toEqual([]);
    });

    it('the probe holder is not blocked by its own probe when retrying', async () => {
      const { f, client, advance } = await setup();
      advance(COOLDOWN + 1);
      f.mockResolvedValueOnce(res(503)).mockResolvedValueOnce(ok([]));
      await expect(client.devices.list()).resolves.toEqual([]);
      expect(f).toHaveBeenCalledTimes(4);
    });

    it('a 2xx probe fully closes the circuit with threshold 1 (no probe per later call)', async () => {
      let now = 1_000_000;
      const f = newFetch().mockImplementation(() => Promise.resolve(res(401)));
      const { client } = makeClient(f, { now: () => now, authCooldownMs: COOLDOWN, authFailureThreshold: 1 });
      await client.devices.list().catch(() => undefined);
      expect(client.authCircuitOpen).toBe(true);
      now += COOLDOWN + 1;
      f.mockImplementation(() => Promise.resolve(ok([])));
      await client.devices.list();
      const results = await Promise.allSettled([client.devices.list(), client.devices.list()]);
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(f).toHaveBeenCalledTimes(4);
    });

    it('the probe holder renews its lease across a retry backoff', async () => {
      let advanceRef: (ms: number) => void = () => undefined;
      let rival: Promise<unknown> | undefined;
      const { f, client, advance } = await setup({
        timeoutMs: 1000,
        sleep: async (): Promise<void> => {
          advanceRef(2200); // past the original 2s lease (timeoutMs + 1s), inside the renewed 2.5s one (500ms backoff)
          rival = client.devices.list().then(
            () => 'admitted',
            (e: unknown) => e,
          );
          await rival;
        },
      });
      advanceRef = advance;
      advance(COOLDOWN + 1);
      f.mockResolvedValueOnce(res(503)).mockResolvedValueOnce(ok([]));
      await expect(client.devices.list()).resolves.toEqual([]);
      expect(await rival).toBeInstanceOf(KaseyaVsaxAuthCircuitOpenError);
      expect(f).toHaveBeenCalledTimes(4);
    });

    it('a 2xx probe closes the circuit', async () => {
      const { f, client, advance } = await setup();
      advance(COOLDOWN + 1);
      f.mockImplementation(() => Promise.resolve(ok([])));
      await client.devices.list();
      expect(client.authCircuitOpen).toBe(false);
      await Promise.all([client.devices.list(), client.devices.list()]);
      expect(f).toHaveBeenCalledTimes(5);
    });

    it('an expired probe lease lets a new probe in', async () => {
      const { f, client, advance } = await setup({ timeoutMs: 1000 });
      advance(COOLDOWN + 1);
      f.mockImplementationOnce(() => new Promise<Response>(() => undefined)); // crashed probe, never settles
      void client.devices.list().catch(() => undefined);
      await Promise.resolve();
      await expect(client.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthCircuitOpenError);
      advance(2001); // timeoutMs + 1s margin
      f.mockImplementation(() => Promise.resolve(ok([])));
      await expect(client.devices.list()).resolves.toEqual([]);
    });

    it('resetAuthCircuit() clears a live probe', async () => {
      const { f, client, advance } = await setup();
      advance(COOLDOWN + 1);
      f.mockImplementationOnce(() => new Promise<Response>(() => undefined));
      void client.devices.list().catch(() => undefined);
      await Promise.resolve();
      client.resetAuthCircuit();
      f.mockImplementation(() => Promise.resolve(ok([])));
      await expect(client.devices.list()).resolves.toEqual([]);
    });

    it('works across two clients sharing a store', async () => {
      const store = createAuthCircuitStore();
      const { f, client: a, advance } = await setup({ authCircuitStore: store });
      advance(COOLDOWN + 1);
      const g = newFetch().mockResolvedValue(ok([]));
      let release: (r: Response) => void = () => undefined;
      f.mockImplementationOnce(() => new Promise<Response>((r): void => void (release = r)));
      const { client: b } = makeClient(g, { now: () => 1_000_000 + COOLDOWN + 1, authCooldownMs: COOLDOWN, authCircuitStore: store });
      const probe = a.devices.list();
      await Promise.resolve();
      await expect(b.devices.list()).rejects.toBeInstanceOf(KaseyaVsaxAuthCircuitOpenError);
      expect(g).not.toHaveBeenCalled();
      release(res(500));
      await expect(probe).rejects.toBeInstanceOf(KaseyaVsaxError);
      await expect(b.devices.list()).resolves.toEqual([]);
      expect(g).toHaveBeenCalledTimes(1);
    });
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
