# @wyre-ai/node-kaseya-vsax

Fully-typed Node.js/TypeScript client for the **Kaseya VSA X (VSA 10) REST API v3**
(`https://<tenant>.vsax.net/api/v3`). Zero runtime dependencies (uses global `fetch`, Node >= 22).

> Runtime requires Node >= 22.0.0; **development** (tests, lint, release tooling: vitest 5, eslint 10,
> semantic-release 25) requires Node >= 22.14.0.

> **VSA 9 vs VSA X.** VSA X (VSA 10) is a different product with a different API (v3, Basic
> `TokenId:TokenSecret` auth). For the classic on-prem VSA 9 REST API use
> [`@wyre-ai/node-kaseya-vsa`](https://github.com/WYRE-AI/node-kaseya-vsa) (WYRE-AI/node-kaseya-vsa).

## Install

The package is published to GitHub Packages under the `@wyre-ai` scope.

```ini
# .npmrc
@wyre-ai:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```bash
npm install @wyre-ai/node-kaseya-vsax
```

## Usage

```ts
import { KaseyaVsaxClient } from '@wyre-ai/node-kaseya-vsax';

const client = new KaseyaVsaxClient({
  serverUrl: 'acme.vsax.net', // also accepts https://…, …/api/v3
  tokenId: process.env.VSAX_TOKEN_ID!,
  tokenSecret: process.env.VSAX_TOKEN_SECRET!,
});

const env = await client.environment.get();
const page = await client.devices.list({ top: 50, filter: "contains(Name,'srv')", count: true });

for await (const device of client.devices.listAll({ top: 100 })) {
  console.log(device.Identifier, device.Name);
}

await client.automation.scripts.run('script-id', { DeviceIdentifier: 'device-guid' });
```

Resources: `devices`, `assets`, `automation.{scripts,tasks,workflows}`, `notifications` (+ `.webhooks`),
`organizations`, `sites`, `groups`, `customFields`, `scopes`, `patchManagement`,
`endpointProtection`, `environment`, `auditLogs`, `rateLimits`. Responses are unwrapped from the
`{ Data, Meta }` envelope. Write methods (`run`, `create`, `update`, `delete`, `move`, `publish`,
`notify`, ...) simply call the endpoint; **the SDK does no write gating** - do that in the caller.

### Configuration

| Option | Default | Notes |
| --- | --- | --- |
| `serverUrl` | required | Normalized to `https://<host>/api/v3` |
| `tokenId` / `tokenSecret` | required | Trimmed; no CR/LF; no `:` in `tokenId` |
| `timeoutMs` | `30000` | Per attempt; `KaseyaVsaxTimeoutError` |
| `maxRetries` | `2` | 429 (all methods); 502/503/504 (idempotent methods only) |
| `maxRetryAfterSeconds` | `60` | Larger `Retry-After` throws instead of sleeping |
| `authFailureThreshold` / `authCooldownMs` | `2` / `300000` | Auth circuit breaker |
| `maxPages` | `1000` | Pagination cap |
| `allowedHostSuffix` | `.vsax.net` | Exactly one label before the suffix |
| `fetch`, `sleep`, `now`, `random` | globals | Injectable for tests |

## Security behaviors

- **Host allow-list.** Credentials are only sent to `<one-label>.vsax.net` over HTTPS:443. Rejected:
  `http:` and other schemes, userinfo, non-443 ports, IP literals, trailing dots, empty labels,
  multi-label or bare-suffix hosts (`a.b.vsax.net`, `vsax.net`, `vsax.net.evil.com`), non-API paths,
  query strings and fragments. See `validateVsaxHost` / `normalizeServerUrl`.
- **No redirects.** Every request uses `redirect: 'manual'`; any 3xx / opaque redirect throws
  `KaseyaVsaxRedirectError` and is never followed (the Authorization header would not be safe to resend).
- **Path parameters** are `encodeURIComponent`'d; empty, `.`, `..`, or values containing `/` or `\` are rejected.
- **Secrets never surface.** Errors (message, stack, `JSON.stringify`, `util.inspect`) never contain the
  token id/secret, the Authorization header or the base64 credential. Upstream bodies on errors are
  scrubbed and truncated to 500 characters; `path` has no query string. Credentials are held in private
  `#` fields, not on enumerable client state.
- **Auth circuit breaker.** VSA X blocks source IPs that make too many failed requests (100/min, 2000/hr).
  After `authFailureThreshold` (2) consecutive 401/403 responses the client throws
  `KaseyaVsaxAuthCircuitOpenError` **without calling fetch** until `client.resetAuthCircuit()` or the
  cooldown (5 min) elapses. 401/403 are never retried. A success resets the counter.
- **Bounded retries.** 429 is retried for all methods; 502/503/504 only for idempotent ones. No retries on other 4xx or 500 and none on timeouts/network errors.

## Pagination

`list()` fetches one page. `listAll()` returns an async iterable (with `.toArray()`) that pages with
`$top`/`$skip` (default `top` 100; most endpoints cap `$top` at 100, devices are uncapped) and stops
when `Meta.TotalCount` is reached (if present) or a page is shorter than the largest page seen (servers
may cap `$top`, so a page shorter than the requested `top` does not end iteration). When the server returns `Meta.NextQueryLink` (TotalCount > 5000) it is followed **only** if
it is an `https` URL on exactly the configured host (no userinfo, no port) under `/api/v3/`; otherwise
`KaseyaVsaxPaginationError`. Repeated links, empty pages that still offer a link, and more than `maxPages`
pages also raise `KaseyaVsaxPaginationError`.

## Errors

All extend `KaseyaVsaxError` (`status?`, `code`, `method`, `path`, `body`):
`ConfigError`, `AuthenticationError` (401), `ForbiddenError` (403), `NotFoundError` (404),
`ValidationError` (400 / bad local input), `RateLimitError` (429, `retryAfterSeconds`), `ServerError` (5xx),
`RedirectError`, `PaginationError`, `AuthCircuitOpenError`, `TimeoutError`, `NetworkError`
(all prefixed `KaseyaVsax`).

## Rate limits

Roughly 3600 requests/hour per token + endpoint. On 429 the client honors `Retry-After` (seconds or
HTTP-date) and retries up to `maxRetries`; if it exceeds `maxRetryAfterSeconds` it throws
`KaseyaVsaxRateLimitError` immediately. 502/503/504 are retried with exponential backoff + jitter only for idempotent methods (GET, HEAD, PUT,
DELETE, OPTIONS); a POST throws `KaseyaVsaxServerError` on the first 5xx so it is never replayed.
`client.lastRateLimit` exposes the latest `X-RateLimit-*` values; `client.rateLimits.get()` fetches the
server-side view.

## Development

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

License: Apache-2.0
