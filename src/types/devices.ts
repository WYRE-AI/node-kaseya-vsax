import type { JsonObject, Loose, NotificationPriority } from './common.js';

export interface Device {
  Identifier: string;
  Name?: string;
  GroupId?: number;
  GroupName?: string;
  IsAgentInstalled?: boolean;
  IsMdmEnrolled?: boolean;
  SiteId?: number;
  SiteName?: string;
  OrganizationId?: number;
  OrganizationName?: string;
  HasCustomFields?: boolean;
}

export interface DeviceNotification {
  Id: number;
  Message?: string;
  DateTime?: string;
  Priority?: Loose<NotificationPriority>;
}

export type DeviceAntivirus = JsonObject;
export type DeviceCustomField = JsonObject;
export type DeviceAppliedPolicy = JsonObject;

export interface MoveDeviceRequest {
  GroupId: number;
}

export interface MoveDeviceResult {
  DeviceIdentifier?: string;
  GroupId?: number;
  GroupName?: string;
}

export interface PublishDeviceRequest {
  InstanceId: string;
  GroupId: number;
  Name?: string;
  Description?: string;
  /** Groups of labels / web hook commands used to build the details view. */
  Contents?: JsonObject[];
  NextRefreshIntervalMinutes?: number;
  NotifyWhenOffline?: string;
}

export type PublishDeviceResult = JsonObject;

/** Sections accepted by the assets `include` query parameter. */
export type AssetSection =
  | 'Tags'
  | 'Updates'
  | 'AvailableUpdates'
  | 'Security'
  | 'AssetInfo'
  | 'IpAddresses'
  | 'LocalIpAddresses'
  | 'Disks'
  | 'InstalledSoftware'
  | 'None';

export interface Asset {
  Identifier: string;
  Name?: string;
  GroupName?: string;
  Description?: string;
  [section: string]: unknown;
}
