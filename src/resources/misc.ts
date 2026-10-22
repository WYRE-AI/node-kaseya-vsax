import { pathParam } from '../http.js';
import type { ListParams, PaginatedIterable } from '../pagination.js';
import type {
  AssignCustomFieldRequest,
  AssignedCustomField,
  AuditLogEntry,
  CustomField,
  CustomFieldUsage,
  EndpointProtectionPolicy,
  EnvironmentInfo,
  PatchManagementGlobalRules,
  PatchManagementPolicy,
  RateLimits,
  Scope,
  ScopeUsage,
  UnassignCustomFieldRequest,
} from '../types/index.js';
import { BaseResource } from './base.js';

/** Custom fields (`/customfields`). */
export class CustomFieldsResource extends BaseResource {
  async list(params?: ListParams): Promise<CustomField[]> {
    return this.getList<CustomField>('/customFields', params);
  }

  listAll(params?: ListParams): PaginatedIterable<CustomField> {
    return this.iterate<CustomField>('/customFields', params);
  }

  async get(id: number | string): Promise<CustomField> {
    return this.http.request<CustomField>('GET', `/customfields/${pathParam(id, 'id')}`);
  }

  async usage(id: number | string): Promise<CustomFieldUsage> {
    return this.http.request<CustomFieldUsage>('GET', `/customfields/${pathParam(id, 'id')}/usage`);
  }

  /** WRITE operation. */
  async assign(customFieldId: number | string, request: AssignCustomFieldRequest): Promise<AssignedCustomField> {
    return this.http.request<AssignedCustomField>(
      'POST',
      `/customfields/${pathParam(customFieldId, 'customFieldId')}/assign`,
      { body: request },
    );
  }

  /** WRITE operation. */
  async updateAssigned(
    customFieldId: number | string,
    request: AssignCustomFieldRequest,
  ): Promise<AssignedCustomField> {
    return this.http.request<AssignedCustomField>(
      'PUT',
      `/customfields/${pathParam(customFieldId, 'customFieldId')}/updateAssigned`,
      { body: request },
    );
  }

  /** WRITE operation. */
  async unassign(customFieldId: number | string, request: UnassignCustomFieldRequest): Promise<void> {
    return this.http.request<void>(
      'POST',
      `/customfields/${pathParam(customFieldId, 'customFieldId')}/unassign`,
      { body: request },
    );
  }
}

/** Scopes (`/scopes`). */
export class ScopesResource extends BaseResource {
  async list(params?: ListParams): Promise<Scope[]> {
    return this.getList<Scope>('/scopes', params);
  }

  listAll(params?: ListParams): PaginatedIterable<Scope> {
    return this.iterate<Scope>('/scopes', params);
  }

  async get(id: number | string): Promise<Scope> {
    return this.http.request<Scope>('GET', `/scopes/${pathParam(id, 'id')}`);
  }

  async usage(id: number | string): Promise<ScopeUsage> {
    return this.http.request<ScopeUsage>('GET', `/scopes/${pathParam(id, 'id')}/usage`);
  }
}

/** Patch management (`/patchmanagement`). */
export class PatchManagementResource extends BaseResource {
  async getPolicy(id: number | string): Promise<PatchManagementPolicy> {
    return this.http.request<PatchManagementPolicy>('GET', `/patchmanagement/policies/${pathParam(id, 'id')}`);
  }

  async getGlobalRules(): Promise<PatchManagementGlobalRules> {
    return this.http.request<PatchManagementGlobalRules>('GET', '/patchmanagement/globalrules/');
  }
}

/** Endpoint protection (`/endpointprotection`). */
export class EndpointProtectionResource extends BaseResource {
  async getPolicy(id: number | string): Promise<EndpointProtectionPolicy> {
    return this.http.request<EndpointProtectionPolicy>(
      'GET',
      `/endpointprotection/policies/${pathParam(id, 'id')}`,
    );
  }
}

/** Environment information (`/environment`). */
export class EnvironmentResource extends BaseResource {
  async get(): Promise<EnvironmentInfo> {
    return this.http.request<EnvironmentInfo>('GET', '/environment/');
  }
}

/** Audit log (`/auditlogs`). */
export class AuditLogsResource extends BaseResource {
  async list(params?: ListParams): Promise<AuditLogEntry[]> {
    return this.getList<AuditLogEntry>('/auditlogs', params);
  }

  listAll(params?: ListParams): PaginatedIterable<AuditLogEntry> {
    return this.iterate<AuditLogEntry>('/auditlogs', params);
  }
}

/** Server-reported rate limits (`/ratelimits`). */
export class RateLimitsResource extends BaseResource {
  async get(): Promise<RateLimits> {
    return this.http.request<RateLimits>('GET', '/ratelimits/');
  }
}
