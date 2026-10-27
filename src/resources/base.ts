import type { HttpClient, QueryParams } from '../http.js';
import { buildListQuery, PaginatedIterable, type ListParams } from '../pagination.js';

/** Shared helpers for resource classes. */
export abstract class BaseResource {
  protected readonly http: HttpClient;

  /** Bind the resource to an HTTP client. */
  constructor(http: HttpClient) {
    this.http = http;
  }

  protected getList<T>(path: string, params?: ListParams, extra?: QueryParams): Promise<T[]> {
    return this.http.request<T[]>('GET', path, { query: buildListQuery(params, extra) });
  }

  protected iterate<T>(path: string, params?: ListParams, extra?: QueryParams): PaginatedIterable<T> {
    return new PaginatedIterable<T>(this.http, path, params, extra);
  }
}
