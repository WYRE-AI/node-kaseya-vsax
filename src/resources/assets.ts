import { pathParam } from '../http.js';
import type { ListParams, PaginatedIterable } from '../pagination.js';
import type { Asset, AssetSection } from '../types/index.js';
import { BaseResource } from './base.js';

/** List parameters for assets. */
export interface AssetListParams extends ListParams {
  /**
   * Sections to include. Omitted or an empty array both send nothing, so the server default applies
   * (all sections but AvailableUpdates and Security: a heavy payload). Pass explicit sections to slim it.
   */
  include?: readonly AssetSection[];
}

const includeQuery = (include?: readonly AssetSection[]): { include: string | undefined } => ({
  include: include && include.length > 0 ? include.join(',') : undefined,
});

/** Assets (`/assets`). */
export class AssetsResource extends BaseResource {
  /** List assets (single page). */
  async list(params?: AssetListParams): Promise<Asset[]> {
    return this.getList<Asset>('/assets', params, includeQuery(params?.include));
  }

  /** Iterate over all assets across pages. */
  listAll(params?: AssetListParams): PaginatedIterable<Asset> {
    return this.iterate<Asset>('/assets', params, includeQuery(params?.include));
  }

  /** Get an asset. */
  async get(deviceId: string, include?: readonly AssetSection[]): Promise<Asset> {
    return this.http.request<Asset>('GET', `/assets/${pathParam(deviceId, 'deviceId')}`, {
      query: includeQuery(include),
    });
  }
}
