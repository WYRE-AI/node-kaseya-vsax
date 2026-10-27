import type { Loose } from './common.js';

export interface AccessItem {
  TeamName: string;
  AccessLevel: Loose<'ReadOnly' | 'FullAccess'>;
}

export interface Organization {
  Id: number;
  Name?: string;
  /** Lowercase `type` matches the live API response (the request body uses `Type`). */
  type?: Loose<'Internal' | 'Customer'>;
  HasCustomFields?: boolean;
  /** Name/casing matches the live API (it returns `PsaMappingType`, not `PsaMappingId`). */
  PsaMappingType?: string | null;
  PsaIntegrationType?: string | null;
  PsaQueueName?: string;
  PsaNotificationType?: string;
  Access?: AccessItem[];
}

export interface OrganizationRequest {
  Name: string;
  Type?: 'Internal' | 'Customer';
  Access?: AccessItem[];
}

export interface ContactInformation {
  Phone?: string;
  Fax?: string;
  Email?: string;
  ContactName?: string;
  CountryCode?: string;
  City?: string;
  Address1?: string;
  Address2?: string;
  Zip?: string;
}

export interface Site {
  Id: number;
  Name?: string;
  ContactInformation?: ContactInformation;
  ParentId?: number;
  ParentName?: string;
  HasCustomFields?: boolean;
  PsaMappingId?: number;
  PsaIntegrationType?: string | null;
}

export interface CreateSiteRequest {
  Name: string;
  ParentId: number;
  ContactInformation?: ContactInformation;
}

export interface UpdateSiteRequest {
  Name: string;
  ContactInformation?: ContactInformation;
}

export interface Group {
  Id: number;
  IsActive?: boolean;
  Name?: string;
  ParentSiteId?: number;
  ParentSiteName?: string;
  ParentOrganizationId?: number;
  ParentOrganizationName?: string;
  Notes?: string;
  HasCustomFields?: boolean;
  PsaMappingId?: number;
  /** Name/casing matches the live API. */
  PsaMappingType?: string | null;
  PsaIntegrationType?: string | null;
}

export interface CreateGroupRequest {
  Name: string;
  ParentId: number;
  Notes?: string;
}

export interface UpdateGroupRequest {
  Name: string;
  Notes?: string;
}

export type GroupPackageType = 'windows_agent_x64' | 'windows_agent_x86';

export interface GroupPackage {
  Name: string;
  Url: string;
}
