import type { CustomFieldContextType, JsonObject, Loose } from './common.js';

export interface CustomField {
  Id: number;
  Name?: string;
  Description?: string;
  Type?: Loose<'Text' | 'Number' | 'Date' | 'Boolean'>;
  DefaultValue?: string;
  GlobalValue?: string;
  IsReadOnly?: boolean;
  /** Plural `Contexts` matches the live API response. */
  Contexts?: string[];
  ExpirationDate?: string;
  CreatedAt?: string;
}

/** A custom field value attached to an organization/site/group/device. */
export interface AssignedCustomField {
  ContextType?: Loose<CustomFieldContextType>;
  ContextItemId?: string;
  Id?: number;
  Name?: string;
  Value?: string;
  Type?: string;
}

export interface AssignCustomFieldRequest {
  ContextType: CustomFieldContextType;
  ContextItemId: string;
  UseDefaultValue?: boolean;
  /** Required when UseDefaultValue is false. */
  Value?: string;
}

export interface UnassignCustomFieldRequest {
  ContextType: CustomFieldContextType;
  ContextItemId: string;
}

export type CustomFieldUsage = JsonObject;

export interface Scope {
  Id: number;
  Name?: string;
  [key: string]: unknown;
}
export type ScopeUsage = JsonObject;

export type PatchManagementPolicy = {
  Id?: number;
  Name?: string;
  Description?: string;
  GeneralSettings?: JsonObject;
  OsRules?: JsonObject[];
  SoftwareRules?: JsonObject[];
};

export interface PatchManagementGlobalRules {
  OsRules?: JsonObject[];
  SoftwareRules?: JsonObject[];
}

export type EndpointProtectionPolicy = JsonObject;

export interface EnvironmentInfo {
  ProductVersion?: string;
  CustomerId?: string;
  CustomerName?: string;
  ServerType?: Loose<'SaaS' | 'On-Prem'>;
  Language?: string;
  License?: JsonObject;
}

export interface AuditLogEntry {
  ActionId?: number;
  AssociatedAccountUsername?: string;
  AuditLogRecordId: number;
  AuditLogRecordDateTime?: string;
  CategoryId?: number;
  DeviceGroupName?: string;
  DeviceIdentifier?: string;
  DeviceName?: string;
  EventDescription?: string;
  EventTypeId?: number;
  ExtraInformation?: string;
  RequestIpAddress?: string;
  RequestSource?: string;
  User?: string;
  UserAgentDevice?: string;
  UserAgentDeviceId?: string;
}

export interface RateLimitStats {
  Limit: number;
  Remaining: number;
  PeriodInSeconds: number;
  ResetInSeconds?: number;
  RetryInSeconds?: number;
}

export interface EndpointRateLimits {
  EndpointName: string;
  Rules: RateLimitStats[];
}

export interface RateLimits {
  FailedRequestRateLimits?: RateLimitStats[];
  EndpointRateLimits?: EndpointRateLimits[];
}
