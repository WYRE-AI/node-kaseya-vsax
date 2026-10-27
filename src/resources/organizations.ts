import { pathParam } from '../http.js';
import type { ListParams, PaginatedIterable } from '../pagination.js';
import type {
  AssignedCustomField,
  CreateGroupRequest,
  CreateSiteRequest,
  Group,
  GroupPackage,
  GroupPackageType,
  Organization,
  OrganizationRequest,
  Site,
  UpdateGroupRequest,
  UpdateSiteRequest,
} from '../types/index.js';
import { BaseResource } from './base.js';

/** Organizations (`/organizations`). */
export class OrganizationsResource extends BaseResource {
  /** List organizations (single page). */
  async list(params?: ListParams): Promise<Organization[]> {
    return this.getList<Organization>('/organizations', params);
  }

  /** Iterate over all organizations across pages. */
  listAll(params?: ListParams): PaginatedIterable<Organization> {
    return this.iterate<Organization>('/organizations', params);
  }

  /** Get an organization. */
  async get(organizationId: number | string): Promise<Organization> {
    return this.http.request<Organization>('GET', `/organizations/${pathParam(organizationId, 'organizationId')}`);
  }

  /** Get custom fields assigned to the entity. */
  async customFields(organizationId: number | string): Promise<AssignedCustomField[]> {
    return this.http.request<AssignedCustomField[]>(
      'GET',
      `/organizations/${pathParam(organizationId, 'organizationId')}/customfields`,
    );
  }

  /** WRITE operation. */
  async create(request: OrganizationRequest): Promise<Organization> {
    return this.http.request<Organization>('POST', '/organizations', { body: request });
  }

  /** WRITE operation. */
  async update(organizationId: number | string, request: OrganizationRequest): Promise<Organization> {
    return this.http.request<Organization>(
      'PUT',
      `/organizations/${pathParam(organizationId, 'organizationId')}`,
      { body: request },
    );
  }

  /** WRITE operation. */
  async delete(organizationId: number | string): Promise<void> {
    return this.http.request<void>('DELETE', `/organizations/${pathParam(organizationId, 'organizationId')}`);
  }
}

/** Sites (`/sites`). */
export class SitesResource extends BaseResource {
  /** List sites (single page). */
  async list(params?: ListParams): Promise<Site[]> {
    return this.getList<Site>('/sites', params);
  }

  /** Iterate over all sites across pages. */
  listAll(params?: ListParams): PaginatedIterable<Site> {
    return this.iterate<Site>('/sites', params);
  }

  /** Get a site. */
  async get(siteId: number | string): Promise<Site> {
    return this.http.request<Site>('GET', `/sites/${pathParam(siteId, 'siteId')}`);
  }

  /** Get custom fields assigned to the entity. */
  async customFields(siteId: number | string): Promise<AssignedCustomField[]> {
    return this.http.request<AssignedCustomField[]>('GET', `/sites/${pathParam(siteId, 'siteId')}/customfields`);
  }

  /** WRITE operation. */
  async create(request: CreateSiteRequest): Promise<Site> {
    return this.http.request<Site>('POST', '/sites', { body: request });
  }

  /** WRITE operation. */
  async update(siteId: number | string, request: UpdateSiteRequest): Promise<Site> {
    return this.http.request<Site>('PUT', `/sites/${pathParam(siteId, 'siteId')}`, { body: request });
  }

  /** WRITE operation. */
  async delete(siteId: number | string): Promise<void> {
    return this.http.request<void>('DELETE', `/sites/${pathParam(siteId, 'siteId')}`);
  }
}

/** Groups (`/groups`). */
export class GroupsResource extends BaseResource {
  /** List groups (single page). */
  async list(params?: ListParams): Promise<Group[]> {
    return this.getList<Group>('/groups', params);
  }

  /** Iterate over all groups across pages. */
  listAll(params?: ListParams): PaginatedIterable<Group> {
    return this.iterate<Group>('/groups', params);
  }

  /** Get a group. */
  async get(groupId: number | string): Promise<Group> {
    return this.http.request<Group>('GET', `/groups/${pathParam(groupId, 'groupId')}`);
  }

  /** Get custom fields assigned to the entity. */
  async customFields(groupId: number | string): Promise<AssignedCustomField[]> {
    return this.http.request<AssignedCustomField[]>(
      'GET',
      `/groups/${pathParam(groupId, 'groupId')}/customfields`,
    );
  }

  /** Download name/URL of the group's install package. */
  async getPackage(groupId: number | string, packageType: GroupPackageType): Promise<GroupPackage> {
    return this.http.request<GroupPackage>(
      'GET',
      `/groups/${pathParam(groupId, 'groupId')}/package/${pathParam(packageType, 'packageType')}`,
    );
  }

  /** WRITE operation. */
  async create(request: CreateGroupRequest): Promise<Group> {
    return this.http.request<Group>('POST', '/groups', { body: request });
  }

  /** WRITE operation. */
  async update(groupId: number | string, request: UpdateGroupRequest): Promise<Group> {
    return this.http.request<Group>('PUT', `/groups/${pathParam(groupId, 'groupId')}`, { body: request });
  }

  /** WRITE operation. */
  async delete(groupId: number | string): Promise<void> {
    return this.http.request<void>('DELETE', `/groups/${pathParam(groupId, 'groupId')}`);
  }
}
