/**
 * OData pagination helpers.
 *
 * Pages with `$top`/`$skip`. When the server returns `Meta.NextQueryLink`
 * (TotalCount > 5000) the link is followed only after strict validation
 * (https, exact configured host, `/api/v3/` prefix). Loops, repeated links,
 * empty-page-with-link and runaway paging raise `KaseyaVsaxPaginationError`.
 */

import { KaseyaVsaxPaginationError } from './errors.js';
import type { HttpClient, QueryParams } from './http.js';

/** Default page size for list requests. */
export const DEFAULT_PAGE_SIZE = 100;

/** Common OData list parameters. */
export interface ListParams {
  /** Page size (`$top`). Most endpoints cap this at 100; devices are uncapped. */
  top?: number;
  /** Starting position (`$skip`). */
  skip?: number;
  /** OData `$filter`. */
  filter?: string;
  /** OData `$orderby`. */
  orderby?: string;
  /** Request `TotalCount` in the response metadata (`$count=true`). */
  count?: boolean;
}

/** Map {@link ListParams} to wire-format query keys. */
export function buildListQuery(params?: ListParams, extra?: QueryParams): QueryParams {
  const out: QueryParams = { ...extra };
  if (!params) return out;
  if (params.top !== undefined) out['$top'] = params.top;
  if (params.skip !== undefined) out['$skip'] = params.skip;
  if (params.filter !== undefined) out['$filter'] = params.filter;
  if (params.orderby !== undefined) out['$orderby'] = params.orderby;
  if (params.count !== undefined) out['$count'] = params.count;
  return out;
}

/** Async iterable over every record of a list endpoint. */
export class PaginatedIterable<T> implements AsyncIterable<T> {
  readonly #http: HttpClient;
  readonly #path: string;
  readonly #params: ListParams;
  readonly #extra: QueryParams;

  /** Create a lazy paginator over a list endpoint. */
  constructor(http: HttpClient, path: string, params: ListParams = {}, extra: QueryParams = {}) {
    this.#http = http;
    this.#path = path;
    this.#params = params;
    this.#extra = extra;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    const top = this.#params.top ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(top) || top < 1) {
      throw new KaseyaVsaxPaginationError('top must be a positive integer');
    }
    const maxPages = this.#http.maxPages;
    const seenLinks = new Set<string>();
    let skip = this.#params.skip ?? 0;
    let nextLink: string | undefined;
    let pages = 0;
    let maxSeen = 0; // largest page actually returned (servers may cap $top)

    while (true) {
      if (pages >= maxPages) {
        throw new KaseyaVsaxPaginationError(`Exceeded maximum of ${maxPages} pages`, { path: this.#path });
      }
      pages += 1;

      const env =
        nextLink !== undefined
          ? await this.#http.requestNextLink<T[]>(nextLink)
          : await this.#http.requestEnvelope<T[]>('GET', this.#path, {
              query: buildListQuery({ ...this.#params, top, skip }, this.#extra),
            });
      const items = Array.isArray(env.Data) ? env.Data : [];
      for (const item of items) yield item;

      const link = env.Meta.NextQueryLink;
      if (link !== undefined && link !== null && link !== '') {
        if (typeof link !== 'string') throw new KaseyaVsaxPaginationError('NextQueryLink is malformed');
        if (items.length === 0) {
          throw new KaseyaVsaxPaginationError('NextQueryLink returned with an empty page (no progress)', {
            path: this.#path,
          });
        }
        if (seenLinks.has(link) || link === nextLink) {
          throw new KaseyaVsaxPaginationError('Repeated NextQueryLink detected (pagination loop)', {
            path: this.#path,
          });
        }
        seenLinks.add(link);
        nextLink = link; // validated by requestNextLink before any request is sent
        continue;
      }

      if (nextLink !== undefined) return; // final page of a link chain
      if (items.length === 0) return;
      skip += items.length;
      const total = env.Meta.TotalCount;
      if (typeof total === 'number' && Number.isFinite(total)) {
        if (skip >= total) return;
      } else {
        maxSeen = Math.max(maxSeen, items.length);
        if (items.length < maxSeen) return;
      }
    }
  }

  /** Collect every item into an array. */
  async toArray(): Promise<T[]> {
    const out: T[] = [];
    for await (const item of this) out.push(item);
    return out;
  }
}
