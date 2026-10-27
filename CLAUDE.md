# node-kaseya-vsax

TypeScript SDK for the Kaseya VSA X (VSA 10) REST API v3. Package `@wyre-ai/node-kaseya-vsax`.
Sibling for VSA 9: `node-kaseya-vsa`.

## Layout

- `src/config.ts` - `validateVsaxHost`, `normalizeServerUrl`, `resolveConfig` (security-critical host checks)
- `src/http.ts` - `HttpClient`: Basic auth in `#` fields, redirect refusal, timeout, retries, auth circuit breaker, rate-limit headers, error mapping, `pathParam`
- `src/pagination.ts` - `PaginatedIterable`, `ListParams`, NextQueryLink handling
- `src/errors.ts` - error classes + `scrubSecrets`/`sanitizeBody`
- `src/resources/*` - one class per API area; `src/types/*` - entity types (optional fields where docs are unclear)
- `tests/unit/*` - vitest with an injected `vi.fn()` fetch (`tests/helpers.ts`); no network, msw not needed

## Rules

- No runtime dependencies. Global `fetch` only; tests inject `fetch`/`sleep`/`now`/`random`.
- Never put token id/secret/Authorization/base64 credential in an error, log or enumerable property. Errors are built from `sanitizeBody` output only; never attach `cause`.
- Every path parameter goes through `pathParam()`. Resource methods are `async` so bad params reject rather than throw synchronously.
- Failed requests are rate-limited per source IP (IP block risk): never add retries for 4xx/500/401/403.
- Write methods do not gate; gating belongs in the MCP server.
- Commits: Conventional Commits (semantic-release).

## Checks

`npm run typecheck && npm run lint && npm test && npm run build`
