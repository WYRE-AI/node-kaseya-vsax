import { inspect } from 'node:util';
import { expect, vi, type Mock } from 'vitest';
import { KaseyaVsaxClient, type KaseyaVsaxConfig, type KaseyaVsaxError } from '../src/index.js';

export const TOKEN_ID = 'tok-id-ABC123';
export const TOKEN_SECRET = 's3cr3t-XYZ789';
export const CREDENTIAL_B64 = Buffer.from(`${TOKEN_ID}:${TOKEN_SECRET}`).toString('base64');
export const BASE = 'https://acme.vsax.net/api/v3';

export function res(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  const text = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, { status, headers });
}

export function ok(data: unknown, meta: Record<string, unknown> = {}): Response {
  return res(200, { Data: data, Meta: { ResponseCode: 200, ...meta } });
}

export type FetchMock = Mock<(input: string, init?: RequestInit) => Promise<Response>>;

export function makeClient(
  fetchMock: FetchMock,
  overrides: Partial<KaseyaVsaxConfig> = {},
): { client: KaseyaVsaxClient; sleep: Mock<(ms: number) => Promise<void>> } {
  const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
  const client = new KaseyaVsaxClient({
    serverUrl: 'acme.vsax.net',
    tokenId: TOKEN_ID,
    tokenSecret: TOKEN_SECRET,
    fetch: fetchMock,
    sleep,
    random: (): number => 1,
    ...overrides,
  });
  return { client, sleep };
}

export function newFetch(): FetchMock {
  return vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();
}

/** URL and init of the nth fetch call. */
export function call(fetchMock: FetchMock, n = 0): { url: string; init: RequestInit } {
  const c = fetchMock.mock.calls[n];
  if (!c) throw new Error(`no fetch call #${n}`);
  return { url: c[0], init: c[1] ?? {} };
}

/** Assert an error exposes no credential material on any surface (message, stack, JSON, inspect). */
export function assertClean(err: unknown): void {
  const e = err as KaseyaVsaxError;
  const blobs = [e.message, e.stack ?? '', JSON.stringify(e), inspect(e, { depth: 10, showHidden: true })];
  for (const blob of blobs) {
    for (const bad of [TOKEN_ID, TOKEN_SECRET, CREDENTIAL_B64, `Basic ${CREDENTIAL_B64}`, 'Authorization:', 'Authorization=']) {
      expect(blob).not.toContain(bad);
    }
  }
}
