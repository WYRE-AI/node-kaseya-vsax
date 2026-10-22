import { describe, expect, it } from 'vitest';
import {
  KaseyaVsaxClient,
  KaseyaVsaxConfigError,
  normalizeServerUrl,
  validateVsaxHost,
} from '../../src/index.js';
import { TOKEN_ID, TOKEN_SECRET, newFetch } from '../helpers.js';

const BASE = 'https://acme.vsax.net/api/v3';

describe('normalizeServerUrl', () => {
  it.each([
    'acme.vsax.net',
    'ACME.vsax.net',
    'https://acme.vsax.net',
    'https://acme.vsax.net/',
    'https://acme.vsax.net/api/v3',
    'https://acme.vsax.net/api/v3/',
    'HTTPS://acme.vsax.net:443/api/v3',
    '  acme.vsax.net  ',
    'acme.vsax.net:443',
  ])('accepts %s', (input) => {
    expect(normalizeServerUrl(input)).toBe(BASE);
  });

  it.each([
    ['http scheme', 'http://acme.vsax.net'],
    ['ftp scheme', 'ftp://acme.vsax.net'],
    ['scheme without slashes', 'http:acme.vsax.net'],
    ['userinfo', 'https://user:pw@acme.vsax.net'],
    ['userinfo trick', 'https://acme.vsax.net@evil.com'],
    ['port 8443', 'https://acme.vsax.net:8443'],
    ['port 80', 'acme.vsax.net:80'],
    ['ipv4', 'https://10.0.0.1'],
    ['ipv4 w/ suffix-like', 'https://127.0.0.1.vsax.net'],
    ['ipv6', 'https://[::1]'],
    ['trailing dot', 'acme.vsax.net.'],
    ['empty label', 'acme..vsax.net'],
    ['leading dot', '.acme.vsax.net'],
    ['bare suffix', 'vsax.net'],
    ['bare suffix w/ dot', '.vsax.net'],
    ['two labels', 'a.b.vsax.net'],
    ['path trick', 'evil.com/.vsax.net'],
    ['suffix as subdomain of evil', 'vsax.net.evil.com'],
    ['missing dot', 'xvsax.net'],
    ['other path', 'https://acme.vsax.net/other'],
    ['deeper path', 'https://acme.vsax.net/api/v3/devices'],
    ['query', 'https://acme.vsax.net/api/v3?x=1'],
    ['fragment', 'https://acme.vsax.net/#x'],
    ['backslash', 'https://evil.com\\@acme.vsax.net'],
    ['whitespace inside', 'acme corp.vsax.net'],
    ['leading hyphen label', '-bad.vsax.net'],
    ['trailing hyphen label', 'bad-.vsax.net'],
    ['underscore', 'bad_host.vsax.net'],
    ['percent-encoded', 'acme%2Dcorp.vsax.net'],
    ['unicode', 'acme.vsax.net‮'],
    ['empty', ''],
    ['overlong label', `${'a'.repeat(64)}.vsax.net`],
  ])('rejects %s', (_name, input) => {
    expect(() => normalizeServerUrl(input)).toThrow(KaseyaVsaxConfigError);
  });

  it('honors a custom allowedHostSuffix', () => {
    expect(normalizeServerUrl('tenant.example.com', '.example.com')).toBe(
      'https://tenant.example.com/api/v3',
    );
    expect(() => normalizeServerUrl('tenant.vsax.net', '.example.com')).toThrow(KaseyaVsaxConfigError);
  });

  it('never echoes the input (which may hold credentials) in the error', () => {
    try {
      normalizeServerUrl('http://id:topsecret@evil.com');
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain('topsecret');
      expect((e as Error).message).not.toContain('evil.com');
    }
  });
});

describe('validateVsaxHost', () => {
  it('lowercases and returns a valid host', () => {
    expect(validateVsaxHost('Tenant-1.VSAX.net')).toBe('tenant-1.vsax.net');
  });
  it.each(['vsax.net', 'a.b.vsax.net', 'evil.com/.vsax.net', 'a.vsax.net.', '1.2.3.4', 'a.vsax.net:443', '[::1]'])(
    'rejects %s',
    (h) => {
      expect(() => validateVsaxHost(h)).toThrow(KaseyaVsaxConfigError);
    },
  );
});

describe('credential validation', () => {
  const base = { serverUrl: 'acme.vsax.net', fetch: newFetch() };
  const make = (tokenId: string, tokenSecret: string): KaseyaVsaxClient =>
    new KaseyaVsaxClient({ ...base, tokenId, tokenSecret });

  it('accepts and trims valid credentials', () => {
    expect(() => make(`  ${TOKEN_ID} `, ` ${TOKEN_SECRET} `)).not.toThrow();
  });
  it.each([
    ['empty id', '', TOKEN_SECRET],
    ['blank id', '   ', TOKEN_SECRET],
    ['empty secret', TOKEN_ID, ''],
    ['blank secret', TOKEN_ID, '  '],
    ['LF in id', 'a\nb', TOKEN_SECRET],
    ['CR in id', 'a\rb', TOKEN_SECRET],
    ['LF in secret', TOKEN_ID, 'a\nb'],
    ['CRLF in secret', TOKEN_ID, 'abc\r\nX-Evil: 1'],
    ['colon in id', 'a:b', TOKEN_SECRET],
  ])('rejects %s', (_n, id, secret) => {
    expect(() => make(id, secret)).toThrow(KaseyaVsaxConfigError);
  });

  it('allows a colon in the secret', () => {
    expect(() => make(TOKEN_ID, 'se:cret')).not.toThrow();
  });

  it('errors never contain the supplied secret', () => {
    try {
      make('a:b', 'hunter2-secret');
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain('hunter2-secret');
    }
    try {
      make(TOKEN_ID, 'hunter2\nsecret');
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain('hunter2');
    }
  });

  it('rejects bad numeric options', () => {
    for (const o of [{ timeoutMs: 0 }, { maxRetries: -1 }, { maxRetries: 1.5 }, { maxPages: 0 }]) {
      expect(() => new KaseyaVsaxClient({ ...base, tokenId: TOKEN_ID, tokenSecret: TOKEN_SECRET, ...o })).toThrow(
        KaseyaVsaxConfigError,
      );
    }
  });

  it('exposes the normalized base URL', () => {
    expect(make(TOKEN_ID, TOKEN_SECRET).baseUrl).toBe(BASE);
  });
});
