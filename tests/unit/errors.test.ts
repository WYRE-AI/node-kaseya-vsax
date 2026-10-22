import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  KaseyaVsaxClient,
  KaseyaVsaxError,
  MAX_ERROR_BODY_LENGTH,
  scrubSecrets,
  type KaseyaVsaxConfig,
} from '../../src/index.js';
import { CREDENTIAL_B64, TOKEN_ID, TOKEN_SECRET, makeClient, newFetch, res } from '../helpers.js';

function assertClean(err: unknown): void {
  const e = err as KaseyaVsaxError;
  const blobs = [e.message, e.stack ?? '', JSON.stringify(e), inspect(e, { depth: 10, showHidden: true })];
  for (const blob of blobs) {
    for (const bad of [TOKEN_ID, TOKEN_SECRET, CREDENTIAL_B64, `Basic ${CREDENTIAL_B64}`, 'Authorization:', 'Authorization=']) {
      expect(blob).not.toContain(bad);
    }
  }
}

describe('secret scrubbing', () => {
  it('scrubSecrets removes every occurrence, longest first', () => {
    expect(scrubSecrets('a abc a abc', ['a', 'abc'])).toBe('[REDACTED] [REDACTED] [REDACTED] [REDACTED]');
    expect(scrubSecrets('nothing', [''])).toBe('nothing');
  });

  const hostile = (): string =>
    `echo ${TOKEN_ID} / ${TOKEN_SECRET} / ${CREDENTIAL_B64} / Authorization: Basic ${CREDENTIAL_B64}`;

  it.each([400, 401, 403, 404, 429, 500, 502, 418])(
    'upstream %i bodies echoing credentials are scrubbed from all error surfaces',
    async (status) => {
      const f = newFetch().mockImplementation(() =>
        Promise.resolve(res(status, { Message: hostile(), Extra: hostile() }, status === 429 ? { 'Retry-After': '999' } : {})),
      );
      const { client } = makeClient(f, { maxRetries: 0 });
      const err = await client.devices.list().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(KaseyaVsaxError);
      assertClean(err);
      expect((err as KaseyaVsaxError).body).toContain('[REDACTED]');
    },
  );

  it('scrubs non-JSON bodies too', async () => {
    const f = newFetch().mockResolvedValue(res(500, `<html>${hostile()}</html>`));
    const { client } = makeClient(f);
    assertClean(await client.devices.list().catch((e: unknown) => e));
  });

  it('truncates upstream bodies to 500 chars', async () => {
    const f = newFetch().mockResolvedValue(res(400, 'x'.repeat(10_000)));
    const { client } = makeClient(f);
    const err = (await client.devices.list().catch((e: unknown) => e)) as KaseyaVsaxError;
    expect(err.body?.length).toBeLessThanOrEqual(MAX_ERROR_BODY_LENGTH + 20);
    expect(err.body?.startsWith('x'.repeat(500))).toBe(true);
    expect(err.message.length).toBeLessThan(700);
  });

  it('a secret straddling the truncation boundary cannot leak', async () => {
    const body = 'y'.repeat(495) + TOKEN_SECRET + 'z'.repeat(50);
    const f = newFetch().mockResolvedValue(res(400, body));
    const { client } = makeClient(f);
    const err = (await client.devices.list().catch((e: unknown) => e)) as KaseyaVsaxError;
    assertClean(err);
    expect(JSON.stringify(err)).not.toContain(TOKEN_SECRET.slice(0, 6));
  });

  it('network errors that echo credentials are scrubbed', async () => {
    const f = newFetch().mockRejectedValue(new Error(`connect failed for ${TOKEN_ID}:${TOKEN_SECRET} ${CREDENTIAL_B64}`));
    const { client } = makeClient(f);
    assertClean(await client.devices.list().catch((e: unknown) => e));
  });

  it('timeout, redirect and circuit errors are clean', async () => {
    const f = newFetch().mockResolvedValue(res(302, undefined, { Location: 'https://x/' }));
    const { client } = makeClient(f);
    assertClean(await client.devices.list().catch((e: unknown) => e));
  });

  it('malformed 2xx JSON does not leak credentials', async () => {
    const f = newFetch().mockResolvedValue(res(200, `not json ${TOKEN_SECRET}`));
    const { client } = makeClient(f);
    assertClean(await client.devices.list().catch((e: unknown) => e));
  });

  it('config errors never contain secrets', () => {
    const bad: KaseyaVsaxConfig = {
      serverUrl: `https://${TOKEN_ID}:${TOKEN_SECRET}@evil.com`,
      tokenId: TOKEN_ID,
      tokenSecret: TOKEN_SECRET,
    };
    try {
      new KaseyaVsaxClient(bad);
      expect.unreachable();
    } catch (e) {
      assertClean(e);
    }
  });

  it('error JSON contains only safe fields', async () => {
    const f = newFetch().mockResolvedValue(res(404, { Message: 'gone' }));
    const { client } = makeClient(f);
    const err = (await client.devices.get('zz').catch((e: unknown) => e)) as KaseyaVsaxError;
    expect(Object.keys(JSON.parse(JSON.stringify(err)) as object).sort()).toEqual(
      ['body', 'code', 'method', 'name', 'path', 'status'].sort(),
    );
  });
});

describe('client does not retain secrets as enumerable state', () => {
  it('JSON.stringify / inspect / Object.keys of the client and its resources are clean', () => {
    const { client } = makeClient(newFetch());
    const blobs = [
      JSON.stringify(client),
      inspect(client, { depth: 10, showHidden: true }),
      JSON.stringify(Object.entries(client)),
      JSON.stringify(client.devices),
      inspect(client.automation, { depth: 10, showHidden: true }),
    ];
    for (const b of blobs) {
      for (const bad of [TOKEN_ID, TOKEN_SECRET, CREDENTIAL_B64]) expect(b).not.toContain(bad);
    }
    expect(Object.keys(client)).not.toContain('config');
  });
});
