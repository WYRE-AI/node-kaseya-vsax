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
  /** List custom fields (single page). */
  async list(params?: ListParams): Promise<CustomField[]> {
    return this.getList<CustomField>('/customFields', params);
  }

  /** Iterate over all custom fields across pages. */
  listAll(params?: ListParams): PaginatedIterable<CustomField> {
    return this.iterate<CustomField>('/customFields', params);
  }

  /** Get a custom field. */
  async get(id: number | string): Promise<CustomField> {
    return this.http.request<CustomField>('GET', `/customfields/${pathParam(id, 'customFieldId')}`);
  }

  /** Get where a custom field is used. */
  async usage(id: number | string): Promise<CustomFieldUsage> {
    return this.http.request<CustomFieldUsage>('GET', `/customfields/${pathParam(id, 'customFieldId')}/usage`);
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
  /** List scopes (single page). */
  async list(params?: ListParams): Promise<Scope[]> {
    return this.getList<Scope>('/scopes', params);
  }

  /** Iterate over all scopes across pages. */
  listAll(params?: ListParams): PaginatedIterable<Scope> {
    return this.iterate<Scope>('/scopes', params);
  }

  /** Get a scope. */
  async get(id: number | string): Promise<Scope> {
    return this.http.request<Scope>('GET', `/scopes/${pathParam(id, 'scopeId')}`);
  }

  /** Get where a scope is used. */
  async usage(id: number | string): Promise<ScopeUsage> {
    return this.http.request<ScopeUsage>('GET', `/scopes/${pathParam(id, 'scopeId')}/usage`);
  }
}

/** Patch management (`/patchmanagement`). */
export class PatchManagementResource extends BaseResource {
  /** Get a patch management policy by id. */
  async getPolicy(id: number | string): Promise<PatchManagementPolicy> {
    return this.http.request<PatchManagementPolicy>('GET', `/patchmanagement/policies/${pathParam(id, 'policyId')}`);
  }

  /** Get the global patch management rules. */
  async getGlobalRules(): Promise<PatchManagementGlobalRules> {
    return this.http.request<PatchManagementGlobalRules>('GET', '/patchmanagement/globalrules/');
  }
}

/** Endpoint protection (`/endpointprotection`). */
export class EndpointProtectionResource extends BaseResource {
  /** Get an endpoint protection policy by id. */
  async getPolicy(id: number | string): Promise<EndpointProtectionPolicy> {
    return this.http.request<EndpointProtectionPolicy>(
      'GET',
      `/endpointprotection/policies/${pathParam(id, 'policyId')}`,
    );
  }
}

/** Environment information (`/environment`). */
export class EnvironmentResource extends BaseResource {
  /** Get environment information. */
  async get(): Promise<EnvironmentInfo> {
    return this.http.request<EnvironmentInfo>('GET', '/environment/');
  }
}

/** Audit log (`/auditlogs`). */
export class AuditLogsResource extends BaseResource {
  /** List audit log entries (single page). */
  async list(params?: ListParams): Promise<AuditLogEntry[]> {
    return this.getList<AuditLogEntry>('/auditlogs', params);
  }

  /** Iterate over all audit log entries across pages. */
  listAll(params?: ListParams): PaginatedIterable<AuditLogEntry> {
    return this.iterate<AuditLogEntry>('/auditlogs', params);
  }
}

/** Server-reported rate limits (`/ratelimits`). */
export class RateLimitsResource extends BaseResource {
  /** Get the current rate limits. */
  async get(): Promise<RateLimits> {
    return this.http.request<RateLimits>('GET', '/ratelimits/');
  }
}
