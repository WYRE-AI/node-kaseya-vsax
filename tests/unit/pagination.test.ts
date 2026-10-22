import { describe, expect, it } from 'vitest';
import { KaseyaVsaxPaginationError } from '../../src/index.js';
import { BASE, call, makeClient, newFetch, ok } from '../helpers.js';

const items = (n: number, start = 0): Array<{ Identifier: string }> =>
  Array.from({ length: n }, (_v, i) => ({ Identifier: `d${start + i}` }));

describe('$top/$skip paging', () => {
  it('pages until a short page', async () => {
    const f = newFetch()
      .mockResolvedValueOnce(ok(items(3, 0)))
      .mockResolvedValueOnce(ok(items(3, 3)))
      .mockResolvedValueOnce(ok(items(1, 6)));
    const { client } = makeClient(f);
    const all = await client.devices.listAll({ top: 3 }).toArray();
    expect(all).toHaveLength(7);
    expect(call(f, 0).url).toBe(`${BASE}/devices?$top=3&$skip=0`);
    expect(call(f, 1).url).toBe(`${BASE}/devices?$top=3&$skip=3`);
    expect(call(f, 2).url).toBe(`${BASE}/devices?$top=3&$skip=6`);
  });

  it('uses default page size 100, starts at given skip, and passes filter/orderby/extra params', async () => {
    const f = newFetch().mockResolvedValueOnce(ok([]));
    const { client } = makeClient(f);
    await client.devices.listAll({ skip: 200, filter: "Name eq 'a b'", orderby: 'Name desc', scopeId: 5 }).toArray();
    const url = call(f).url;
    expect(url).toContain('$top=100');
    expect(url).toContain('$skip=200');
    expect(url).toContain(`$filter=${encodeURIComponent("Name eq 'a b'")}`);
    expect(url).toContain(`$orderby=${encodeURIComponent('Name desc')}`);
    expect(url).toContain('scopeId=5');
  });

  it('supports for-await and stops after an exact-multiple empty final page', async () => {
    const f = newFetch().mockResolvedValueOnce(ok(items(2))).mockResolvedValueOnce(ok([]));
    const { client } = makeClient(f);
    const seen: string[] = [];
    for await (const d of client.devices.listAll({ top: 2 })) seen.push(d.Identifier);
    expect(seen).toEqual(['d0', 'd1']);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('enforces the max pages cap', async () => {
    const f = newFetch().mockImplementation(() => Promise.resolve(ok(items(2))));
    const { client } = makeClient(f, { maxPages: 3 });
    await expect(client.devices.listAll({ top: 2 }).toArray()).rejects.toBeInstanceOf(KaseyaVsaxPaginationError);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('rejects invalid top', async () => {
    const { client } = makeClient(newFetch());
    await expect(client.devices.listAll({ top: 0 }).toArray()).rejects.toBeInstanceOf(KaseyaVsaxPaginationError);
  });

  it('list() is a single page', async () => {
    const f = newFetch().mockResolvedValueOnce(ok(items(2)));
    const { client } = makeClient(f);
    expect(await client.devices.list({ top: 2, count: true })).toHaveLength(2);
    expect(call(f).url).toBe(`${BASE}/devices?$top=2&$count=true`);
  });
});

describe('NextQueryLink', () => {
  const link = (path = '/api/v3/devices?$skip=5000&$top=5000', host = 'acme.vsax.net', scheme = 'https'): string =>
    `${scheme}://${host}${path}`;

  it('follows a same-host https link and stops when the chain ends', async () => {
    const f = newFetch()
      .mockResolvedValueOnce(ok(items(2), { TotalCount: 6000, NextQueryLink: link() }))
      .mockResolvedValueOnce(ok(items(2, 2)));
    const { client } = makeClient(f);
    expect(await client.devices.listAll({ top: 2 }).toArray()).toHaveLength(4);
    expect(call(f, 1).url).toBe(link());
    expect((call(f, 1).init.headers as Record<string, string>)['Authorization']).toMatch(/^Basic /);
    expect(call(f, 1).init.redirect).toBe('manual');
  });

  it.each([
    ['cross-host', link('/api/v3/devices', 'evil.example')],
    ['suffix lookalike', link('/api/v3/devices', 'acme.vsax.net.evil.com')],
    ['subdomain', link('/api/v3/devices', 'a.acme.vsax.net')],
    ['other tenant', link('/api/v3/devices', 'other.vsax.net')],
    ['http', link('/api/v3/devices', 'acme.vsax.net', 'http')],
    ['userinfo', 'https://u:p@acme.vsax.net/api/v3/devices'],
    ['userinfo host trick', 'https://acme.vsax.net@evil.example/api/v3/devices'],
    ['explicit port', 'https://acme.vsax.net:8443/api/v3/devices'],
    ['wrong path', link('/other/devices')],
    ['path prefix lookalike', link('/api/v3x/devices')],
    ['traversal out of prefix', link('/api/v3/../admin')],
    ['relative', '/api/v3/devices?$skip=5'],
    ['protocol-relative', '//evil.example/api/v3/devices'],
    ['backslash host trick', 'https://evil.example\\@acme.vsax.net/api/v3/devices'],
    ['javascript', 'javascript:alert(1)'],
  ])('rejects %s without a second fetch', async (_n, bad) => {
    const f = newFetch().mockResolvedValueOnce(ok(items(2), { NextQueryLink: bad }));
    const { client } = makeClient(f);
    await expect(client.devices.listAll({ top: 2 }).toArray()).rejects.toBeInstanceOf(KaseyaVsaxPaginationError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('rejects non-string links', async () => {
    const f = newFetch().mockResolvedValueOnce(ok(items(2), { NextQueryLink: { a: 1 } }));
    const { client } = makeClient(f);
    await expect(client.devices.listAll({ top: 2 }).toArray()).rejects.toBeInstanceOf(KaseyaVsaxPaginationError);
  });

  it('detects a repeated NextQueryLink', async () => {
    const f = newFetch().mockImplementation(() => Promise.resolve(ok(items(2), { NextQueryLink: link() })));
    const { client } = makeClient(f);
    await expect(client.devices.listAll({ top: 2 }).toArray()).rejects.toThrow(/Repeated NextQueryLink/);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('detects a cycle between two links', async () => {
    const a = link('/api/v3/devices?p=a');
    const b = link('/api/v3/devices?p=b');
    const f = newFetch()
      .mockResolvedValueOnce(ok(items(1), { NextQueryLink: a }))
      .mockResolvedValueOnce(ok(items(1), { NextQueryLink: b }))
      .mockResolvedValueOnce(ok(items(1), { NextQueryLink: a }));
    const { client } = makeClient(f);
    await expect(client.devices.listAll({ top: 1 }).toArray()).rejects.toBeInstanceOf(KaseyaVsaxPaginationError);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('detects no-progress (empty page that still offers a link)', async () => {
    const f = newFetch().mockResolvedValueOnce(ok([], { NextQueryLink: link() }));
    const { client } = makeClient(f);
    await expect(client.devices.listAll().toArray()).rejects.toThrow(/no progress/);
  });

  it('caps an endless chain of distinct links with maxPages', async () => {
    let n = 0;
    const f = newFetch().mockImplementation(() =>
      Promise.resolve(ok(items(1), { NextQueryLink: link(`/api/v3/devices?p=${n++}`) })),
    );
    const { client } = makeClient(f, { maxPages: 5 });
    await expect(client.devices.listAll({ top: 1 }).toArray()).rejects.toThrow(/maximum of 5 pages/);
    expect(f).toHaveBeenCalledTimes(5);
  });
});

describe('server-capped page size', () => {
  const cappedServer = (total: number, withTotal: boolean): ReturnType<typeof newFetch> =>
    newFetch().mockImplementation((url: string) => {
      const skip = Number(/\$skip=(\d+)/.exec(url)?.[1] ?? 0);
      const n = Math.max(0, Math.min(100, total - skip));
      return Promise.resolve(ok(items(n, skip), withTotal ? { TotalCount: total } : {}));
    });

  it.each([true, false])('top 500 vs cap 100, 250 items (TotalCount=%s) returns all', async (withTotal) => {
    const f = cappedServer(250, withTotal);
    const { client } = makeClient(f);
    const all = await client.devices.listAll({ top: 500 }).toArray();
    expect(all).toHaveLength(250);
    expect(new Set(all.map((d) => d.Identifier)).size).toBe(250);
    expect(f).toHaveBeenCalledTimes(3);
  });
});
